"""
ClassroomService — live video classroom lifecycle tied to a Booking.

Responsibilities
----------------
- Compute the join window for a booking (a few minutes before the
  scheduled start, until a grace period after the scheduled end).
- Lazily create the Classroom row the first time either party joins an
  ONLINE, CONFIRMED booking.
- Issue LiveKit access tokens scoped to exactly one room + identity.
- Record join/leave events for attendance auditing.
- End a session (tutor/admin only), which force-disconnects any
  remaining LiveKit participants and marks the booking COMPLETED.

Access control
---------------
Only the booking's student, the booking's tutor (matched via
``TutorProfile.user_id``), or an admin may view/join/leave/end a
classroom. Everyone else gets a 403.

Flow (student's perspective)
-----------------------------
1. Book + pay → Booking becomes CONFIRMED (payment_service / booking_service).
2. Client polls ``get_status`` to show a countdown / "Join Session" button.
3. Once inside the join window, the client calls ``join`` and connects to
   LiveKit with the returned token.
4. The tutor calls ``end`` when the lesson is over → booking → COMPLETED.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.integrations import video
from app.models.billing import Booking, BookingStatus, SessionFormat
from app.models.communication import (
    Classroom,
    ClassroomParticipant,
    ClassroomStatus,
    ParticipantRole,
)
from app.models.user import User, UserRole
from app.schemas.communication import (
    ClassroomJoinResponse,
    ClassroomResponse,
    ClassroomWindow,
)

logger = logging.getLogger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _http(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _not_found(detail: str) -> HTTPException:
    return _http(status.HTTP_404_NOT_FOUND, detail)


def _forbidden(detail: str) -> HTTPException:
    return _http(status.HTTP_403_FORBIDDEN, detail)


def _bad_request(detail: str) -> HTTPException:
    return _http(status.HTTP_400_BAD_REQUEST, detail)


def _conflict(detail: str) -> HTTPException:
    return _http(status.HTTP_409_CONFLICT, detail)


def _as_utc(value: datetime) -> datetime:
    """
    Normalise *value* to a UTC-aware datetime.

    Under normal operation every ``scheduled_at`` read from the DB will
    already be UTC-aware (enforced by the asyncpg ``timezone=UTC``
    server_setting in ``db/session.py``).  This function is a safety net
    for any path that might still produce a naive datetime (e.g. a legacy
    row, a test fixture, or a driver that strips tzinfo).

    IMPORTANT: we *assume* naive datetimes are already UTC.  If the
    original value was local time stored without an offset this assumption
    will be wrong and join-window comparisons will be off by the UTC
    delta of that timezone.  The correct fix is always to ensure the value
    is stored as UTC-aware in the first place (enforced at the Pydantic
    schema layer for new bookings).
    """
    if value.tzinfo is None:
        logger.warning(
            "Naive datetime encountered in _as_utc — assuming UTC.  "
            "Check that the DB connection timezone is set to UTC and that "
            "scheduled_at values are written with explicit UTC offsets.  "
            "value=%r",
            value,
        )
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def compute_window(scheduled_at: datetime, duration_minutes: int) -> tuple[datetime, datetime]:
    """
    Return ``(opens_at, closes_at)`` for the classroom join window, in UTC.

    A participant may join starting ``CLASSROOM_JOIN_BEFORE_MINUTES``
    before the scheduled start, up until ``CLASSROOM_JOIN_GRACE_MINUTES``
    after the scheduled end — after that the window is considered missed.
    """
    start = _as_utc(scheduled_at)
    opens_at = start - timedelta(minutes=settings.CLASSROOM_JOIN_BEFORE_MINUTES)
    closes_at = start + timedelta(
        minutes=duration_minutes + settings.CLASSROOM_JOIN_GRACE_MINUTES
    )
    return opens_at, closes_at


def _build_window(scheduled_at: datetime, duration_minutes: int) -> ClassroomWindow:
    opens_at, closes_at = compute_window(scheduled_at, duration_minutes)
    now = datetime.now(tz=timezone.utc)
    return ClassroomWindow(
        opens_at=opens_at,
        closes_at=closes_at,
        can_join_now=opens_at <= now <= closes_at,
        seconds_until_open=max(0, int((opens_at - now).total_seconds())),
    )


async def _load_booking_for_classroom(booking_id: int, db: AsyncSession) -> Booking:
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(selectinload(Booking.tutor), selectinload(Booking.student))
    )
    if booking is None:
        raise _not_found(f"Booking {booking_id!r} not found")
    return booking


def _resolve_role(booking: Booking, user: User) -> ParticipantRole:
    """Return the caller's role in this booking, or raise 403."""
    if user.role == UserRole.ADMIN:
        return ParticipantRole.ADMIN
    if booking.tutor is not None and booking.tutor.user_id == user.id:
        return ParticipantRole.TUTOR
    if booking.student_id == user.id:
        return ParticipantRole.STUDENT
    raise _forbidden("You are not a participant in this session.")


async def _get_or_create_classroom(booking: Booking, db: AsyncSession) -> Classroom:
    classroom = await db.scalar(select(Classroom).where(Classroom.booking_id == booking.id))
    if classroom is not None:
        return classroom

    classroom = Classroom(
        booking_id=booking.id,
        room_name=video.room_name_for_booking(booking.id),
        status=ClassroomStatus.SCHEDULED,
    )
    db.add(classroom)
    await db.flush()
    logger.info("Classroom created: booking_id=%s room=%s", booking.id, classroom.room_name)
    return classroom


def _to_response(booking: Booking, classroom: Classroom | None) -> ClassroomResponse:
    return ClassroomResponse(
        booking_id=booking.id,
        room_name=classroom.room_name if classroom else video.room_name_for_booking(booking.id),
        status=classroom.status if classroom else ClassroomStatus.SCHEDULED,
        session_format=booking.session_format,
        started_at=classroom.started_at if classroom else None,
        ended_at=classroom.ended_at if classroom else None,
        window=_build_window(booking.scheduled_at, booking.duration_minutes),
    )


# ── Public service methods ────────────────────────────────────────────────────


async def get_status(booking_id: int, user: User, db: AsyncSession) -> ClassroomResponse:
    """
    Return the classroom + join-window status for a booking.

    Safe to poll frequently — never creates a Classroom row (that only
    happens on the first actual ``join``), so browsing bookings never
    clutters the classrooms table.
    """
    booking = await _load_booking_for_classroom(booking_id, db)
    _resolve_role(booking, user)  # raises 403 if not a participant

    if booking.session_format != SessionFormat.ONLINE:
        raise _bad_request("This booking is in-person and has no video classroom.")

    classroom = await db.scalar(select(Classroom).where(Classroom.booking_id == booking.id))
    return _to_response(booking, classroom)


async def join(booking_id: int, user: User, db: AsyncSession) -> ClassroomJoinResponse:
    """
    Validate the join window + booking status, then issue a LiveKit token.

    Raises
    ------
    403  user is not a participant in this booking
    400  booking is in-person or not confirmed
    409  outside the join window, or the session already ended
    503  LiveKit credentials not configured
    """
    # Check credentials first — no point touching the DB if we can't issue a token.
    if not video.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Video classroom service is not configured. "
                "Contact support or try again later."
            ),
        )

    booking = await _load_booking_for_classroom(booking_id, db)
    role = _resolve_role(booking, user)

    if booking.session_format != SessionFormat.ONLINE:
        raise _bad_request("This booking is in-person and has no video classroom.")

    if booking.status != BookingStatus.CONFIRMED:
        raise _bad_request(
            f"Only confirmed bookings can be joined (current status: '{booking.status}')."
        )

    window = _build_window(booking.scheduled_at, booking.duration_minutes)
    if not window.can_join_now:
        now_utc = datetime.now(tz=timezone.utc)
        logger.info(
            "Join window check failed: booking_id=%s now_utc=%s opens_at=%s closes_at=%s "
            "scheduled_at_raw=%r",
            booking_id,
            now_utc.isoformat(),
            window.opens_at.isoformat(),
            window.closes_at.isoformat(),
            booking.scheduled_at,
        )
        if now_utc < window.opens_at:
            mins_until = int((window.opens_at - now_utc).total_seconds() / 60)
            raise _conflict(
                "This session isn't open yet. "
                f"You can join starting {settings.CLASSROOM_JOIN_BEFORE_MINUTES} minutes "
                "before the scheduled time "
                f"(opens in approximately {mins_until} minute{'s' if mins_until != 1 else ''})."
            )
        raise _conflict("This session's join window has closed.")

    classroom = await _get_or_create_classroom(booking, db)
    if classroom.status == ClassroomStatus.ENDED:
        raise _conflict("This session has already ended.")

    if classroom.status == ClassroomStatus.SCHEDULED:
        classroom.status = ClassroomStatus.LIVE
        classroom.started_at = datetime.now(tz=timezone.utc)

    db.add(ClassroomParticipant(classroom_id=classroom.id, user_id=user.id, role=role))
    await db.flush()

    display_name = f"{user.first_name} {user.last_name}".strip() or user.email
    identity = f"user-{user.id}"

    try:
        token = video.generate_access_token(
            room_name=classroom.room_name,
            identity=identity,
            display_name=display_name,
        )
    except RuntimeError as exc:
        logger.error("LiveKit credentials missing — cannot issue token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Video classroom service is not configured. "
                "Contact support or try again later."
            ),
        ) from exc

    logger.info(
        "Classroom joined: booking_id=%s user_id=%s role=%s room=%s",
        booking.id,
        user.id,
        role,
        classroom.room_name,
    )

    return ClassroomJoinResponse(
        booking_id=booking.id,
        room_name=classroom.room_name,
        livekit_url=settings.LIVEKIT_URL,
        token=token,
        identity=identity,
        display_name=display_name,
        role=role,
        expires_in_minutes=settings.CLASSROOM_TOKEN_TTL_MINUTES,
    )


async def leave(booking_id: int, user: User, db: AsyncSession) -> None:
    """Record that the requesting user left the classroom (best-effort)."""
    booking = await _load_booking_for_classroom(booking_id, db)
    _resolve_role(booking, user)

    classroom = await db.scalar(select(Classroom).where(Classroom.booking_id == booking.id))
    if classroom is None:
        return

    open_row = await db.scalar(
        select(ClassroomParticipant)
        .where(
            ClassroomParticipant.classroom_id == classroom.id,
            ClassroomParticipant.user_id == user.id,
            ClassroomParticipant.left_at.is_(None),
        )
        .order_by(ClassroomParticipant.joined_at.desc())
    )
    if open_row is not None:
        open_row.left_at = datetime.now(tz=timezone.utc)
        await db.flush()


async def end(booking_id: int, user: User, db: AsyncSession) -> ClassroomResponse:
    """
    End a live session.

    Only the tutor or an admin may end a session. Force-disconnects any
    remaining LiveKit participants (best-effort) and marks the booking
    COMPLETED, since an explicit "end session" action from the tutor is
    the clearest available signal that the lesson took place.

    Idempotent — calling this again on an already-ended classroom simply
    returns the current status.
    """
    booking = await _load_booking_for_classroom(booking_id, db)
    role = _resolve_role(booking, user)
    if role == ParticipantRole.STUDENT:
        raise _forbidden("Only the tutor or an admin can end the session.")

    classroom = await db.scalar(select(Classroom).where(Classroom.booking_id == booking.id))
    if classroom is None:
        raise _not_found("This session has not started yet.")

    if classroom.status != ClassroomStatus.ENDED:
        classroom.status = ClassroomStatus.ENDED
        classroom.ended_at = datetime.now(tz=timezone.utc)

        now = datetime.now(tz=timezone.utc)
        open_rows = (
            await db.scalars(
                select(ClassroomParticipant).where(
                    ClassroomParticipant.classroom_id == classroom.id,
                    ClassroomParticipant.left_at.is_(None),
                )
            )
        ).all()
        for row in open_rows:
            row.left_at = now

        await db.flush()
        await video.end_room(classroom.room_name)

        if booking.status == BookingStatus.CONFIRMED:
            booking.status = BookingStatus.COMPLETED
            await db.flush()
            logger.info("Booking auto-completed on classroom end: booking_id=%s", booking.id)

    return _to_response(booking, classroom)
