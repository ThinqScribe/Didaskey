"""
PaymentService — checkout initiation and Paystack webhook processing.

Responsibilities
----------------
- Initiate a Paystack payment for a pending booking
- Process incoming Paystack webhooks (charge.success, charge.failed)
- Issue refunds for cancelled confirmed bookings
- Return transaction details to authorised callers

Security invariants
-------------------
1. Webhook handler verifies HMAC-SHA512 signature BEFORE touching the DB.
2. After HMAC passes, a secondary server-to-server verify call is made to
   Paystack to confirm the charge is genuinely successful — this guards
   against a scenario where the webhook secret leaks but the charge never
   actually succeeded.
3. Amount cross-check: the kobo amount in the webhook is compared against
   the stored transaction amount. A mismatch aborts processing.
4. The paystack_reference UNIQUE constraint on Transaction prevents a
   replayed webhook from affecting a different row.
5. Transient processing failures propagate so Paystack can retry delivery.
6. Student email is used for Paystack initialisation but never logged at
   INFO level — only at DEBUG, which should be off in production.
"""

from __future__ import annotations

import logging
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.integrations import payments as paystack
from app.core.config import settings
from app.models.billing import (
    Booking,
    BookingStatus,
    Refund,
    RefundStatus,
    Transaction,
    TransactionStatus,
)
from app.models.user import User, UserRole
from app.schemas.billing import (
    PaymentInitiateResponse,
    PaystackWebhookPayload,
    RefundResponse,
)
from app.services import booking_service

logger = logging.getLogger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _http(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _not_found(resource: str, resource_id: int | str) -> HTTPException:
    return _http(status.HTTP_404_NOT_FOUND, f"{resource} {resource_id!r} not found")


def _bad_request(detail: str) -> HTTPException:
    return _http(status.HTTP_400_BAD_REQUEST, detail)


def _forbidden(detail: str) -> HTTPException:
    return _http(status.HTTP_403_FORBIDDEN, detail)


async def _load_transaction_by_reference(
    reference: str, db: AsyncSession
) -> Transaction:
    """Load a Transaction by paystack_reference. Raises 404 if absent."""
    txn = await db.scalar(
        select(Transaction)
        .where(Transaction.paystack_reference == reference)
        .options(selectinload(Transaction.booking))
    )
    if txn is None:
        raise _not_found("Transaction with reference", reference)
    return txn


# ── Checkout initiation ───────────────────────────────────────────────────────


async def initiate_payment(
    booking_id: int,
    student: User,
    db: AsyncSession,
) -> PaymentInitiateResponse:
    """
    Initiate a Paystack payment for an existing pending booking.

    Flow
    ----
    1. Load the booking and assert it belongs to the requesting student.
    2. Assert the booking is still in PENDING_PAYMENT status.
    3. Load the companion Transaction (created alongside the booking).
     4. Re-initialise Paystack for retries so the client always receives a
         browser authorization URL it can open.
    5. Call Paystack /transaction/initialize with the student's email,
       the snapshotted booking amount, and our UUID4 reference.
    6. Store the returned access_code on the Transaction row.
    7. Return the access_code + reference to the client.

    Raises
    ------
    403  booking does not belong to the requesting student
    404  booking or transaction not found
    400  booking is not in PENDING_PAYMENT status
    """
    # ── 1. Load booking ───────────────────────────────────────────────────────
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(selectinload(Booking.transaction))
    )
    if booking is None:
        raise _not_found("Booking", booking_id)

    if booking.student_id != student.id:
        raise _forbidden("You do not have access to this booking.")

    # ── 2. Status guard ───────────────────────────────────────────────────────
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise _bad_request(
            f"Payment can only be initiated for bookings in 'pending_payment' "
            f"status (current: '{booking.status}')."
        )

    # ── 3. Load transaction ───────────────────────────────────────────────────
    txn = booking.transaction
    if txn is None:
        # Should never happen — create_booking always creates the Transaction.
        # Guard here for defensive completeness.
        raise _not_found("Transaction for booking", booking_id)

    # ── 4. Rotate reference so Paystack doesn't reject it as a duplicate ─────
    # Paystack returns 400 if the same reference is re-submitted. Generate a
    # fresh UUID for every initiation attempt and update the transaction row so
    # the webhook can still match it back to the correct booking.
    new_reference = str(uuid.uuid4())
    txn.paystack_reference = new_reference
    await db.flush()

    # ── 5. Call Paystack ──────────────────────────────────────────────────────
    # callback_url tells Paystack where to redirect after payment completes.
    # The mobile WebView intercepts this URL before it actually loads, which
    # is the only reliable way to detect payment completion inside a WebView
    # (Paystack does not always fire a URL change on its own).
    init_resp = await paystack.initialize_transaction(
        email=student.email,
        amount=txn.amount,
        currency=txn.currency,
        reference=new_reference,
        callback_url=f"{settings.FRONTEND_URL.rstrip('/')}/payment/callback",
        metadata={
            "booking_id": booking.id,
            "student_id": student.id,
            "tutor_id": booking.tutor_id,
        },
    )

    # ── 6. Persist access_code ────────────────────────────────────────────────
    txn.paystack_access_code = init_resp.access_code
    await db.flush()

    logger.info(
        "Payment initiated: booking_id=%s reference=%s",
        booking.id,
        new_reference,
    )

    # ── 7. Return to client ───────────────────────────────────────────────────
    return PaymentInitiateResponse(
        booking_id=booking.id,
        access_code=init_resp.access_code,
        reference=init_resp.reference,
        amount=txn.amount,
        currency=txn.currency,
        authorization_url=init_resp.authorization_url,
    )


# ── Webhook processing ────────────────────────────────────────────────────────


async def handle_webhook(
    raw_body: bytes,
    signature: str,
    db: AsyncSession,
) -> None:
    """
    Process a Paystack webhook event.

    Security pipeline
    -----------------
    1. HMAC-SHA512 signature verified against raw bytes (before any parse).
    2. Event type checked — only ``charge.success`` and ``charge.failed``
       are acted upon; all others are acknowledged and ignored.
    3. Server-to-server verification call to Paystack confirms the charge
       is genuinely successful (secondary guard against key leakage).
    4. Amount cross-check: webhook kobo amount ÷ 100 must match the stored
       transaction amount within 0.01 tolerance.
    5. Idempotency: if the transaction is already SUCCESS the handler
       exits cleanly without re-processing.

    Invalid payloads are ignored; transient processing errors propagate for retry.
    """
    # ── Step 1: Verify HMAC signature ─────────────────────────────────────────
    if not paystack.verify_webhook_signature(raw_body, signature):
        logger.warning("Webhook rejected: invalid HMAC signature")
        return

    # ── Step 2: Parse payload (safe now that signature is verified) ───────────
    try:
        envelope = json.loads(raw_body)
    except Exception as exc:
        logger.error("Webhook parse error: %s", exc)
        return
    if isinstance(envelope, dict) and str(envelope.get("event", "")).startswith("refund."):
        await _process_refund(envelope["event"], envelope.get("data", {}), db)
        return
    try:
        payload = PaystackWebhookPayload.model_validate(envelope)
    except Exception as exc:
        logger.error("Webhook charge parse error: %s", exc)
        return

    event = payload.event
    data = payload.data

    logger.info("Webhook received: event=%s reference=%s", event, data.reference)

    if event == "charge.success":
        await _process_charge_success(data, db)
    elif event == "charge.failed":
        await _process_charge_failed(data, db)
    else:
        # Unknown event — acknowledge silently
        logger.debug("Webhook event ignored: %s", event)


async def _process_refund(event: str, data: dict, db: AsyncSession) -> None:
    """Reconcile signed full-refund notifications; terminal success never regresses."""
    if event not in {"refund.processed", "refund.failed"} or not isinstance(data, dict):
        return
    reference = data.get("transaction_reference")
    if not isinstance(reference, str):
        return
    txn = await db.scalar(select(Transaction).where(
        Transaction.paystack_reference == reference
    ).with_for_update())
    if txn is None:
        return
    refund = await db.scalar(select(Refund).where(Refund.transaction_id == txn.id))
    if refund is None or refund.status == RefundStatus.PROCESSED:
        return
    try:
        amount = Decimal(str(data.get("amount"))) / Decimal("100")
    except Exception:
        return
    if amount != refund.amount or str(data.get("currency", "")).upper() != txn.currency.upper():
        return
    refund.status = RefundStatus.PROCESSED if event == "refund.processed" else RefundStatus.FAILED
    if refund.status == RefundStatus.PROCESSED:
        txn.status = TransactionStatus.REFUNDED
    await db.flush()


async def _process_charge_success(
    data: "PaystackWebhookData",  # type: ignore[name-defined]  # noqa: F821
    db: AsyncSession,
) -> None:
    """
    Handle charge.success:
    1. Load transaction by reference.
    2. Idempotency check.
    3. Secondary server-to-server verify.
    4. Amount cross-check.
    5. Update Transaction to SUCCESS.
    6. Confirm the Booking.
    """
    # ── 1. Load transaction ───────────────────────────────────────────────────
    txn = await db.scalar(
        select(Transaction)
        .where(Transaction.paystack_reference == data.reference)
        .options(selectinload(Transaction.booking))
        .with_for_update()
    )
    if txn is None:
        logger.error(
            "Webhook charge.success: no transaction for reference=%s", data.reference
        )
        return

    # ── 2. Idempotency ────────────────────────────────────────────────────────
    if txn.status in (TransactionStatus.SUCCESS, TransactionStatus.REFUNDED):
        logger.info(
            "Webhook charge.success: already processed reference=%s", data.reference
        )
        return

    # ── 3. Secondary server-to-server verify ──────────────────────────────────
    try:
        verified = await paystack.verify_transaction(data.reference)
    except Exception as exc:
        logger.error(
            "Webhook charge.success: server verify failed reference=%s error=%s",
            data.reference,
            exc,
        )
        raise HTTPException(503, "Payment verification unavailable; retry delivery") from exc

    if verified.get("status") != "success":
        logger.warning(
            "Webhook charge.success: Paystack verify returned status=%s "
            "for reference=%s — aborting",
            verified.get("status"),
            data.reference,
        )
        return

    # ── 4. Amount cross-check ─────────────────────────────────────────────────
    webhook_amount = Decimal(str(data.amount)) / Decimal("100")
    if (webhook_amount != txn.amount or data.currency.upper() != txn.currency.upper()
        or Decimal(str(verified.get("amount", -1))) != txn.amount * 100
        or str(verified.get("currency", "")).upper() != txn.currency.upper()
        or verified.get("reference") != txn.paystack_reference):
        logger.error(
            "Webhook charge.success: amount mismatch reference=%s "
            "expected=%s received=%s — aborting",
            data.reference,
            txn.amount,
            webhook_amount,
        )
        return

    # ── 5. Update transaction ─────────────────────────────────────────────────
    txn.status = TransactionStatus.SUCCESS
    txn.paystack_transaction_id = str(data.id)
    txn.gateway_response = data.gateway_response

    paid_at_str = data.paid_at
    if paid_at_str:
        try:
            txn.paid_at = datetime.fromisoformat(
                paid_at_str.replace("Z", "+00:00")
            )
        except ValueError:
            txn.paid_at = datetime.now(tz=timezone.utc)
    else:
        txn.paid_at = datetime.now(tz=timezone.utc)

    await db.flush()

    # ── 6. Confirm booking ────────────────────────────────────────────────────
    try:
        await booking_service.confirm_booking(txn.booking_id, db)
    except HTTPException as exc:
        logger.error(
            "Webhook charge.success: confirm_booking failed booking_id=%s detail=%s",
            txn.booking_id,
            exc.detail,
        )

    logger.info(
        "Webhook charge.success: processed booking_id=%s reference=%s",
        txn.booking_id,
        data.reference,
    )


async def _process_charge_failed(
    data: "PaystackWebhookData",  # type: ignore[name-defined]  # noqa: F821
    db: AsyncSession,
) -> None:
    """Mark the transaction as FAILED. The booking remains PENDING_PAYMENT."""
    txn = await db.scalar(
        select(Transaction).where(Transaction.paystack_reference == data.reference)
    )
    if txn is None:
        logger.error(
            "Webhook charge.failed: no transaction for reference=%s", data.reference
        )
        return

    if txn.status in (TransactionStatus.SUCCESS, TransactionStatus.FAILED):
        return  # idempotent

    txn.status = TransactionStatus.FAILED
    txn.gateway_response = data.gateway_response
    await db.flush()

    logger.info(
        "Webhook charge.failed: transaction_id=%s reference=%s",
        txn.id,
        data.reference,
    )


# ── Refunds ───────────────────────────────────────────────────────────────────


async def issue_refund(
    booking_id: int,
    reason: str | None,
    admin: User,
    db: AsyncSession,
) -> RefundResponse:
    """
    Issue a full refund for a CANCELLED booking via Paystack.

    Only admins may trigger refunds directly. Partial refunds are not
    exposed at this endpoint — they can be issued by extending this method.

    Raises
    ------
    403  caller is not an admin
    404  booking or transaction not found
    400  booking is not cancelled / transaction not successful
    409  a refund already exists for this transaction
    """
    if admin.role != UserRole.ADMIN:
        raise _forbidden("Only admins can issue refunds.")

    # Load booking + transaction
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(selectinload(Booking.transaction))
    )
    if booking is None:
        raise _not_found("Booking", booking_id)

    if booking.status != BookingStatus.CANCELLED:
        raise _bad_request(
            "Refunds can only be issued for cancelled bookings "
            f"(current status: '{booking.status}')."
        )

    txn = booking.transaction
    if txn is None or txn.status != TransactionStatus.SUCCESS:
        raise _bad_request(
            "A successful payment transaction is required before a refund can be issued."
        )

    if txn.paystack_transaction_id is None:
        raise _bad_request(
            "Paystack transaction ID is missing — cannot initiate refund."
        )

    # Guard duplicate refund
    existing_refund = await db.scalar(
        select(Refund).where(Refund.transaction_id == txn.id)
    )
    if existing_refund is not None:
        raise _bad_request("A refund has already been issued for this transaction.")

    # Call Paystack refund API
    try:
        refund_data = await paystack.initiate_refund(
            transaction_id=txn.paystack_transaction_id,
            amount=txn.amount,
        )
    except Exception as exc:
        logger.error(
            "Paystack refund failed booking_id=%s error=%s", booking_id, exc
        )
        raise _bad_request(
            "The refund could not be processed at this time. "
            "Please try again or contact Paystack support."
        ) from exc

    # Persist refund record
    refund = Refund(
        transaction_id=txn.id,
        amount=txn.amount,
        reason=reason,
        status=RefundStatus.PENDING,
        paystack_refund_id=str(refund_data.get("id", "")),
    )
    db.add(refund)

    # A queued request is not a completed refund. Only the signed processed
    # notification moves the original transaction to REFUNDED.
    await db.flush()

    logger.info(
        "Refund issued: booking_id=%s transaction_id=%s amount=%s",
        booking_id,
        txn.id,
        txn.amount,
    )

    return RefundResponse(
        id=refund.id,
        transaction_id=refund.transaction_id,
        amount=refund.amount,
        reason=refund.reason,
        status=refund.status,
        paystack_refund_id=refund.paystack_refund_id,
        created_at=refund.created_at,
    )
