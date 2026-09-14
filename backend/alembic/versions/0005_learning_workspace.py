"""Persist session learning activity and notifications."""
from alembic import op
import sqlalchemy as sa
from app.db.migration_helpers import ensure_table, ensure_index

revision = "0005_learning_workspace"
down_revision = "0004_add_classroom_tables"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table("learning_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("url", sa.String(2000)),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("client_id", sa.String(100)),
        sa.Column("reply_to_item_id", sa.Integer()),
        sa.Column("extra", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("author_id", "client_id", name="uq_learning_client"))
    for name in ("booking_id", "author_id", "kind"):
        ensure_index(f"ix_learning_items_{name}", "learning_items", [name])
    ensure_table("learning_submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("learning_items.id"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("feedback", sa.Text()), sa.Column("score", sa.Integer()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"))
    for name in ("assignment_id", "student_id"):
        ensure_index(f"ix_learning_submissions_{name}", "learning_submissions", [name])
    ensure_table("notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False), sa.Column("body", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id")),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    ensure_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade():
    op.drop_table("notifications")
    op.drop_table("learning_submissions")
    op.drop_table("learning_items")
