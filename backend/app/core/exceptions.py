class DomainError(Exception):
    """Base for all domain exceptions."""


class NotFoundError(DomainError):
    """Entity not found OR found but outside firm scope."""


class FirmScopeMissingError(DomainError):
    """A firm_scope was required but not provided. Indicates an API endpoint
    bypassed authentication scope; treat as a security bug."""


class StateTransitionError(DomainError):
    """An FSM transition was attempted from an invalid source state."""


class AuthenticationError(DomainError):
    """Caller is not authenticated or credentials are invalid. Maps to HTTP 401."""


class AuthorizationError(DomainError):
    """Caller is authenticated but lacks permission. Maps to HTTP 403."""
