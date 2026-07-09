from __future__ import annotations

from uuid import UUID

from app.models.vendor import Vendor, VendorPattern
from app.repositories.base import BaseRepo


class VendorRepo(BaseRepo[Vendor]):
    model = Vendor

    async def list_for_firm(self, firm_id: UUID) -> list[Vendor]:
        return await self.list(firm_id)


class VendorPatternRepo(BaseRepo[VendorPattern]):
    model = VendorPattern

    async def list_for_vendor(self, firm_id: UUID, vendor_id: UUID) -> list[VendorPattern]:
        return await self.list(firm_id, vendor_id=vendor_id)
