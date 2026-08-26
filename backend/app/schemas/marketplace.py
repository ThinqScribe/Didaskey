"""
Pydantic contracts for the tutor marketplace.

Naming convention
-----------------
*Request   — inbound payloads (create / update)
*Response  — outbound representations
*Summary   — lightweight list-item variant (used in paginated listings)
*Detail    — full representation (used on single-resource endpoints)

All ORM-backed schemas use ``model_config = ConfigDict(from_attributes=True)``
so they can be constructed directly from SQLAlchemy model instances.
"""

from __future__ import annotations

from datetime import time
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

from app.models.marketplace import DayOfWeek, TeachingMode, VerificationStatus


# ── Shared helpers ────────────────────────────────────────────────────────────


def _slugify(value: str) -> str:
    """Convert a display name to a lowercase hyphenated slug."""
    import re

    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


# ═════════════════════════════════════════════════════════════════════════════
# Subject
# ═════════════════════════════════════════════════════════════════════════════


class SubjectCreateRequest(BaseModel):
    """Admin payload to create a new subject in the catalogue."""

    name: str = Field(min_length=2, max_length=100, examples=["Mathematics"])
    description: str | None = Field(default=None, max_length=500)
    icon_name: str | None = Field(
        default=None,
        max_length=60,
        description="Ionicons glyph name, e.g. 'calculator-outline'",
        examples=["calculator-outline"],
    )

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class SubjectUpdateRequest(BaseModel):
    """Admin payload to partially update an existing subject."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    icon_name: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class SubjectResponse(BaseModel):
    """Full subject representation returned to both admins and students."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None
    icon_name: str | None
    is_active: bool


# ═════════════════════════════════════════════════════════════════════════════
# TutorSubject (embedded, not a standalone endpoint)
# ═════════════════════════════════════════════════════════════════════════════


class TutorSubjectItem(BaseModel):
    """Subject entry embedded inside a tutor profile response."""

    model_config = ConfigDict(from_attributes=True)

    subject_id: int
    subject: SubjectResponse
    rate_override: Decimal | None = None
    """If set, overrides the tutor's global hourly rate for this subject."""


class AddTutorSubjectRequest(BaseModel):
    """Admin payload to associate a subject with a tutor."""

    subject_id: int = Field(gt=0)
    rate_override: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        description="Optional subject-specific rate (overrides global rate when set)",
    )


# ═════════════════════════════════════════════════════════════════════════════
# TutorAvailability
# ═════════════════════════════════════════════════════════════════════════════


class AvailabilitySlotRequest(BaseModel):
    """A single recurring weekly availability window."""

    day_of_week: DayOfWeek
    start_time: time = Field(examples=["09:00:00"])
    end_time: time = Field(examples=["12:00:00"])

    @model_validator(mode="after")
    def end_after_start(self) -> "AvailabilitySlotRequest":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class AvailabilitySlotResponse(BaseModel):
    """Availability slot as returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    day_of_week: DayOfWeek
    start_time: time
    end_time: time


class SetAvailabilityRequest(BaseModel):
    """
    Admin payload to replace all availability slots for a tutor.

    Sending an empty list clears all existing slots.
    """

    slots: list[AvailabilitySlotRequest] = Field(
        default_factory=list,
        max_length=50,
        description="Full replacement set of weekly availability windows",
    )


# ═════════════════════════════════════════════════════════════════════════════
# TutorProfile — create / update
# ═════════════════════════════════════════════════════════════════════════════


class TutorProfileCreateRequest(BaseModel):
    """
    Admin payload to create a new tutor profile.

    A corresponding ``users`` row with ``role=tutor`` must already exist
    (identified by ``user_id``).
    """

    user_id: int = Field(gt=0, description="ID of the users row with role=tutor")
    display_name: str = Field(min_length=2, max_length=120, examples=["Dr. Alex Morgan"])
    bio: str | None = Field(default=None, max_length=2000)
    profile_image_url: str | None = Field(
        default=None,
        max_length=500,
        description="Absolute URL to the tutor's profile photo",
    )
    qualifications: str | None = Field(default=None, max_length=1000)
    years_of_experience: int = Field(default=0, ge=0, le=60)
    teaching_mode: TeachingMode = Field(default=TeachingMode.BOTH)
    location_city: str | None = Field(default=None, max_length=100)
    location_state: str | None = Field(default=None, max_length=100)
    rate_per_hour: Decimal = Field(ge=Decimal("0"), decimal_places=2, examples=[Decimal("35.00")])
    currency: str = Field(default="NGN", min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str) -> str:
        return v.upper()


class TutorProfileUpdateRequest(BaseModel):
    """
    Admin payload to partially update an existing tutor profile.

    All fields are optional; only provided fields are applied.
    """

    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = None
    profile_image_url: str | None = Field(default=None, max_length=500)
    qualifications: str | None = Field(default=None, max_length=1000)
    years_of_experience: int | None = Field(default=None, ge=0, le=60)
    teaching_mode: TeachingMode | None = None
    location_city: str | None = Field(default=None, max_length=100)
    location_state: str | None = Field(default=None, max_length=100)
    rate_per_hour: Decimal | None = Field(default=None, ge=Decimal("0"), decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    verification_status: VerificationStatus | None = None
    is_active: bool | None = None

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, v: str | None) -> str | None:
        return v.strip() if v else v

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str | None) -> str | None:
        return v.upper() if v else v


# ═════════════════════════════════════════════════════════════════════════════
# TutorProfile — responses
# ═════════════════════════════════════════════════════════════════════════════


class TutorSummary(BaseModel):
    """
    Lightweight tutor card used in search / listing endpoints.

    Omits heavy fields (bio, qualifications, availability) to keep
    list payloads small.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    profile_image_url: str | None
    teaching_mode: TeachingMode
    location_city: str | None
    location_state: str | None
    rate_per_hour: Decimal
    currency: str
    average_rating: Decimal
    review_count: int
    total_hours_taught: int
    verification_status: VerificationStatus
    subjects: list[SubjectResponse] = Field(default_factory=list)
    """Flat list of subjects this tutor teaches (no rate overrides in summary)."""


class TutorDetail(BaseModel):
    """
    Full tutor profile returned on the single-tutor endpoint.

    Includes bio, qualifications, all subjects with rate overrides,
    weekly availability slots, and the most recent reviews.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    display_name: str
    bio: str | None
    profile_image_url: str | None
    qualifications: str | None
    years_of_experience: int
    teaching_mode: TeachingMode
    location_city: str | None
    location_state: str | None
    rate_per_hour: Decimal
    currency: str
    average_rating: Decimal
    review_count: int
    total_hours_taught: int
    verification_status: VerificationStatus
    is_active: bool
    tutor_subjects: list[TutorSubjectItem] = Field(default_factory=list)
    availability_slots: list[AvailabilitySlotResponse] = Field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# Review
# ═════════════════════════════════════════════════════════════════════════════


class ReviewCreateRequest(BaseModel):
    """Student payload to submit a review for a tutor."""

    tutor_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5, description="Star rating from 1 (lowest) to 5 (highest)")
    comment: str | None = Field(default=None, max_length=2000)


class ReviewUpdateRequest(BaseModel):
    """Student payload to edit their own existing review."""

    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    """A single review as returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tutor_id: int
    student_id: int
    rating: int
    comment: str | None
    is_visible: bool
    created_at: str
    """ISO 8601 timestamp string."""

    # Computed by the service layer — not a direct ORM field
    student_name: str = ""
    """Full name of the reviewing student, joined at query time."""


# ═════════════════════════════════════════════════════════════════════════════
# Pagination wrapper
# ═════════════════════════════════════════════════════════════════════════════


class PaginatedTutors(BaseModel):
    """Paginated tutor listing with metadata."""

    items: list[TutorSummary]
    total: int = Field(description="Total matching tutors across all pages")
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_pages: int

    @classmethod
    def build(
        cls, items: list[TutorSummary], total: int, page: int, page_size: int
    ) -> "PaginatedTutors":
        import math

        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if page_size else 0,
        )


class PaginatedReviews(BaseModel):
    """Paginated review listing with metadata."""

    items: list[ReviewResponse]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_pages: int

    @classmethod
    def build(
        cls, items: list[ReviewResponse], total: int, page: int, page_size: int
    ) -> "PaginatedReviews":
        import math

        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if page_size else 0,
        )
