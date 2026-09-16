import html

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.email import send_email_verification_email, send_password_reset_email
from app.core.config import settings
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


def _auth_action_page(title: str, message: str, *, ok: bool = True, body: str = "") -> HTMLResponse:
    status_code = status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST
    accent = "#0F766E" if ok else "#DC2626"
    escaped_title = html.escape(title)
    escaped_message = html.escape(message)
    return HTMLResponse(
        status_code=status_code,
        content=f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escaped_title}</title>
  <style>
    :root {{ color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F7FBFA; color: #08213F; }}
    main {{ width: min(92vw, 440px); padding: 32px 24px; text-align: center; }}
    .mark {{ width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 999px; display: grid; place-items: center; background: #D4FBF4; color: {accent}; font-size: 24px; font-weight: 800; }}
    h1 {{ margin: 0 0 10px; font-size: 28px; line-height: 1.12; letter-spacing: 0; }}
    p {{ margin: 0; color: #60708F; font-size: 16px; line-height: 1.55; }}
    form {{ margin-top: 24px; display: grid; gap: 12px; text-align: left; }}
    input {{ height: 52px; border: 1px solid #D5DEE9; border-radius: 999px; padding: 0 18px; font: inherit; color: #08213F; background: #FFFFFF; outline: none; }}
    input:focus {{ border-color: #0F766E; box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12); }}
    button, a {{ min-height: 52px; border: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; padding: 0 22px; background: #08213F; color: #FFFFFF; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }}
    .error {{ margin-top: 12px; color: #DC2626; font-weight: 700; }}
    .success {{ margin-top: 12px; color: #0F766E; font-weight: 700; }}
  </style>
</head>
<body>
  <main>
    <div class="mark">{"OK" if ok else "!"}</div>
    <h1>{escaped_title}</h1>
    <p>{escaped_message}</p>
    {body}
  </main>
</body>
</html>""",
    )


def _tokens(user: User) -> TokenResponse:
    subject = {"sub": str(user.id), "version": str(user.token_version)}
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


async def _verify_email_token(token: str, db: AsyncSession) -> None:
    try:
        user_id = decode_special_token(token, "email_verification")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    user.is_verified = True
    await db.commit()


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
    await _verify_email_token(request.token, db)
    return MessageResponse(message="Email verified successfully")


@router.get("/verify-email-link", response_class=HTMLResponse, include_in_schema=False)
async def verify_email_link(
    token: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db_session),
) -> HTMLResponse:
    try:
        await _verify_email_token(token, db)
    except HTTPException:
        return _auth_action_page(
            "Verification link expired",
            "Please open Didaskey and request a fresh verification email.",
            ok=False,
        )
    return _auth_action_page(
        "Email verified",
        "Your Didaskey account is ready. You can return to the app and sign in.",
    )


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


@router.get("/reset-password-link", response_class=HTMLResponse, include_in_schema=False)
async def reset_password_link(token: str = Query(min_length=1)) -> HTMLResponse:
    safe_token = html.escape(token, quote=True)
    api_path = f"{settings.API_V1_PREFIX}/auth/reset-password"
    body = f"""
    <form id="reset-form">
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" placeholder="New password" required />
      <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="72" placeholder="Confirm password" required />
      <input id="token" name="token" type="hidden" value="{safe_token}" />
      <button type="submit">Save Password</button>
      <div id="status" aria-live="polite"></div>
    </form>
    <script>
      const form = document.getElementById("reset-form");
      const statusEl = document.getElementById("status");
      form.addEventListener("submit", async (event) => {{
        event.preventDefault();
        statusEl.className = "";
        statusEl.textContent = "";
        const password = document.getElementById("password").value;
        const confirm = document.getElementById("confirm").value;
        if (password !== confirm) {{
          statusEl.className = "error";
          statusEl.textContent = "Passwords do not match.";
          return;
        }}
        try {{
          const response = await fetch("{api_path}", {{
            method: "POST",
            headers: {{ "Content-Type": "application/json" }},
            body: JSON.stringify({{ token: document.getElementById("token").value, new_password: password }}),
          }});
          const data = await response.json().catch(() => ({{}}));
          if (!response.ok) throw new Error(data.detail || "This reset link is invalid or expired.");
          form.reset();
          statusEl.className = "success";
          statusEl.textContent = "Password updated. You can return to Didaskey and sign in.";
        }} catch (error) {{
          statusEl.className = "error";
          statusEl.textContent = error.message || "Could not reset password.";
        }}
      }});
    </script>
    """
    return _auth_action_page(
        "Reset your password",
        "Choose a new password for your Didaskey account.",
        body=body,
    )


@router.get("/me", response_model=UserResponse)
async def current_user(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post("/logout", response_model=MessageResponse)
async def logout(db: AsyncSession = Depends(get_db_session), current_user: User = Depends(get_current_user)):
    current_user.token_version += 1
    await db.commit()
    return MessageResponse(message="Signed out on all devices")
