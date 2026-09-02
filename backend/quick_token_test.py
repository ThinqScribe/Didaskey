#!/usr/bin/env python3
"""
Quick token generation for LiveKit testing
Run this to get a test token you can use in the LiveKit test page
"""

import os
import sys
import time
import uuid
from jose import jwt

# LiveKit configuration from .env
LIVEKIT_API_KEY = "APILyjorMiDXKmJ"
LIVEKIT_API_SECRET = "9HuAXmVIS3WTJzaWn9AFF6t0j0SGwPipJ3F0d5FwwfQ"
LIVEKIT_URL = "wss://didaskey-b320v6cw.livekit.cloud"

def generate_test_token():
    """Generate a test LiveKit token"""
    room_name = f"test-room-{int(time.time())}"
    identity = f"test-user-{int(time.time())}"
    display_name = "Test User"
    
    now = int(time.time())
    payload = {
        "iss": LIVEKIT_API_KEY,
        "sub": identity,
        "iat": now,
        "nbf": now - 5,
        "exp": now + 3600,  # 1 hour
        "jti": str(uuid.uuid4()),
        "name": display_name,
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }
    
    token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")
    
    print("=" * 60)
    print("🎥 LiveKit Test Token Generated")
    print("=" * 60)
    print(f"LiveKit URL: {LIVEKIT_URL}")
    print(f"Room Name: {room_name}")
    print(f"Identity: {identity}")
    print(f"Display Name: {display_name}")
    print(f"Token: {token}")
    print()
    print("🔗 Test URL: http://172.20.10.4:8000/livekit_test.html")
    print()
    print("📋 Instructions:")
    print("1. Open the test URL above in a web browser")
    print("2. Paste the token above into the 'Token' field")
    print("3. Click 'Test Connection'")
    print("4. Check the console output for errors")
    print("=" * 60)
    
    return token, room_name, identity

if __name__ == "__main__":
    try:
        generate_test_token()
    except ImportError as e:
        print("Missing dependency. Install with: pip install python-jose[cryptography]")
        print(f"Error: {e}")
    except Exception as e:
        print(f"Error generating token: {e}")