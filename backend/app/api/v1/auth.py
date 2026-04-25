from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.db.session import get_session
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=ApiResponse[TokenResponse])
async def login(
    body: LoginRequest,
    session: Session = Depends(get_session),
) -> ApiResponse[TokenResponse]:
    statement = select(User).where(User.username == body.username)
    user = session.exec(statement).first()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    token_data = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return ApiResponse(success=True, message="Login successful", data=token_data)


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=ApiResponse[TokenResponse])
async def refresh_token(
    body: RefreshRequest,
    session: Session = Depends(get_session),
) -> ApiResponse[TokenResponse]:
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user = session.get(User, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )
    new_access = create_access_token(data={"sub": str(user.id)})
    new_refresh = create_refresh_token(data={"sub": str(user.id)})
    token_data = TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return ApiResponse(success=True, message="Token refreshed", data=token_data)


# ---------------------------------------------------------------------------
# Schema for /me response
# ---------------------------------------------------------------------------


class UserInfo(BaseModel):
    id: int
    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_path: str | None = None
    role: str
    is_active: bool = True
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# GET /auth/me - get current user info
# ---------------------------------------------------------------------------


@router.get("/me", response_model=ApiResponse[UserInfo])
async def get_me(
    user: User = Depends(get_current_user),
) -> ApiResponse[UserInfo]:
    return ApiResponse(
        success=True,
        message="User info",
        data=UserInfo(
            id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_path=user.avatar_path,
            role=user.role.value if hasattr(user.role, "value") else user.role,
            is_active=user.is_active,
            created_at=user.created_at.isoformat() if user.created_at else "",
            updated_at=user.updated_at.isoformat() if user.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# POST /auth/change-password
# ---------------------------------------------------------------------------


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password", response_model=ApiResponse[None])
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiResponse[None]:
    if not verify_password(body.old_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password is incorrect",
        )
    if len(body.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 4 characters",
        )
    user.hashed_password = get_password_hash(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    return ApiResponse(success=True, message="Password changed", data=None)
