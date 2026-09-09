"""Shared strokes, with booking authorization and bounded payloads."""
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Booking, User
from app.models.learning import BoardStroke
from app.services.learning_service import require_booking

router = APIRouter()
Coordinate = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]


class StrokeCreate(BaseModel):
    client_id: str = Field(min_length=1, max_length=100)
    points: list[tuple[Coordinate, Coordinate]] = Field(min_length=2, max_length=400)
    color: Literal["#183D36", "#D35E3F", "#3264A8", "#754C97"] = "#183D36"
    width: int = Field(default=4, ge=1, le=12)


async def writable(db, user, booking_id):
    booking = await require_booking(db, user, booking_id)
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    await db.refresh(booking)
    if booking.status != "confirmed":
        raise HTTPException(409, "The whiteboard is read-only outside confirmed sessions")
    return booking


@router.get("/bookings/{booking_id}/whiteboard")
async def strokes(booking_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await require_booking(db, user, booking_id)
    rows = (await db.scalars(select(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.hidden.is_(False)).order_by(BoardStroke.id))).all()
    return [{"id": r.id, "author_id": r.author_id, "points": r.points, "color": r.color, "width": r.width} for r in rows]


@router.post("/bookings/{booking_id}/whiteboard", status_code=201)
async def draw(booking_id: int, payload: StrokeCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await writable(db, user, booking_id)
    existing = await db.scalar(select(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.author_id == user.id, BoardStroke.client_id == payload.client_id))
    if existing:
        if existing.points != [list(p) for p in payload.points] or existing.color != payload.color or existing.width != payload.width:
            raise HTTPException(409, "Drawing request identifier already used")
        return {"id": existing.id}
    count = await db.scalar(select(func.count()).select_from(BoardStroke).where(BoardStroke.booking_id == booking_id))
    if count >= 2000:
        raise HTTPException(409, "This session has reached its drawing limit")
    active = await db.scalar(select(func.count()).select_from(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.hidden.is_(False)))
    if active >= 300:
        raise HTTPException(409, "The board is full. Ask your tutor to clear it before drawing more.")
    stroke = BoardStroke(booking_id=booking_id, author_id=user.id, **payload.model_dump())
    db.add(stroke)
    await db.commit()
    return {"id": stroke.id}


@router.delete("/bookings/{booking_id}/whiteboard/{stroke_id}")
async def undo(booking_id: int, stroke_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await writable(db, user, booking_id)
    stroke = await db.get(BoardStroke, stroke_id)
    if not stroke or stroke.booking_id != booking_id:
        raise HTTPException(404, "Stroke not found")
    if stroke.author_id != user.id:
        raise HTTPException(403, "You may only undo your own drawing")
    stroke.hidden = True
    await db.commit()
    return {"status": "ok"}


@router.delete("/bookings/{booking_id}/whiteboard")
async def clear(booking_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await require_booking(db, user, booking_id, teaching=True)
    await writable(db, user, booking_id)
    await db.execute(update(BoardStroke).where(BoardStroke.booking_id == booking_id).values(hidden=True))
    await db.commit()
    return {"status": "ok"}
