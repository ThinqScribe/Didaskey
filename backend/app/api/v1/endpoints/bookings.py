"""
Student-facing booking endpoints.

Route map
---------
POST   /bookings                          — create booking + pending transaction
GET    /bookings                          — list own bookings (student) or all (admin)
GET    /bookings/{booking_id}             — get single booking
PATCH  /bookings/{booking_id}/cancel      — cancel booking
PATCH  /bookings/{booking_id}/complete    — mark completed       (admin only)
PATCH  /bookings/{booking_id}/no-show     — mark no-show         (admin only)

Auth
----
All routes require a valid Bearer access token.  Students see only their
own bookings; admins see everything.  No endpoint leaks data across
ownership boundaries — the service layer enforces all ownership checks.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, AwareDatetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db_session
from app.models.billing import BookingStatus
from app.models.user import User, UserRole
from app.schemas.billing import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingResponse,
    BookingWithPaystackResponse,
    PaginatedBookings,
)
from app.services import booking_service, payment_service

router = APIRouter()


class RescheduleRequest(BaseModel):
    scheduled_at: AwareDatetime


@router.patch("/{booking_id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(booking_id: int, payload: RescheduleRequest,
                             db: AsyncSession = Depends(get_db_session),
                             user: User = Depends(get_current_user)):
    result = await booking_service.reschedule_booking(booking_id, payload.scheduled_at, user, db)
    await db.commit()
    return result


@router.post(
    "",
    response_model=BookingWithPaystackResponse,
    status_code=201,
    summary="Create a booking",
    description=(
        "Creates a booking and a pending payment transaction. "
        "Returns the Paystack `access_code` needed by the mobile SDK "
        "to launch the payment sheet. "
        "The booking transitions to `confirmed` only after payment succeeds."
    ),
)
async def create_booking(
    payload: BookingCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> BookingWithPaystackResponse:
    """
    Only students may create bookings.
    Tutors and admins are rejected at the service layer.
    """
    booking, reference = await booking_service.create_booking(payload, current_user, db)

    # Immediately initiate Paystack so the client gets the access_code
    # in a single round-trip rather than requiring a separate POST /payments/initiate.
    init = await payment_service.initiate_payment(booking.id, current_user, db)

    await db.commit()

    return BookingWithPaystackResponse(
        id=booking.id,
        student_id=booking.student_id,
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
        transaction=None,  # access_code carries the payment info
        paystack_access_code=init.access_code,
        paystack_reference=init.reference,
        authorization_url=init.authorization_url,
    )


@router.get(
    "",
    response_model=PaginatedBookings,
    summary="List bookings",
    description=(
        "Students see only their own bookings. "
        "Admins may filter by any `student_id` or `tutor_id`. "
        "Optionally filter by `status`."
    ),
)
async def list_bookings(
    student_id: int | None = Query(
        default=None,
        gt=0,
        description="Filter by student (admin only for other users' IDs)",
    ),
    tutor_id: int | None = Query(
        default=None,
        gt=0,
        description="Filter by tutor profile ID (admin or the tutor themselves)",
    ),
    status: BookingStatus | None = Query(
        default=None,
        description="Filter by booking status",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> PaginatedBookings:
    if tutor_id is not None:
        return await booking_service.list_tutor_bookings(
            tutor_id,
            current_user,
            db,
            status_filter=status,
            page=page,
            page_size=page_size,
        )

    # Default: list by student
    target_student_id = student_id if student_id is not None else current_user.id
    return await booking_service.list_student_bookings(
        target_student_id,
        current_user,
        db,
        status_filter=status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{booking_id}",
    response_model=BookingResponse,
    summary="Get a single booking",
    description="Returns the full booking detail. Only accessible to the owning student, the tutor, or an admin.",
)
async def get_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> BookingResponse:
    return await booking_service.get_booking(booking_id, current_user, db)


@router.patch(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
    summary="Cancel a booking",
    description=(
        "Students may cancel up to 24 hours before the session. "
        "Admins may cancel at any time (except completed sessions)."
    ),
)
async def cancel_booking(
    booking_id: int,
    payload: BookingCancelRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> BookingResponse:
    result = await booking_service.cancel_booking(
        booking_id, payload, current_user, db
    )
    await db.commit()
    return result


@router.patch(
    "/{booking_id}/complete",
    response_model=BookingResponse,
    summary="Mark a booking as completed (admin only)",
    description="Transitions a confirmed booking to `completed` after the session has taken place.",
)
async def complete_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    admin: User = Depends(require_role(UserRole.ADMIN)),
) -> BookingResponse:
    result = await booking_service.mark_completed(booking_id, admin, db)
    await db.commit()
    return result


@router.patch(
    "/{booking_id}/no-show",
    response_model=BookingResponse,
    summary="Mark a booking as no-show (admin only)",
    description="Marks a confirmed booking as no-show when the student did not attend.",
)
async def no_show_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    admin: User = Depends(require_role(UserRole.ADMIN)),
) -> BookingResponse:
    result = await booking_service.mark_no_show(booking_id, admin, db)
    await db.commit()
    return result
