from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class ItemCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    kind: Literal["message", "resource", "assignment", "note"]
    title: str = Field(default="", max_length=160)
    body: str = Field(min_length=1, max_length=20000)
    url: HttpUrl | None = None
    due_at: datetime | None = None
    client_id: str | None = Field(default=None, min_length=1, max_length=100)
    reply_to_item_id: int | None = Field(default=None, gt=0)

    @field_validator("due_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Include a timezone for the due date")
        return value


class SubmissionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    body: str = Field(min_length=1, max_length=20000)


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    feedback: str = Field(min_length=1, max_length=10000)
    score: int | None = Field(default=None, ge=0, le=100)
