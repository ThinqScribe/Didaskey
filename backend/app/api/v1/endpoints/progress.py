from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def learner_progress() -> dict[str, list[str]]:
    return {"milestones": [], "feedback": []}
