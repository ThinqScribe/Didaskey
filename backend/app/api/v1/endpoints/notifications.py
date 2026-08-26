from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_notifications() -> list[dict[str, str]]:
    return []
