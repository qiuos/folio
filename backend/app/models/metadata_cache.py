from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class MetadataCache(SQLModel, table=True):
    __tablename__ = "metadata_cache"

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(max_length=50, index=True)
    query_key: str = Field(max_length=500, index=True)
    result_data: str = Field()  # JSON string
    expires_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
