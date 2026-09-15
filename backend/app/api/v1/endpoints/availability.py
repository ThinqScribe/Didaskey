"""Authoritative WAT availability for the current Nigerian tutoring service."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db_session
from app.models import Booking, TutorAvailability, TutorProfile

router = APIRouter()


@router.get("/{tutor_id}/slots")
async def slots(tutor_id: int, day: date, duration: int = Query(60, ge=30, le=480), db: AsyncSession = Depends(get_db_session)):
    tutor = await db.get(TutorProfile, tutor_id)
    if tutor is None or not tutor.is_active or tutor.verification_status != "verified":
        raise HTTPException(404, "Tutor not found")
    tz = ZoneInfo("Africa/Lagos")
    if day > datetime.now(tz).date() + timedelta(days=180):
        raise HTTPException(422, "Choose a date within the next six months")
    windows = (await db.scalars(select(TutorAvailability).where(TutorAvailability.tutor_id == tutor_id, TutorAvailability.day_of_week == day.strftime("%A").lower()))).all()
    start_day = datetime.combine(day, datetime.min.time(), tz)
    reservations = (await db.scalars(select(Booking).where(Booking.tutor_id == tutor_id, Booking.status.in_(["confirmed", "pending_payment"]), Booking.scheduled_at >= start_day - timedelta(days=1), Booking.scheduled_at < start_day + timedelta(days=1)))).unique().all()
    def utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    available = set()
    for window in windows:
        current = datetime.combine(day, window.start_time, tz)
        end = datetime.combine(day, window.end_time, tz)
        while current + timedelta(minutes=duration) <= end:
            finish = current + timedelta(minutes=duration)
            if current > datetime.now(tz) and not any(utc(b.scheduled_at) < finish and utc(b.scheduled_at) + timedelta(minutes=b.duration_minutes) > current for b in reservations):
                available.add(current.strftime("%H:%M:%S"))
            current += timedelta(minutes=30)
    return {"timezone": "Africa/Lagos", "slots": sorted(available)}
