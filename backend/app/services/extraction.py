"""Invoice extraction provider interface + implementations.

Rewritten against ARCHITECTURE-V2. Key departures from the old pipeline:

- Vision-LLM only — no OCR / pypdf text-extraction path (decision 1). The
  document is sent to the model directly; pypdf is used only to count pages
  and slice the first N (decision 14), never to extract text.
- One call, one strict JSON-schema response — no tolerant-JSON parsing chain.
  If the API's structured-output mode is used correctly, malformed output is
  a schema-validation error the provider raises, not something this module
  catches and downgrades.
- Schema includes bill_to_entity, tax_amount, category, property hints, and
  line_items — not just header fields (decision 2, 12).
- No zero-data-retention flags/assertions — dropped as a V1 requirement
  (decision 10); data ownership is the company-owned database, not provider
  retention terms.
- SCHEMA_VERSION is stamped onto every ExtractionResult for traceability
  (decision 9) even before a prompt registry exists.
"""
from __future__ import annotations

import io
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "v2.0"
PAGE_CAP = 15  # decision 14 — first N pages sent to the model


class FieldStatus(Enum):
    EXTRACTED = "extracted"
    INFERRED = "inferred"
    MISSING = "missing"
    AMBIGUOUS = "ambiguous"


@dataclass
class ExtractedField:
    value: Any
    status: FieldStatus


@dataclass
class ExtractedLineItem:
    description: str
    amount: Decimal | None
    status: FieldStatus


@dataclass
class ExtractionResult:
    """Output contract every provider must satisfy.

    `fields` keys map onto Invoice header columns; `line_items` map onto
    InvoiceLineItem rows materialized on reviewer confirm (decision 8).
    `property_hints` feed match_property() (decision 5) — never trusted
    directly as property_id.
    """

    provider: str
    model_id: str
    schema_version: str
    confidence_score: Decimal | None
    fields: dict[str, ExtractedField] = field(default_factory=dict)
    line_items: list[ExtractedLineItem] = field(default_factory=list)
    property_hints: list[str] = field(default_factory=list)
    page_count: int = 0
    pages_extracted: int = 0
    raw_payload: dict[str, Any] = field(default_factory=dict)
    raw_extraction_ref: str | None = None

    def field_status_dict(self) -> dict[str, str]:
        return {k: f.status.value for k, f in self.fields.items()}

    def values_dict(self) -> dict[str, Any]:
        return {k: f.value for k, f in self.fields.items() if f.value is not None}

    def line_items_dict(self) -> list[dict[str, Any]]:
        return [
            {"description": li.description, "amount": str(li.amount) if li.amount is not None else None,
             "status": li.status.value}
            for li in self.line_items
        ]


class ExtractionError(Exception):
    """Raised on unrecoverable extraction failure (bad input, API error, schema
    violation after provider-level retries). Caller (the ARQ job) is
    responsible for the no-dead-ends retry/flag behavior — decision 13."""


class ExtractionProvider(ABC):
    name: str
    model_id: str

    @abstractmethod
    async def extract(
        self, *, pdf_bytes: bytes, source_hint: str | None = None
    ) -> ExtractionResult:
        """Extract invoice fields from a PDF. Raises ExtractionError on failure —
        never raises for "the document is scanned/messy", since that's what the
        vision model and field-status marking are for."""


_EXTRACTION_FIELDS = (
    "vendor_name",
    "bill_to_entity",
    "invoice_number",
    "invoice_date",
    "due_date",
    "tax_amount",
    "total_amount",
    "currency",
    "category",
)


class MockExtractionProvider(ExtractionProvider):
    """Deterministic test double — used in tests + local dev with no API key."""

    name = "mock"
    model_id = "mock-extractor-v2"

    def __init__(self, *, force_ambiguous: bool = False) -> None:
        self.force_ambiguous = force_ambiguous

    async def extract(
        self, *, pdf_bytes: bytes, source_hint: str | None = None
    ) -> ExtractionResult:
        amount_status = FieldStatus.AMBIGUOUS if self.force_ambiguous else FieldStatus.EXTRACTED
        return ExtractionResult(
            provider=self.name,
            model_id=self.model_id,
            schema_version=SCHEMA_VERSION,
            confidence_score=None,
            fields={
                "vendor_name": ExtractedField("Acme Construction", FieldStatus.EXTRACTED),
                "bill_to_entity": ExtractedField("123 Main St Holdings LLC", FieldStatus.EXTRACTED),
                "invoice_number": ExtractedField("INV-1001", FieldStatus.EXTRACTED),
                "invoice_date": ExtractedField(date(2026, 4, 1), FieldStatus.EXTRACTED),
                "due_date": ExtractedField(date(2026, 5, 1), FieldStatus.INFERRED),
                "tax_amount": ExtractedField(Decimal("500.00"), FieldStatus.EXTRACTED),
                "total_amount": ExtractedField(Decimal("12500.00"), amount_status),
                "currency": ExtractedField("USD", FieldStatus.EXTRACTED),
                "category": ExtractedField("construction_draw", FieldStatus.INFERRED),
            },
            line_items=[
                ExtractedLineItem("Labor — framing", Decimal("8000.00"), FieldStatus.EXTRACTED),
                ExtractedLineItem("Materials", Decimal("4000.00"), FieldStatus.EXTRACTED),
            ],
            property_hints=["123 Main St Holdings LLC", "123 Main St"],
            page_count=2,
            pages_extracted=2,
            raw_payload={"pdf_size_bytes": len(pdf_bytes), "source_hint": source_hint},
        )


_SYSTEM_PROMPT = """You extract structured data from a construction-industry invoice or
payment application document. You are given up to the first {page_cap} pages.

Return a single JSON object matching the provided schema. Every field is an
object with "value" and "status":
  status: "extracted" (read directly off the page), "inferred" (derived —
    e.g. due_date = invoice_date + 30d, or a defaulted currency), "missing"
    (no value and no reasonable inference), or "ambiguous" (present but
    illegible, conflicting, or multiple candidates — use value null).
Never guess a value you are not reasonably confident in — use "missing" or
"ambiguous" with value null instead.

Fields:
  vendor_name       — the remit-to company name
  bill_to_entity    — the billed-to company/entity name (often a single-purpose
                       property-owning LLC — this is the strongest signal for
                       which property this invoice belongs to)
  invoice_number    — the vendor's invoice/doc number
  invoice_date      — "YYYY-MM-DD"
  due_date          — "YYYY-MM-DD"
  tax_amount        — decimal, two places, no currency sign; "0.00" if no tax line
  total_amount      — decimal, two places, no currency sign
  currency          — ISO-4217 code, default "USD" if unmarked
  category          — one of "operating" | "non_operating" | "construction_draw"

Also return:
  property_hints — array of strings: any project name, job name, service
    address, or PO/job number found on the document (besides bill_to_entity)
    that could help identify which property this invoice belongs to
  line_items — array of {{"description": string, "amount": decimal-string}}
    for each distinct line/cost item found. If the document is a payment
    application (AIA G702/G703 or similar), use the schedule-of-values line
    items, not the underlying vendor sub-invoices.

Emit ONLY the JSON object described. No prose, no code fences."""


class VisionExtractionProvider(ExtractionProvider):
    """Frontier vision-LLM provider — sends the PDF directly (native document
    input), no OCR/text-extraction step (decision 1). Targets an OpenAI-style
    /v1/chat/completions-compatible endpoint with a document content block and
    strict JSON-schema structured output.

    NOTE: exact request/response shape for the document content block and the
    structured-output schema envelope is provider-specific (Azure Foundry vs.
    direct Anthropic/OpenAI). This implementation targets the OpenAI-compatible
    surface generically; confirm and adjust the `_build_body` document-block
    format against the specific Foundry model deployment chosen in the
    decision-9 bake-off before relying on this in production.
    """

    name = "vision_llm"

    def __init__(
        self,
        *,
        api_key: str,
        model_id: str,
        base_url: str,
        max_tokens: int = 4096,
        client: Any | None = None,
    ) -> None:
        if not api_key:
            raise RuntimeError("VisionExtractionProvider requires an API key")
        self.model_id = model_id
        self._base_url = base_url.rstrip("/")
        self._max_tokens = max_tokens
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if client is not None:
            self._client = client
        else:
            import httpx

            self._client = httpx.AsyncClient(timeout=180.0)

    async def extract(
        self, *, pdf_bytes: bytes, source_hint: str | None = None
    ) -> ExtractionResult:
        if not pdf_bytes.startswith(b"%PDF"):
            raise ExtractionError("input is not a PDF")

        page_count, capped_bytes, pages_extracted = _cap_pages(pdf_bytes, PAGE_CAP)

        body = self._build_body(capped_bytes)
        try:
            response = await self._client.post(
                f"{self._base_url}/chat/completions", headers=self._headers, json=body,
            )
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001 — normalize all transport failures
            raise ExtractionError(f"extraction API call failed: {exc}") from exc

        data: dict[str, Any] = response.json()
        raw_text: str = data["choices"][0]["message"]["content"]
        usage: dict[str, Any] = data.get("usage", {})

        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise ExtractionError(f"model did not return valid JSON: {exc}") from exc

        fields = _parse_fields(payload)
        line_items = _parse_line_items(payload.get("line_items"))
        property_hints = [str(h) for h in payload.get("property_hints", []) if h]

        return ExtractionResult(
            provider=self.name,
            model_id=self.model_id,
            schema_version=SCHEMA_VERSION,
            confidence_score=None,
            fields=fields,
            line_items=line_items,
            property_hints=property_hints,
            page_count=page_count,
            pages_extracted=pages_extracted,
            raw_payload={
                "model_response": payload,
                "source_hint": source_hint,
                "input_tokens": usage.get("prompt_tokens"),
                "output_tokens": usage.get("completion_tokens"),
            },
        )

    def _build_body(self, pdf_bytes: bytes) -> dict[str, Any]:
        import base64

        b64 = base64.b64encode(pdf_bytes).decode("ascii")
        return {
            "model": self.model_id,
            "max_tokens": self._max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT.format(page_cap=PAGE_CAP)},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract this invoice per the schema."},
                        # Document content-block shape is provider-specific —
                        # confirm against the chosen Foundry deployment.
                        {
                            "type": "file",
                            "file": {"file_data": f"data:application/pdf;base64,{b64}"},
                        },
                    ],
                },
            ],
        }


def _cap_pages(pdf_bytes: bytes, cap: int) -> tuple[int, bytes, int]:
    """Return (total_page_count, possibly-truncated pdf_bytes, pages_sent)."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf_bytes))
    total = len(reader.pages)
    if total <= cap:
        return total, pdf_bytes, total

    writer = PdfWriter()
    for i in range(cap):
        writer.add_page(reader.pages[i])
    out = io.BytesIO()
    writer.write(out)
    return total, out.getvalue(), cap


def _parse_iso_date(raw: Any) -> date | None:
    if not raw or not isinstance(raw, str):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _parse_decimal(raw: Any) -> Decimal | None:
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return None


def _coerce_status(raw: Any) -> FieldStatus:
    if isinstance(raw, str):
        try:
            return FieldStatus(raw.lower())
        except ValueError:
            pass
    return FieldStatus.AMBIGUOUS


_FIELD_COERCIONS: dict[str, Any] = {
    "invoice_date": _parse_iso_date,
    "due_date": _parse_iso_date,
    "tax_amount": _parse_decimal,
    "total_amount": _parse_decimal,
}


def _parse_fields(payload: dict[str, Any]) -> dict[str, ExtractedField]:
    fields: dict[str, ExtractedField] = {}
    for key in _EXTRACTION_FIELDS:
        entry_raw = payload.get(key)
        entry = entry_raw if isinstance(entry_raw, dict) else {}
        raw_value = entry.get("value")
        status = _coerce_status(entry.get("status"))
        coercer = _FIELD_COERCIONS.get(key)
        coerced_value = coercer(raw_value) if coercer else raw_value
        if coerced_value is None and raw_value is not None and status in (
            FieldStatus.EXTRACTED, FieldStatus.INFERRED,
        ):
            status = FieldStatus.AMBIGUOUS
        fields[key] = ExtractedField(value=coerced_value, status=status)
    return fields


def _parse_line_items(raw: Any) -> list[ExtractedLineItem]:
    if not isinstance(raw, list):
        return []
    items: list[ExtractedLineItem] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        description = str(entry.get("description") or "").strip()
        if not description:
            continue
        amount = _parse_decimal(entry.get("amount"))
        status = FieldStatus.EXTRACTED if amount is not None else FieldStatus.AMBIGUOUS
        items.append(ExtractedLineItem(description=description, amount=amount, status=status))
    return items
