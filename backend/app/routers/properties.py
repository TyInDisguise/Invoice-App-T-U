"""Properties/portfolios. PM PIN management dropped — no PM portal in V1.
Dashboard simplified to invoice counts (loan/budget summaries were draw-module
concerns, dropped with that module)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_firm_user, require_property_access
from app.models.identity import FirmUser
from app.models.invoice import Invoice
from app.repositories.portfolio import PortfolioRepo
from app.repositories.property import (
    PropertyContactRepo,
    PropertyEntityRepo,
    PropertyPatternRepo,
    PropertyRepo,
)
from app.schemas.property import (
    PortfolioCreate,
    PortfolioResponse,
    PropertyContactCreate,
    PropertyContactResponse,
    PropertyCreate,
    PropertyDashboardResponse,
    PropertyEntityCreate,
    PropertyEntityResponse,
    PropertyPatternCreate,
    PropertyPatternResponse,
    PropertyResponse,
    PropertyUpdate,
)

router = APIRouter(tags=["properties"])


# ---- Portfolios ----

@router.post("/portfolios", status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    body: PortfolioCreate, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> PortfolioResponse:
    async with db.begin():
        portfolio = await PortfolioRepo(db).create(
            firm_scope=current_user.firm_id, name=body.name, description=body.description,
            created_by=current_user.id,
        )
    return PortfolioResponse.model_validate(portfolio)


@router.get("/portfolios")
async def list_portfolios(
    current_user: FirmUser = Depends(get_current_firm_user), db: AsyncSession = Depends(get_session),
) -> list[PortfolioResponse]:
    portfolios = await PortfolioRepo(db).list(current_user.firm_id)
    return [PortfolioResponse.model_validate(p) for p in portfolios]


@router.get("/portfolios/{portfolio_id}")
async def get_portfolio(
    portfolio_id: UUID, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> PortfolioResponse:
    portfolio = await PortfolioRepo(db).get(current_user.firm_id, portfolio_id)
    return PortfolioResponse.model_validate(portfolio)


# ---- Properties ----

@router.post("/properties", status_code=status.HTTP_201_CREATED)
async def create_property(
    body: PropertyCreate, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> PropertyResponse:
    async with db.begin():
        prop = await PropertyRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, **body.model_dump(),
        )
    return PropertyResponse.model_validate(prop)


@router.get("/properties")
async def list_properties(
    portfolio_id: UUID | None = None, current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> list[PropertyResponse]:
    repo = PropertyRepo(db)
    props = (
        await repo.list_for_portfolio(current_user.firm_id, portfolio_id)
        if portfolio_id else await repo.list_for_firm(current_user.firm_id)
    )
    return [PropertyResponse.model_validate(p) for p in props]


@router.get("/properties/{property_id}")
async def get_property(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> PropertyResponse:
    prop = await PropertyRepo(db).get(current_user.firm_id, property_id)
    return PropertyResponse.model_validate(prop)


@router.patch("/properties/{property_id}")
async def update_property(
    property_id: UUID, body: PropertyUpdate, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> PropertyResponse:
    async with db.begin():
        prop = await PropertyRepo(db).get(current_user.firm_id, property_id)
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(prop, field, value)
    return PropertyResponse.model_validate(prop)


@router.delete("/properties/{property_id}")
async def delete_property(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> Response:
    async with db.begin():
        await PropertyRepo(db).soft_delete(current_user.firm_id, property_id)
    return Response(status_code=204)


@router.get("/properties/{property_id}/dashboard")
async def property_dashboard(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> PropertyDashboardResponse:
    prop = await PropertyRepo(db).get(current_user.firm_id, property_id)
    open_stmt = select(func.count()).select_from(Invoice).where(
        Invoice.firm_id == current_user.firm_id, Invoice.property_id == property_id,
        Invoice.status == "extraction_review", Invoice.is_active.is_(True),
    )
    approved_stmt = select(func.count()).select_from(Invoice).where(
        Invoice.firm_id == current_user.firm_id, Invoice.property_id == property_id,
        Invoice.status == "approved", Invoice.is_active.is_(True),
    )
    open_count = (await db.execute(open_stmt)).scalar_one()
    approved_count = (await db.execute(approved_stmt)).scalar_one()
    return PropertyDashboardResponse(
        property=PropertyResponse.model_validate(prop),
        open_review_count=open_count, approved_count=approved_count,
    )


# ---- Property contacts ----

@router.post("/properties/{property_id}/contacts", status_code=status.HTTP_201_CREATED)
async def create_contact(
    property_id: UUID, body: PropertyContactCreate,
    current_user: FirmUser = Depends(require_property_access), db: AsyncSession = Depends(get_session),
) -> PropertyContactResponse:
    async with db.begin():
        contact = await PropertyContactRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, property_id=property_id,
            **body.model_dump(),
        )
    return PropertyContactResponse.model_validate(contact)


@router.get("/properties/{property_id}/contacts")
async def list_contacts(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[PropertyContactResponse]:
    contacts = await PropertyContactRepo(db).list_for_property(current_user.firm_id, property_id)
    return [PropertyContactResponse.model_validate(c) for c in contacts]


# ---- Property entities + patterns (match_property() inputs — decision 5) ----

@router.post("/properties/{property_id}/entities", status_code=status.HTTP_201_CREATED)
async def create_property_entity(
    property_id: UUID, body: PropertyEntityCreate,
    current_user: FirmUser = Depends(require_property_access), db: AsyncSession = Depends(get_session),
) -> PropertyEntityResponse:
    async with db.begin():
        entity = await PropertyEntityRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, property_id=property_id,
            **body.model_dump(),
        )
    return PropertyEntityResponse.model_validate(entity)


@router.get("/properties/{property_id}/entities")
async def list_property_entities(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[PropertyEntityResponse]:
    entities = await PropertyEntityRepo(db).list(current_user.firm_id, property_id=property_id)
    return [PropertyEntityResponse.model_validate(e) for e in entities]


@router.post("/properties/{property_id}/patterns", status_code=status.HTTP_201_CREATED)
async def create_property_pattern(
    property_id: UUID, body: PropertyPatternCreate,
    current_user: FirmUser = Depends(require_property_access), db: AsyncSession = Depends(get_session),
) -> PropertyPatternResponse:
    async with db.begin():
        pattern = await PropertyPatternRepo(db).create(
            firm_scope=current_user.firm_id, created_by=current_user.id, property_id=property_id,
            confirmed_by_user=True, **body.model_dump(),
        )
    return PropertyPatternResponse.model_validate(pattern)


@router.get("/properties/{property_id}/patterns")
async def list_property_patterns(
    property_id: UUID, current_user: FirmUser = Depends(require_property_access),
    db: AsyncSession = Depends(get_session),
) -> list[PropertyPatternResponse]:
    patterns = await PropertyPatternRepo(db).list_for_property(current_user.firm_id, property_id)
    return [PropertyPatternResponse.model_validate(p) for p in patterns]
