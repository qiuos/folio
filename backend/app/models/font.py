from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Font(SQLModel, table=True):
    __tablename__ = "fonts"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    filename: str
    format: str = "woff2"
    uploaded_by: int | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
