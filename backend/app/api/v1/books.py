from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlmodel import Session, col, select

from app.core.exceptions import NotFoundException
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor, BookFormat, Identifier
from app.models.reading import ReadingProgress
from app.models.tag import BookTag, Tag
from app.models.user import User
from app.schemas.book import (
    AuthorBrief,
    BookDetail,
    BookListItem,
    BookListResponse,
    CategoryBrief,
    FormatBrief,
    IdentifierBrief,
    PaginationInfo,
    TagBrief,
)
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/books", tags=["books"])


def _build_book_list_item(book: Book, session: Session, user: User | None = None) -> BookListItem:
    """Build a BookListItem from a Book model, fetching related data."""
    # Authors
    author_links = session.exec(
        select(BookAuthor).where(BookAuthor.book_id == book.id)
    ).all()
    author_ids = [link.author_id for link in author_links]
    author_role_map = {link.author_id: link.role for link in author_links}
    authors = []
    if author_ids:
        author_rows = session.exec(
            select(Author).where(col(Author.id).in_(author_ids))
        ).all()
        authors = [
            AuthorBrief(id=a.id, name=a.name, role=author_role_map.get(a.id))
            for a in author_rows
        ]

    # Formats
    format_rows = session.exec(
        select(BookFormat).where(BookFormat.book_id == book.id)
    ).all()
    formats = [
        FormatBrief(id=f.id, format=f.format, file_size=f.file_size, mime_type=f.mime_type)
        for f in format_rows
    ]

    # Tags
    tag_links = session.exec(
        select(BookTag).where(BookTag.book_id == book.id)
    ).all()
    tag_ids = [link.tag_id for link in tag_links]
    tags = []
    if tag_ids:
        tag_rows = session.exec(
            select(Tag).where(col(Tag.id).in_(tag_ids))
        ).all()
        tags = [TagBrief(id=t.id, name=t.name, color=t.color) for t in tag_rows]

    progress = None
    if user is not None:
        progress_row = session.exec(
            select(ReadingProgress).where(
                ReadingProgress.user_id == user.id,
                ReadingProgress.book_id == book.id,
            )
        ).first()
        progress = progress_row.progress if progress_row else None

    return BookListItem(
        id=book.id,
        title=book.title,
        subtitle=book.subtitle,
        cover_path=book.cover_path,
        language=book.language,
        page_count=book.page_count,
        published_date=book.published_date,
        rating=book.rating,
        progress=progress,
        authors=authors,
        formats=formats,
        tags=tags,
        created_at=book.created_at.isoformat() if book.created_at else "",
        updated_at=book.updated_at.isoformat() if book.updated_at else "",
    )


# Allowed sort fields
SORTABLE_FIELDS = {
    "title": Book.title,
    "created_at": Book.created_at,
    "updated_at": Book.updated_at,
    "published_date": Book.published_date,
    "rating": Book.rating,
}


@router.get("", response_model=ApiResponse[BookListResponse])
async def list_books(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort: str = Query("created_at", description="Sort field"),
    order: str = Query("desc", description="Sort order: asc or desc"),
    search: Optional[str] = Query(None, description="Search in title"),
    language: Optional[str] = Query(None, description="Filter by language"),
    tag_id: Optional[int] = Query(None, description="Filter by tag ID"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[BookListResponse]:
    statement = select(Book)

    # Filters
    if search:
        statement = statement.where(col(Book.title).contains(search))
    if language:
        statement = statement.where(Book.language == language)
    if tag_id:
        book_ids_subquery = select(BookTag.book_id).where(BookTag.tag_id == tag_id)
        statement = statement.where(col(Book.id).in_(book_ids_subquery))

    # Count total
    count_statement = select(Book).with_only_columns()
    # We need a separate count query
    total_items = len(session.exec(statement).all())

    # Sorting
    sort_field = SORTABLE_FIELDS.get(sort, Book.created_at)
    if order == "asc":
        statement = statement.order_by(col(sort_field).asc())
    else:
        statement = statement.order_by(col(sort_field).desc())

    # Pagination
    offset = (page - 1) * page_size
    statement = statement.offset(offset).limit(page_size)

    books = session.exec(statement).all()

    items = [_build_book_list_item(book, session, user) for book in books]

    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 0

    pagination = PaginationInfo(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )

    return ApiResponse(
        success=True,
        message="Books retrieved",
        data=BookListResponse(items=items, pagination=pagination),
    )


@router.get("/{book_id}", response_model=ApiResponse[BookDetail])
async def get_book(
    book_id: int,
    session: Session = Depends(get_session),
) -> ApiResponse[BookDetail]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book with id {book_id} not found")

    # Authors
    author_links = session.exec(
        select(BookAuthor).where(BookAuthor.book_id == book.id)
    ).all()
    author_role_map = {link.author_id: link.role for link in author_links}
    author_ids = [link.author_id for link in author_links]
    authors = []
    if author_ids:
        author_rows = session.exec(
            select(Author).where(col(Author.id).in_(author_ids))
        ).all()
        authors = [
            AuthorBrief(id=a.id, name=a.name, role=author_role_map.get(a.id))
            for a in author_rows
        ]

    # Formats
    format_rows = session.exec(
        select(BookFormat).where(BookFormat.book_id == book.id)
    ).all()
    formats = [
        FormatBrief(id=f.id, format=f.format, file_size=f.file_size, mime_type=f.mime_type)
        for f in format_rows
    ]

    # Identifiers
    identifier_rows = session.exec(
        select(Identifier).where(Identifier.book_id == book.id)
    ).all()
    identifiers = [
        IdentifierBrief(id=i.id, type=i.type, value=i.value)
        for i in identifier_rows
    ]

    # Tags
    tag_links = session.exec(
        select(BookTag).where(BookTag.book_id == book.id)
    ).all()
    tag_ids = [link.tag_id for link in tag_links]
    tags = []
    if tag_ids:
        tag_rows = session.exec(
            select(Tag).where(col(Tag.id).in_(tag_ids))
        ).all()
        tags = [TagBrief(id=t.id, name=t.name, color=t.color) for t in tag_rows]

    # Publisher
    publisher_data = None
    if book.publisher_id:
        from app.models.publisher import Publisher

        pub = session.get(Publisher, book.publisher_id)
        if pub:
            publisher_data = {"id": pub.id, "name": pub.name}

    # Series
    series_data = None
    if book.series_id:
        from app.models.series import Series

        ser = session.get(Series, book.series_id)
        if ser:
            series_data = {"id": ser.id, "name": ser.name}

    # Categories
    from app.models.category import BookCategory, Category

    cat_links = session.exec(
        select(BookCategory).where(BookCategory.book_id == book.id)
    ).all()
    cat_ids = [link.category_id for link in cat_links]
    categories = []
    if cat_ids:
        cat_rows = session.exec(
            select(Category).where(col(Category.id).in_(cat_ids))
        ).all()
        categories = [CategoryBrief(id=c.id, name=c.name) for c in cat_rows]

    detail = BookDetail(
        id=book.id,
        title=book.title,
        sort_title=book.sort_title,
        subtitle=book.subtitle,
        description=book.description,
        cover_path=book.cover_path,
        language=book.language,
        page_count=book.page_count,
        published_date=book.published_date,
        rating=book.rating,
        rating_source=book.rating_source,
        metadata_source=book.metadata_source,
        series_index=book.series_index,
        created_at=book.created_at.isoformat() if book.created_at else "",
        updated_at=book.updated_at.isoformat() if book.updated_at else "",
        authors=authors,
        formats=formats,
        identifiers=identifiers,
        tags=tags,
        categories=categories,
        publisher=publisher_data,
        series=series_data,
    )

    return ApiResponse(success=True, message="Book detail", data=detail)


@router.get("/{book_id}/cover")
async def get_book_cover(
    book_id: int,
    session: Session = Depends(get_session),
) -> FileResponse:
    book = session.get(Book, book_id)
    if book is None or not book.cover_path:
        raise NotFoundException(message=f"Cover for book {book_id} not found")

    cover_file = Path(book.cover_path)
    if not cover_file.exists():
        raise NotFoundException(message=f"Cover file not found on disk")

    return FileResponse(
        path=str(cover_file),
        media_type="image/jpeg",
        filename=cover_file.name,
    )


# ---------------------------------------------------------------------------
# Serve book file (with Range support for PDFs)
# ---------------------------------------------------------------------------

CHUNK_SIZE = 64 * 1024  # 64 KB


def _serve_file(book_format: BookFormat, request: Request) -> Response:
    """Serve a book format file with Range support."""
    file_path = Path(book_format.file_path)
    if not file_path.exists():
        raise NotFoundException(message="File not found on disk")

    file_size = file_path.stat().st_size
    mime_type = book_format.mime_type or "application/octet-stream"
    range_header = request.headers.get("range")

    if range_header:
        range_match = range_header.strip()
        if range_match.startswith("bytes="):
            try:
                range_spec = range_match[6:]
                if range_spec.startswith("-"):
                    suffix_length = int(range_spec[1:])
                    start = max(0, file_size - suffix_length)
                    end = file_size - 1
                elif range_spec.endswith("-"):
                    start = int(range_spec[:-1])
                    end = file_size - 1
                else:
                    parts = range_spec.split("-")
                    start = int(parts[0])
                    end = int(parts[1]) if parts[1] else file_size - 1

                start = max(0, start)
                end = min(end, file_size - 1)
                content_length = end - start + 1

                def _range_generator():
                    with open(file_path, "rb") as f:
                        f.seek(start)
                        remaining = content_length
                        while remaining > 0:
                            chunk = f.read(min(CHUNK_SIZE, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk

                return StreamingResponse(
                    _range_generator(),
                    status_code=206,
                    media_type=mime_type,
                    headers={
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Accept-Ranges": "bytes",
                        "Content-Length": str(content_length),
                        "Content-Disposition": f'inline; filename="{file_path.name}"',
                    },
                )
            except (ValueError, IndexError):
                pass

    return FileResponse(
        path=str(file_path),
        media_type=mime_type,
        filename=file_path.name,
        content_disposition_type="inline",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


@router.get("/{book_id}/files/{format_name}")
async def serve_book_file_by_format(
    book_id: int,
    format_name: str,
    request: Request,
    session: Session = Depends(get_session),
) -> Response:
    """Serve a book file by format name (e.g. 'epub', 'pdf')."""
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    fmt = format_name.lower()
    book_format = session.exec(
        select(BookFormat).where(
            BookFormat.book_id == book_id, BookFormat.format == fmt
        )
    ).first()
    if book_format is None:
        raise NotFoundException(message=f"Format '{fmt}' not found for book {book_id}")

    return _serve_file(book_format, request)


@router.get("/{book_id}/files/id/{format_id}")
async def serve_book_file_by_id(
    book_id: int,
    format_id: int,
    request: Request,
    session: Session = Depends(get_session),
) -> Response:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    book_format = session.get(BookFormat, format_id)
    if book_format is None or book_format.book_id != book_id:
        raise NotFoundException(
            message=f"Format {format_id} not found for book {book_id}"
        )

    return _serve_file(book_format, request)


@router.get("/{book_id}/cover")
async def serve_book_cover(
    book_id: int,
    session: Session = Depends(get_session),
) -> FileResponse:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")
    if not book.cover_path:
        raise NotFoundException(message="No cover available")
    cover = Path(book.cover_path)
    if not cover.exists():
        raise NotFoundException(message="Cover file not found on disk")
    return FileResponse(path=str(cover), media_type="image/jpeg")
