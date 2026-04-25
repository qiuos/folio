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


class ISBNCNProvider(MetadataProvider):
    """Fetch metadata from isbn.cn via page scraping.

    Only supports ISBN lookups (no title search).
    """

    BASE_URL = "https://isbn.cn/{isbn}"

    @property
    def name(self) -> str:
        return "isbn_cn"

    async def fetch_by_isbn(self, isbn: str) -> MetadataResult | None:
        url = self.BASE_URL.format(isbn=isbn)

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=_HEADERS)
                resp.raise_for_status()
                html = resp.text
        except Exception:
            logger.warning(
                "ISBNCNProvider: failed to fetch ISBN %s", isbn, exc_info=True
            )
            return None

        return self._parse_page(html, isbn)

    async def fetch_by_title(
        self, title: str, author: str | None = None
    ) -> list[MetadataResult]:
        # isbn.cn does not support title search
        return []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_page(html: str, isbn: str) -> MetadataResult | None:
        # Try to extract structured data from the page.
        # isbn.cn typically has book info in a definition list or table.

        title = _extract_meta(html, "title")
        if not title:
            # Fallback: grab from <title> tag and strip site name
            tag_match = re.search(r"<title>([^<]+)</title>", html)
            if tag_match:
                title = tag_match.group(1).split("-")[0].split("|")[0].strip()
        if not title:
            return None

        # Description
        description = _extract_meta(html, "description")

        # Author – look for common patterns
        authors: list[str] = []
        author_patterns = [
            r"作者[：:]\s*</span>\s*<[^>]*>\s*([^<]+)",
            r"作者[：:]\s*<[^>]*>\s*([^<]+)",
            r'"author"\s*:\s*"([^"]+)"',
            r"author.*?<[^>]*>\s*([^<]{2,50})<",
        ]
        for pat in author_patterns:
            m = re.search(pat, html)
            if m:
                authors = [a.strip() for a in re.split(r"[，、,]", m.group(1)) if a.strip()]
                if authors:
                    break

        # Publisher
        publisher = None
        pub_match = re.search(
            r"出版社[：:]\s*</span>\s*<[^>]*>\s*([^<]+)", html
        ) or re.search(r"出版社[：:]\s*<[^>]*>\s*([^<]+)", html)
        if pub_match:
            publisher = pub_match.group(1).strip()

        # Publish date
        pubdate = None
        date_match = re.search(
            r"出版日期[：:]\s*</span>\s*<[^>]*>\s*([^<]+)", html
        ) or re.search(r"出版日期[：:]\s*<[^>]*>\s*([^<]+)", html)
        if date_match:
            pubdate = date_match.group(1).strip()

        # Price (not needed, but page count might be nearby)
        page_count = None
        pages_match = re.search(r"页数[：:]\s*</span>\s*<[^>]*>\s*(\d+)", html) or re.search(
            r"页数[：:]\s*<[^>]*>\s*(\d+)", html
        )
        if pages_match:
            page_count = int(pages_match.group(1))

        # Cover image
        cover_url = None
        cover_match = re.search(r'<img[^>]+class="book-cover"[^>]+src="([^"]+)"', html)
        if not cover_match:
            cover_match = re.search(r'<img[^>]+src="([^"]+)"[^>]+class="book-cover"', html)
        if not cover_match:
            cover_match = re.search(r'"image"\s*:\s*"([^"]+)"', html)
        if cover_match:
            cover_url = cover_match.group(1)

        return MetadataResult(
            title=title,
            authors=authors,
            publisher=publisher,
            pubdate=pubdate,
            isbn=isbn,
            description=description,
            cover_url=cover_url,
            rating=None,
            page_count=page_count,
            tags=[],
            source="isbn_cn",
            confidence=0.9,
        )


def _extract_meta(html: str, name: str) -> str | None:
    """Extract content from <meta name="..." content="..."> tags."""
    m = re.search(
        rf'<meta\s+name="{name}"\s+content="([^"]*)"', html, re.IGNORECASE
    )
    if not m:
        m = re.search(
            rf'<meta\s+content="([^"]*)"\s+name="{name}"', html, re.IGNORECASE
        )
    return m.group(1).strip() or None if m else None
