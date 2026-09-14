"""Add chat reply and metadata fields to learning items."""

from alembic import op
import sqlalchemy as sa


revision = "0010_chat_message_metadata"
down_revision = "0009_shared_whiteboard"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if not _has_column("learning_items", "reply_to_item_id"):
        op.add_column("learning_items", sa.Column("reply_to_item_id", sa.Integer(), nullable=True))
    if not _has_column("learning_items", "extra"):
        op.add_column("learning_items", sa.Column("extra", sa.JSON(), nullable=True))


def downgrade():
    if _has_column("learning_items", "extra"):
        op.drop_column("learning_items", "extra")
    if _has_column("learning_items", "reply_to_item_id"):
        op.drop_column("learning_items", "reply_to_item_id")
