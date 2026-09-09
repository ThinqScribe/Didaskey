"""Append-only shared drawing history with reversible hiding."""
from alembic import op
import sqlalchemy as sa
from app.db.migration_helpers import ensure_table, ensure_index
revision = "0009_shared_whiteboard"
down_revision = "0008_learning_attachments"
branch_labels = None
depends_on = None


def upgrade():
    ensure_table("board_strokes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("booking_id", sa.Integer(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client_id", sa.String(100), nullable=False),
        sa.Column("points", sa.JSON(), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("booking_id", "author_id", "client_id", name="uq_board_client"))
    ensure_index("ix_board_strokes_booking_id", "board_strokes", ["booking_id"])


def downgrade():
    op.drop_table("board_strokes")
