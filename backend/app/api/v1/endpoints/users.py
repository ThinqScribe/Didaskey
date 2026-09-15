from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.integrations.imagebb import upload_image, ALLOWED_CONTENT_TYPES
from app.models.user import User
from app.schemas.auth import UserResponse, UserUpdateRequest

router = APIRouter()


@router.get("/me", response_model=UserResponse, summary="Get current user")
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/me/avatar", response_model=UserResponse, summary="Upload profile photo")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{file.content_type}'. Use JPEG, PNG, or WEBP.",
        )

    image_bytes = await file.read()
    url = await upload_image(
        image_bytes,
        filename=f"avatar_{current_user.id}",
        content_type=file.content_type or "image/jpeg",
    )

    current_user.profile_image_url = url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse, summary="Update current user profile")
async def update_me(
    payload: UserUpdateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    updates = payload.model_dump(exclude_unset=True)
    if "first_name" in updates and updates["first_name"] is not None:
        current_user.first_name = updates["first_name"]
    if "last_name" in updates and updates["last_name"] is not None:
        current_user.last_name = updates["last_name"]
    if "phone_number" in updates:
        current_user.phone_number = updates["phone_number"]
    if "education_level" in updates:
        if current_user.role != "student" and updates["education_level"] is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Education level only applies to students.")
        current_user.education_level = updates["education_level"]

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)
