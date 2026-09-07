"""
LiveKit classroom integration.

All LiveKit-specific details live here. Nothing outside this module
needs to know how an access token is shaped or how to call the Room API.

Token generation
----------------
We use the official ``livekit-api`` package (``from livekit import api``)
rather than hand-rolling JWTs with python-jose. This guarantees we stay
compatible with every future LiveKit token-format change.

Rooms
-----
LiveKit creates a room automatically the first time a participant connects
with a valid token — no explicit "create room" API call is required.
``end_room`` calls ``DeleteRoom`` to force-disconnect everyone when the
tutor ends a session. It is best-effort: a LiveKit outage must never block
a session being marked ENDED in our own database.

Security invariants
-------------------
- LIVEKIT_API_SECRET is never cached at module level; it is read from
  settings at call time so it cannot be accidentally captured in a
  module-level repr/log.
- Access tokens are scoped to exactly one room + one identity and carry a
  bounded TTL (``CLASSROOM_TOKEN_TTL_MINUTES``).
- The admin token used by ``end_room`` is never returned to a client.
"""

from __future__ import annotations

import logging

import httpx
from livekit import api as lkapi

from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)


# ── Configuration helpers ─────────────────────────────────────────────────────


def is_configured() -> bool:
    """True once LIVEKIT_URL / API key / API secret are all set."""
    return bool(
        settings.LIVEKIT_URL
        and settings.LIVEKIT_API_KEY
        and settings.LIVEKIT_API_SECRET
    )


def _require_credentials() -> None:
    if not is_configured():
        raise RuntimeError(
            "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must all be "
            "set in your .env file before video classrooms can be used."
        )


def room_name_for_booking(booking_id: int) -> str:
    """
    Deterministic LiveKit room name for a booking.

    Deterministic so that re-joining or retrying never creates a second
    room for the same booking.
    """
    return f"tuterra-booking-{booking_id}"


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
    Build a short-lived LiveKit participant access token.

    Parameters
    ----------
    room_name:
        The exact LiveKit room the token grants access to.
    identity:
        Stable, unique-per-user string (e.g. ``user-42``).
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

    ttl = (ttl_minutes if ttl_minutes is not None else settings.CLASSROOM_TOKEN_TTL_MINUTES) * 60

    grant = lkapi.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=can_publish,
        can_subscribe=can_subscribe,
        can_publish_data=True,
    )

    from datetime import timedelta
    token = (
        lkapi.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(display_name)
        .with_grants(grant)
        .with_ttl(timedelta(seconds=ttl))
        .to_jwt()
    )

    logger.debug(
        "LiveKit token issued: room=%s identity=%s ttl_minutes=%s",
        room_name,
        identity,
        ttl_minutes or settings.CLASSROOM_TOKEN_TTL_MINUTES,
    )
    return token


# ── Room administration ───────────────────────────────────────────────────────


async def end_room(room_name: str) -> None:
    """
    Force-disconnect every remaining participant in a LiveKit room.

    Best-effort: logs and swallows any failure so that our database
    session-end logic is never blocked by a transient LiveKit outage.
    """
    if not is_configured():
        logger.debug("LiveKit not configured — skipping end_room for room=%s", room_name)
        return

    try:
        _require_credentials()
        lk = lkapi.LiveKitAPI(
            settings.LIVEKIT_URL,
            settings.LIVEKIT_API_KEY,
            settings.LIVEKIT_API_SECRET,
        )
        await lk.room.delete_room(lkapi.DeleteRoomRequest(room=room_name))
        await lk.aclose()
        logger.info("LiveKit room deleted: room=%s", room_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LiveKit end_room failed (best-effort): room=%s error=%s", room_name, exc)
