from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.db.session import get_session
from app.models.book import Author, Book
from app.models.category import Category
from app.models.publisher import Publisher
from app.models.series import Series
from app.models.shelf import Shelf
from app.models.tag import Tag
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
async def get_stats(
    session: Session = Depends(get_session),
) -> ApiResponse:
    book_count = session.exec(select(func.count(Book.id))).one()
    author_count = session.exec(select(func.count(Author.id))).one()
    tag_count = session.exec(select(func.count(Tag.id))).one()
    series_count = session.exec(select(func.count(Series.id))).one()
    category_count = session.exec(select(func.count(Category.id))).one()
    publisher_count = session.exec(select(func.count(Publisher.id))).one()
    shelf_count = session.exec(select(func.count(Shelf.id))).one()

    return ApiResponse(
        success=True,
        message="Library statistics",
        data={
            "total_books": book_count,
            "total_authors": author_count,
            "total_tags": tag_count,
            "total_series": series_count,
            "total_categories": category_count,
            "total_publishers": publisher_count,
            "total_shelves": shelf_count,
        },
    )
