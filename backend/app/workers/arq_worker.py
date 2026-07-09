"""ARQ worker entrypoint.

run_extraction_job — decision 3, extraction off the request thread.
sweep_stuck_extractions — decision 13, no-dead-ends: any invoice stuck in
  extraction_status="processing" past the flat ~3-minute threshold (single
  path, all documents ≤ 15 pages per decision 14 — no size-scaled timer
  needed) gets re-enqueued once, then flagged failed on the second miss.

Start with: python -m app.workers.arq_worker
"""
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from arq.connections import RedisSettings
from arq.cron import cron
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.audit import AuditActorType
from app.models.invoice import Invoice
from app.repositories.audit import AuditEntryRepo
from app.services.documents.storage import read_artifact
from app.services.extraction import MockExtractionProvider, VisionExtractionProvider
from app.services.intake import run_extraction

logger = logging.getLogger(__name__)

STUCK_THRESHOLD = timedelta(minutes=3)  # decision 13 — flat, since every call is ≤15 pages


async def startup(ctx: dict[str, Any]) -> None:
    logger.info("ARQ worker starting up")


async def shutdown(ctx: dict[str, Any]) -> None:
    logger.info("ARQ worker shutting down")


async def health_check(ctx: dict[str, Any]) -> dict[str, str]:
    return {"status": "ok"}


def _build_extraction_provider():  # noqa: ANN202
    if settings.extraction_provider == "mock":
        return MockExtractionProvider()
    if settings.extraction_provider == "vision_llm":
        if not settings.llm_api_key or not settings.llm_base_url:
            raise RuntimeError("vision_llm provider requires llm_api_key and llm_base_url")
        return VisionExtractionProvider(
            api_key=settings.llm_api_key,
            model_id=settings.llm_extraction_model,
            base_url=settings.llm_base_url,
            max_tokens=settings.llm_extraction_max_tokens,
        )
    raise RuntimeError(f"unknown extraction_provider: {settings.extraction_provider}")


async def run_extraction_job(ctx: dict[str, Any], *, firm_id: str, invoice_id: str) -> dict[str, str]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            invoice = await session.get(Invoice, UUID(invoice_id))
            if invoice is None or str(invoice.firm_id) != firm_id:
                return {"status": "not_found"}
            from app.repositories.invoice_attachment import InvoiceAttachmentRepo

            attachments = await InvoiceAttachmentRepo(session).list_for_invoice(
                invoice.firm_id, invoice.id
            )
            original = next((a for a in attachments if a.attachment_type == "original"), None)
            if original is None:
                invoice.extraction_status = "failed"
                invoice.extraction_failure_reason = "no original attachment found"
                return {"status": "failed"}

            pdf_bytes = read_artifact(original.attachment_ref)
            provider = _build_extraction_provider()
            await run_extraction(session, invoice=invoice, pdf_bytes=pdf_bytes, extraction_provider=provider)
    return {"status": "done"}


async def sweep_stuck_extractions(ctx: dict[str, Any]) -> dict[str, int]:
    """Cron job — decision 13. Re-enqueues invoices stuck in `processing`
    once; a second timeout flags them failed instead of re-enqueuing again."""
    cutoff = datetime.now(UTC) - STUCK_THRESHOLD
    requeued = 0
    failed = 0
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Invoice).where(
                Invoice.extraction_status == "processing",
                Invoice.updated_at < cutoff,
            )
            stuck = list((await session.execute(stmt)).scalars().all())
            audit_repo = AuditEntryRepo(session)
            for invoice in stuck:
                if invoice.extraction_attempts >= 1:  # already requeued once before
                    invoice.extraction_status = "failed"
                    invoice.extraction_failure_reason = "extraction job stalled past threshold twice"
                    failed += 1
                    await audit_repo.create(
                        entity_type="invoice", entity_id=invoice.id, action="extraction_stalled_failed",
                        actor_type=AuditActorType.SYSTEM.value, firm_id=invoice.firm_id,
                        property_id=invoice.property_id,
                    )
                else:
                    invoice.extraction_attempts += 1
                    invoice.extraction_status = "queued"
                    requeued += 1
                    await audit_repo.create(
                        entity_type="invoice", entity_id=invoice.id, action="extraction_stalled_requeued",
                        actor_type=AuditActorType.SYSTEM.value, firm_id=invoice.firm_id,
                        property_id=invoice.property_id,
                    )
                    ctx["redis"].enqueue_job(  # type: ignore[union-attr]
                        "run_extraction_job", firm_id=str(invoice.firm_id), invoice_id=str(invoice.id),
                    )
    return {"requeued": requeued, "failed": failed}


class WorkerSettings:
    functions = [health_check, run_extraction_job]
    cron_jobs = [cron(sweep_stuck_extractions, minute=set(range(0, 60, 2)))]  # every 2 min
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 300


if __name__ == "__main__":
    import asyncio

    from arq import run_worker

    asyncio.run(run_worker(WorkerSettings))  # type: ignore[arg-type]
