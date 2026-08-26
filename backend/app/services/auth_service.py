from app.core.security import create_access_token
from app.repositories.user_repository import UserRepository


class AuthService:
    def __init__(self, users: UserRepository):
        self.users = users

    async def issue_token(self, email: str) -> str:
        user = await self.users.get_by_email(email)
        if user is None:
            raise ValueError("Invalid credentials")
        return create_access_token({"sub": str(user.id)})
