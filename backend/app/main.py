from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse

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


_STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)

# Add CORS middleware to allow WebView and web clients to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list if settings.cors_origin_list else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/classroom.html", include_in_schema=False)
async def serve_classroom_shell() -> FileResponse:
    """
    Serve the classroom WebView shell as a real HTTP document.

    Loading it via a proper http:// URL (instead of as inline HTML which
    renders as a data: URI) gives the page a real origin so that
    navigator.mediaDevices.getUserMedia works on both iOS and Android.
    The page contains no secrets — LiveKit credentials are injected by the
    React Native WebView via injectedJavaScriptBeforeContentLoaded.
    """
    return FileResponse(
        _STATIC_DIR / "classroom.html",
        media_type="text/html",
        headers={
            # Prevent the shell from being cached — the RN app always needs
            # the latest version without a hard-refresh mechanism.
            "Cache-Control": "no-store",
        },
    )


@app.get("/livekit_test.html", include_in_schema=False)
async def serve_livekit_test() -> FileResponse:
    """Serve the LiveKit connection diagnostic page."""
    return FileResponse(
        _STATIC_DIR / "livekit_test.html",
        media_type="text/html",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/debug_availability.html", include_in_schema=False)
async def serve_debug_availability() -> FileResponse:
    """Serve the availability debug page."""
    return FileResponse(
        _STATIC_DIR / "debug_availability.html",
        media_type="text/html",
        headers={"Cache-Control": "no-store"},
    )


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
