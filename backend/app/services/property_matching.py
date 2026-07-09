"""Property matching — deterministic, per ARCHITECTURE-V2 decision 5.

Signal priority: bill-to entity > property alias/job-name pattern > vendor
relationship history > city/state/address. Vendor history is a rank-boost
among candidates the stronger signals already produced, never a sole basis —
it's empty at launch and, even once populated, one vendor can serve several
properties. Address is corroboration, not a primary signal (shared cities,
PM-office addresses on bill-to lines are common and misleading).

Returns a proposal only — the caller stages it (proposed_property_id,
property_match_signal) and a human confirms. Reviewer corrections of the
proposal should feed back into PropertyPattern as the alias-register
learning loop (see intake.py / review-confirm flow).
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.property import PropertyEntity, PropertyPattern


@dataclass
class PropertyMatch:
    property_id: UUID
    signal: str  # bill_to_entity | project_alias | vendor_history | address
    matched_text: str


async def match_property(
    db: AsyncSession,
    *,
    firm_id: UUID,
    bill_to_entity: str | None,
    extracted_property_hints: list[str] | None,
    vendor_id: UUID | None,
    city: str | None = None,
    state_region: str | None = None,
) -> PropertyMatch | None:
    """Return the highest-priority property match, or None (unmatched → review)."""
    hints_lower = [h.lower() for h in (extracted_property_hints or []) if h]

    # 1) Bill-to entity — strongest signal (owning LLC named on the invoice)
    if bill_to_entity:
        stmt = select(PropertyEntity).where(
            PropertyEntity.firm_id == firm_id,
            PropertyEntity.is_active.is_(True),
        )
        entities = list((await db.execute(stmt)).scalars().all())
        target = bill_to_entity.lower()
        for e in entities:
            if e.legal_name.lower() == target:
                return PropertyMatch(
                    property_id=e.property_id, signal="bill_to_entity", matched_text=e.legal_name,
                )

    # 2) Property alias / job-name pattern
    if hints_lower:
        stmt = select(PropertyPattern).where(
            PropertyPattern.firm_id == firm_id,
            PropertyPattern.is_active.is_(True),
        )
        patterns = list((await db.execute(stmt)).scalars().all())
        for p in patterns:
            if p.pattern_text.lower() in hints_lower:
                return PropertyMatch(
                    property_id=p.property_id, signal="project_alias", matched_text=p.pattern_text,
                )

    # 3) Vendor relationship history — rank-boost only among prior invoices for
    # this vendor; weak by design (a vendor can serve multiple properties) and
    # empty until the firm has processed invoices from this vendor before.
    if vendor_id is not None:
        stmt = (
            select(Invoice.property_id)
            .where(
                Invoice.firm_id == firm_id,
                Invoice.vendor_id == vendor_id,
                Invoice.property_id.isnot(None),
                Invoice.status == "approved",
            )
            .order_by(Invoice.intake_received_at.desc())
            .limit(1)
        )
        prior_property_id = (await db.execute(stmt)).scalar_one_or_none()
        if prior_property_id is not None:
            return PropertyMatch(
                property_id=prior_property_id, signal="vendor_history", matched_text=str(vendor_id),
            )

    # 4) Address — corroboration-tier only; not implemented as a primary lookup
    # in V1 (city/state alone is too weak a key against the Property table
    # without a geocoding/normalization step). Left as an explicit no-op so the
    # priority order stays documented even where the tier is unbuilt.
    del city, state_region

    return None
