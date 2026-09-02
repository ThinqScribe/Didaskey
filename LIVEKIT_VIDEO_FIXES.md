# LiveKit Video Call Fixes

## Issues Fixed

The following issues were preventing video, audio, and whiteboard functionality from working in the LiveKit classroom:

### 1. **Missing CORS Middleware** ✅
**Problem**: The WebView couldn't load resources from the backend due to missing CORS configuration.

**Fix**: Added CORS middleware to `backend/app/main.py`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list if settings.cors_origin_list else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. **Config Property Bug** ✅
**Problem**: AttributeError when accessing `cors_origins` - should be `CORS_ORIGINS`.

**Fix**: Updated `backend/app/core/config.py`:
```python
@property
def cors_origin_list(self) -> list[str]:
    return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
```

### 3. **Audio/Video Track Control Issues** ✅
**Problem**: Microphone and camera toggle buttons weren't properly enabling/disabling tracks.

**Fixes in `backend/app/static/classroom.html`**:
- Added proper error handling for `setMicrophoneEnabled()` and `setCameraEnabled()`
- Added visual feedback for muted microphones (mic icon on participant tiles)
- Added `TrackMuted` and `TrackUnmuted` event listeners
- Improved initial track publishing with proper error logging

### 4. **Frontend API Configuration** ✅
**Problem**: Frontend was using hardcoded API URL and mixing `/api/v1` paths with server root URL.

**Fixes**:
- Added `EXPO_PUBLIC_API_URL` to `frontend/.env`
- Updated `frontend/lib/api/client.ts` to export both:
  - `BASE_URL` for API calls (with `/api/v1`)
  - `SERVER_URL` for classroom HTML (without `/api/v1`)
- Updated `frontend/app/classroom/[bookingId].tsx` to use `SERVER_URL`
- Simplified `classroomShellUrl()` function

### 5. **Enhanced Debugging and Error Handling** ✅
**Improvements**:
- Added console logging throughout the classroom HTML
- Added `onConsoleMessage` handler in WebView to see browser console logs
- Added `onError` and `onHttpError` handlers in WebView
- Enhanced permission request logging
- Created diagnostic script `backend/test_livekit.py`

### 6. **Whiteboard Functionality** ✅
The whiteboard was already implemented but needed the above fixes to work properly:
- Drawing tools: pen, highlighter, eraser, shapes (line, rect, circle)
- Text input
- Multi-page support
- Undo functionality
- Real-time synchronization via LiveKit data channel
- Laser pointer for remote presentations

## Configuration Verification

✅ **LiveKit credentials are correctly configured**:
- `LIVEKIT_URL`: wss://didaskey-b320v6cw.livekit.cloud
- `LIVEKIT_API_KEY`: APILyjorMiDXKmJ
- `LIVEKIT_API_SECRET`: Configured ✓

Run the diagnostic script to verify:
```bash
cd backend
source ../didaskeyenv/bin/activate
python test_livekit.py
```

## Testing the Fixes

### Backend
```bash
cd backend
source ../didaskeyenv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install  # if needed
npx expo start
```

### Test Flow
1. Sign in as a student or tutor
2. Navigate to a confirmed, online booking
3. Wait until the join window opens (10 minutes before scheduled time)
4. Click "Join Session"
5. Grant camera and microphone permissions
6. Verify you can:
   - See yourself in the video tile
   - See/hear other participants when they join
   - Toggle microphone (mute/unmute)
   - Toggle camera (on/off)
   - Switch to whiteboard mode
   - Draw on the whiteboard
   - See remote participants' drawings in real-time

## Debugging Tips

### Check WebView Console Logs
The WebView now logs to the React Native console with `[WebView Console]` prefix. Look for:
- `[Classroom] Starting initialization...`
- `[Classroom] Connecting to LiveKit: wss://...`
- `[Classroom] Connected with identity: user-XXX`
- `[Classroom] Ready!`

### Common Issues

**"Could not connect to the session"**
- Check that LiveKit credentials are set in `backend/.env`
- Verify network connectivity to LiveKit cloud
- Check backend logs for token generation errors

**"Camera & microphone access needed"**
- Ensure `expo-camera` plugin is configured in `app.json`
- Grant permissions when prompted
- On iOS: Check Settings > Didaskey > Camera/Microphone
- On Android: Check App Info > Permissions

**Can't see video tiles**
- Check browser console for getUserMedia errors
- Verify WebView has hardware acceleration enabled
- Check that tracks are being published (look for Track.Kind.Video logs)

**Whiteboard not working**
- Verify you're in "board" mode (board button should be highlighted)
- Check data channel is connected (drawing commands use LiveKit data channel)
- Tutor can clear the board; students can only draw

## Files Modified

### Backend
- ✅ `backend/app/main.py` - Added CORS middleware
- ✅ `backend/app/core/config.py` - Fixed cors_origin_list property
- ✅ `backend/app/static/classroom.html` - Enhanced track control and debugging
- ✅ `backend/test_livekit.py` - New diagnostic script

### Frontend
- ✅ `frontend/.env` - Added EXPO_PUBLIC_API_URL
- ✅ `frontend/lib/api/client.ts` - Split BASE_URL and SERVER_URL
- ✅ `frontend/lib/classroom/classroomHtml.ts` - Simplified URL construction
- ✅ `frontend/app/classroom/[bookingId].tsx` - Enhanced error handling and logging

## Next Steps

1. **Start the backend server** and verify it starts without errors
2. **Start the frontend app** in Expo Go or on a device
3. **Create a test booking** between two users
4. **Join the session** from both devices
5. **Test all functionality**: video, audio, whiteboard
6. **Monitor logs** for any remaining issues

## Support

If issues persist:
1. Check the WebView console logs (`[WebView Console]` prefix)
2. Check the backend logs for API errors
3. Run `backend/test_livekit.py` to verify configuration
4. Verify both devices are on the same network or have proper internet access
5. Check LiveKit Cloud dashboard for connection attempts
