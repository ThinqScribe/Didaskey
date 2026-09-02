"""
Pydantic contracts for bookings and payments.

Naming convention (matches marketplace.py)
------------------------------------------
*Request   — inbound client payloads
*Response  — outbound representations
Paginated* — paginated list wrapper

Security notes
--------------
- PaystackInitResponse intentionally omits the secret key and only
  exposes the access_code + reference that the mobile SDK needs.
- WebhookPayload is validated and verified via HMAC before any field
  on it is trusted (see payment_service.py).
- BookingResponse never leaks the other party's contact details beyond
  what is needed to display the booking card.
"""

from __future__ import annotations

import math
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.billing import BookingStatus, RefundStatus, SessionFormat, TransactionStatus


# ═════════════════════════════════════════════════════════════════════════════
# Booking — inbound
# ═════════════════════════════════════════════════════════════════════════════


class BookingCreateRequest(BaseModel):
    """
    Student payload to create a new booking.

    The API derives ``amount`` from the tutor's rate + duration so the
    client cannot manipulate the price.  ``student_note`` is the only
    free-text field and is capped to prevent abuse.
    """

    tutor_id: int = Field(gt=0)
    subject_id: int | None = Field(default=None, gt=0)
    scheduled_at: datetime = Field(
        description="UTC datetime of the session start (ISO 8601 with timezone offset)"
    )
    duration_minutes: int = Field(
        default=60,
        ge=30,
        le=480,
        description="Session length in minutes. Min 30, max 480 (8 hours).",
    )
    session_format: SessionFormat = Field(default=SessionFormat.ONLINE)
    student_note: str | None = Field(
        default=None,
        max_length=500,
        description="Optional message to the tutor (e.g. topics to cover).",
    )

    @field_validator("scheduled_at")
    @classmethod
    def must_be_future(cls, v: datetime) -> datetime:
        from datetime import timezone

        now = datetime.now(tz=timezone.utc)
        # Accept tz-aware datetimes only; reject naive ones
        if v.tzinfo is None:
            raise ValueError("scheduled_at must include a timezone offset (use ISO 8601)")
        if v <= now:
            raise ValueError("scheduled_at must be in the future")
        return v


class BookingCancelRequest(BaseModel):
    """Student or admin payload to cancel a booking."""

    reason: str | None = Field(
        default=None,
        max_length=500,
        description="Optional cancellation reason stored on the booking.",
    )


# ═════════════════════════════════════════════════════════════════════════════
# Booking — outbound
# ═════════════════════════════════════════════════════════════════════════════


class TransactionSummary(BaseModel):
    """Minimal transaction info embedded inside a booking response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    paystack_reference: str
    status: TransactionStatus
    amount: Decimal
    currency: str
    paid_at: datetime | None


class BookingResponse(BaseModel):
    """
    Full booking representation returned to the owning student or admin.

    ``transaction`` is always included so the client can display payment
    status and hand the access_code to the Paystack SDK without a second
    round-trip.

    Fields intentionally omitted
    -----------------------------
    - Tutor / student personal contact details (phone, email) are NOT
      included. The chat system is the only sanctioned communication channel.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    student_name: str | None = None
    tutor_id: int
    tutor_name: str
    subject_id: int | None
    subject_name: str | None
    scheduled_at: datetime
    duration_minutes: int
    session_format: SessionFormat
    student_note: str | None
    amount: Decimal
    currency: str
    status: BookingStatus
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime
    transaction: TransactionSummary | None = None


class BookingWithPaystackResponse(BookingResponse):
    """
    Extended booking response returned immediately after creation.

    Adds the Paystack ``access_code`` needed by the mobile SDK to
    launch the payment sheet.  Only returned on the initial POST — not
    on subsequent GETs — because the code is short-lived.
    """

    paystack_access_code: str
    paystack_reference: str
    authorization_url: str


# ═════════════════════════════════════════════════════════════════════════════
# Payment — Paystack initialise response (internal, not client-facing as-is)
# ═════════════════════════════════════════════════════════════════════════════


class PaystackInitResponse(BaseModel):
    """
    The subset of Paystack's /transaction/initialize response that
    the API forwards to the mobile client.

    The full Paystack response contains additional metadata that is not
    needed client-side and is never forwarded.
    """

    authorization_url: str
    """Paystack-hosted payment page URL (used by web clients; mobile uses access_code)."""

    access_code: str
    """Short-lived code passed to the React Native Paystack SDK."""

    reference: str
    """Our UUID4 reference — matches Transaction.paystack_reference."""


# ═════════════════════════════════════════════════════════════════════════════
# Payment — checkout initiation (client → API)
# ═════════════════════════════════════════════════════════════════════════════


class PaymentInitiateRequest(BaseModel):
    """
    Client payload to initiate payment for an existing pending booking.

    The booking must already exist (created via POST /bookings) and be
    in ``PENDING_PAYMENT`` status.  This endpoint calls Paystack
    /initialize and returns the access_code for the mobile SDK.
    """

    booking_id: int = Field(gt=0)


class PaymentInitiateResponse(BaseModel):
    """
    Returned to the client after a successful Paystack initialise call.

    The client passes ``access_code`` to the Paystack React Native SDK
    and ``reference`` to poll or verify the payment status.
    """

    booking_id: int
    access_code: str
    reference: str
    amount: Decimal
    currency: str
    authorization_url: str | None = None


# ═════════════════════════════════════════════════════════════════════════════
# Payment — Paystack webhook (server → API, not client-facing)
# ═════════════════════════════════════════════════════════════════════════════


class PaystackWebhookData(BaseModel):
    """
    The ``data`` object inside a Paystack charge.success webhook event.

    Only the fields we actually use are declared; extras are silently
    ignored (``extra="ignore"`` propagated from parent).
    """

    reference: str
    status: str
    amount: int
    """Amount in **kobo** (smallest currency unit). Divide by 100 for NGN."""

    currency: str
    id: int
    """Paystack's own transaction ID."""

    gateway_response: str | None = None
    paid_at: str | None = None


class PaystackWebhookPayload(BaseModel):
    """
    Top-level structure of a Paystack webhook POST body.

    This schema is used only after the HMAC-SHA512 signature has been
    verified — never parse untrusted input into this model directly.
    """

    event: str
    data: PaystackWebhookData

    model_config = ConfigDict(extra="ignore")


# ═════════════════════════════════════════════════════════════════════════════
# Refund
# ═════════════════════════════════════════════════════════════════════════════


class RefundResponse(BaseModel):
    """A single refund record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    amount: Decimal
    reason: str | None
    status: RefundStatus
    paystack_refund_id: str | None
    created_at: datetime


# ═════════════════════════════════════════════════════════════════════════════
# Pagination
# ═════════════════════════════════════════════════════════════════════════════


class PaginatedBookings(BaseModel):
    """Paginated booking listing with metadata."""

    items: list[BookingResponse]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_pages: int = Field(ge=0)

    @classmethod
    def build(
        cls,
        items: list[BookingResponse],
        total: int,
        page: int,
        page_size: int,
    ) -> "PaginatedBookings":
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if page_size else 0,
        )
