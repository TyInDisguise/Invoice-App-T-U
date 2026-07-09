"""Artifact storage abstraction — trimmed to the two backends V1 needs.

`Storage` protocol + `LocalStorage` (dev) + `AzureBlobStorage` (production,
private containers — ARCHITECTURE-V2 Platforms section). `write_artifact` /
`read_artifact` / `resolve_url` are the seams every router/service uses;
swap backends via `settings.storage_backend`. Schema is storage-agnostic
(`attachment_ref` is an opaque string), so adding another backend later is a
new class, not a migration.

`resolve_url` never returns a permanent public link (decision: private blob
+ backend-streamed or short-lived signed URLs, ARCHITECTURE-V2 Security
section) — for Azure this means a short-lived SAS URL, not the raw blob URL.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

from app.core.config import settings

logger = logging.getLogger("app.storage")


class Storage(Protocol):
    name: str

    def write(
        self, *, firm_id: UUID, entity_type: str, entity_id: UUID, filename: str, data: bytes,
    ) -> str: ...

    def read(self, attachment_ref: str) -> bytes: ...

    def resolve_url(self, attachment_ref: str) -> str: ...


def _key_for(firm_id: UUID, entity_type: str, entity_id: UUID, filename: str) -> str:
    return f"{firm_id}/{entity_type}/{entity_id}/{uuid4().hex}__{filename}"


class LocalStorage:
    name = "local"

    def _root(self) -> Path:
        p = Path(settings.artifact_storage_root)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def write(
        self, *, firm_id: UUID, entity_type: str, entity_id: UUID, filename: str, data: bytes,
    ) -> str:
        rel_dir = Path(str(firm_id)) / entity_type / str(entity_id)
        abs_dir = self._root() / rel_dir
        abs_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f"{uuid4().hex}__{filename}"
        (abs_dir / unique_name).write_bytes(data)
        return str(rel_dir / unique_name)

    def read(self, attachment_ref: str) -> bytes:
        return (self._root() / attachment_ref).read_bytes()

    def resolve_url(self, attachment_ref: str) -> str:
        return f"/artifacts/{attachment_ref}"


class AzureBlobStorage:
    """Azure Blob-backed storage — private container, no public access.
    Credentials via DefaultAzureCredential (managed identity in Azure App
    Service/Container Apps; az login locally) — never a connection string in
    code (ARCHITECTURE-V2 Security decision: secrets in Key Vault / managed
    identity, not source).
    """

    name = "azure_blob"

    def __init__(self) -> None:
        self._container_client: object | None = None

    def _require_container(self):  # noqa: ANN202
        if self._container_client is not None:
            return self._container_client
        if not settings.storage_bucket:
            raise RuntimeError("AzureBlobStorage requires settings.storage_bucket (container name)")
        try:
            from azure.identity import DefaultAzureCredential
            from azure.storage.blob import BlobServiceClient
        except ImportError as e:
            raise RuntimeError(
                "AzureBlobStorage requires `pip install azure-storage-blob azure-identity`"
            ) from e
        if not settings.storage_account_url:
            raise RuntimeError("AzureBlobStorage requires settings.storage_account_url")
        client = BlobServiceClient(
            account_url=settings.storage_account_url, credential=DefaultAzureCredential(),
        )
        self._container_client = client.get_container_client(settings.storage_bucket)
        return self._container_client

    def write(
        self, *, firm_id: UUID, entity_type: str, entity_id: UUID, filename: str, data: bytes,
    ) -> str:
        container = self._require_container()
        key = _key_for(firm_id, entity_type, entity_id, filename)
        container.upload_blob(name=key, data=data, overwrite=False)  # type: ignore[union-attr]
        return key

    def read(self, attachment_ref: str) -> bytes:
        container = self._require_container()
        return container.download_blob(attachment_ref).readall()  # type: ignore[union-attr]

    def resolve_url(self, attachment_ref: str) -> str:
        from azure.storage.blob import BlobSasPermissions, generate_blob_sas

        container = self._require_container()
        sas = generate_blob_sas(
            account_name=container.account_name,  # type: ignore[union-attr]
            container_name=container.container_name,  # type: ignore[union-attr]
            blob_name=attachment_ref,
            permission=BlobSasPermissions(read=True),
            expiry=__import__("datetime").datetime.utcnow() + timedelta(minutes=15),
        )
        return f"{container.url}/{attachment_ref}?{sas}"  # type: ignore[union-attr]


_REGISTRY: dict[str, Storage] = {
    "local": LocalStorage(),
    "azure_blob": AzureBlobStorage(),
}


def _backend() -> Storage:
    return _REGISTRY.get(settings.storage_backend, _REGISTRY["local"])


def write_artifact(*, firm_id: UUID, entity_type: str, entity_id: UUID, filename: str, data: bytes) -> str:
    return _backend().write(firm_id=firm_id, entity_type=entity_type, entity_id=entity_id, filename=filename, data=data)


def read_artifact(attachment_ref: str) -> bytes:
    return _backend().read(attachment_ref)


def resolve_url(attachment_ref: str) -> str:
    return _backend().resolve_url(attachment_ref)
