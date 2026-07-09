"""Phase 6 — AuditEntry repository.

Per ARCHITECTURE Pattern 3 Layer 3: this is the ONLY interface that may write
audit entries from application code. It deliberately exposes no `update` or
`delete` methods. Reads are exposed for the audit trail viewer (PROP-06 + audit
query endpoint).
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEntry


class AuditEntryRepo:
    """Append-only writer + reader for audit_entries.

    Does NOT subclass BaseRepo because audit has no firm-scope coupling and no
    soft-delete; we want to expose ONLY create + read.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        entity_type: str,
        entity_id: UUID,
        action: str,
        actor_type: str,
        actor_id: UUID | None = None,
        actor_reference: str | None = None,
        firm_id: UUID | None = None,
        property_id: UUID | None = None,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
        from_state: str | None = None,
        to_state: str | None = None,
        request_id: UUID | None = None,
    ) -> AuditEntry:
        entry = AuditEntry(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_reference=actor_reference,
            firm_id=firm_id,
            property_id=property_id,
            before_state=before_state,
            after_state=after_state,
            from_state=from_state,
            to_state=to_state,
            request_id=request_id,
            created_at=datetime.now(UTC),
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_for_entity(
        self, entity_type: str, entity_id: UUID
    ) -> list[AuditEntry]:
        stmt = (
            select(AuditEntry)
            .where(
                AuditEntry.entity_type == entity_type,
                AuditEntry.entity_id == entity_id,
            )
            .order_by(AuditEntry.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_for_property(
        self, firm_id: UUID, property_id: UUID, limit: int = 200
    ) -> list[AuditEntry]:
        stmt = (
            select(AuditEntry)
            .where(
                AuditEntry.firm_id == firm_id,
                AuditEntry.property_id == property_id,
            )
            .order_by(AuditEntry.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())
