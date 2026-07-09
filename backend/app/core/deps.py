from __future__ import annotations

from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.redis_client import RedisClient, get_redis, is_jti_blocked
from app.core.security import decode_token
from app.models.identity import FirmUser
from app.repositories.firm_user import FirmUserRepo
from app.repositories.firm_user_role import FirmUserRoleRepo


async def get_current_firm_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_session),
    redis: RedisClient = Depends(get_redis),
) -> FirmUser:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(access_token)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    actor_type = payload.get("actor_type")
    if actor_type is not None and actor_type != "firm_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Wrong actor type")

    jti = str(payload.get("jti", ""))
    if await is_jti_blocked(redis, jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    user_id = UUID(str(payload["sub"]))
    firm_id = UUID(str(payload["firm_id"]))

    try:
        user = await FirmUserRepo(db).get(firm_id, user_id)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        ) from exc
    # Close the read-only autobegin so handlers can start their own transaction.
    # Use commit so the user ORM instance isn't expired.
    if db.in_transaction():
        await db.commit()
    return user


async def require_property_access(
    property_id: UUID,
    current_user: FirmUser = Depends(get_current_firm_user),
    db: AsyncSession = Depends(get_session),
) -> FirmUser:
    """Dependency for any route scoped to a property_id path parameter.

    Raises 403 if the authenticated firm user has no active role on the property.
    Returns the current user so callers can use it directly.
    """
    has_access = await FirmUserRoleRepo(db).has_property_access(
        current_user.firm_id, current_user.id, property_id
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    # Close the read-only autobegin so handlers can start their own transaction
    # via `async with db.begin():`. Use commit (not rollback) so the user ORM
    # instance isn't expired — expire_on_commit=False is set on the sessionmaker.
    if db.in_transaction():
        await db.commit()
    return current_user
