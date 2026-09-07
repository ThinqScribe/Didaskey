from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# Import all models so Base.metadata is fully populated before create_all runs
from app.models import (  # noqa: F401  — side-effect imports
    Booking,
    Classroom,
    ClassroomParticipant,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list if settings.cors_origin_list else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


def _custom_openapi() -> dict:
    """
    Replace the OAuth2PasswordBearer scheme with a plain HTTPBearer so
    Swagger UI shows a single 'Value' input box for pasting a JWT.
    """
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

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
async def health() -> dict:
    return {"status": "ok"}
