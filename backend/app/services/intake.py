"""Invoice intake orchestration — rewritten against ARCHITECTURE-V2.

Split in two, per decision 3 (extraction moves off the request thread):

  receive_invoice()   — sync, fast, DB-only. Dedupe, persist Invoice +
                         InvoiceAttachment, audit, enqueue the ARQ job.
                         Called directly from the upload/email-intake routers.

  run_extraction()     — the ARQ job body. Calls the extraction provider,
                         runs deterministic validation, proposes vendor +
                         property matches, stages everything, and — per
                         decision 6 — always routes to extraction_review.
                         No auto-advance logic exists in V1.

Failure handling (decision 13, "no dead ends"): unreadable input fails fast
in receive_invoice(). Extraction errors/timeouts in run_extraction() retry
twice with backoff (handled by the ARQ job's retry config in workers/), and
on final failure the invoice is flagged extraction_status=failed with fields
left empty for manual keying in the same review screen — this is V1's only
manual-entry path.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditActorType
from app.models.invoice import Invoice, InvoiceAttachment, InvoiceLineItem
from app.repositories.audit import AuditEntryRepo
from app.services.extraction import ExtractionError, ExtractionProvider, ExtractionResult
from app.services.property_matching import match_property
from app.services.validation import validate
from app.services.vendor_matching import match_vendor


@dataclass
class ReceiveResult:
    invoice: Invoice
    duplicate: bool


async def find_existing_by_message_id(
    db: AsyncSession, firm_id: UUID, source_message_id: str
) -> Invoice | None:
    stmt = select(Invoice).where(
        Invoice.firm_id == firm_id,
        Invoice.source_message_id == source_message_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def receive_invoice(
    db: AsyncSession,
    *,
    firm_id: UUID,
    property_id: UUID | None,
    actor_id: UUID,
    source_message_id: str,
    intake_source: str,
    pdf_bytes: bytes,
    attachment_ref: str,
) -> ReceiveResult:
    """Fast path. Caller owns the transaction. Returns immediately — extraction
    runs in the background (caller enqueues the ARQ job with invoice.id)."""
    audit_repo = AuditEntryRepo(db)

    existing = await find_existing_by_message_id(db, firm_id, source_message_id)
    if existing is not None:
        return ReceiveResult(invoice=existing, duplicate=True)

    if not pdf_bytes.startswith(b"%PDF"):
        # Unreadable input — no dead end: land directly in review, flagged.
        invoice = Invoice(
            firm_id=firm_id,
            property_id=property_id,
            created_by_id=actor_id,
            source_message_id=source_message_id,
            intake_source=intake_source,
            intake_received_at=datetime.now(UTC),
            status="extraction_review",
            extraction_status="failed",
            extraction_failure_reason="unreadable document (not a valid PDF)",
        )
        db.add(invoice)
        await db.flush()
        await audit_repo.create(
            entity_type="invoice", entity_id=invoice.id, action="intake_rejected_unreadable",
            actor_type=AuditActorType.SYSTEM.value, firm_id=firm_id, property_id=property_id,
            to_state="extraction_review",
        )
        _attach(db, invoice, actor_id, attachment_ref, intake_source)
        await db.flush()
        return ReceiveResult(invoice=invoice, duplicate=False)

    invoice = Invoice(
        firm_id=firm_id,
        property_id=property_id,
        created_by_id=actor_id,
        source_message_id=source_message_id,
        intake_source=intake_source,
        intake_received_at=datetime.now(UTC),
        status="extraction_review",
        extraction_status="queued",
    )
    db.add(invoice)
    await db.flush()

    await audit_repo.create(
        entity_type="invoice", entity_id=invoice.id, action="intake_received",
        actor_type=AuditActorType.SYSTEM.value, firm_id=firm_id, property_id=property_id,
        to_state="extraction_review",
        after_state={"source_message_id": source_message_id, "intake_source": intake_source},
    )
    _attach(db, invoice, actor_id, attachment_ref, intake_source)
    await db.flush()
    return ReceiveResult(invoice=invoice, duplicate=False)


def _attach(
    db: AsyncSession, invoice: Invoice, actor_id: UUID, attachment_ref: str, intake_source: str,
) -> None:
    upload_source = "email" if intake_source == "email_graph" else "manual_upload"
    db.add(InvoiceAttachment(
        firm_id=invoice.firm_id,
        invoice_id=invoice.id,
        created_by_id=actor_id,
        attachment_ref=attachment_ref,
        attachment_type="original",
        upload_source=upload_source,
    ))


MAX_EXTRACTION_ATTEMPTS = 2  # + the initial attempt = 3 total, per decision 13


async def run_extraction(
    db: AsyncSession,
    *,
    invoice: Invoice,
    pdf_bytes: bytes,
    extraction_provider: ExtractionProvider,
) -> None:
    """The ARQ job body. Always leaves the invoice in extraction_review —
    either with staged proposals for the reviewer to confirm, or flagged
    failed with empty fields for manual entry. Never raises past this
    function; failures are recorded, not propagated as job crashes, so the
    stuck-job sweep (workers/arq_worker.py) doesn't need to distinguish
    "still running" from "errored silently"."""
    audit_repo = AuditEntryRepo(db)
    invoice.extraction_status = "processing"
    await db.flush()

    try:
        extraction: ExtractionResult = await extraction_provider.extract(pdf_bytes=pdf_bytes)
    except ExtractionError as exc:
        invoice.extraction_attempts += 1
        if invoice.extraction_attempts <= MAX_EXTRACTION_ATTEMPTS:
            invoice.extraction_status = "queued"  # caller's ARQ retry policy re-enqueues
            await db.flush()
            await audit_repo.create(
                entity_type="invoice", entity_id=invoice.id, action="extraction_retry",
                actor_type=AuditActorType.SYSTEM.value, firm_id=invoice.firm_id,
                property_id=invoice.property_id,
                after_state={"attempt": invoice.extraction_attempts, "error": str(exc)},
            )
            raise  # let the ARQ retry policy handle backoff
        invoice.extraction_status = "failed"
        invoice.extraction_failure_reason = str(exc)
        await db.flush()
        await audit_repo.create(
            entity_type="invoice", entity_id=invoice.id, action="extraction_failed",
            actor_type=AuditActorType.SYSTEM.value, firm_id=invoice.firm_id,
            property_id=invoice.property_id,
            after_state={"attempts": invoice.extraction_attempts, "error": str(exc)},
        )
        return  # no dead end — invoice stays in extraction_review, fields empty

    # Stage AI output (Proposal Layer) — never write canonical columns directly
    invoice.ai_extracted_payload = _serialize_payload(extraction)
    invoice.ai_field_status = extraction.field_status_dict()
    invoice.ai_confidence_score = extraction.confidence_score
    invoice.ai_provider = extraction.provider
    invoice.ai_model_id = extraction.model_id
    invoice.ai_schema_version = extraction.schema_version
    invoice.raw_extraction_ref = extraction.raw_extraction_ref
    invoice.page_count = extraction.page_count
    invoice.pages_extracted = extraction.pages_extracted

    # Best-effort copy to canonical header fields — still human-correctable,
    # never trusted blindly (Proposal Layer, unchanged rule from the old repo)
    vals = extraction.values_dict()
    invoice.vendor_name = vals.get("vendor_name")
    invoice.bill_to_entity = vals.get("bill_to_entity")
    invoice.invoice_number = vals.get("invoice_number")
    invoice.invoice_date = vals.get("invoice_date")
    invoice.due_date = vals.get("due_date")
    invoice.tax_amount = vals.get("tax_amount")
    invoice.total_amount = vals.get("total_amount")
    if "currency" in vals:
        invoice.currency = vals["currency"]
    if "category" in vals:
        invoice.category = vals["category"]

    # Materialize line items now — they're supporting detail, not separately
    # reviewed (decision 8), so there's no reason to gate them behind confirm
    for i, li in enumerate(extraction.line_items):
        db.add(InvoiceLineItem(
            firm_id=invoice.firm_id, invoice_id=invoice.id,
            description=li.description, amount=li.amount or 0, sort_order=i,
        ))

    # Deterministic validation (decision 4)
    validation = await validate(
        db, firm_id=invoice.firm_id, invoice_id=invoice.id, extraction=extraction
    )
    invoice.validation_flags = validation.flags
    dup_id = validation.flags.get("duplicate_suspect")
    invoice.duplicate_of_invoice_id = UUID(str(dup_id)) if dup_id else None

    # Vendor + property proposals (decisions 5) — staged, never auto-applied
    vmatch = await match_vendor(
        db, firm_id=invoice.firm_id, sender_email=None,
        extracted_vendor_name=vals.get("vendor_name"),
    )
    if vmatch is not None:
        invoice.proposed_vendor_id = vmatch.vendor_id

    pmatch = await match_property(
        db, firm_id=invoice.firm_id,
        bill_to_entity=vals.get("bill_to_entity"),
        extracted_property_hints=extraction.property_hints,
        vendor_id=vmatch.vendor_id if vmatch else None,
    )
    if pmatch is not None:
        invoice.proposed_property_id = pmatch.property_id
        invoice.property_match_signal = pmatch.signal

    invoice.extraction_status = "completed"
    invoice.status = "extraction_review"  # decision 6 — always; no auto-advance
    await db.flush()

    await audit_repo.create(
        entity_type="invoice", entity_id=invoice.id, action="extraction_completed",
        actor_type=AuditActorType.AI_AGENT.value,
        actor_reference=f"{extraction.provider}:{extraction.model_id}",
        firm_id=invoice.firm_id, property_id=invoice.property_id,
        after_state={
            "field_status": extraction.field_status_dict(),
            "validation_flags": validation.flags,
            "pages_extracted": extraction.pages_extracted,
            "page_count": extraction.page_count,
        },
    )


def _serialize_payload(extraction: ExtractionResult) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in extraction.values_dict().items():
        out[k] = v.isoformat() if hasattr(v, "isoformat") else (
            str(v) if not isinstance(v, str | int | float | bool) else v
        )
    out["line_items"] = extraction.line_items_dict()
    out["property_hints"] = extraction.property_hints
    return out
