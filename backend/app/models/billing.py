"""
Billing models: bookings, payment transactions, and refunds.

Tables
------
bookings        — one session request from a student to a tutor
transactions    — one Paystack payment record per booking
refunds         — refund ledger entries linked to a transaction

Design notes
------------
- ``Booking`` is the source of truth for scheduling state.
- ``Transaction`` is the source of truth for money state.
- The two are linked one-to-one (one payment per booking).
- Status enums are stored as plain VARCHAR so new values can be added
  via migration without re-creating the column type.
- All monetary amounts are NUMERIC(10, 2) to avoid floating-point errors.
- ``paystack_reference`` is generated client-side (UUID4) before the
  Paystack initialise call so we can store it immediately and correlate
  the webhook without an extra round-trip.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.marketplace import Subject, TutorProfile


# ── Enums ─────────────────────────────────────────────────────────────────────


class BookingStatus(StrEnum):
    """
    Lifecycle states for a booking.

    PENDING_PAYMENT → CONFIRMED → COMPLETED | CANCELLED
                                           ↘ NO_SHOW
    """

    PENDING_PAYMENT = "pending_payment"
    """Created but payment not yet confirmed."""

    CONFIRMED = "confirmed"
    """Payment succeeded; tutor and student are locked in."""

    COMPLETED = "completed"
    """Session has taken place; eligible for reviews."""

    CANCELLED = "cancelled"
    """Cancelled before the session. Refund logic applies."""

    NO_SHOW = "no_show"
    """Student did not attend; admin-settable."""


class SessionFormat(StrEnum):
    """The format chosen by the student at booking time."""

    ONLINE = "online"
    IN_PERSON = "in_person"


class TransactionStatus(StrEnum):
    """Mirrors the Paystack charge status vocabulary."""

    PENDING = "pending"
    """Initialised with Paystack but not yet paid."""

    SUCCESS = "success"
    """Paystack confirmed the charge via webhook."""

    FAILED = "failed"
    """Charge failed or was abandoned."""

    REFUNDED = "refunded"
    """Full or partial refund issued."""


class RefundStatus(StrEnum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"


# ── Booking ───────────────────────────────────────────────────────────────────


class Booking(Base):
    """
    A single tutoring session request.

    Created when the student taps "Pay & Confirm". Transitions to
    ``CONFIRMED`` after the payment webhook fires successfully.

    Relationships
    -------------
    student  → User (role=student or parent)
    tutor    → TutorProfile
    subject  → Subject (the subject being tutored)
    transaction → Transaction (one-to-one, created alongside the booking)
    """

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)

    # ── Participants ──────────────────────────────────────────────────────────
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    """The user making the booking (student or parent)."""

    tutor_id: Mapped[int] = mapped_column(
        ForeignKey("tutor_profiles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
    )
    """Optional — records which subject was requested."""

    # ── Session details ───────────────────────────────────────────────────────
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    """UTC datetime of the booked session start."""

    duration_minutes: Mapped[int] = mapped_column(nullable=False, default=60)
    """Session length in minutes. Minimum enforced by CHECK constraint."""

    session_format: Mapped[SessionFormat] = mapped_column(
        String(20), nullable=False, default=SessionFormat.ONLINE
    )

    student_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Optional message from the student to the tutor at booking time."""

    # ── Pricing snapshot ──────────────────────────────────────────────────────
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    """
    Total amount charged. Snapshotted at booking creation so changes to
    the tutor's rate do not retroactively alter existing bookings.
    """

    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="NGN")

    # ── Status ────────────────────────────────────────────────────────────────
    status: Mapped[BookingStatus] = mapped_column(
        String(30), nullable=False, default=BookingStatus.PENDING_PAYMENT, index=True
    )

    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Constraints ───────────────────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_booking_amount_positive"),
        CheckConstraint("duration_minutes >= 30", name="ck_booking_min_duration"),
        Index("ix_bookings_student_status", "student_id", "status"),
        Index("ix_bookings_tutor_status", "tutor_id", "status"),
        Index("ix_bookings_scheduled_at", "scheduled_at"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    transaction: Mapped[Transaction | None] = relationship(
        back_populates="booking",
        uselist=False,
        cascade="all, delete-orphan",
    )
    student: Mapped[User] = relationship(
        "User", foreign_keys=[student_id], lazy="joined"
    )
    tutor: Mapped[TutorProfile] = relationship(
        "TutorProfile", foreign_keys=[tutor_id], lazy="joined"
    )
    subject: Mapped[Subject | None] = relationship(
        "Subject", foreign_keys=[subject_id], lazy="joined"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Booking id={self.id} student_id={self.student_id} "
            f"tutor_id={self.tutor_id} status={self.status!r}>"
        )


# ── Transaction ───────────────────────────────────────────────────────────────


class Transaction(Base):
    """
    One Paystack payment record, one-to-one with a Booking.

    ``paystack_reference`` is a UUID4 generated by the API before calling
    Paystack.  It is the join key used by the webhook handler to locate
    the correct booking without relying on Paystack's own IDs.

    Security note
    -------------
    ``paystack_reference`` has a UNIQUE constraint so a replayed webhook
    with a recycled reference cannot affect a different booking.
    """

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)

    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    paystack_reference: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    """UUID4 reference sent to Paystack at initialisation. Used for webhook lookup."""

    paystack_access_code: Mapped[str | None] = mapped_column(String(200), nullable=True)
    """Short-lived code returned by Paystack /initialize. Passed to the mobile SDK."""

    paystack_transaction_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    """Paystack's own transaction ID, set when the webhook fires."""

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    """Amount in major currency units (e.g. NGN, not kobo)."""

    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="NGN")

    status: Mapped[TransactionStatus] = mapped_column(
        String(20), nullable=False, default=TransactionStatus.PENDING, index=True
    )

    gateway_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Raw status message from Paystack (e.g. 'Approved')."""

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Constraints ───────────────────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    booking: Mapped[Booking] = relationship(back_populates="transaction")
    refunds: Mapped[list[Refund]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Transaction id={self.id} reference={self.paystack_reference!r} "
            f"status={self.status!r}>"
        )


# ── Refund ────────────────────────────────────────────────────────────────────


class Refund(Base):
    """
    A refund entry linked to a Transaction.

    Supports partial refunds (``amount`` may be less than the original
    transaction amount).  Multiple refund rows can exist per transaction
    for split refunds, but the total must not exceed the original charge —
    enforced by the service layer.
    """

    __tablename__ = "refunds"

    id: Mapped[int] = mapped_column(primary_key=True)

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[RefundStatus] = mapped_column(
        String(20), nullable=False, default=RefundStatus.PENDING
    )

    paystack_refund_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_refund_amount_positive"),
        Index("ix_refunds_transaction_id", "transaction_id"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    transaction: Mapped[Transaction] = relationship(back_populates="refunds")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Refund id={self.id} transaction_id={self.transaction_id} amount={self.amount}>"
