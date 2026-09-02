#!/usr/bin/env python3
"""
LiveKit Connection Diagnostic Script

This script tests the LiveKit configuration and generates test tokens
to verify that video calls should work properly.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the backend directory to the path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from app.integrations.video import (
    is_configured,
    generate_access_token,
    room_name_for_booking,
    _http_base_url,
    _require_credentials
)
from app.core.config import settings

def test_configuration():
    """Test basic LiveKit configuration."""
    print("🔍 Testing LiveKit Configuration...")
    print(f"   LIVEKIT_URL: {settings.LIVEKIT_URL}")
    print(f"   LIVEKIT_API_KEY: {settings.LIVEKIT_API_KEY}")
    print(f"   LIVEKIT_API_SECRET: {'*' * len(settings.LIVEKIT_API_SECRET) if settings.LIVEKIT_API_SECRET else 'NOT SET'}")
    print(f"   HTTP Base URL: {_http_base_url()}")
    
    if is_configured():
        print("✅ LiveKit is properly configured")
        return True
    else:
        print("❌ LiveKit configuration is incomplete")
        return False

def test_token_generation():
    """Test JWT token generation."""
    print("\n🔑 Testing Token Generation...")
    
    try:
        _require_credentials()
        
        # Generate a test token
        room_name = room_name_for_booking(999)
        token = generate_access_token(
            room_name=room_name,
            identity="test-user-123",
            display_name="Test User",
            can_publish=True,
            can_subscribe=True,
            ttl_minutes=5
        )
        
        print(f"   Room Name: {room_name}")
        print(f"   Token Length: {len(token)} characters")
        print(f"   Token Prefix: {token[:50]}...")
        print("✅ Token generation successful")
        return token, room_name
        
    except Exception as e:
        print(f"❌ Token generation failed: {e}")
        return None, None

async def test_livekit_api():
    """Test LiveKit API connectivity."""
    print("\n🌐 Testing LiveKit API Connectivity...")
    
    try:
        import httpx
        
        base_url = _http_base_url()
        test_url = f"{base_url}/twirp/livekit.RoomService/ListRooms"
        
        # Generate admin token for API access
        from app.integrations.video import _generate_admin_token
        admin_token = _generate_admin_token(room_name="test-room", ttl_minutes=1)
        
        headers = {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                test_url, 
                json={}, 
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ LiveKit API accessible - Found {len(data.get('rooms', []))} rooms")
                return True
            else:
                print(f"❌ LiveKit API error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ LiveKit API test failed: {e}")
        return False

def test_classroom_endpoint():
    """Test the classroom HTML endpoint."""
    print("\n📄 Testing Classroom HTML Endpoint...")
    
    try:
        import httpx
        
        # Test the classroom HTML endpoint
        server_url = settings.FRONTEND_URL or "http://localhost:8000"
        classroom_url = f"{server_url}/classroom.html"
        
        async def check_endpoint():
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(classroom_url)
                return response.status_code, len(response.content)
        
        status_code, content_length = asyncio.run(check_endpoint())
        
        if status_code == 200:
            print(f"✅ Classroom HTML accessible - {content_length} bytes")
            return True
        else:
            print(f"❌ Classroom HTML error: {status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Classroom HTML test failed: {e}")
        return False

def generate_test_session():
    """Generate a complete test session configuration."""
    print("\n🧪 Generating Test Session Configuration...")
    
    token, room_name = test_token_generation()
    if not token:
        return
    
    test_config = {
        "livekit_url": settings.LIVEKIT_URL,
        "room_name": room_name,
        "token": token,
        "identity": "test-user-123",
        "display_name": "Test User",
        "is_tutor": False
    }
    
    print("\n📋 Test Session Config:")
    for key, value in test_config.items():
        if key == "token":
            print(f"   {key}: {value[:50]}...")
        else:
            print(f"   {key}: {value}")
    
    # Generate test URL
    server_url = settings.FRONTEND_URL or "http://localhost:8000"
    test_url = f"{server_url}/classroom.html?test=1"
    
    print(f"\n🔗 Test URL: {test_url}")
    print("\n📝 Manual Test Instructions:")
    print("1. Open the test URL in a web browser")
    print("2. Open browser developer tools (F12)")
    print("3. Paste this config in the console:")
    print(f"   window.__CLS = {test_config}")
    print("4. Look for connection logs starting with '[Classroom]'")
    print("5. Check for camera/microphone permission prompts")
    
    return test_config

async def main():
    """Run all diagnostic tests."""
    print("🚀 LiveKit Video Call Diagnostic Tool")
    print("=" * 50)
    
    # Test 1: Configuration
    if not test_configuration():
        print("\n❌ Configuration test failed. Please check your .env file.")
        return
    
    # Test 2: Token Generation
    token, room_name = test_token_generation()
    if not token:
        print("\n❌ Token generation failed. Cannot proceed.")
        return
    
    # Test 3: LiveKit API
    api_ok = await test_livekit_api()
    
    # Test 4: Classroom HTML
    html_ok = test_classroom_endpoint()
    
    # Test 5: Generate test session
    test_config = generate_test_session()
    
    print("\n" + "=" * 50)
    print("📊 Diagnostic Summary:")
    print(f"   Configuration: ✅")
    print(f"   Token Generation: ✅")
    print(f"   LiveKit API: {'✅' if api_ok else '❌'}")
    print(f"   Classroom HTML: {'✅' if html_ok else '❌'}")
    
    if api_ok and html_ok:
        print("\n🎉 All tests passed! The video system should work.")
        print("   If video calls still don't work, the issue is likely:")
        print("   - Network/firewall blocking WebSocket connections")
        print("   - Device-specific WebRTC compatibility issues")
        print("   - Browser permissions in the WebView")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")

if __name__ == "__main__":
    asyncio.run(main())