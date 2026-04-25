from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Category(SQLModel, table=True):
    __tablename__ = "categories"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    parent_id: int | None = Field(default=None, foreign_key="categories.id")
    description: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BookCategory(SQLModel, table=True):
    __tablename__ = "book_categories"

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    category_id: int = Field(foreign_key="categories.id", index=True)
