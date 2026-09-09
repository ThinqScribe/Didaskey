from fastapi import APIRouter

from app.api.v1.endpoints import (
	admin,
	assignments,
	auth,
	bookings,
	classrooms,
	health,
	messages,
	notifications,
	payments,
	progress,
	reviews,
	sessions,
	tutors,
	users,
)

router = APIRouter()
from app.api.v1.endpoints import learning
from app.api.v1.endpoints import whiteboard
router.include_router(whiteboard.router, prefix="/learning", tags=["whiteboard"])
from app.api.v1.endpoints import availability
from app.api.v1.endpoints import tutor_stats
from app.api.v1.endpoints import operations
router.include_router(operations.router, prefix="/admin", tags=["admin"])
router.include_router(tutor_stats.router, prefix="/tutors", tags=["tutors"])
router.include_router(availability.router, prefix="/tutors", tags=["availability"])
router.include_router(learning.router, prefix="/learning", tags=["learning"])
router.include_router(health.router, prefix="/health", tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
router.include_router(tutors.router, prefix="/tutors", tags=["tutors"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
router.include_router(payments.router, prefix="/payments", tags=["payments"])
router.include_router(classrooms.router, prefix="/classrooms", tags=["classrooms"])
router.include_router(messages.router, prefix="/messages", tags=["messages"])
router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
router.include_router(progress.router, prefix="/progress", tags=["progress"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
