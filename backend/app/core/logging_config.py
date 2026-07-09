"""Structured JSON logging + per-request correlation ID.

When `settings.log_format=json`, every log line is one JSON object with
`ts`, `level`, `logger`, `msg`, and any `request_id` / `firm_id` bound to the
record by `CorrelationIdMiddleware`.
"""
from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
_firm_id_var: ContextVar[str | None] = ContextVar("firm_id", default=None)


def current_request_id() -> str | None:
    return _request_id_var.get()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = _request_id_var.get()
        if rid:
            payload["request_id"] = rid
        fid = _firm_id_var.get()
        if fid:
            payload["firm_id"] = fid
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    root = logging.getLogger()
    # Remove default handlers so we don't double-log
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s")
        )
    root.addHandler(handler)
    root.setLevel(logging.INFO)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Assigns a `X-Request-ID` per request (or propagates one sent by the caller)."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        incoming = request.headers.get("x-request-id")
        rid = incoming or str(uuid.uuid4())
        token = _request_id_var.set(rid)
        try:
            response: Response = await call_next(request)
        finally:
            _request_id_var.reset(token)
        response.headers["x-request-id"] = rid
        return response
