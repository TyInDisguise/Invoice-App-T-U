from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models._helpers import enum_check_constraint
from app.models.base import Base
from app.models.mixins import (
    AuditableMixin,
    FirmScopedMixin,
    IdentityMixin,
    TimestampMixin,
)


class ApprovalAction(Enum):
    # APRV-01..APRV-05
    APPROVED = "approved"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"
    HOLD_RELEASED = "hold_released"


class ApprovalRecord(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    AuditableMixin,
):
    """APRV-04: All approval actions recorded with actor, action, timestamp, optional markup ref +
    comment. Append-only — NO SoftDeleteMixin. Each action creates a new row; status changes flow
    into Invoice.status via the FSM in Phase 6, and the FSM writes ALSO to AuditEntry, but
    ApprovalRecord captures the domain-specific evidence (comment, markup ref) that the generic
    AuditEntry cannot.
    """

    __tablename__ = "approval_records"
    invoice_id: Mapped[UUID] = mapped_column(
        ForeignKey("invoices.id"), nullable=False, index=True,
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("firm_users.id"), nullable=False,
    )
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # APRV-02: rejection markup attachment (Fabric.js annotation burned into PDF)
    markup_attachment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("invoice_attachments.id"), nullable=True,
    )
    __table_args__ = (
        enum_check_constraint(ApprovalAction, "action", name="approval_action_valid"),
    )
