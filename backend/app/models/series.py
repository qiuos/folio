from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Series(SQLModel, table=True):
    __tablename__ = "series"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    description: str | None = Field(default=None)
    total_count: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
