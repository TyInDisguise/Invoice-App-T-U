"""Property domain models: Portfolio, Property, PropertyContact, PropertyEntity,
PropertyPattern.

PropertyEntity carries the legal/owning-entity name a vendor's bill-to line names —
the strongest property-matching signal in CRE (see ARCHITECTURE-V2 decision 5).
PropertyPattern mirrors VendorPattern: aliases/job-names/PO-prefixes a vendor might
use, confirmed or learned from reviewer corrections (the alias-register learning loop).

AllocationMethod (multi-property cost-splitting) dropped — draw-adjacent, not needed
to process a single invoice against a single property in V1.
"""
from enum import Enum
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
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


class PropertyStatus(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SOLD = "sold"
    UNDER_CONSTRUCTION = "under_construction"


class PropertyType(Enum):
    OFFICE = "office"
    RETAIL = "retail"
    INDUSTRIAL = "industrial"
    MULTIFAMILY = "multifamily"
    MIXED_USE = "mixed_use"
    OTHER = "other"


class Portfolio(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    """A named group of properties within a firm. Properties may stand alone
    (portfolio_id nullable) or belong to one Portfolio."""

    __tablename__ = "portfolios"
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    __table_args__ = (
        UniqueConstraint("firm_id", "name", name="portfolio_name_unique_per_firm"),
    )


class Property(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    __tablename__ = "properties"
    portfolio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("portfolios.id"), nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state_region: Mapped[str] = mapped_column(String(80), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    country: Mapped[str] = mapped_column(
        String(2), nullable=False, default="US", server_default="US"
    )
    property_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    custom_fields: Mapped[dict[str, object]] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    __table_args__ = (
        enum_check_constraint(PropertyStatus, "status", name="property_status_valid"),
        enum_check_constraint(PropertyType, "property_type", name="property_type_valid"),
    )


class PropertyContact(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    __tablename__ = "property_contacts"
    property_id: Mapped[UUID] = mapped_column(
        ForeignKey("properties.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_role: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class PropertyEntity(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    """The owning/billed legal entity for a property (e.g. the single-purpose LLC
    a vendor's invoice is billed to). Highest-priority property-matching signal —
    see ARCHITECTURE-V2 decision 5. One property may have multiple known legal names
    over time (renamed entity, DBA); all resolve to the same property_id.
    """

    __tablename__ = "property_entities"
    property_id: Mapped[UUID] = mapped_column(
        ForeignKey("properties.id"), nullable=False, index=True,
    )
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class PropertyPatternType(Enum):
    BILL_TO_ENTITY = "bill_to_entity"
    PROJECT_ALIAS = "project_alias"
    JOB_NAME = "job_name"
    ADDRESS = "address"


class PropertyPattern(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    """Configured and reviewer-confirmed aliases for property matching (mirrors
    VendorPattern / vendor_matching.py). learned_from_invoice_id is set when a
    pattern was captured from a reviewer's property-assignment correction —
    this is the alias-register learning loop from ARCHITECTURE-V2 decision 5.
    """

    __tablename__ = "property_patterns"
    property_id: Mapped[UUID] = mapped_column(
        ForeignKey("properties.id"), nullable=False, index=True
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
            PropertyPatternType, "pattern_type", name="property_pattern_type_valid"
        ),
    )
