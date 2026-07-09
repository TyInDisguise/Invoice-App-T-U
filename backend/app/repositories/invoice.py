from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.models.invoice import Invoice
from app.repositories.base import BaseRepo


class InvoiceRepo(BaseRepo[Invoice]):
    model = Invoice

    async def list_for_property(self, firm_id: UUID, property_id: UUID) -> list[Invoice]:
        stmt = (
            select(Invoice)
            .where(
                Invoice.firm_id == firm_id,
                Invoice.property_id == property_id,
                Invoice.is_active.is_(True),
            )
            .order_by(Invoice.intake_received_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_needing_review(self, firm_id: UUID) -> list[Invoice]:
        """The review queue — one row per invoice, per PRODUCT-BRIEF §Workflow step 6."""
        stmt = (
            select(Invoice)
            .where(
                Invoice.firm_id == firm_id,
                Invoice.is_active.is_(True),
                Invoice.status == "extraction_review",
            )
            .order_by(Invoice.intake_received_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def transition_status(
        self,
        invoice: Invoice,
        to_status: str,
        *,
        on_hold_reason: str | None = None,
        rejected_reason: str | None = None,
    ) -> None:
        invoice.status = to_status
        if to_status == "on_hold":
            invoice.on_hold_reason = on_hold_reason
        elif to_status == "rejected":
            invoice.rejected_reason = rejected_reason
        await self.session.flush()
