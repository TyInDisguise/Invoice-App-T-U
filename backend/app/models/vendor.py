"""Vendor domain models: Vendor, VendorPattern.

ComplianceDoc (W-9/COI lifecycle) dropped — out of V1 scope, re-enters with the
draw module's COI pre-flight (see PRODUCT-BRIEF.md, Excluded section).
ExpenseClassification dropped — invoice category is now the sole classification
(operating / non_operating / construction_draw, see models/invoice.py); no
per-vendor default carried over.
"""
from enum import Enum
from uuid import UUID

from sqlalchemy import ForeignKey, String
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


class VendorPatternType(Enum):
    LITERAL_EMAIL_SENDER = "literal_email_sender"
    LITERAL_COMPANY_NAME = "literal_company_name"
    REGEX = "regex"


class Vendor(Base, IdentityMixin, FirmScopedMixin, TimestampMixin, SoftDeleteMixin, AuditableMixin):
    __tablename__ = "vendors"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state_region: Mapped[str | None] = mapped_column(String(80), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class VendorPattern(
    Base, IdentityMixin, FirmScopedMixin, TimestampMixin, SoftDeleteMixin, AuditableMixin
):
    """Configured and reviewer-confirmed name/email patterns for vendor matching."""

    __tablename__ = "vendor_patterns"

    vendor_id: Mapped[UUID] = mapped_column(
        ForeignKey("vendors.id"), nullable=False, index=True
    )
    pattern_type: Mapped[str] = mapped_column(String(40), nullable=False)
    pattern_text: Mapped[str] = mapped_column(String(500), nullable=False)
    learned_from_invoice_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True,  # forward FK
    )
    confirmed_by_user: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default="false"
    )

    __table_args__ = (
        enum_check_constraint(
            VendorPatternType, "pattern_type", name="vendor_pattern_type_valid"
        ),
    )
