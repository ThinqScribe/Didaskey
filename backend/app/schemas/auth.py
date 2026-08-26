from app.models.user import EducationLevel, UserRole
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def _validate_password(value: str) -> str:
    if not 8 <= len(value) <= 72:
        raise ValueError("Password must be between 8 and 72 characters")
    return value

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    phone_number: str | None
    role: UserRole
    education_level: EducationLevel | None
    first_name: str
    last_name: str
    profile_image_url: str | None = None
    is_active: bool
    is_verified: bool

class SignupRequest(BaseModel):
    email: EmailStr
    phone_number: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=8, max_length=72)
    role: UserRole
    education_level: EducationLevel | None = None
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_education_level(self) -> "SignupRequest":
        if self.role == UserRole.STUDENT and self.education_level is None:
            raise ValueError("Education level is required for student accounts")
        return self

    @field_validator("role")
    @classmethod
    def validate_signup_role(cls, value: UserRole) -> UserRole:
        if value is UserRole.ADMIN:
            raise ValueError("Administrator accounts cannot be created through signup")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: str) -> str:
        normalized = "".join(value.split())
        if not normalized.startswith("+") or not normalized[1:].isdigit():
            raise ValueError("Phone number must use international format")
        if not 8 <= len(normalized[1:]) <= 15:
            raise ValueError("Phone number must contain 8 to 15 digits")
        return normalized
    
    
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _validate_password(value)
    
    
class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1)


class MessageResponse(BaseModel):
    message: str
    

