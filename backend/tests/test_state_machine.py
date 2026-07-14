"""Pure-unit tests for the invoice state machine (services/state_machines.py).

No DB — `assert_transition_allowed` is deterministic table lookup. Guards the
decision-11 rule that every status mutation is validated first: extraction_review
is the only non-terminal entry, on_hold can return to review, approved/rejected
are terminal.
"""
from __future__ import annotations

import pytest

from app.core.exceptions import DomainError
from app.services.state_machines import (
    INVOICE_TRANSITIONS,
    StateTransitionError,
    assert_transition_allowed,
)


def _assert(current: str, nxt: str) -> None:
    assert_transition_allowed(
        INVOICE_TRANSITIONS, current, nxt, entity_label="invoice"
    )


@pytest.mark.parametrize("nxt", ["approved", "on_hold", "rejected"])
def test_extraction_review_allows_all_forward_moves(nxt: str):
    _assert("extraction_review", nxt)  # does not raise


@pytest.mark.parametrize("nxt", ["extraction_review", "approved", "rejected"])
def test_on_hold_can_return_or_resolve(nxt: str):
    _assert("on_hold", nxt)  # does not raise


def test_review_to_unknown_state_is_rejected():
    # V1 has no pending_approval / in_draw / paid states (decision 6).
    with pytest.raises(StateTransitionError):
        _assert("extraction_review", "paid")


def test_review_cannot_self_loop():
    with pytest.raises(StateTransitionError):
        _assert("extraction_review", "extraction_review")


@pytest.mark.parametrize("terminal", ["approved", "rejected"])
@pytest.mark.parametrize("nxt", ["extraction_review", "on_hold", "approved", "rejected"])
def test_terminal_states_allow_nothing(terminal: str, nxt: str):
    with pytest.raises(StateTransitionError):
        _assert(terminal, nxt)


def test_terminal_error_message_names_no_allowed_states():
    with pytest.raises(StateTransitionError, match="none \\(terminal\\)"):
        _assert("approved", "on_hold")


def test_unknown_current_state_is_rejected():
    # machine.get(unknown) -> empty set -> nothing allowed
    with pytest.raises(StateTransitionError):
        _assert("some_bogus_state", "approved")


def test_error_is_a_domain_error():
    # Routers map DomainError subclasses to 4xx; make sure this stays in that tree.
    assert issubclass(StateTransitionError, DomainError)
