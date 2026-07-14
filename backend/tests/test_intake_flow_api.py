"""HTTP-level test for the upload -> extraction-view flow (routers/invoice_intake.py).

Drives the real endpoints end-to-end with no Redis/worker: the ARQ enqueue is
stubbed and artifact storage is redirected to a tmp dir. First asserts the
fast-path 201 + queued view; then simulates the worker by running
run_extraction() inline (MockExtractionProvider) and asserts the view flips to
completed with the staged proposal visible.
"""
from __future__ import annotations

from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient

from app.core.arq_pool import get_arq_pool
from app.core.config import settings
from app.core.deps import require_property_access
from app.main import app
from app.models.invoice import Invoice
from app.models.property import Property
from app.services.extraction import MockExtractionProvider
from app.services.intake import run_extraction

_PDF = b"%PDF-1.4 fake invoice bytes"


@pytest_asyncio.fixture
async def intake_ctx(authed, db_maker, monkeypatch, tmp_path):
    """(client, prop_id, enqueued) with property-access + arq deps overridden
    and artifact storage pointed at a throwaway dir."""
    client, user = authed
    monkeypatch.setattr(settings, "artifact_storage_root", str(tmp_path))

    async with db_maker() as s:
        prop = Property(
            firm_id=user.firm_id,
            name="123 Main St",
            address_line1="123 Main St",
            city="Atlanta",
            state_region="GA",
            postal_code="30301",
            property_type="office",
            status="active",
        )
        s.add(prop)
        await s.commit()
        await s.refresh(prop)
        prop_id = prop.id

    enqueued: list[tuple[str, dict]] = []

    class _FakeArq:
        async def enqueue_job(self, name, **kwargs):
            enqueued.append((name, kwargs))

    async def _fake_access():
        return user

    async def _fake_arq():
        yield _FakeArq()

    app.dependency_overrides[require_property_access] = _fake_access
    app.dependency_overrides[get_arq_pool] = _fake_arq
    try:
        yield client, prop_id, enqueued
    finally:
        app.dependency_overrides.pop(require_property_access, None)
        app.dependency_overrides.pop(get_arq_pool, None)


async def _upload(client: AsyncClient, prop_id: UUID) -> dict:
    r = await client.post(
        f"/properties/{prop_id}/invoices/upload",
        files={"file": ("invoice.pdf", _PDF, "application/pdf")},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_upload_returns_201_and_enqueues_extraction(intake_ctx):
    client, prop_id, enqueued = intake_ctx
    body = await _upload(client, prop_id)
    assert body["duplicate"] is False
    assert body["invoice"]["extraction_status"] == "queued"
    # The fast path enqueues exactly one background extraction job (decision 3).
    assert len(enqueued) == 1
    assert enqueued[0][0] == "run_extraction_job"
    assert enqueued[0][1]["invoice_id"] == body["invoice"]["id"]


async def test_extraction_view_reflects_queued_immediately(intake_ctx):
    client, prop_id, enqueued = intake_ctx
    body = await _upload(client, prop_id)
    invoice_id = body["invoice"]["id"]

    r = await client.get(f"/properties/{prop_id}/invoices/{invoice_id}/extraction")
    assert r.status_code == 200
    view = r.json()
    assert view["extraction_status"] == "queued"
    assert view["ai_provider"] is None  # nothing staged yet


async def test_reupload_same_pdf_is_deduped(intake_ctx):
    client, prop_id, enqueued = intake_ctx
    first = await _upload(client, prop_id)
    second = await _upload(client, prop_id)
    # source_message_id derives from the file SHA-256 — same bytes -> duplicate.
    assert second["duplicate"] is True
    assert second["invoice"]["id"] == first["invoice"]["id"]
    assert len(enqueued) == 1  # the dup does not re-enqueue


async def test_extraction_view_flips_to_completed_after_worker(intake_ctx, db_maker):
    client, prop_id, enqueued = intake_ctx
    body = await _upload(client, prop_id)
    invoice_id = body["invoice"]["id"]

    # Simulate the ARQ worker running run_extraction against the uploaded PDF.
    async with db_maker() as s:
        async with s.begin():
            inv = await s.get(Invoice, UUID(invoice_id))
            await run_extraction(
                s, invoice=inv, pdf_bytes=_PDF, extraction_provider=MockExtractionProvider()
            )

    r = await client.get(f"/properties/{prop_id}/invoices/{invoice_id}/extraction")
    assert r.status_code == 200
    view = r.json()
    assert view["extraction_status"] == "completed"
    assert view["ai_provider"] == "mock"
    assert view["ai_field_status"]["invoice_number"] == "extracted"
    assert view["ai_extracted_payload"]["vendor_name"] == "Acme Construction"
