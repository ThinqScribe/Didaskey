"""
Pydantic contracts for the live video classroom.

Naming convention (matches billing.py / marketplace.py)
--------------------------------------------------------
*Response — outbound representations

Security notes
--------------
- ``ClassroomJoinResponse.token`` is a short-lived LiveKit access token
  scoped to exactly one room and one identity — never a long-lived
  credential.
- ``livekit_url`` is safe to expose; it carries no secret.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.billing import SessionFormat
from app.models.communication import ClassroomStatus


class ClassroomWindow(BaseModel):
    """Join-window metadata used to drive the "Join Session" UI state."""

    opens_at: datetime
    closes_at: datetime
    can_join_now: bool
    seconds_until_open: int = Field(
        ge=0, description="0 once the window is open (or already passed)."
    )


class ClassroomResponse(BaseModel):
    """
    Classroom + join-window status for a booking.

    Cheap and safe to poll frequently from the client to drive a
    "Join Session" button / countdown — it never creates a Classroom row.
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
    room_name: str
    livekit_url: str
    token: str
    identity: str
    display_name: str
    role: str
    expires_in_minutes: int


class ClassroomParticipantResponse(BaseModel):
    """A single join-event row — reserved for future attendance views."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    role: str
    joined_at: datetime
    left_at: datetime | None
