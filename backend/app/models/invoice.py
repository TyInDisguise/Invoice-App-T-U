"""Invoice domain models: Invoice, InvoiceLineItem, InvoiceAttachment.

Rewritten against .planning/research/INVOICE-PROCESSING-ARCHITECTURE-V2.md.
Key departures from the old (draw-inclusive) schema:

- `category` (operating / non_operating / construction_draw) replaces
  expense_classification and all prior classification schemes — decision 12.
  No GL job code, no budget-line linkage on InvoiceLineItem.
- `property_id` is nullable at intake; `proposed_property_id` +
  `property_match_signal` stage the match(); a human confirms it — decision 5.
  Same Proposal Layer pattern already used for vendor_id/suggested_vendor_id.
- `status` has no `pending_approval` / `in_draw` / `paid` states. V1 routes
  every invoice to human review; confirm+approve is one reviewer action —
  decision 6. Terminal states are approved / rejected.
- `extraction_status` is separate from `status` — it tracks the background
  ARQ job (decision 3), not the business workflow. No-dead-ends failure
  handling (decision 13) reads/writes this field.
- `page_count` / `pages_extracted` support the 15-page extraction cap and
  truncation display (decision 14).
- `validation_flags` holds deterministic-validation results (decision 4):
  totals mismatch, partial lines (on truncated docs), duplicate suspect,
  date/currency sanity — shown to the reviewer as flags, not silently acted on.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
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


# ---- Enums ----
class InvoiceStatus(Enum):
    EXTRACTION_REVIEW = "extraction_review"
    APPROVED = "approved"
    ON_HOLD = "on_hold"
    REJECTED = "rejected"


class ExtractionStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InvoiceIntakeSource(Enum):
    EMAIL_GRAPH = "email_graph"
    MANUAL_UPLOAD = "manual_upload"


class InvoiceCategory(Enum):
    OPERATING = "operating"
    NON_OPERATING = "non_operating"
    CONSTRUCTION_DRAW = "construction_draw"


class InvoiceAttachmentType(Enum):
    ORIGINAL = "original"
    ANNOTATED = "annotated"


class InvoiceAttachmentSource(Enum):
    EMAIL = "email"
    MANUAL_UPLOAD = "manual_upload"
    SYSTEM_GENERATED = "system_generated"  # annotated PDF burned from reviewer markup


# ---- Invoice ----
class Invoice(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    __tablename__ = "invoices"

    # Vendor matching — nullable to support unmatched-on-intake → human-confirm flow
    vendor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("vendors.id"), nullable=True, index=True,
    )
    proposed_vendor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("vendors.id"), nullable=True,
    )

    # Property matching — same proposal pattern (decision 5)
    property_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("properties.id"), nullable=True, index=True,
    )
    proposed_property_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("properties.id"), nullable=True,
    )
    property_match_signal: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # one of: bill_to_entity | project_alias | vendor_history | address | null (no match)

    # Canonical (authoritative) invoice fields — set by humans or deterministic
    # services only; AI never writes here directly (Proposal Layer)
    vendor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bill_to_entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="USD", server_default="USD",
    )
    category: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # Workflow state
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="extraction_review",
    )
    on_hold_reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Background extraction job tracking (decision 3, 13) — distinct from `status`
    extraction_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued", server_default="queued",
    )
    extraction_attempts: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    extraction_failure_reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Page cap / truncation (decision 14)
    page_count: Mapped[int | None] = mapped_column(nullable=True)
    pages_extracted: Mapped[int | None] = mapped_column(nullable=True)

    # Deterministic validation results (decision 4) — flags shown to reviewer,
    # never silently acted on
    validation_flags: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"totals_mismatch": true, "partial_lines": false, "duplicate_suspect": null}
    duplicate_of_invoice_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("invoices.id"), nullable=True,
    )

    # Email-intake idempotency
    source_message_id: Mapped[str | None] = mapped_column(String(998), nullable=True)
    intake_source: Mapped[str] = mapped_column(
        String(40), nullable=False, default="manual_upload",
    )
    intake_received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )

    # AI staging fields (Proposal Layer) — AI writes ONLY to these columns;
    # humans/services promote to canonical fields above
    ai_extracted_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # includes header fields + staged line_items array; materialized to
    # InvoiceLineItem rows only on reviewer confirm
    ai_field_status: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # {"invoice_number": "extracted", "total_amount": "ambiguous", ...}
    ai_confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    ai_provider: Mapped[str | None] = mapped_column(String(60), nullable=True)
    ai_model_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ai_schema_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    raw_extraction_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Optimistic locking for state transitions
    version_id: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version_id}  # type: ignore[dict-item]

    __table_args__ = (
        enum_check_constraint(InvoiceStatus, "status", name="invoice_status_valid"),
        enum_check_constraint(
            ExtractionStatus, "extraction_status", name="invoice_extraction_status_valid",
        ),
        enum_check_constraint(
            InvoiceIntakeSource, "intake_source", name="invoice_intake_source_valid",
        ),
        enum_check_constraint(InvoiceCategory, "category", name="invoice_category_valid"),
        UniqueConstraint("firm_id", "source_message_id", name="invoice_message_id_unique_per_firm"),
        Index("ix_invoices_firm_status", "firm_id", "status"),  # review-queue query
        Index("ix_invoices_firm_vendor", "firm_id", "vendor_id"),
        Index("ix_invoices_firm_extraction_status", "firm_id", "extraction_status"),
    )


# ---- InvoiceLineItem ----
class InvoiceLineItem(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    """Supporting detail, not separately approvable (PRODUCT-BRIEF workflow step 7).
    Materialized from ai_extracted_payload on reviewer confirm. Exists to validate
    totals and to feed the future draw module — not for per-line review.
    """

    __tablename__ = "invoice_line_items"
    invoice_id: Mapped[UUID] = mapped_column(
        ForeignKey("invoices.id"), nullable=False, index=True,
    )
    description: Mapped[str] = mapped_column(String(2000), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)


# ---- InvoiceAttachment ----
class InvoiceAttachment(
    Base,
    IdentityMixin,
    FirmScopedMixin,
    TimestampMixin,
    SoftDeleteMixin,
    AuditableMixin,
):
    __tablename__ = "invoice_attachments"
    invoice_id: Mapped[UUID] = mapped_column(
        ForeignKey("invoices.id"), nullable=False, index=True,
    )
    attachment_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    attachment_type: Mapped[str] = mapped_column(String(40), nullable=False)
    upload_source: Mapped[str] = mapped_column(String(40), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    derived_from_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("invoice_attachments.id"), nullable=True,
    )
    # Fabric.js annotation JSON — markup-on-reject is in V1 scope
    annotation_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    __table_args__ = (
        enum_check_constraint(
            InvoiceAttachmentType, "attachment_type", name="invoice_attachment_type_valid",
        ),
        enum_check_constraint(
            InvoiceAttachmentSource, "upload_source", name="invoice_attachment_source_valid",
        ),
    )
