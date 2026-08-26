"""
Student-facing tutor marketplace endpoints.

Route map
---------
GET    /tutors                          — paginated tutor search with filters
GET    /tutors/subjects                 — list active subjects (for filter UI)
GET    /tutors/me                       — own tutor profile (tutor auth required)
PATCH  /tutors/me                       — update own profile (tutor auth required)
PUT    /tutors/me/availability          — replace own availability (tutor auth required)
GET    /tutors/{tutor_id}               — full tutor profile detail
GET    /tutors/{tutor_id}/reviews       — paginated visible reviews for a tutor
POST   /tutors/{tutor_id}/reviews       — submit a new review (auth required)
PATCH  /tutors/{tutor_id}/reviews/{id}  — edit own review (auth required)
DELETE /tutors/{tutor_id}/reviews/{id}  — delete own review (auth required)
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models.marketplace import TeachingMode, TutorProfile
from app.models.user import User, UserRole
from app.schemas.marketplace import (
    PaginatedReviews,
    PaginatedTutors,
    ReviewCreateRequest,
    ReviewResponse,
    ReviewUpdateRequest,
    SetAvailabilityRequest,
    SubjectResponse,
    TutorDetail,
    TutorProfileUpdateRequest,
)
from app.services import tutor_service

router = APIRouter()


# ── Subject catalogue ─────────────────────────────────────────────────────────


@router.get("/subjects", response_model=list[SubjectResponse], summary="List active subjects")
async def list_subjects(db: AsyncSession = Depends(get_db_session)) -> list[SubjectResponse]:
    return await tutor_service.list_subjects(db, active_only=True)


# ── Tutor self-service ────────────────────────────────────────────────────────


async def _require_tutor_profile(current_user: User, db: AsyncSession) -> TutorProfile:
    """Return the calling tutor's profile, or raise 403/404."""
    if current_user.role != UserRole.TUTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tutor access only.")
    profile = await db.scalar(select(TutorProfile).where(TutorProfile.user_id == current_user.id))
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor profile not found.")
    return profile


@router.get("/me", response_model=TutorDetail, summary="Get own tutor profile")
async def get_my_tutor_profile(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> TutorDetail:
    profile = await _require_tutor_profile(current_user, db)
    return await tutor_service.get_tutor_detail(profile.id, db)


@router.patch("/me", response_model=TutorDetail, summary="Update own tutor profile")
async def update_my_tutor_profile(
    payload: TutorProfileUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> TutorDetail:
    profile = await _require_tutor_profile(current_user, db)
    result = await tutor_service.update_tutor_profile(profile.id, payload, db)
    await db.commit()
    return result


@router.put("/me/availability", response_model=TutorDetail, summary="Replace own availability slots")
async def set_my_availability(
    payload: SetAvailabilityRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> TutorDetail:
    profile = await _require_tutor_profile(current_user, db)
    result = await tutor_service.set_tutor_availability(profile.id, payload, db)
    await db.commit()
    return result


# ── Tutor discovery ───────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedTutors, summary="Search and filter tutors")
async def search_tutors(
    subject_id: int | None = Query(default=None, gt=0),
    teaching_mode: TeachingMode | None = Query(default=None),
    min_rating: Decimal | None = Query(default=None, ge=Decimal("0"), le=Decimal("5")),
    max_rate: Decimal | None = Query(default=None, ge=Decimal("0")),
    city: str | None = Query(default=None, max_length=100),
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
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


@router.get("/{tutor_id}", response_model=TutorDetail, summary="Get full tutor profile")
async def get_tutor(
    tutor_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> TutorDetail:
    return await tutor_service.get_tutor_detail(tutor_id, db)


# ── Reviews ───────────────────────────────────────────────────────────────────


@router.get("/{tutor_id}/reviews", response_model=PaginatedReviews, summary="List tutor reviews")
async def list_reviews(
    tutor_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db_session),
) -> PaginatedReviews:
    return await tutor_service.list_tutor_reviews(
        tutor_id, db, page=page, page_size=page_size, visible_only=True
    )


@router.post("/{tutor_id}/reviews", response_model=ReviewResponse, status_code=201, summary="Submit a review")
async def create_review(
    tutor_id: int,
    payload: ReviewCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    payload.tutor_id = tutor_id
    return await tutor_service.create_review(payload, current_user, db)


@router.patch("/{tutor_id}/reviews/{review_id}", response_model=ReviewResponse, summary="Edit own review")
async def update_review(
    tutor_id: int,
    review_id: int,
    payload: ReviewUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    return await tutor_service.update_review(review_id, payload, current_user, db)


@router.delete("/{tutor_id}/reviews/{review_id}", status_code=204, summary="Delete own review")
async def delete_review(
    tutor_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await tutor_service.delete_review(review_id, current_user, db)
