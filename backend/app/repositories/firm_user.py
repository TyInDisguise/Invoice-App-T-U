from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.models.identity import Firm, FirmUser
from app.repositories.base import BaseRepo


class FirmRepo(BaseRepo[Firm]):
    model = Firm


class FirmUserRepo(BaseRepo[FirmUser]):
    model = FirmUser

    async def get_by_email(self, firm_id: UUID, email: str) -> FirmUser | None:
        return await self.find(firm_id, email=email)

    async def touch_login(self, user: FirmUser) -> None:
        user.last_login_at = datetime.now(UTC)
        await self.session.flush()
