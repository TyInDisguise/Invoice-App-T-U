from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_firm_user, require_property_access
from app.models.identity import FirmUser
from app.repositories.audit import AuditEntryRepo
from app.schemas.audit import AuditEntryResponse

router = APIRouter(tags=["audit"])


@router.get("/audit/entity/{entity_type}/{entity_id}")
async def list_entity_audit(
    entity_type: str,
    entity_id: UUID,
    current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> list[AuditEntryResponse]:
    """Return the full audit trail for any entity by (entity_type, entity_id).

    Per Phase 6 success criterion #5, returns actor, action, before/after state,
    and UTC timestamp.
    """
    entries = await AuditEntryRepo(db).list_for_entity(entity_type, entity_id)
    # Filter to firm scope for safety (entries with no firm_id are system-level)
    visible = [
        e for e in entries
        if e.firm_id is None or e.firm_id == current_user.firm_id
    ]
    return [AuditEntryResponse.model_validate(e) for e in visible]


@router.get("/properties/{property_id}/audit")
async def list_property_audit(
    property_id: UUID,
    limit: int = 200,
    current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[AuditEntryResponse]:
    entries = await AuditEntryRepo(db).list_for_property(
        current_user.firm_id, property_id, limit=limit
    )
    return [AuditEntryResponse.model_validate(e) for e in entries]
