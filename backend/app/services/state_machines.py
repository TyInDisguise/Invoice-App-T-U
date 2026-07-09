"""Invoice state machine. `assert_transition_allowed` raises StateTransitionError
on illegal moves — enforced before any status mutation (ARCHITECTURE-V2 decision 11).

V1 has no pending_approval / in_draw / paid states — every invoice routes to
review, and confirm+approve is a single reviewer action (decision 6). approved
and rejected are terminal; on_hold can return to review.
"""
from __future__ import annotations

from app.core.exceptions import DomainError


class StateTransitionError(DomainError):
    """Raised when a requested state transition is not allowed by the state machine."""


INVOICE_TRANSITIONS: dict[str, set[str]] = {
    "extraction_review": {"approved", "on_hold", "rejected"},
    "on_hold": {"extraction_review", "approved", "rejected"},
    "approved": set(),  # terminal — the confirmed-invoice ledger entry
    "rejected": set(),  # terminal
}


def assert_transition_allowed(
    machine: dict[str, set[str]],
    current_state: str,
    next_state: str,
    *,
    entity_label: str,
) -> None:
    allowed = machine.get(current_state, set())
    if next_state not in allowed:
        raise StateTransitionError(
            f"{entity_label}: cannot transition from {current_state!r} to {next_state!r}. "
            f"Allowed next states: {sorted(allowed) or 'none (terminal)'}"
        )
