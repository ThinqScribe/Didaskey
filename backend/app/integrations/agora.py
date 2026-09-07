"""
Agora video integration for classroom sessions.

Generates RTC tokens for video calls and manages channel lifecycle.
"""

from __future__ import annotations

import logging
import time
from typing import Literal

from agora_token_builder import RtcTokenBuilder

from app.core.config import settings

logger = logging.getLogger(__name__)

# Token expiration time in seconds (3 hours = 10800 seconds)
TOKEN_EXPIRATION_SECONDS = 10800

# Agora roles
PUBLISHER_ROLE = 1  # Can publish and subscribe
SUBSCRIBER_ROLE = 2  # Can only subscribe


def is_configured() -> bool:
    """Check if Agora is properly configured."""
    return bool(settings.AGORA_APP_ID and settings.AGORA_APP_CERTIFICATE)


def generate_rtc_token(
    channel_name: str,
    user_id: int,
    role: Literal["publisher", "subscriber"] = "publisher",
    expiration_seconds: int = TOKEN_EXPIRATION_SECONDS,
) -> str:
    """
    Generate an Agora RTC token for video calls.
    
    Args:
        channel_name: Unique channel identifier (e.g., "booking-123")
        user_id: Unique user identifier 
        role: "publisher" (can send video/audio) or "subscriber" (receive only)
        expiration_seconds: Token validity duration
        
    Returns:
        Agora RTC token string
        
    Raises:
        RuntimeError: If Agora credentials are not configured
    """
    if not is_configured():
        raise RuntimeError(
            "Agora credentials not configured. Set AGORA_APP_ID and "
            "AGORA_APP_CERTIFICATE in your environment variables."
        )
    
    # Convert role to Agora role constant
    agora_role = PUBLISHER_ROLE if role == "publisher" else SUBSCRIBER_ROLE
    
    # Calculate expiration timestamp
    current_timestamp = int(time.time())
    privilege_expired_ts = current_timestamp + expiration_seconds
    
    # Generate token
    token = RtcTokenBuilder.buildTokenWithUid(
        appId=settings.AGORA_APP_ID,
        appCertificate=settings.AGORA_APP_CERTIFICATE,
        channelName=channel_name,
        uid=user_id,
        role=agora_role,
        privilegeExpiredTs=privilege_expired_ts,
    )
    
    logger.info(
        "Generated Agora RTC token: channel=%s user_id=%s role=%s expires_in=%ds",
        channel_name, user_id, role, expiration_seconds
    )
    
    return token


def channel_name_for_booking(booking_id: int) -> str:
    """
    Generate a deterministic channel name for a booking.
    
    Args:
        booking_id: The booking ID
        
    Returns:
        Channel name string (e.g., "didaskey-booking-123")
    """
    return f"didaskey-booking-{booking_id}"


def validate_channel_name(channel_name: str) -> bool:
    """
    Validate that a channel name follows Agora's requirements.
    
    Channel names must be:
    - 1-64 characters long
    - Contain only letters, numbers, underscores, and hyphens
    
    Args:
        channel_name: Channel name to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not channel_name or len(channel_name) > 64:
        return False
    
    # Check for valid characters (letters, numbers, underscores, hyphens)
    import re
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', channel_name))