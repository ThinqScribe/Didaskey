from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Booking, User
from app.models.learning import LearningItem, Submission
from app.services.learning_service import visible_bookings

router = APIRouter()


@router.get("")
async def learner_progress(db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    ids = visible_bookings(user).with_only_columns(Booking.id).order_by(None)
    completed, minutes = (await db.execute(select(func.count(), func.coalesce(func.sum(Booking.duration_minutes), 0)).where(Booking.id.in_(ids), Booking.status == "completed"))).one()
    assignments = select(LearningItem.id).where(LearningItem.booking_id.in_(ids), LearningItem.kind == "assignment")
    total = await db.scalar(select(func.count()).select_from(assignments.subquery()))
    submitted, reviewed = (await db.execute(select(func.count(), func.count(Submission.reviewed_at)).where(Submission.assignment_id.in_(assignments)))).one()
    return {"completed_sessions": completed, "learning_minutes": minutes, "assignments": total, "submitted": submitted, "reviewed": reviewed, "pending": total - submitted}
