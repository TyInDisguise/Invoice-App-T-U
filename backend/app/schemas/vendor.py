from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_email: str | None = None
    contact_phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_region: str | None = None
    postal_code: str | None = None
    country: str | None = None
    notes: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address_line1: str | None = None
    city: str | None = None
    state_region: str | None = None
    postal_code: str | None = None
    notes: str | None = None


class VendorResponse(BaseModel):
    id: UUID
    firm_id: UUID
    name: str
    contact_email: str | None
    contact_phone: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state_region: str | None
    postal_code: str | None
    country: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class VendorPatternCreate(BaseModel):
    pattern_type: str
    pattern_text: str = Field(min_length=1, max_length=500)


class VendorPatternResponse(BaseModel):
    id: UUID
    vendor_id: UUID
    pattern_type: str
    pattern_text: str
    confirmed_by_user: bool

    model_config = {"from_attributes": True}
