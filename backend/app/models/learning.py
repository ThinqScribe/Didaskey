"""Persistent learning activity protected by booking membership."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, LargeBinary, JSON, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class LearningItem(Base):
    __tablename__ = "learning_items"
    __table_args__ = (UniqueConstraint("author_id", "client_id", name="uq_learning_client"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    body: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(2000))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_id: Mapped[str | None] = mapped_column(String(100))
    reply_to_item_id: Mapped[int | None] = mapped_column(ForeignKey("learning_items.id"), nullable=True)
    extra: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Submission(Base):
    __tablename__ = "learning_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("learning_items.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    feedback: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int | None]
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id"))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    last_item_id: Mapped[int] = mapped_column(ForeignKey("learning_items.id"))
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LearningAttachment(Base):
    __tablename__ = "learning_attachments"
    item_id: Mapped[int] = mapped_column(ForeignKey("learning_items.id"), primary_key=True)
    filename: Mapped[str] = mapped_column(String(160))
    media_type: Mapped[str] = mapped_column(String(80))
    size: Mapped[int]
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)


class BoardStroke(Base):
    __tablename__ = "board_strokes"
    __table_args__ = (UniqueConstraint("booking_id", "author_id", "client_id", name="uq_board_client"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    client_id: Mapped[str] = mapped_column(String(100))
    points: Mapped[list] = mapped_column(JSON)
    color: Mapped[str] = mapped_column(String(7))
    width: Mapped[int]
    hidden: Mapped[bool] = mapped_column(default=False)
