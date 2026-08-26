from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = ""
    IMAGEBB_API_KEY: str = ""

    # ── Paystack ──────────────────────────────────────────────────────────────
    PAYSTACK_SECRET_KEY: str =""
    """Server-side Paystack secret key (sk_live_… or sk_test_…). Never exposed to clients."""

    PAYSTACK_WEBHOOK_SECRET: str =""
    """
    The HMAC-SHA512 secret used to verify Paystack webhook signatures.
    Set this to the same value configured in the Paystack dashboard.
    """

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), case_sensitive=False, extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
