from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response
from sqlalchemy import select, func
import hashlib
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import User, Booking
from app.models.learning import LearningItem, Submission, MessageReceipt, LearningAttachment
from app.schemas.learning import FeedbackCreate, ItemCreate, SubmissionCreate
from app.services.learning_service import create_item, list_items, notify, require_booking, serialize

router = APIRouter()


@router.post("/bookings/{booking_id}/files", status_code=201)
async def upload_material(booking_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    booking = await require_booking(db, user, booking_id, teaching=True)
    await db.scalar(select(Booking.id).where(Booking.id == booking_id).with_for_update())
    await db.refresh(booking)
    if booking.status not in ("confirmed", "completed"):
        raise HTTPException(409, "Materials can only be shared in paid sessions")
    content = await file.read(8 * 1024 * 1024 + 1)
    if not content or len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "Choose a non-empty file up to 8 MB")
    formats = [(b"%PDF-", "application/pdf", "pdf"), (b"\x89PNG\r\n\x1a\n", "image/png", "png"), (b"\xff\xd8\xff", "image/jpeg", "jpg")]
    match = next((f for f in formats if content.startswith(f[0])), None)
    if match is None:
        raise HTTPException(415, "Only PDF, PNG and JPEG files are supported")
    # The same tutor retrying an identical upload gets the existing resource.
    identity = f"file-{booking_id}-{hashlib.sha256(content).hexdigest()}"
    existing = await db.scalar(select(LearningItem).where(LearningItem.author_id == user.id, LearningItem.client_id == identity))
    if existing is not None:
        return {"item_id": existing.id}
    count = await db.scalar(select(func.count()).select_from(LearningAttachment).join(LearningItem, LearningItem.id == LearningAttachment.item_id).where(LearningItem.booking_id == booking_id))
    if count >= 25:
        raise HTTPException(409, "This session has reached its 25-file limit")
    # Never use a user-supplied filename as a filesystem path or response header.
    title = (file.filename or "Lesson material").replace("\\", "/").split("/")[-1][:160]
    item = LearningItem(booking_id=booking_id, author_id=user.id, kind="resource", title=title, body="Shared lesson file. Only open files you trust.", client_id=identity)
    db.add(item)
    await db.flush()
    db.add(LearningAttachment(item_id=item.id, filename=f"didaskey-material-{item.id}.{match[2]}", media_type=match[1], size=len(content), content=content))
    notify(db, booking.student_id, "New lesson material", title, booking_id)
    await db.commit()
    return {"item_id": item.id}


@router.get("/files/{item_id}")
async def download_material(item_id: int, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    item = await db.get(LearningItem, item_id)
    if item is None:
        raise HTTPException(404, "File not found")
    await require_booking(db, user, item.booking_id)
    attachment = await db.get(LearningAttachment, item_id)
    if attachment is None:
        raise HTTPException(404, "File not found")
    await db.refresh(attachment, ["content"])
    return Response(attachment.content, media_type=attachment.media_type, headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"', "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Content-Security-Policy": "sandbox"})


class ReadPosition(BaseModel):
    last_item_id: int = Field(gt=0)


@router.put("/bookings/{booking_id}/read")
async def mark_read(booking_id: int, payload: ReadPosition, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    booking = await require_booking(db, user, booking_id)
    if user.id not in (booking.student_id, booking.tutor.user_id):
        raise HTTPException(403, "Only session participants can mark messages read")
    item = await db.get(LearningItem, payload.last_item_id)
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
    return {"status": "ok"}


@router.get("/bookings/{booking_id}")
async def items(booking_id: int, after: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    return await list_items(db, user, booking_id, after=after, limit=limit)


@router.post("/bookings/{booking_id}", status_code=201)
async def publish(booking_id: int, payload: ItemCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    return await create_item(db, user, booking_id, payload)


@router.put("/assignments/{assignment_id}/submission")
async def submit(assignment_id: int, payload: SubmissionCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    assignment = await db.get(LearningItem, assignment_id)
    if assignment is None or assignment.kind != "assignment":
        raise HTTPException(404, "Assignment not found")
    booking = await require_booking(db, user, assignment.booking_id)
    if booking.status not in ("confirmed", "completed"):
        raise HTTPException(409, "This session no longer accepts submissions")
    if user.role != "student" or booking.student_id != user.id:
        raise HTTPException(403, "Only the assigned student can submit work")
    submission = await db.scalar(select(Submission).where(Submission.assignment_id == assignment_id, Submission.student_id == user.id))
    if submission and submission.reviewed_at:
        raise HTTPException(409, "This submission has already been reviewed")
    if submission is None:
        submission = Submission(assignment_id=assignment_id, student_id=user.id, body=payload.body)
        db.add(submission)
    else:
        submission.body = payload.body
        submission.submitted_at = datetime.now(timezone.utc)
    notify(db, booking.tutor.user_id, "Assignment submitted", assignment.title, booking.id)
    await db.commit()
    await db.refresh(submission)
    return serialize(submission)


@router.put("/assignments/{assignment_id}/feedback")
async def feedback(assignment_id: int, payload: FeedbackCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    assignment = await db.get(LearningItem, assignment_id)
    if assignment is None or assignment.kind != "assignment":
        raise HTTPException(404, "Assignment not found")
    booking = await require_booking(db, user, assignment.booking_id, teaching=True)
    if booking.status not in ("confirmed", "completed"):
        raise HTTPException(409, "This session no longer accepts feedback")
    submission = await db.scalar(select(Submission).where(Submission.assignment_id == assignment_id))
    if submission is None:
        raise HTTPException(409, "The student has not submitted work yet")
    submission.feedback, submission.score = payload.feedback, payload.score
    submission.reviewed_at = datetime.now(timezone.utc)
    notify(db, booking.student_id, "Your feedback is ready", assignment.title, booking.id)
    await db.commit()
    await db.refresh(submission)
    return serialize(submission)
