"""
BookingService — all booking lifecycle business logic.

⚠️  **TESTING MODE ACTIVE** ⚠️
Tutor availability restrictions are currently DISABLED to allow flexible testing.
All time slots are allowed regardless of tutor availability settings.
Remember to re-enable availability checks after testing is complete.

Responsibilities
----------------
- Create a booking + companion Transaction in a single atomic write
- Enforce scheduling rules (availability, conflicts, cancellation windows)
- List bookings for a student or tutor with pagination
- Cancel a booking (student self-cancel within policy, admin force-cancel)
- Confirm a booking after payment webhook fires (called by payment_service)
- Mark a session as completed or no-show (admin / system)

Security invariants
-------------------
- ``amount`` is always derived server-side from the tutor's rate — the
  client payload never contains a price.
- Ownership checks are performed before every mutation; a student cannot
  read or modify another student's booking.
- ``paystack_reference`` is a server-generated UUID4; the client never
  supplies it.
- All writes use ``await db.flush()`` within an open session; the caller
  (endpoint layer) commits via the session context manager.

Cancellation policy
-------------------
Students may cancel up to CANCEL_CUTOFF_HOURS before the session.
After that window the booking can only be cancelled by an admin.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings

from app.models.billing import Booking, BookingStatus, RefundStatus, Refund, Transaction, TransactionStatus
from app.models.marketplace import TutorAvailability, TutorProfile
from app.models.user import User, UserRole
from app.schemas.billing import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingResponse,
    BookingWithPaystackResponse,
    PaginatedBookings,
    TransactionSummary,
)

logger = logging.getLogger(__name__)

# Students can self-cancel up to this many hours before the session.
CANCEL_CUTOFF_HOURS: int = 24


# ── Internal helpers ──────────────────────────────────────────────────────────


def _http(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _not_found(resource: str, resource_id: int | str) -> HTTPException:
    return _http(
        status.HTTP_404_NOT_FOUND,
        f"{resource} with id {resource_id!r} was not found",
    )


def _forbidden(detail: str) -> HTTPException:
    return _http(status.HTTP_403_FORBIDDEN, detail)


def _conflict(detail: str) -> HTTPException:
    return _http(status.HTTP_409_CONFLICT, detail)


def _bad_request(detail: str) -> HTTPException:
    return _http(status.HTTP_400_BAD_REQUEST, detail)


def _as_utc(value: datetime) -> datetime:
    """Normalize database and request datetimes to comparable UTC values."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _build_response(booking: Booking) -> BookingResponse:
    """Map an ORM Booking to its Pydantic response schema."""
    txn_summary: TransactionSummary | None = None
    if booking.transaction:
        txn_summary = TransactionSummary(
            id=booking.transaction.id,
            paystack_reference=booking.transaction.paystack_reference,
            status=booking.transaction.status,
            amount=booking.transaction.amount,
            currency=booking.transaction.currency,
            paid_at=booking.transaction.paid_at,
        )

    student_name: str | None = None
    if hasattr(booking, "student") and booking.student is not None:
        student_name = f"{booking.student.first_name} {booking.student.last_name}".strip()

    return BookingResponse(
        id=booking.id,
        student_id=booking.student_id,
        student_name=student_name,
        tutor_id=booking.tutor_id,
        tutor_name=booking.tutor.display_name,
        subject_id=booking.subject_id,
        subject_name=booking.subject.name if booking.subject else None,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        session_format=booking.session_format,
        student_note=booking.student_note,
        amount=booking.amount,
        currency=booking.currency,
        status=booking.status,
        cancellation_reason=booking.cancellation_reason,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        transaction=txn_summary,
    )


def _check_ownership(booking: Booking, user: User) -> None:
    """
    Raise 403 if the requesting user does not own the booking and is not admin.

    Tutors may read their own bookings (tutor_id match) but cannot mutate
    student bookings — mutation callers do their own check.
    """
    if user.role == UserRole.ADMIN:
        return
    if user.role == UserRole.TUTOR and booking.tutor_id != user.id:
        raise _forbidden("You do not have access to this booking")
    if user.role not in (UserRole.TUTOR,) and booking.student_id != user.id:
        raise _forbidden("You do not have access to this booking")


# ── Scheduling helpers ────────────────────────────────────────────────────────


def _day_name(dt: datetime) -> str:
    """
    Return the lowercase day name for a datetime using its own UTC offset
    (i.e. the wall-clock day at the location implied by the offset).

    Tutor availability slots are stored as local wall-clock times (no
    timezone info), so we must compare using the *local* day — not the
    UTC day — to avoid the off-by-one that occurs for slots near midnight.

    If ``dt`` is naive we fall back to treating it as UTC, which matches
    the rest of the codebase's naive-datetime assumption.
    """
    if dt.tzinfo is None:
        # Naive → assume UTC
        return dt.strftime("%A").lower()
    # Keep the wall-clock representation; don't convert to UTC.
    return dt.strftime("%A").lower()


async def _assert_tutor_available(
    tutor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
    db: AsyncSession,
) -> None:
    """
    Check that the requested slot falls within one of the tutor's weekly
    availability windows.

    **TESTING MODE**: Currently controlled by SKIP_TUTOR_AVAILABILITY_CHECK setting.
    When enabled, all time slots are allowed for easier testing.
    
    Availability start_time / end_time values are stored as plain
    wall-clock times (no timezone), set by the tutor in their local time.
    We therefore compare using the *local* wall-clock representation of
    ``scheduled_at`` (i.e. the time as the client sent it, preserving the
    UTC offset) rather than converting to UTC first.

    Raises 409 if no matching window is found.
    """
    # Check if availability validation is disabled for testing
    if settings.SKIP_TUTOR_AVAILABILITY_CHECK:
        logger.info(f"⚠️  TESTING MODE: Skipping availability check for tutor {tutor_id}")
        return  # Allow any booking time during testing
    
    # Original availability checking code (enabled when SKIP_TUTOR_AVAILABILITY_CHECK = False)
    # Preserve the original UTC offset so wall-clock hour/day are correct.
    local_start = scheduled_at if scheduled_at.tzinfo is not None else scheduled_at.replace(tzinfo=timezone.utc)
    day = _day_name(local_start)
    session_start = local_start.time().replace(tzinfo=None)
    session_end = (
        local_start + timedelta(minutes=duration_minutes)
    ).time().replace(tzinfo=None)

    slots = (
        await db.scalars(
            select(TutorAvailability).where(
                TutorAvailability.tutor_id == tutor_id,
                TutorAvailability.day_of_week == day,
            )
        )
    ).all()

    for slot in slots:
        if slot.start_time <= session_start and slot.end_time >= session_end:
            return  # fits inside an availability window

    raise _conflict(
        f"The tutor is not available on {day.capitalize()} "
        f"at {session_start.strftime('%H:%M')}. "
        "Check the tutor's availability before booking."
    )


async def _assert_no_conflict(
    tutor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
    exclude_booking_id: int | None,
    db: AsyncSession,
) -> None:
    """
    Ensure the tutor has no overlapping confirmed/pending booking.

    A slot overlaps if:
        existing_start < new_end  AND  existing_end > new_start
    """
    new_start = _as_utc(scheduled_at)
    new_end = scheduled_at + timedelta(minutes=duration_minutes)
    new_end = _as_utc(new_end)

    stmt = select(Booking).where(
        Booking.tutor_id == tutor_id,
        Booking.status.in_(
            [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED]
        ),
    )
    if exclude_booking_id:
        stmt = stmt.where(Booking.id != exclude_booking_id)

    existing = (await db.scalars(stmt)).all()

    for b in existing:
        existing_start = _as_utc(b.scheduled_at)
        b_end = existing_start + timedelta(minutes=b.duration_minutes)
        if existing_start < new_end and b_end > new_start:
            raise _conflict(
                "The tutor already has a booking that overlaps with the "
                "requested time slot. Please choose a different time."
            )


# ── Public service methods ────────────────────────────────────────────────────


async def create_booking(
    payload: BookingCreateRequest,
    student: User,
    db: AsyncSession,
) -> tuple[Booking, str]:
    """
    Create a Booking and a companion pending Transaction.

    Returns
    -------
    tuple[Booking, str]
        The new Booking ORM instance (with transaction eagerly loaded)
        and the Paystack reference UUID string.

    Raises
    ------
    404  tutor not found or inactive
    409  tutor not available / time slot conflict
    400  student tries to book themselves
    """
    # ── 1. Load the tutor ─────────────────────────────────────────────────────
    tutor: TutorProfile | None = await db.get(TutorProfile, payload.tutor_id)
    if tutor is None or not tutor.is_active:
        raise _not_found("TutorProfile", payload.tutor_id)

    if tutor.user_id == student.id:
        raise _bad_request("You cannot book a session with yourself.")

    # ── 2. Resolve effective rate (subject override > global rate) ────────────
    effective_rate: Decimal = tutor.rate_per_hour
    if payload.subject_id is not None:
        from app.models.marketplace import TutorSubject

        ts = await db.scalar(
            select(TutorSubject).where(
                TutorSubject.tutor_id == tutor.id,
                TutorSubject.subject_id == payload.subject_id,
            )
        )
        if ts is not None and ts.rate_override is not None:
            effective_rate = ts.rate_override

    # ── 3. Compute amount (rate × duration in hours) ──────────────────────────
    hours = Decimal(str(payload.duration_minutes)) / Decimal("60")
    amount = (effective_rate * hours).quantize(Decimal("0.01"))

    # ── 4. Scheduling checks ──────────────────────────────────────────────────
    await _assert_tutor_available(
        tutor.id, payload.scheduled_at, payload.duration_minutes, db
    )
    await _assert_no_conflict(
        tutor.id, payload.scheduled_at, payload.duration_minutes, None, db
    )

    # ── 5. Create Booking ─────────────────────────────────────────────────────
    # Coerce scheduled_at to UTC explicitly before writing to the DB.
    # The Pydantic schema already rejects naive datetimes, but the client
    # may send a valid tz-aware datetime in a non-UTC zone (e.g. WAT/UTC+1).
    # Storing as UTC ensures join-window comparisons in classroom_service
    # are always against a consistent reference.
    scheduled_at_utc = _as_utc(payload.scheduled_at)

    booking = Booking(
        student_id=student.id,
        tutor_id=tutor.id,
        subject_id=payload.subject_id,
        scheduled_at=scheduled_at_utc,
        duration_minutes=payload.duration_minutes,
        session_format=payload.session_format,
        student_note=payload.student_note,
        amount=amount,
        currency=tutor.currency,
        status=BookingStatus.PENDING_PAYMENT,
    )
    db.add(booking)
    await db.flush()  # populate booking.id

    # ── 6. Create pending Transaction ─────────────────────────────────────────
    reference = str(uuid.uuid4())
    transaction = Transaction(
        booking_id=booking.id,
        paystack_reference=reference,
        amount=amount,
        currency=tutor.currency,
        status=TransactionStatus.PENDING,
    )
    db.add(transaction)
    await db.flush()

    # Attach for eager access (avoids a second query in the endpoint)
    booking.transaction = transaction

    logger.info(
        "Booking created: booking_id=%s student_id=%s tutor_id=%s reference=%s",
        booking.id,
        student.id,
        tutor.id,
        reference,
    )
    return booking, reference


async def get_booking(
    booking_id: int,
    requesting_user: User,
    db: AsyncSession,
) -> BookingResponse:
    """
    Return a single booking by ID.

    Only the owning student, the tutor, or an admin may view a booking.
    """
    booking = await _load_booking(booking_id, db)
    _check_ownership(booking, requesting_user)
    return _build_response(booking)


async def list_student_bookings(
    student_id: int,
    requesting_user: User,
    db: AsyncSession,
    *,
    status_filter: BookingStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedBookings:
    """
    Paginated list of bookings for a student.

    A student may only list their own bookings; admins may list any
    student's bookings by passing any student_id.
    """
    if requesting_user.role != UserRole.ADMIN and requesting_user.id != student_id:
        raise _forbidden("You can only view your own bookings.")

    stmt = (
        select(Booking)
        .where(Booking.student_id == student_id)
        .options(
            selectinload(Booking.transaction),
            selectinload(Booking.tutor),
            selectinload(Booking.subject),
        )
    )
    if status_filter:
        stmt = stmt.where(Booking.status == status_filter)

    return await _paginate(stmt, page, page_size, db)


async def list_tutor_bookings(
    tutor_profile_id: int,
    requesting_user: User,
    db: AsyncSession,
    *,
    status_filter: BookingStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedBookings:
    """
    Paginated list of bookings for a tutor.

    The tutor may only list their own bookings; admins may list any.
    """
    if requesting_user.role == UserRole.TUTOR:
        # Resolve tutor profile for this user
        profile = await db.scalar(
            select(TutorProfile).where(TutorProfile.user_id == requesting_user.id)
        )
        if profile is None or profile.id != tutor_profile_id:
            raise _forbidden("You can only view your own tutor bookings.")
    elif requesting_user.role != UserRole.ADMIN:
        raise _forbidden("Insufficient permissions.")

    stmt = (
        select(Booking)
        .where(Booking.tutor_id == tutor_profile_id)
        .options(
            selectinload(Booking.transaction),
            selectinload(Booking.tutor),
            selectinload(Booking.subject),
            selectinload(Booking.student),
        )
    )
    if status_filter:
        stmt = stmt.where(Booking.status == status_filter)

    return await _paginate(stmt, page, page_size, db)


async def cancel_booking(
    booking_id: int,
    payload: BookingCancelRequest,
    requesting_user: User,
    db: AsyncSession,
) -> BookingResponse:
    """
    Cancel a booking.

    Students may cancel up to CANCEL_CUTOFF_HOURS before the session.
    Admins may cancel at any time.

    Raises
    ------
    403  user does not own the booking
    409  booking is not in a cancellable state
    400  student attempts to cancel inside the cutoff window
    """
    booking = await _load_booking(booking_id, db)

    if requesting_user.role != UserRole.ADMIN:
        if booking.student_id != requesting_user.id:
            raise _forbidden("You can only cancel your own bookings.")

        if booking.status not in (
            BookingStatus.PENDING_PAYMENT,
            BookingStatus.CONFIRMED,
        ):
            raise _conflict(
                f"Bookings in '{booking.status}' status cannot be cancelled."
            )

        # Enforce cancellation cutoff
        cutoff = _as_utc(booking.scheduled_at) - timedelta(hours=CANCEL_CUTOFF_HOURS)
        if datetime.now(tz=timezone.utc) > cutoff:
            raise _bad_request(
                f"Sessions may only be cancelled up to {CANCEL_CUTOFF_HOURS} hours "
                "in advance. Please contact support for late cancellations."
            )
    else:
        # Admins can cancel anything except already-completed sessions
        if booking.status == BookingStatus.COMPLETED:
            raise _conflict("Completed sessions cannot be cancelled.")

    booking.status = BookingStatus.CANCELLED
    booking.cancellation_reason = payload.reason
    await db.flush()

    logger.info(
        "Booking cancelled: booking_id=%s by user_id=%s reason=%r",
        booking.id,
        requesting_user.id,
        payload.reason,
    )
    return _build_response(booking)


async def confirm_booking(booking_id: int, db: AsyncSession) -> Booking:
    """
    Transition a booking from PENDING_PAYMENT → CONFIRMED.

    Called exclusively by payment_service after a successful Paystack
    webhook.  Not exposed directly to clients.

    Raises
    ------
    404  booking not found
    409  booking is not in PENDING_PAYMENT status (idempotent guard)
    """
    booking = await _load_booking(booking_id, db)

    if booking.status == BookingStatus.CONFIRMED:
        # Idempotent — webhook may fire more than once
        return booking

    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise _conflict(
            f"Cannot confirm a booking with status '{booking.status}'."
        )

    booking.status = BookingStatus.CONFIRMED
    await db.flush()

    logger.info("Booking confirmed: booking_id=%s", booking.id)
    return booking


async def mark_completed(
    booking_id: int,
    admin: User,
    db: AsyncSession,
) -> BookingResponse:
    """Admin: mark a CONFIRMED booking as COMPLETED after the session."""
    if admin.role != UserRole.ADMIN:
        raise _forbidden("Only admins can mark sessions as completed.")

    booking = await _load_booking(booking_id, db)
    if booking.status != BookingStatus.CONFIRMED:
        raise _conflict(
            f"Only confirmed bookings can be marked completed (current: '{booking.status}')."
        )

    booking.status = BookingStatus.COMPLETED
    await db.flush()
    logger.info("Booking completed: booking_id=%s", booking.id)
    return _build_response(booking)


async def mark_no_show(
    booking_id: int,
    admin: User,
    db: AsyncSession,
) -> BookingResponse:
    """Admin: mark a CONFIRMED booking as NO_SHOW."""
    if admin.role != UserRole.ADMIN:
        raise _forbidden("Only admins can mark no-shows.")

    booking = await _load_booking(booking_id, db)
    if booking.status != BookingStatus.CONFIRMED:
        raise _conflict(
            f"Only confirmed bookings can be marked as no-show (current: '{booking.status}')."
        )

    booking.status = BookingStatus.NO_SHOW
    await db.flush()
    logger.info("Booking no-show: booking_id=%s", booking.id)
    return _build_response(booking)


# ── Internal ──────────────────────────────────────────────────────────────────


async def _load_booking(booking_id: int, db: AsyncSession) -> Booking:
    """Load a booking with its relationships eagerly. Raises 404 if absent."""
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.transaction),
            selectinload(Booking.tutor),
            selectinload(Booking.subject),
            selectinload(Booking.student),
        )
    )
    if booking is None:
        raise _not_found("Booking", booking_id)
    return booking


async def _paginate(
    stmt,
    page: int,
    page_size: int,
    db: AsyncSession,
) -> PaginatedBookings:
    from sqlalchemy import func, select as sa_select

    count_stmt = sa_select(func.count()).select_from(stmt.subquery())
    total: int = (await db.scalar(count_stmt)) or 0

    offset = (page - 1) * page_size
    paged = (
        await db.scalars(
            stmt.order_by(Booking.scheduled_at.desc()).offset(offset).limit(page_size)
        )
    ).all()

    return PaginatedBookings.build(
        items=[_build_response(b) for b in paged],
        total=total,
        page=page,
        page_size=page_size,
    )
