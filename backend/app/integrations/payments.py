"""
Paystack integration boundary.

All outbound HTTP calls to Paystack's API live here.  Nothing outside
this module should know the Paystack base URL, header format, or
response shape.

Security invariants
-------------------
1. The secret key is read from settings at call time — never cached in a
   module-level variable that could be accidentally logged or serialised.
2. HMAC-SHA512 webhook verification is a standalone pure function with no
   side effects so it can be called before any DB work begins.
3. ``httpx.AsyncClient`` is used with a hard connect + read timeout so a
   slow Paystack response cannot stall a request indefinitely.
4. Raw Paystack error bodies are logged at DEBUG level only; they are
   never forwarded to clients verbatim (to avoid leaking internal details).
5. Amount is always converted to kobo (integer × 100) here, in one place,
   so callers deal exclusively in major currency units.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal

import httpx

from app.core.config import settings
from app.schemas.billing import PaystackInitResponse

logger = logging.getLogger(__name__)

_PAYSTACK_BASE = "https://api.paystack.co"
_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _auth_headers() -> dict[str, str]:
    """
    Build the Authorization header using the secret key from settings.

    Called at request time so the key is never stored in a closure or
    module-level attribute.
    """
    secret = settings.PAYSTACK_SECRET_KEY
    if not secret:
        raise RuntimeError(
            "PAYSTACK_SECRET_KEY is not configured. "
            "Set it in your .env file before accepting payments."
        )
    return {
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
    }


def _to_kobo(amount: Decimal) -> int:
    """
    Convert a major-unit Decimal (e.g. NGN 35.00) to kobo (integer 3500).

    Paystack expects all amounts in the smallest currency subunit.
    Using Decimal arithmetic avoids the floating-point rounding errors
    that would occur with ``int(amount * 100)``.
    """
    return int((amount * 100).to_integral_value())


# ── Webhook signature verification ───────────────────────────────────────────


def verify_webhook_signature(raw_body: bytes, paystack_signature: str) -> bool:
    """
    Verify a Paystack webhook request using HMAC-SHA512.

    Paystack signs the raw request body with the webhook secret and sends
    the hex digest in the ``x-paystack-signature`` header.

    Parameters
    ----------
    raw_body:
        The exact bytes received in the request body — must be read
        *before* JSON-parsing so the byte sequence is intact.
    paystack_signature:
        The value of the ``x-paystack-signature`` header.

    Returns
    -------
    bool
        ``True`` if the signature matches, ``False`` otherwise.

    Security note
    -------------
    Uses ``hmac.compare_digest`` for constant-time comparison to prevent
    timing-based side-channel attacks.
    """
    secret = settings.PAYSTACK_WEBHOOK_SECRET
    if not secret:
        logger.warning(
            "PAYSTACK_WEBHOOK_SECRET is not configured — "
            "all webhook requests will be rejected."
        )
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha512,
    ).hexdigest()

    return hmac.compare_digest(expected, paystack_signature)


# ── Paystack API calls ────────────────────────────────────────────────────────


async def initialize_transaction(
    *,
    email: str,
    amount: Decimal,
    currency: str,
    reference: str,
    metadata: dict | None = None,
) -> PaystackInitResponse:
    """
    Call Paystack ``POST /transaction/initialize``.

    Parameters
    ----------
    email:
        Customer email address — required by Paystack. We use the
        student's verified email from the User record.
    amount:
        Total charge in major currency units (e.g. NGN 35.00).
        Converted to kobo internally.
    currency:
        ISO 4217 currency code (e.g. ``NGN``).
    reference:
        Our UUID4 reference (Transaction.paystack_reference).
        Must be unique per transaction.
    metadata:
        Optional dict forwarded to Paystack as ``metadata``. Can carry
        ``booking_id`` for traceability in the Paystack dashboard.

    Returns
    -------
    PaystackInitResponse
        Contains ``authorization_url``, ``access_code``, and ``reference``.

    Raises
    ------
    httpx.HTTPStatusError
        If Paystack returns a non-2xx response.
    RuntimeError
        If the PAYSTACK_SECRET_KEY is not configured.
    """
    payload: dict = {
        "email": email,
        "amount": _to_kobo(amount),
        "currency": currency.upper(),
        "reference": reference,
    }
    if metadata:
        payload["metadata"] = metadata

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            f"{_PAYSTACK_BASE}/transaction/initialize",
            json=payload,
            headers=_auth_headers(),
        )

    if not response.is_success:
        logger.debug(
            "Paystack /transaction/initialize failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        response.raise_for_status()

    body = response.json()
    data = body.get("data", {})

    return PaystackInitResponse(
        authorization_url=data["authorization_url"],
        access_code=data["access_code"],
        reference=data["reference"],
    )


async def verify_transaction(reference: str) -> dict:
    """
    Call Paystack ``GET /transaction/verify/:reference``.

    Used as a secondary check after receiving a webhook to confirm the
    charge server-to-server, guarding against forged webhook bodies that
    passed the HMAC check due to a key leak.

    Returns
    -------
    dict
        The ``data`` object from the Paystack response.

    Raises
    ------
    httpx.HTTPStatusError
        If Paystack returns a non-2xx response.
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            f"{_PAYSTACK_BASE}/transaction/verify/{reference}",
            headers=_auth_headers(),
        )

    if not response.is_success:
        logger.debug(
            "Paystack /transaction/verify failed: ref=%s status=%s body=%s",
            reference,
            response.status_code,
            response.text[:500],
        )
        response.raise_for_status()

    return response.json().get("data", {})


async def initiate_refund(
    *,
    transaction_id: str,
    amount: Decimal | None = None,
) -> dict:
    """
    Call Paystack ``POST /refund`` to issue a full or partial refund.

    Parameters
    ----------
    transaction_id:
        Paystack's own transaction ID (``Transaction.paystack_transaction_id``).
    amount:
        Amount to refund in major currency units. If ``None``, Paystack
        will issue a full refund.

    Returns
    -------
    dict
        The ``data`` object from the Paystack refund response.

    Raises
    ------
    httpx.HTTPStatusError
        If Paystack returns a non-2xx response.
    """
    payload: dict = {"transaction": transaction_id}
    if amount is not None:
        payload["amount"] = _to_kobo(amount)

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            f"{_PAYSTACK_BASE}/refund",
            json=payload,
            headers=_auth_headers(),
        )

    if not response.is_success:
        logger.debug(
            "Paystack /refund failed: txn_id=%s status=%s body=%s",
            transaction_id,
            response.status_code,
            response.text[:500],
        )
        response.raise_for_status()

    return response.json().get("data", {})
