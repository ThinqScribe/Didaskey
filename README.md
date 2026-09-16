# Didaskey

Didaskey is a mobile tutoring marketplace for pre-varsity, undergraduate, and postgraduate learners. Students can find tutors, book lessons, pay, chat in real time, share files, and join LiveKit-powered classrooms. Tutors can manage students, sessions, earnings, lesson materials, and live classes.

The current app targets Android/iOS through Expo. The backend is FastAPI, deployed through Render, with PostgreSQL, Cloudflare R2 file storage, Paystack payments, LiveKit classroom support, and Resend email support.

## Current URLs

| Service | URL |
|---|---|
| Production/staging API | `https://didaskey-api.onrender.com` |
| API health check | `https://didaskey-api.onrender.com/health` |
| API readiness check | `https://didaskey-api.onrender.com/ready` |
| API docs | `https://didaskey-api.onrender.com/docs` |
| Latest Android EAS build | `https://expo.dev/accounts/thinqscribe/projects/didaskey/builds/851cd0e3-92cb-4f1f-be7a-9b0278e7dff3` |

## Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native, Expo SDK 57, Expo Router |
| Styling | NativeWind, shared design constants |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL in production, SQLite for local development |
| ORM/migrations | SQLAlchemy async, Alembic |
| Auth | JWT access and refresh tokens |
| Real-time messaging | WebSockets + REST fallbacks |
| Push/in-app notifications | Expo notifications |
| File storage | Cloudflare R2 |
| Payments | Paystack |
| Classroom/video | LiveKit |
| Email | Resend |
| Hosting | Render backend, EAS mobile builds |

## Repository Structure

```text
Didaskey/
├── backend/
│   ├── app/
│   │   ├── api/             FastAPI route registration
│   │   ├── api/v1/endpoints Route handlers
│   │   ├── core/            Config, auth, request limits, email helpers
│   │   ├── db/              Engine/session setup and migration helpers
│   │   ├── integrations/    Paystack, LiveKit, notifications, R2/ImageBB
│   │   ├── models/          SQLAlchemy models
│   │   ├── schemas/         Pydantic request/response schemas
│   │   ├── services/        Business logic
│   │   └── workers/         Background task helpers
│   ├── alembic/             Database migrations
│   ├── scripts/start.sh     Render/Docker startup script
│   ├── tests/               Backend tests
│   ├── Dockerfile
│   ├── RENDER.md
│   └── pyproject.toml
├── frontend/
│   ├── app/                 Expo Router routes
│   │   ├── (auth)/          Sign in, sign up, verification, reset password
│   │   ├── (tabs)/          Student app tabs
│   │   ├── (tutor)/         Tutor app tabs
│   │   ├── booking/         Booking flow
│   │   ├── classroom/       Lobby and classroom screens
│   │   └── learning/        Learning workspace
│   ├── components/          Shared UI and feature components
│   ├── constants/           Colors, layout, tab definitions
│   ├── lib/                 API clients, hooks, stores, device helpers
│   ├── assets/              Images, icons, fonts
│   ├── eas.json             EAS build profiles
│   └── package.json
├── render.yaml              Render Blueprint for backend + database
└── compose.yaml             Local Docker Compose reference
```

## Features

### Student App

- Polished onboarding and authentication screens
- Tutor discovery and tutor detail pages
- Booking flow with availability and payment
- Real-time messaging with unread indicators
- Message replies, edits, deletes, delivery/read states
- Multi-file chat attachments through Cloudflare R2
- Learning workspace and lesson files
- Live classroom lobby and classroom entry
- Profile photo upload and profile editing support
- In-app and device notification support

### Tutor App

- Tutor dashboard
- Student list
- Session management
- Earnings display with Didaskey commission logic
- Messaging with students
- Live classroom entry
- File/lesson material sharing

### Backend

- JWT authentication
- User, tutor, marketplace, booking, billing, classroom, learning, notification, and messaging APIs
- Alembic migrations
- Paystack transaction initialization, verification, and webhook integrity checks
- LiveKit token generation
- R2-backed private file storage
- Push device registration
- Health and readiness endpoints

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 22+
- npm
- Expo/EAS CLI access
- Android Studio or a physical Android device for local testing
- Optional but recommended: LiveKit, Paystack, Cloudflare R2, and Resend accounts

### Backend Setup

```bash
cd backend
source ../didaskeyenv/bin/activate
pip install -e .
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Local backend:

```text
http://localhost:8000
```

Local docs:

```text
http://localhost:8000/docs
```

Seed sample data:

```bash
cd backend
source ../didaskeyenv/bin/activate
python seed.py
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npx expo start
```

For local backend testing, set:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_public_key
```

For hosted backend testing, set:

```env
EXPO_PUBLIC_API_URL=https://didaskey-api.onrender.com
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_public_key
```

Use a development build for push notification testing. Expo Go does not fully support Android remote push notifications in newer Expo SDK versions.

## Environment Variables

### Backend: `backend/.env`

```env
APP_NAME=Didaskey API
ENVIRONMENT=development
DEBUG=true
API_V1_PREFIX=/api/v1

DATABASE_URL=sqlite+aiosqlite:///./didaskey.db
REDIS_URL=redis://localhost:6379/0

SECRET_KEY=replace-with-a-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_DAYS=30
EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS=24
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=120
ALGORITHM=HS256

PUBLIC_API_URL=http://localhost:8000
FRONTEND_URL=http://localhost:8081
CORS_ORIGINS=http://localhost:8081,http://localhost:3000

RESEND_API_KEY=
RESEND_FROM_EMAIL=

PAYSTACK_SECRET_KEY=sk_test_your_secret_key

LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

FILE_STORAGE_DRIVER=r2
R2_BUCKET=didaskey-chat-files
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_REGION=auto
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

IMAGEBB_API_KEY=

SKIP_TUTOR_AVAILABILITY_CHECK=false
CLASSROOM_JOIN_BEFORE_MINUTES=10
CLASSROOM_JOIN_GRACE_MINUTES=30
CLASSROOM_TOKEN_TTL_MINUTES=180
```

Production requirements enforced by the backend:

- `ENVIRONMENT=production`
- `DEBUG=false`
- `SECRET_KEY` must be at least 32 characters
- `DATABASE_URL` must use PostgreSQL
- `FRONTEND_URL` must use HTTPS
- `CORS_ORIGINS` must be explicit and must not be `*`

Render may provide a `postgresql://...` URL. The backend normalizes it to SQLAlchemy's async driver format automatically.

### Frontend: `frontend/.env`

```env
EXPO_PUBLIC_API_URL=https://didaskey-api.onrender.com
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_public_key
```

`EXPO_PUBLIC_*` values are bundled into the mobile app. Do not put backend secrets in frontend env vars.

## Render Deployment

The backend is configured for Render through `render.yaml`.

Deploy flow:

1. Commit and push the repository to GitHub.
2. In Render, create a new Blueprint.
3. Select this repository.
4. Leave Blueprint Path blank or set it to `render.yaml`.
5. Render creates:
   - `didaskey-api`
   - `didaskey-db`
6. Fill the secret env vars requested by Render.

Required Render secrets:

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
PAYSTACK_SECRET_KEY
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
R2_BUCKET
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
IMAGEBB_API_KEY
```

The Render start command uses:

```bash
./scripts/start.sh
```

That script runs:

```bash
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
```

Render provides `$PORT`; locally the fallback is `8000`.

## EAS Android Preview Builds

The current preview profile in `frontend/eas.json` builds an installable Android APK and points to:

```text
https://didaskey-api.onrender.com
```

Start a preview build:

```bash
cd frontend
npx eas build --profile preview --platform android
```

Check latest Android build status:

```bash
cd frontend
npx eas build:list --platform android --limit 1
```

When a build finishes, the EAS build page shows the APK install/download link.

## Database Migrations

```bash
cd backend
source ../didaskeyenv/bin/activate

# Apply all migrations
alembic upgrade head

# Create a migration
alembic revision --autogenerate -m "description"

# Roll back one migration
alembic downgrade -1
```

Do not rely on `create_all` for production schema updates. Always run Alembic migrations.

## Testing

Backend tests:

```bash
cd backend
source ../didaskeyenv/bin/activate
python -m pytest
```

Frontend typecheck:

```bash
cd frontend
npm run typecheck
```

Recent backend verification:

```text
34 passed
```

## Operational Notes

- Render free services may sleep after inactivity. First requests can be slow.
- Push notifications require a development or production build, not Expo Go.
- File upload/download depends on valid R2 credentials.
- LiveKit classrooms require `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- Paystack payments require matching frontend public key and backend secret key.
- Never commit `.env` files or private keys.
- Rebuild the mobile app after changing `EXPO_PUBLIC_API_URL` or other frontend env vars.

## Useful Commands

```bash
# Backend dev
cd backend
source ../didaskeyenv/bin/activate
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Backend tests
cd backend
source ../didaskeyenv/bin/activate
python -m pytest

# Frontend dev
cd frontend
npm install
npx expo start

# Frontend typecheck
cd frontend
npm run typecheck

# Android preview build
cd frontend
npx eas build --profile preview --platform android
```

## Production Checklist

- Confirm Render API `/ready` returns `{"status":"ready"}`
- Confirm database migrations ran successfully
- Confirm Paystack keys are correct for test or live mode
- Confirm R2 bucket permissions and credentials
- Confirm LiveKit project credentials
- Confirm Resend sender domain and `RESEND_FROM_EMAIL`
- Confirm frontend points to the hosted API
- Build and install a fresh EAS APK
- Test signup, login, booking, payment, chat, attachments, notifications, and classroom join from two devices
