"""
Database session factory.

Timezone handling
-----------------
PostgreSQL (production)
    We pin every connection to UTC via ``server_settings={"timezone":"UTC"}``.
    This ensures TIMESTAMPTZ columns are always returned as UTC-aware
    datetimes regardless of the server's local timezone.

SQLite (development / testing)
    SQLite has no native timezone support.  DateTime columns store plain
    strings and SQLAlchemy returns naive Python datetimes.  We register a
    custom ``UTCDateTime`` type decorator that transparently coerces every
    stored value to UTC-aware on read and strips tzinfo on write (so the
    stored string remains a clean ISO timestamp without an offset suffix
    that older SQLite versions cannot parse).

    NOTE: existing naive rows are assumed to already contain UTC values.
    Any row inserted with a local-time naive datetime will be
    misinterpreted — use explicit UTC offsets (or call .astimezone(utc))
    before persisting from application code.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, event
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.types import TypeDecorator

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── UTC type decorator (SQLite) ───────────────────────────────────────────────

class UTCDateTime(TypeDecorator):
    """
    A DateTime column that always returns UTC-aware datetimes.

    On write : converts to UTC then strips tzinfo so SQLite stores a clean
               ``YYYY-MM-DD HH:MM:SS`` string without an offset suffix.
               Naive values are assumed to already be UTC (legacy rows).
    On read  : attaches ``timezone.utc`` to the naive string SQLite returns,
               making every value UTC-aware without altering the stored bytes.
    """

    impl     = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            # Convert any tz-aware value (e.g. WAT +01:00) to UTC, then drop tzinfo.
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        # Naive values pass through as-is (assumed UTC).
        return value

    def process_result_value(self, value: datetime | str | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        # aiosqlite (and other async SQLite drivers) bypass the base DateTime
        # impl and hand us the raw "YYYY-MM-DD HH:MM:SS" string from the DB.
        # Parse it before attaching tzinfo.
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value)
            except ValueError:
                logger.warning("UTCDateTime: unexpected string value from DB: %r", value)
                return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


# ── Engine + session factory ──────────────────────────────────────────────────

_is_postgres = settings.DATABASE_URL.startswith("postgresql")
_is_sqlite   = settings.DATABASE_URL.startswith("sqlite")

# PostgreSQL: pin session timezone to UTC at the connection level.
_CONNECT_ARGS: dict = {}
if _is_postgres:
    _CONNECT_ARGS = {"server_settings": {"timezone": "UTC"}}

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=_CONNECT_ARGS,
)

if _is_sqlite:
    # SQLite has no native timezone support and its DateTime type returns naive
    # datetimes.  Override the dialect's colspec map on this engine's dialect
    # instance so every DateTime(timezone=True) column is transparently handled
    # by UTCDateTime — no model changes required.
    from sqlalchemy.dialects.sqlite.base import SQLiteDialect  # type: ignore[import-untyped]

    # Patch the instance (not the class) so other SQLite engines are unaffected.
    engine.dialect.colspecs = {  # type: ignore[attr-defined]
        **SQLiteDialect.colspecs,
        DateTime: UTCDateTime,
    }

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_utc_pragma(dbapi_conn, _connection_record):  # noqa: ANN001
        """Register a UTC helper function on each raw DBAPI connection."""
        dbapi_conn.create_function(
            "didaskey_now_utc", 0,
            lambda: datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        )

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
