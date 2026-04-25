from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.core.exceptions import BadRequestException, NotFoundException
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor, BookFormat
from app.models.reading import ReadingProgress
from app.models.shelf import Shelf, ShelfItem
from app.models.user import User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/shelves", tags=["shelves"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ShelfCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None)
    is_public: bool = Field(default=False)


class ShelfUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None)
    is_public: bool | None = Field(default=None)
    sort_order: int | None = Field(default=None)


class ShelfResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_public: bool = False
    sort_order: int = 0
    book_count: int = 0
    created_at: str
    updated_at: str


class ShelfBookAdd(BaseModel):
    book_id: int
    sort_order: int | None = Field(default=0)
    note: str | None = Field(default=None)


class ShelfBookItem(BaseModel):
    id: int
    book_id: int
    title: str | None = None
    cover_path: str | None = None
    authors: list[str] = []
    progress: float | None = None
    sort_order: int = 0
    added_at: str
    note: str | None = None


class ShelfDetailResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_public: bool = False
    sort_order: int = 0
    books: list[ShelfBookItem] = []
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# List shelves
# ---------------------------------------------------------------------------


@router.get("", response_model=ApiResponse[list[ShelfResponse]])
async def list_shelves(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[list[ShelfResponse]]:
    shelves = session.exec(
        select(Shelf)
        .where(Shelf.user_id == user.id)
        .order_by(col(Shelf.sort_order).asc(), col(Shelf.created_at).desc())
    ).all()

    result = []
    for shelf in shelves:
        count = len(
            session.exec(
                select(ShelfItem).where(ShelfItem.shelf_id == shelf.id)
            ).all()
        )
        result.append(
            ShelfResponse(
                id=shelf.id,
                name=shelf.name,
                description=shelf.description,
                is_public=shelf.is_public,
                sort_order=shelf.sort_order,
                book_count=count,
                created_at=shelf.created_at.isoformat() if shelf.created_at else "",
                updated_at=shelf.updated_at.isoformat() if shelf.updated_at else "",
            )
        )

    return ApiResponse(success=True, message="Shelves retrieved", data=result)


# ---------------------------------------------------------------------------
# Create shelf
# ---------------------------------------------------------------------------


@router.post("", response_model=ApiResponse[ShelfResponse])
async def create_shelf(
    body: ShelfCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[ShelfResponse]:
    shelf = Shelf(
        user_id=user.id,
        name=body.name,
        description=body.description,
        is_public=body.is_public,
    )
    session.add(shelf)
    session.commit()
    session.refresh(shelf)

    return ApiResponse(
        success=True,
        message="Shelf created",
        data=ShelfResponse(
            id=shelf.id,
            name=shelf.name,
            description=shelf.description,
            is_public=shelf.is_public,
            sort_order=shelf.sort_order,
            book_count=0,
            created_at=shelf.created_at.isoformat() if shelf.created_at else "",
            updated_at=shelf.updated_at.isoformat() if shelf.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# Get shelf with books
# ---------------------------------------------------------------------------


@router.get("/{shelf_id}", response_model=ApiResponse[ShelfDetailResponse])
async def get_shelf(
    shelf_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[ShelfDetailResponse]:
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")
    if shelf.user_id != user.id and not shelf.is_public:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")

    items = session.exec(
        select(ShelfItem)
        .where(ShelfItem.shelf_id == shelf_id)
        .order_by(col(ShelfItem.sort_order).asc(), col(ShelfItem.added_at).asc())
    ).all()

    book_items = []
    for item in items:
        book = session.get(Book, item.book_id)
        author_names = []
        if book:
            author_links = session.exec(
                select(BookAuthor).where(BookAuthor.book_id == book.id)
            ).all()
            for al in author_links:
                author = session.get(Author, al.author_id)
                if author:
                    author_names.append(author.name)
        progress = session.exec(
            select(ReadingProgress).where(
                ReadingProgress.user_id == user.id,
                ReadingProgress.book_id == item.book_id,
            )
        ).first()
        book_items.append(
            ShelfBookItem(
                id=item.id,
                book_id=item.book_id,
                title=book.title if book else None,
                cover_path=book.cover_path if book else None,
                authors=author_names,
                progress=progress.progress if progress else None,
                sort_order=item.sort_order,
                added_at=item.added_at.isoformat() if item.added_at else "",
                note=item.note,
            )
        )

    return ApiResponse(
        success=True,
        message="Shelf detail",
        data=ShelfDetailResponse(
            id=shelf.id,
            name=shelf.name,
            description=shelf.description,
            is_public=shelf.is_public,
            sort_order=shelf.sort_order,
            books=book_items,
            created_at=shelf.created_at.isoformat() if shelf.created_at else "",
            updated_at=shelf.updated_at.isoformat() if shelf.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# Update shelf
# ---------------------------------------------------------------------------


@router.put("/{shelf_id}", response_model=ApiResponse[ShelfResponse])
async def update_shelf(
    shelf_id: int,
    body: ShelfUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[ShelfResponse]:
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")
    if shelf.user_id != user.id:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")

    if body.name is not None:
        shelf.name = body.name
    if body.description is not None:
        shelf.description = body.description
    if body.is_public is not None:
        shelf.is_public = body.is_public
    if body.sort_order is not None:
        shelf.sort_order = body.sort_order

    shelf.updated_at = datetime.now(timezone.utc)
    session.add(shelf)
    session.commit()
    session.refresh(shelf)

    count = len(
        session.exec(
            select(ShelfItem).where(ShelfItem.shelf_id == shelf.id)
        ).all()
    )

    return ApiResponse(
        success=True,
        message="Shelf updated",
        data=ShelfResponse(
            id=shelf.id,
            name=shelf.name,
            description=shelf.description,
            is_public=shelf.is_public,
            sort_order=shelf.sort_order,
            book_count=count,
            created_at=shelf.created_at.isoformat() if shelf.created_at else "",
            updated_at=shelf.updated_at.isoformat() if shelf.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# Delete shelf
# ---------------------------------------------------------------------------


@router.delete("/{shelf_id}", response_model=ApiResponse[dict])
async def delete_shelf(
    shelf_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")
    if shelf.user_id != user.id:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")

    # Delete all items first
    items = session.exec(
        select(ShelfItem).where(ShelfItem.shelf_id == shelf_id)
    ).all()
    for item in items:
        session.delete(item)

    session.delete(shelf)
    session.commit()

    return ApiResponse(success=True, message="Shelf deleted", data={"shelf_id": shelf_id})


# ---------------------------------------------------------------------------
# Add book to shelf
# ---------------------------------------------------------------------------


@router.post("/{shelf_id}/books", response_model=ApiResponse[dict])
async def add_book_to_shelf(
    shelf_id: int,
    body: ShelfBookAdd,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")
    if shelf.user_id != user.id:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")

    book = session.get(Book, body.book_id)
    if book is None:
        raise NotFoundException(message=f"Book {body.book_id} not found")

    # Check for duplicate
    existing = session.exec(
        select(ShelfItem).where(
            ShelfItem.shelf_id == shelf_id,
            ShelfItem.book_id == body.book_id,
        )
    ).first()
    if existing:
        raise BadRequestException(message="Book already in shelf")

    item = ShelfItem(
        shelf_id=shelf_id,
        book_id=body.book_id,
        sort_order=body.sort_order or 0,
        note=body.note,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    return ApiResponse(
        success=True,
        message="Book added to shelf",
        data={"shelf_id": shelf_id, "book_id": body.book_id, "item_id": item.id},
    )


# ---------------------------------------------------------------------------
# Remove book from shelf
# ---------------------------------------------------------------------------


@router.delete("/{shelf_id}/books/{book_id}", response_model=ApiResponse[dict])
async def remove_book_from_shelf(
    shelf_id: int,
    book_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")
    if shelf.user_id != user.id:
        raise NotFoundException(message=f"Shelf {shelf_id} not found")

    item = session.exec(
        select(ShelfItem).where(
            ShelfItem.shelf_id == shelf_id,
            ShelfItem.book_id == book_id,
        )
    ).first()
    if item is None:
        raise NotFoundException(
            message=f"Book {book_id} not found in shelf {shelf_id}"
        )

    session.delete(item)
    session.commit()

    return ApiResponse(
        success=True,
        message="Book removed from shelf",
        data={"shelf_id": shelf_id, "book_id": book_id},
    )
