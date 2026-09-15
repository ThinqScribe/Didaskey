"""In-app, email, and push notification workflows."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable

import httpx
import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_lesson_reminder_email
from app.models import Booking, BookingStatus, User
from app.models.learning import Notification, PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_push_table_available: bool | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _has_push_devices_table(db: AsyncSession) -> bool:
    global _push_table_available
    if _push_table_available is not None:
        return _push_table_available
    connection = await db.connection()
    _push_table_available = await connection.run_sync(lambda sync_connection: sa.inspect(sync_connection).has_table("push_devices"))
    return _push_table_available


async def register_push_token(
    db: AsyncSession,
    user: User,
    token: str,
    platform: str = "unknown",
    device_id: str | None = None,
) -> PushDevice:
    token = token.strip()
    if not token:
        raise ValueError("Push token is required")

    device = await db.scalar(select(PushDevice).where(PushDevice.token == token))
    if device is None:
        device = PushDevice(user_id=user.id, token=token, platform=platform[:20], device_id=device_id)
        db.add(device)
    else:
        device.user_id = user.id
        device.platform = platform[:20]
        device.device_id = device_id
        device.is_active = True
    await db.commit()
    await db.refresh(device)
    return device


async def create_notification(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    booking_id: int | None = None,
    push: bool = True,
) -> Notification:
    notice = Notification(user_id=user_id, title=title[:160], body=body[:500], booking_id=booking_id)
    db.add(notice)
    await db.flush()
    if push:
        try:
            await send_push_to_users(db, [user_id], title, body, booking_id)
        except SQLAlchemyError as exc:
            logger.warning("Push lookup skipped; push_devices may need migration: %s", type(exc).__name__)
    return notice


async def send_push_to_users(
    db: AsyncSession,
    user_ids: Iterable[int],
    title: str,
    body: str,
    booking_id: int | None = None,
) -> None:
    ids = [int(user_id) for user_id in set(user_ids)]
    if not ids:
        return
    if not await _has_push_devices_table(db):
        logger.warning("Push delivery skipped because push_devices table is not migrated yet")
        return
    try:
        devices = (await db.scalars(
            select(PushDevice).where(PushDevice.user_id.in_(ids), PushDevice.is_active.is_(True))
        )).all()
    except SQLAlchemyError as exc:
        logger.warning("Push device lookup failed: %s", type(exc).__name__)
        return
    tokens = [device.token for device in devices if device.token.startswith("ExponentPushToken[")]
    if not tokens:
        return
    payload = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "data": {"booking_id": booking_id, "kind": "didaskey_update"},
        }
        for token in tokens
    ]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=10.0)) as client:
            response = await client.post(EXPO_PUSH_URL, json=payload)
            response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("Expo push request failed: %s", type(exc).__name__)


async def send_due_lesson_reminders(
    db: AsyncSession,
    minutes_before: int = 30,
    window_minutes: int = 5,
) -> int:
    """Send one in-app, push, and email reminder for sessions starting soon."""
    now = _now()
    start = now + timedelta(minutes=minutes_before)
    end = start + timedelta(minutes=window_minutes)
    bookings = (await db.scalars(
        select(Booking).where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.scheduled_at >= start,
            Booking.scheduled_at < end,
        )
    )).unique().all()

    sent = 0
    for booking in bookings:
        subject = booking.subject.name if booking.subject else "lesson"
        time_label = booking.scheduled_at.astimezone(timezone(timedelta(hours=1))).strftime("%I:%M %p").lstrip("0")
        body = f"Your {subject} session starts at {time_label}. Join early to test your audio and video."
        tutor_user = await db.get(User, booking.tutor.user_id)
        participants = [user for user in (booking.student, tutor_user) if user is not None]
        for user in participants:
            title = "Lesson reminder"
            existing = await db.scalar(select(Notification).where(
                Notification.user_id == user.id,
                Notification.booking_id == booking.id,
                Notification.title == title,
                Notification.body == body,
            ))
            if existing is not None:
                continue
            await create_notification(db, user.id, title, body, booking.id, push=True)
            await send_lesson_reminder_email(user.email, user.first_name, subject, time_label)
            sent += 1
    await db.commit()
    return sent
