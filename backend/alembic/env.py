from alembic import context
import asyncio
from sqlalchemy import pool, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.db.base import Base

# Import every model module so their tables are registered in Base.metadata
# before Alembic inspects it. Order matters for foreign-key dependencies:
# user must come before marketplace models that reference it.
from app.models import (  # noqa: F401  — side-effect imports
    Booking,
    Classroom,
    ClassroomParticipant,
    DayOfWeek,
    Refund,
    Review,
    Subject,
    TeachingMode,
    Transaction,
    TutorAvailability,
    TutorProfile,
    TutorSubject,
    User,
    VerificationStatus,
)
from app.models.user import EducationLevel  # ensure enum is registered in metadata

config = context.config

# Alembic configuration escapes percent signs in database URLs.
sync_url = settings.DATABASE_URL.replace("%", "%%")
config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    def migrate(connection):
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    url = make_url(settings.DATABASE_URL)
    if url.get_backend_name() == "sqlite":
        # SQLite schema changes do not need an asyncio worker thread.
        connectable = create_engine(url.set(drivername="sqlite+pysqlite"), poolclass=pool.NullPool)
        try:
            with connectable.connect() as connection:
                migrate(connection)
        finally:
            connectable.dispose()
        return
    async def run():
        connectable = async_engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
        async with connectable.connect() as connection:
            await connection.run_sync(migrate)
        await connectable.dispose()
    asyncio.run(run())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
