from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Supabase
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str | None = None

    # LLM (LM Studio, Tailnet)
    local_base_url: str = "http://100.122.52.86:1234/v1"
    local_model: str = "google/gemma-4-e2b"
    local_api_key: str = "lm-studio"

    # Embeddings
    embedding_base_url: str = "http://100.122.52.86:1234/v1"
    embedding_model: str = "bge-m3"
    embedding_api_key: str = "lm-studio"

    # OpenAI (audio)
    openai_api_key: str | None = None

    # Tavily (web search for the agent)
    tavily_api_key: str | None = None

    # Web push
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_email: str = "admin@restart-time.app"

    # Google Calendar
    enable_calendar: bool = False
    calendar_encryption_key: str | None = None

    # Server
    port: int = 8000
    env: str = "development"
    allowed_origins: str = "http://localhost:5173"

    # Feature flags
    enable_rag: bool = True
    enable_reminders: bool = False
    enable_planning_flow: bool = True

    # Dev bypass — when set, the auth dependency returns this user_id and
    # skips JWT verification entirely. Use only for local demos. The user
    # MUST already exist in auth.users (Supabase) for FKs to resolve.
    dev_user_id: str | None = None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def audio_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def web_search_enabled(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/keys"

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
