from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class ReadingProgress(SQLModel, table=True):
    __tablename__ = "reading_progress"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    format_id: int | None = Field(default=None, foreign_key="book_formats.id")
    progress: float = Field(default=0.0, ge=0.0, le=1.0)  # 0.0 to 1.0
    current_chapter: str | None = Field(default=None, max_length=255)
    current_position: str | None = Field(default=None, max_length=255)  # CFI / page number
    device_info: str | None = Field(default=None, max_length=255)
    last_read_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReadingSession(SQLModel, table=True):
    __tablename__ = "reading_sessions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    progress: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReadingNote(SQLModel, table=True):
    __tablename__ = "reading_notes"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    chapter: str | None = Field(default=None, max_length=255)
    position: str | None = Field(default=None, max_length=255)
    content: str
    note_type: str = Field(default="note", max_length=20)  # "note", "highlight", "bookmark"
    color: str | None = Field(default=None, max_length=7)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
