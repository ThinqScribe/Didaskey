from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

# Always resolve .env relative to this file (backend/app/core/config.py → backend/.env)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    APP_NAME: str = "Didaskey API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = ""
    FRONTEND_URL: str = "http://localhost:8081"
    CORS_ORIGINS: str = ""
    IMAGEBB_API_KEY: str = ""

    # ── Private file storage ────────────────────────────────────────────────
    FILE_STORAGE_DRIVER: str = "database"
    """Attachment storage backend: "database" for local/test, "r2" for Cloudflare R2."""

    R2_BUCKET: str = ""
    R2_ENDPOINT: str = ""
    R2_REGION: str = "auto"
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""

    # ── Paystack ──────────────────────────────────────────────────────────────
    PAYSTACK_SECRET_KEY: str =""
    """Server-side Paystack secret key (sk_live_… or sk_test_…). Never exposed to clients."""

    PAYSTACK_WEBHOOK_SECRET: str =""
    """Legacy setting, ignored. Paystack signs with PAYSTACK_SECRET_KEY."""

    # ── LiveKit (video classroom) ─────────────────────────────────────────────
    LIVEKIT_URL: str = ""
    """LiveKit server WebSocket URL, e.g. wss://my-project.livekit.cloud"""

    LIVEKIT_API_KEY: str = ""
    """LiveKit API key from your LiveKit Cloud project or self-hosted server."""

    LIVEKIT_API_SECRET: str = ""
    """LiveKit API secret — server-side only, never sent to clients."""

    CLASSROOM_JOIN_BEFORE_MINUTES: int = 10
    """How many minutes before the scheduled start a classroom may be joined."""

    CLASSROOM_JOIN_GRACE_MINUTES: int = 30
    """How many minutes after the scheduled end time the classroom stays joinable."""

    # ── Testing Configuration ────────────────────────────────────────────────
    SKIP_TUTOR_AVAILABILITY_CHECK: bool = False
    """
    When True, tutors can be booked at any time regardless of their availability settings.
    Useful for testing. Set to False in production to enforce availability windows.
    """

    CLASSROOM_TOKEN_TTL_MINUTES: int = 180
    """Validity window of an issued LiveKit access token."""

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), case_sensitive=False, extra="ignore")

    @model_validator(mode="after")
    def production_settings(self):
        if self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        elif self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

        if self.ENVIRONMENT == "production":
            if self.DEBUG or len(self.SECRET_KEY) < 32:
                raise ValueError("Production requires DEBUG=false and a SECRET_KEY of at least 32 characters")
            if not self.cors_origin_list or "*" in self.cors_origin_list:
                raise ValueError("Production requires explicit CORS_ORIGINS")
            if not self.DATABASE_URL.startswith("postgresql+asyncpg://"):
                raise ValueError("Production requires PostgreSQL with the asyncpg driver")
            if not self.FRONTEND_URL.startswith("https://"):
                raise ValueError("Production requires an HTTPS FRONTEND_URL")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
