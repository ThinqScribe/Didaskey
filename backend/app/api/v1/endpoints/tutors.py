"""
Student-facing tutor marketplace endpoints.

All routes here are publicly readable (tutor discovery / profile) or
require an authenticated student / parent account (reviews).

Route map
---------
GET    /tutors                          — paginated tutor search with filters
GET    /tutors/subjects                 — list active subjects (for filter UI)
GET    /tutors/{tutor_id}               — full tutor profile detail
GET    /tutors/{tutor_id}/reviews       — paginated visible reviews for a tutor
POST   /tutors/{tutor_id}/reviews       — submit a new review (auth required)
PATCH  /tutors/{tutor_id}/reviews/{id}  — edit own review (auth required)
DELETE /tutors/{tutor_id}/reviews/{id}  — delete own review (auth required)
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.marketplace import TeachingMode
from app.models.user import User
from app.schemas.marketplace import (
    PaginatedReviews,
    PaginatedTutors,
    ReviewCreateRequest,
    ReviewResponse,
    ReviewUpdateRequest,
    SubjectResponse,
    TutorDetail,
)
from app.services import tutor_service

router = APIRouter()


# ── Subject catalogue ─────────────────────────────────────────────────────────


@router.get(
    "/subjects",
    response_model=list[SubjectResponse],
    summary="List active subjects",
    description=(
        "Returns all active subjects in the catalogue. "
        "Used to populate subject filter dropdowns in the student UI."
    ),
)
async def list_subjects(
    db: AsyncSession = Depends(get_db_session),
) -> list[SubjectResponse]:
    return await tutor_service.list_subjects(db, active_only=True)


# ── Tutor discovery ───────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=PaginatedTutors,
    summary="Search and filter tutors",
    description=(
        "Returns a paginated list of verified, active tutors. "
        "All filter parameters are optional and combinable. "
        "Results are sorted by rating (desc), then total hours taught (desc)."
    ),
)
async def search_tutors(
    subject_id: int | None = Query(
        default=None,
        gt=0,
        description="Filter to tutors who teach this subject ID",
    ),
    teaching_mode: TeachingMode | None = Query(
        default=None,
        description="Filter by session format: online, in_person, or both",
    ),
    min_rating: Decimal | None = Query(
        default=None,
        ge=Decimal("0"),
        le=Decimal("5"),
        description="Minimum average star rating (inclusive)",
    ),
    max_rate: Decimal | None = Query(
        default=None,
        ge=Decimal("0"),
        description="Maximum hourly rate (inclusive)",
    ),
    city: str | None = Query(
        default=None,
        max_length=100,
        description="Case-insensitive partial match on tutor city",
    ),
    search: str | None = Query(
        default=None,
        max_length=100,
        description="Partial text match on tutor display name or bio",
    ),
    page: int = Query(default=1, ge=1, description="1-based page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db_session),
) -> PaginatedTutors:
    return await tutor_service.search_tutors(
        db,
        subject_id=subject_id,
        teaching_mode=teaching_mode,
        min_rating=min_rating,
        max_rate=max_rate,
        city=city,
        search=search,
        page=page,
        page_size=page_size,
    )


# ── Tutor profile detail ──────────────────────────────────────────────────────


@router.get(
    "/{tutor_id}",
    response_model=TutorDetail,
    summary="Get full tutor profile",
    description=(
        "Returns the complete tutor profile including bio, qualifications, "
        "subjects with rate overrides, and weekly availability slots."
    ),
)
async def get_tutor(
    tutor_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> TutorDetail:
    return await tutor_service.get_tutor_detail(tutor_id, db)


# ── Reviews ───────────────────────────────────────────────────────────────────


@router.get(
    "/{tutor_id}/reviews",
    response_model=PaginatedReviews,
    summary="List tutor reviews",
    description=(
        "Returns a paginated list of visible reviews for a tutor, "
        "sorted by most recent first."
    ),
)
async def list_reviews(
    tutor_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db_session),
) -> PaginatedReviews:
    return await tutor_service.list_tutor_reviews(
        tutor_id, db, page=page, page_size=page_size, visible_only=True
    )


@router.post(
    "/{tutor_id}/reviews",
    response_model=ReviewResponse,
    status_code=201,
    summary="Submit a review",
    description=(
        "Authenticated students and parents can submit one review per tutor. "
        "Attempting a second review for the same tutor returns 409."
    ),
)
async def create_review(
    tutor_id: int,
    payload: ReviewCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    # Ensure the tutor_id in the URL matches the payload to prevent mismatch
    payload.tutor_id = tutor_id
    return await tutor_service.create_review(payload, current_user, db)


@router.patch(
    "/{tutor_id}/reviews/{review_id}",
    response_model=ReviewResponse,
    summary="Edit own review",
    description="Authenticated students can update the rating or comment on their own review.",
)
async def update_review(
    tutor_id: int,
    review_id: int,
    payload: ReviewUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    return await tutor_service.update_review(review_id, payload, current_user, db)


@router.delete(
    "/{tutor_id}/reviews/{review_id}",
    status_code=204,
    summary="Delete own review",
    description="Authenticated students can permanently delete their own review.",
)
async def delete_review(
    tutor_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await tutor_service.delete_review(review_id, current_user, db)
