"""Persist quarantined events and retry state.

Revision ID: 003_dead_letter_events
Revises: 002_runtime_indexes_and_seed
"""
from alembic import op
import sqlalchemy as sa

revision = "003_dead_letter_events"
down_revision = "002_runtime_indexes_and_seed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dead_letter_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("original_event_id", sa.String(length=64), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("quarantined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retried_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("original_event_id", name="uq_dead_letter_original_event"),
    )
    op.create_index("ix_dead_letter_quarantined_at", "dead_letter_events", ["quarantined_at"])


def downgrade() -> None:
    op.drop_index("ix_dead_letter_quarantined_at", table_name="dead_letter_events")
    op.drop_table("dead_letter_events")
