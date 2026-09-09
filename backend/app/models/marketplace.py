"""
Marketplace models.

Tables
------
subjects            — master list of teachable subjects (admin-seeded)
tutor_profiles      — one-to-one with User(role=tutor); all tutor metadata
tutor_subjects      — M2M join: which tutor teaches which subject
tutor_availability  — weekly recurring time slots per tutor
reviews             — student reviews on a completed booking
"""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ── Enums ─────────────────────────────────────────────────────────────────────


class TeachingMode(StrEnum):
    """Modes a tutor can offer sessions in."""

    ONLINE = "online"
    IN_PERSON = "in_person"
    BOTH = "both"


class DayOfWeek(StrEnum):
    """ISO weekday names used in availability slots."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class VerificationStatus(StrEnum):
    """Admin-controlled tutor verification pipeline."""

    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


# ── Subject ───────────────────────────────────────────────────────────────────


class Subject(Base):
    """
    A canonical, admin-managed subject (e.g. "Mathematics", "Physics").

    Tutors reference subjects through the ``TutorSubject`` join table so
    the subject catalogue stays normalised and consistent across the platform.
    """

    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    """URL-safe identifier, e.g. ``mathematics``. Auto-derived from name on creation."""

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    """Optional icon identifier for the mobile UI (e.g. an Ionicons glyph name)."""

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    tutor_subjects: Mapped[list[TutorSubject]] = relationship(
        back_populates="subject", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Subject id={self.id} slug={self.slug!r}>"


# ── TutorProfile ──────────────────────────────────────────────────────────────


class TutorProfile(Base):
    """
    Extended profile for a tutor.

    One-to-one with ``users`` (role=tutor).  All tutor-specific data lives
    here so the ``users`` table stays lean and shared across all roles.

    Financial fields
    ----------------
    ``rate_per_hour`` is stored as ``NUMERIC(8, 2)`` to avoid floating-point
    rounding errors in money calculations.

    Aggregates
    ----------
    ``total_hours_taught``, ``average_rating``, and ``review_count`` are
    denormalised counters kept in sync by the service layer after each
    completed booking / new review.  This avoids expensive aggregation
    queries on the hot tutor-listing path.
    """

    __tablename__ = "tutor_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    # ── Identity ──────────────────────────────────────────────────────────────
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    """Public-facing name shown on the marketplace (may differ from legal name)."""

    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Short markdown-safe biography / teaching philosophy."""

    profile_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    """Absolute URL to the tutor's profile photo (cloud storage)."""

    # ── Qualifications ────────────────────────────────────────────────────────
    qualifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    """
    Free-text summary of academic credentials, e.g.
    ``"B.Sc. Mathematics (First Class), University of Lagos"``.
    """

    years_of_experience: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    # ── Teaching preferences ──────────────────────────────────────────────────
    teaching_mode: Mapped[TeachingMode] = mapped_column(
        String(20), default=TeachingMode.BOTH, nullable=False
    )
    location_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    """City used for in-person session filtering."""

    location_state: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Pricing ───────────────────────────────────────────────────────────────
    rate_per_hour: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal("0.00")
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="NGN")
    """ISO 4217 currency code, e.g. ``NGN``, ``USD``."""

    # ── Aggregated stats (denormalised) ───────────────────────────────────────
    total_hours_taught: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_rating: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), default=Decimal("0.00"), nullable=False
    )
    """Cached mean of all review ratings; range 0.00 – 5.00."""

    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Admin controls ────────────────────────────────────────────────────────
    verification_status: Mapped[VerificationStatus] = mapped_column(
        String(20), default=VerificationStatus.PENDING, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    """Admin toggle: hide a tutor from discovery without deleting the record."""

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
        CheckConstraint("rate_per_hour >= 0", name="ck_tutor_rate_non_negative"),
        CheckConstraint("average_rating >= 0 AND average_rating <= 5", name="ck_tutor_rating_range"),
        CheckConstraint("years_of_experience >= 0", name="ck_tutor_experience_non_negative"),
        CheckConstraint("review_count >= 0", name="ck_tutor_review_count_non_negative"),
        CheckConstraint("total_hours_taught >= 0", name="ck_tutor_hours_non_negative"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    tutor_subjects: Mapped[list[TutorSubject]] = relationship(
        back_populates="tutor", cascade="all, delete-orphan"
    )
    availability_slots: Mapped[list[TutorAvailability]] = relationship(
        back_populates="tutor", cascade="all, delete-orphan", order_by="TutorAvailability.day_of_week"
    )
    reviews: Mapped[list[Review]] = relationship(
        back_populates="tutor", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TutorProfile id={self.id} display_name={self.display_name!r}>"


# ── TutorSubject ──────────────────────────────────────────────────────────────


class TutorSubject(Base):
    """
    Join table linking a tutor to subjects they teach.

    A tutor can teach multiple subjects; each row optionally carries a
    subject-specific ``rate_per_hour`` override that takes precedence over
    the tutor's global rate when set.
    """

    __tablename__ = "tutor_subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        ForeignKey("tutor_profiles.id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False
    )
    rate_override: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    """When set, this rate is used instead of ``TutorProfile.rate_per_hour`` for this subject."""

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        UniqueConstraint("tutor_id", "subject_id", name="uq_tutor_subject"),
        CheckConstraint("rate_override IS NULL OR rate_override >= 0", name="ck_subject_rate_non_negative"),
        Index("ix_tutor_subjects_tutor_id", "tutor_id"),
        Index("ix_tutor_subjects_subject_id", "subject_id"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    tutor: Mapped[TutorProfile] = relationship(back_populates="tutor_subjects")
    subject: Mapped[Subject] = relationship(back_populates="tutor_subjects")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TutorSubject tutor_id={self.tutor_id} subject_id={self.subject_id}>"


# ── TutorAvailability ─────────────────────────────────────────────────────────


class TutorAvailability(Base):
    """
    A recurring weekly time window when a tutor is available.

    Multiple rows per tutor are allowed (e.g. Monday 09:00-12:00 and
    Monday 14:00-17:00 are two separate rows).  The booking layer uses
    these slots to validate session requests.
    """

    __tablename__ = "tutor_availability"

    id: Mapped[int] = mapped_column(primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        ForeignKey("tutor_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[DayOfWeek] = mapped_column(String(15), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_availability_time_range"),
        Index("ix_tutor_availability_tutor_day", "tutor_id", "day_of_week"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    tutor: Mapped[TutorProfile] = relationship(back_populates="availability_slots")

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<TutorAvailability tutor_id={self.tutor_id} "
            f"day={self.day_of_week} {self.start_time}-{self.end_time}>"
        )


# ── Review ────────────────────────────────────────────────────────────────────


class Review(Base):
    """
    A student's review of a tutor after a completed session.

    Each student can only leave one review per tutor (enforced by the
    ``uq_review_student_tutor`` unique constraint).  Rating is an integer
    1–5 enforced at the DB level; the service layer recomputes and updates
    ``TutorProfile.average_rating`` and ``review_count`` after every insert
    or delete.
    """

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    tutor_id: Mapped[int] = mapped_column(
        ForeignKey("tutor_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    """Integer star rating from 1 (lowest) to 5 (highest)."""

    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Optional written feedback from the student."""

    is_visible: Mapped[bool] = mapped_column(default=True, nullable=False)
    """Admin toggle: hide a review without deleting it."""

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
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating_range"),
        UniqueConstraint("student_id", "tutor_id", name="uq_review_student_tutor"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    tutor: Mapped[TutorProfile] = relationship(back_populates="reviews")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Review id={self.id} tutor_id={self.tutor_id} rating={self.rating}>"
