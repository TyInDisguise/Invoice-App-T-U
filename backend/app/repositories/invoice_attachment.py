from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.models.invoice import InvoiceAttachment
from app.repositories.base import BaseRepo


class InvoiceAttachmentRepo(BaseRepo[InvoiceAttachment]):
    model = InvoiceAttachment

    async def list_for_invoice(
        self, firm_id: UUID, invoice_id: UUID
    ) -> list[InvoiceAttachment]:
        stmt = (
            select(InvoiceAttachment)
            .where(
                InvoiceAttachment.firm_id == firm_id,
                InvoiceAttachment.invoice_id == invoice_id,
                InvoiceAttachment.is_active.is_(True),
            )
            .order_by(InvoiceAttachment.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())
