from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import settings
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.font import Font
from app.models.user import User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/fonts", tags=["fonts"])

FONTS_DIR = Path(settings.BOOKS_STORAGE_PATH) / ".." / "fonts"
ALLOWED_EXTENSIONS = {".woff2", ".woff", ".ttf", ".otf"}


def _ensure_fonts_dir() -> Path:
    path = FONTS_DIR.resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


class FontInfo(BaseModel):
    id: int
    name: str
    filename: str
    format: str


@router.get("", response_model=ApiResponse[list[FontInfo]])
async def list_fonts(
    session: Session = Depends(get_session),
) -> ApiResponse[list[FontInfo]]:
    fonts = session.exec(select(Font)).all()
    return ApiResponse(
        success=True,
        message="Fonts list",
        data=[
            FontInfo(id=f.id, name=f.name, filename=f.filename, format=f.format)
            for f in fonts
        ],
    )


@router.post("", response_model=ApiResponse[FontInfo])
async def upload_font(
    name: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiResponse[FontInfo]:
    role = user.role.value if hasattr(user.role, "value") else user.role
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    fonts_dir = _ensure_fonts_dir()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = fonts_dir / stored_name

    content = await file.read()
    stored_path.write_bytes(content)

    fmt = ext.lstrip(".")
    font = Font(name=name, filename=stored_name, format=fmt, uploaded_by=user.id)
    session.add(font)
    session.commit()
    session.refresh(font)

    return ApiResponse(
        success=True,
        message="Font uploaded",
        data=FontInfo(id=font.id, name=font.name, filename=font.filename, format=font.format),
    )


@router.delete("/{font_id}", response_model=ApiResponse[None])
async def delete_font(
    font_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiResponse[None]:
    role = user.role.value if hasattr(user.role, "value") else user.role
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    font = session.get(Font, font_id)
    if font is None:
        raise HTTPException(status_code=404, detail="Font not found")

    fonts_dir = _ensure_fonts_dir()
    file_path = fonts_dir / font.filename
    if file_path.exists():
        file_path.unlink()

    session.delete(font)
    session.commit()
    return ApiResponse(success=True, message="Font deleted", data=None)


@router.get("/{font_id}/file")
async def get_font_file(
    font_id: int,
    session: Session = Depends(get_session),
) -> FileResponse:
    font = session.get(Font, font_id)
    if font is None:
        raise HTTPException(status_code=404, detail="Font not found")

    fonts_dir = _ensure_fonts_dir()
    file_path = fonts_dir / font.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Font file not found")

    mime_map = {
        "woff2": "font/woff2",
        "woff": "font/woff",
        "ttf": "font/ttf",
        "otf": "font/otf",
    }
    return FileResponse(
        file_path,
        media_type=mime_map.get(font.format, "application/octet-stream"),
        filename=f"{font.name}.{font.format}",
    )
