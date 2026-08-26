from fastapi import APIRouter

router = APIRouter()


@router.get("/{session_id}")
async def classroom(session_id: int) -> dict[str, int]:
    return {"session_id": session_id}
