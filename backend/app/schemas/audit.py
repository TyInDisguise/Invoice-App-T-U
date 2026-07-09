from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditEntryResponse(BaseModel):
    id: UUID
    firm_id: UUID | None
    entity_type: str
    entity_id: UUID
    action: str
    actor_type: str
    actor_id: UUID | None
    actor_reference: str | None
    before_state: dict[str, Any] | None
    after_state: dict[str, Any] | None
    from_state: str | None
    to_state: str | None
    property_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
