"""HTTP-level tests through the FastAPI app (httpx ASGI transport).

Covers the request boundary where the created_by 500 lived — a bug that only
manual clicking caught before. Uses a committing session against the test DB;
business-endpoint tests stub the auth dependency, auth-flow tests run it for real.
"""
from __future__ import annotations

from httpx import AsyncClient

_SIGNUP = {
    "firm_name": "Third and Urban",
    "email": "owner@example.com",
    "password": "Password123!",
    "full_name": "Owner",
}
_PROP = {
    "name": "123 Main St",
    "address_line1": "123 Main St",
    "city": "Atlanta",
    "state_region": "GA",
    "postal_code": "30301",
    "property_type": "office",
    "status": "active",
}


# ---- auth flow (real dependency + redis) ----

async def test_signup_then_me_roundtrip(client: AsyncClient):
    r = await client.post("/auth/signup", json=_SIGNUP)
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "owner@example.com"
    # signup set the auth cookies; /auth/me should resolve the same user
    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"


async def test_me_requires_auth(client: AsyncClient):
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_login_rejects_bad_password(client: AsyncClient):
    await client.post("/auth/signup", json=_SIGNUP)
    client.cookies.clear()  # drop the signup session
    r = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "wrong-password"}
    )
    assert r.status_code == 401


# ---- business endpoints (created_by regression at the HTTP boundary) ----

async def test_create_property_returns_201(authed: tuple[AsyncClient, object]):
    client, _user = authed
    r = await client.post("/properties", json=_PROP)
    # Without the created_by -> created_by_id alias, this endpoint 500'd.
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "123 Main St"


async def test_created_property_is_listable(authed: tuple[AsyncClient, object]):
    client, _user = authed
    await client.post("/properties", json=_PROP)
    r = await client.get("/properties")
    assert r.status_code == 200
    assert any(p["name"] == "123 Main St" for p in r.json())


async def test_create_vendor_returns_201(authed: tuple[AsyncClient, object]):
    client, _user = authed
    r = await client.post("/vendors", json={"name": "Peachtree Mechanical Services, LLC"})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "Peachtree Mechanical Services, LLC"


async def test_property_validation_rejects_missing_fields(authed: tuple[AsyncClient, object]):
    client, _user = authed
    r = await client.post("/properties", json={"name": "Incomplete"})
    assert r.status_code == 422  # pydantic request validation, not a 500
