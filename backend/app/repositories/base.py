from __future__ import annotations

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import FirmScopeMissingError, NotFoundError
from app.models.base import Base
from app.models.mixins import FirmScopedMixin, SoftDeleteMixin

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepo(Generic[ModelT]):
    model: type[ModelT]

    def __init_subclass__(cls, **kw: Any) -> None:
        super().__init_subclass__(**kw)
        if not hasattr(cls, "model"):
            return  # abstract subclass
        cls._is_firm_scoped: bool = issubclass(cls.model, FirmScopedMixin)
        cls._is_soft_deletable: bool = issubclass(cls.model, SoftDeleteMixin)

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---- public API: scoped + soft-delete-filtered ----
    async def list(self, firm_scope: UUID | None, **filters: Any) -> list[ModelT]:
        return await self._list(firm_scope, include_inactive=False, **filters)

    async def list_including_inactive(
        self, firm_scope: UUID | None, **filters: Any
    ) -> list[ModelT]:
        return await self._list(firm_scope, include_inactive=True, **filters)

    async def get(self, firm_scope: UUID | None, id: UUID) -> ModelT:
        self._require_scope(firm_scope)
        stmt = select(self.model).where(self.model.id == id)  # type: ignore[attr-defined]
        if self._is_firm_scoped and firm_scope is not None:
            stmt = stmt.where(self.model.firm_id == firm_scope)  # type: ignore[attr-defined]
        obj = (await self.session.execute(stmt)).scalar_one_or_none()
        if obj is None:
            raise NotFoundError(
                f"{self.model.__name__} {id} not found in firm scope {firm_scope}"
            )
        return obj

    async def find(self, firm_scope: UUID | None, **filters: Any) -> ModelT | None:
        results = await self._list(firm_scope, include_inactive=False, **filters)
        return results[0] if results else None

    async def create(self, firm_scope: UUID | None, **kwargs: Any) -> ModelT:
        self._require_scope(firm_scope)
        if self._is_firm_scoped and firm_scope is not None and "firm_id" not in kwargs:
            kwargs["firm_id"] = firm_scope
        obj = self.model(**kwargs)
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def soft_delete(self, firm_scope: UUID | None, id: UUID) -> ModelT:
        if not self._is_soft_deletable:
            raise NotImplementedError(f"{self.model.__name__} is not soft-deletable")
        obj = await self.get(firm_scope, id)
        obj.is_active = False  # type: ignore[attr-defined]
        await self.session.flush()
        return obj

    # ---- explicit cross-firm escape hatches (audit/admin tooling only) ----
    async def _unsafe_cross_firm_list(self, **filters: Any) -> list[ModelT]:
        return await self._list(
            firm_scope=None, include_inactive=True, _bypass_scope=True, **filters
        )

    async def _unsafe_cross_firm_get(self, id: UUID) -> ModelT:
        stmt = select(self.model).where(self.model.id == id)  # type: ignore[attr-defined]
        obj = (await self.session.execute(stmt)).scalar_one_or_none()
        if obj is None:
            raise NotFoundError(f"{self.model.__name__} {id} not found (cross-firm)")
        return obj

    # ---- internal ----
    def _require_scope(self, firm_scope: UUID | None) -> None:
        if self._is_firm_scoped and firm_scope is None:
            raise FirmScopeMissingError(
                f"{self.model.__name__} requires firm_scope; got None. "
                "Use _unsafe_cross_firm_* if intentional (audit/admin only)."
            )

    async def _list(
        self,
        firm_scope: UUID | None,
        *,
        include_inactive: bool,
        _bypass_scope: bool = False,
        **filters: Any,
    ) -> list[ModelT]:
        if not _bypass_scope:
            self._require_scope(firm_scope)
        stmt = select(self.model)
        if self._is_firm_scoped and firm_scope is not None and not _bypass_scope:
            stmt = stmt.where(self.model.firm_id == firm_scope)  # type: ignore[attr-defined]
        if self._is_soft_deletable and not include_inactive:
            stmt = stmt.where(self.model.is_active.is_(True))  # type: ignore[attr-defined]
        for k, v in filters.items():
            stmt = stmt.where(getattr(self.model, k) == v)
        return list((await self.session.execute(stmt)).scalars().all())
