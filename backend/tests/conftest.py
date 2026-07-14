"""Test fixtures.

DB tests run against a dedicated `<db>_test` database on the same Postgres
instance as dev — Postgres-native types (JSONB, CHECK constraints, server
defaults) make SQLite an unreliable stand-in, and a separate database keeps
dev data untouched and duplicate-detection tests deterministic.

The test database is provisioned once per session (created if absent, tables
created from `Base.metadata`). Each test gets a session bound to a single
connection inside a transaction that is rolled back on teardown, so tests are
isolated and never commit.
"""
from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers every table on Base.metadata for create_all
from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_firm_user
from app.main import app
from app.models import Firm, FirmUser
from app.models.base import Base

_BASE_URL = make_url(settings.database_url)
_TEST_DB = (_BASE_URL.database or "invoice") + "_test"
TEST_URL = _BASE_URL.set(database=_TEST_DB)
_ADMIN_URL = _BASE_URL.set(database="postgres")


async def _provision() -> None:
    admin = create_async_engine(_ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": _TEST_DB}
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{_TEST_DB}"'))
    finally:
        await admin.dispose()

    engine = create_async_engine(TEST_URL)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _provision_test_db():
    # Synchronous fixture with its own loop — runs to completion before any test,
    # so nothing is shared across event loops.
    asyncio.run(_provision())
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    engine = create_async_engine(TEST_URL)
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(bind=conn, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        if trans.is_active:
            await trans.rollback()
        await conn.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def firm(db_session: AsyncSession) -> Firm:
    f = Firm(name="Test Firm")
    db_session.add(f)
    await db_session.flush()
    return f


@pytest_asyncio.fixture
async def user(db_session: AsyncSession, firm: Firm) -> FirmUser:
    u = FirmUser(
        firm_id=firm.id,
        email="admin@test.local",
        hashed_password="not-a-real-hash",
        full_name="Test Admin",
    )
    db_session.add(u)
    await db_session.flush()
    return u


# ---- API-level fixtures ----
# Router writes use `async with db.begin()`, which conflicts with the
# rolled-back-transaction db_session above. So API tests use a normally-
# committing session and clean tables after each test instead.

@pytest_asyncio.fixture
async def _api_engine():
    engine = create_async_engine(TEST_URL)
    try:
        yield engine
    finally:
        # CASCADE handles FK order; RESTART IDENTITY resets any sequences.
        names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        await engine.dispose()


@pytest_asyncio.fixture
async def db_maker(_api_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(_api_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(db_maker: async_sessionmaker[AsyncSession]) -> AsyncClient:
    async def _override_get_session():
        async with db_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def authed(
    client: AsyncClient, db_maker: async_sessionmaker[AsyncSession]
) -> tuple[AsyncClient, FirmUser]:
    """A client whose requests act as a seeded firm user (auth dependency
    stubbed), for exercising business endpoints without the login flow."""
    async with db_maker() as s:
        firm = Firm(name="API Test Firm")
        s.add(firm)
        await s.flush()
        user = FirmUser(
            firm_id=firm.id,
            email="api@test.local",
            hashed_password="not-a-real-hash",
            full_name="API User",
        )
        s.add(user)
        await s.commit()
        await s.refresh(user)

    async def _fake_current_user() -> FirmUser:
        return user

    app.dependency_overrides[get_current_firm_user] = _fake_current_user
    return client, user
