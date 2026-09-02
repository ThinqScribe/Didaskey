"""
SQLAlchemy declarative base.

type_annotation_map
-------------------
Maps Python ``datetime`` annotations to ``UTCDateTime`` so that *every*
``Mapped[datetime]`` column across all models automatically uses the
UTC-coercing type decorator.  This is especially important for SQLite,
which stores datetimes as plain strings and returns naive Python objects;
``UTCDateTime`` attaches ``timezone.utc`` on every read so that
timezone-aware comparisons in services always work correctly.
"""

from datetime import datetime

from sqlalchemy.orm import DeclarativeBase

from app.db.session import UTCDateTime


class Base(DeclarativeBase):
    type_annotation_map = {
        datetime: UTCDateTime,
    }
