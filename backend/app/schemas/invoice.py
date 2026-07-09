from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceCreate(BaseModel):
    """Direct entry, bypassing intake — used only for the no-dead-ends manual
    keying path when extraction fails (decision 13), not a standalone feature."""

    vendor_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    total_amount: Decimal | None = None
    currency: str = "USD"
    category: str | None = None


class InvoiceResponse(BaseModel):
    id: UUID
    firm_id: UUID
    property_id: UUID | None
    proposed_property_id: UUID | None
    property_match_signal: str | None
    vendor_id: UUID | None
    proposed_vendor_id: UUID | None
    vendor_name: str | None
    bill_to_entity: str | None
    invoice_number: str | None
    invoice_date: date | None
    due_date: date | None
    tax_amount: Decimal | None
    total_amount: Decimal | None
    currency: str
    category: str | None
    status: str
    on_hold_reason: str | None
    rejected_reason: str | None
    extraction_status: str
    extraction_attempts: int
    extraction_failure_reason: str | None
    page_count: int | None
    pages_extracted: int | None
    validation_flags: dict[str, Any] | None
    duplicate_of_invoice_id: UUID | None
    intake_source: str
    intake_received_at: datetime
    ai_confidence_score: Decimal | None
    ai_provider: str | None
    ai_model_id: str | None

    model_config = {"from_attributes": True}


class InvoiceLineItemResponse(BaseModel):
    id: UUID
    invoice_id: UUID
    description: str
    amount: Decimal
    sort_order: int

    model_config = {"from_attributes": True}


class InvoiceTransition(BaseModel):
    """Reviewer decision — approve / reject / hold. Per PRODUCT-BRIEF workflow
    step 7, this is the whole-invoice unit of approval; line items are
    supporting detail, never separately approved."""

    to_status: str = Field(description="approved | on_hold | rejected")
    reason: str | None = None
