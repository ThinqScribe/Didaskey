"""Shared authorization and persistence for learning endpoints."""
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Booking, TutorProfile, User
from app.models.learning import LearningItem, Notification, Submission, MessageReceipt, MessageDeliveryReceipt, LearningAttachment
from app.schemas.learning import ItemCreate


def visible_bookings(user: User):
    query = select(Booking).join(TutorProfile, Booking.tutor_id == TutorProfile.id)
    if user.role == "student":
        return query.where(Booking.student_id == user.id)
    if user.role == "tutor":
        return query.where(TutorProfile.user_id == user.id)
    if user.role == "admin":
        return query
    raise HTTPException(403, "This account cannot access learning sessions")


async def require_booking(db: AsyncSession, user: User, booking_id: int, teaching=False):
    booking = await db.scalar(visible_bookings(user).where(Booking.id == booking_id))
    if booking is None:
        raise HTTPException(404, "Session not found")
    if teaching and user.role not in ("tutor", "admin"):
        raise HTTPException(403, "Only the session tutor can do this")
    return booking


def notify(db: AsyncSession, user_id: int, title: str, body: str, booking_id: int):
    db.add(Notification(user_id=user_id, title=title, body=body[:500], booking_id=booking_id))


async def notify_user(db: AsyncSession, user_id: int, title: str, body: str, booking_id: int):
    from app.services.notification_service import create_notification
    await create_notification(db, user_id, title, body, booking_id, push=True)


def serialize(item):
    values = {column.name: getattr(item, column.name) for column in item.__table__.columns}
    for key, value in values.items():
        if isinstance(value, datetime) and value.tzinfo is None:
            values[key] = value.replace(tzinfo=timezone.utc)
    return values


async def list_items(db: AsyncSession, user: User, booking_id=None, kind=None, after=0, limit=50):
    allowed = visible_bookings(user).with_only_columns(Booking.id).order_by(None)
    query = select(LearningItem, User.first_name, User.last_name).join(User, User.id == LearningItem.author_id).where(LearningItem.booking_id.in_(allowed), LearningItem.id > after)
    if booking_id is not None:
        await require_booking(db, user, booking_id)
        query = query.where(LearningItem.booking_id == booking_id)
    if kind:
        query = query.where(LearningItem.kind == kind)
    rows = (await db.execute(query.order_by(LearningItem.id).limit(limit))).all()
    ids = [row[0].id for row in rows]
    submissions = (await db.scalars(select(Submission).where(Submission.assignment_id.in_(ids)))).all() if ids else []
    by_assignment = {s.assignment_id: serialize(s) for s in submissions}
    attachments = (await db.scalars(select(LearningAttachment).where(LearningAttachment.item_id.in_(ids)))).all() if ids else []
    files = {a.item_id: {"filename": a.filename, "media_type": a.media_type, "size": a.size} for a in attachments}
    reply_ids = {row[0].reply_to_item_id for row in rows if row[0].reply_to_item_id}
    replies = (await db.execute(
        select(LearningItem, User.first_name, User.last_name)
        .join(User, User.id == LearningItem.author_id)
        .where(LearningItem.id.in_(reply_ids))
    )).all() if reply_ids else []
    reply_map = {
        item.id: {
            "id": item.id,
            "author_id": item.author_id,
            "author_name": f"{first} {last}",
            "body": item.body[:280],
            "kind": item.kind,
        }
        for item, first, last in replies
    }
    booking_ids = {row[0].booking_id for row in rows}
    receipts = (await db.scalars(select(MessageReceipt).where(MessageReceipt.booking_id.in_(booking_ids)))).all() if rows else []
    deliveries = (await db.scalars(select(MessageDeliveryReceipt).where(MessageDeliveryReceipt.booking_id.in_(booking_ids)))).all() if rows else []
    result = []
    for item, first, last in rows:
        values = serialize(item)
        extra = values.pop("extra", None) or {}
        raw_reactions = extra.pop("reactions", {}) if isinstance(extra, dict) else {}
        reactions = [
            {"emoji": emoji, "count": len(user_ids), "mine": user.id in user_ids}
            for emoji, user_ids in sorted(raw_reactions.items())
            if isinstance(user_ids, list) and user_ids
        ]
        result.append({
            **values,
            "extra": extra,
            "reactions": reactions,
            "author_name": f"{first} {last}",
            "submission": by_assignment.get(item.id),
            "attachment": files.get(item.id),
            "reply_to": reply_map.get(item.reply_to_item_id),
            "delivered_by_recipient": item.kind == "message" and any(r.booking_id == item.booking_id and r.user_id != item.author_id and r.last_item_id >= item.id for r in deliveries + receipts),
            "read_by_recipient": item.kind == "message" and any(r.booking_id == item.booking_id and r.user_id != item.author_id and r.last_item_id >= item.id for r in receipts),
        })
    return result


async def create_item(db: AsyncSession, user: User, booking_id: int, payload: ItemCreate):
    booking = await require_booking(db, user, booking_id, teaching=payload.kind != "message")
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    await db.refresh(booking)
    if booking.status not in ("confirmed", "completed"):
        raise HTTPException(409, "Learning tools open after payment confirmation")
    if payload.client_id:
        existing = await db.scalar(select(LearningItem).where(LearningItem.author_id == user.id, LearningItem.client_id == payload.client_id))
        if existing:
            if (existing.booking_id != booking_id or existing.kind != payload.kind or existing.body != payload.body
                    or existing.title != payload.title or existing.url != (str(payload.url) if payload.url else None)
                    or existing.reply_to_item_id != payload.reply_to_item_id
                    or (existing.due_at.isoformat() if existing.due_at else None) != (payload.due_at.isoformat() if payload.due_at else None)):
                raise HTTPException(409, "This request identifier has already been used")
            return serialize(existing)
    if payload.reply_to_item_id is not None:
        reply = await db.get(LearningItem, payload.reply_to_item_id)
        if reply is None or reply.booking_id != booking_id or reply.kind != "message":
            raise HTTPException(404, "Message being replied to was not found")
    item = LearningItem(booking_id=booking_id, author_id=user.id, **payload.model_dump(exclude={"url"}), url=str(payload.url) if payload.url else None)
    db.add(item)
    recipient = booking.tutor.user_id if user.id == booking.student_id else booking.student_id
    await notify_user(db, recipient, f"New {payload.kind} from {user.first_name}", payload.title or payload.body, booking_id)
    await db.commit()
    await db.refresh(item)
    return serialize(item)
