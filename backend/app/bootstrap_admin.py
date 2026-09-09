"""Create an initial administrator explicitly; never exposes the password."""
import argparse
import asyncio
import getpass

from sqlalchemy import select
from app.core.security import hash_password
from app.db.session import async_session_factory, engine
from app.models import User
from app.models.user import UserRole


async def create(email: str, password: str):
    async with async_session_factory() as db:
        if await db.scalar(select(User.id).where(User.email == email)):
            raise SystemExit("Account already exists. No account was modified.")
        db.add(User(email=email, first_name="Didaskey", last_name="Administrator", hashed_password=hash_password(password), role=UserRole.ADMIN, is_verified=True))
        await db.commit()
    await engine.dispose()
    print("Administrator created. Sign in through the app.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    from pydantic import TypeAdapter, EmailStr
    email = str(TypeAdapter(EmailStr).validate_python(args.email)).lower()
    password = getpass.getpass("Administrator password: ")
    if len(password) < 12 or len(password.encode("utf-8")) > 72:
        raise SystemExit("Use at least 12 characters and at most 72 UTF-8 bytes.")
    if password != getpass.getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")
    asyncio.run(create(email, password))
