"""
LiveKit classroom integration boundary.

All LiveKit-specific details (token format, base URLs, Twirp RPC calls)
live here. Nothing outside this module should know how a LiveKit access
token is shaped or how to reach the LiveKit server API.

How this works
---------------
LiveKit access tokens are plain JWTs signed with HS256 using the
project's API secret — no network round-trip is required to "create" a
token. Rooms themselves are created implicitly by the LiveKit server the
moment the first participant connects with a valid token, so issuing a
token is sufficient to let someone join; there is no separate
"create room" call.

Security invariants
--------------------
1. ``LIVEKIT_API_SECRET`` is read from settings at call time — never
   cached in a module-level variable that could be accidentally logged.
2. Access tokens are scoped to exactly one room and one participant
   identity, with a bounded expiry (``CLASSROOM_TOKEN_TTL_MINUTES``).
3. ``end_room`` uses a separate, much shorter-lived admin-grant token
   that is never returned to a client.
4. ``end_room`` is best-effort: a LiveKit outage must never block a
   session from being marked ended in our own database.
"""

from __future__ import annotations

import logging
import time
import uuid

import httpx
from jose import jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
_ALGORITHM = "HS256"


# ── Configuration helpers ─────────────────────────────────────────────────────


def is_configured() -> bool:
    """True once LIVEKIT_URL / API key / API secret are all set."""
    return bool(
        settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET
    )


def room_name_for_booking(booking_id: int) -> str:
    """
    Deterministic LiveKit room name for a booking.

    Deterministic (rather than random) so re-joining or retrying never
    creates a second room for the same booking.
    """
    return f"didaskey-booking-{booking_id}"


def _http_base_url() -> str:
    """Derive the LiveKit HTTPS base URL from the configured WebSocket URL."""
    url = settings.LIVEKIT_URL
    if url.startswith("wss://"):
        return "https://" + url[len("wss://") :]
    if url.startswith("ws://"):
        return "http://" + url[len("ws://") :]
    return url


def _require_credentials() -> None:
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise RuntimeError(
            "LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not configured. "
            "Set them in your .env file before enabling video classrooms."
        )


# ── Access tokens ──────────────────────────────────────────────────────────────


def generate_access_token(
    *,
    room_name: str,
    identity: str,
    display_name: str,
    can_publish: bool = True,
    can_subscribe: bool = True,
    ttl_minutes: int | None = None,
) -> str:
    """
    Build a LiveKit participant access token (JWT, HS256).

    Parameters
    ----------
    room_name:
        The exact LiveKit room the token grants access to.
    identity:
        Stable, unique-per-user identity string (e.g. ``user-42``).
    display_name:
        Human-readable name shown to other participants.
    can_publish / can_subscribe:
        Whether the participant may send / receive audio+video.
    ttl_minutes:
        Overrides ``settings.CLASSROOM_TOKEN_TTL_MINUTES`` when set.

    Raises
    ------
    RuntimeError
        If LiveKit credentials are not configured.
    """
    _require_credentials()

    ttl = ttl_minutes if ttl_minutes is not None else settings.CLASSROOM_TOKEN_TTL_MINUTES
    now = int(time.time())
    payload = {
        "iss": settings.LIVEKIT_API_KEY,
        "sub": identity,
        "iat": now,
        "nbf": now - 5,
        "exp": now + ttl * 60,
        "jti": str(uuid.uuid4()),
        "name": display_name,
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": True,
        },
    }
    return jwt.encode(payload, settings.LIVEKIT_API_SECRET, algorithm=_ALGORITHM)


def _generate_admin_token(*, room_name: str, ttl_minutes: int = 5) -> str:
    """
    Build a short-lived server-to-server token with a ``roomAdmin`` grant.

    Used only internally for RoomService Twirp calls (e.g. ``end_room``);
    never returned to a client.
    """
    _require_credentials()

    now = int(time.time())
    payload = {
        "iss": settings.LIVEKIT_API_KEY,
        "sub": "didaskey-server",
        "iat": now,
        "nbf": now - 5,
        "exp": now + ttl_minutes * 60,
        "jti": str(uuid.uuid4()),
        "video": {"room": room_name, "roomAdmin": True, "roomCreate": True},
    }
    return jwt.encode(payload, settings.LIVEKIT_API_SECRET, algorithm=_ALGORITHM)


# ── Room administration ───────────────────────────────────────────────────────


async def end_room(room_name: str) -> None:
    """
    Force-disconnect every remaining participant in a room.

    Calls LiveKit's ``RoomService.DeleteRoom`` Twirp endpoint. This is a
    best-effort call: it logs and swallows any failure (including LiveKit
    not being configured at all) because ending a classroom in our own
    database must never be blocked by a transient LiveKit outage.
    """
    if not is_configured():
        logger.debug("LiveKit not configured — skipping end_room for room=%s", room_name)
        return

    try:
        token = _generate_admin_token(room_name=room_name)
    except RuntimeError:
        return

    url = f"{_http_base_url()}/twirp/livekit.RoomService/DeleteRoom"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                url,
                json={"room": room_name},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        if not response.is_success:
            logger.debug(
                "LiveKit DeleteRoom failed: room=%s status=%s body=%s",
                room_name,
                response.status_code,
                response.text[:300],
            )
    except httpx.HTTPError as exc:
        logger.warning("LiveKit DeleteRoom request error: room=%s error=%s", room_name, exc)
