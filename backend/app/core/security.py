from datetime import datetime, timedelta, timezone
import secrets
import string

import bcrypt
from jose import JWTError, jwt
from app.core.config import settings




def create_email_verification_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "exp": expire, "type": "email_verification"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_password_reset_token(user_id: int, version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "type": "password_reset", "exp": expire, "version": str(version)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_special_token(token: str, expected_type: str) -> int:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise ValueError("Invalid or expired token")

    if payload.get("type") != expected_type:
        raise ValueError("Wrong token type")

    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid token") from exc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))



def generate_password(length: int = 12) -> str:
    """Generate a cryptographically secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))




def create_access_token(data: dict[str, str]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_refresh_token(data: dict[str, str]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise ValueError("Invalid Token")
