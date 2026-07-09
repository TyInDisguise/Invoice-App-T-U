from __future__ import annotations

from uuid import UUID

from sqlalchemy import exists, select

from app.models.identity import FirmUserRole
from app.repositories.base import BaseRepo


class FirmUserRoleRepo(BaseRepo[FirmUserRole]):
    model = FirmUserRole

    async def has_property_access(
        self,
        firm_id: UUID,
        firm_user_id: UUID,
        property_id: UUID,
    ) -> bool:
        """Returns True if the user has any active role on the given property."""
        stmt = select(
            exists().where(
                FirmUserRole.firm_id == firm_id,
                FirmUserRole.firm_user_id == firm_user_id,
                FirmUserRole.property_id == property_id,
                FirmUserRole.is_active.is_(True),
            )
        )
        result = await self.session.execute(stmt)
        return bool(result.scalar())
