from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    DomainError,
    NotFoundError,
)
from app.core.logging_config import CorrelationIdMiddleware, configure_logging
from app.core.redis_client import get_redis
from app.routers import artifacts as artifacts_router
from app.routers import audit as audit_router
from app.routers import auth as auth_router
from app.routers import invoice_intake as invoice_intake_router
from app.routers import invoices as invoices_router
from app.routers import properties as properties_router
from app.routers import vendors as vendors_router
from app.services.state_machines import StateTransitionError

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield
    await engine.dispose()


app = FastAPI(title="Invoice Processing API", version="0.1.0", lifespan=lifespan)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(exc)})


@app.exception_handler(AuthorizationError)
async def authorization_error_handler(request: Request, exc: AuthorizationError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(StateTransitionError)
async def state_transition_error_handler(request: Request, exc: StateTransitionError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


app.include_router(auth_router.router)
app.include_router(properties_router.router)
app.include_router(vendors_router.router)
app.include_router(invoices_router.router)
app.include_router(invoice_intake_router.router)
app.include_router(audit_router.router)
app.include_router(artifacts_router.router)


@app.get("/healthz")
async def health_check() -> JSONResponse:
    from sqlalchemy import text

    components: dict[str, str] = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
        components["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        components["database"] = f"down: {exc.__class__.__name__}"

    try:
        gen = get_redis()
        client = await anext(gen)
        try:
            await client.ping()  # type: ignore[reportUnknownMemberType]
            components["redis"] = "ok"
        finally:
            await client.aclose()
    except StopAsyncIteration:
        components["redis"] = "unreachable"
    except Exception as exc:  # noqa: BLE001
        components["redis"] = f"down: {exc.__class__.__name__}"

    status_overall = "ok" if components.get("database") == "ok" else "degraded"
    return JSONResponse({
        "status": status_overall, "components": components,
        "version": app.version, "environment": settings.environment,
    })
