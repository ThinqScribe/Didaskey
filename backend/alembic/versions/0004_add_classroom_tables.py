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
