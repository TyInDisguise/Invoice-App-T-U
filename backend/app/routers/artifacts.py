"""Firm-scoped artifact file streamer.

Artifacts are written under `<firm_id>/<entity_type>/<entity_id>/<uuid>__<name>`
by `app.services.documents.storage`. This router enforces that the caller's
firm_id matches the first path segment before streaming bytes.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import get_current_firm_user
from app.models.identity import FirmUser

router = APIRouter(tags=["artifacts"])


@router.get("/artifacts/{ref:path}")
async def get_artifact(
    ref: str,
    current_user: FirmUser = Depends(get_current_firm_user),
) -> FileResponse:
    parts = ref.split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid artifact ref")
    try:
        ref_firm_id = UUID(parts[0])
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid artifact ref") from e
    if ref_firm_id != current_user.firm_id:
        raise HTTPException(status_code=403, detail="Artifact not in firm scope")

    root = Path(settings.artifact_storage_root).resolve()
    target = (root / ref).resolve()
    try:
        target.relative_to(root)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid artifact ref") from e
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    mime, _ = mimetypes.guess_type(target.name)
    return FileResponse(
        target, media_type=mime or "application/octet-stream", filename=target.name
    )
