from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql+asyncpg://invoice_user:invoice_pass@localhost:5432/invoice_db"

    # Redis / ARQ
    redis_url: str = "redis://localhost:6379"

    # JWT — kept through the single-user build; Entra ID SSO is a pre-team-
    # rollout milestone, not a V1 build item (ARCHITECTURE-V2 Platforms section)
    secret_key: str = "dev-secret-key-replace-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Cookies
    cookie_secure: bool = False  # True in production (HTTPS only)
    cookie_domain: str | None = None

    # Document storage — local | azure_blob (see services/documents/storage.py)
    artifact_storage_root: str = "./artifacts"
    storage_backend: str = "local"
    storage_bucket: str | None = None  # Azure: container name
    storage_account_url: str | None = None  # Azure: https://<account>.blob.core.windows.net

    # Extraction provider — mock | anthropic | vision_llm
    #   mock       — deterministic test double, no key (local dev / tests)
    #   anthropic  — Claude via the Anthropic Messages API (the wired real path)
    #   vision_llm — OpenAI-compatible endpoint (Azure AI Foundry, decision-9
    #                bake-off — NOT yet validated; see .planning/HANDOFF.md)
    extraction_provider: str = "mock"
    anthropic_api_key: str | None = None  # anthropic provider
    llm_api_key: str | None = None  # vision_llm provider
    llm_base_url: str | None = None  # Azure Foundry endpoint, pending decision-9 bake-off
    llm_extraction_model: str = "claude-sonnet-5"
    llm_extraction_max_tokens: int = 4096

    # Email intake — Microsoft Graph only (ARCHITECTURE-V2 Platforms: Gmail/Nylas dropped)
    m365_tenant_id: str | None = None
    m365_client_id: str | None = None
    m365_client_secret: str | None = None
    intake_mailbox: str | None = None  # the single mailbox the Graph subscription watches
    graph_webhook_client_state: str | None = None  # validates inbound change notifications

    # Observability
    log_format: str = "json"  # json | text

    # App
    environment: str = "development"
    debug: bool = True

    # CORS — comma-separated origins. Default is the Vite dev server.
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


settings = Settings()
