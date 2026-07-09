from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, DateTime, Index, String
from sqlalchemy import event as sa_event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Mapper, mapped_column

from app.models._helpers import enum_check_constraint
from app.models.base import Base
from app.models.mixins import IdentityMixin


class AuditActorType(Enum):
    FIRM_USER = "firm_user"
    SYSTEM = "system"
    AI_AGENT = "ai_agent"
    PM = "pm"
    VENDOR = "vendor"
    LENDER = "lender"


class AuditEntry(Base, IdentityMixin):
    """Per ARCHITECTURE.md Pattern 3 — three-layer immutability:
    - Layer 1 (PostgreSQL RULE): created in Phase 1 migration 0001_initial
      (no_update_audit, no_delete_audit)
    - Layer 2 (SQLAlchemy event listener): below — raises before write hits DB
    - Layer 3 (Repository interface): AuditEntryRepository in Phase 6 exposes only create()
    AuditEntry has NO firm_id mixin (some system actions cross firms — e.g., scheduled jobs);
    instead, firm_id is included as a normal column when known. NO is_active. NO created_by_id
    mixin (created_by_id is non-applicable when actor_type='system')."""

    __tablename__ = "audit_entries"

    # Match the column set Phase 1 migration created
    firm_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[UUID | None] = mapped_column(nullable=True)
    actor_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    before_state: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    from_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    request_id: Mapped[UUID | None] = mapped_column(nullable=True)
    property_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
    )
    __table_args__ = (
        enum_check_constraint(AuditActorType, "actor_type", name="audit_actor_type_valid"),
        Index(
            "ix_audit_entries_entity_type_entity_id_created_at",
            "entity_type", "entity_id", "created_at",
        ),
        Index("ix_audit_entries_property_id_created_at", "property_id", "created_at"),
    )


@sa_event.listens_for(AuditEntry, "before_update")
def prevent_audit_update(
    mapper: Mapper[Any], connection: Connection, target: AuditEntry
) -> None:
    """ARCHITECTURE Pattern 3 Layer 2: block UPDATE at application layer before DB hit."""
    raise RuntimeError(
        f"AuditEntry {target.id!r} UPDATE attempted — audit log is append-only "
        "(ARCHITECTURE Pattern 3 Layer 2)"
    )


@sa_event.listens_for(AuditEntry, "before_delete")
def prevent_audit_delete(
    mapper: Mapper[Any], connection: Connection, target: AuditEntry
) -> None:
    """ARCHITECTURE Pattern 3 Layer 2: block DELETE at application layer before DB hit."""
    raise RuntimeError(
        f"AuditEntry {target.id!r} DELETE attempted — audit log is append-only "
        "(ARCHITECTURE Pattern 3 Layer 2)"
    )
