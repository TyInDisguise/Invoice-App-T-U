from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.invoice import InvoiceResponse


class EmailIntakePayload(BaseModel):
    """Microsoft Graph email intake payload only (ARCHITECTURE-V2 Platforms:
    Gmail/Nylas paths dropped)."""

    property_id: UUID | None = None  # None → match_property() proposes it
    source_message_id: str = Field(min_length=1, max_length=500)
    pdf_base64: str = Field(description="Base64-encoded PDF payload")
    attachment_ref: str = Field(min_length=1, max_length=500)


class IntakeResponse(BaseModel):
    invoice: InvoiceResponse
    duplicate: bool


class ExtractionCorrection(BaseModel):
    """Reviewer corrections applied during extraction_review, prior to the
    approve/reject/hold decision (schemas/invoice.py InvoiceTransition)."""

    vendor_id: UUID | None = None
    property_id: UUID | None = None
    vendor_name: str | None = None
    bill_to_entity: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    tax_amount: str | None = None
    total_amount: str | None = None
    currency: str | None = None
    category: str | None = None


class InvoiceAttachmentCreate(BaseModel):
    attachment_ref: str = Field(min_length=1, max_length=500)
    attachment_type: str = Field(description="original | annotated")
    upload_source: str = Field(description="email | manual_upload | system_generated")


class InvoiceAttachmentResponse(BaseModel):
    id: UUID
    invoice_id: UUID
    attachment_ref: str
    attachment_type: str
    upload_source: str

    model_config = {"from_attributes": True}


class InvoiceExtractionView(BaseModel):
    """Full extraction snapshot for the review screen — staged AI output plus
    the deterministic validation flags, per the Proposal Layer pattern."""

    invoice_id: UUID
    status: str
    extraction_status: str
    ai_provider: str | None
    ai_model_id: str | None
    ai_confidence_score: float | None
    ai_extracted_payload: dict[str, Any] | None
    ai_field_status: dict[str, Any] | None
    validation_flags: dict[str, Any] | None
    proposed_vendor_id: UUID | None
    proposed_property_id: UUID | None
    property_match_signal: str | None
    page_count: int | None
    pages_extracted: int | None
