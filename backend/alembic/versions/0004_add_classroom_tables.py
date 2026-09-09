"""add_classroom_tables

Adds the live video classroom layer:

  classrooms              — one video room per online booking (1:1)
  classroom_participants  — join/leave audit log, one row per join event

Design notes
------------
- ``room_name`` carries a UNIQUE constraint; it is deterministically
  derived from the booking id, so retries never create duplicate rooms.
- ``booking_id`` on ``classrooms`` is UNIQUE — one classroom per booking.
- Both new tables cascade-delete with their parent (booking / classroom)
  since they are purely operational/audit data, not financial records.

Revision ID: 0004_add_classroom_tables
Revises: a8760d6ddd8a
Create Date: 2026-08-31
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "0004_add_classroom_tables"
down_revision: Union[str, Sequence[str], None] = "a8760d6ddd8a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── upgrade ───────────────────────────────────────────────────────────────────


def upgrade() -> None:
    # Older development servers used create_all without advancing Alembic.
    # Adopt only a complete, structurally compatible pair of tables.
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if {"classrooms", "classroom_participants"} & tables:
        expected = {
            "classrooms": {"id", "booking_id", "room_name", "status", "started_at", "ended_at", "recording_url", "created_at", "updated_at"},
            "classroom_participants": {"id", "classroom_id", "user_id", "role", "joined_at", "left_at"},
        }
        for table, columns in expected.items():
            if table not in tables or {c["name"] for c in inspector.get_columns(table)} != columns:
                raise RuntimeError(f"Existing {table} schema requires manual reconciliation; no tables were overwritten")
            if inspector.get_pk_constraint(table)["constrained_columns"] != ["id"]:
                raise RuntimeError(f"Existing {table} primary key is incompatible")
        unique = {tuple(c["column_names"]) for c in inspector.get_unique_constraints("classrooms")}
        unique |= {tuple(i["column_names"]) for i in inspector.get_indexes("classrooms") if i["unique"]}
        if not {("booking_id",), ("room_name",)} <= unique:
            raise RuntimeError("Existing classroom uniqueness constraints require reconciliation")
        for table, expected_fks in {"classrooms": {("booking_id", "bookings", "id")}, "classroom_participants": {("classroom_id", "classrooms", "id"), ("user_id", "users", "id")}}.items():
            actual = {(f["constrained_columns"][0], f["referred_table"], f["referred_columns"][0]) for f in inspector.get_foreign_keys(table)}
            if not expected_fks <= actual:
                raise RuntimeError(f"Existing {table} foreign keys require reconciliation")
        return

    # ── classrooms ────────────────────────────────────────────────────────────
    op.create_table(
        "classrooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("room_name", sa.String(length=150), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recording_url", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id", name="uq_classroom_booking"),
        sa.UniqueConstraint("room_name", name="uq_classroom_room_name"),
    )

    op.create_index(
        op.f("ix_classrooms_booking_id"), "classrooms", ["booking_id"], unique=True
    )
    op.create_index(
        op.f("ix_classrooms_room_name"), "classrooms", ["room_name"], unique=True
    )

    # ── classroom_participants ───────────────────────────────────────────────
    op.create_table(
        "classroom_participants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("classroom_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_classroom_participants_classroom_id"),
        "classroom_participants",
        ["classroom_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_classroom_participants_user_id"),
        "classroom_participants",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_classroom_participants_classroom_user",
        "classroom_participants",
        ["classroom_id", "user_id"],
        unique=False,
    )


# ── downgrade ─────────────────────────────────────────────────────────────────


def downgrade() -> None:
    op.drop_index(
        "ix_classroom_participants_classroom_user", table_name="classroom_participants"
    )
    op.drop_index(
        op.f("ix_classroom_participants_user_id"), table_name="classroom_participants"
    )
    op.drop_index(
        op.f("ix_classroom_participants_classroom_id"), table_name="classroom_participants"
    )
    op.drop_table("classroom_participants")

    op.drop_index(op.f("ix_classrooms_room_name"), table_name="classrooms")
    op.drop_index(op.f("ix_classrooms_booking_id"), table_name="classrooms")
    op.drop_table("classrooms")
