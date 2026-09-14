from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.security import decode_token
from app.db.session import async_session_factory, get_db_session
from app.models import Booking, User
from app.models.learning import LearningAttachment, LearningItem, MessageReceipt
from app.schemas.learning import ItemCreate
from app.services.learning_service import create_item, list_items, notify, require_booking, visible_bookings

router = APIRouter()

ALLOWED_ATTACHMENT_TYPES = {
    b"%PDF-": ("application/pdf", "pdf"),
    b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
    b"\xff\xd8\xff": ("image/jpeg", "jpg"),
}
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
MAX_REACTIONS_PER_MESSAGE = 8


class ReactionPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    emoji: str = Field(min_length=1, max_length=16)
    remove: bool = False


class ReadPosition(BaseModel):
    last_item_id: int = Field(gt=0)


class MessagePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    body: str = Field(min_length=1, max_length=20000)
    client_id: str | None = Field(default=None, min_length=1, max_length=100)
    reply_to_item_id: int | None = Field(default=None, gt=0)


class ChatConnectionManager:
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


manager = ChatConnectionManager()


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


def _counterpart(booking: Booking, user: User) -> str:
    if user.role == "student":
        return booking.tutor.display_name
    return f"{booking.student.first_name} {booking.student.last_name}"


def _attachment_signature(content: bytes, booking_id: int, user_id: int) -> str:
    return f"chat-file-{booking_id}-{user_id}-{hashlib.sha256(content).hexdigest()}"


async def _message_response(db: AsyncSession, user: User, booking_id: int, item_id: int) -> dict[str, Any]:
    rows = await list_items(db, user, booking_id, after=max(0, item_id - 1), limit=1)
    return rows[0] if rows else {}


async def _mark_read(db: AsyncSession, user: User, booking_id: int, last_item_id: int) -> None:
    booking = await require_booking(db, user, booking_id)
    if user.id not in (booking.student_id, booking.tutor.user_id):
        raise HTTPException(403, "Only session participants can mark messages read")
    item = await db.get(LearningItem, last_item_id)
    if item is None or item.booking_id != booking_id or item.kind != "message":
        raise HTTPException(404, "Message not found")
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    receipt = await db.get(MessageReceipt, (booking_id, user.id))
    if receipt is None:
        db.add(MessageReceipt(booking_id=booking_id, user_id=user.id, last_item_id=item.id, read_at=datetime.now(timezone.utc)))
    elif item.id > receipt.last_item_id:
        receipt.last_item_id = item.id
        receipt.read_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("")
async def list_conversations(
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    bookings = (await db.scalars(
        visible_bookings(user)
        .where(Booking.status.in_(["confirmed", "completed"]))
        .order_by(Booking.scheduled_at.desc())
        .offset((page - 1) * 50)
        .limit(50)
    )).unique().all()
    if not bookings:
        return []

    booking_ids = [b.id for b in bookings]
    latest_ids = select(func.max(LearningItem.id)).where(
        LearningItem.kind == "message",
        LearningItem.booking_id.in_(booking_ids),
    ).group_by(LearningItem.booking_id)
    messages = (await db.scalars(select(LearningItem).where(LearningItem.id.in_(latest_ids)))).all()
    by_booking = {m.booking_id: m for m in messages}
    receipts = (await db.scalars(select(MessageReceipt).where(
        MessageReceipt.booking_id.in_(booking_ids),
        MessageReceipt.user_id == user.id,
    ))).all()
    read_positions = {r.booking_id: r.last_item_id for r in receipts}
    unread_counts = dict((await db.execute(
        select(LearningItem.booking_id, func.count())
        .where(
            LearningItem.kind == "message",
            LearningItem.booking_id.in_(booking_ids),
            LearningItem.author_id != user.id,
            LearningItem.id > func.coalesce(
                select(MessageReceipt.last_item_id)
                .where(MessageReceipt.booking_id == LearningItem.booking_id, MessageReceipt.user_id == user.id)
                .scalar_subquery(),
                0,
            ),
        )
        .group_by(LearningItem.booking_id)
    )).all())

    return [
        {
            "booking_id": b.id,
            "title": b.subject.name if b.subject else "Tutoring session",
            "counterpart": _counterpart(b, user),
            "last_message": by_booking.get(b.id).body if by_booking.get(b.id) else None,
            "last_message_at": by_booking.get(b.id).created_at if by_booking.get(b.id) else None,
            "scheduled_at": b.scheduled_at,
            "unread_count": unread_counts.get(b.id, 0),
            "last_read_item_id": read_positions.get(b.id, 0),
        }
        for b in bookings
    ]


@router.get("/bookings/{booking_id}")
async def conversation_messages(
    booking_id: int,
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    return await list_items(db, user, booking_id, kind="message", after=after, limit=limit)


@router.post("/bookings/{booking_id}", status_code=201)
async def publish_message(
    booking_id: int,
    payload: MessagePayload,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    created = await create_item(
        db,
        user,
        booking_id,
        ItemCreate(
            kind="message",
            body=payload.body,
            client_id=payload.client_id,
            reply_to_item_id=payload.reply_to_item_id,
        ),
    )
    message = await _message_response(db, user, booking_id, created["id"])
    await manager.broadcast(booking_id, {"type": "message", "message": message})
    return message


@router.post("/bookings/{booking_id}/attachments", status_code=201)
async def upload_message_attachment(
    booking_id: int,
    file: UploadFile = File(...),
    reply_to_item_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    booking = await require_booking(db, user, booking_id)
    if booking.status not in ("confirmed", "completed"):
        raise HTTPException(409, "Messages open after payment confirmation")
    content = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if not content or len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Choose a non-empty file up to 8 MB")
    match = next((value for signature, value in ALLOWED_ATTACHMENT_TYPES.items() if content.startswith(signature)), None)
    if match is None:
        raise HTTPException(415, "Only PDF, PNG and JPEG files are supported")
    if reply_to_item_id is not None:
        reply = await db.get(LearningItem, reply_to_item_id)
        if reply is None or reply.booking_id != booking_id or reply.kind != "message":
            raise HTTPException(404, "Message being replied to was not found")

    media_type, extension = match
    identity = _attachment_signature(content, booking_id, user.id)
    existing = await db.scalar(select(LearningItem).where(LearningItem.author_id == user.id, LearningItem.client_id == identity))
    if existing is not None:
        response = await _message_response(db, user, booking_id, existing.id)
        await manager.broadcast(booking_id, {"type": "message", "message": response})
        return response

    title = (file.filename or "Shared document").replace("\\", "/").split("/")[-1][:160]
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    item = LearningItem(
        booking_id=booking_id,
        author_id=user.id,
        kind="message",
        title=title,
        body=f"Shared {title}",
        client_id=identity,
        reply_to_item_id=reply_to_item_id,
        extra={"attachment_kind": "document"},
    )
    db.add(item)
    await db.flush()
    db.add(LearningAttachment(
        item_id=item.id,
        filename=f"didaskey-chat-{item.id}.{extension}",
        media_type=media_type,
        size=len(content),
        content=content,
    ))
    recipient = booking.tutor.user_id if user.id == booking.student_id else booking.student_id
    notify(db, recipient, f"New file from {user.first_name}", title, booking_id)
    await db.commit()
    response = await _message_response(db, user, booking_id, item.id)
    await manager.broadcast(booking_id, {"type": "message", "message": response})
    return response


@router.put("/bookings/{booking_id}/read")
async def mark_read(
    booking_id: int,
    payload: ReadPosition,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    await _mark_read(db, user, booking_id, payload.last_item_id)
    await manager.broadcast(booking_id, {"type": "read", "booking_id": booking_id, "user_id": user.id, "last_item_id": payload.last_item_id})
    return {"status": "ok"}


@router.put("/bookings/{booking_id}/messages/{item_id}/reaction")
async def toggle_reaction(
    booking_id: int,
    item_id: int,
    payload: ReactionPayload,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    await require_booking(db, user, booking_id)
    await db.scalar(select(LearningItem.id).where(LearningItem.id == item_id).with_for_update())
    item = await db.get(LearningItem, item_id)
    if item is None or item.booking_id != booking_id or item.kind != "message":
        raise HTTPException(404, "Message not found")
    emoji = payload.emoji.strip()
    if not emoji:
        raise HTTPException(422, "Emoji is required")
    extra = dict(item.extra or {})
    reactions: dict[str, list[int]] = {k: list(v) for k, v in (extra.get("reactions") or {}).items() if isinstance(v, list)}
    users = set(reactions.get(emoji, []))
    if payload.remove or user.id in users:
        users.discard(user.id)
    else:
        if len(reactions) >= MAX_REACTIONS_PER_MESSAGE and emoji not in reactions:
            raise HTTPException(409, "This message already has too many reaction types")
        users.add(user.id)
    if users:
        reactions[emoji] = sorted(users)
    else:
        reactions.pop(emoji, None)
    extra["reactions"] = reactions
    item.extra = extra
    await db.commit()
    response = await _message_response(db, user, booking_id, item.id)
    await manager.broadcast(booking_id, {"type": "reaction", "message": response})
    return response


@router.websocket("/ws/{booking_id}")
async def messages_ws(websocket: WebSocket, booking_id: int, token: str | None = Query(default=None)):
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
                await require_booking(db, user, booking_id)
                if event_type == "message":
                    try:
                        item_payload = ItemCreate(
                            kind="message",
                            body=str(payload.get("body", "")).strip(),
                            client_id=payload.get("client_id"),
                            reply_to_item_id=payload.get("reply_to_item_id"),
                        )
                    except ValidationError:
                        await websocket.send_json({"type": "error", "detail": "Message is empty or invalid"})
                        continue
                    try:
                        created = await create_item(db, user, booking_id, item_payload)
                    except HTTPException as exc:
                        await websocket.send_json({"type": "error", "detail": exc.detail})
                        continue
                    message = await _message_response(db, user, booking_id, created["id"])
                    await manager.broadcast(booking_id, {"type": "message", "message": message})
                elif event_type == "typing":
                    await manager.broadcast(booking_id, {"type": "typing", "booking_id": booking_id, "user_id": user.id, "is_typing": bool(payload.get("is_typing"))})
                elif event_type == "read":
                    try:
                        last_item_id = int(payload.get("last_item_id", 0))
                    except (TypeError, ValueError):
                        await websocket.send_json({"type": "error", "detail": "Read position is invalid"})
                        continue
                    await _mark_read(db, user, booking_id, last_item_id)
                    await manager.broadcast(booking_id, {"type": "read", "booking_id": booking_id, "user_id": user.id, "last_item_id": last_item_id})
                else:
                    await websocket.send_json({"type": "error", "detail": "Unsupported message event"})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(booking_id, websocket)
