"""Persist participant message read positions."""
from alembic import op
import sqlalchemy as sa
from app.db.migration_helpers import ensure_table

revision = "0007_message_receipts"
down_revision = "0006_auth_revocation"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table("message_receipts",
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("last_item_id", sa.Integer(), sa.ForeignKey("learning_items.id"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("message_receipts")
