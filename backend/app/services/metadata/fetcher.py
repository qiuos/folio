from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Sequence

from sqlmodel import Session, select

from app.models.metadata_cache import MetadataCache
from app.services.metadata.base import MetadataProvider, MetadataResult

logger = logging.getLogger(__name__)

_CACHE_TTL_HOURS = 72
_PROVIDER_TIMEOUT = 8


class MetadataService:
    """Aggregates multiple :class:`MetadataProvider` instances."""

    def __init__(self, providers: Sequence[MetadataProvider]) -> None:
        self.providers = list(providers)

    async def fetch(
        self,
        isbn: str | None = None,
        title: str | None = None,
        author: str | None = None,
        session: Session | None = None,
    ) -> MetadataResult | None:
        candidates = await self.fetch_all(isbn=isbn, title=title, author=author, session=session)
        if not candidates:
            return None
        candidates.sort(key=lambda r: r.confidence, reverse=True)
        best = candidates[0]
        if session and best.title:
            self._cache_put(session, _cache_key(isbn=isbn, title=title, author=author), best)
        return best

    async def fetch_all(
        self,
        isbn: str | None = None,
        title: str | None = None,
        author: str | None = None,
        session: Session | None = None,
    ) -> list[MetadataResult]:
        results: list[MetadataResult] = []

        if session:
            cached = self._cache_get(session, isbn=isbn, title=title, author=author)
            if cached:
                results.append(cached)

        async def _query(provider: MetadataProvider) -> list[MetadataResult]:
            pr: list[MetadataResult] = []
            try:
                if isbn:
                    result = await asyncio.wait_for(
                        provider.fetch_by_isbn(isbn), timeout=_PROVIDER_TIMEOUT
                    )
                    if result:
                        pr.append(result)
                        return pr
                if title:
                    title_results = await asyncio.wait_for(
                        provider.fetch_by_title(title, author=author),
                        timeout=_PROVIDER_TIMEOUT,
                    )
                    pr.extend(title_results)
            except asyncio.TimeoutError:
                logger.warning("Provider %s timed out", provider.name)
            except Exception:
                logger.warning("Provider %s error", provider.name, exc_info=True)
            return pr

        tasks = [_query(p) for p in self.providers]
        all_results = await asyncio.gather(*tasks)
        for batch in all_results:
            results.extend(batch)

        seen: set[tuple[str, str]] = set()
        deduped: list[MetadataResult] = []
        for r in results:
            key = (r.source, (r.title or "").lower().strip())
            if key not in seen:
                seen.add(key)
                deduped.append(r)
        return deduped

    @staticmethod
    def _cache_get(session: Session, *, isbn: str | None, title: str | None, author: str | None) -> MetadataResult | None:
        key = _cache_key(isbn=isbn, title=title, author=author)
        stmt = select(MetadataCache).where(MetadataCache.query_key == key).order_by(MetadataCache.created_at.desc())
        row = session.exec(stmt).first()
        if row is None:
            return None
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            return None
        try:
            data = json.loads(row.result_data)
            return MetadataResult(**data)
        except Exception:
            return None

    @staticmethod
    def _cache_put(session: Session, key: str, result: MetadataResult) -> None:
        from dataclasses import asdict
        try:
            data = json.dumps(asdict(result), ensure_ascii=False)
            expires = datetime.now(timezone.utc) + timedelta(hours=_CACHE_TTL_HOURS)
            stmt = select(MetadataCache).where(MetadataCache.query_key == key)
            existing = session.exec(stmt).first()
            if existing:
                session.delete(existing)
            cache_row = MetadataCache(
                provider=result.source, query_key=key,
                result_data=data, expires_at=expires,
            )
            session.add(cache_row)
            session.commit()
        except Exception:
            logger.warning("Failed to write cache", exc_info=True)
            session.rollback()


def _cache_key(*, isbn: str | None, title: str | None, author: str | None) -> str:
    return "||".join([isbn or "", title or "", author or ""])
