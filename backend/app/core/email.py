import logging
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def _send_email(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        return

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=10.0)) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={"from": settings.RESEND_FROM_EMAIL, "to": [to], "subject": subject, "html": html},
            )
            response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("Email provider request failed: %s", type(exc).__name__)


async def send_email_verification_email(to_email: str, token: str) -> None:
    api_base = (settings.PUBLIC_API_URL or settings.FRONTEND_URL).rstrip("/")
    link = f"{api_base}{settings.API_V1_PREFIX}/auth/verify-email-link?token={quote(token)}"
    await _send_email(
        to_email,
        "Verify your Didaskey email",
        f'<p>Thank you for signing up. <a href="{link}">Verify your email</a>.</p>',
    )


async def send_password_reset_email(to_email: str, token: str) -> None:
    api_base = (settings.PUBLIC_API_URL or settings.FRONTEND_URL).rstrip("/")
    link = f"{api_base}{settings.API_V1_PREFIX}/auth/reset-password-link?token={quote(token)}"
    await _send_email(
        to_email,
        "Reset your Didaskey password",
        f'<p><a href="{link}">Reset your Didaskey password</a>.</p>',
    )


async def send_lesson_reminder_email(to_email: str, first_name: str, subject: str, time_label: str) -> None:
    await _send_email(
        to_email,
        "Your Didaskey lesson starts soon",
        (
            f"<p>Hi {first_name},</p>"
            f"<p>Your {subject} lesson starts at <strong>{time_label}</strong>.</p>"
            "<p>Open Didaskey a few minutes early to test your audio, video, and shared materials.</p>"
        ),
    )
