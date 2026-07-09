from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class PortfolioResponse(BaseModel):
    id: UUID
    firm_id: UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


class PropertyCreate(BaseModel):
    portfolio_id: UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    address_line1: str = Field(min_length=1, max_length=255)
    address_line2: str | None = None
    city: str = Field(min_length=1, max_length=120)
    state_region: str = Field(min_length=1, max_length=80)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(default="US", max_length=2)
    property_type: str
    status: str
    custom_fields: dict[str, object] = Field(default_factory=dict)


class PropertyUpdate(BaseModel):
    portfolio_id: UUID | None = None
    name: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_region: str | None = None
    postal_code: str | None = None
    property_type: str | None = None
    status: str | None = None
    custom_fields: dict[str, object] | None = None


class PropertyResponse(BaseModel):
    id: UUID
    firm_id: UUID
    portfolio_id: UUID | None
    name: str
    address_line1: str
    address_line2: str | None
    city: str
    state_region: str
    postal_code: str
    country: str
    property_type: str
    status: str
    custom_fields: dict[str, object]

    model_config = {"from_attributes": True}


class PropertyContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_role: str = Field(min_length=1, max_length=80)
    email: str | None = None
    phone: str | None = None
    notes: str | None = None


class PropertyContactResponse(BaseModel):
    id: UUID
    property_id: UUID
    name: str
    contact_role: str
    email: str | None
    phone: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class PropertyEntityCreate(BaseModel):
    """Owning/billed legal entity — the primary property-matching signal
    (ARCHITECTURE-V2 decision 5)."""

    legal_name: str = Field(min_length=1, max_length=255)
    notes: str | None = None


class PropertyEntityResponse(BaseModel):
    id: UUID
    property_id: UUID
    legal_name: str
    notes: str | None

    model_config = {"from_attributes": True}


class PropertyPatternCreate(BaseModel):
    pattern_type: str = Field(description="bill_to_entity | project_alias | job_name | address")
    pattern_text: str = Field(min_length=1, max_length=500)


class PropertyPatternResponse(BaseModel):
    id: UUID
    property_id: UUID
    pattern_type: str
    pattern_text: str
    confirmed_by_user: bool

    model_config = {"from_attributes": True}


class PropertyDashboardResponse(BaseModel):
    property: PropertyResponse
    open_review_count: int
    approved_count: int
