#!/usr/bin/env python3
"""
LiveKit connection diagnostic script.

Run this to verify that your LiveKit credentials are configured correctly
and that the server can generate valid access tokens.

Usage:
    python test_livekit.py
"""

import asyncio
import sys
from pathlib import Path

# Add the backend directory to the path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.integrations import video


def print_status(label: str, value: str | bool, is_good: bool = True) -> None:
    """Print a formatted status line."""
    icon = "✓" if is_good else "✗"
    color = "\033[92m" if is_good else "\033[91m"
    reset = "\033[0m"
    print(f"{color}{icon}{reset} {label}: {value}")


def main():
    print("\n" + "=" * 60)
    print("LiveKit Configuration Diagnostic")
    print("=" * 60 + "\n")

    # Check configuration
    print("1. Checking configuration...")
    print_status("LIVEKIT_URL", settings.LIVEKIT_URL or "(not set)", bool(settings.LIVEKIT_URL))
    print_status(
        "LIVEKIT_API_KEY", settings.LIVEKIT_API_KEY or "(not set)", bool(settings.LIVEKIT_API_KEY)
    )
    print_status(
        "LIVEKIT_API_SECRET",
        "***" + settings.LIVEKIT_API_SECRET[-4:] if settings.LIVEKIT_API_SECRET else "(not set)",
        bool(settings.LIVEKIT_API_SECRET),
    )
    print()

    is_configured = video.is_configured()
    print_status("Configuration complete", str(is_configured), is_configured)
    print()

    if not is_configured:
        print("\033[91mLiveKit is not configured. Please set the following in your .env file:\033[0m")
        print("  - LIVEKIT_URL=wss://your-project.livekit.cloud")
        print("  - LIVEKIT_API_KEY=your-api-key")
        print("  - LIVEKIT_API_SECRET=your-api-secret")
        print()
        return 1

    # Test token generation
    print("2. Testing token generation...")
    try:
        test_room = "test-room-123"
        test_identity = "user-test"
        test_name = "Test User"

        token = video.generate_access_token(
            room_name=test_room,
            identity=test_identity,
            display_name=test_name,
        )

        print_status("Token generated", "✓ Success", True)
        print(f"   Room: {test_room}")
        print(f"   Identity: {test_identity}")
        print(f"   Token (first 50 chars): {token[:50]}...")
        print()
    except Exception as exc:
        print_status("Token generation", f"✗ Failed: {exc}", False)
        print()
        return 1

    # Test admin token
    print("3. Testing admin token generation...")
    try:
        admin_token = video._generate_admin_token(room_name="test-admin-room")
        print_status("Admin token generated", "✓ Success", True)
        print(f"   Token (first 50 chars): {admin_token[:50]}...")
        print()
    except Exception as exc:
        print_status("Admin token generation", f"✗ Failed: {exc}", False)
        print()
        return 1

    # Test room name generation
    print("4. Testing room name generation...")
    booking_id = 12345
    room_name = video.room_name_for_booking(booking_id)
    print_status("Room name", room_name, True)
    print()

    print("=" * 60)
    print("\033[92m✓ All checks passed! LiveKit is configured correctly.\033[0m")
    print("=" * 60 + "\n")
    print("Next steps:")
    print("  1. Start the backend server: uvicorn app.main:app --reload")
    print("  2. Start the frontend: cd frontend && npx expo start")
    print("  3. Join a classroom from a confirmed booking")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
