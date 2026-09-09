from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.db.session import get_db_session
from app.models import User
from app.services.learning_service import list_items

router = APIRouter()


@router.get("")
async def list_assignments(after: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user)):
    return await list_items(db, user, kind="assignment", after=after, limit=limit)
