"""Invoice intake — HTTP entry points. Both routes are fast/sync (decision 3):
persist + enqueue, then return immediately. Extraction happens in
workers/arq_worker.py:run_extraction_job. Frontend polls GET .../extraction.

Email intake is Microsoft Graph only (ARCHITECTURE-V2 Platforms). The Graph
webhook's own subscription-validation handshake and clientState check happen
at the transport layer before this handler runs (non-deferrable — the intake
mailbox is the one outsider-facing surface, ARCHITECTURE-V2 Security)."""
from __future__ import annotations

import base64
import hashlib
from uuid import UUID

from arq import ArqRedis
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.arq_pool import get_arq_pool
from app.core.database import get_session
from app.core.deps import get_current_firm_user, require_property_access
from app.models.audit import AuditActorType
from app.models.identity import FirmUser
from app.repositories.audit import AuditEntryRepo
from app.repositories.invoice import InvoiceRepo
from app.repositories.invoice_attachment import InvoiceAttachmentRepo
from app.schemas.intake import (
    EmailIntakePayload,
    ExtractionCorrection,
    IntakeResponse,
    InvoiceAttachmentResponse,
    InvoiceExtractionView,
)
from app.schemas.invoice import InvoiceResponse
from app.services.documents.storage import write_artifact
from app.services.intake import receive_invoice

router = APIRouter(tags=["invoice-intake"])


async def _enqueue_extraction(arq: ArqRedis, firm_id: UUID, invoice_id: UUID) -> None:
    await arq.enqueue_job("run_extraction_job", firm_id=str(firm_id), invoice_id=str(invoice_id))


@router.post("/invoices/intake/email", status_code=status.HTTP_201_CREATED)
async def email_intake(
    body: EmailIntakePayload,
    current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
    arq: ArqRedis = Depends(get_arq_pool),
) -> IntakeResponse:
    """INV-01/02 — idempotent on (firm_id, source_message_id)."""
    try:
        pdf_bytes = base64.b64decode(body.pdf_base64, validate=True)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid pdf_base64: {e}") from e

    async with db.begin():
        result = await receive_invoice(
            db, firm_id=current_user.firm_id, property_id=body.property_id,
            actor_id=current_user.id, source_message_id=body.source_message_id,
            intake_source="email_graph", pdf_bytes=pdf_bytes, attachment_ref=body.attachment_ref,
        )

    if not result.duplicate and result.invoice.extraction_status == "queued":
        await _enqueue_extraction(arq, current_user.firm_id, result.invoice.id)

    return IntakeResponse(invoice=InvoiceResponse.model_validate(result.invoice), duplicate=result.duplicate)


@router.post("/properties/{property_id}/invoices/upload", status_code=status.HTTP_201_CREATED)
async def upload_invoice_pdf(
    property_id: UUID,
    file: UploadFile = File(...),
    current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
    arq: ArqRedis = Depends(get_arq_pool),
) -> IntakeResponse:
    """INV-09-adjacent — manual drag-drop upload. Same pipeline as email
    intake; source_message_id derived from the file's SHA-256 for dedupe."""
    allowed = ("application/pdf", "application/octet-stream")
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported type: {file.content_type}")
    pdf_bytes = await file.read()

    digest = hashlib.sha256(pdf_bytes).hexdigest()
    source_message_id = f"upload:{digest}"
    original_name = file.filename or "invoice.pdf"
    attachment_ref = write_artifact(
        firm_id=current_user.firm_id, entity_type="invoice_upload",
        entity_id=UUID(int=int(digest[:32], 16)), filename=original_name, data=pdf_bytes,
    )

    async with db.begin():
        result = await receive_invoice(
            db, firm_id=current_user.firm_id, property_id=property_id, actor_id=current_user.id,
            source_message_id=source_message_id, intake_source="manual_upload",
            pdf_bytes=pdf_bytes, attachment_ref=attachment_ref,
        )

    if not result.duplicate and result.invoice.extraction_status == "queued":
        await _enqueue_extraction(arq, current_user.firm_id, result.invoice.id)

    return IntakeResponse(invoice=InvoiceResponse.model_validate(result.invoice), duplicate=result.duplicate)


@router.get("/properties/{property_id}/invoices/{invoice_id}/extraction")
async def get_extraction(
    property_id: UUID, invoice_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> InvoiceExtractionView:
    invoice = await InvoiceRepo(db).get(current_user.firm_id, invoice_id)
    return InvoiceExtractionView(
        invoice_id=invoice.id,
        status=invoice.status,
        extraction_status=invoice.extraction_status,
        ai_provider=invoice.ai_provider,
        ai_model_id=invoice.ai_model_id,
        ai_confidence_score=float(invoice.ai_confidence_score) if invoice.ai_confidence_score else None,
        ai_extracted_payload=invoice.ai_extracted_payload,
        ai_field_status=invoice.ai_field_status,
        validation_flags=invoice.validation_flags,
        proposed_vendor_id=invoice.proposed_vendor_id,
        proposed_property_id=invoice.proposed_property_id,
        property_match_signal=invoice.property_match_signal,
        page_count=invoice.page_count,
        pages_extracted=invoice.pages_extracted,
    )


@router.patch("/properties/{property_id}/invoices/{invoice_id}/extraction")
async def correct_extraction(
    property_id: UUID, invoice_id: UUID, body: ExtractionCorrection,
    current_user: FirmUser = Depends(require_property_access), db: AsyncSession = Depends(get_session),
) -> InvoiceResponse:
    """Reviewer confirms/corrects staged fields — including resolving
    proposed_vendor_id/proposed_property_id into the canonical vendor_id/
    property_id (Proposal Layer: nothing is truth until a human confirms it).
    Only allowed while in extraction_review."""
    async with db.begin():
        repo = InvoiceRepo(db)
        invoice = await repo.get(current_user.firm_id, invoice_id)
        if invoice.status != "extraction_review":
            raise HTTPException(
                status_code=409,
                detail=f"corrections only allowed in extraction_review (current: {invoice.status})",
            )
        before: dict[str, str | None] = {}
        after: dict[str, str | None] = {}
        for field_name, value in body.model_dump(exclude_none=True).items():
            before[field_name] = _stringify(getattr(invoice, field_name, None))
            setattr(invoice, field_name, value)
            after[field_name] = _stringify(value)
        await db.flush()
        await AuditEntryRepo(db).create(
            entity_type="invoice", entity_id=invoice.id, action="extraction_corrected",
            actor_type=AuditActorType.FIRM_USER.value, actor_id=current_user.id,
            firm_id=current_user.firm_id, property_id=property_id, before_state=before, after_state=after,
        )
    return InvoiceResponse.model_validate(invoice)


@router.get("/properties/{property_id}/invoices/{invoice_id}/attachments")
async def list_attachments(
    property_id: UUID, invoice_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[InvoiceAttachmentResponse]:
    attachments = await InvoiceAttachmentRepo(db).list_for_invoice(current_user.firm_id, invoice_id)
    return [InvoiceAttachmentResponse.model_validate(a) for a in attachments]


def _stringify(v: object) -> str | None:
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()  # type: ignore[no-any-return]
    return str(v)
