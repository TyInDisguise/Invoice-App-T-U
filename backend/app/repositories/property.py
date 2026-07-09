from __future__ import annotations

from uuid import UUID

from app.models.property import Property, PropertyContact, PropertyEntity, PropertyPattern
from app.repositories.base import BaseRepo


class PropertyRepo(BaseRepo[Property]):
    model = Property

    async def list_for_firm(self, firm_id: UUID) -> list[Property]:
        return await self.list(firm_id)

    async def list_for_portfolio(self, firm_id: UUID, portfolio_id: UUID) -> list[Property]:
        return await self.list(firm_id, portfolio_id=portfolio_id)


class PropertyContactRepo(BaseRepo[PropertyContact]):
    model = PropertyContact

    async def list_for_property(self, firm_id: UUID, property_id: UUID) -> list[PropertyContact]:
        return await self.list(firm_id, property_id=property_id)


class PropertyEntityRepo(BaseRepo[PropertyEntity]):
    model = PropertyEntity

    async def list_for_firm(self, firm_id: UUID) -> list[PropertyEntity]:
        return await self.list(firm_id)


class PropertyPatternRepo(BaseRepo[PropertyPattern]):
    model = PropertyPattern

    async def list_for_firm(self, firm_id: UUID) -> list[PropertyPattern]:
        return await self.list(firm_id)

    async def list_for_property(self, firm_id: UUID, property_id: UUID) -> list[PropertyPattern]:
        return await self.list(firm_id, property_id=property_id)
