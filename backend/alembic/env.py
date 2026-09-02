from alembic import context
from sqlalchemy import engine_from_config, pool

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

# Swap async driver to sync for Alembic (aiosqlite -> pysqlite)
sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("%", "%%")
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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
