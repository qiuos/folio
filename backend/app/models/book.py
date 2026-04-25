from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.category import BookCategory
    from app.models.publisher import Publisher
    from app.models.series import Series
    from app.models.shelf import ShelfItem


# ---------------------------------------------------------------------------
# Association: Book <-> Author (many-to-many)
# ---------------------------------------------------------------------------


class BookAuthor(SQLModel, table=True):
    __tablename__ = "book_authors"

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    author_id: int = Field(foreign_key="authors.id", index=True)
    role: str | None = Field(default=None, max_length=50)


# ---------------------------------------------------------------------------
# Author
# ---------------------------------------------------------------------------


class Author(SQLModel, table=True):
    __tablename__ = "authors"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, index=True)
    sort_name: str | None = Field(default=None, max_length=255, index=True)
    bio: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class FormatEnum(str, Enum):
    EPUB = "epub"
    PDF = "pdf"
    MOBI = "mobi"
    AZW3 = "azw3"
    TXT = "txt"
    FB2 = "fb2"


class IdentifierType(str, Enum):
    ISBN_10 = "isbn10"
    ISBN_13 = "isbn13"
    ASIN = "asin"
    GOOGLE = "google"
    GOODREADS = "goodreads"
    DOI = "doi"
    UUID = "uuid"


# ---------------------------------------------------------------------------
# BookFormat
# ---------------------------------------------------------------------------


class BookFormat(SQLModel, table=True):
    __tablename__ = "book_formats"

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    format: str = Field(max_length=20)
    file_path: str = Field(max_length=1024)
    file_size: int | None = Field(default=None)
    mime_type: str | None = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Identifier
# ---------------------------------------------------------------------------


class Identifier(SQLModel, table=True):
    __tablename__ = "identifiers"

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="books.id", index=True)
    type: str = Field(max_length=20)
    value: str = Field(max_length=255, index=True)


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------


class Book(SQLModel, table=True):
    __tablename__ = "books"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=500, index=True)
    sort_title: str | None = Field(default=None, max_length=500, index=True)
    subtitle: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None)
    cover_path: str | None = Field(default=None, max_length=1024)
    publisher_id: int | None = Field(default=None, foreign_key="publishers.id")
    series_id: int | None = Field(default=None, foreign_key="series.id")
    series_index: float | None = Field(default=None)
    language: str | None = Field(default=None, max_length=10)
    page_count: int | None = Field(default=None)
    published_date: str | None = Field(default=None, max_length=20)
    rating: float | None = Field(default=None, ge=0, le=5)
    rating_source: str | None = Field(default=None, max_length=50)
    metadata_source: str | None = Field(default=None, max_length=50)
    source: str = Field(default="upload", max_length=50)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
