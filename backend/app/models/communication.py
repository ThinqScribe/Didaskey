"""
Communication models: the live video classroom tied 1:1 to a booking.

Tables
------
classrooms              — one video room per online booking
classroom_participants  — join/leave audit log, one row per join event

Design notes
------------
- A classroom is only ever needed for ``SessionFormat.ONLINE`` bookings;
  in-person sessions never get a row here.
- The LiveKit room itself is created implicitly by the LiveKit server the
  first time a participant connects with a valid token — we never need a
  separate "create room" API call, only token issuance
  (see ``app.integrations.video``).
- ``room_name`` is derived deterministically from the booking id
  (see ``video.room_name_for_booking``) so at most one room ever exists
  per booking, even across retries.
- Rows are created lazily (on first join attempt), not at booking
  creation/confirmation time, so bookings that never get joined don't
  clutter this table.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ── Enums ─────────────────────────────────────────────────────────────────────


class ClassroomStatus(StrEnum):
    """Lifecycle of a classroom. SCHEDULED → LIVE → ENDED."""

    SCHEDULED = "scheduled"
    """Row exists but no participant has joined yet."""

    LIVE = "live"
    """At least one participant has joined; session is (or was) in progress."""

    ENDED = "ended"
    """The tutor (or an admin) explicitly ended the session."""


class ParticipantRole(StrEnum):
    """The role a user held when they joined a classroom."""

    STUDENT = "student"
    TUTOR = "tutor"
    ADMIN = "admin"


# ── Classroom ─────────────────────────────────────────────────────────────────


class Classroom(Base):
    """
    The video room for a single booking.

    One-to-one with ``Booking`` — created lazily the first time either
    party requests to join (see ``classroom_service._get_or_create_classroom``).
    """

    __tablename__ = "classrooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    room_name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    """Deterministic LiveKit room name, e.g. ``didaskey-booking-42``."""

    status: Mapped[ClassroomStatus] = mapped_column(
        String(20), nullable=False, default=ClassroomStatus.SCHEDULED
    )

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    """Set when the first participant joins."""

    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    """Set when the tutor/admin explicitly ends the session."""

    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    """Reserved for future cloud-recording support."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    participants: Mapped[list["ClassroomParticipant"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Classroom id={self.id} booking_id={self.booking_id} status={self.status!r}>"


# ── ClassroomParticipant ──────────────────────────────────────────────────────


class ClassroomParticipant(Base):
    """
    One join event for one user in one classroom.

    A user may have multiple rows if they disconnect and rejoin — this is
    intentional: it lets attendance duration be reconstructed from the
    ``joined_at``/``left_at`` pairs rather than overwriting a single row.
    """

    __tablename__ = "classroom_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[int] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[ParticipantRole] = mapped_column(String(10), nullable=False)

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_classroom_participants_classroom_user", "classroom_id", "user_id"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    classroom: Mapped[Classroom] = relationship(back_populates="participants")

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ClassroomParticipant id={self.id} classroom_id={self.classroom_id} "
            f"user_id={self.user_id}>"
        )
