from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class IdentityMixin:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FirmScopedMixin:
    @declared_attr
    def firm_id(cls) -> Mapped[UUID]:  # noqa: N805
        return mapped_column(
            ForeignKey("firms.id"), nullable=False, index=True,
        )


class SoftDeleteMixin:
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")


class AuditableMixin:
    @declared_attr
    def created_by_id(cls) -> Mapped[UUID | None]:  # noqa: N805
        return mapped_column(ForeignKey("firm_users.id"), nullable=True)
