from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Booking, Transaction, User
from app.api.v1.endpoints.tutors import _require_tutor_profile

router = APIRouter()

TUTOR_PAYOUT_RATE = Decimal("0.70")
PLATFORM_FEE_RATE = Decimal("0.30")
MONEY = Decimal("0.01")


def money(value: Decimal) -> str:
    return str(value.quantize(MONEY, rounding=ROUND_HALF_UP))


@router.get("/me/stats")
async def stats(db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    profile = await _require_tutor_profile(user, db)
    rows = (await db.execute(select(Booking.status, func.count(), func.coalesce(func.sum(Booking.duration_minutes), 0)).where(Booking.tutor_id == profile.id).group_by(Booking.status))).all()
    counts = {state: count for state, count, _ in rows}
    minutes = next((minutes for state, _, minutes in rows if state == "completed"), 0)
    gross = Decimal(await db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).join(Booking, Booking.id == Transaction.booking_id).where(Booking.tutor_id == profile.id, Booking.status == "completed", Transaction.status == "success")))
    tutor_payout = gross * TUTOR_PAYOUT_RATE
    platform_fee = gross * PLATFORM_FEE_RATE
    return {
        "total_sessions": sum(counts.values()),
        "completed_sessions": counts.get("completed", 0),
        "pending_sessions": counts.get("pending_payment", 0),
        "total_earnings": money(tutor_payout),
        "tutor_payout": money(tutor_payout),
        "platform_fee": money(platform_fee),
        "gross_earnings": money(gross),
        "currency": profile.currency,
        "average_rating": str(profile.average_rating),
        "review_count": profile.review_count,
        "total_hours_taught": round(minutes / 60, 1),
        "tutor_payout_rate": float(TUTOR_PAYOUT_RATE),
        "platform_fee_rate": float(PLATFORM_FEE_RATE),
        "basis": "Tutor payout is 70% of paid completed sessions; Didaskey retains 30%. Refunded transactions are excluded.",
    }


@router.get("/me/students")
async def students(page: int = 1, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    from fastapi import HTTPException
    if page < 1:
        raise HTTPException(422, "Page must be positive")
    profile = await _require_tutor_profile(user, db)
    rows = (await db.execute(select(User.id, User.first_name, User.last_name, func.count(Booking.id), func.max(Booking.scheduled_at)).join(Booking, Booking.student_id == User.id).where(Booking.tutor_id == profile.id, Booking.status.in_(["confirmed", "completed"])).group_by(User.id, User.first_name, User.last_name).order_by(func.max(Booking.scheduled_at).desc()).offset((page - 1) * 50).limit(50))).all()
    return [{"id": id, "name": f"{first} {last}", "sessions": count, "last_session": last_session} for id, first, last, count, last_session in rows]
