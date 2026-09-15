"""
ClassroomService — live classroom lifecycle tied to a Booking.

Responsibilities
----------------
- Compute the join window for a booking (opens CLASSROOM_JOIN_BEFORE_MINUTES
  before the scheduled start; closes CLASSROOM_JOIN_GRACE_MINUTES after the
  scheduled end).
- Lazily create the Classroom row the first time either party joins an
  ONLINE, CONFIRMED booking.
- Issue LiveKit access tokens scoped to exactly one room + identity.
- Record join/leave events for automatic attendance tracking.
- End a session (tutor/admin only), which force-disconnects LiveKit
  participants and marks the booking COMPLETED.

Access control
--------------
Only the booking's student, the booking's tutor
(matched via TutorProfile.user_id), or an admin may view/join/leave/end a
classroom. Everyone else gets a 403.

Flow (student perspective)
--------------------------
1. Book + pay → Booking becomes CONFIRMED.
2. Client polls ``get_status`` to show a countdown / "Join Session" button.
3. Once inside the join window the client calls ``join``, which returns a
   LiveKit URL + access token.
4. The client connects to LiveKit directly using those credentials.
5. The tutor calls ``end`` when the lesson is over → COMPLETED.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.integrations import livekit
from app.models.billing import Booking, BookingStatus, SessionFormat
from app.models.communication import (
    Classroom,
    ClassroomParticipant,
    ClassroomStatus,
    ParticipantRole,
)
from app.models.user import User, UserRole
from app.schemas.communication import (
    AttendanceSummary,
    ClassroomJoinResponse,
    ClassroomParticipantResponse,
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
    """Normalise *value* to a UTC-aware datetime, assuming naive == UTC."""
    if value.tzinfo is None:
        logger.warning(
            "Naive datetime in _as_utc — assuming UTC. value=%r", value
        )
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def compute_window(
    scheduled_at: datetime, duration_minutes: int
) -> tuple[datetime, datetime]:
    """Return ``(opens_at, closes_at)`` for the classroom join window (UTC)."""
    start = _as_utc(scheduled_at)
    opens_at = start - timedelta(minutes=settings.CLASSROOM_JOIN_BEFORE_MINUTES)
    closes_at = start + timedelta(
        minutes=duration_minutes + settings.CLASSROOM_JOIN_GRACE_MINUTES
    )
    return opens_at, closes_at


def _build_window(
    scheduled_at: datetime, duration_minutes: int
) -> ClassroomWindow:
    opens_at, closes_at = compute_window(scheduled_at, duration_minutes)
    now = datetime.now(tz=timezone.utc)
    return ClassroomWindow(
        opens_at=opens_at,
        closes_at=closes_at,
        can_join_now=opens_at <= now <= closes_at,
        seconds_until_open=max(0, int((opens_at - now).total_seconds())),
    )


async def _load_booking(booking_id: int, db: AsyncSession) -> Booking:
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.tutor),
            selectinload(Booking.student),
            selectinload(Booking.subject),
        )
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


async def _get_or_create_classroom(
    booking: Booking, db: AsyncSession
) -> Classroom:
    classroom = await db.scalar(
        select(Classroom).where(Classroom.booking_id == booking.id)
    )
    if classroom is not None:
        return classroom

    room_name = livekit.room_name_for_booking(booking.id)
    classroom = Classroom(
        booking_id=booking.id,
        room_name=room_name,
        status=ClassroomStatus.SCHEDULED,
    )
    db.add(classroom)
    await db.flush()
    logger.info(
        "Classroom created: booking_id=%s room=%s", booking.id, room_name
    )
    return classroom


def _to_response(
    booking: Booking, classroom: Classroom | None
) -> ClassroomResponse:
    room_name = (
        classroom.room_name
        if classroom
        else livekit.room_name_for_booking(booking.id)
    )
    return ClassroomResponse(
        booking_id=booking.id,
        room_name=room_name,
        status=classroom.status if classroom else ClassroomStatus.SCHEDULED,
        session_format=booking.session_format,
        started_at=classroom.started_at if classroom else None,
        ended_at=classroom.ended_at if classroom else None,
        window=_build_window(booking.scheduled_at, booking.duration_minutes),
    )


# ── Public service methods ────────────────────────────────────────────────────


async def get_status(
    booking_id: int, user: User, db: AsyncSession
) -> ClassroomResponse:
    """
    Return the classroom + join-window status for a booking.

    Safe to poll frequently — never creates a Classroom row.
    """
    booking = await _load_booking(booking_id, db)
    _resolve_role(booking, user)

    if booking.session_format != SessionFormat.ONLINE:
        raise _bad_request("This booking is in-person and has no video classroom.")

    classroom = await db.scalar(
        select(Classroom).where(Classroom.booking_id == booking.id)
    )
    return _to_response(booking, classroom)


async def join(
    booking_id: int, user: User, db: AsyncSession
) -> ClassroomJoinResponse:
    """
    Validate the join window + booking status, then issue a LiveKit token.

    Raises
    ------
    403  user is not a participant in this booking
    400  booking is in-person or not confirmed
    409  outside the join window, or the session already ended
    503  LiveKit credentials not configured
    """
    if not livekit.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Video classrooms are not available right now. "
                "Please contact support."
            ),
        )

    booking = await _load_booking(booking_id, db)
    role = _resolve_role(booking, user)

    if booking.session_format != SessionFormat.ONLINE:
        raise _bad_request("This booking is in-person and has no video classroom.")

    if booking.status != BookingStatus.CONFIRMED:
        raise _bad_request(
            f"Only confirmed bookings can be joined "
            f"(current status: '{booking.status}')."
        )

    window = _build_window(booking.scheduled_at, booking.duration_minutes)
    if not window.can_join_now:
        now_utc = datetime.now(tz=timezone.utc)
        if now_utc < window.opens_at:
            mins_until = int((window.opens_at - now_utc).total_seconds() / 60)
            raise _conflict(
                "This session isn't open yet. "
                f"You can join {settings.CLASSROOM_JOIN_BEFORE_MINUTES} minutes "
                "before the scheduled start "
                f"(opens in approximately {mins_until} "
                f"minute{'s' if mins_until != 1 else ''})."
            )
        raise _conflict("This session's join window has closed.")

    classroom = await _get_or_create_classroom(booking, db)
    if classroom.status == ClassroomStatus.ENDED:
        raise _conflict("This session has already ended.")

    # Transition SCHEDULED → LIVE on first join
    if classroom.status == ClassroomStatus.SCHEDULED:
        classroom.status = ClassroomStatus.LIVE
        classroom.started_at = datetime.now(tz=timezone.utc)

    # Record join event for attendance tracking
    db.add(
        ClassroomParticipant(
            classroom_id=classroom.id,
            user_id=user.id,
            role=role,
        )
    )
    await db.flush()

    display_name = (
        f"{user.first_name} {user.last_name}".strip() or user.email
    )
    identity = f"user-{user.id}"

    token = livekit.generate_access_token(
        room_name=classroom.room_name,
        identity=identity,
        display_name=display_name,
        can_publish=True,
        can_subscribe=True,
    )

    logger.info(
        "Classroom joined: booking_id=%s user_id=%s role=%s room=%s",
        booking.id,
        user.id,
        role,
        classroom.room_name,
    )

    return ClassroomJoinResponse(
        booking_id=booking.id,
        livekit_url=settings.LIVEKIT_URL,
        token=token,
        room_name=classroom.room_name,
        user_id=user.id,
        display_name=display_name,
        role=role.value,
        is_tutor=(role == ParticipantRole.TUTOR),
    )


async def leave(booking_id: int, user: User, db: AsyncSession) -> None:
    """Record that the requesting user left the classroom (best-effort)."""
    booking = await _load_booking(booking_id, db)
    _resolve_role(booking, user)

    classroom = await db.scalar(
        select(Classroom).where(Classroom.booking_id == booking.id)
    )
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


async def end(
    booking_id: int, user: User, db: AsyncSession
) -> ClassroomResponse:
    """
    End a live session.

    Only the tutor or an admin may end a session. Closes all open
    participant rows, marks the classroom ENDED and the booking COMPLETED,
    and best-effort calls LiveKit's DeleteRoom to disconnect everyone.
    """
    from app.models.billing import BookingStatus  # avoid circular at top level

    booking = await _load_booking(booking_id, db)
    role = _resolve_role(booking, user)

    if role == ParticipantRole.STUDENT:
        raise _forbidden("Only the tutor or an admin can end a session.")

    classroom = await db.scalar(
        select(Classroom).where(Classroom.booking_id == booking.id)
    )
    if classroom is None or classroom.status != ClassroomStatus.LIVE:
        raise _conflict(
            "There is no live session to end for this booking."
        )

    now = datetime.now(tz=timezone.utc)

    # Close all open participant records
    open_rows = (
        await db.scalars(
            select(ClassroomParticipant)
            .where(
                ClassroomParticipant.classroom_id == classroom.id,
                ClassroomParticipant.left_at.is_(None),
            )
        )
    ).all()
    for row in open_rows:
        row.left_at = now

    classroom.status = ClassroomStatus.ENDED
    classroom.ended_at = now
    booking.status = BookingStatus.COMPLETED
    from app.services.learning_service import notify_user
    await notify_user(db, booking.student_id, "Session completed", "Your materials, assignments and feedback remain available in Learning.", booking.id)
    await notify_user(db, booking.tutor.user_id, "Session completed", "Add lesson notes and feedback in Learning.", booking.id)
    await db.flush()

    # Best-effort LiveKit room teardown
    await livekit.end_room(classroom.room_name)

    logger.info(
        "Session ended: booking_id=%s room=%s ended_by=user-%s",
        booking.id,
        classroom.room_name,
        user.id,
    )

    return _to_response(booking, classroom)


async def get_attendance(
    booking_id: int, user: User, db: AsyncSession
) -> list[AttendanceSummary]:
    """
    Return aggregated attendance for a session.

    Available once the session is LIVE or ENDED. Tutors and admins see
    all participants; students only see their own record.
    """
    booking = await _load_booking(booking_id, db)
    role = _resolve_role(booking, user)

    classroom = await db.scalar(
        select(Classroom).where(Classroom.booking_id == booking.id)
    )
    if classroom is None:
        return []

    rows_query = select(ClassroomParticipant).where(
        ClassroomParticipant.classroom_id == classroom.id
    )
    if role == ParticipantRole.STUDENT:
        rows_query = rows_query.where(ClassroomParticipant.user_id == user.id)

    rows = (await db.scalars(rows_query)).all()

    # Aggregate by user_id — sum all join/leave intervals
    from collections import defaultdict

    now = datetime.now(tz=timezone.utc)
    totals: dict[int, dict] = defaultdict(
        lambda: {
            "total_seconds": 0,
            "role": None,
            "joined_at": None,
            "left_at": None,
        }
    )
    for row in rows:
        uid = row.user_id
        left = row.left_at or now
        duration = int((left - row.joined_at).total_seconds())
        totals[uid]["total_seconds"] += max(0, duration)
        totals[uid]["role"] = row.role
        if totals[uid]["joined_at"] is None or row.joined_at < totals[uid]["joined_at"]:
            totals[uid]["joined_at"] = row.joined_at
        if row.left_at and (
            totals[uid]["left_at"] is None or row.left_at > totals[uid]["left_at"]
        ):
            totals[uid]["left_at"] = row.left_at

    # Resolve display names
    from app.models.user import User as UserModel

    result = []
    for uid, agg in totals.items():
        u = await db.get(UserModel, uid)
        name = (
            f"{u.first_name} {u.last_name}".strip() if u else f"User {uid}"
        )
        result.append(
            AttendanceSummary(
                user_id=uid,
                display_name=name,
                role=agg["role"],
                total_seconds=agg["total_seconds"],
                joined_at=agg["joined_at"],
                left_at=agg["left_at"],
            )
        )
    return result
