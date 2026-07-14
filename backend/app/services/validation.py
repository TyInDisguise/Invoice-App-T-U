"""Deterministic validation gate — ARCHITECTURE-V2 decision 4.

Runs regardless of extraction confidence. Results become `validation_flags`
on the Invoice, surfaced to the reviewer — never silently acted on (V1 has
no auto-accept; see decision 6). This is the highest-leverage, cheapest error
catch in the pipeline and is independent of which model produced the data.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.services.extraction import ExtractionResult

_VALID_CURRENCIES = {"USD", "CAD", "EUR", "GBP"}
_TOTAL_TOLERANCE = Decimal("0.02")  # rounding slack for line-sum + tax vs. stated total
_MAX_INVOICE_AGE_YEARS = 5
_DUPLICATE_LOOKBACK_DAYS = 180


@dataclass
class ValidationResult:
    flags: dict[str, object]

    def has_any_flag(self) -> bool:
        return any(v for v in self.flags.values() if v not in (None, False))


async def validate(
    db: AsyncSession,
    *,
    firm_id: UUID,
    invoice_id: UUID,
    extraction: ExtractionResult,
) -> ValidationResult:
    flags: dict[str, object] = {
        "totals_mismatch": None,
        "partial_lines": False,
        "duplicate_suspect": None,
        "date_invalid": False,
        "currency_invalid": False,
    }

    vals = extraction.values_dict()
    truncated = extraction.pages_extracted < extraction.page_count

    # Totals reconciliation — only meaningful on untruncated documents
    # (decision 14: truncated docs can't see all line items, so a mismatch
    # there is expected, not an error)
    total = vals.get("total_amount")
    tax = vals.get("tax_amount") or Decimal("0")
    if truncated:
        flags["partial_lines"] = True
    elif total is not None and extraction.line_items:
        line_sum = sum((li.amount for li in extraction.line_items if li.amount is not None), Decimal("0"))
        if line_sum > 0 and abs((line_sum + tax) - total) > _TOTAL_TOLERANCE:
            flags["totals_mismatch"] = {
                "line_sum_plus_tax": str(line_sum + tax),
                "stated_total": str(total),
            }

    # Date sanity
    invoice_date = vals.get("invoice_date")
    due_date = vals.get("due_date")
    today = date.today()
    if isinstance(invoice_date, date):
        if invoice_date > today or invoice_date < today - timedelta(days=365 * _MAX_INVOICE_AGE_YEARS):
            flags["date_invalid"] = True
    if isinstance(due_date, date) and isinstance(invoice_date, date) and due_date < invoice_date:
        flags["date_invalid"] = True

    # Currency sanity
    currency = vals.get("currency")
    if currency and currency not in _VALID_CURRENCIES:
        flags["currency_invalid"] = True

    # Fuzzy duplicate detection — vendor name + invoice number + amount,
    # beyond the message-ID-only dedupe at intake
    vendor_name = vals.get("vendor_name")
    invoice_number = vals.get("invoice_number")
    if vendor_name and invoice_number and total is not None:
        cutoff = today - timedelta(days=_DUPLICATE_LOOKBACK_DAYS)
        stmt = (
            select(Invoice.id)
            .where(
                Invoice.id != invoice_id,  # never match the invoice against itself
                Invoice.firm_id == firm_id,
                Invoice.vendor_name == vendor_name,
                Invoice.invoice_number == invoice_number,
                Invoice.total_amount == total,
                Invoice.invoice_date >= cutoff,
                Invoice.is_active.is_(True),
            )
            .limit(1)  # any one prior match is enough to flag; guards scalar_one_or_none
        )
        existing_id = (await db.execute(stmt)).scalar_one_or_none()
        if existing_id is not None:
            flags["duplicate_suspect"] = str(existing_id)

    return ValidationResult(flags=flags)
