"""ARQ producer pool — used by routers to enqueue the extraction job (decision 3).
Separate from redis_client.py (which handles JWT-blocklist reads/writes on the
plain redis client, not ARQ job queuing)."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from app.core.config import settings

_pool: ArqRedis | None = None


async def get_arq_pool() -> AsyncGenerator[ArqRedis, None]:
    global _pool
    if _pool is None:
        _pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    yield _pool
