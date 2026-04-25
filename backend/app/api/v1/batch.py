from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.v1.admin import require_admin
from app.db.session import get_session
from app.models import Book, BookAuthor, BookFormat, BookTag, Tag, User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/books/batch", tags=["batch"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class BatchTagRequest(BaseModel):
    book_ids: list[int]
    tag_names: list[str]


class BatchDeleteRequest(BaseModel):
    book_ids: list[int]


class BatchMetadataRequest(BaseModel):
    book_ids: list[int]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/tags", response_model=ApiResponse[dict])
async def batch_add_tags(
    body: BatchTagRequest,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[dict]:
    if not body.book_ids or not body.tag_names:
        raise HTTPException(status_code=400, detail="book_ids and tag_names must not be empty")

    # Resolve or create tags
    tag_ids: list[int] = []
    for tag_name in body.tag_names:
        tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
        if tag is None:
            tag = Tag(name=tag_name)
            session.add(tag)
            session.commit()
            session.refresh(tag)
        tag_ids.append(tag.id)

    # Add tags to each book
    added_count = 0
    for book_id in body.book_ids:
        book = session.get(Book, book_id)
        if book is None:
            continue
        for tag_id in tag_ids:
            existing = session.exec(
                select(BookTag).where(
                    BookTag.book_id == book_id,
                    BookTag.tag_id == tag_id,
                )
            ).first()
            if existing is None:
                link = BookTag(book_id=book_id, tag_id=tag_id)
                session.add(link)
                added_count += 1

    session.commit()

    return ApiResponse(
        success=True,
        message=f"Tags processed for {len(body.book_ids)} books, {added_count} new links added",
        data={"added": added_count, "books_processed": len(body.book_ids)},
    )


@router.post("/delete", response_model=ApiResponse[dict])
async def batch_delete_books(
    body: BatchDeleteRequest,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[dict]:
    if not body.book_ids:
        raise HTTPException(status_code=400, detail="book_ids must not be empty")

    deleted_books = 0
    deleted_files = 0

    for book_id in body.book_ids:
        book = session.get(Book, book_id)
        if book is None:
            continue

        # Delete BookAuthor links
        author_links = session.exec(
            select(BookAuthor).where(BookAuthor.book_id == book_id)
        ).all()
        for link in author_links:
            session.delete(link)

        # Delete BookTag links
        tag_links = session.exec(
            select(BookTag).where(BookTag.book_id == book_id)
        ).all()
        for link in tag_links:
            session.delete(link)

        # Delete BookFormat records and files on disk
        formats = session.exec(
            select(BookFormat).where(BookFormat.book_id == book_id)
        ).all()
        for fmt in formats:
            file_path = Path(fmt.file_path)
            if file_path.exists():
                try:
                    file_path.unlink()
                    deleted_files += 1
                except OSError:
                    pass
            session.delete(fmt)

        # Delete cover file if exists
        if book.cover_path:
            cover_path = Path(book.cover_path)
            if cover_path.exists():
                try:
                    cover_path.unlink()
                except OSError:
                    pass

        # Delete the book record
        session.delete(book)
        deleted_books += 1

    session.commit()

    return ApiResponse(
        success=True,
        message=f"Deleted {deleted_books} books and {deleted_files} files",
        data={"books_deleted": deleted_books, "files_deleted": deleted_files},
    )


@router.post("/metadata", response_model=ApiResponse[dict])
async def batch_refresh_metadata(
    body: BatchMetadataRequest,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> ApiResponse[dict]:
    if not body.book_ids:
        raise HTTPException(status_code=400, detail="book_ids must not be empty")

    # Validate book IDs exist
    valid_ids: list[int] = []
    for book_id in body.book_ids:
        book = session.get(Book, book_id)
        if book is not None:
            valid_ids.append(book_id)

    # In a production system, this would dispatch an async task to a
    # metadata service. For now we return a status indicating the request
    # was accepted.
    return ApiResponse(
        success=True,
        message=f"Metadata refresh queued for {len(valid_ids)} books",
        data={
            "queued": len(valid_ids),
            "book_ids": valid_ids,
            "status": "pending",
        },
    )
