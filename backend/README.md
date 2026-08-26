# Didaskey Backend

FastAPI backend for the Didaskey learning marketplace.

## Run locally

```bash
cd backend
source ../didaskeyenv/bin/activate
pip install -e .
cp .env.example .env
uvicorn app.main:app --reload
```

API documentation is available at `http://localhost:8000/docs`.

## Structure

- `app/api`: HTTP routes and dependency wiring
- `app/core`: configuration, security, and shared infrastructure
- `app/db`: database engine, sessions, and model base
- `app/models`: SQLAlchemy persistence models
- `app/schemas`: request and response contracts
- `app/repositories`: database access
- `app/services`: application and integration logic
- `app/workers`: background jobs
- `tests`: unit and API tests
- `alembic`: database migrations
