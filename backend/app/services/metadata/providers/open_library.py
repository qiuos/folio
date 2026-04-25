from __future__ import annotations

import logging

import httpx

from app.services.metadata.base import MetadataProvider, MetadataResult

logger = logging.getLogger(__name__)


class OpenLibraryProvider(MetadataProvider):
    """Fetch metadata from Open Library API."""

    @property
    def name(self) -> str:
        return "open_library"

    async def fetch_by_isbn(self, isbn: str) -> MetadataResult | None:
        url = "https://openlibrary.org/api/books"
        params = {
            "bibkeys": f"ISBN:{isbn}",
            "format": "json",
            "jscmd": "data",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data: dict = resp.json()
        except Exception:
            logger.warning(
                "OpenLibraryProvider: failed to fetch by ISBN %s", isbn, exc_info=True
            )
            return None

        # The response is keyed by "ISBN:<isbn>"
        book_data = data.get(f"ISBN:{isbn}")
        if not book_data:
            return None

        return self._parse_isbn_result(book_data, isbn)

    async def fetch_by_title(
        self, title: str, author: str | None = None
    ) -> list[MetadataResult]:
        params: dict[str, str | int] = {"title": title, "limit": 10}
        if author:
            params["author"] = author

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://openlibrary.org/search.json", params=params
                )
                resp.raise_for_status()
                data: dict = resp.json()
        except Exception:
            logger.warning(
                "OpenLibraryProvider: failed to fetch by title '%s'", title, exc_info=True
            )
            return []

        docs = data.get("docs") or []
        results: list[MetadataResult] = []
        for doc in docs:
            results.append(self._parse_search_doc(doc))
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_isbn_result(data: dict, isbn: str) -> MetadataResult:
        # Authors
        authors = [a.get("name", "") for a in data.get("authors") or [] if a.get("name")]

        # Publishers
        publishers = data.get("publishers") or []
        publisher = publishers[0].get("name") if publishers else None

        # Cover
        cover = data.get("cover") or {}
        cover_url = cover.get("medium") or cover.get("large") or cover.get("small")

        # Publish date
        pubdate = data.get("publish_date")

        # Subjects -> tags
        subjects = data.get("subjects") or []
        tags = [s.get("name", "") for s in subjects if s.get("name")]

        # Number of pages
        page_count = data.get("number_of_pages")

        return MetadataResult(
            title=data.get("title"),
            authors=authors,
            publisher=publisher,
            pubdate=pubdate,
            isbn=isbn,
            description=None,  # not included in jscmd=data
            cover_url=cover_url,
            rating=None,
            page_count=page_count,
            tags=tags,
            source="open_library",
            confidence=0.9,
        )

    @staticmethod
    def _parse_search_doc(doc: dict) -> MetadataResult:
        # Authors
        author_names = doc.get("author_name") or []

        # Publisher
        publishers = doc.get("publisher") or []
        publisher = publishers[0] if publishers else None

        # Cover – Open Library uses cover_edition_key to build URL
        cover_id = doc.get("cover_i")
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None
        )

        # ISBN
        isbns = doc.get("isbn") or []
        isbn = isbns[0] if isbns else None

        # Tags from subject
        tags = doc.get("subject") or []

        # Page count
        page_count = doc.get("number_of_pages_median")

        # First publish year
        pubdate = str(doc["first_publish_year"]) if doc.get("first_publish_year") else None

        return MetadataResult(
            title=doc.get("title"),
            authors=author_names,
            publisher=publisher,
            pubdate=pubdate,
            isbn=isbn,
            description=None,
            cover_url=cover_url,
            rating=None,
            page_count=page_count,
            tags=tags,
            source="open_library",
            confidence=0.7,
        )
