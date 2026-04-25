from __future__ import annotations

import logging

import httpx

from app.services.metadata.base import MetadataProvider, MetadataResult

logger = logging.getLogger(__name__)


class GoogleBooksProvider(MetadataProvider):
    """Fetch metadata from Google Books API."""

    BASE_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "google_books"

    async def fetch_by_isbn(self, isbn: str) -> MetadataResult | None:
        params: dict[str, str] = {"q": f"isbn:{isbn}"}
        if self.api_key:
            params["key"] = self.api_key

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.warning("GoogleBooksProvider: failed to fetch by ISBN %s", isbn, exc_info=True)
            return None

        items = data.get("items") or []
        if not items:
            return None

        return self._parse_volume(items[0], confidence=0.95)

    async def fetch_by_title(
        self, title: str, author: str | None = None
    ) -> list[MetadataResult]:
        query = f"intitle:{title}"
        if author:
            query += f"+inauthor:{author}"

        params: dict[str, str] = {"q": query, "maxResults": "10"}
        if self.api_key:
            params["key"] = self.api_key

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(self.BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.warning(
                "GoogleBooksProvider: failed to fetch by title '%s'", title, exc_info=True
            )
            return []

        items = data.get("items") or []
        confidence = 0.8 if author else 0.6
        return [self._parse_volume(item, confidence=confidence) for item in items]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_volume(item: dict, confidence: float = 0.0) -> MetadataResult:
        info: dict = item.get("volumeInfo") or {}

        # Cover image – prefer larger thumbnails
        images: dict = info.get("imageLinks") or {}
        cover_url = (
            images.get("extraLarge")
            or images.get("large")
            or images.get("medium")
            or images.get("thumbnail")
            or images.get("smallThumbnail")
        )
        # Google returns http:// URLs; upgrade to https
        if cover_url and cover_url.startswith("http://"):
            cover_url = "https://" + cover_url[len("http://"):]

        # Rating – Google uses 1-5 scale, normalise to same scale
        rating = info.get("averageRating")

        # Extract ISBN identifiers
        isbn = None
        for ident in info.get("industryIdentifiers") or []:
            if ident.get("type") in ("ISBN_13", "ISBN_10"):
                isbn = ident.get("identifier")
                if ident["type"] == "ISBN_13":
                    break  # prefer ISBN-13

        # Tags from categories
        tags = info.get("categories") or []

        return MetadataResult(
            title=info.get("title"),
            authors=info.get("authors") or [],
            publisher=info.get("publisher"),
            pubdate=info.get("publishedDate"),
            isbn=isbn,
            description=info.get("description"),
            cover_url=cover_url,
            rating=rating,
            page_count=info.get("pageCount") or None,
            tags=tags,
            source="google_books",
            confidence=confidence,
        )
