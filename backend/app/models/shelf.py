from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Shelf(SQLModel, table=True):
    __tablename__ = "shelves"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    description: str | None = Field(default=None)
    is_public: bool = Field(default=False)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShelfItem(SQLModel, table=True):
    __tablename__ = "shelf_items"

    id: int | None = Field(default=None, primary_key=True)
    shelf_id: int = Field(foreign_key="shelves.id", index=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    sort_order: int = Field(default=0)
    added_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    note: str | None = Field(default=None)
