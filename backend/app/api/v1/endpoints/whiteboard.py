"""Shared strokes, with booking authorization and bounded payloads."""
from typing import Annotated, Any, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.core.security import decode_token
from app.db.session import async_session_factory
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


class BoardConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, booking_id: int, websocket: WebSocket) -> None:
        self._connections.setdefault(booking_id, set()).add(websocket)

    def disconnect(self, booking_id: int, websocket: WebSocket) -> None:
        sockets = self._connections.get(booking_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._connections.pop(booking_id, None)

    async def broadcast(self, booking_id: int, payload: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for socket in list(self._connections.get(booking_id, ())):
            try:
                await socket.send_json(payload)
            except RuntimeError:
                stale.append(socket)
        for socket in stale:
            self.disconnect(booking_id, socket)


manager = BoardConnectionManager()


async def _user_from_token(db: AsyncSession, token: str | None) -> User:
    credentials_exception = HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not validate credentials")
    if not token:
        raise credentials_exception
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise credentials_exception
    user = await db.get(User, user_id)
    if user is None or not user.is_active or not user.is_verified:
        raise credentials_exception
    if str(payload.get("version", "0")) != str(user.token_version):
        raise credentials_exception
    return user


def _serialize(stroke: BoardStroke) -> dict[str, Any]:
    return {
        "id": stroke.id,
        "author_id": stroke.author_id,
        "client_id": stroke.client_id,
        "points": stroke.points,
        "color": stroke.color,
        "width": stroke.width,
    }


async def writable(db, user, booking_id):
    booking = await require_booking(db, user, booking_id)
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    await db.refresh(booking)
    if booking.status != "confirmed":
        raise HTTPException(409, "The whiteboard is read-only outside confirmed sessions")
    return booking


async def _create_stroke(db: AsyncSession, user: User, booking_id: int, payload: StrokeCreate) -> BoardStroke:
    await writable(db, user, booking_id)
    existing = await db.scalar(select(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.author_id == user.id, BoardStroke.client_id == payload.client_id))
    if existing:
        if existing.points != [list(p) for p in payload.points] or existing.color != payload.color or existing.width != payload.width:
            raise HTTPException(409, "Drawing request identifier already used")
        return existing
    count = await db.scalar(select(func.count()).select_from(BoardStroke).where(BoardStroke.booking_id == booking_id))
    if count >= 2000:
        raise HTTPException(409, "This session has reached its drawing limit")
    active = await db.scalar(select(func.count()).select_from(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.hidden.is_(False)))
    if active >= 300:
        raise HTTPException(409, "The board is full. Ask your tutor to clear it before drawing more.")
    stroke = BoardStroke(booking_id=booking_id, author_id=user.id, **payload.model_dump())
    db.add(stroke)
    await db.commit()
    await db.refresh(stroke)
    return stroke


async def _undo_stroke(db: AsyncSession, user: User, booking_id: int, stroke_id: int) -> int:
    await writable(db, user, booking_id)
    stroke = await db.get(BoardStroke, stroke_id)
    if not stroke or stroke.booking_id != booking_id:
        raise HTTPException(404, "Stroke not found")
    if stroke.author_id != user.id:
        raise HTTPException(403, "You may only undo your own drawing")
    stroke.hidden = True
    await db.commit()
    return stroke_id


async def _clear_strokes(db: AsyncSession, user: User, booking_id: int) -> None:
    await require_booking(db, user, booking_id, teaching=True)
    await writable(db, user, booking_id)
    await db.execute(update(BoardStroke).where(BoardStroke.booking_id == booking_id).values(hidden=True))
    await db.commit()


@router.get("/bookings/{booking_id}/whiteboard")
async def strokes(booking_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await require_booking(db, user, booking_id)
    rows = (await db.scalars(select(BoardStroke).where(BoardStroke.booking_id == booking_id, BoardStroke.hidden.is_(False)).order_by(BoardStroke.id))).all()
    return [_serialize(r) for r in rows]


@router.post("/bookings/{booking_id}/whiteboard", status_code=201)
async def draw(booking_id: int, payload: StrokeCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    stroke = await _create_stroke(db, user, booking_id, payload)
    serialized = _serialize(stroke)
    await manager.broadcast(booking_id, {"type": "stroke", "stroke": serialized})
    return serialized


@router.delete("/bookings/{booking_id}/whiteboard/{stroke_id}")
async def undo(booking_id: int, stroke_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await _undo_stroke(db, user, booking_id, stroke_id)
    await manager.broadcast(booking_id, {"type": "undo", "stroke_id": stroke_id})
    return {"status": "ok"}


@router.delete("/bookings/{booking_id}/whiteboard")
async def clear(booking_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    await _clear_strokes(db, user, booking_id)
    await manager.broadcast(booking_id, {"type": "clear"})
    return {"status": "ok"}


@router.websocket("/bookings/{booking_id}/whiteboard/ws")
async def whiteboard_ws(websocket: WebSocket, booking_id: int, token: str | None = Query(default=None)):
    await websocket.accept()
    user_id: int | None = None
    try:
        async with async_session_factory() as db:
            user = await _user_from_token(db, token)
            await require_booking(db, user, booking_id)
            user_id = user.id
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(booking_id, websocket)
    try:
        await websocket.send_json({"type": "ready", "booking_id": booking_id})
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")
            async with async_session_factory() as db:
                user = await db.get(User, user_id)
                if user is None:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
                try:
                    if event_type == "stroke":
                        stroke_payload = StrokeCreate(
                            client_id=str(payload.get("client_id", "")),
                            points=payload.get("points", []),
                            color=payload.get("color", "#183D36"),
                            width=payload.get("width", 4),
                        )
                        stroke = await _create_stroke(db, user, booking_id, stroke_payload)
                        await manager.broadcast(booking_id, {"type": "stroke", "stroke": _serialize(stroke)})
                    elif event_type == "undo":
                        stroke_id = int(payload.get("stroke_id", 0))
                        await _undo_stroke(db, user, booking_id, stroke_id)
                        await manager.broadcast(booking_id, {"type": "undo", "stroke_id": stroke_id})
                    elif event_type == "clear":
                        await _clear_strokes(db, user, booking_id)
                        await manager.broadcast(booking_id, {"type": "clear"})
                    else:
                        await websocket.send_json({"type": "error", "detail": "Unsupported whiteboard event"})
                except (TypeError, ValueError, ValidationError):
                    await websocket.send_json({"type": "error", "detail": "Whiteboard event is invalid"})
                except HTTPException as exc:
                    await websocket.send_json({"type": "error", "detail": exc.detail})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(booking_id, websocket)
