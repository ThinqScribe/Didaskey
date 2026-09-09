from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Booking, User
from app.services.learning_service import visible_bookings
from app.services.booking_service import _build_response

router = APIRouter()


@router.get("")
async def list_sessions(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    rows = (await db.scalars(visible_bookings(user).options(selectinload(Booking.transaction)).order_by(Booking.scheduled_at.desc()).offset((page - 1) * 50).limit(50))).unique().all()
    return [_build_response(b) for b in rows]
