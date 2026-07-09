"""Identity domain: Firm, FirmUser, FirmUserRole.

V1: single-firm deployment, single reviewing user during build, JWT auth kept
through the build (Entra ID SSO deferred to pre-team-rollout — see
.planning/research/INVOICE-PROCESSING-ARCHITECTURE-V2.md, Security section).
PMPin and SignedTokenRecord dropped — no PM portal / lender / vendor
signed-link flows in V1 (those return with the draw module).
"""
from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models._helpers import enum_check_constraint
from app.models.base import Base
from app.models.mixins import (
    AuditableMixin,
    FirmScopedMixin,
    IdentityMixin,
    SoftDeleteMixin,
    TimestampMixin,
)


class Firm(Base, IdentityMixin, TimestampMixin, SoftDeleteMixin):
    """Tenant root. Has no firm_id — firms ARE the firm scope."""

    __tablename__ = "firms"
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class FirmUser(Base, IdentityMixin, FirmScopedMixin, TimestampMixin, SoftDeleteMixin):
    """A staff user belonging to a firm."""

    __tablename__ = "firm_users"
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    __table_args__ = (
        UniqueConstraint("firm_id", "email", name="firm_user_email_unique_per_firm"),
    )


class FirmUserRoleType(Enum):
    """V1: two roles only. Reviewer/approver separation, tiered thresholds, and a
    custom role designer are deferred until segregation-of-duties is requested."""

    ADMIN = "admin"
    USER = "user"


class FirmUserRole(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    """Per-property role scoping — backend-enforced access boundary (non-deferrable)."""

    __tablename__ = "firm_user_roles"
    firm_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("firm_users.id"), nullable=False, index=True
    )
    property_id: Mapped[UUID] = mapped_column(
        ForeignKey("properties.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    __table_args__ = (
        enum_check_constraint(FirmUserRoleType, "role", name="firm_user_role_role_valid"),
        UniqueConstraint(
            "firm_user_id", "property_id", "role", name="firm_user_role_unique"
        ),
    )
