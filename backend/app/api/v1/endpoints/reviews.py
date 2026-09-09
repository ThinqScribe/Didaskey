from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import Review, User
from app.services.learning_service import serialize

router = APIRouter()


@router.get("")
async def list_reviews(page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    rows = (await db.scalars(select(Review).where(Review.student_id == user.id).order_by(Review.id.desc()).offset((page - 1) * 50).limit(50))).all()
    return [serialize(row) for row in rows]
