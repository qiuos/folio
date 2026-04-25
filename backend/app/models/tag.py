from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Tag(SQLModel, table=True):
    __tablename__ = "tags"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, unique=True, index=True)
    color: str | None = Field(default=None, max_length=7)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BookTag(SQLModel, table=True):
    __tablename__ = "book_tags"

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    tag_id: int = Field(foreign_key="tags.id", index=True)
