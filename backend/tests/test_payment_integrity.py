import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from decimal import Decimal
from app.core.config import settings
from app.integrations.payments import _auth_headers, _to_kobo, verify_webhook_signature


def test_paystack_signature_uses_provider_secret(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "test-paystack-secret")
    monkeypatch.setattr(settings, "PAYSTACK_WEBHOOK_SECRET", "obsolete-configuration")
    body = b'{"event":"charge.success"}'
    signature = hmac.new(b"test-paystack-secret", body, hashlib.sha512).hexdigest()
    assert verify_webhook_signature(body, signature)
    assert not verify_webhook_signature(body + b" ", signature)
    assert not verify_webhook_signature(body, "invalid")


def test_paystack_secret_is_stripped_for_headers_and_webhooks(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "sk_test_example\n")
    headers = _auth_headers()
    assert headers["Authorization"] == "Bearer sk_test_example"

    body = b'{"event":"charge.success"}'
    signature = hmac.new(b"sk_test_example", body, hashlib.sha512).hexdigest()
    assert verify_webhook_signature(body, signature)


def test_currency_conversion_preserves_kobo():
    assert _to_kobo(Decimal("5123.45")) == 512345


@pytest.mark.asyncio
@pytest.mark.parametrize("event,amount,expected", [
    ("refund.processed", "500000", "processed"),
    ("refund.failed", "500000", "failed"),
    ("refund.processed", "100", "pending"),
])
async def test_signed_refund_reconciliation(monkeypatch, event, amount, expected):
    from app.services.payment_service import handle_webhook
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "refund-test-key")
    txn = SimpleNamespace(id=1, currency="NGN", status="success")
    refund = SimpleNamespace(amount=Decimal("5000"), status="pending")
    db = SimpleNamespace(scalar=AsyncMock(side_effect=[txn, refund]), flush=AsyncMock())
    body = json.dumps({"event": event, "data": {"transaction_reference": "test-ref", "amount": amount, "currency": "NGN"}}).encode()
    signature = hmac.new(b"refund-test-key", body, hashlib.sha512).hexdigest()
    await handle_webhook(body, signature, db)
    assert refund.status == expected
    assert txn.status == ("refunded" if expected == "processed" else "success")
    if expected == "processed":
        db.scalar.side_effect = [txn, refund]
        # A late failure must not undo a confirmed refund.
        from app.services.payment_service import _process_refund
        await _process_refund("refund.failed", {"transaction_reference": "test-ref", "amount": amount, "currency": "NGN"}, db)
        assert txn.status == "refunded"
