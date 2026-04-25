from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    DATABASE_URL: str = "sqlite:///./data/folio.db"

    # Storage
    BOOKS_STORAGE_PATH: str = "./data/books"
    BOOK_IMPORT_PATH: str = "./import"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 525600  # 1 year
    REFRESH_TOKEN_EXPIRE_DAYS: int = 365

    # Admin
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"

    # Metadata
    METADATA_PROVIDERS: str = "google,openlibrary"
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100 MB
    ALLOWED_FORMATS: str = "epub,pdf,mobi,azw3,txt,fb2"

    # Logging
    LOG_LEVEL: str = "INFO"

    # OPDS
    OPDS_ENABLED: bool = True

    @property
    def allowed_formats_list(self) -> List[str]:
        return [fmt.strip().lower() for fmt in self.ALLOWED_FORMATS.split(",")]

    @property
    def metadata_providers_list(self) -> List[str]:
        return [p.strip().lower() for p in self.METADATA_PROVIDERS.split(",")]

    def ensure_directories(self) -> None:
        """Create required directories if they don't exist."""
        db_path = Path(self.DATABASE_URL.replace("sqlite:///", ""))
        if db_path.parent and not db_path.parent.exists():
            db_path.parent.mkdir(parents=True, exist_ok=True)

        storage_path = Path(self.BOOKS_STORAGE_PATH)
        if not storage_path.exists():
            storage_path.mkdir(parents=True, exist_ok=True)


settings = Settings()
