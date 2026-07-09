"""Invoice CRUD + the approve/reject/hold decision. Payment-method/paid
transition dropped with the PM payment workflow (no draw module in V1).
GL job code assignment dropped — no GL coding in V1 (PRODUCT-BRIEF.md)."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_firm_user, require_property_access
from app.models.audit import AuditActorType
from app.models.identity import FirmUser
from app.repositories.audit import AuditEntryRepo
from app.repositories.invoice import InvoiceRepo
from app.schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceTransition
from app.services.state_machines import INVOICE_TRANSITIONS, assert_transition_allowed

router = APIRouter(tags=["invoices"])


@router.get("/invoices")
async def list_all_invoices(
    current_user: FirmUser = Depends(get_current_firm_user), db: AsyncSession = Depends(get_session),
) -> list[InvoiceResponse]:
    invoices = await InvoiceRepo(db).list(current_user.firm_id)
    return [InvoiceResponse.model_validate(i) for i in invoices]


@router.get("/invoices/review-queue")
async def review_queue(
    current_user: FirmUser = Depends(get_current_firm_user), db: AsyncSession = Depends(get_session),
) -> list[InvoiceResponse]:
    """One row per invoice, oldest first — PRODUCT-BRIEF workflow step 6."""
    invoices = await InvoiceRepo(db).list_needing_review(current_user.firm_id)
    return [InvoiceResponse.model_validate(i) for i in invoices]


@router.post("/properties/{property_id}/invoices", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    property_id: UUID, body: InvoiceCreate, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> InvoiceResponse:
    """Manual entry — the no-dead-ends fallback when extraction fails
    (decision 13), not a general-purpose creation path."""
    payload = body.model_dump()
    payload["property_id"] = property_id
    payload["intake_source"] = "manual_upload"
    payload["intake_received_at"] = datetime.now(UTC)
    payload["extraction_status"] = "completed"  # no extraction ran; fields are human-entered
    async with db.begin():
        invoice = await InvoiceRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, **payload,
        )
        await AuditEntryRepo(db).create(
            entity_type="invoice", entity_id=invoice.id, action="created",
            actor_type=AuditActorType.FIRM_USER.value, actor_id=current_user.id,
            firm_id=current_user.firm_id, property_id=property_id, to_state=invoice.status,
        )
    return InvoiceResponse.model_validate(invoice)


@router.get("/properties/{property_id}/invoices")
async def list_invoices(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[InvoiceResponse]:
    invoices = await InvoiceRepo(db).list_for_property(current_user.firm_id, property_id)
    return [InvoiceResponse.model_validate(i) for i in invoices]


@router.get("/properties/{property_id}/invoices/{invoice_id}")
async def get_invoice(
    property_id: UUID, invoice_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> InvoiceResponse:
    invoice = await InvoiceRepo(db).get(current_user.firm_id, invoice_id)
    return InvoiceResponse.model_validate(invoice)


@router.post("/properties/{property_id}/invoices/{invoice_id}/transition")
async def transition_invoice(
    property_id: UUID, invoice_id: UUID, body: InvoiceTransition,
    current_user: FirmUser = Depends(require_property_access), db: AsyncSession = Depends(get_session),
) -> InvoiceResponse:
    """Approve / reject / hold — the whole-invoice decision (PRODUCT-BRIEF
    step 7). Requires property_id to already be confirmed (not just proposed);
    a reviewer must resolve proposed_property_id → property_id first via the
    extraction-correction endpoint."""
    if body.to_status in ("on_hold", "rejected") and not body.reason:
        raise HTTPException(status_code=422, detail=f"reason required for {body.to_status}")

    async with db.begin():
        repo = InvoiceRepo(db)
        invoice = await repo.get(current_user.firm_id, invoice_id)
        if body.to_status == "approved" and invoice.property_id is None:
            raise HTTPException(
                status_code=409, detail="cannot approve — property assignment not confirmed",
            )
        from_status = invoice.status
        assert_transition_allowed(INVOICE_TRANSITIONS, from_status, body.to_status, entity_label="Invoice")
        before = {"status": from_status}
        await repo.transition_status(
            invoice, body.to_status,
            on_hold_reason=body.reason if body.to_status == "on_hold" else None,
            rejected_reason=body.reason if body.to_status == "rejected" else None,
        )
        after = {"status": invoice.status}
        await AuditEntryRepo(db).create(
            entity_type="invoice", entity_id=invoice.id, action=f"status_changed_to_{body.to_status}",
            actor_type=AuditActorType.FIRM_USER.value, actor_id=current_user.id,
            firm_id=current_user.firm_id, property_id=property_id,
            from_state=from_status, to_state=body.to_status, before_state=before, after_state=after,
        )
    return InvoiceResponse.model_validate(invoice)
