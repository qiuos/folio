from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from feedgen.feed import FeedGenerator
from sqlmodel import Session, col, select

from app.config import settings
from app.db.session import get_session
from app.models import Author, Book, BookAuthor, BookFormat, BookTag, Series, Tag, User

opds_router = APIRouter(prefix="/opds", tags=["opds"])

_http_basic = HTTPBasic()

# OPDS mime types
MIME_ATOM = "application/atom+xml;profile=opds-catalog;kind=navigation"
MIME_ACQUISITION = "application/atom+xml;profile=opds-catalog;kind=acquisition"
MIME_SEARCH = "application/opensearchdescription+xml"

PAGE_SIZE = 30


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


async def _opds_auth(
    credentials: Annotated[HTTPBasicCredentials, Depends(_http_basic)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """Validate HTTP Basic credentials against the User table."""
    user = session.exec(
        select(User).where(User.username == credentials.username)
    ).first()
    if user is None:
        raise _auth_error()
    if not user.is_active:
        raise _auth_error()
    if not bcrypt.checkpw(
        credentials.password.encode("utf-8"),
        user.hashed_password.encode("utf-8"),
    ):
        raise _auth_error()
    return user


def _auth_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Basic"},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _make_fg(
    title: str,
    request: Request,
    kind: str = "navigation",
) -> FeedGenerator:
    """Create a FeedGenerator with common metadata."""
    fg = FeedGenerator()
    fg.title(title)
    fg.id(f"urn:folio:{title.lower().replace(' ', '-')}")
    fg.updated(datetime.now(timezone.utc))
    base = _base_url(request)
    mime = MIME_ACQUISITION if kind == "acquisition" else MIME_ATOM
    fg.link(href=f"{base}/opds/", rel="start", type=MIME_ATOM)
    fg.link(href=f"{base}/opds/search?q={os.curdir}", rel="search", type=MIME_ATOM, title="Search")
    return fg


def _add_book_entry(fg: FeedGenerator, book: Book, session: Session, base: str) -> None:
    """Add a single book as an Atom entry to the feed."""
    fe = fg.add_entry()

    fe.id(f"urn:folio:book:{book.id}")
    fe.title(book.title)
    fe.updated(book.updated_at if book.updated_at else book.created_at)
    if book.description:
        fe.summary(book.description)

    # Authors
    author_links = session.exec(
        select(BookAuthor).where(BookAuthor.book_id == book.id)
    ).all()
    if author_links:
        author_ids = [la.author_id for la in author_links]
        authors = session.exec(
            select(Author).where(col(Author.id).in_(author_ids))
        ).all()
        for a in authors:
            fe.author(name=a.name)

    # Acquisition links for each format
    formats = session.exec(
        select(BookFormat).where(BookFormat.book_id == book.id)
    ).all()
    for fmt in formats:
        mime = fmt.mime_type or "application/octet-stream"
        fe.link(
            href=f"{base}/opds/books/{book.id}/file/{fmt.id}",
            rel="http://opds-spec.org/acquisition",
            type=mime,
        )

    # Thumbnail / cover link
    if book.cover_path:
        fe.link(
            href=f"{base}/api/v1/books/{book.id}/cover",
            rel="http://opds-spec.org/image/thumbnail",
            type="image/jpeg",
        )

    # Content
    fe.content(
        f"<p>{book.title}</p>",
        type="html",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@opds_router.get("/")
async def root_feed(
    request: Request,
    user: Annotated[User, Depends(_opds_auth)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    """Root navigation feed."""
    if not settings.OPDS_ENABLED:
        raise HTTPException(status_code=404, detail="OPDS is disabled")

    fg = _make_fg("Folio Library", request)
    base = _base_url(request)

    fg.link(href=f"{base}/opds/", rel="self", type=MIME_ATOM)

    # Navigation entries
    fg.link(href=f"{base}/opds/catalog", rel="subsection", type=MIME_ACQUISITION, title="Full Catalog")
    fg.link(href=f"{base}/opds/recent", rel="subsection", type=MIME_ACQUISITION, title="Recent Additions")
    fg.link(href=f"{base}/opds/authors", rel="subsection", type=MIME_ATOM, title="Authors")
    fg.link(href=f"{base}/opds/search", rel="search", type=MIME_ATOM, title="Search")

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/catalog")
async def catalog_feed(
    request: Request,
    page: int = Query(1, ge=1),
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Full catalog acquisition feed (paginated)."""
    fg = _make_fg("Folio Catalog", request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/catalog?page={page}", rel="self", type=MIME_ACQUISITION)

    total = len(session.exec(select(Book)).all())
    books = session.exec(
        select(Book).order_by(col(Book.created_at).desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    ).all()

    for book in books:
        _add_book_entry(fg, book, session, base)

    # Pagination links
    total_pages = math.ceil(total / PAGE_SIZE) if total else 1
    if page < total_pages:
        fg.link(href=f"{base}/opds/catalog?page={page + 1}", rel="next", type=MIME_ACQUISITION)
    if page > 1:
        fg.link(href=f"{base}/opds/catalog?page={page - 1}", rel="previous", type=MIME_ACQUISITION)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/recent")
async def recent_feed(
    request: Request,
    page: int = Query(1, ge=1),
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Recent additions acquisition feed."""
    fg = _make_fg("Recent Additions", request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/recent?page={page}", rel="self", type=MIME_ACQUISITION)

    books = session.exec(
        select(Book).order_by(col(Book.created_at).desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    ).all()

    for book in books:
        _add_book_entry(fg, book, session, base)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/authors")
async def authors_feed(
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Authors navigation feed listing all authors."""
    fg = _make_fg("Authors", request)
    base = _base_url(request)
    fg.link(href=f"{base}/opds/authors", rel="self", type=MIME_ATOM)

    authors = session.exec(select(Author).order_by(col(Author.name))).all()
    for author in authors:
        fe = fg.add_entry()
        fe.id(f"urn:folio:author:{author.id}")
        fe.title(author.name)
        fe.updated(author.updated_at if author.updated_at else author.created_at)
        fe.link(
            href=f"{base}/opds/authors/{author.id}",
            rel="subsection",
            type=MIME_ACQUISITION,
            title=author.name,
        )

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/authors/{author_id}")
async def author_books_feed(
    author_id: int,
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Books by a specific author (acquisition feed)."""
    author = session.get(Author, author_id)
    if author is None:
        raise HTTPException(status_code=404, detail="Author not found")

    fg = _make_fg(f"Books by {author.name}", request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/authors/{author_id}", rel="self", type=MIME_ACQUISITION)

    # Find book IDs for this author
    links = session.exec(
        select(BookAuthor).where(BookAuthor.author_id == author_id)
    ).all()
    book_ids = [la.book_id for la in links]

    if book_ids:
        books = session.exec(
            select(Book).where(col(Book.id).in_(book_ids)).order_by(col(Book.title))
        ).all()
        for book in books:
            _add_book_entry(fg, book, session, base)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/tags/{tag_id}")
async def tag_books_feed(
    tag_id: int,
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Books with a specific tag (acquisition feed)."""
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    fg = _make_fg(f"Tag: {tag.name}", request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/tags/{tag_id}", rel="self", type=MIME_ACQUISITION)

    # Find book IDs for this tag
    tag_links = session.exec(
        select(BookTag).where(BookTag.tag_id == tag_id)
    ).all()
    book_ids = [tl.book_id for tl in tag_links]

    if book_ids:
        books = session.exec(
            select(Book).where(col(Book.id).in_(book_ids)).order_by(col(Book.title))
        ).all()
        for book in books:
            _add_book_entry(fg, book, session, base)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/series/{series_id}")
async def series_books_feed(
    series_id: int,
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Books in a specific series (acquisition feed)."""
    series = session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")

    fg = _make_fg(f"Series: {series.name}", request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/series/{series_id}", rel="self", type=MIME_ACQUISITION)

    books = session.exec(
        select(Book)
        .where(Book.series_id == series_id)
        .order_by(col(Book.series_index))
    ).all()

    for book in books:
        _add_book_entry(fg, book, session, base)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/search")
async def search_feed(
    request: Request,
    q: str = Query("", description="Search query"),
    page: int = Query(1, ge=1),
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Search books by title (acquisition feed)."""
    title = f"Search: {q}" if q else "Search"
    fg = _make_fg(title, request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/search?q={q}&page={page}", rel="self", type=MIME_ACQUISITION)

    if q:
        statement = select(Book).where(col(Book.title).contains(q))
        total = len(session.exec(statement).all())
        books = session.exec(
            statement.order_by(col(Book.title))
            .offset((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
        ).all()

        for book in books:
            _add_book_entry(fg, book, session, base)

        total_pages = math.ceil(total / PAGE_SIZE) if total else 1
        if page < total_pages:
            fg.link(
                href=f"{base}/opds/search?q={q}&page={page + 1}",
                rel="next",
                type=MIME_ACQUISITION,
            )
        if page > 1:
            fg.link(
                href=f"{base}/opds/search?q={q}&page={page - 1}",
                rel="previous",
                type=MIME_ACQUISITION,
            )

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/books/{book_id}")
async def book_detail(
    book_id: int,
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    """Single book detail as an Atom entry."""
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    fg = _make_fg(book.title, request, kind="acquisition")
    base = _base_url(request)
    fg.link(href=f"{base}/opds/books/{book_id}", rel="self", type=MIME_ACQUISITION)

    _add_book_entry(fg, book, session, base)

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")


@opds_router.get("/books/{book_id}/file/{format_id}")
async def download_book_file(
    book_id: int,
    format_id: int,
    request: Request,
    user: Annotated[User, Depends(_opds_auth)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> FileResponse:
    """Download a book file."""
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    book_format = session.get(BookFormat, format_id)
    if book_format is None or book_format.book_id != book_id:
        raise HTTPException(status_code=404, detail="Format not found for this book")

    file_path = Path(book_format.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    mime_type = book_format.mime_type or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        media_type=mime_type,
        filename=file_path.name,
    )
