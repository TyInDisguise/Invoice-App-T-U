"""DB-backed tests for BaseRepo.create — regression for the created_by ->
created_by_id alias fix (every create endpoint 500'd without it)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Firm, FirmUser
from app.repositories.property import PropertyRepo

_PROP_KW = dict(
    name="123 Main St",
    address_line1="123 Main St",
    city="Atlanta",
    state_region="GA",
    postal_code="30301",
    property_type="office",
    status="active",
)


async def test_create_maps_created_by_to_created_by_id(
    db_session: AsyncSession, firm: Firm, user: FirmUser
):
    repo = PropertyRepo(db_session)
    prop = await repo.create(firm.id, created_by=user.id, **_PROP_KW)
    # Without the alias, Property(**kwargs) would raise TypeError on `created_by`.
    assert prop.created_by_id == user.id
    assert prop.firm_id == firm.id


async def test_create_without_created_by_leaves_it_null(db_session: AsyncSession, firm: Firm):
    repo = PropertyRepo(db_session)
    prop = await repo.create(firm.id, **_PROP_KW)
    assert prop.created_by_id is None


async def test_create_injects_firm_scope(db_session: AsyncSession, firm: Firm):
    repo = PropertyRepo(db_session)
    prop = await repo.create(firm.id, **_PROP_KW)
    assert prop.firm_id == firm.id  # firm_scope injected as firm_id
