"""DB-backed tests for the deterministic validation gate (services/validation.py).

Primary regression target: the duplicate query must exclude the invoice being
validated (the self-flagging bug), while still catching a genuine duplicate.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Firm, Invoice
from app.services.extraction import (
    SCHEMA_VERSION,
    ExtractedField,
    ExtractedLineItem,
    ExtractionResult,
    FieldStatus,
)
from app.services.validation import validate


async def _add_invoice(
    session: AsyncSession,
    firm_id: UUID,
    *,
    vendor_name: str,
    invoice_number: str,
    total: Decimal,
    invoice_date: date,
    is_active: bool = True,
) -> Invoice:
    inv = Invoice(
        firm_id=firm_id,
        vendor_name=vendor_name,
        invoice_number=invoice_number,
        total_amount=total,
        invoice_date=invoice_date,
        is_active=is_active,
        intake_received_at=datetime.now(timezone.utc),
    )
    session.add(inv)
    await session.flush()
    return inv


def _extraction(
    *,
    vendor_name: str | None = None,
    invoice_number: str | None = None,
    total: Decimal | None = None,
    tax: Decimal | None = None,
    invoice_date: date | None = None,
    due_date: date | None = None,
    currency: str | None = "USD",
    line_items: list[tuple[str, Decimal]] | None = None,
    page_count: int = 1,
    pages_extracted: int = 1,
) -> ExtractionResult:
    fields: dict[str, ExtractedField] = {}

    def put(key: str, val: object) -> None:
        if val is not None:
            fields[key] = ExtractedField(val, FieldStatus.EXTRACTED)

    put("vendor_name", vendor_name)
    put("invoice_number", invoice_number)
    put("total_amount", total)
    put("tax_amount", tax)
    put("invoice_date", invoice_date)
    put("due_date", due_date)
    put("currency", currency)
    return ExtractionResult(
        provider="mock",
        model_id="mock",
        schema_version=SCHEMA_VERSION,
        confidence_score=None,
        fields=fields,
        line_items=[ExtractedLineItem(d, a, FieldStatus.EXTRACTED) for d, a in (line_items or [])],
        page_count=page_count,
        pages_extracted=pages_extracted,
    )


# ---- duplicate detection (the self-flagging bug) ----

async def test_unique_invoice_is_not_its_own_duplicate(db_session: AsyncSession, firm: Firm):
    d = date(2026, 6, 1)
    inv = await _add_invoice(
        db_session, firm.id, vendor_name="Peachtree", invoice_number="INV-1",
        total=Decimal("100.00"), invoice_date=d,
    )
    result = _extraction(
        vendor_name="Peachtree", invoice_number="INV-1", total=Decimal("100.00"), invoice_date=d,
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=inv.id, extraction=result)
    assert res.flags["duplicate_suspect"] is None


async def test_genuine_duplicate_flags_the_earlier_invoice(db_session: AsyncSession, firm: Firm):
    d = date(2026, 6, 1)
    original = await _add_invoice(
        db_session, firm.id, vendor_name="Peachtree", invoice_number="INV-1",
        total=Decimal("100.00"), invoice_date=d,
    )
    current = await _add_invoice(
        db_session, firm.id, vendor_name="Peachtree", invoice_number="INV-1",
        total=Decimal("100.00"), invoice_date=d,
    )
    result = _extraction(
        vendor_name="Peachtree", invoice_number="INV-1", total=Decimal("100.00"), invoice_date=d,
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=current.id, extraction=result)
    assert res.flags["duplicate_suspect"] == str(original.id)


async def test_different_total_is_not_a_duplicate(db_session: AsyncSession, firm: Firm):
    d = date(2026, 6, 1)
    await _add_invoice(
        db_session, firm.id, vendor_name="Peachtree", invoice_number="INV-1",
        total=Decimal("100.00"), invoice_date=d,
    )
    result = _extraction(
        vendor_name="Peachtree", invoice_number="INV-1", total=Decimal("999.00"), invoice_date=d,
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["duplicate_suspect"] is None


# ---- totals reconciliation ----

async def test_totals_reconcile_no_mismatch(db_session: AsyncSession, firm: Firm):
    result = _extraction(
        vendor_name="V", invoice_number="N", total=Decimal("100.00"), tax=Decimal("0.00"),
        line_items=[("A", Decimal("60.00")), ("B", Decimal("40.00"))],
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["totals_mismatch"] is None


async def test_totals_mismatch_flagged(db_session: AsyncSession, firm: Firm):
    result = _extraction(
        vendor_name="V", invoice_number="N", total=Decimal("100.00"), tax=Decimal("0.00"),
        line_items=[("A", Decimal("60.00")), ("B", Decimal("30.00"))],
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["totals_mismatch"] is not None
    assert res.flags["totals_mismatch"]["stated_total"] == "100.00"


async def test_truncated_doc_skips_totals_and_flags_partial(db_session: AsyncSession, firm: Firm):
    result = _extraction(
        vendor_name="V", invoice_number="N", total=Decimal("100.00"),
        line_items=[("A", Decimal("10.00"))], page_count=20, pages_extracted=15,
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["partial_lines"] is True
    assert res.flags["totals_mismatch"] is None  # not judged on a truncated doc


# ---- date / currency sanity ----

async def test_future_invoice_date_flagged(db_session: AsyncSession, firm: Firm):
    result = _extraction(invoice_date=date.today() + timedelta(days=10))
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["date_invalid"] is True


async def test_due_before_invoice_date_flagged(db_session: AsyncSession, firm: Firm):
    result = _extraction(invoice_date=date(2026, 6, 1), due_date=date(2026, 5, 1))
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["date_invalid"] is True


async def test_valid_dates_not_flagged(db_session: AsyncSession, firm: Firm):
    result = _extraction(invoice_date=date(2026, 6, 1), due_date=date(2026, 7, 1))
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["date_invalid"] is False


async def test_invalid_currency_flagged(db_session: AsyncSession, firm: Firm):
    result = _extraction(
        vendor_name="V", invoice_number="N", total=Decimal("1.00"), currency="XYZ",
    )
    res = await validate(db_session, firm_id=firm.id, invoice_id=uuid4(), extraction=result)
    assert res.flags["currency_invalid"] is True
