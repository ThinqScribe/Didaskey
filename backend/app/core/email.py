import logging

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
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    await _send_email(
        to_email,
        "Verify your Didaskey email",
        f'<p>Thank you for signing up. <a href="{link}">Verify your email</a>.</p>',
    )


async def send_password_reset_email(to_email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await _send_email(
        to_email,
        "Reset your Didaskey password",
        f'<p><a href="{link}">Reset your Didaskey password</a>.</p>',
    )