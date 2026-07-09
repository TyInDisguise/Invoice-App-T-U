"""Enum constraint helpers for the Python-Enum + String + CHECK pattern.

Always use enum_check_constraint() — never sa.Enum(..., native_enum=True).
Native PostgreSQL ENUM types require ALTER TYPE for value changes (locks the table
briefly); CHECK constraints can be dropped+recreated in a normal migration.
"""
from enum import Enum

from sqlalchemy import CheckConstraint


def enum_check_constraint(
    enum_cls: type[Enum], column_name: str, name: str | None = None
) -> CheckConstraint:
    """Build a CHECK constraint restricting `column_name` to the enum's value set.

    Use with String columns. Pattern (per CONTEXT.md):
        class Invoice(Base, ...):
            status: Mapped[str] = mapped_column(String(40), nullable=False)
            __table_args__ = (
                enum_check_constraint(InvoiceStatus, "status", name="status_valid"),
            )
    """
    values = "', '".join(e.value for e in enum_cls)
    constraint_name = name or f"{column_name}_in_enum"
    return CheckConstraint(
        f"{column_name} IN ('{values}')",
        name=constraint_name,
    )
