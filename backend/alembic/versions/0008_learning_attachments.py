"""Private lesson attachments, included in database backups."""
from alembic import op
import sqlalchemy as sa
from app.db.migration_helpers import ensure_table

revision = "0008_learning_attachments"
down_revision = "0007_message_receipts"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table("learning_attachments",
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("learning_items.id"), primary_key=True),
        sa.Column("filename", sa.String(160), nullable=False),
        sa.Column("media_type", sa.String(80), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("storage_driver", sa.String(20), nullable=False, server_default="database"),
        sa.Column("storage_key", sa.String(500), nullable=True),
        sa.Column("content", sa.LargeBinary(), nullable=False))


def downgrade():
    op.drop_table("learning_attachments")
