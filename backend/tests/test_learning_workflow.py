"""Exercise real persistence and object permissions without external providers."""
from datetime import datetime, timezone, timedelta, time
from decimal import Decimal

import httpx
import pytest
import pytest_asyncio
from jose import jwt
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.dependencies import get_current_user
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import Booking, TutorProfile, User
from app.models import TutorAvailability
from app.models.user import UserRole
from app.schemas.auth import SignupRequest


@pytest_asyncio.fixture
async def scenario():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        users = [User(email=f"user{i}@example.com", first_name=f"User{i}", last_name="Test", hashed_password="unused", role=role, is_verified=True) for i, role in enumerate([UserRole.STUDENT, UserRole.TUTOR, UserRole.STUDENT, UserRole.ADMIN])]
        db.add_all(users)
        await db.flush()
        tutor = TutorProfile(user_id=users[1].id, display_name="Tutor", rate_per_hour=Decimal("5000"), verification_status="verified")
        db.add(tutor)
        await db.flush()
        booking = Booking(student_id=users[0].id, tutor_id=tutor.id, amount=Decimal("5000"), status="confirmed", scheduled_at=datetime.now(timezone.utc), duration_minutes=60)
        db.add(booking)
        await db.commit()
        booking_id = booking.id
    current = {"user": users[0]}
    async def db_override():
        async with factory() as session:
            yield session
    async def user_override():
        return current["user"]
    app.dependency_overrides[get_db_session] = db_override
    app.dependency_overrides[get_current_user] = user_override
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client, current, users, booking_id
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_learning_lifecycle_and_privacy(scenario):
    client, current, users, booking_id = scenario
    base = f"/api/v1/learning/bookings/{booking_id}"
    assert (await client.post(base, json={"kind": "assignment", "title": "Practice", "body": "2 + 2?"})).status_code == 403
    current["user"] = users[1]
    response = await client.post(base, json={"kind": "assignment", "title": "Practice", "body": "2 + 2?"})
    assert response.status_code == 201, response.text
    assignment_id = response.json()["id"]
    current["user"] = users[2]
    assert (await client.get(base)).status_code == 404
    assert (await client.get("/api/v1/assignments")).json() == []
    assert (await client.put(f"/api/v1/learning/assignments/{assignment_id}/submission", json={"body": "4"})).status_code == 404
    current["user"] = users[0]
    assert (await client.put(f"/api/v1/learning/assignments/{assignment_id}/submission", json={"body": "4"})).status_code == 200
    assert (await client.put(f"/api/v1/learning/assignments/{assignment_id}/feedback", json={"feedback": "Self graded", "score": 100})).status_code == 403
    current["user"] = users[1]
    assert (await client.put(f"/api/v1/learning/assignments/{assignment_id}/feedback", json={"feedback": "Well done", "score": 100})).status_code == 200
    current["user"] = users[0]
    items = (await client.get(base)).json()
    assert items[0]["submission"]["feedback"] == "Well done"
    assert (await client.get("/api/v1/progress")).json()["reviewed"] == 1
    notices = (await client.get("/api/v1/notifications")).json()
    assert len(notices) == 2
    current["user"] = users[2]
    assert (await client.put(f"/api/v1/notifications/{notices[0]['id']}/read")).status_code == 404


@pytest.mark.asyncio
async def test_reschedule_preserves_booking_and_enforces_permissions(scenario):
    client, current, users, booking_id = scenario
    target = (datetime.now(timezone.utc) + timedelta(days=5)).replace(hour=11, minute=0, second=0, microsecond=0)
    async for db in app.dependency_overrides[get_db_session]():
        booking = await db.get(Booking, booking_id)
        booking.scheduled_at = target - timedelta(days=1)
        tutor_id = booking.tutor_id
        db.add(TutorAvailability(tutor_id=tutor_id, day_of_week=target.strftime("%A").lower(), start_time=time(9), end_time=time(17)))
        await db.commit()
    endpoint = f"/api/v1/bookings/{booking_id}/reschedule"
    payload = {"scheduled_at": target.isoformat()}
    current["user"] = users[2]
    assert (await client.patch(endpoint, json=payload)).status_code == 403
    current["user"] = users[1]
    assert (await client.patch(endpoint, json=payload)).status_code == 403
    current["user"] = users[0]
    assert (await client.patch(endpoint, json={"scheduled_at": "2030-01-01T12:00:00"})).status_code == 422
    response = await client.patch(endpoint, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["amount"] == "5000.00"
    assert response.json()["status"] == "confirmed"
    assert len((await client.get("/api/v1/notifications")).json()) == 1
    # Exact retry is harmless and doesn't duplicate notifications.
    assert (await client.patch(endpoint, json=payload)).status_code == 200
    assert len((await client.get("/api/v1/notifications")).json()) == 1
    assert (await client.patch(endpoint, json={"scheduled_at": (target - timedelta(hours=10)).isoformat()})).status_code == 409


@pytest.mark.asyncio
async def test_private_lesson_file_upload_and_download(scenario):
    client, current, users, booking_id = scenario
    endpoint = f"/api/v1/learning/bookings/{booking_id}/files"
    sample = b"%PDF-1.4\nTest teaching material\n%%EOF"
    files = {"file": ("../../lesson.pdf", sample, "application/pdf")}
    assert (await client.post(endpoint, files=files)).status_code == 403
    current["user"] = users[1]
    assert (await client.post(endpoint, files={"file": ("bad.pdf", b"<script>bad</script>", "application/pdf")})).status_code == 415
    created = await client.post(endpoint, files=files)
    assert created.status_code == 201, created.text
    assert (await client.post(endpoint, files=files)).json() == created.json()
    item_id = created.json()["item_id"]
    current["user"] = users[0]
    items = (await client.get(f"/api/v1/learning/bookings/{booking_id}")).json()
    assert items[0]["attachment"]["size"] == len(sample)
    assert "content" not in items[0]["attachment"]
    response = await client.get(f"/api/v1/learning/files/{item_id}")
    assert response.content == sample
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["cache-control"] == "no-store"
    current["user"] = users[2]
    assert (await client.get(f"/api/v1/learning/files/{item_id}")).status_code == 404


@pytest.mark.asyncio
async def test_shared_whiteboard_permissions_retry_and_clear(scenario):
    client, current, users, booking_id = scenario
    endpoint = f"/api/v1/learning/bookings/{booking_id}/whiteboard"
    payload = {"client_id": "stroke-1", "points": [[10, 10], [100, 150]], "color": "#183D36", "width": 4}
    response = await client.post(endpoint, json=payload)
    assert response.status_code == 201, response.text
    stroke_id = response.json()["id"]
    assert (await client.post(endpoint, json=payload)).json()["id"] == stroke_id
    assert (await client.post(endpoint, json={**payload, "points": [[0, 0], [200, 300]]})).status_code == 409
    assert (await client.post(endpoint, json={**payload, "points": [[-1, 0], [200, 300]]})).status_code == 422
    assert (await client.delete(endpoint)).status_code == 403
    current["user"] = users[2]
    assert (await client.get(endpoint)).status_code == 404
    current["user"] = users[1]
    assert len((await client.get(endpoint)).json()) == 1
    assert (await client.delete(f"{endpoint}/{stroke_id}")).status_code == 403
    assert (await client.delete(endpoint)).status_code == 200
    assert (await client.get(endpoint)).json() == []


@pytest.mark.asyncio
async def test_request_body_is_bounded_before_parsing(scenario):
    client, _, _, booking_id = scenario
    response = await client.post(f"/api/v1/learning/bookings/{booking_id}", content=b"x" * (1024 * 1024 + 1))
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_admin_cancellation_returns_updated_booking_and_notifications(scenario):
    client, current, users, booking_id = scenario
    current["user"] = users[3]
    response = await client.patch(f"/api/v1/bookings/{booking_id}/cancel", json={"reason": "Schedule unavailable"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    current["user"] = users[0]
    notices = (await client.get("/api/v1/notifications")).json()
    assert len(notices) == 1
    assert notices[0]["title"] == "Session cancelled"


@pytest.mark.asyncio
async def test_message_persistence_and_retry(scenario):
    client, current, users, booking_id = scenario
    base = f"/api/v1/learning/bookings/{booking_id}"
    payload = {"kind": "message", "body": "Ready for our lesson", "client_id": "retry-1"}
    first = await client.post(base, json=payload)
    again = await client.post(base, json=payload)
    assert first.json()["id"] == again.json()["id"]
    assert (await client.post(base, json={**payload, "body": "Changed"})).status_code == 409
    current["user"] = users[1]
    assert (await client.get(base)).json()[0]["body"] == payload["body"]
    assert (await client.get("/api/v1/messages")).json()[0]["last_message"] == payload["body"]
    message_id = first.json()["id"]
    reply = await client.post(f"/api/v1/messages/bookings/{booking_id}", json={"body": "I can reply from chat", "client_id": "chat-retry-1", "reply_to_item_id": message_id})
    assert reply.status_code == 201, reply.text
    assert reply.json()["reply_to"]["id"] == message_id
    assert (await client.post(f"/api/v1/messages/bookings/{booking_id}", json={"body": "I can reply from chat", "client_id": "chat-retry-1", "reply_to_item_id": message_id})).json()["id"] == reply.json()["id"]
    edited = await client.put(f"/api/v1/messages/bookings/{booking_id}/messages/{reply.json()['id']}", json={"body": "Edited reply"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "Edited reply"
    assert edited.json()["extra"]["edited_at"]
    current["user"] = users[0]
    assert (await client.put(f"/api/v1/messages/bookings/{booking_id}/messages/{reply.json()['id']}", json={"body": "Nope"})).status_code == 403
    current["user"] = users[1]
    chat_file = await client.post(f"/api/v1/messages/bookings/{booking_id}/attachments", files={"file": ("guide.pdf", b"%PDF-1.4\nChat handout\n%%EOF", "application/pdf")})
    assert chat_file.status_code == 201, chat_file.text
    assert chat_file.json()["attachment"]["media_type"] == "application/pdf"
    assert chat_file.json()["body"] == "Shared guide.pdf"
    docx = b"PK\x03\x04Fake office document bytes"
    captioned = await client.post(
        f"/api/v1/messages/bookings/{booking_id}/attachments",
        data={"body": "Please review this worksheet", "client_id": "chat-file-1", "reply_to_item_id": message_id},
        files={"file": ("worksheet.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert captioned.status_code == 201, captioned.text
    assert captioned.json()["body"] == "Please review this worksheet"
    assert captioned.json()["reply_to"]["id"] == message_id
    assert captioned.json()["attachment"]["media_type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    retried = await client.post(
        f"/api/v1/messages/bookings/{booking_id}/attachments",
        data={"body": "Please review this worksheet", "client_id": "chat-file-1", "reply_to_item_id": message_id},
        files={"file": ("worksheet.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert retried.json()["id"] == captioned.json()["id"]
    deleted = await client.delete(f"/api/v1/messages/bookings/{booking_id}/messages/{captioned.json()['id']}")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["body"] == "This message was deleted"
    assert deleted.json()["extra"]["deleted_at"]
    assert (await client.put(f"/api/v1/messages/bookings/{booking_id}/messages/{captioned.json()['id']}", json={"body": "No edits"})).status_code == 409
    assert (await client.put(f"/api/v1/messages/bookings/{booking_id}/delivered", json={"last_item_id": message_id})).status_code == 200
    current["user"] = users[0]
    delivered_items = await client.get(base)
    assert delivered_items.json()[0]["delivered_by_recipient"]
    assert not delivered_items.json()[0]["read_by_recipient"]
    current["user"] = users[1]
    assert (await client.put(f"{base}/read", json={"last_item_id": message_id})).status_code == 200
    current["user"] = users[0]
    assert (await client.get(base)).json()[0]["read_by_recipient"]
    current["user"] = users[2]
    assert (await client.put(f"{base}/read", json={"last_item_id": message_id})).status_code == 404
    current["user"] = users[3]
    assert (await client.put(f"{base}/read", json={"last_item_id": message_id})).status_code == 403
    current["user"] = users[1]
    assert (await client.patch("/api/v1/tutors/me", json={"verification_status": "verified"})).status_code == 403


@pytest.mark.asyncio
async def test_classroom_join_uses_one_livekit_room_for_student_and_tutor(scenario, monkeypatch):
    from app.core.config import settings

    client, current, users, booking_id = scenario
    monkeypatch.setattr(settings, "LIVEKIT_URL", "wss://didaskey-test.livekit.cloud")
    monkeypatch.setattr(settings, "LIVEKIT_API_KEY", "test-livekit-key")
    monkeypatch.setattr(settings, "LIVEKIT_API_SECRET", "x" * 40)

    endpoint = f"/api/v1/classrooms/bookings/{booking_id}/join"
    current["user"] = users[0]
    student_response = await client.post(endpoint)
    assert student_response.status_code == 200, student_response.text

    current["user"] = users[1]
    tutor_response = await client.post(endpoint)
    assert tutor_response.status_code == 200, tutor_response.text

    student = student_response.json()
    tutor = tutor_response.json()
    assert student["livekit_url"] == tutor["livekit_url"] == "wss://didaskey-test.livekit.cloud"
    assert student["room_name"] == tutor["room_name"] == f"tuterra-booking-{booking_id}"
    assert student["user_id"] != tutor["user_id"]

    student_claims = jwt.decode(student["token"], "x" * 40, algorithms=["HS256"], audience="test-livekit-key")
    tutor_claims = jwt.decode(tutor["token"], "x" * 40, algorithms=["HS256"], audience="test-livekit-key")
    assert student_claims["sub"] == f"user-{users[0].id}"
    assert tutor_claims["sub"] == f"user-{users[1].id}"
    assert student_claims["video"]["room"] == tutor_claims["video"]["room"] == f"tuterra-booking-{booking_id}"
    assert student_claims["video"]["roomJoin"] is True
    assert tutor_claims["video"]["roomJoin"] is True


@pytest.mark.parametrize("changes", [{"role": "parent"}, {"education_level": "undergraduate"}, {"education_level": "postgraduate"}, {"role": "admin"}])
def test_prevarsity_signup_scope(changes):
    payload = dict(email="learner@example.com", phone_number="+2348000000000", password="testpassword", first_name="Ada", last_name="Test", role="student", education_level="primary_school")
    with pytest.raises(ValidationError):
        SignupRequest(**{**payload, **changes})


@pytest.mark.asyncio
async def test_signout_revokes_tokens(scenario):
    from app.core.security import create_access_token, create_refresh_token
    client, current, users, _ = scenario
    del app.dependency_overrides[get_current_user]
    claims = {"sub": str(users[0].id), "version": "0"}
    headers = {"Authorization": f"Bearer {create_access_token(claims)}"}
    refresh = create_refresh_token(claims)
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200
    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})).status_code == 401


@pytest.mark.asyncio
async def test_password_reset_is_single_use(scenario):
    from app.core.security import create_password_reset_token
    client, current, users, _ = scenario
    token = create_password_reset_token(users[0].id)
    payload = {"token": token, "new_password": "NewPassword123"}
    assert (await client.post("/api/v1/auth/reset-password", json=payload)).status_code == 200
    assert (await client.post("/api/v1/auth/reset-password", json=payload)).status_code == 400


@pytest.mark.asyncio
async def test_admin_endpoints_reject_students(scenario):
    client, current, users, _ = scenario
    assert (await client.get("/api/v1/admin/users")).status_code == 403
    assert (await client.get("/api/v1/admin/bookings")).status_code == 403
    current["user"] = users[3]
    assert (await client.get("/api/v1/admin/users")).status_code == 200
    assert len((await client.get("/api/v1/admin/bookings")).json()) == 1
    assert (await client.patch(f"/api/v1/admin/users/{users[3].id}/status", json={"is_active": False})).status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_review_before_completion(scenario):
    client, current, users, booking_id = scenario
    booking = (await client.get(f"/api/v1/bookings/{booking_id}")).json()
    payload = {"tutor_id": booking["tutor_id"], "rating": 5, "comment": "Good lesson"}
    assert (await client.post(f"/api/v1/tutors/{booking['tutor_id']}/reviews", json=payload)).status_code == 403
