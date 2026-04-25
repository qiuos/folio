from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models import Author, Book, BookAuthor, BookFormat, BookTag, Role, Tag, User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/admin", tags=["admin"])

# Track application start time for uptime reporting
_start_time = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    role: Role = Role.USER


class UserUpdate(BaseModel):
    email: str | None = None
    display_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = None


class UserInfo(BaseModel):
    id: int
    username: str
    email: str | None
    display_name: str | None
    role: Role
    is_active: bool
    created_at: datetime


class SystemStatus(BaseModel):
    total_books: int
    total_users: int
    total_file_size: int
    db_size: int
    uptime_seconds: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/users", response_model=ApiResponse[list[UserInfo]])
async def list_users(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[list[UserInfo]]:
    users = session.exec(select(User)).all()
    user_list = [
        UserInfo(
            id=u.id,
            username=u.username,
            email=u.email,
            display_name=u.display_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]
    return ApiResponse(success=True, message="Users retrieved", data=user_list)


@router.post("/users", response_model=ApiResponse[UserInfo], status_code=201)
async def create_user(
    body: UserCreate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[UserInfo]:
    # Check username uniqueness
    existing = session.exec(
        select(User).where(User.username == body.username)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    # Check email uniqueness if provided
    if body.email:
        existing_email = session.exec(
            select(User).where(User.email == body.email)
        ).first()
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already exists")

    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        email=body.email,
        role=body.role,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    info = UserInfo(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )
    return ApiResponse(success=True, message="User created", data=info)


@router.put("/users/{user_id}", response_model=ApiResponse[UserInfo])
async def update_user(
    user_id: int,
    body: UserUpdate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[UserInfo]:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if body.email is not None:
        # Check email uniqueness
        existing = session.exec(
            select(User).where(User.email == body.email, User.id != user_id)
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = body.email

    if body.display_name is not None:
        user.display_name = body.display_name

    if body.role is not None:
        user.role = body.role

    if body.is_active is not None:
        user.is_active = body.is_active

    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    info = UserInfo(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )
    return ApiResponse(success=True, message="User updated", data=info)


@router.delete("/users/{user_id}", response_model=ApiResponse[None])
async def delete_user(
    user_id: int,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[None]:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user.is_active = False
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()

    return ApiResponse(success=True, message="User deactivated", data=None)


@router.get("/status", response_model=ApiResponse[SystemStatus])
async def system_status(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[SystemStatus]:
    total_books = len(session.exec(select(Book)).all())
    total_users = len(session.exec(select(User)).all())

    # Sum of all file sizes
    total_file_size = 0
    formats = session.exec(select(BookFormat)).all()
    for fmt in formats:
        if fmt.file_size:
            total_file_size += fmt.file_size

    # Database file size
    from app.config import settings

    db_path = Path(settings.DATABASE_URL.replace("sqlite:///", ""))
    db_size = db_path.stat().st_size if db_path.exists() else 0

    uptime = (datetime.now(timezone.utc) - _start_time).total_seconds()

    status = SystemStatus(
        total_books=total_books,
        total_users=total_users,
        total_file_size=total_file_size,
        db_size=db_size,
        uptime_seconds=uptime,
    )
    return ApiResponse(success=True, message="System status", data=status)
