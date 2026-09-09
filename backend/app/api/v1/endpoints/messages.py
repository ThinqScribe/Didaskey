from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Booking, User
from app.models.learning import LearningItem
from app.services.learning_service import visible_bookings

router = APIRouter()


@router.get("")
async def list_conversations(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    bookings = (await db.scalars(visible_bookings(user).where(Booking.status.in_(["confirmed", "completed"])).order_by(Booking.scheduled_at.desc()).offset((page - 1) * 50).limit(50))).unique().all()
    latest = select(func.max(LearningItem.id)).where(LearningItem.kind == "message", LearningItem.booking_id.in_([b.id for b in bookings])).group_by(LearningItem.booking_id)
    messages = (await db.scalars(select(LearningItem).where(LearningItem.id.in_(latest)))).all()
    by_booking = {m.booking_id: m.body for m in messages}
    return [{"booking_id": b.id, "title": b.subject.name if b.subject else "Tutoring session", "counterpart": b.tutor.display_name if user.role == "student" else f"{b.student.first_name} {b.student.last_name}", "last_message": by_booking.get(b.id), "scheduled_at": b.scheduled_at} for b in bookings]
