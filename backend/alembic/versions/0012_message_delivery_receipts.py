"""Track delivered message receipts separately from reads."""

from alembic import op
import sqlalchemy as sa

from app.db.migration_helpers import ensure_table


revision = "0012_message_delivery_receipts"
down_revision = "0011_attachment_object_storage"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table(
        "message_delivery_receipts",
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("last_item_id", sa.Integer(), sa.ForeignKey("learning_items.id"), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("message_delivery_receipts")
