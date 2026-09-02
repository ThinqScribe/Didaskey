# LiveKit & Whiteboard Connection Debug Guide

Based on my investigation of your Didaskey application, here are the potential issues causing socket/connection problems:

## Architecture Summary
- **Video**: LiveKit WebRTC (wss://didaskey-b320v6cw.livekit.cloud)
- **Whiteboard**: LiveKit Data Channels (NOT separate WebSockets)
- **Frontend**: React Native WebView loading classroom.html from backend
- **Sync**: All real-time features use the same WebRTC connection

## Potential Issues & Solutions

### 1. **LiveKit SDK Loading Failure**
**Symptom**: "Could not load the video engine" error
**Cause**: CDN blocking or network issues

**Check**: Open classroom.html directly in a web browser:
```
http://172.20.10.4:8000/classroom.html
```
**Look for**: Console error about loading livekit-client.umd.min.js

**Fix**: If CDN is blocked, download and serve LiveKit SDK locally:
1. Download: https://cdn.jsdelivr.net/npm/livekit-client@2.13.4/dist/livekit-client.umd.min.js
2. Place in `/backend/app/static/js/livekit-client.min.js`
3. Update classroom.html script tag to use local file

### 2. **WebView Permissions Issues**
**Symptoms**: Video/audio not working, silent failures

**Frontend Diagnostics** (check in Expo dev tools console):
- Look for `[WebView Console]` messages
- Look for `[WebView Error]` messages  
- Look for permission request logs

**Common Issues**:
- Camera/microphone permissions not granted at OS level
- WebView not properly forwarding permissions
- Hardware acceleration disabled

**Fixes**:
- Check `app.json` has proper camera/microphone permission strings
- Ensure `mediaCapturePermissionGrantType="grant"` is set
- Enable hardware acceleration: `androidLayerType="hardware"`

### 3. **Network Configuration**
**WebRTC Requirements**:
- UDP ports 443, 80 for STUN
- May need TURN servers for restrictive networks
- Firewall must allow WebRTC traffic

**Test LiveKit Connection** (in browser):
```javascript
// Open browser dev tools on http://172.20.10.4:8000/classroom.html
// Run this in console:
window.__CLS = {
  livekitUrl: 'wss://didaskey-b320v6cw.livekit.cloud',
  token: 'YOUR_TOKEN_HERE', // Get from /join API
  displayName: 'Test User',
  isTutor: false
};
```

### 4. **CORS & Origin Issues**
**Check**: WebView origin vs CORS configuration

Current CORS: `http://localhost:3000,http://localhost:8081,http://172.20.10.4:8000,https://polish-nebulizer-exceeding.ngrok-free.dev`

**Add** React Native WebView origins:
```env
CORS_ORIGINS=...,file://,about:blank,capacitor://localhost,ionic://localhost
```

### 5. **Token Expiry/Invalid**
**Check**: Token generation and validation
- Tokens expire after 180 minutes
- Clock synchronization between client/server
- Proper JWT signing with LIVEKIT_API_SECRET

### 6. **Booking Status Issues**
**Prerequisites** for joining:
- Booking must be CONFIRMED
- Session format must be ONLINE  
- Must be within join window (10 min before to 30 min after)
- User must be participant (student, tutor, or admin)

## Debug Steps

### Step 1: Verify Backend Configuration
```bash
cd backend
python3 -c "
import os
from dotenv import load_dotenv
load_dotenv()
print('LIVEKIT_URL:', os.getenv('LIVEKIT_URL'))
print('LIVEKIT_API_KEY:', os.getenv('LIVEKIT_API_KEY'))
print('LIVEKIT_API_SECRET:', '***' if os.getenv('LIVEKIT_API_SECRET') else 'NOT SET')
"
```

### Step 2: Test Classroom HTML Loading
1. Open http://172.20.10.4:8000/classroom.html in browser
2. Check developer console for errors
3. Verify LiveKit SDK loads: `window.LivekitClient` should exist

### Step 3: Test Token Generation
```bash
# In backend directory with proper Python environment
curl -X POST "http://172.20.10.4:8000/api/v1/classrooms/bookings/BOOKING_ID/join" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Step 4: Check WebView Console Logs
In your React Native app, look for:
- `[WebView Console]` messages in Expo dev tools
- Network failures 
- Permission errors
- LiveKit connection errors

### Step 5: Verify Real-time Sync
Once connected:
1. Test drawing on whiteboard
2. Check browser dev console for data channel messages
3. Verify `DataReceived` events are firing

## Most Likely Issues

1. **LiveKit CDN blocked** - Try loading classroom.html directly in browser
2. **WebView permissions** - Camera/microphone not properly granted
3. **Network/firewall** - WebRTC UDP traffic blocked
4. **Invalid booking state** - Check booking is CONFIRMED and ONLINE
5. **Token issues** - Verify JWT generation with correct secret

## Quick Fixes to Try

1. **Add WebView debugging** to classroom screen:
```tsx
onMessage={(event) => {
  console.log('[WebView Message]', event.nativeEvent.data);
}}
onError={(event) => {
  console.error('[WebView Error]', event.nativeEvent);
}}
```

2. **Test with browser first** before React Native:
   - Open classroom.html in Chrome/Safari  
   - Use dev tools to inject config and test connection

3. **Check mobile network** - Try different networks (WiFi vs cellular)

4. **Verify permissions** - Ensure camera/microphone are enabled in device settings

Let me know which of these debug steps reveals the issue!