from fastapi import APIRouter

router = APIRouter()


@router.get("/me")
async def current_user() -> dict[str, str]:
    raise NotImplementedError("User service is not implemented yet")
