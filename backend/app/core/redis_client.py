from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import redis.asyncio as aioredis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.config import settings

logger = logging.getLogger(__name__)

_BLOCKLIST_PREFIX = "auth:blocklist:"

RedisClient = aioredis.Redis  # type: ignore[type-arg]


async def get_redis() -> AsyncGenerator[RedisClient, None]:
    client: RedisClient = aioredis.from_url(  # type: ignore[reportUnknownMemberType]
        settings.redis_url, decode_responses=True
    )
    try:
        yield client
    finally:
        await client.aclose()


async def blocklist_jti(client: RedisClient, jti: str, ttl_seconds: int) -> None:
    try:
        await client.setex(f"{_BLOCKLIST_PREFIX}{jti}", ttl_seconds, "1")
    except RedisConnectionError:
        # Dev-mode fallback: JWT exp still enforces session length. Production
        # must have Redis up so logged-out JTIs are blocked before exp.
        logger.warning("Redis unreachable; JTI %s not blocklisted", jti)


async def is_jti_blocked(client: RedisClient, jti: str) -> bool:
    try:
        return bool(await client.exists(f"{_BLOCKLIST_PREFIX}{jti}"))
    except RedisConnectionError:
        logger.warning("Redis unreachable; skipping JTI blocklist check")
        return False
