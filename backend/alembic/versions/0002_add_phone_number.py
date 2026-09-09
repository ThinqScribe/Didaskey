"""add phone number to users

Revision ID: 0002_add_phone_number
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_add_phone_number"
down_revision = "0001_users_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_number", sa.String(length=20), nullable=True))
    op.create_index("ix_users_phone_number", "users", ["phone_number"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_phone_number", table_name="users")
    op.drop_column("users", "phone_number")
