from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    firm_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: str
    password: str


class MeResponse(BaseModel):
    id: UUID
    firm_id: UUID
    email: str
    full_name: str
    last_login_at: datetime | None

    model_config = {"from_attributes": True}
