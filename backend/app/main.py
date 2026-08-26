from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# Import all models so Base.metadata is fully populated before create_all runs
from app.models import (  # noqa: F401  — side-effect imports
    Booking,
    Refund,
    Review,
    Subject,
    Transaction,
    TutorAvailability,
    TutorProfile,
    TutorSubject,
    User,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


def _custom_openapi() -> dict:
    """
    Override the default OpenAPI schema to replace the OAuth2PasswordBearer
    scheme (which requires a 'username' field) with a plain HTTPBearer scheme.

    This gives Swagger UI a single 'Value' input box where you paste the
    JWT access token directly — no username/password confusion.
    """
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    # Replace every OAuth2 / password-flow scheme with a simple Bearer scheme
    security_schemes: dict = schema.get("components", {}).get("securitySchemes", {})
    for scheme_name, scheme_def in security_schemes.items():
        if scheme_def.get("type") == "oauth2":
            security_schemes[scheme_name] = {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": (
                    "Paste the **access_token** returned by "
                    "`POST /api/v1/auth/login` here."
                ),
            }

    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore[method-assign]


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "didaskey-api"}
