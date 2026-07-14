"""DB-backed tests for the intake orchestration seam (services/intake.py).

Two halves, matching the decision-3 split:
  receive_invoice() — sync fast path: dedupe, persist, attach, audit.
  run_extraction()  — the ARQ job body: stage AI output, materialize line
                       items, validate, always land in extraction_review.

Uses MockExtractionProvider (no API key/worker) and the rolled-back db_session.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.models import Firm, FirmUser
from app.models.audit import AuditEntry
from app.models.invoice import Invoice, InvoiceAttachment, InvoiceLineItem
from app.services.extraction import (
    ExtractionError,
    ExtractionProvider,
    ExtractionResult,
    MockExtractionProvider,
)
from app.services.intake import MAX_EXTRACTION_ATTEMPTS, receive_invoice, run_extraction

_PDF = b"%PDF-1.4 minimal fake body"


async def _receive(db, firm, user, *, source_id="msg-1", source="manual_upload", pdf=_PDF):
    return await receive_invoice(
        db,
        firm_id=firm.id,
        property_id=None,
        actor_id=user.id,
        source_message_id=source_id,
        intake_source=source,
        pdf_bytes=pdf,
        attachment_ref="artifacts/fake/ref.pdf",
    )


# ---- receive_invoice ----

async def test_receive_valid_pdf_queues_for_extraction(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    assert res.duplicate is False
    assert res.invoice.status == "extraction_review"
    assert res.invoice.extraction_status == "queued"
    assert res.invoice.extraction_failure_reason is None


async def test_receive_persists_original_attachment(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user, source="email_graph")
    att = (
        await db_session.execute(
            select(InvoiceAttachment).where(InvoiceAttachment.invoice_id == res.invoice.id)
        )
    ).scalar_one()
    assert att.attachment_type == "original"
    # email_graph intake maps to the "email" upload_source; anything else -> manual_upload
    assert att.upload_source == "email"


async def test_receive_manual_upload_source_maps_to_manual(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user, source="manual_upload")
    att = (
        await db_session.execute(
            select(InvoiceAttachment).where(InvoiceAttachment.invoice_id == res.invoice.id)
        )
    ).scalar_one()
    assert att.upload_source == "manual_upload"


async def test_receive_writes_intake_audit_entry(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    actions = (
        await db_session.execute(
            select(AuditEntry.action).where(AuditEntry.entity_id == res.invoice.id)
        )
    ).scalars().all()
    assert "intake_received" in actions


async def test_receive_is_idempotent_on_source_message_id(db_session, firm: Firm, user: FirmUser):
    first = await _receive(db_session, firm, user, source_id="dup-msg")
    second = await _receive(db_session, firm, user, source_id="dup-msg")
    assert second.duplicate is True
    assert second.invoice.id == first.invoice.id
    count = (
        await db_session.execute(
            select(func.count()).select_from(Invoice).where(Invoice.firm_id == firm.id)
        )
    ).scalar_one()
    assert count == 1


async def test_receive_unreadable_input_lands_in_review_flagged(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user, pdf=b"this is not a pdf")
    assert res.duplicate is False
    assert res.invoice.status == "extraction_review"  # no dead end (decision 13)
    assert res.invoice.extraction_status == "failed"
    assert res.invoice.extraction_failure_reason is not None
    actions = (
        await db_session.execute(
            select(AuditEntry.action).where(AuditEntry.entity_id == res.invoice.id)
        )
    ).scalars().all()
    assert "intake_rejected_unreadable" in actions


# ---- run_extraction (happy path) ----

async def test_run_extraction_stages_and_completes(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=MockExtractionProvider(),
    )
    inv = res.invoice
    assert inv.extraction_status == "completed"
    assert inv.status == "extraction_review"  # always — no auto-advance (decision 6)
    # canonical header fields best-effort copied from the proposal
    assert inv.vendor_name == "Acme Construction"
    assert inv.total_amount == Decimal("12500.00")
    # AI staging columns populated (Proposal Layer)
    assert inv.ai_provider == "mock"
    assert inv.ai_model_id == "mock-extractor-v2"
    assert inv.ai_field_status["invoice_number"] == "extracted"
    assert inv.ai_extracted_payload["vendor_name"] == "Acme Construction"


async def test_run_extraction_materializes_line_items(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=MockExtractionProvider(),
    )
    count = (
        await db_session.execute(
            select(func.count()).select_from(InvoiceLineItem).where(
                InvoiceLineItem.invoice_id == res.invoice.id
            )
        )
    ).scalar_one()
    assert count == 2  # mock returns Labor + Materials


async def test_run_extraction_runs_validation(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=MockExtractionProvider(),
    )
    flags = res.invoice.validation_flags
    assert flags is not None
    assert flags["duplicate_suspect"] is None  # nothing else in the firm to collide with


async def test_run_extraction_propagates_ambiguous_field_status(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=MockExtractionProvider(force_ambiguous=True),
    )
    assert res.invoice.ai_field_status["total_amount"] == "ambiguous"


async def test_run_extraction_writes_completion_audit(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=MockExtractionProvider(),
    )
    actions = (
        await db_session.execute(
            select(AuditEntry.action).where(AuditEntry.entity_id == res.invoice.id)
        )
    ).scalars().all()
    assert "extraction_completed" in actions


# ---- run_extraction (failure path, decision 13) ----

class _FailingProvider(ExtractionProvider):
    name = "failing"
    model_id = "failing-v0"

    async def extract(self, *, pdf_bytes: bytes, source_hint: str | None = None) -> ExtractionResult:
        raise ExtractionError("simulated API failure")


async def test_run_extraction_retries_before_giving_up(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    # First failure re-raises so the ARQ retry policy re-enqueues with backoff.
    with pytest.raises(ExtractionError):
        await run_extraction(
            db_session, invoice=res.invoice, pdf_bytes=_PDF,
            extraction_provider=_FailingProvider(),
        )
    assert res.invoice.extraction_attempts == 1
    assert res.invoice.extraction_status == "queued"


async def test_run_extraction_flags_failed_after_max_attempts(db_session, firm: Firm, user: FirmUser):
    res = await _receive(db_session, firm, user)
    # Simulate having already exhausted the retry budget.
    res.invoice.extraction_attempts = MAX_EXTRACTION_ATTEMPTS
    await db_session.flush()
    # Final failure does NOT raise — it records the dead-end-free failed state.
    await run_extraction(
        db_session, invoice=res.invoice, pdf_bytes=_PDF,
        extraction_provider=_FailingProvider(),
    )
    assert res.invoice.extraction_status == "failed"
    assert res.invoice.extraction_failure_reason is not None
    assert res.invoice.status == "extraction_review"  # still reviewable for manual entry
