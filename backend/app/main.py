from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import HTTPException
from sqlalchemy import text, inspect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.router import api_router
from app.core.config import settings
from app.core.request_limits import RequestBodyLimit
from app.db.base import Base
from app.db.session import engine

# Import all models so Base.metadata is fully populated before create_all runs
from app.models import (  # noqa: F401  — side-effect imports
    Booking,
    Classroom,
    ClassroomParticipant,
    PushDevice,
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
    async with engine.connect() as connection:
        def validate_schema(sync_connection):
            inspector = inspect(sync_connection)
            if not inspector.has_table("users") or "token_version" not in {c["name"] for c in inspector.get_columns("users")}:
                raise RuntimeError("Database migrations are missing. Back up the database, then run 'alembic upgrade head' from the backend directory before starting the API.")
        await connection.run_sync(validate_schema)
    yield
    await engine.dispose()


app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)
app.add_middleware(RequestBodyLimit)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:8081"],
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


@app.get("/ready", tags=["system"])
async def ready() -> dict:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(503, "Database unavailable") from exc
    return {"status": "ready"}
