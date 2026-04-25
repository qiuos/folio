from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func, text

from app.core.exceptions import NotFoundException
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Book
from app.models.reading import ReadingProgress, ReadingSession
from app.models.user import User
from app.schemas.response import ApiResponse

router = APIRouter(prefix="/reading", tags=["reading"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ReadingProgressUpdate(BaseModel):
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    current_chapter: str | None = Field(default=None, max_length=255)
    current_position: str | None = Field(default=None, max_length=255)
    format_id: int | None = Field(default=None)
    device_info: str | None = Field(default=None, max_length=255)


class ReadingProgressResponse(BaseModel):
    id: int
    user_id: int
    book_id: int
    format_id: int | None = None
    progress: float
    current_chapter: str | None = None
    current_position: str | None = None
    device_info: str | None = None
    last_read_at: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ReadingProgressListItem(BaseModel):
    id: int
    book_id: int
    book_title: str | None = None
    format_id: int | None = None
    progress: float
    current_chapter: str | None = None
    current_position: str | None = None
    last_read_at: str


# ---------------------------------------------------------------------------
# GET /reading - list all reading progress for current user
# ---------------------------------------------------------------------------


@router.get("", response_model=ApiResponse[list[ReadingProgressListItem]])
async def list_reading_progress(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[list[ReadingProgressListItem]]:
    rows = session.exec(
        select(ReadingProgress)
        .where(ReadingProgress.user_id == user.id)
        .order_by(ReadingProgress.last_read_at.desc())
    ).all()

    items = []
    for row in rows:
        book = session.get(Book, row.book_id)
        items.append(
            ReadingProgressListItem(
                id=row.id,
                book_id=row.book_id,
                book_title=book.title if book else None,
                format_id=row.format_id,
                progress=row.progress,
                current_chapter=row.current_chapter,
                current_position=row.current_position,
                last_read_at=row.last_read_at.isoformat() if row.last_read_at else "",
            )
        )

    return ApiResponse(success=True, message="Reading progress list", data=items)


# ---------------------------------------------------------------------------
# GET /reading/stats - reading statistics for current user
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=ApiResponse)
async def get_reading_stats(
    tz: int = 8,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse:
    """Get reading statistics for current user. tz is the timezone offset in hours (e.g., 8 for UTC+8)."""
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc + timedelta(hours=tz)

    def period_stats(start_local: datetime):
        # Convert local start to UTC for database query
        start_utc = start_local - timedelta(hours=tz)

        # Books: prefer ReadingSession (accurate), fall back to ReadingProgress
        books = session.exec(
            select(func.count(func.distinct(ReadingSession.book_id))).where(
                ReadingSession.user_id == user.id,
                ReadingSession.created_at >= start_utc,
            )
        ).one()
        if books == 0:
            books = session.exec(
                select(func.count(ReadingProgress.id)).where(
                    ReadingProgress.user_id == user.id,
                    ReadingProgress.last_read_at >= start_utc,
                )
            ).one()

        # Completed
        completed = session.exec(
            select(func.count(func.distinct(ReadingSession.book_id))).where(
                ReadingSession.user_id == user.id,
                ReadingSession.created_at >= start_utc,
                ReadingSession.progress >= 0.99,
            )
        ).one()
        if completed == 0:
            completed = session.exec(
                select(func.count(ReadingProgress.id)).where(
                    ReadingProgress.user_id == user.id,
                    ReadingProgress.last_read_at >= start_utc,
                    ReadingProgress.progress >= 0.99,
                )
            ).one()

        # Minutes: prefer sessions, fall back to progress estimate
        session_count = session.exec(
            select(func.count(ReadingSession.id)).where(
                ReadingSession.user_id == user.id,
                ReadingSession.created_at >= start_utc,
            )
        ).one()
        if session_count > 0:
            minutes = int(session_count)
        else:
            total_progress = session.exec(
                select(func.sum(ReadingProgress.progress)).where(
                    ReadingProgress.user_id == user.id,
                    ReadingProgress.last_read_at >= start_utc,
                )
            ).one() or 0.0
            minutes = max(int(total_progress * 100 * 3), 1) if total_progress > 0 else 0

        return {"books": books, "completed": completed, "minutes": minutes}

    today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start_local = today_start_local - timedelta(days=now_local.weekday())
    month_start_local = today_start_local.replace(day=1)
    year_start_local = today_start_local.replace(month=1, day=1)

    total_books = session.exec(
        select(func.count(func.distinct(ReadingProgress.book_id))).where(
            ReadingProgress.user_id == user.id,
        )
    ).one()

    return ApiResponse(
        success=True,
        message="Reading stats",
        data={
            "total_books": total_books,
            "today": period_stats(today_start_local),
            "week": period_stats(week_start_local),
            "month": period_stats(month_start_local),
            "year": period_stats(year_start_local),
        },
    )


# ---------------------------------------------------------------------------
# GET /reading/{book_id} - get progress for a specific book
# ---------------------------------------------------------------------------


@router.get("/{book_id}", response_model=ApiResponse[ReadingProgressResponse])
async def get_reading_progress(
    book_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[ReadingProgressResponse]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    progress = session.exec(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == book_id,
        )
    ).first()

    if progress is None:
        raise NotFoundException(
            message=f"No reading progress for book {book_id}"
        )

    return ApiResponse(
        success=True,
        message="Reading progress",
        data=ReadingProgressResponse(
            id=progress.id,
            user_id=progress.user_id,
            book_id=progress.book_id,
            format_id=progress.format_id,
            progress=progress.progress,
            current_chapter=progress.current_chapter,
            current_position=progress.current_position,
            device_info=progress.device_info,
            last_read_at=progress.last_read_at.isoformat() if progress.last_read_at else "",
            created_at=progress.created_at.isoformat() if progress.created_at else "",
            updated_at=progress.updated_at.isoformat() if progress.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# PUT /reading/{book_id} - update reading progress (upsert)
# ---------------------------------------------------------------------------


@router.put("/{book_id}", response_model=ApiResponse[ReadingProgressResponse])
async def update_reading_progress(
    book_id: int,
    body: ReadingProgressUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[ReadingProgressResponse]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    progress = session.exec(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == book_id,
        )
    ).first()

    now = datetime.now(timezone.utc)

    if progress is None:
        progress = ReadingProgress(
            user_id=user.id,
            book_id=book_id,
            format_id=body.format_id,
            progress=body.progress,
            current_chapter=body.current_chapter,
            current_position=body.current_position,
            device_info=body.device_info,
            last_read_at=now,
        )
        session.add(progress)
    else:
        if body.format_id is not None:
            progress.format_id = body.format_id
        progress.progress = body.progress
        if body.current_chapter is not None:
            progress.current_chapter = body.current_chapter
        if body.current_position is not None:
            progress.current_position = body.current_position
        if body.device_info is not None:
            progress.device_info = body.device_info
        progress.last_read_at = now
        progress.updated_at = now
        session.add(progress)

    session.commit()
    session.refresh(progress)

    # Log reading session for stats tracking
    # Only create a session log if the last one was at least 60 seconds ago
    last_session = session.exec(
        select(ReadingSession)
        .where(ReadingSession.user_id == user.id)
        .order_by(ReadingSession.created_at.desc())
    ).first()

    should_log = True
    if last_session:
        session_time = last_session.created_at
        if session_time.tzinfo is None:
            session_time = session_time.replace(tzinfo=timezone.utc)
        if (now - session_time).total_seconds() < 60:
            should_log = False

    if should_log:
        session_progress = max(body.progress, 0.001)
        session_log = ReadingSession(
            user_id=user.id,
            book_id=book_id,
            progress=session_progress,
            created_at=now,
        )
        session.add(session_log)
        session.commit()

    return ApiResponse(
        success=True,
        message="Reading progress updated",
        data=ReadingProgressResponse(
            id=progress.id,
            user_id=progress.user_id,
            book_id=progress.book_id,
            format_id=progress.format_id,
            progress=progress.progress,
            current_chapter=progress.current_chapter,
            current_position=progress.current_position,
            device_info=progress.device_info,
            last_read_at=progress.last_read_at.isoformat() if progress.last_read_at else "",
            created_at=progress.created_at.isoformat() if progress.created_at else "",
            updated_at=progress.updated_at.isoformat() if progress.updated_at else "",
        ),
    )


# ---------------------------------------------------------------------------
# GET /reading/stats/ranking - book ranking by reading time
# ---------------------------------------------------------------------------


@router.get("/stats/ranking", response_model=ApiResponse)
async def get_reading_ranking(
    period: str = "month",
    tz: int = 8,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse:
    """Get book ranking by reading time for a specific period. tz is the timezone offset in hours (e.g., 8 for UTC+8)."""
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc + timedelta(hours=tz)

    if period == "today":
        start = now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=tz)
    elif period == "week":
        start = (now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now_local.weekday())) - timedelta(hours=tz)
    elif period == "month":
        start = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=tz)
    elif period == "year":
        start = now_local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=tz)
    else:
        start = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=tz)

    # Prefer ReadingSession, fall back to ReadingProgress
    query = (
        select(
            ReadingSession.book_id,
            Book.title,
            Book.cover_path,
            func.count(ReadingSession.id).label("session_count"),
            func.max(ReadingSession.progress).label("progress"),
        )
        .join(Book, ReadingSession.book_id == Book.id)
        .where(
            ReadingSession.user_id == user.id,
            ReadingSession.created_at >= start,
        )
        .group_by(ReadingSession.book_id, Book.id, Book.title, Book.cover_path)
    )

    results = session.exec(query).all()

    ranking = []
    for row in results:
        minutes = int(row.session_count or 0)
        ranking.append({
            "book_id": row.book_id,
            "title": row.title,
            "cover_path": row.cover_path,
            "minutes": minutes,
            "session_count": row.session_count,
            "progress": row.progress,
        })

    # Fall back to ReadingProgress if no session data
    if not ranking:
        query = (
            select(
                ReadingProgress.book_id,
                Book.title,
                Book.cover_path,
                ReadingProgress.progress,
            )
            .join(Book, ReadingProgress.book_id == Book.id)
            .where(
                ReadingProgress.user_id == user.id,
                ReadingProgress.last_read_at >= start,
            )
        )
        results = session.exec(query).all()
        for row in results:
            minutes = int((row.progress or 0) * 100 * 3)
            ranking.append({
                "book_id": row.book_id,
                "title": row.title,
                "cover_path": row.cover_path,
                "minutes": minutes,
                "session_count": 0,
                "progress": row.progress,
            })

    ranking.sort(key=lambda x: x["minutes"], reverse=True)
    ranking = ranking[:10]

    return ApiResponse(
        success=True,
        message="Reading ranking",
        data=ranking,
    )


# ---------------------------------------------------------------------------
# GET /reading/stats/heatmap - daily reading heatmap data
# ---------------------------------------------------------------------------


@router.get("/stats/heatmap", response_model=ApiResponse)
async def get_reading_heatmap(
    year: int | None = None,
    tz: int = 8,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse:
    """Get daily reading heatmap data for a year. tz is the timezone offset in hours (e.g., 8 for UTC+8)."""
    now = datetime.now(timezone.utc)
    target_year = year or (now + timedelta(hours=tz)).year

    # Adjust year boundaries to account for timezone offset
    # For UTC+8, local midnight Jan 1 is 4pm UTC Dec 31, so we need to extend the range
    year_start = datetime(target_year, 1, 1, tzinfo=timezone.utc) - timedelta(hours=tz)
    year_end = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc) + timedelta(hours=abs(tz))

    tz_modifier = f"+{tz} hours" if tz >= 0 else f"{tz} hours"

    # Try ReadingSession first
    # Use raw SQL to handle timezone conversion properly
    query_sql = f"""
        SELECT date(datetime(created_at, '{tz_modifier}')) as date, COUNT(*) as count
        FROM reading_sessions
        WHERE user_id = :user_id
          AND created_at >= :year_start
          AND created_at < :year_end
        GROUP BY date(datetime(created_at, '{tz_modifier}'))
    """
    results = session.execute(
        text(query_sql),
        {"user_id": user.id, "year_start": year_start, "year_end": year_end}
    ).all()

    # Fall back to ReadingProgress if no session data
    if not results:
        query_sql = f"""
            SELECT date(datetime(last_read_at, '{tz_modifier}')) as date, MAX(CAST(SUM(progress) * 100 * 3 AS INTEGER), 1) as count
            FROM reading_progress
            WHERE user_id = :user_id
              AND last_read_at >= :year_start
              AND last_read_at < :year_end
            GROUP BY date(datetime(last_read_at, '{tz_modifier}'))
        """
        results = session.execute(
            text(query_sql),
            {"user_id": user.id, "year_start": year_start, "year_end": year_end}
        ).all()

    heatmap = {}
    for row in results:
        date_str = str(row.date)
        minutes = int(row.count or 0)
        if minutes >= 60:
            level = 4
        elif minutes >= 30:
            level = 3
        elif minutes >= 10:
            level = 2
        elif minutes >= 1:
            level = 1
        else:
            level = 0
        heatmap[date_str] = {"level": level, "minutes": minutes}

    return ApiResponse(
        success=True,
        message="Reading heatmap",
        data={
            "year": target_year,
            "heatmap": heatmap,
        },
    )


# ---------------------------------------------------------------------------
# GET /reading/stats/chart - reading statistics chart data
# ---------------------------------------------------------------------------


@router.get("/stats/chart", response_model=ApiResponse)
async def get_reading_chart(
    period: str = "today",
    tz: int = 8,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse:
    """Get reading statistics chart data for a specific period. tz is the timezone offset in hours (e.g., 8 for UTC+8)."""
    import calendar
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc + timedelta(hours=tz)

    # Calculate period start in local time
    if period == "today":
        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        today_str = start_local.strftime("%Y-%m-%d")
    elif period == "week":
        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now_local.weekday())
        week_start_str = start_local.strftime("%Y-%m-%d")
    elif period == "month":
        start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_str = start_local.strftime("%Y-%m")
        days_in_month = calendar.monthrange(start_local.year, start_local.month)[1]
    elif period == "year":
        start_local = now_local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        year_str = start_local.strftime("%Y")
    else:
        start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_str = start_local.strftime("%Y-%m")

    tz_modifier = f"+{tz} hours" if tz >= 0 else f"{tz} hours"

    chart_data = []

    if period == "today":
        # Hourly data for today (0-23 hours)
        query_sql = f"""
            SELECT strftime('%H', datetime(created_at, '{tz_modifier}')) as hour, COUNT(*) as count
            FROM reading_sessions
            WHERE user_id = :user_id
              AND date(datetime(created_at, '{tz_modifier}')) = :today_str
            GROUP BY hour
            ORDER BY hour
        """
        results = session.execute(
            text(query_sql),
            {"user_id": user.id, "today_str": today_str}
        ).all()

        hour_counts = {int(r[0]): r[1] for r in results}
        if not hour_counts:
            query_sql = f"""
                SELECT strftime('%H', datetime(last_read_at, '{tz_modifier}')) as hour, MAX(CAST(progress * 100 * 3 AS INTEGER), 1) as count
                FROM reading_progress
                WHERE user_id = :user_id
                  AND date(datetime(last_read_at, '{tz_modifier}')) = :today_str
                GROUP BY hour
            """
            fallback_results = session.execute(text(query_sql), {"user_id": user.id, "today_str": today_str}).all()
            for r in fallback_results:
                hr = int(r[0])
                hour_counts[hr] = hour_counts.get(hr, 0) + r[1]

        for hour in range(24):
            chart_data.append({
                "label": f"{hour}:00",
                "value": int(hour_counts.get(hour, 0))
            })

    elif period == "week":
        # Daily data for this week (Mon-Sun)
        query_sql = f"""
            SELECT strftime('%w', datetime(created_at, '{tz_modifier}')) as dow, COUNT(*) as count
            FROM reading_sessions
            WHERE user_id = :user_id
              AND date(datetime(created_at, '{tz_modifier}')) >= :week_start_str
            GROUP BY dow
            ORDER BY dow
        """
        results = session.execute(
            text(query_sql),
            {"user_id": user.id, "week_start_str": week_start_str}
        ).all()

        dow_names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
        dow_counts = {int(r[0]): r[1] for r in results}
        if not dow_counts:
            query_sql = f"""
                SELECT strftime('%w', datetime(last_read_at, '{tz_modifier}')) as dow, MAX(CAST(progress * 100 * 3 AS INTEGER), 1) as count
                FROM reading_progress
                WHERE user_id = :user_id
                  AND date(datetime(last_read_at, '{tz_modifier}')) >= :week_start_str
                GROUP BY dow
            """
            fallback_results = session.execute(text(query_sql), {"user_id": user.id, "week_start_str": week_start_str}).all()
            for r in fallback_results:
                dw = int(r[0])
                dow_counts[dw] = dow_counts.get(dw, 0) + r[1]

        for dow in range(7):
            chart_data.append({
                "label": dow_names[dow],
                "value": int(dow_counts.get(dow, 0))
            })

    elif period == "month":
        # Daily data for this month
        query_sql = f"""
            SELECT strftime('%d', datetime(created_at, '{tz_modifier}')) as day, COUNT(*) as count
            FROM reading_sessions
            WHERE user_id = :user_id
              AND strftime('%Y-%m', datetime(created_at, '{tz_modifier}')) = :month_str
            GROUP BY day
            ORDER BY day
        """
        results = session.execute(
            text(query_sql),
            {"user_id": user.id, "month_str": month_str}
        ).all()

        day_counts = {int(r[0]): r[1] for r in results}
        if not day_counts:
            query_sql = f"""
                SELECT strftime('%d', datetime(last_read_at, '{tz_modifier}')) as day, MAX(CAST(progress * 100 * 3 AS INTEGER), 1) as count
                FROM reading_progress
                WHERE user_id = :user_id
                  AND strftime('%Y-%m', datetime(last_read_at, '{tz_modifier}')) = :month_str
                GROUP BY day
            """
            fallback_results = session.execute(text(query_sql), {"user_id": user.id, "month_str": month_str}).all()
            for r in fallback_results:
                dy = int(r[0])
                day_counts[dy] = day_counts.get(dy, 0) + r[1]

        for day in range(1, days_in_month + 1):
            chart_data.append({
                "label": f"{day}日",
                "value": int(day_counts.get(day, 0))
            })

    elif period == "year":
        # Monthly data for this year (1-12 months)
        query_sql = f"""
            SELECT strftime('%m', datetime(created_at, '{tz_modifier}')) as month, COUNT(*) as count
            FROM reading_sessions
            WHERE user_id = :user_id
              AND strftime('%Y', datetime(created_at, '{tz_modifier}')) = :year_str
            GROUP BY month
            ORDER BY month
        """
        results = session.execute(
            text(query_sql),
            {"user_id": user.id, "year_str": year_str}
        ).all()

        month_counts = {int(r[0]): r[1] for r in results}
        if not month_counts:
            query_sql = f"""
                SELECT strftime('%m', datetime(last_read_at, '{tz_modifier}')) as month, MAX(CAST(progress * 100 * 3 AS INTEGER), 1) as count
                FROM reading_progress
                WHERE user_id = :user_id
                  AND strftime('%Y', datetime(last_read_at, '{tz_modifier}')) = :year_str
                GROUP BY month
            """
            fallback_results = session.execute(text(query_sql), {"user_id": user.id, "year_str": year_str}).all()
            for r in fallback_results:
                mo = int(r[0])
                month_counts[mo] = month_counts.get(mo, 0) + r[1]

        for month in range(1, 13):
            chart_data.append({
                "label": f"{month}月",
                "value": int(month_counts.get(month, 0))
            })

    # Debug logging
    import sys
    sys.stdout.write(f"[DEBUG] Chart data for period={period}, tz={tz}, user_id={user.id}\n")
    sys.stdout.write(f"[DEBUG] chart_data length: {len(chart_data)}\n")
    sys.stdout.write(f"[DEBUG] chart_data sample: {chart_data[:3] if chart_data else 'empty'}\n")
    sys.stdout.write(f"[DEBUG] Non-zero items: {[(d['label'], d['value']) for d in chart_data if d['value'] > 0]}\n")
    sys.stdout.flush()

    return ApiResponse(
        success=True,
        message="Reading chart data",
        data={
            "period": period,
            "chart_data": chart_data,
        },
    )
