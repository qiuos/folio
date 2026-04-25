from __future__ import annotations

import logging
import re

import httpx

from app.services.metadata.base import MetadataProvider, MetadataResult

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


class DoubanProvider(MetadataProvider):
    """Fetch metadata from Douban via web scraping.

    Douban has no public book API, so we scrape the search page.
    If scraping fails (blocked, rate-limited, layout change), we
    gracefully return ``None`` / empty list.
    """

    SEARCH_URL = "https://search.douban.com/book/subject_search"

    @property
    def name(self) -> str:
        return "douban"

    async def fetch_by_isbn(self, isbn: str) -> MetadataResult | None:
        return await self._search(isbn, confidence=0.85)

    async def fetch_by_title(
        self, title: str, author: str | None = None
    ) -> list[MetadataResult]:
        query = title
        if author:
            query = f"{title} {author}"
        result = await self._search(query, confidence=0.75)
        return [result] if result else []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _search(self, query: str, confidence: float) -> MetadataResult | None:
        params = {"search_text": query, "cat": "1001"}

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(self.SEARCH_URL, params=params, headers=_HEADERS)
                resp.raise_for_status()
                html = resp.text
        except Exception:
            logger.warning("DoubanProvider: search failed for '%s'", query, exc_info=True)
            return None

        return self._parse_search_page(html, confidence)

    @staticmethod
    def _parse_search_page(html: str, confidence: float) -> MetadataResult | None:
        # Douban search results embed book data in JSON inside a script tag.
        # We try to extract the first result from the ``window.__DATA__`` blob
        # that the page uses to render results client-side.
        data_match = re.search(r"window\.__DATA__\s*=\s*({.*?})\s*;?\s*</script>", html, re.DOTALL)
        if data_match:
            try:
                import json

                data = json.loads(data_match.group(1))
                items = data.get("items") or data.get("payload") or []
                if items and isinstance(items, list):
                    first = items[0] if isinstance(items[0], dict) else {}
                    title = first.get("title", "")
                    cover_url = first.get("cover_url", "")
                    rating_str = first.get("rating", "")
                    rating = float(rating_str) if rating_str else None
                    url = first.get("url", "")
                    abstract = first.get("abstract", "")

                    # Try to extract author from abstract or title
                    authors: list[str] = []
                    author_match = re.search(r"作者[：:]\s*([^/\n]+)", abstract)
                    if author_match:
                        authors = [a.strip() for a in author_match.group(1).split(",") if a.strip()]

                    return MetadataResult(
                        title=title or None,
                        authors=authors,
                        publisher=None,
                        pubdate=None,
                        isbn=None,
                        description=abstract or None,
                        cover_url=cover_url or None,
                        rating=rating,
                        page_count=None,
                        tags=[],
                        source="douban",
                        confidence=confidence,
                    )
            except Exception:
                logger.debug("DoubanProvider: failed to parse __DATA__ JSON", exc_info=True)

        # Fallback: try simple regex extraction from raw HTML
        title_match = re.search(
            r'<a[^>]+class="title-text"[^>]*>([^<]+)</a>', html
        )
        if not title_match:
            # Another common pattern for Douban search
            title_match = re.search(r'"title"\s*:\s*"([^"]+)"', html)

        if not title_match:
            return None

        title = title_match.group(1).strip()

        # Rating
        rating = None
        rating_match = re.search(r'"rating"\s*:\s*"?([0-9.]+)"?', html)
        if rating_match:
            try:
                rating = float(rating_match.group(1))
            except ValueError:
                pass

        # Cover
        cover_match = re.search(r'"cover_url"\s*:\s*"([^"]+)"', html)
        cover_url = cover_match.group(1) if cover_match else None

        return MetadataResult(
            title=title,
            authors=[],
            publisher=None,
            pubdate=None,
            isbn=None,
            description=None,
            cover_url=cover_url,
            rating=rating,
            page_count=None,
            tags=[],
            source="douban",
            confidence=confidence,
        )
