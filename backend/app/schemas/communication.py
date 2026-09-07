"""
Pydantic contracts for the live classroom.

Naming convention
-----------------
*Response — outbound representations sent to the client.

Security notes
--------------
- ``ClassroomJoinResponse.token`` is a short-lived LiveKit access token
  scoped to exactly one room and one identity.  The client uses it only
  to connect to LiveKit's WebSocket endpoint — it carries no server
  credentials.
- ``livekit_url`` (the wss:// WebSocket URL) is safe to expose; it is
  a public endpoint that still requires a valid signed token to join.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.billing import SessionFormat
from app.models.communication import ClassroomStatus


class ClassroomWindow(BaseModel):
    """Join-window metadata used to drive the 'Join Session' UI state."""

    opens_at: datetime
    closes_at: datetime
    can_join_now: bool
    seconds_until_open: int = Field(
        ge=0,
        description="0 once the window is open (or already passed).",
    )


class ClassroomResponse(BaseModel):
    """
    Classroom + join-window status for a booking.

    Cheap and safe to poll frequently from the client to drive a
    'Join Session' button / countdown — calling GET never creates a
    Classroom row.
    """

    model_config = ConfigDict(from_attributes=True)

    booking_id: int
    room_name: str
    status: ClassroomStatus
    session_format: SessionFormat
    started_at: datetime | None
    ended_at: datetime | None
    window: ClassroomWindow


class ClassroomJoinResponse(BaseModel):
    """Returned when a participant successfully requests to join."""

    booking_id: int
    livekit_url: str
    """The LiveKit WebSocket URL (wss://…) the client connects to."""

    token: str
    """Short-lived LiveKit participant access token."""

    room_name: str
    user_id: int
    display_name: str
    role: str
    is_tutor: bool


class ClassroomParticipantResponse(BaseModel):
    """A single join-event row — used for attendance views."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    role: str
    joined_at: datetime
    left_at: datetime | None


class AttendanceSummary(BaseModel):
    """Aggregated attendance for a completed session."""

    user_id: int
    display_name: str
    role: str
    total_seconds: int
    joined_at: datetime | None
    left_at: datetime | None
