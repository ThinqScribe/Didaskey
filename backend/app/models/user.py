from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(StrEnum):
    STUDENT = "student"
    PARENT = "parent"
    TUTOR = "tutor"
    ADMIN = "admin"


class EducationLevel(StrEnum):
    PRIMARY_SCHOOL = "primary_school"
    JUNIOR_SECONDARY = "junior_secondary"
    SENIOR_SECONDARY = "senior_secondary"
    HIGH_SCHOOL = "high_school"
    UNDERGRADUATE = "undergraduate"
    POSTGRADUATE = "postgraduate"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda roles: [role.value for role in roles]),
        nullable=False,
    )
    education_level: Mapped[EducationLevel | None] = mapped_column(
        Enum(EducationLevel, values_callable=lambda lvls: [l.value for l in lvls]),
        nullable=True,
    )

    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    profile_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )