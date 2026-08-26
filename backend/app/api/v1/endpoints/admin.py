"""
Admin-only endpoints.

Every route in this module is protected by ``require_role(UserRole.ADMIN)``.
Non-admin requests receive a 403 before any business logic runs.

Route map
---------
Subject catalogue
  POST   /admin/subjects                          — create subject
  GET    /admin/subjects                          — list all subjects (incl. inactive)
  GET    /admin/subjects/{subject_id}             — get single subject
  PATCH  /admin/subjects/{subject_id}             — update subject
  DELETE /admin/subjects/{subject_id}             — hard-delete subject

Tutor profiles
  POST   /admin/tutors                            — create tutor profile
  GET    /admin/tutors                            — list all tutors (any status)
  GET    /admin/tutors/{tutor_id}                 — get full tutor detail
  PATCH  /admin/tutors/{tutor_id}                 — update tutor profile / verification
  DELETE /admin/tutors/{tutor_id}                 — hard-delete tutor profile

Tutor subjects
  POST   /admin/tutors/{tutor_id}/subjects        — assign subject to tutor
  DELETE /admin/tutors/{tutor_id}/subjects/{sid}  — remove subject from tutor

Tutor availability
  PUT    /admin/tutors/{tutor_id}/availability    — replace all availability slots

Review moderation
  GET    /admin/tutors/{tutor_id}/reviews         — list all reviews (incl. hidden)
  PATCH  /admin/reviews/{review_id}/visibility    — show / hide a review
  DELETE /admin/reviews/{review_id}               — hard-delete a review
"""

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.db.session import get_db_session
from app.integrations.imagebb import upload_image
from app.models.marketplace import VerificationStatus
from app.models.user import User, UserRole
from app.schemas.marketplace import (
    AddTutorSubjectRequest,
    PaginatedReviews,
    PaginatedTutors,
    ReviewResponse,
    SetAvailabilityRequest,
    SubjectCreateRequest,
    SubjectResponse,
    SubjectUpdateRequest,
    TutorDetail,
    TutorProfileCreateRequest,
    TutorProfileUpdateRequest,
)
from app.services import tutor_service

router = APIRouter()

# Convenience alias — every route in this file requires admin role
_admin = Depends(require_role(UserRole.ADMIN))


# ═════════════════════════════════════════════════════════════════════════════
# Subject catalogue
# ═════════════════════════════════════════════════════════════════════════════


@router.post(
    "/subjects",
    response_model=SubjectResponse,
    status_code=201,
    summary="Create a subject",
    description=(
        "Add a new subject to the platform catalogue. "
        "The slug is automatically derived from the name. "
        "Returns 409 if a subject with the same name already exists."
    ),
)
async def create_subject(
    payload: SubjectCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> SubjectResponse:
    return await tutor_service.create_subject(payload, db)


@router.get(
    "/subjects",
    response_model=list[SubjectResponse],
    summary="List all subjects",
    description=(
        "Returns all subjects including inactive ones. "
        "Use the student-facing ``GET /tutors/subjects`` endpoint "
        "for active-only results."
    ),
)
async def list_all_subjects(
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> list[SubjectResponse]:
    return await tutor_service.list_subjects(db, active_only=False)


@router.get(
    "/subjects/{subject_id}",
    response_model=SubjectResponse,
    summary="Get a subject",
    description="Returns a single subject by ID. Returns 404 if not found.",
)
async def get_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> SubjectResponse:
    return await tutor_service.get_subject(subject_id, db)


@router.patch(
    "/subjects/{subject_id}",
    response_model=SubjectResponse,
    summary="Update a subject",
    description=(
        "Partially update a subject. Only provided fields are changed. "
        "Updating the name regenerates the slug. "
        "Returns 409 on name collision."
    ),
)
async def update_subject(
    subject_id: int,
    payload: SubjectUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> SubjectResponse:
    return await tutor_service.update_subject(subject_id, payload, db)


@router.delete(
    "/subjects/{subject_id}",
    status_code=204,
    summary="Delete a subject",
    description=(
        "Hard-delete a subject. Returns 409 if any tutors are still assigned to it. "
        "Prefer ``PATCH /admin/subjects/{id}`` with ``is_active=false`` for soft-deletion."
    ),
)
async def delete_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> None:
    await tutor_service.delete_subject(subject_id, db)


# ═════════════════════════════════════════════════════════════════════════════
# Tutor profiles
# ═════════════════════════════════════════════════════════════════════════════


@router.post(
    "/tutors",
    response_model=TutorDetail,
    status_code=201,
    summary="Create a tutor profile",
    description=(
        "Create a tutor profile for an existing user whose role is ``tutor``. "
        "Returns 400 if the user role is not ``tutor``, "
        "404 if the user does not exist, "
        "409 if a profile already exists for that user."
    ),
)
async def create_tutor(
    payload: TutorProfileCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.create_tutor_profile(payload, db)


@router.get(
    "/tutors",
    response_model=PaginatedTutors,
    summary="List all tutors (admin)",
    description=(
        "Paginated listing of all tutor profiles regardless of "
        "verification status or active flag. "
        "Optionally filter by ``verification_status``."
    ),
)
async def list_tutors(
    verification_status: VerificationStatus | None = Query(
        default=None,
        description="Filter by verification status: pending, verified, or rejected",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> PaginatedTutors:
    return await tutor_service.list_all_tutors(
        db,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/tutors/{tutor_id}",
    response_model=TutorDetail,
    summary="Get full tutor profile (admin)",
    description=(
        "Returns the complete tutor profile including inactive tutors "
        "and unverified profiles that are hidden from student discovery."
    ),
)
async def get_tutor(
    tutor_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.get_tutor_detail(tutor_id, db)


@router.patch(
    "/tutors/{tutor_id}",
    response_model=TutorDetail,
    summary="Update tutor profile",
    description=(
        "Partially update any field on a tutor profile. "
        "Use ``verification_status`` to move a tutor through the "
        "pending → verified / rejected pipeline. "
        "Use ``is_active=false`` to hide a tutor from student discovery "
        "without deleting their data."
    ),
)
async def update_tutor(
    tutor_id: int,
    payload: TutorProfileUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.update_tutor_profile(tutor_id, payload, db)


@router.delete(
    "/tutors/{tutor_id}",
    status_code=204,
    summary="Delete tutor profile",
    description=(
        "Hard-delete a tutor profile and all dependent rows "
        "(subjects, availability, reviews) via cascade. "
        "Prefer ``PATCH /admin/tutors/{id}`` with ``is_active=false`` "
        "for non-destructive removal."
    ),
)
async def delete_tutor(
    tutor_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> None:
    await tutor_service.delete_tutor_profile(tutor_id, db)


# ═════════════════════════════════════════════════════════════════════════════
# Tutor subject assignment
# ═════════════════════════════════════════════════════════════════════════════


@router.post(
    "/tutors/{tutor_id}/subjects",
    response_model=TutorDetail,
    status_code=201,
    summary="Assign subject to tutor",
    description=(
        "Assign a subject from the catalogue to a tutor. "
        "An optional ``rate_override`` can be set to give this subject "
        "a different hourly rate from the tutor's global rate. "
        "Returns 409 if the subject is already assigned."
    ),
)
async def add_tutor_subject(
    tutor_id: int,
    payload: AddTutorSubjectRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.add_tutor_subject(tutor_id, payload, db)


@router.delete(
    "/tutors/{tutor_id}/subjects/{subject_id}",
    response_model=TutorDetail,
    summary="Remove subject from tutor",
    description=(
        "Remove a subject assignment from a tutor. "
        "Returns 404 if the assignment does not exist."
    ),
)
async def remove_tutor_subject(
    tutor_id: int,
    subject_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.remove_tutor_subject(tutor_id, subject_id, db)


# ═════════════════════════════════════════════════════════════════════════════
# Tutor availability
# ═════════════════════════════════════════════════════════════════════════════


@router.put(
    "/tutors/{tutor_id}/availability",
    response_model=TutorDetail,
    summary="Set tutor availability",
    description=(
        "Replace all weekly availability slots for a tutor in a single call. "
        "This is a full-replacement operation — existing slots are deleted "
        "and the provided list is inserted fresh. "
        "Send an empty ``slots`` array to clear all availability."
    ),
)
async def set_availability(
    tutor_id: int,
    payload: SetAvailabilityRequest,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    return await tutor_service.set_tutor_availability(tutor_id, payload, db)


# ═════════════════════════════════════════════════════════════════════════════
# Review moderation
# ═════════════════════════════════════════════════════════════════════════════


@router.get(
    "/tutors/{tutor_id}/reviews",
    response_model=PaginatedReviews,
    summary="List all reviews for a tutor (admin)",
    description=(
        "Paginated list of all reviews for a tutor, including hidden ones. "
        "Use the student-facing ``GET /tutors/{id}/reviews`` endpoint "
        "for visible-only results."
    ),
)
async def list_all_reviews(
    tutor_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> PaginatedReviews:
    return await tutor_service.list_tutor_reviews(
        tutor_id, db, page=page, page_size=page_size, visible_only=False
    )


@router.patch(
    "/reviews/{review_id}/visibility",
    response_model=ReviewResponse,
    summary="Toggle review visibility",
    description=(
        "Show or hide a review without deleting it. "
        "Hidden reviews are excluded from the student-facing listing "
        "and from the tutor's average rating calculation."
    ),
)
async def set_review_visibility(
    review_id: int,
    is_visible: bool = Query(description="True to show the review, False to hide it"),
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> ReviewResponse:
    return await tutor_service.set_review_visibility(review_id, is_visible, db)


@router.delete(
    "/reviews/{review_id}",
    status_code=204,
    summary="Hard-delete a review",
    description=(
        "Permanently delete any review. "
        "The tutor's aggregate rating is recalculated after deletion. "
        "Prefer ``PATCH /admin/reviews/{id}/visibility`` for non-destructive moderation."
    ),
)
async def delete_review(
    review_id: int,
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> None:
    await tutor_service.admin_delete_review(review_id, db)


# ═════════════════════════════════════════════════════════════════════════════
# Tutor photo upload
# ═════════════════════════════════════════════════════════════════════════════


@router.post(
    "/tutors/{tutor_id}/photo",
    response_model=TutorDetail,
    summary="Upload tutor profile photo",
    description=(
        "Upload a profile photo for a tutor. "
        "The image is sent to ImgBB and the returned permanent URL is "
        "saved to ``tutor_profiles.profile_image_url``. "
        "\n\n"
        "**Accepted formats:** JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC  \n"
        "**Max size:** 32 MB  \n"
        "\n"
        "The multipart field name must be ``photo``."
    ),
)
async def upload_tutor_photo(
    tutor_id: int,
    photo: UploadFile = File(
        ...,
        description="Image file to upload (JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC — max 32 MB)",
    ),
    db: AsyncSession = Depends(get_db_session),
    _: User = _admin,
) -> TutorDetail:
    image_bytes = await photo.read()
    content_type = photo.content_type or "image/jpeg"
    # Strip any charset suffix (e.g. "image/jpeg; charset=utf-8")
    content_type = content_type.split(";")[0].strip()

    # Upload to ImgBB — raises HTTPException on any failure
    image_url = await upload_image(
        image_bytes,
        filename=f"tutor_{tutor_id}",
        content_type=content_type,
    )

    # Persist the returned URL on the tutor profile
    return await tutor_service.update_tutor_profile(
        tutor_id,
        TutorProfileUpdateRequest(profile_image_url=image_url),
        db,
    )
