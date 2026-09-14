"""Add object storage metadata for learning attachments."""

from alembic import op
import sqlalchemy as sa


revision = "0011_attachment_object_storage"
down_revision = "0010_chat_message_metadata"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if not _has_column("learning_attachments", "storage_driver"):
        op.add_column(
            "learning_attachments",
            sa.Column("storage_driver", sa.String(20), nullable=False, server_default="database"),
        )
    if not _has_column("learning_attachments", "storage_key"):
        op.add_column("learning_attachments", sa.Column("storage_key", sa.String(500), nullable=True))


def downgrade():
    if _has_column("learning_attachments", "storage_key"):
        op.drop_column("learning_attachments", "storage_key")
    if _has_column("learning_attachments", "storage_driver"):
        op.drop_column("learning_attachments", "storage_driver")
