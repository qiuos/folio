from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.config import settings
from app.core.exceptions import BadRequestException, NotFoundException
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor
from app.models.tag import BookTag, Tag
from app.schemas.response import ApiResponse
from app.services.metadata.base import MetadataResult
from app.services.metadata.fetcher import MetadataService
from app.services.metadata.providers.douban import DoubanProvider
from app.services.metadata.providers.google_books import GoogleBooksProvider
from app.services.metadata.providers.isbn_cn import ISBNCNProvider
from app.services.metadata.providers.open_library import OpenLibraryProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metadata", tags=["metadata"])


def _download_cover(cover_url: str, book_id: int) -> Optional[str]:
    """Download a cover image from URL and save locally."""
    try:
        import httpx
        resp = httpx.get(cover_url, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            return None
        ext = ".jpg"
        ct = resp.headers.get("content-type", "")
        for ct_ext in [("png", ".png"), ("webp", ".webp"), ("jpeg", ".jpg")]:
            if ct_ext[0] in ct:
                ext = ct_ext[1]
                break
        cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
        cover_dir.mkdir(parents=True, exist_ok=True)
        cover_file = cover_dir / f"cover{ext}"
        with open(cover_file, "wb") as f:
            f.write(resp.content)
        return str(cover_file)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------


def _build_service() -> MetadataService:
    """Build a MetadataService with all available providers."""
    from app.config import settings

    providers = [
        GoogleBooksProvider(api_key=getattr(settings, "GOOGLE_BOOKS_API_KEY", None)),
        OpenLibraryProvider(),
        DoubanProvider(),
        ISBNCNProvider(),
    ]
    return MetadataService(providers)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class FetchRequest(BaseModel):
    isbn: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    book_id: Optional[int] = None


class SearchRequest(BaseModel):
    query: str


class ApplyRequest(BaseModel):
    source: str = ""
    title: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    publisher: Optional[str] = None
    pubdate: Optional[str] = None
    isbn: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    rating: Optional[float] = None
    page_count: Optional[int] = None
    tags: list[str] = Field(default_factory=list)


class MetadataResultResponse(BaseModel):
    title: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    publisher: Optional[str] = None
    pubdate: Optional[str] = None
    isbn: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    rating: Optional[float] = None
    page_count: Optional[int] = None
    tags: list[str] = Field(default_factory=list)
    source: str = ""
    confidence: float = 0.0


def _result_to_response(r: MetadataResult) -> MetadataResultResponse:
    return MetadataResultResponse(
        title=r.title,
        authors=r.authors,
        publisher=r.publisher,
        pubdate=r.pubdate,
        isbn=r.isbn,
        description=r.description,
        cover_url=r.cover_url,
        rating=r.rating,
        page_count=r.page_count,
        tags=r.tags,
        source=r.source,
        confidence=r.confidence,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/fetch", response_model=ApiResponse[MetadataResultResponse])
async def fetch_metadata(
    body: FetchRequest,
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Fetch the best single metadata match for the given query."""
    if not body.isbn and not body.title:
        raise BadRequestException(message="At least one of isbn or title is required")

    # If book_id is provided, try to pre-fill from the book record
    if body.book_id and not body.isbn and not body.title:
        book = session.get(Book, body.book_id)
        if book:
            body.title = body.title or book.title

    service = _build_service()
    result = await service.fetch(
        isbn=body.isbn,
        title=body.title,
        author=body.author,
        session=session,
    )

    if result is None:
        return ApiResponse(success=True, message="No results found", data=None)

    return ApiResponse(
        success=True,
        message="Metadata fetched",
        data=_result_to_response(result),
    )


@router.post("/search", response_model=ApiResponse[list[MetadataResultResponse]])
async def search_metadata(
    body: SearchRequest,
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Search all providers and return every candidate."""
    query = body.query.strip()
    if not query:
        raise BadRequestException(message="Query string is required")

    # Detect if the query looks like an ISBN
    isbn = None
    title = query
    clean = query.replace("-", "").replace(" ", "")
    if clean.isdigit() and len(clean) in (10, 13):
        isbn = clean
        title = None

    service = _build_service()
    results = await service.fetch_all(
        isbn=isbn,
        title=title,
        session=session,
    )

    return ApiResponse(
        success=True,
        message=f"Found {len(results)} candidates",
        data=[_result_to_response(r) for r in results],
    )


@router.post("/apply/{book_id}", response_model=ApiResponse)
async def apply_metadata(
    book_id: int,
    body: ApplyRequest,
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Apply metadata to an existing book record.

    Creates Author records (if needed), links them via BookAuthor,
    and creates Tag records from the tags list.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book with id {book_id} not found")

    # --- Update basic book fields ---
    if body.title:
        book.title = body.title
    if body.description:
        book.description = body.description
    if body.pubdate:
        book.published_date = body.pubdate
    if body.page_count:
        book.page_count = body.page_count
    if body.rating is not None:
        book.rating = body.rating
        book.rating_source = body.source or "metadata"
    if body.source:
        book.metadata_source = body.source
    if body.cover_url:
        # Download remote cover to local storage
        local_path = _download_cover(body.cover_url, book_id)
        if local_path:
            book.cover_path = local_path
        else:
            book.cover_path = body.cover_url

    # --- Publisher ---
    if body.publisher:
        from app.models.publisher import Publisher

        pub = session.exec(
            select(Publisher).where(Publisher.name == body.publisher)
        ).first()
        if pub is None:
            pub = Publisher(name=body.publisher)
            session.add(pub)
            session.flush()
        book.publisher_id = pub.id

    # --- Authors ---
    if body.authors:
        # Remove existing author links
        existing_links = session.exec(
            select(BookAuthor).where(BookAuthor.book_id == book_id)
        ).all()
        for link in existing_links:
            session.delete(link)

        for author_name in body.authors:
            name = author_name.strip()
            if not name:
                continue
            author = session.exec(
                select(Author).where(Author.name == name)
            ).first()
            if author is None:
                author = Author(name=name)
                session.add(author)
                session.flush()
            link = BookAuthor(book_id=book_id, author_id=author.id)
            session.add(link)

    # --- Tags ---
    if body.tags:
        for tag_name in body.tags:
            name = tag_name.strip()
            if not name:
                continue
            tag = session.exec(select(Tag).where(Tag.name == name)).first()
            if tag is None:
                tag = Tag(name=name)
                session.add(tag)
                session.flush()
            # Check link already exists
            existing = session.exec(
                select(BookTag).where(
                    BookTag.book_id == book_id, BookTag.tag_id == tag.id
                )
            ).first()
            if existing is None:
                session.add(BookTag(book_id=book_id, tag_id=tag.id))

    # --- ISBN identifier ---
    if body.isbn:
        from app.models.book import Identifier

        existing_isbn = session.exec(
            select(Identifier).where(
                Identifier.book_id == book_id,
                col(Identifier.type).in_(["isbn10", "isbn13"]),
            )
        ).first()
        if existing_isbn is None:
            isbn_type = "isbn13" if len(body.isbn.replace("-", "")) == 13 else "isbn10"
            session.add(
                Identifier(book_id=book_id, type=isbn_type, value=body.isbn)
            )

    session.add(book)
    session.commit()
    session.refresh(book)

    return ApiResponse(success=True, message="Metadata applied to book", data={"book_id": book.id})


@router.post("/cover/{book_id}", response_model=ApiResponse)
async def upload_cover(
    book_id: int,
    file: UploadFile,
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Upload a cover image for a book."""
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    ext = Path(file.filename or "cover.jpg").suffix or ".jpg"
    cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_file = cover_dir / f"cover{ext}"

    contents = await file.read()
    with open(cover_file, "wb") as f:
        f.write(contents)

    # Remove old cover if different extension
    if book.cover_path:
        old = Path(book.cover_path)
        if old != cover_file and old.exists():
            old.unlink()

    book.cover_path = str(cover_file)
    book.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    session.add(book)
    session.commit()

    return ApiResponse(success=True, message="Cover uploaded", data={"cover_path": str(cover_file)})
