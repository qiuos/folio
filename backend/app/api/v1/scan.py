from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session, select

from app.config import settings
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor, BookFormat
from app.models.user import User
from app.schemas.response import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scan", tags=["scan"])

MIME_TYPES: dict[str, str] = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "mobi": "application/x-mobipocket-ebook",
    "azw3": "application/vnd.amazon.mobi8-ebook",
    "txt": "text/plain",
    "fb2": "application/x-fictionbook+xml",
}


def _extract_epub_metadata(file_path: str, book_id: Optional[int] = None) -> dict:
    """Extract title, author, description and cover from EPUB OPF metadata."""
    try:
        import zipfile
        from xml.etree import ElementTree

        with zipfile.ZipFile(file_path, "r") as zf:
            container_xml = zf.read("META-INF/container.xml")
            container_root = ElementTree.fromstring(container_xml)
            ns = {"cn": "urn:oasis:names:tc:opendocument:xmlns:container"}
            rootfile_el = container_root.find(".//cn:rootfile", ns)
            if rootfile_el is None:
                return {}
            opf_path = rootfile_el.get("full-path", "")
            opf_dir = str(Path(opf_path).parent)
            opf_content = zf.read(opf_path)
            opf_root = ElementTree.fromstring(opf_content)

            dc_ns = {"dc": "http://purl.org/dc/elements/1.1/"}
            title_el = opf_root.find(".//dc:title", dc_ns)
            creator_el = opf_root.find(".//dc:creator", dc_ns)
            language_el = opf_root.find(".//dc:language", dc_ns)
            description_el = opf_root.find(".//dc:description", dc_ns)

            result = {}
            if title_el is not None and title_el.text:
                result["title"] = title_el.text.strip()
            if creator_el is not None and creator_el.text:
                result["author"] = creator_el.text.strip()
            if language_el is not None and language_el.text:
                result["language"] = language_el.text.strip()
            if description_el is not None and description_el.text:
                result["description"] = description_el.text.strip()

            # Extract cover image
            cover_href = None
            opf_ns = "http://www.idpf.org/2007/opf"
            meta_cover = opf_root.find(f".//{{{opf_ns}}}meta[@name='cover']")
            if meta_cover is not None:
                cover_id = meta_cover.get("content", "")
                manifest_item = opf_root.find(f".//{{{opf_ns}}}item[@id='{cover_id}']")
                if manifest_item is not None:
                    cover_href = manifest_item.get("href", "")
            if not cover_href:
                for item in opf_root.findall(f".//{{{opf_ns}}}item"):
                    if "cover-image" in item.get("properties", ""):
                        cover_href = item.get("href", "")
                        break
            if not cover_href:
                for item in opf_root.findall(f".//{{{opf_ns}}}item"):
                    item_id = (item.get("id") or "").lower()
                    media_type = item.get("media-type", "")
                    if "cover" in item_id and media_type.startswith("image/"):
                        cover_href = item.get("href", "")
                        break

            if cover_href and book_id:
                import urllib.parse
                cover_path_in_zip = urllib.parse.unquote(cover_href)
                if opf_dir and opf_dir != ".":
                    cover_path_in_zip = f"{opf_dir}/{cover_path_in_zip}"
                cover_data = None
                if cover_path_in_zip in zf.namelist():
                    cover_data = zf.read(cover_path_in_zip)
                else:
                    cover_lower = cover_path_in_zip.lower()
                    for name in zf.namelist():
                        if name.lower() == cover_lower:
                            cover_data = zf.read(name)
                            break
                if cover_data:
                    ext = Path(cover_path_in_zip).suffix or ".jpg"
                    cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
                    cover_dir.mkdir(parents=True, exist_ok=True)
                    cover_file = cover_dir / f"cover{ext}"
                    with open(cover_file, "wb") as cf:
                        cf.write(cover_data)
                    result["cover_path"] = str(cover_file)

            if "cover_path" not in result and book_id:
                image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
                for name in sorted(zf.namelist()):
                    low = name.lower()
                    if any(low.endswith(e) for e in image_exts):
                        info = zf.getinfo(name)
                        if info.file_size < 5000:
                            continue
                        img_data = zf.read(name)
                        ext = Path(name).suffix or ".jpg"
                        cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
                        cover_dir.mkdir(parents=True, exist_ok=True)
                        cover_file = cover_dir / f"cover{ext}"
                        with open(cover_file, "wb") as cf:
                            cf.write(img_data)
                        result["cover_path"] = str(cover_file)
                        break

            return result
    except Exception:
        return {}


def _extract_pdf_metadata(file_path: str, book_id: Optional[int] = None) -> dict:
    """Extract title, author and first-page cover from PDF."""
    result: dict = {}
    try:
        with open(file_path, "rb") as f:
            data = f.read(4096)
            text = data.decode("latin-1", errors="ignore")
            for marker in ["/Title (", "/Title("]:
                idx = text.find(marker)
                if idx != -1:
                    start = idx + len(marker)
                    end = text.find(")", start)
                    if end != -1:
                        title = text[start:end].strip()
                        if title and not title.startswith("/"):
                            result["title"] = title
                        break
            for marker in ["/Author (", "/Author("]:
                idx = text.find(marker)
                if idx != -1:
                    start = idx + len(marker)
                    end = text.find(")", start)
                    if end != -1:
                        author = text[start:end].strip()
                        if author and not author.startswith("/"):
                            result["author"] = author
                        break
    except Exception:
        pass

    if book_id:
        try:
            import fitz
            doc = fitz.open(file_path)
            if doc.page_count > 0:
                page = doc[0]
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
                cover_dir.mkdir(parents=True, exist_ok=True)
                cover_file = cover_dir / "cover.png"
                pix.save(str(cover_file))
                result["cover_path"] = str(cover_file)
            doc.close()
        except Exception:
            pass

    return result


def _extract_metadata(file_path: str, fmt: str, book_id: Optional[int] = None) -> dict:
    """Dispatch metadata extraction based on format."""
    if fmt == "epub":
        return _extract_epub_metadata(file_path, book_id=book_id)
    elif fmt == "pdf":
        return _extract_pdf_metadata(file_path, book_id=book_id)
    return {}


def _import_file(file_path: Path, session: Session) -> dict:
    """Import a single book file by moving it to the book's directory."""
    ext = file_path.suffix.lstrip(".").lower()
    if ext not in settings.allowed_formats_list:
        return {
            "filename": file_path.name,
            "success": False,
            "message": f"Format '{ext}' not allowed",
        }

    try:
        file_size = file_path.stat().st_size
        if file_size > settings.MAX_UPLOAD_SIZE:
            return {
                "filename": file_path.name,
                "success": False,
                "message": "File too large",
            }

        # Create book record
        book = Book(
            title=file_path.stem,
            source="scan",
        )
        session.add(book)
        session.commit()
        session.refresh(book)

        # Move file to book directory
        book_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book.id)
        book_dir.mkdir(parents=True, exist_ok=True)
        dest_path = book_dir / file_path.name

        import shutil
        shutil.move(str(file_path), str(dest_path))

        # Create format record
        book_format = BookFormat(
            book_id=book.id,
            format=ext,
            file_path=str(dest_path),
            file_size=file_size,
            mime_type=MIME_TYPES.get(ext, "application/octet-stream"),
        )
        session.add(book_format)
        session.commit()

        # Extract metadata
        metadata = _extract_metadata(str(dest_path), ext, book_id=book.id)
        if metadata:
            if "title" in metadata:
                book.title = metadata["title"]
            if "language" in metadata:
                book.language = metadata["language"]
            if "description" in metadata:
                book.description = metadata["description"]
            if "cover_path" in metadata:
                book.cover_path = metadata["cover_path"]
            book.updated_at = datetime.now(timezone.utc)
            session.add(book)

            if "author" in metadata:
                author_name = metadata["author"]
                existing = session.exec(
                    select(Author).where(Author.name == author_name)
                ).first()
                if existing is None:
                    author = Author(name=author_name)
                    session.add(author)
                    session.commit()
                    session.refresh(author)
                else:
                    author = existing
                link = BookAuthor(book_id=book.id, author_id=author.id)
                session.add(link)

            session.commit()
            session.refresh(book)

        return {
            "filename": file_path.name,
            "success": True,
            "book_id": book.id,
            "title": book.title,
            "message": "Imported",
        }
    except Exception as exc:
        return {
            "filename": file_path.name,
            "success": False,
            "message": str(exc),
        }


def _fetch_external_metadata(book_id: int) -> None:
    """Background task: fetch metadata from external providers."""
    try:
        from app.db.session import _engine
        from sqlmodel import Session as SQLSession
        from app.services.metadata.fetcher import MetadataService
        from app.services.metadata.providers.google_books import GoogleBooksProvider
        from app.services.metadata.providers.open_library import OpenLibraryProvider

        with SQLSession(_engine) as session:
            book = session.get(Book, book_id)
            if book is None:
                return

            service = MetadataService([
                GoogleBooksProvider(),
                OpenLibraryProvider(),
            ])

            import asyncio

            result = asyncio.get_event_loop().run_until_complete(
                service.fetch(
                    isbn=None,
                    title=book.title,
                    author=None,
                    session=session,
                )
            )

            if result is None:
                return

            updated = False
            if result.description and not book.description:
                book.description = result.description
                updated = True
            if result.publisher:
                from app.models.publisher import Publisher
                pub = session.exec(
                    select(Publisher).where(Publisher.name == result.publisher)
                ).first()
                if pub is None:
                    pub = Publisher(name=result.publisher)
                    session.add(pub)
                    session.flush()
                book.publisher_id = pub.id
                updated = True
            if result.pubdate and not book.published_date:
                book.published_date = result.pubdate
                updated = True
            if result.page_count and not book.page_count:
                book.page_count = result.page_count
                updated = True
            if result.rating and not book.rating:
                book.rating = result.rating
                book.rating_source = result.source
                updated = True

            if result.cover_url and not book.cover_path:
                local_path = _download_cover(result.cover_url, book_id)
                if local_path:
                    book.cover_path = local_path
                    updated = True

            if result.tags:
                for tag_name in result.tags:
                    tag_name = tag_name.strip()
                    if not tag_name:
                        continue
                    from app.models.tag import BookTag, Tag
                    tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
                    if tag is None:
                        tag = Tag(name=tag_name)
                        session.add(tag)
                        session.flush()
                    existing = session.exec(
                        select(BookTag).where(
                            BookTag.book_id == book_id, BookTag.tag_id == tag.id
                        )
                    ).first()
                    if existing is None:
                        session.add(BookTag(book_id=book_id, tag_id=tag.id))
                    updated = True

            if updated:
                book.metadata_source = result.source
                book.updated_at = datetime.now(timezone.utc)
                session.add(book)

            session.commit()

    except Exception:
        logger.exception("Failed to fetch external metadata for book %d", book_id)


def _download_cover(cover_url: str, book_id: int) -> Optional[str]:
    """Download a cover image from URL and save locally."""
    try:
        import httpx
        resp = httpx.get(cover_url, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("content-type", "")
        if "image" not in content_type and not cover_url.endswith((".jpg", ".jpeg", ".png", ".webp")):
            return None
        ext = ".jpg"
        for ct_ext in [("png", ".png"), ("webp", ".webp"), ("jpeg", ".jpg")]:
            if ct_ext[0] in content_type:
                ext = ct_ext[1]
                break
        cover_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
        cover_dir.mkdir(parents=True, exist_ok=True)
        cover_file = cover_dir / f"cover{ext}"
        with open(cover_file, "wb") as f:
            f.write(resp.content)
        return str(cover_file)
    except Exception:
        return None


@router.post("", response_model=ApiResponse[dict])
async def scan_import(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Scan books directory and import untracked files."""
    books_dir = Path(settings.BOOKS_STORAGE_PATH)
    if not books_dir.exists():
        return ApiResponse(
            success=True,
            message="Books directory does not exist",
            data={"imported": 0, "skipped": 0, "results": []},
        )

    # Get all existing file paths from database
    existing_formats = session.exec(select(BookFormat.file_path)).all()
    existing_paths = set(existing_formats)

    results = []
    imported_count = 0
    skipped_count = 0

    # Scan books directory for files not in numeric subdirectories
    for item in books_dir.iterdir():
        if item.is_file():
            # Skip files directly in books root (already imported or system files)
            continue

        if item.is_dir() and item.name.isdigit():
            # Skip numeric directories (already imported books)
            continue

    # Scan for loose book files in non-numeric directories or root
    for root, dirs, files in os.walk(books_dir):
        root_path = Path(root)

        # Skip numeric directories (already imported)
        if root_path.parent == books_dir and root_path.name.isdigit():
            continue

        for filename in files:
            file_path = root_path / filename
            ext = file_path.suffix.lstrip(".").lower()

            if ext not in settings.allowed_formats_list:
                skipped_count += 1
                continue

            # Check if file is already in database
            if str(file_path) in existing_paths:
                skipped_count += 1
                continue

            result = _import_file(file_path, session)
            results.append(result)

            if result["success"]:
                imported_count += 1
                # Trigger external metadata fetch in background
                background_tasks.add_task(_fetch_external_metadata, result["book_id"])

    return ApiResponse(
        success=True,
        message=f"Scan complete: {imported_count} imported, {skipped_count} skipped",
        data={
            "imported": imported_count,
            "skipped": skipped_count,
            "results": results,
        },
    )


@router.get("/status", response_model=ApiResponse[dict])
async def scan_status(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Get information about untracked files in books directory."""
    books_dir = Path(settings.BOOKS_STORAGE_PATH)

    if not books_dir.exists():
        return ApiResponse(
            success=True,
            message="Books directory not found",
            data={
                "path": str(books_dir),
                "exists": False,
                "files": [],
            },
        )

    # Get all existing file paths from database
    existing_formats = session.exec(select(BookFormat.file_path)).all()
    existing_paths = set(existing_formats)

    files = []
    for root, dirs, filenames in os.walk(books_dir):
        root_path = Path(root)

        # Skip numeric directories (already imported books)
        if root_path.parent == books_dir and root_path.name.isdigit():
            continue

        for filename in filenames:
            file_path = root_path / filename
            ext = file_path.suffix.lstrip(".").lower()

            if ext in settings.allowed_formats_list:
                # Check if file is not in database
                if str(file_path) not in existing_paths:
                    files.append({
                        "name": filename,
                        "path": str(file_path.relative_to(books_dir)),
                        "size": file_path.stat().st_size,
                        "format": ext,
                    })

    return ApiResponse(
        success=True,
        message=f"Found {len(files)} untracked book files",
        data={
            "path": str(books_dir),
            "exists": True,
            "files": files,
        },
    )
