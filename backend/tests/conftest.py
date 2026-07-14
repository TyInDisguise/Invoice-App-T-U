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
from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import app.models  # noqa: F401 — registers every table on Base.metadata for create_all
from app.core.config import settings
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
