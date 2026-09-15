"""Store mobile push notification device tokens."""

from alembic import op
import sqlalchemy as sa

from app.db.migration_helpers import ensure_index, ensure_table


revision = "0013_push_devices"
down_revision = "0012_message_delivery_receipts"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table(
        "push_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("device_id", sa.String(120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("token", name="uq_push_devices_token"),
    )
    ensure_index("ix_push_devices_user_id", "push_devices", ["user_id"])


def downgrade():
    op.drop_table("push_devices")
