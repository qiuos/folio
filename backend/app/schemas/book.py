from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AuthorBrief(BaseModel):
    id: int
    name: str
    role: str | None = None

    model_config = {"from_attributes": True}


class FormatBrief(BaseModel):
    id: int
    format: str
    file_size: int | None = None
    mime_type: str | None = None

    model_config = {"from_attributes": True}


class IdentifierBrief(BaseModel):
    id: int
    type: str
    value: str

    model_config = {"from_attributes": True}


class TagBrief(BaseModel):
    id: int
    name: str
    color: str | None = None

    model_config = {"from_attributes": True}


class CategoryBrief(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# List item (lightweight, used in paginated listing)
# ---------------------------------------------------------------------------


class BookListItem(BaseModel):
    id: int
    title: str
    subtitle: str | None = None
    cover_path: str | None = None
    language: str | None = None
    page_count: int | None = None
    published_date: str | None = None
    rating: float | None = None
    progress: float | None = None
    authors: List[AuthorBrief] = []
    formats: List[FormatBrief] = []
    tags: List[TagBrief] = []
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Detail (full book info)
# ---------------------------------------------------------------------------


class BookDetail(BaseModel):
    id: int
    title: str
    sort_title: str | None = None
    subtitle: str | None = None
    description: str | None = None
    cover_path: str | None = None
    language: str | None = None
    page_count: int | None = None
    published_date: str | None = None
    rating: float | None = None
    rating_source: str | None = None
    metadata_source: str | None = None
    series_index: float | None = None
    created_at: str
    updated_at: str

    authors: List[AuthorBrief] = []
    formats: List[FormatBrief] = []
    identifiers: List[IdentifierBrief] = []
    tags: List[TagBrief] = []
    categories: List[CategoryBrief] = []

    publisher: dict | None = None
    series: dict | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


class PaginationInfo(BaseModel):
    page: int = 1
    page_size: int = 20
    total_items: int = 0
    total_pages: int = 0


class BookListResponse(BaseModel):
    items: List[BookListItem] = []
    pagination: PaginationInfo
