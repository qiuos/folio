from __future__ import annotations

import math
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor
from app.models.category import BookCategory, Category
from app.models.publisher import Publisher
from app.models.reading import ReadingProgress
from app.models.series import Series
from app.models.tag import BookTag, Tag
from app.models.user import User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/browse", tags=["browse"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class BookBrief(BaseModel):
    id: int | None
    title: str
    cover_path: str | None = None
    rating: float | None = None
    progress: float | None = None


class AuthorListItem(BaseModel):
    id: int | None
    name: str
    sort_name: str | None = None
    book_count: int = 0


class AuthorDetail(BaseModel):
    id: int | None
    name: str
    sort_name: str | None = None
    bio: str | None = None
    book_count: int = 0
    books: list[BookBrief] = []


class TagListItem(BaseModel):
    id: int | None
    name: str
    color: str | None = None
    book_count: int = 0


class TagDetail(BaseModel):
    id: int | None
    name: str
    color: str | None = None
    book_count: int = 0
    books: list[BookBrief] = []


class SeriesListItem(BaseModel):
    id: int | None
    name: str
    description: str | None = None
    total_count: int | None = None
    book_count: int = 0


class SeriesDetail(BaseModel):
    id: int | None
    name: str
    description: str | None = None
    total_count: int | None = None
    book_count: int = 0
    books: list[BookBrief] = []


class PublisherListItem(BaseModel):
    id: int | None
    name: str
    description: str | None = None
    book_count: int = 0


class PublisherDetail(BaseModel):
    id: int | None
    name: str
    description: str | None = None
    book_count: int = 0
    books: list[BookBrief] = []


class CategoryNode(BaseModel):
    id: int | None
    name: str
    parent_id: int | None = None
    description: str | None = None
    book_count: int = 0
    children: list["CategoryNode"] = []


CategoryNode.model_rebuild()


class SearchResults(BaseModel):
    books: list[BookBrief]
    authors: list[AuthorListItem]
    tags: list[TagListItem]


class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PaginatedAuthors(BaseModel):
    items: list[AuthorListItem]
    pagination: PaginationInfo


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _book_brief(book: Book, session: Session, user: User) -> BookBrief:
    progress = session.exec(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == book.id,
        )
    ).first()
    return BookBrief(
        id=book.id,
        title=book.title,
        cover_path=book.cover_path,
        rating=book.rating,
        progress=progress.progress if progress else None,
    )


# ---------------------------------------------------------------------------
# Authors
# ---------------------------------------------------------------------------


@router.get("/authors", response_model=ApiResponse[PaginatedAuthors])
def list_authors(
    search: Optional[str] = Query(None, description="Search author name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session),
) -> ApiResponse[PaginatedAuthors]:
    statement = select(Author)

    if search:
        statement = statement.where(col(Author.name).ilike(f"%{search}%"))

    # Count total
    count_statement = select(func.count()).select_from(Author)
    if search:
        count_statement = count_statement.where(col(Author.name).ilike(f"%{search}%"))
    total_items = session.exec(count_statement).one()

    # Sort by name
    statement = statement.order_by(col(Author.name).asc())

    # Pagination
    offset = (page - 1) * page_size
    statement = statement.offset(offset).limit(page_size)

    authors = session.exec(statement).all()

    # Book counts via BookAuthor link table
    author_ids = [a.id for a in authors if a.id is not None]
    book_count_map: dict[int, int] = {}
    if author_ids:
        count_rows = session.exec(
            select(BookAuthor.author_id, func.count(BookAuthor.id))
            .where(col(BookAuthor.author_id).in_(author_ids))
            .group_by(BookAuthor.author_id)
        ).all()
        book_count_map = {row[0]: row[1] for row in count_rows}

    items = [
        AuthorListItem(
            id=a.id,
            name=a.name,
            sort_name=a.sort_name,
            book_count=book_count_map.get(a.id, 0),  # type: ignore[arg-type]
        )
        for a in authors
    ]

    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 0
    pagination = PaginationInfo(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )

    return ApiResponse(
        success=True,
        message="Authors retrieved",
        data=PaginatedAuthors(items=items, pagination=pagination),
    )


@router.get("/authors/{author_id}", response_model=ApiResponse[AuthorDetail])
def get_author(
    author_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[AuthorDetail]:
    author = session.get(Author, author_id)
    if author is None:
        return ApiResponse(success=False, message="Author not found", data=None)

    # Get books via link table
    links = session.exec(
        select(BookAuthor).where(BookAuthor.author_id == author_id)
    ).all()
    book_ids = [link.book_id for link in links]

    books: list[BookBrief] = []
    if book_ids:
        book_rows = session.exec(
            select(Book).where(col(Book.id).in_(book_ids)).order_by(col(Book.title).asc())
        ).all()
        books = [_book_brief(b, session, user) for b in book_rows]

    return ApiResponse(
        success=True,
        message="Author detail",
        data=AuthorDetail(
            id=author.id,
            name=author.name,
            sort_name=author.sort_name,
            bio=author.bio,
            book_count=len(books),
            books=books,
        ),
    )


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


@router.get("/tags", response_model=ApiResponse[list[TagListItem]])
def list_tags(
    search: Optional[str] = Query(None, description="Search tag name"),
    session: Session = Depends(get_session),
) -> ApiResponse[list[TagListItem]]:
    statement = select(Tag)

    if search:
        statement = statement.where(col(Tag.name).ilike(f"%{search}%"))

    statement = statement.order_by(col(Tag.name).asc())
    tags = session.exec(statement).all()

    # Book counts
    tag_ids = [t.id for t in tags if t.id is not None]
    book_count_map: dict[int, int] = {}
    if tag_ids:
        count_rows = session.exec(
            select(BookTag.tag_id, func.count(BookTag.id))
            .where(col(BookTag.tag_id).in_(tag_ids))
            .group_by(BookTag.tag_id)
        ).all()
        book_count_map = {row[0]: row[1] for row in count_rows}

    items = [
        TagListItem(
            id=t.id,
            name=t.name,
            color=t.color,
            book_count=book_count_map.get(t.id, 0),  # type: ignore[arg-type]
        )
        for t in tags
    ]

    return ApiResponse(success=True, message="Tags retrieved", data=items)


@router.get("/tags/{tag_id}", response_model=ApiResponse[TagDetail])
def get_tag(
    tag_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[TagDetail]:
    tag = session.get(Tag, tag_id)
    if tag is None:
        return ApiResponse(success=False, message="Tag not found", data=None)

    # Get books via link table
    links = session.exec(
        select(BookTag).where(BookTag.tag_id == tag_id)
    ).all()
    book_ids = [link.book_id for link in links]

    books: list[BookBrief] = []
    if book_ids:
        book_rows = session.exec(
            select(Book).where(col(Book.id).in_(book_ids)).order_by(col(Book.title).asc())
        ).all()
        books = [_book_brief(b, session, user) for b in book_rows]

    return ApiResponse(
        success=True,
        message="Tag detail",
        data=TagDetail(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            book_count=len(books),
            books=books,
        ),
    )


# ---------------------------------------------------------------------------
# Series
# ---------------------------------------------------------------------------


@router.get("/series", response_model=ApiResponse[list[SeriesListItem]])
def list_series(
    search: Optional[str] = Query(None, description="Search series name"),
    session: Session = Depends(get_session),
) -> ApiResponse[list[SeriesListItem]]:
    statement = select(Series)

    if search:
        statement = statement.where(col(Series.name).ilike(f"%{search}%"))

    statement = statement.order_by(col(Series.name).asc())
    series_list = session.exec(statement).all()

    # Book counts
    series_ids = [s.id for s in series_list if s.id is not None]
    book_count_map: dict[int, int] = {}
    if series_ids:
        count_rows = session.exec(
            select(Book.series_id, func.count(Book.id))
            .where(col(Book.series_id).in_(series_ids))
            .group_by(Book.series_id)
        ).all()
        book_count_map = {row[0]: row[1] for row in count_rows}

    items = [
        SeriesListItem(
            id=s.id,
            name=s.name,
            description=s.description,
            total_count=s.total_count,
            book_count=book_count_map.get(s.id, 0),  # type: ignore[arg-type]
        )
        for s in series_list
    ]

    return ApiResponse(success=True, message="Series retrieved", data=items)


@router.get("/series/{series_id}", response_model=ApiResponse[SeriesDetail])
def get_series(
    series_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[SeriesDetail]:
    series = session.get(Series, series_id)
    if series is None:
        return ApiResponse(success=False, message="Series not found", data=None)

    # Books ordered by series_index
    book_rows = session.exec(
        select(Book)
        .where(Book.series_id == series_id)
        .order_by(col(Book.series_index).asc(), col(Book.title).asc())
    ).all()
    books = [_book_brief(b, session, user) for b in book_rows]

    return ApiResponse(
        success=True,
        message="Series detail",
        data=SeriesDetail(
            id=series.id,
            name=series.name,
            description=series.description,
            total_count=series.total_count,
            book_count=len(books),
            books=books,
        ),
    )


# ---------------------------------------------------------------------------
# Publishers
# ---------------------------------------------------------------------------


@router.get("/publishers", response_model=ApiResponse[list[PublisherListItem]])
def list_publishers(
    search: Optional[str] = Query(None, description="Search publisher name"),
    session: Session = Depends(get_session),
) -> ApiResponse[list[PublisherListItem]]:
    statement = select(Publisher)

    if search:
        statement = statement.where(col(Publisher.name).ilike(f"%{search}%"))

    statement = statement.order_by(col(Publisher.name).asc())
    publishers = session.exec(statement).all()

    # Book counts
    publisher_ids = [p.id for p in publishers if p.id is not None]
    book_count_map: dict[int, int] = {}
    if publisher_ids:
        count_rows = session.exec(
            select(Book.publisher_id, func.count(Book.id))
            .where(col(Book.publisher_id).in_(publisher_ids))
            .group_by(Book.publisher_id)
        ).all()
        book_count_map = {row[0]: row[1] for row in count_rows}

    items = [
        PublisherListItem(
            id=p.id,
            name=p.name,
            description=p.description,
            book_count=book_count_map.get(p.id, 0),  # type: ignore[arg-type]
        )
        for p in publishers
    ]

    return ApiResponse(success=True, message="Publishers retrieved", data=items)


@router.get("/publishers/{publisher_id}", response_model=ApiResponse[PublisherDetail])
def get_publisher(
    publisher_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[PublisherDetail]:
    publisher = session.get(Publisher, publisher_id)
    if publisher is None:
        return ApiResponse(success=False, message="Publisher not found", data=None)

    book_rows = session.exec(
        select(Book)
        .where(Book.publisher_id == publisher_id)
        .order_by(col(Book.title).asc())
    ).all()
    books = [_book_brief(b, session, user) for b in book_rows]

    return ApiResponse(
        success=True,
        message="Publisher detail",
        data=PublisherDetail(
            id=publisher.id,
            name=publisher.name,
            description=publisher.description,
            book_count=len(books),
            books=books,
        ),
    )


# ---------------------------------------------------------------------------
# Categories (tree)
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=ApiResponse[list[CategoryNode]])
def list_categories(
    session: Session = Depends(get_session),
) -> ApiResponse[list[CategoryNode]]:
    # Fetch all categories
    all_categories = session.exec(
        select(Category).order_by(col(Category.name).asc())
    ).all()

    # Book counts
    cat_ids = [c.id for c in all_categories if c.id is not None]
    book_count_map: dict[int, int] = {}
    if cat_ids:
        count_rows = session.exec(
            select(BookCategory.category_id, func.count(BookCategory.id))
            .where(col(BookCategory.category_id).in_(cat_ids))
            .group_by(BookCategory.category_id)
        ).all()
        book_count_map = {row[0]: row[1] for row in count_rows}

    # Build flat nodes
    nodes: dict[int | None, CategoryNode] = {}
    for cat in all_categories:
        if cat.id is not None:
            nodes[cat.id] = CategoryNode(
                id=cat.id,
                name=cat.name,
                parent_id=cat.parent_id,
                description=cat.description,
                book_count=book_count_map.get(cat.id, 0),
                children=[],
            )

    # Build tree: attach children to parents, collect roots
    root_nodes: list[CategoryNode] = []
    for node in nodes.values():
        if node.parent_id is not None and node.parent_id in nodes:
            nodes[node.parent_id].children.append(node)
        else:
            root_nodes.append(node)

    return ApiResponse(success=True, message="Categories retrieved", data=root_nodes)


# ---------------------------------------------------------------------------
# Unified search
# ---------------------------------------------------------------------------


@router.get("/search", response_model=ApiResponse[SearchResults])
def unified_search(
    q: str = Query(..., min_length=1, description="Search query"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[SearchResults]:
    pattern = f"%{q}%"

    # Search books by title
    book_rows = session.exec(
        select(Book)
        .where(col(Book.title).ilike(pattern))
        .limit(10)
    ).all()
    books = [_book_brief(b, session, user) for b in book_rows]

    # Search authors by name
    author_rows = session.exec(
        select(Author).where(col(Author.name).ilike(pattern)).limit(10)
    ).all()
    author_ids = [a.id for a in author_rows if a.id is not None]
    author_book_count: dict[int, int] = {}
    if author_ids:
        count_rows = session.exec(
            select(BookAuthor.author_id, func.count(BookAuthor.id))
            .where(col(BookAuthor.author_id).in_(author_ids))
            .group_by(BookAuthor.author_id)
        ).all()
        author_book_count = {row[0]: row[1] for row in count_rows}

    authors = [
        AuthorListItem(
            id=a.id,
            name=a.name,
            sort_name=a.sort_name,
            book_count=author_book_count.get(a.id, 0),  # type: ignore[arg-type]
        )
        for a in author_rows
    ]

    # Search tags by name
    tag_rows = session.exec(
        select(Tag).where(col(Tag.name).ilike(pattern)).limit(10)
    ).all()
    tag_ids = [t.id for t in tag_rows if t.id is not None]
    tag_book_count: dict[int, int] = {}
    if tag_ids:
        count_rows = session.exec(
            select(BookTag.tag_id, func.count(BookTag.id))
            .where(col(BookTag.tag_id).in_(tag_ids))
            .group_by(BookTag.tag_id)
        ).all()
        tag_book_count = {row[0]: row[1] for row in count_rows}

    tags = [
        TagListItem(
            id=t.id,
            name=t.name,
            color=t.color,
            book_count=tag_book_count.get(t.id, 0),  # type: ignore[arg-type]
        )
        for t in tag_rows
    ]

    return ApiResponse(
        success=True,
        message="Search results",
        data=SearchResults(books=books, authors=authors, tags=tags),
    )
