from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.email import send_email_verification_email, send_password_reset_email
from app.core.security import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    decode_special_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.models.marketplace import TutorProfile
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)

router = APIRouter()


def _tokens(user: User) -> TokenResponse:
    subject = {"sub": str(user.id), "version": str(user.token_version)}
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: SignupRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    email = str(request.email).lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=email,
        phone_number=request.phone_number,
        hashed_password=hash_password(request.password),
        role=request.role,
        education_level=request.education_level,
        first_name=request.first_name.strip(),
        last_name=request.last_name.strip(),
    )
    db.add(user)
    try:
        await db.flush()
        if user.role == UserRole.TUTOR:
            db.add(TutorProfile(user_id=user.id, display_name=f"{user.first_name} {user.last_name}", verification_status="pending", rate_per_hour=0))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered") from exc
    await db.refresh(user)
    background_tasks.add_task(
        send_email_verification_email,
        user.email,
        create_email_verification_token(user.id),
    )
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    email = str(request.email).lower()
    user = await db.scalar(select(User).where(User.email == email))
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if user is None or not verify_password(request.password, user.hashed_password):
        raise invalid_credentials
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification is required")
    return _tokens(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshRequest, db: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    try:
        payload = decode_token(request.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Invalid token type")
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active or not user.is_verified or str(user.token_version) != str(payload.get("version", "0")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return _tokens(user)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(request: VerifyEmailRequest, db: AsyncSession = Depends(get_db_session)) -> MessageResponse:
    try:
        user_id = decode_special_token(request.token, "email_verification")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    user.is_verified = True
    await db.commit()
    return MessageResponse(message="Email verified successfully")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    request: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    user = await db.scalar(select(User).where(User.email == str(request.email).lower()))
    if user is not None and not user.is_verified and user.is_active:
        background_tasks.add_task(
            send_email_verification_email,
            user.email,
            create_email_verification_token(user.id),
        )
    return MessageResponse(message="If the account exists, a verification email will be sent")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    user = await db.scalar(select(User).where(User.email == str(request.email).lower()))
    if user is not None and user.is_active:
        background_tasks.add_task(
            send_password_reset_email,
            user.email,
            create_password_reset_token(user.id, user.token_version),
        )
    return MessageResponse(message="If the account exists, password reset instructions will be sent")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    try:
        user_id = decode_special_token(request.token, "password_reset")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    claims = decode_token(request.token)
    if str(claims.get("version", "0")) != str(user.token_version):
        raise HTTPException(status_code=400, detail="This password reset link has already been used")
    user.hashed_password = hash_password(request.new_password)
    user.token_version += 1
    await db.commit()
    return MessageResponse(message="Password reset successfully")


@router.get("/me", response_model=UserResponse)
async def current_user(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/logout", response_model=MessageResponse)
async def logout(db: AsyncSession = Depends(get_db_session), current_user: User = Depends(get_current_user)):
    current_user.token_version += 1
    await db.commit()
    return MessageResponse(message="Signed out on all devices")
