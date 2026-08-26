"""add_billing_tables

Adds three tables that form the booking and payment layer:

  bookings      — one session request per student/tutor pair per time slot
  transactions  — one Paystack payment record per booking (one-to-one)
  refunds       — refund ledger entries linked to a transaction

Security notes in this migration
---------------------------------
- ``paystack_reference`` carries a UNIQUE constraint so a replayed webhook
  cannot match multiple transactions.
- ``amount`` columns use NUMERIC(10, 2) to avoid floating-point errors.
- Foreign keys use RESTRICT on bookings so accidental user/tutor deletion
  does not silently cascade money records; SET NULL is used for the optional
  subject FK so removing a subject does not break existing bookings.

Revision ID: 0003_add_billing_tables
Revises: 55c221e21c3e
Create Date: 2026-08-25
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "0003_add_billing_tables"
down_revision: Union[str, Sequence[str], None] = "55c221e21c3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── upgrade ───────────────────────────────────────────────────────────────────


def upgrade() -> None:

    # ── bookings ──────────────────────────────────────────────────────────────
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), nullable=False),

        # Participants
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("tutor_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),

        # Session details
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("session_format", sa.String(length=20), nullable=False, server_default="online"),
        sa.Column("student_note", sa.Text(), nullable=True),

        # Pricing snapshot
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"),

        # Status
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="pending_payment",
        ),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),

        # Timestamps
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

        # Constraints
        sa.CheckConstraint("amount > 0", name="ck_booking_amount_positive"),
        sa.CheckConstraint("duration_minutes >= 30", name="ck_booking_min_duration"),
        sa.ForeignKeyConstraint(
            ["student_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["tutor_id"], ["tutor_profiles.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"], ["subjects.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Indexes on bookings
    op.create_index(
        "ix_bookings_student_status",
        "bookings",
        ["student_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_bookings_tutor_status",
        "bookings",
        ["tutor_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_bookings_scheduled_at",
        "bookings",
        ["scheduled_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookings_student_id"),
        "bookings",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookings_tutor_id"),
        "bookings",
        ["tutor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookings_status"),
        "bookings",
        ["status"],
        unique=False,
    )

    # ── transactions ──────────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),

        # Paystack identifiers
        sa.Column("paystack_reference", sa.String(length=100), nullable=False),
        sa.Column("paystack_access_code", sa.String(length=200), nullable=True),
        sa.Column("paystack_transaction_id", sa.String(length=100), nullable=True),

        # Money
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"),

        # Status & metadata
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("gateway_response", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),

        # Timestamps
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

        # Constraints
        sa.CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id", name="uq_transaction_booking"),
        sa.UniqueConstraint("paystack_reference", name="uq_transaction_reference"),
    )

    op.create_index(
        op.f("ix_transactions_booking_id"),
        "transactions",
        ["booking_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_transactions_paystack_reference"),
        "transactions",
        ["paystack_reference"],
        unique=True,
    )
    op.create_index(
        op.f("ix_transactions_paystack_transaction_id"),
        "transactions",
        ["paystack_transaction_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transactions_status"),
        "transactions",
        ["status"],
        unique=False,
    )

    # ── refunds ───────────────────────────────────────────────────────────────
    op.create_table(
        "refunds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("paystack_refund_id", sa.String(length=100), nullable=True),

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

        sa.CheckConstraint("amount > 0", name="ck_refund_amount_positive"),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["transactions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paystack_refund_id", name="uq_refund_paystack_id"),
    )

    op.create_index(
        "ix_refunds_transaction_id",
        "refunds",
        ["transaction_id"],
        unique=False,
    )


# ── downgrade ─────────────────────────────────────────────────────────────────


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("ix_refunds_transaction_id", table_name="refunds")
    op.drop_table("refunds")

    op.drop_index(op.f("ix_transactions_status"), table_name="transactions")
    op.drop_index(
        op.f("ix_transactions_paystack_transaction_id"), table_name="transactions"
    )
    op.drop_index(
        op.f("ix_transactions_paystack_reference"), table_name="transactions"
    )
    op.drop_index(op.f("ix_transactions_booking_id"), table_name="transactions")
    op.drop_table("transactions")

    op.drop_index(op.f("ix_bookings_status"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_tutor_id"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_student_id"), table_name="bookings")
    op.drop_index("ix_bookings_scheduled_at", table_name="bookings")
    op.drop_index("ix_bookings_tutor_status", table_name="bookings")
    op.drop_index("ix_bookings_student_status", table_name="bookings")
    op.drop_table("bookings")
