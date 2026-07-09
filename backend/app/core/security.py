"""Password hashing + JWT helpers. PM-token and itsdangerous signed-link
helpers dropped — no PM portal / lender / vendor signed-link flows in V1.
Kept through the build; Entra ID SSO is a pre-team-rollout milestone."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import settings
from app.core.exceptions import AuthenticationError

_pwd: PasswordHash = PasswordHash((BcryptHasher(),))


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def _encode(payload: dict[str, object]) -> str:
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)  # type: ignore[reportUnknownMemberType]


def _make_jwt(
    subject: str, firm_id: str, jti: str, expire: timedelta, extra: dict[str, object] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, object] = {
        "sub": subject, "firm_id": firm_id, "jti": jti, "iat": now, "exp": now + expire,
    }
    if extra:
        payload.update(extra)
    return _encode(payload)


def create_access_token(subject: str, firm_id: str) -> tuple[str, str]:
    jti = str(uuid.uuid4())
    return _make_jwt(subject, firm_id, jti, timedelta(minutes=settings.access_token_expire_minutes)), jti


def create_refresh_token(subject: str, firm_id: str) -> tuple[str, str]:
    jti = str(uuid.uuid4())
    return _make_jwt(subject, firm_id, jti, timedelta(days=settings.refresh_token_expire_days)), jti


def decode_token(token: str) -> dict[str, object]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])  # type: ignore[no-any-return]
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid token") from exc
