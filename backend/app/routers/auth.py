"""Auth — email/password + JWT cookies. Kept through the single-user build;
Entra ID SSO is a pre-team-rollout milestone (ARCHITECTURE-V2 Platforms/
Security sections). PM portal verification and lender/vendor signed-token
issuance dropped — no PM portal / lender / vendor flows in V1."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_firm_user
from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.redis_client import RedisClient, blocklist_jti, get_redis, is_jti_blocked
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.identity import FirmUser
from app.repositories.firm_user import FirmRepo, FirmUserRepo
from app.schemas.auth import LoginRequest, MeResponse, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])

_ACCESS_COOKIE = "access_token"
_REFRESH_COOKIE = "refresh_token"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    shared = {
        "httponly": True, "secure": settings.cookie_secure, "samesite": "lax",
        "domain": settings.cookie_domain,
    }
    response.set_cookie(
        _ACCESS_COOKIE, access_token, max_age=settings.access_token_expire_minutes * 60, **shared,  # type: ignore[arg-type]
    )
    response.set_cookie(
        _REFRESH_COOKIE, refresh_token, max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/auth/refresh", **shared,  # type: ignore[arg-type]
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(_ACCESS_COOKIE, domain=settings.cookie_domain)
    response.delete_cookie(_REFRESH_COOKIE, path="/auth/refresh", domain=settings.cookie_domain)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, response: Response, db: AsyncSession = Depends(get_session)) -> MeResponse:
    async with db.begin():
        firm = await FirmRepo(db).create(firm_scope=None, name=body.firm_name)
        user = await FirmUserRepo(db).create(
            firm_scope=firm.id, email=body.email.lower().strip(),
            hashed_password=hash_password(body.password), full_name=body.full_name,
        )
    access_token, _ = create_access_token(str(user.id), str(firm.id))
    refresh_token, _ = create_refresh_token(str(user.id), str(firm.id))
    _set_auth_cookies(response, access_token, refresh_token)
    return MeResponse.model_validate(user)


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_session)) -> MeResponse:
    stmt = select(FirmUser).where(
        FirmUser.email == body.email.lower().strip(), FirmUser.is_active.is_(True),
    ).limit(1)
    async with db.begin():
        user = (await db.execute(stmt)).scalar_one_or_none()

    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user is None or not verify_password(body.password, user.hashed_password):
        raise invalid

    async with db.begin():
        await FirmUserRepo(db).touch_login(user)

    access_token, _ = create_access_token(str(user.id), str(user.firm_id))
    refresh_token, _ = create_refresh_token(str(user.id), str(user.firm_id))
    _set_auth_cookies(response, access_token, refresh_token)
    return MeResponse.model_validate(user)


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(request: Request, response: Response, redis: RedisClient = Depends(get_redis)) -> JSONResponse:
    for cookie_name in (_ACCESS_COOKIE, _REFRESH_COOKIE):
        token = request.cookies.get(cookie_name)
        if not token:
            continue
        try:
            payload = decode_token(token)
            jti = str(payload.get("jti", ""))
            exp = payload.get("exp")
            if jti and exp:
                ttl = max(1, int(float(str(exp))) - int(datetime.now(UTC).timestamp()))
                await blocklist_jti(redis, jti, ttl)
        except AuthenticationError:
            pass
    _clear_auth_cookies(response)
    return JSONResponse(content={"detail": "Logged out"})


@router.post("/refresh")
async def refresh(
    request: Request, response: Response,
    db: AsyncSession = Depends(get_session), redis: RedisClient = Depends(get_redis),
) -> MeResponse:
    refresh_token = request.cookies.get(_REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        payload = decode_token(refresh_token)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    jti = str(payload.get("jti", ""))
    if await is_jti_blocked(redis, jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    exp = payload.get("exp")
    if jti and exp:
        ttl = max(1, int(float(str(exp))) - int(datetime.now(UTC).timestamp()))
        await blocklist_jti(redis, jti, ttl)

    user_id = UUID(str(payload["sub"]))
    firm_id = UUID(str(payload["firm_id"]))
    try:
        user = await FirmUserRepo(db).get(firm_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found") from exc

    new_access, _ = create_access_token(str(user.id), str(user.firm_id))
    new_refresh, _ = create_refresh_token(str(user.id), str(user.firm_id))
    _set_auth_cookies(response, new_access, new_refresh)
    return MeResponse.model_validate(user)


@router.get("/me")
async def me(current_user: FirmUser = Depends(get_current_firm_user)) -> MeResponse:
    return MeResponse.model_validate(current_user)
