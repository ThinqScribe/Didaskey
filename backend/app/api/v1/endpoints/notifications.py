from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import User
from app.models.learning import Notification
from app.services.learning_service import serialize

router = APIRouter()


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
