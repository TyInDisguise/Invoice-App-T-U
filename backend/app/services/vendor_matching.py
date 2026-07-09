"""Phase 7 — vendor matching by configured patterns (per success criterion #4).

Iterates VendorPattern rows scoped to firm and returns the first match plus the
matched pattern. If nothing matches, returns None — caller surfaces a candidate
match request to the firm user.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vendor import Vendor, VendorPattern, VendorPatternType


@dataclass
class VendorMatch:
    vendor_id: UUID
    matched_pattern_id: UUID
    matched_pattern_type: str
    matched_pattern_text: str


async def match_vendor(
    db: AsyncSession,
    *,
    firm_id: UUID,
    sender_email: str | None,
    extracted_vendor_name: str | None,
) -> VendorMatch | None:
    """Return the first matching vendor for a firm, or None.

    Match order: literal_email_sender → literal_company_name → regex.
    Within each tier patterns are evaluated in deterministic order by id.
    """
    if sender_email is None and not extracted_vendor_name:
        return None

    stmt = (
        select(VendorPattern)
        .join(Vendor, Vendor.id == VendorPattern.vendor_id)
        .where(
            VendorPattern.firm_id == firm_id,
            VendorPattern.is_active.is_(True),
            Vendor.is_active.is_(True),
        )
        .order_by(VendorPattern.pattern_type.asc(), VendorPattern.id.asc())
    )
    patterns = list((await db.execute(stmt)).scalars().all())

    sender_lower = sender_email.lower() if sender_email else None
    name_lower = extracted_vendor_name.lower() if extracted_vendor_name else None

    for p in patterns:
        text = p.pattern_text
        if p.pattern_type == VendorPatternType.LITERAL_EMAIL_SENDER.value:
            if sender_lower and sender_lower == text.lower():
                return _to_match(p)
        elif p.pattern_type == VendorPatternType.LITERAL_COMPANY_NAME.value:
            if name_lower and name_lower == text.lower():
                return _to_match(p)
        elif p.pattern_type == VendorPatternType.REGEX.value:
            try:
                rx = re.compile(text, re.IGNORECASE)
            except re.error:
                continue
            target = sender_email or extracted_vendor_name or ""
            if rx.search(target):
                return _to_match(p)
    return None


def _to_match(p: VendorPattern) -> VendorMatch:
    return VendorMatch(
        vendor_id=p.vendor_id,
        matched_pattern_id=p.id,
        matched_pattern_type=p.pattern_type,
        matched_pattern_text=p.pattern_text,
    )
