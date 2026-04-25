from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MetadataResult:
    title: str | None = None
    authors: list[str] = field(default_factory=list)
    publisher: str | None = None
    pubdate: str | None = None
    isbn: str | None = None
    description: str | None = None
    cover_url: str | None = None
    rating: float | None = None
    page_count: int | None = None
    tags: list[str] = field(default_factory=list)
    source: str = ""
    confidence: float = 0.0


class MetadataProvider:
    async def fetch_by_isbn(self, isbn: str) -> MetadataResult | None:
        return None

    async def fetch_by_title(
        self, title: str, author: str | None = None
    ) -> list[MetadataResult]:
        return []

    @property
    def name(self) -> str:
        return ""
