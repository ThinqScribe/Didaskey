"""Restore the missing users baseline for fresh installations.

Existing databases that predate migrations may already have this table.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_users_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    if "users" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table("users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("student", "parent", "tutor", "admin", name="userrole"), nullable=False),
        sa.Column("first_name", sa.String(50), nullable=False),
        sa.Column("last_name", sa.String(50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade():
    raise RuntimeError("The users baseline is not reversible; restore a backup to remove accounts")
