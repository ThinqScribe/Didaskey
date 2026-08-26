from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_assignments() -> list[dict[str, str]]:
    return []
