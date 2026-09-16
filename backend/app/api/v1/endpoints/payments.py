"""
Payment endpoints.

Route map
---------
POST /payments/initiate                — (re)initiate Paystack for a pending booking
POST /payments/webhook                 — Paystack webhook receiver
POST /payments/bookings/{id}/refund    — issue full refund (admin only)

Security notes
--------------
- /payments/webhook does NOT use the standard Bearer auth dependency.
  It is a public endpoint but is protected exclusively by HMAC-SHA512
  signature verification inside payment_service.handle_webhook().
  Any request that fails signature verification is silently dropped.
- The endpoint always returns HTTP 200 to Paystack regardless of
  processing outcome so Paystack does not retry endlessly.
- /payments/initiate requires a valid Bearer token and will only
  return an access_code for the booking's owning student.
- Raw request body is read with Request.body() before FastAPI parses
  JSON, preserving the exact byte sequence needed for HMAC verification.
"""

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.schemas.billing import (
    BookingResponse,
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    RefundResponse,
)
from app.services import payment_service

router = APIRouter()


@router.post(
    "/initiate",
    response_model=PaymentInitiateResponse,
    summary="Initiate payment for a pending booking",
    description=(
        "Calls Paystack /transaction/initialize for a booking that is in "
        "`pending_payment` status and returns the `access_code` for the "
        "mobile Paystack SDK. Idempotent — safe to call again if the first "
        "attempt was interrupted."
    ),
)
async def initiate_payment(
    payload: PaymentInitiateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> PaymentInitiateResponse:
    result = await payment_service.initiate_payment(
        payload.booking_id, current_user, db
    )
    await db.commit()
    return result


@router.post(
    "/bookings/{booking_id}/verify",
    response_model=BookingResponse,
    summary="Verify and confirm a paid booking",
    description=(
        "Server-side fallback for mobile checkout redirects. The backend "
        "verifies the stored Paystack reference directly with Paystack and "
        "confirms the booking if the charge succeeded."
    ),
)
async def verify_booking_payment(
    booking_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> BookingResponse:
    result = await payment_service.verify_booking_payment(booking_id, current_user, db)
    await db.commit()
    return result


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    summary="Paystack webhook receiver",
    description=(
        "Receives and processes Paystack event webhooks. "
        "Protected by HMAC-SHA512 signature verification — not Bearer auth. "
        "Always returns 200 so Paystack does not retry on processing errors."
    ),
    # Exclude from OpenAPI auth requirements — this endpoint is not Bearer-protected
    include_in_schema=True,
)
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str = Header(
        ...,
        alias="x-paystack-signature",
        description="HMAC-SHA512 hex digest of the raw request body, signed with the webhook secret.",
    ),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    # Read raw bytes BEFORE any JSON parsing to preserve the exact byte
    # sequence that Paystack signed.
    raw_body: bytes = await request.body()

    await payment_service.handle_webhook(raw_body, x_paystack_signature, db)
    await db.commit()

    return {"status": "ok"}


@router.post(
    "/bookings/{booking_id}/refund",
    response_model=RefundResponse,
    status_code=201,
    summary="Issue a refund for a cancelled booking (admin only)",
    description=(
        "Issues a full refund via Paystack for a booking that has been "
        "cancelled and has a successful payment transaction. Admin only."
    ),
)
async def issue_refund(
    booking_id: int,
    reason: str | None = None,
    db: AsyncSession = Depends(get_db_session),
    admin: User = Depends(require_role(UserRole.ADMIN)),
) -> RefundResponse:
    result = await payment_service.issue_refund(booking_id, reason, admin, db)
    await db.commit()
    return result
