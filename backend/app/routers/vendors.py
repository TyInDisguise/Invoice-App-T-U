"""Vendors + patterns. Compliance-doc lifecycle (W-9/COI) dropped — out of V1
scope, re-enters with the draw module's COI pre-flight."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_firm_user
from app.models.identity import FirmUser
from app.repositories.vendor import VendorPatternRepo, VendorRepo
from app.schemas.vendor import (
    VendorCreate,
    VendorPatternCreate,
    VendorPatternResponse,
    VendorResponse,
    VendorUpdate,
)

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> VendorResponse:
    async with db.begin():
        vendor = await VendorRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, **body.model_dump(),
        )
    return VendorResponse.model_validate(vendor)


@router.get("")
async def list_vendors(
    current_user: FirmUser = Depends(get_current_firm_user), db: AsyncSession = Depends(get_session),
) -> list[VendorResponse]:
    vendors = await VendorRepo(db).list_for_firm(current_user.firm_id)
    return [VendorResponse.model_validate(v) for v in vendors]


@router.get("/{vendor_id}")
async def get_vendor(
    vendor_id: UUID, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> VendorResponse:
    vendor = await VendorRepo(db).get(current_user.firm_id, vendor_id)
    return VendorResponse.model_validate(vendor)


@router.patch("/{vendor_id}")
async def update_vendor(
    vendor_id: UUID, body: VendorUpdate, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> VendorResponse:
    async with db.begin():
        vendor = await VendorRepo(db).get(current_user.firm_id, vendor_id)
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(vendor, field, value)
    return VendorResponse.model_validate(vendor)


@router.post("/{vendor_id}/patterns", status_code=status.HTTP_201_CREATED)
async def create_pattern(
    vendor_id: UUID, body: VendorPatternCreate, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> VendorPatternResponse:
    async with db.begin():
        pattern = await VendorPatternRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, vendor_id=vendor_id,
            confirmed_by_user=True, **body.model_dump(),
        )
    return VendorPatternResponse.model_validate(pattern)


@router.get("/{vendor_id}/patterns")
async def list_patterns(
    vendor_id: UUID, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> list[VendorPatternResponse]:
    patterns = await VendorPatternRepo(db).list_for_vendor(current_user.firm_id, vendor_id)
    return [VendorPatternResponse.model_validate(p) for p in patterns]
