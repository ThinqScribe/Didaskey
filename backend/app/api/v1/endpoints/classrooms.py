"""
Live video classroom endpoints.

Route map
---------
GET  /classrooms/bookings/{booking_id}         — join-window + status (poll-friendly)
POST /classrooms/bookings/{booking_id}/join    — issue a LiveKit access token
POST /classrooms/bookings/{booking_id}/leave   — record that the caller left
POST /classrooms/bookings/{booking_id}/end     — tutor/admin ends the session

Auth
----
All routes require a valid Bearer token. Only the booking's student, the
booking's tutor, or an admin may access a given booking's classroom —
enforced by ``classroom_service``.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.communication import ClassroomJoinResponse, ClassroomResponse
from app.services import classroom_service

router = APIRouter()


@router.get(
    "/bookings/{booking_id}",
    response_model=ClassroomResponse,
    summary="Get classroom + join-window status for a booking",
    description=(
        "Returns whether the classroom is currently joinable, along with "
        "the opening/closing time of the join window. Safe to poll."
    ),
)
async def get_classroom_status(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ClassroomResponse:
    return await classroom_service.get_status(booking_id, current_user, db)


@router.post(
    "/bookings/{booking_id}/join",
    response_model=ClassroomJoinResponse,
    summary="Join the live classroom for a confirmed, online booking",
    description=(
        "Issues a short-lived LiveKit access token. Only available within "
        "the join window (a few minutes before the scheduled start, until "
        "shortly after the scheduled end)."
    ),
)
async def join_classroom(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ClassroomJoinResponse:
    result = await classroom_service.join(booking_id, current_user, db)
    await db.commit()
    return result


@router.post(
    "/bookings/{booking_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Record that the caller left the classroom",
)
async def leave_classroom(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await classroom_service.leave(booking_id, current_user, db)
    await db.commit()


@router.post(
    "/bookings/{booking_id}/end",
    response_model=ClassroomResponse,
    summary="End the session (tutor or admin only)",
    description=(
        "Force-disconnects any remaining participants and marks the "
        "booking as completed."
    ),
)
async def end_classroom(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ClassroomResponse:
    result = await classroom_service.end(booking_id, current_user, db)
    await db.commit()
    return result
