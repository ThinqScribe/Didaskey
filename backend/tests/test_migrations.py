import sqlite3
from alembic import command
from alembic.config import Config
from app.core.config import settings


def test_fresh_install_and_learning_upgrade(tmp_path, monkeypatch):
    path = tmp_path / "migration.db"
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    config = Config("alembic.ini")
    command.upgrade(config, "0004_add_classroom_tables")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users (email, hashed_password, role, first_name, last_name, is_active, is_verified) VALUES ('existing@example.com', 'unused', 'student', 'Existing', 'Student', 1, 1)")
    command.upgrade(config, "head")
    with sqlite3.connect(path) as db:
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"users", "bookings", "learning_items", "learning_submissions", "notifications", "message_receipts", "learning_attachments", "board_strokes"} <= tables
        assert db.execute("SELECT email FROM users").fetchone()[0] == "existing@example.com"


def test_adopts_existing_development_classrooms(tmp_path, monkeypatch):
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    config = Config("alembic.ini")
    command.upgrade(config, "0004_add_classroom_tables")
    with sqlite3.connect(path) as db:
        db.execute("UPDATE alembic_version SET version_num='a8760d6ddd8a'")
    command.upgrade(config, "head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0009_shared_whiteboard"


def test_upgrade_after_create_all_left_new_tables_but_old_users(tmp_path, monkeypatch):
    from sqlalchemy import create_engine
    from app.db.base import Base
    path = tmp_path / "partially_created.db"
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    config = Config("alembic.ini")
    command.upgrade(config, "a8760d6ddd8a")
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    engine.dispose()
    with sqlite3.connect(path) as db:
        assert "token_version" not in {row[1] for row in db.execute("PRAGMA table_info(users)")}
    command.upgrade(config, "head")
    with sqlite3.connect(path) as db:
        assert "token_version" in {row[1] for row in db.execute("PRAGMA table_info(users)")}
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0009_shared_whiteboard"
