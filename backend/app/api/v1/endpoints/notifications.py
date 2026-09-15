from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import User
from app.models.learning import Notification
from app.services.learning_service import serialize
from app.services.notification_service import register_push_token, send_due_lesson_reminders

router = APIRouter()


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    platform: str = Field(default="unknown", max_length=20)
    device_id: str | None = Field(default=None, max_length=120)


@router.get("")
async def list_notifications(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc()).offset((page - 1) * 50).limit(50))).all()
    return [serialize(n) for n in rows]


@router.put("/read-all")
async def read_all(db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"ok": True}


@router.put("/{notification_id}/read")
async def read_one(notification_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    row = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Notification not found")
    row.read_at = row.read_at or datetime.now(timezone.utc)
    await db.commit()
    return serialize(row)


@router.post("/push-token")
async def save_push_token(
    payload: PushTokenRequest,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    await register_push_token(db, user, payload.token, payload.platform, payload.device_id)
    return {"ok": True}


@router.post("/reminders/due")
async def send_due_reminders(
    minutes_before: int = Query(30, ge=1, le=1440),
    window_minutes: int = Query(5, ge=1, le=60),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Only administrators can send reminder batches")
    return {"sent": await send_due_lesson_reminders(db, minutes_before, window_minutes)}
