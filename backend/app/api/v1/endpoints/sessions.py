from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_sessions() -> list[dict[str, str]]:
    return []
