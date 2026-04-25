from __future__ import annotations

import logging
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from sqlmodel import Session, select

from app.config import settings
from app.core.exceptions import BadRequestException, NotFoundException
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.book import Author, Book, BookAuthor, BookFormat
from app.models.user import User
from app.schemas.response import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["upload"])

MIME_TYPES: dict[str, str] = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "mobi": "application/x-mobipocket-ebook",
    "azw3": "application/vnd.amazon.mobi8-ebook",
    "txt": "text/plain",
    "fb2": "application/x-fictionbook+xml",
}


# ---------------------------------------------------------------------------
# Metadata extraction helpers
# ---------------------------------------------------------------------------


def _extract_epub_metadata(file_path: str, book_id: Optional[int] = None) -> dict:
    """Extract title, author, description and cover from EPUB OPF metadata."""
    try:
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
            # Method 1: <meta name="cover" content="cover-id"/>
            meta_cover = opf_root.find(f".//{{{opf_ns}}}meta[@name='cover']")
            if meta_cover is not None:
                cover_id = meta_cover.get("content", "")
                manifest_item = opf_root.find(f".//{{{opf_ns}}}item[@id='{cover_id}']")
                if manifest_item is not None:
                    cover_href = manifest_item.get("href", "")
            # Method 2: item with properties="cover-image"
            if not cover_href:
                for item in opf_root.findall(f".//{{{opf_ns}}}item"):
                    if "cover-image" in item.get("properties", ""):
                        cover_href = item.get("href", "")
                        break
            # Method 3: item with id containing "cover" and image type
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

            # Fallback: use first image in EPUB as cover if no cover found
            if "cover_path" not in result and book_id:
                image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
                for name in sorted(zf.namelist()):
                    low = name.lower()
                    if any(low.endswith(e) for e in image_exts):
                        # Skip very small images (icons etc)
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

    # Extract text metadata
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

    # Extract first page as cover image
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


# ---------------------------------------------------------------------------
# File save helper
# ---------------------------------------------------------------------------


def _save_upload_file(upload_file: UploadFile, dest_dir: Path) -> Path:
    """Save an UploadFile to *dest_dir*, returning the final path."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / upload_file.filename
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return dest_path


# ---------------------------------------------------------------------------
# Single file upload
# ---------------------------------------------------------------------------


@router.post("", response_model=ApiResponse[dict])
async def upload_book(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> ApiResponse[dict]:
    # Validate extension
    if not file.filename:
        raise BadRequestException(message="File has no filename")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.allowed_formats_list:
        raise BadRequestException(
            message=f"Format '{ext}' is not allowed. Allowed: {settings.allowed_formats_list}"
        )

    # Validate size
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise BadRequestException(
            message=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE} bytes"
        )
    await file.seek(0)

    # Create book record
    book = Book(
        title=file.filename,
        source="upload",
    )
    session.add(book)
    session.commit()
    session.refresh(book)

    # Save file
    book_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book.id)
    file_path = _save_upload_file(file, book_dir)

    file_size = file_path.stat().st_size

    # Create format record
    book_format = BookFormat(
        book_id=book.id,
        format=ext,
        file_path=str(file_path),
        file_size=file_size,
        mime_type=MIME_TYPES.get(ext, "application/octet-stream"),
    )
    session.add(book_format)
    session.commit()
    session.refresh(book_format)

    # Try metadata extraction
    metadata = _extract_metadata(str(file_path), ext, book_id=book.id)
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

        # Handle author
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

    # Trigger external metadata fetch in background
    background_tasks.add_task(_fetch_external_metadata, book.id)

    return ApiResponse(
        success=True,
        message="Book uploaded",
        data={"book_id": book.id, "format_id": book_format.id, "status": "uploaded"},
    )


# ---------------------------------------------------------------------------
# Batch upload
# ---------------------------------------------------------------------------


@router.post("/batch", response_model=ApiResponse[list])
async def upload_batch(
    files: list[UploadFile],
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[list]:
    results = []
    for upload_file in files:
        try:
            if not upload_file.filename:
                results.append({
                    "filename": None,
                    "success": False,
                    "message": "File has no filename",
                })
                continue

            ext = upload_file.filename.rsplit(".", 1)[-1].lower()
            if ext not in settings.allowed_formats_list:
                results.append({
                    "filename": upload_file.filename,
                    "success": False,
                    "message": f"Format '{ext}' not allowed",
                })
                continue

            contents = await upload_file.read()
            if len(contents) > settings.MAX_UPLOAD_SIZE:
                results.append({
                    "filename": upload_file.filename,
                    "success": False,
                    "message": "File too large",
                })
                continue
            await upload_file.seek(0)

            book = Book(title=upload_file.filename, source="upload")
            session.add(book)
            session.commit()
            session.refresh(book)

            book_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book.id)
            file_path = _save_upload_file(upload_file, book_dir)
            file_size = file_path.stat().st_size

            book_format = BookFormat(
                book_id=book.id,
                format=ext,
                file_path=str(file_path),
                file_size=file_size,
                mime_type=MIME_TYPES.get(ext, "application/octet-stream"),
            )
            session.add(book_format)

            metadata = _extract_metadata(str(file_path), ext, book_id=book.id)
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

            results.append({
                "filename": upload_file.filename,
                "success": True,
                "book_id": book.id,
                "message": "Uploaded",
            })
        except Exception as exc:
            results.append({
                "filename": upload_file.filename,
                "success": False,
                "message": str(exc),
            })

    return ApiResponse(success=True, message="Batch upload completed", data=results)


# ---------------------------------------------------------------------------
# Add format to existing book
# ---------------------------------------------------------------------------


@router.post("/books/{book_id}/formats", response_model=ApiResponse[dict])
async def add_format(
    book_id: int,
    file: UploadFile,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    if not file.filename:
        raise BadRequestException(message="File has no filename")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.allowed_formats_list:
        raise BadRequestException(
            message=f"Format '{ext}' is not allowed"
        )

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise BadRequestException(message="File too large")
    await file.seek(0)

    book_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book.id)
    file_path = _save_upload_file(file, book_dir)
    file_size = file_path.stat().st_size

    book_format = BookFormat(
        book_id=book.id,
        format=ext,
        file_path=str(file_path),
        file_size=file_size,
        mime_type=MIME_TYPES.get(ext, "application/octet-stream"),
    )
    session.add(book_format)
    session.commit()
    session.refresh(book_format)

    return ApiResponse(
        success=True,
        message="Format added",
        data={"book_id": book.id, "format_id": book_format.id},
    )


# ---------------------------------------------------------------------------
# Remove format
# ---------------------------------------------------------------------------


@router.delete("/books/{book_id}/formats/{format_id}", response_model=ApiResponse[dict])
async def remove_format(
    book_id: int,
    format_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    book_format = session.get(BookFormat, format_id)
    if book_format is None or book_format.book_id != book_id:
        raise NotFoundException(message=f"Format {format_id} not found for book {book_id}")

    # Delete file from disk
    file_path = Path(book_format.file_path)
    if file_path.exists():
        file_path.unlink()

    session.delete(book_format)
    session.commit()

    return ApiResponse(success=True, message="Format removed", data={"format_id": format_id})


# ---------------------------------------------------------------------------
# Update book metadata
# ---------------------------------------------------------------------------


@router.put("/books/{book_id}", response_model=ApiResponse[dict])
async def update_book(
    book_id: int,
    body: dict,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    updatable_fields = [
        "title", "sort_title", "subtitle", "description",
        "language", "page_count", "published_date", "rating",
        "rating_source", "series_index", "cover_path",
    ]
    for field in updatable_fields:
        if field in body:
            setattr(book, field, body[field])

    # Handle tags
    if "tags" in body:
        from app.models.tag import BookTag, Tag
        # Remove existing tag links
        existing = session.exec(
            select(BookTag).where(BookTag.book_id == book_id)
        ).all()
        for link in existing:
            session.delete(link)
        # Add new tags
        for tag_name in body["tags"]:
            tag_name = tag_name.strip()
            if not tag_name:
                continue
            tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
            if tag is None:
                tag = Tag(name=tag_name)
                session.add(tag)
                session.flush()
            session.add(BookTag(book_id=book_id, tag_id=tag.id))

    book.updated_at = datetime.now(timezone.utc)
    session.add(book)
    session.commit()
    session.refresh(book)

    return ApiResponse(
        success=True,
        message="Book updated",
        data={"book_id": book.id},
    )


# ---------------------------------------------------------------------------
# Delete book
# ---------------------------------------------------------------------------


@router.delete("/books/{book_id}", response_model=ApiResponse[dict])
async def delete_book(
    book_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ApiResponse[dict]:
    book = session.get(Book, book_id)
    if book is None:
        raise NotFoundException(message=f"Book {book_id} not found")

    # Delete reading progress first (references book_formats via format_id)
    from app.models.reading import ReadingProgress
    progress = session.exec(
        select(ReadingProgress).where(ReadingProgress.book_id == book_id)
    ).all()
    for p in progress:
        session.delete(p)
    session.flush()

    # Delete all format files
    formats = session.exec(
        select(BookFormat).where(BookFormat.book_id == book_id)
    ).all()
    for fmt in formats:
        file_path = Path(fmt.file_path)
        if file_path.exists():
            file_path.unlink()
        session.delete(fmt)

    # Delete author links
    author_links = session.exec(
        select(BookAuthor).where(BookAuthor.book_id == book_id)
    ).all()
    for link in author_links:
        session.delete(link)

    # Delete tag links
    from app.models.tag import BookTag
    tag_links = session.exec(
        select(BookTag).where(BookTag.book_id == book_id)
    ).all()
    for link in tag_links:
        session.delete(link)

    # Delete category links
    from app.models.category import BookCategory
    cat_links = session.exec(
        select(BookCategory).where(BookCategory.book_id == book_id)
    ).all()
    for link in cat_links:
        session.delete(link)

    # Delete identifiers
    from app.models.book import Identifier
    idents = session.exec(
        select(Identifier).where(Identifier.book_id == book_id)
    ).all()
    for ident in idents:
        session.delete(ident)

    # Remove book directory
    book_dir = Path(settings.BOOKS_STORAGE_PATH) / str(book_id)
    if book_dir.exists():
        shutil.rmtree(book_dir, ignore_errors=True)

    session.delete(book)
    session.commit()

    return ApiResponse(success=True, message="Book deleted", data={"book_id": book_id})


# ---------------------------------------------------------------------------
# Background: fetch external metadata
# ---------------------------------------------------------------------------


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

            # Skip if book already has rich metadata
            has_isbn = session.exec(
                select(BookFormat).where(BookFormat.book_id == book_id)
            ).first() is not None

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
                logger.info("No external metadata found for book %d", book_id)
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
            if result.isbn:
                from app.models.book import Identifier
                from sqlmodel import col
                existing_isbn = session.exec(
                    select(Identifier).where(
                        Identifier.book_id == book_id,
                        col(Identifier.type).in_(["isbn10", "isbn13"]),
                    )
                ).first()
                if existing_isbn is None:
                    isbn_type = "isbn13" if len(result.isbn.replace("-", "")) == 13 else "isbn10"
                    session.add(Identifier(book_id=book_id, type=isbn_type, value=result.isbn))

            # Download cover if we don't have one
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
            logger.info("External metadata applied to book %d from %s", book_id, result.source)

    except Exception:
        logger.exception("Failed to fetch external metadata for book %d", book_id)
