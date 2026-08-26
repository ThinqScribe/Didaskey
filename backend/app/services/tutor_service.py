"""
TutorService — all marketplace business logic.

Responsibilities
----------------
- Subject catalogue management (admin)
- Tutor profile CRUD (admin)
- Tutor subject assignment (admin)
- Tutor availability management (admin)
- Tutor discovery with filtering + pagination (students)
- Individual tutor detail retrieval (students)
- Review submission, editing, deletion (students)
- Review visibility toggling (admin)
- Aggregate recalculation (average_rating, review_count) after review changes

Design notes
------------
- Every public method receives an ``AsyncSession``; the caller (endpoint) is
  responsible for the session lifecycle.
- Raises ``fastapi.HTTPException`` directly so the endpoint layer stays thin.
- All writes use explicit ``await db.flush()`` before returning IDs so the
  caller can inspect the new row without a round-trip commit.
- ``_recompute_rating`` is an internal helper called after every review
  mutation; it recomputes from the live DB state rather than doing
  in-memory arithmetic to stay consistent under concurrent writes.
"""

from __future__ import annotations

import re
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.marketplace import (
    DayOfWeek,
    Review,
    Subject,
    TeachingMode,
    TutorAvailability,
    TutorProfile,
    TutorSubject,
    VerificationStatus,
)
from app.models.user import User, UserRole
from app.schemas.marketplace import (
    AddTutorSubjectRequest,
    AvailabilitySlotResponse,
    PaginatedReviews,
    PaginatedTutors,
    ReviewCreateRequest,
    ReviewResponse,
    ReviewUpdateRequest,
    SetAvailabilityRequest,
    SubjectCreateRequest,
    SubjectResponse,
    SubjectUpdateRequest,
    TutorDetail,
    TutorProfileCreateRequest,
    TutorProfileUpdateRequest,
    TutorSubjectItem,
    TutorSummary,
)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _slugify(value: str) -> str:
    """Convert a display name to a lowercase hyphenated slug."""
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def _not_found(resource: str, resource_id: int | str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{resource} with id {resource_id!r} was not found",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# ─────────────────────────────────────────────────────────────────────────────
# Subject service methods
# ─────────────────────────────────────────────────────────────────────────────


async def create_subject(
    payload: SubjectCreateRequest,
    db: AsyncSession,
) -> SubjectResponse:
    """
    Create a new subject in the catalogue.

    Raises 409 if a subject with the same name or derived slug already exists.
    """
    slug = _slugify(payload.name)

    # Guard duplicate name / slug
    existing = await db.scalar(
        select(Subject).where(
            (Subject.name == payload.name) | (Subject.slug == slug)
        )
    )
    if existing is not None:
        raise _conflict(f"A subject named {payload.name!r} already exists")

    subject = Subject(
        name=payload.name,
        slug=slug,
        description=payload.description,
        icon_name=payload.icon_name,
    )
    db.add(subject)
    await db.flush()
    await db.refresh(subject)
    return SubjectResponse.model_validate(subject)


async def list_subjects(db: AsyncSession, active_only: bool = True) -> list[SubjectResponse]:
    """
    Return all subjects, optionally filtered to active-only.

    Used by both the admin panel (active_only=False) and student-facing
    filter dropdowns (active_only=True).
    """
    stmt = select(Subject).order_by(Subject.name)
    if active_only:
        stmt = stmt.where(Subject.is_active.is_(True))
    rows = (await db.scalars(stmt)).all()
    return [SubjectResponse.model_validate(r) for r in rows]


async def get_subject(subject_id: int, db: AsyncSession) -> SubjectResponse:
    """Return a single subject by ID. Raises 404 if not found."""
    subject = await db.get(Subject, subject_id)
    if subject is None:
        raise _not_found("Subject", subject_id)
    return SubjectResponse.model_validate(subject)


async def update_subject(
    subject_id: int,
    payload: SubjectUpdateRequest,
    db: AsyncSession,
) -> SubjectResponse:
    """
    Partially update a subject.

    If ``name`` is changing, the slug is regenerated and uniqueness is
    re-validated to avoid collisions.
    """
    subject = await db.get(Subject, subject_id)
    if subject is None:
        raise _not_found("Subject", subject_id)

    if payload.name is not None:
        new_slug = _slugify(payload.name)
        # Check uniqueness only if the name actually changes
        if payload.name != subject.name:
            clash = await db.scalar(
                select(Subject).where(
                    (Subject.name == payload.name) | (Subject.slug == new_slug),
                    Subject.id != subject_id,
                )
            )
            if clash is not None:
                raise _conflict(f"A subject named {payload.name!r} already exists")
        subject.name = payload.name
        subject.slug = new_slug

    if payload.description is not None:
        subject.description = payload.description
    if payload.icon_name is not None:
        subject.icon_name = payload.icon_name
    if payload.is_active is not None:
        subject.is_active = payload.is_active

    await db.flush()
    await db.refresh(subject)
    return SubjectResponse.model_validate(subject)


async def delete_subject(subject_id: int, db: AsyncSession) -> None:
    """
    Hard-delete a subject.

    Prefer ``update_subject(is_active=False)`` to soft-delete instead of
    removing a subject that tutors already reference.  This method is
    provided for admin cleanup of erroneous entries.

    Raises 409 if the subject is still referenced by any tutor.
    """
    subject = await db.get(Subject, subject_id)
    if subject is None:
        raise _not_found("Subject", subject_id)

    in_use = await db.scalar(
        select(func.count()).where(TutorSubject.subject_id == subject_id)
    )
    if in_use and in_use > 0:
        raise _conflict(
            f"Subject {subject_id} is assigned to {in_use} tutor(s). "
            "Deactivate it instead, or remove tutor assignments first."
        )

    await db.delete(subject)
    await db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Tutor profile service methods
# ─────────────────────────────────────────────────────────────────────────────


def _build_tutor_summary(profile: TutorProfile) -> TutorSummary:
    """
    Construct a ``TutorSummary`` from an eagerly-loaded ``TutorProfile``.

    Assumes ``tutor_subjects`` and their nested ``subject`` have already been
    loaded via ``selectinload``.
    """
    subjects = [
        SubjectResponse.model_validate(ts.subject)
        for ts in profile.tutor_subjects
        if ts.subject.is_active
    ]
    return TutorSummary(
        id=profile.id,
        display_name=profile.display_name,
        profile_image_url=profile.profile_image_url,
        teaching_mode=profile.teaching_mode,
        location_city=profile.location_city,
        location_state=profile.location_state,
        rate_per_hour=profile.rate_per_hour,
        currency=profile.currency,
        average_rating=profile.average_rating,
        review_count=profile.review_count,
        total_hours_taught=profile.total_hours_taught,
        verification_status=profile.verification_status,
        subjects=subjects,
    )


def _build_tutor_detail(profile: TutorProfile) -> TutorDetail:
    """
    Construct a ``TutorDetail`` from a fully eagerly-loaded ``TutorProfile``.

    Assumes ``tutor_subjects → subject``, ``availability_slots``, and
    ``reviews`` have all been loaded.
    """
    tutor_subject_items = [
        TutorSubjectItem(
            subject_id=ts.subject_id,
            subject=SubjectResponse.model_validate(ts.subject),
            rate_override=ts.rate_override,
        )
        for ts in profile.tutor_subjects
    ]
    availability = [
        AvailabilitySlotResponse.model_validate(slot)
        for slot in profile.availability_slots
    ]
    return TutorDetail(
        id=profile.id,
        user_id=profile.user_id,
        display_name=profile.display_name,
        bio=profile.bio,
        profile_image_url=profile.profile_image_url,
        qualifications=profile.qualifications,
        years_of_experience=profile.years_of_experience,
        teaching_mode=profile.teaching_mode,
        location_city=profile.location_city,
        location_state=profile.location_state,
        rate_per_hour=profile.rate_per_hour,
        currency=profile.currency,
        average_rating=profile.average_rating,
        review_count=profile.review_count,
        total_hours_taught=profile.total_hours_taught,
        verification_status=profile.verification_status,
        is_active=profile.is_active,
        tutor_subjects=tutor_subject_items,
        availability_slots=availability,
    )


async def create_tutor_profile(
    payload: TutorProfileCreateRequest,
    db: AsyncSession,
) -> TutorDetail:
    """
    Create a tutor profile for an existing user (role must be ``tutor``).

    Raises
    ------
    404  — user not found
    400  — user role is not ``tutor``
    409  — tutor profile already exists for this user
    """
    user = await db.get(User, payload.user_id)
    if user is None:
        raise _not_found("User", payload.user_id)
    if user.role != UserRole.TUTOR:
        raise _bad_request(
            f"User {payload.user_id} has role '{user.role}'; "
            "only users with role 'tutor' can have a tutor profile"
        )

    existing = await db.scalar(
        select(TutorProfile).where(TutorProfile.user_id == payload.user_id)
    )
    if existing is not None:
        raise _conflict(f"A tutor profile already exists for user {payload.user_id}")

    profile = TutorProfile(
        user_id=payload.user_id,
        display_name=payload.display_name,
        bio=payload.bio,
        profile_image_url=payload.profile_image_url,
        qualifications=payload.qualifications,
        years_of_experience=payload.years_of_experience,
        teaching_mode=payload.teaching_mode,
        location_city=payload.location_city,
        location_state=payload.location_state,
        rate_per_hour=payload.rate_per_hour,
        currency=payload.currency,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)

    # Reload with relationships for the response
    return await get_tutor_detail(profile.id, db)


async def update_tutor_profile(
    tutor_id: int,
    payload: TutorProfileUpdateRequest,
    db: AsyncSession,
) -> TutorDetail:
    """
    Partially update a tutor profile.

    Only fields that are explicitly set in the payload are applied.
    All ``None``-valued fields in the payload are left unchanged.
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)

    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(profile, field, value)

    await db.flush()
    return await get_tutor_detail(tutor_id, db)


async def delete_tutor_profile(tutor_id: int, db: AsyncSession) -> None:
    """
    Hard-delete a tutor profile and all dependent rows (cascade).

    Prefer ``update_tutor_profile(is_active=False)`` for soft-deletion in
    production; use this only for data cleanup.
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)
    await db.delete(profile)
    await db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Tutor discovery (student-facing)
# ─────────────────────────────────────────────────────────────────────────────


async def search_tutors(
    db: AsyncSession,
    *,
    subject_id: int | None = None,
    teaching_mode: TeachingMode | None = None,
    min_rating: Decimal | None = None,
    max_rate: Decimal | None = None,
    city: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedTutors:
    """
    Paginated tutor discovery with optional filters.

    Only verified, active tutors are returned.

    Parameters
    ----------
    subject_id      Filter to tutors who teach this subject.
    teaching_mode   Filter by online / in_person / both.
    min_rating      Minimum average star rating (inclusive).
    max_rate        Maximum hourly rate (inclusive).
    city            Case-insensitive partial match on ``location_city``.
    search          Full-text partial match on ``display_name`` or ``bio``.
    page            1-based page number.
    page_size       Items per page (max 100).
    """
    # Base query — verified and active only for student-facing discovery
    base_stmt = (
        select(TutorProfile)
        .where(
            TutorProfile.verification_status == VerificationStatus.VERIFIED,
            TutorProfile.is_active.is_(True),
        )
        .options(
            selectinload(TutorProfile.tutor_subjects).selectinload(TutorSubject.subject)
        )
    )

    # Optional filters
    if subject_id is not None:
        base_stmt = base_stmt.join(TutorSubject).where(
            TutorSubject.subject_id == subject_id
        )
    if teaching_mode is not None:
        base_stmt = base_stmt.where(
            (TutorProfile.teaching_mode == teaching_mode)
            | (TutorProfile.teaching_mode == TeachingMode.BOTH)
        )
    if min_rating is not None:
        base_stmt = base_stmt.where(TutorProfile.average_rating >= min_rating)
    if max_rate is not None:
        base_stmt = base_stmt.where(TutorProfile.rate_per_hour <= max_rate)
    if city is not None:
        base_stmt = base_stmt.where(
            TutorProfile.location_city.ilike(f"%{city}%")
        )
    if search is not None:
        term = f"%{search}%"
        base_stmt = base_stmt.where(
            TutorProfile.display_name.ilike(term) | TutorProfile.bio.ilike(term)
        )

    # Count total matching rows (without pagination)
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.scalar(count_stmt)) or 0

    # Fetch paginated page — default sort: highest rated first, then most hours
    offset = (page - 1) * page_size
    paged_stmt = (
        base_stmt
        .order_by(TutorProfile.average_rating.desc(), TutorProfile.total_hours_taught.desc())
        .offset(offset)
        .limit(page_size)
    )
    profiles = (await db.scalars(paged_stmt)).all()

    items = [_build_tutor_summary(p) for p in profiles]
    return PaginatedTutors.build(items=items, total=total, page=page, page_size=page_size)


async def get_tutor_detail(tutor_id: int, db: AsyncSession) -> TutorDetail:
    """
    Return the full profile for a single tutor.

    Eagerly loads all related data needed to build ``TutorDetail``.
    Raises 404 if the profile does not exist.
    """
    stmt = (
        select(TutorProfile)
        .where(TutorProfile.id == tutor_id)
        .options(
            selectinload(TutorProfile.tutor_subjects).selectinload(TutorSubject.subject),
            selectinload(TutorProfile.availability_slots),
            selectinload(TutorProfile.reviews),
        )
    )
    profile = await db.scalar(stmt)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)
    return _build_tutor_detail(profile)


# ─────────────────────────────────────────────────────────────────────────────
# Tutor subject assignment (admin)
# ─────────────────────────────────────────────────────────────────────────────


async def add_tutor_subject(
    tutor_id: int,
    payload: AddTutorSubjectRequest,
    db: AsyncSession,
) -> TutorDetail:
    """
    Assign a subject to a tutor.

    Raises
    ------
    404  — tutor or subject not found
    409  — subject already assigned to this tutor
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)

    subject = await db.get(Subject, payload.subject_id)
    if subject is None:
        raise _not_found("Subject", payload.subject_id)

    existing = await db.scalar(
        select(TutorSubject).where(
            TutorSubject.tutor_id == tutor_id,
            TutorSubject.subject_id == payload.subject_id,
        )
    )
    if existing is not None:
        raise _conflict(
            f"Subject {payload.subject_id} is already assigned to tutor {tutor_id}"
        )

    ts = TutorSubject(
        tutor_id=tutor_id,
        subject_id=payload.subject_id,
        rate_override=payload.rate_override,
    )
    db.add(ts)
    await db.flush()
    return await get_tutor_detail(tutor_id, db)


async def remove_tutor_subject(
    tutor_id: int,
    subject_id: int,
    db: AsyncSession,
) -> TutorDetail:
    """
    Remove a subject assignment from a tutor.

    Raises 404 if the tutor or the assignment does not exist.
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)

    ts = await db.scalar(
        select(TutorSubject).where(
            TutorSubject.tutor_id == tutor_id,
            TutorSubject.subject_id == subject_id,
        )
    )
    if ts is None:
        raise _not_found(f"Subject assignment (tutor={tutor_id}, subject={subject_id})", "")

    await db.delete(ts)
    await db.flush()
    return await get_tutor_detail(tutor_id, db)


# ─────────────────────────────────────────────────────────────────────────────
# Tutor availability management (admin)
# ─────────────────────────────────────────────────────────────────────────────


async def set_tutor_availability(
    tutor_id: int,
    payload: SetAvailabilityRequest,
    db: AsyncSession,
) -> TutorDetail:
    """
    Replace all availability slots for a tutor.

    This is a full-replacement operation: all existing slots are deleted
    and the provided list is inserted fresh.  Sending an empty ``slots``
    list clears the tutor's availability entirely.

    Raises 404 if the tutor does not exist.
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)

    # Delete all existing slots for this tutor
    existing_slots = (
        await db.scalars(
            select(TutorAvailability).where(TutorAvailability.tutor_id == tutor_id)
        )
    ).all()
    for slot in existing_slots:
        await db.delete(slot)

    # Insert the new set
    for slot_req in payload.slots:
        db.add(
            TutorAvailability(
                tutor_id=tutor_id,
                day_of_week=slot_req.day_of_week,
                start_time=slot_req.start_time,
                end_time=slot_req.end_time,
            )
        )

    await db.flush()
    return await get_tutor_detail(tutor_id, db)


# ─────────────────────────────────────────────────────────────────────────────
# Reviews (student-facing + admin)
# ─────────────────────────────────────────────────────────────────────────────


async def _recompute_rating(tutor_id: int, db: AsyncSession) -> None:
    """
    Recompute and persist ``average_rating`` and ``review_count`` on the
    tutor profile from the current set of visible reviews in the database.

    Called after every review insert, update, or delete.
    """
    result = await db.execute(
        select(
            func.count(Review.id),
            func.coalesce(func.avg(Review.rating), Decimal("0.00")),
        ).where(
            Review.tutor_id == tutor_id,
            Review.is_visible.is_(True),
        )
    )
    count, avg = result.one()

    profile = await db.get(TutorProfile, tutor_id)
    if profile is not None:
        profile.review_count = int(count)
        profile.average_rating = round(Decimal(str(avg)), 2)
    await db.flush()


def _build_review_response(review: Review, student_name: str) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        tutor_id=review.tutor_id,
        student_id=review.student_id,
        rating=review.rating,
        comment=review.comment,
        is_visible=review.is_visible,
        created_at=review.created_at.isoformat(),
        student_name=student_name,
    )


async def create_review(
    payload: ReviewCreateRequest,
    student: User,
    db: AsyncSession,
) -> ReviewResponse:
    """
    Submit a new review for a tutor.

    Raises
    ------
    404  — tutor not found
    400  — student attempts to review themselves (future-proofing)
    409  — student already has a review for this tutor
    """
    profile = await db.get(TutorProfile, payload.tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", payload.tutor_id)

    if profile.user_id == student.id:
        raise _bad_request("A tutor cannot review their own profile")

    existing = await db.scalar(
        select(Review).where(
            Review.tutor_id == payload.tutor_id,
            Review.student_id == student.id,
        )
    )
    if existing is not None:
        raise _conflict("You have already submitted a review for this tutor")

    review = Review(
        tutor_id=payload.tutor_id,
        student_id=student.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    await db.flush()
    await _recompute_rating(payload.tutor_id, db)
    await db.refresh(review)

    student_name = f"{student.first_name} {student.last_name}".strip()
    return _build_review_response(review, student_name)


async def update_review(
    review_id: int,
    payload: ReviewUpdateRequest,
    student: User,
    db: AsyncSession,
) -> ReviewResponse:
    """
    Edit an existing review (student can only edit their own).

    Raises
    ------
    404  — review not found
    403  — review belongs to a different student
    """
    review = await db.get(Review, review_id)
    if review is None:
        raise _not_found("Review", review_id)
    if review.student_id != student.id:
        raise _forbidden("You can only edit your own reviews")

    if payload.rating is not None:
        review.rating = payload.rating
    if payload.comment is not None:
        review.comment = payload.comment

    await db.flush()
    await _recompute_rating(review.tutor_id, db)
    await db.refresh(review)

    student_name = f"{student.first_name} {student.last_name}".strip()
    return _build_review_response(review, student_name)


async def delete_review(
    review_id: int,
    student: User,
    db: AsyncSession,
) -> None:
    """
    Delete a student's own review.

    Raises
    ------
    404  — review not found
    403  — review belongs to a different student
    """
    review = await db.get(Review, review_id)
    if review is None:
        raise _not_found("Review", review_id)
    if review.student_id != student.id:
        raise _forbidden("You can only delete your own reviews")

    tutor_id = review.tutor_id
    await db.delete(review)
    await db.flush()
    await _recompute_rating(tutor_id, db)


async def list_tutor_reviews(
    tutor_id: int,
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 10,
    visible_only: bool = True,
) -> PaginatedReviews:
    """
    Paginated list of reviews for a tutor.

    Students see visible reviews only (``visible_only=True``).
    Admins can pass ``visible_only=False`` to see all reviews.

    Raises 404 if the tutor does not exist.
    """
    profile = await db.get(TutorProfile, tutor_id)
    if profile is None:
        raise _not_found("TutorProfile", tutor_id)

    base_stmt = (
        select(Review, User.first_name, User.last_name)
        .join(User, User.id == Review.student_id)
        .where(Review.tutor_id == tutor_id)
    )
    if visible_only:
        base_stmt = base_stmt.where(Review.is_visible.is_(True))

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.scalar(count_stmt)) or 0

    offset = (page - 1) * page_size
    paged_stmt = (
        base_stmt
        .order_by(Review.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(paged_stmt)).all()

    items = [
        _build_review_response(review, f"{first} {last}".strip())
        for review, first, last in rows
    ]
    return PaginatedReviews.build(items=items, total=total, page=page, page_size=page_size)


async def set_review_visibility(
    review_id: int,
    is_visible: bool,
    db: AsyncSession,
) -> ReviewResponse:
    """
    Admin toggle: show or hide a review without deleting it.

    Recalculates the tutor's aggregate rating after the visibility change
    since hidden reviews are excluded from the average.

    Raises 404 if the review does not exist.
    """
    review = await db.get(Review, review_id)
    if review is None:
        raise _not_found("Review", review_id)

    review.is_visible = is_visible
    await db.flush()
    await _recompute_rating(review.tutor_id, db)
    await db.refresh(review)

    # Fetch the student name for the response
    student = await db.get(User, review.student_id)
    student_name = (
        f"{student.first_name} {student.last_name}".strip() if student else ""
    )
    return _build_review_response(review, student_name)


async def admin_delete_review(review_id: int, db: AsyncSession) -> None:
    """
    Admin hard-delete of any review.

    Raises 404 if the review does not exist.
    """
    review = await db.get(Review, review_id)
    if review is None:
        raise _not_found("Review", review_id)

    tutor_id = review.tutor_id
    await db.delete(review)
    await db.flush()
    await _recompute_rating(tutor_id, db)


# ─────────────────────────────────────────────────────────────────────────────
# Admin helpers
# ─────────────────────────────────────────────────────────────────────────────


async def list_all_tutors(
    db: AsyncSession,
    *,
    verification_status: VerificationStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedTutors:
    """
    Admin listing of all tutors, including inactive and unverified ones.

    Optionally filtered by ``verification_status``.
    """
    base_stmt = select(TutorProfile).options(
        selectinload(TutorProfile.tutor_subjects).selectinload(TutorSubject.subject)
    )
    if verification_status is not None:
        base_stmt = base_stmt.where(
            TutorProfile.verification_status == verification_status
        )

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.scalar(count_stmt)) or 0

    offset = (page - 1) * page_size
    paged_stmt = base_stmt.order_by(TutorProfile.created_at.desc()).offset(offset).limit(page_size)
    profiles = (await db.scalars(paged_stmt)).all()

    items = [_build_tutor_summary(p) for p in profiles]
    return PaginatedTutors.build(items=items, total=total, page=page, page_size=page_size)
