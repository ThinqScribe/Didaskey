# Didaskey

A tutoring marketplace for pre-varsity students, tutors, and administrators. No parent experience or university platform is included. See [implementation status and launch runbook](IMPLEMENTATION.md) for delivered features and remaining work. This repository is not yet certified production-ready.

---

## Stack

| Layer | Technology |
|---|---|
| Mobile | React Native · Expo SDK 57 · Expo Router |
| Styling | NativeWind (Tailwind CSS) |
| Backend | FastAPI · Python 3.12 |
| Database | SQLite (dev) · PostgreSQL (prod) |
| ORM / Migrations | SQLAlchemy 2 async · Alembic |
| Auth | JWT (access + refresh tokens) |
| Payments | Paystack |
| Video | LiveKit Cloud (WebView → meet.livekit.io) |
| Email | Resend |
| Image uploads | ImageBB |

---

## Project structure

```
Didaskey/
├── backend/          FastAPI application
│   ├── app/
│   │   ├── api/      Route handlers
│   │   ├── core/     Config, security, dependencies
│   │   ├── db/       SQLAlchemy session + base
│   │   ├── integrations/   livekit.py, payments.py, imagebb.py …
│   │   ├── models/   SQLAlchemy ORM models
│   │   ├── schemas/  Pydantic request/response models
│   │   └── services/ Business logic
│   ├── alembic/      Database migrations
│   ├── tests/        Unit tests
│   ├── pyproject.toml
│   └── .env.example
└── frontend/         Expo React Native application
    ├── app/          Expo Router file-based routes
    │   ├── (auth)/   Sign in, sign up, verify email
    │   ├── (tabs)/   Student tab navigation
    │   ├── (tutor)/  Tutor portal tab navigation
    │   ├── booking/  Booking flow screens
    │   └── classroom/ Lobby + live classroom
    ├── components/   Shared UI components
    ├── constants/    Colors, layout, tab definitions
    ├── lib/          API clients, stores, hooks
    └── package.json
```

---

## Local setup

### Prerequisites

- Python 3.12+
- Node.js 22+
- A [LiveKit Cloud](https://cloud.livekit.io) project (free tier works)
- A [Paystack](https://paystack.com) account (test keys are fine)
- A [Resend](https://resend.com) account for transactional email

---

### Backend

```bash
cd backend

# Create and activate a virtualenv
python3 -m venv ../venv
source ../venv/bin/activate

# Install dependencies
pip install -e .

# Copy the example env and fill in your values
cp .env.example .env
# Edit .env — see the Environment variables section below

# Run the dev server
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.  
Swagger UI: `http://localhost:8000/docs`

To seed the database with sample tutors and subjects:

```bash
python seed.py
```

---

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy env and set your backend URL
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000

# Start the development server
npx expo start
```

Use a development client compatible with the installed Expo SDK. The classroom embeds LiveKit Meet in a native WebView or web iframe; permissions and reconnect behavior still require real-device testing.

For a full production build:

```bash
npx expo run:android   # requires Android Studio
npx expo run:ios       # requires Xcode (macOS only)
```

---

## Environment variables

### Backend — `backend/.env`

```env
APP_NAME=Didaskey API
ENVIRONMENT=development
DEBUG=true
API_V1_PREFIX=/api/v1

# Database (SQLite for dev, PostgreSQL for prod)
DATABASE_URL=sqlite+aiosqlite:///./didaskey.db

# Auth
SECRET_KEY=replace-with-a-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256

# CORS — add your Expo dev URL here
CORS_ORIGINS=http://localhost:8081,http://<your-ip>:8000

# Email — https://resend.com
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=http://localhost:8081

# Image uploads — https://imgbb.com
IMAGEBB_API_KEY=...

# Paystack — https://dashboard.paystack.com/#/settings/developers
PAYSTACK_SECRET_KEY=sk_test_...
# Webhook signatures use PAYSTACK_SECRET_KEY.

# LiveKit — https://cloud.livekit.io
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...

# Development flags
SKIP_TUTOR_AVAILABILITY_CHECK=false
```

### Frontend — `frontend/.env`

```env
EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
```

---

## Key features

**For students**
- Browse and search tutors by subject, rating, and price
- Book sessions (online or in-person), pay via Paystack
- Join live classrooms with video, resources, and chat
- Track upcoming and past sessions

**For tutors**
- Tutor portal with session management
- Join live classrooms as host
- End sessions and track attendance
- Earnings dashboard

**Live classroom**
- Video powered by LiveKit Cloud
- LiveKit Meet embedded in native WebView or web iframe
- Chat tab for in-session messaging
- Resources tab for sharing materials
- Automatic attendance tracking (join/leave timestamps)
- Role-aware navigation (tutors end sessions, students leave)

---

## Database migrations

Migrations are managed with Alembic:

```bash
cd backend

# Create a new migration
alembic revision --autogenerate -m "description"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

Run migrations in every environment: table creation does not upgrade existing schemas. Back up existing databases first, and do not blindly stamp a mismatched schema.

---

## Running tests

```bash
cd backend
source ../venv/bin/activate
pytest
```

---

## Deployment notes

- Set `ENVIRONMENT=production` and `DEBUG=false`
- Switch `DATABASE_URL` to a PostgreSQL connection string
- Run `alembic upgrade head` before starting the server
- Set all secrets to production values — never reuse test keys
- Configure a reverse proxy (nginx/Caddy) in front of uvicorn
- Set `CORS_ORIGINS` to your production frontend domain only
