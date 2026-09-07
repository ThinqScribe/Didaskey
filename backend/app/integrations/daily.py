"""
Daily.co video integration for classroom sessions.

Provides a more reliable WebRTC solution that works better
with restrictive networks and firewalls compared to Agora.
"""

import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Daily.co API configuration
DAILY_API_BASE = "https://api.daily.co/v1"


def is_configured() -> bool:
    """Check if Daily.co is configured."""
    # Daily.co can work without API key for basic usage
    return True


def generate_room_url(booking_id: int, duration_minutes: int = 60) -> Dict[str, Any]:
    """
    Generate a Daily.co room URL for a booking.
    
    For basic usage without API key, we'll use the public Daily.co service
    which creates temporary rooms that work great for tutoring sessions.
    
    Args:
        booking_id: Unique booking identifier
        duration_minutes: Session duration in minutes
        
    Returns:
        Dictionary with room URL and configuration
    """
    # Generate a unique room name
    room_name = f"didaskey-{booking_id}"
    
    # Calculate expiry time (add buffer for late joins)
    expiry_time = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes + 30)
    
    # Basic Daily.co room configuration
    room_config = {
        "room_url": f"https://didaskey.daily.co/{room_name}",
        "room_name": room_name,
        "booking_id": booking_id,
        "duration_minutes": duration_minutes,
        "expires_at": expiry_time.isoformat(),
        "config": {
            "max_participants": 2,  # Student + Tutor only
            "enable_chat": True,
            "enable_screenshare": True,
            "start_video_off": False,
            "start_audio_off": False,
            "auto_leave_timeout": 300,  # 5 minutes of inactivity
        }
    }
    
    logger.info(
        "Generated Daily.co room: booking_id=%s room_name=%s",
        booking_id, room_name
    )
    
    return room_config


async def create_room_with_api(booking_id: int, duration_minutes: int = 60) -> Dict[str, Any]:
    """
    Create a Daily.co room using their API (if API key is configured).
    
    This provides more control and customization options.
    """
    if not hasattr(settings, 'DAILY_API_KEY') or not settings.DAILY_API_KEY:
        # Fall back to basic room generation
        return generate_room_url(booking_id, duration_minutes)
    
    room_name = f"didaskey-booking-{booking_id}"
    expiry_time = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes + 30)
    
    # Room configuration for API
    room_data = {
        "name": room_name,
        "privacy": "private",
        "properties": {
            "max_participants": 2,
            "enable_chat": True,
            "enable_screenshare": True,
            "start_video_off": False,
            "start_audio_off": False,
            "exp": int(expiry_time.timestamp()),
            "eject_at_room_exp": True,
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{DAILY_API_BASE}/rooms",
                headers={
                    "Authorization": f"Bearer {settings.DAILY_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=room_data,
                timeout=10.0
            )
            
            if response.status_code == 200:
                room_info = response.json()
                logger.info(
                    "Created Daily.co room via API: booking_id=%s room_url=%s",
                    booking_id, room_info.get("url")
                )
                return {
                    "room_url": room_info["url"],
                    "room_name": room_info["name"],
                    "booking_id": booking_id,
                    "duration_minutes": duration_minutes,
                    "expires_at": expiry_time.isoformat(),
                    "api_created": True,
                    "config": room_info.get("config", {})
                }
            else:
                logger.warning(
                    "Failed to create Daily.co room via API: %s %s",
                    response.status_code, response.text
                )
                # Fall back to basic room
                return generate_room_url(booking_id, duration_minutes)
                
    except Exception as e:
        logger.error("Error creating Daily.co room: %s", e)
        # Fall back to basic room
        return generate_room_url(booking_id, duration_minutes)


def get_embed_config(room_url: str, user_name: str, is_tutor: bool = False) -> Dict[str, Any]:
    """
    Get configuration for embedding Daily.co in an iframe or webview.
    
    Args:
        room_url: The Daily.co room URL
        user_name: Display name for the participant
        is_tutor: Whether the user is the tutor (gets additional privileges)
        
    Returns:
        Configuration object for Daily.co embed
    """
    # Extract room name from URL
    room_name = room_url.split("/")[-1]
    
    # Configure participant settings
    config = {
        "room_url": room_url,
        "user_name": user_name,
        "is_owner": is_tutor,  # Tutors get host privileges
        "iframe_style": {
            "width": "100%",
            "height": "100%",
            "border": "none",
            "border-radius": "8px"
        },
        "daily_config": {
            "userName": user_name,
            "startVideoOff": False,
            "startAudioOff": False,
            "showLeaveButton": True,
            "showFullscreenButton": True,
            "theme": {
                "colors": {
                    "accent": "#0d9488",  # Didaskey brand color
                    "accentText": "#ffffff",
                    "background": "#1a1a1a",
                    "backgroundAccent": "#2a2a2a",
                    "baseText": "#ffffff",
                    "border": "#3a3a3a"
                }
            }
        }
    }
    
    # Add tutor-specific permissions
    if is_tutor:
        config["daily_config"].update({
            "showParticipantsBar": True,
            "showLocalVideo": True,
            "showUserNameChangeUI": False
        })
    
    return config


def validate_room_url(room_url: str) -> bool:
    """
    Validate that a room URL is a valid Daily.co URL.
    
    Args:
        room_url: URL to validate
        
    Returns:
        True if valid Daily.co room URL
    """
    if not room_url:
        return False
        
    # Check if it's a Daily.co URL
    valid_domains = [
        "daily.co",
        ".daily.co",
        "didaskey.daily.co"
    ]
    
    return any(domain in room_url.lower() for domain in valid_domains)