"""Administrator operations with explicit role checks."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import require_role
from app.db.session import get_db_session
from app.models import Booking, TutorProfile, User
from app.models.user import UserRole
from app.schemas.auth import UserResponse
from app.services.booking_service import _build_response

router = APIRouter(dependencies=[Depends(require_role(UserRole.ADMIN))])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db_session)):
    users = await db.scalar(select(func.count(User.id)))
    pending = await db.scalar(select(func.count(TutorProfile.id)).where(TutorProfile.verification_status == "pending"))
    confirmed = await db.scalar(select(func.count(Booking.id)).where(Booking.status == "confirmed"))
    completed = await db.scalar(select(func.count(Booking.id)).where(Booking.status == "completed"))
    return {"users": users, "pending_tutors": pending, "confirmed_sessions": confirmed, "completed_sessions": completed}


@router.get("/users", response_model=list[UserResponse])
async def users(search: str = Query("", max_length=100), page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session)):
    query = select(User)
    if search.strip():
        query = query.where(User.email.ilike(f"%{search.strip()}%") | User.first_name.ilike(f"%{search.strip()}%") | User.last_name.ilike(f"%{search.strip()}%"))
    return (await db.scalars(query.order_by(User.id.desc()).offset((page - 1) * 50).limit(50))).all()


class UserStatus(BaseModel):
    is_active: bool


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def user_status(user_id: int, payload: UserStatus, db: AsyncSession = Depends(get_db_session), admin: User = Depends(require_role(UserRole.ADMIN))):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.role == UserRole.ADMIN:
        raise HTTPException(403, "Administrator accounts cannot be disabled here")
    user.is_active = payload.is_active
    user.token_version += 1
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/bookings")
async def bookings(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session)):
    rows = (await db.scalars(select(Booking).options(selectinload(Booking.transaction)).order_by(Booking.id.desc()).offset((page - 1) * 50).limit(50))).unique().all()
    return [_build_response(row) for row in rows]
