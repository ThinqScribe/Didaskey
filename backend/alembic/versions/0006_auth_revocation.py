"""Revoke existing sessions after password changes and explicit sign-out."""
from alembic import op
import sqlalchemy as sa

revision = "0006_auth_revocation"
down_revision = "0005_learning_workspace"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("users", "token_version")
