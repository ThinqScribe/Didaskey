"""
Unit tests for the pure join-window calculation in classroom_service.

These deliberately avoid the database — `compute_window` is a pure
function of (scheduled_at, duration_minutes, settings) so it can be
tested without any async session / fixtures.
"""

from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.services.classroom_service import compute_window


def test_window_opens_before_scheduled_start() -> None:
    scheduled_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    opens_at, _closes_at = compute_window(scheduled_at, duration_minutes=60)

    assert opens_at == scheduled_at - timedelta(
        minutes=settings.CLASSROOM_JOIN_BEFORE_MINUTES
    )


def test_window_closes_after_scheduled_end_plus_grace() -> None:
    scheduled_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    duration_minutes = 60
    _opens_at, closes_at = compute_window(scheduled_at, duration_minutes)

    expected_end = scheduled_at + timedelta(
        minutes=duration_minutes + settings.CLASSROOM_JOIN_GRACE_MINUTES
    )
    assert closes_at == expected_end


def test_window_accepts_naive_datetime_as_utc() -> None:
    naive = datetime(2026, 1, 1, 12, 0)
    aware = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    assert compute_window(naive, 60) == compute_window(aware, 60)


def test_longer_sessions_get_a_longer_window() -> None:
    scheduled_at = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    _opens_short, closes_short = compute_window(scheduled_at, duration_minutes=30)
    _opens_long, closes_long = compute_window(scheduled_at, duration_minutes=120)

    assert closes_long > closes_short
