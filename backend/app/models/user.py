from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(max_length=100, unique=True, index=True)
    email: str | None = Field(default=None, max_length=255, unique=True, index=True)
    hashed_password: str = Field(max_length=255)
    display_name: str | None = Field(default=None, max_length=100)
    avatar_path: str | None = Field(default=None, max_length=1024)
    role: Role = Field(default=Role.USER)
    is_active: bool = Field(default=True)
    last_login_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
