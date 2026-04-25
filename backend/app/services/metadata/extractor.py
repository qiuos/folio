from __future__ import annotations

import logging
import re
import zipfile
from pathlib import Path
from xml.etree.ElementTree import fromstring

logger = logging.getLogger(__name__)

# Dublin Core namespace
_DC_NS = "http://purl.org/dc/elements/1.1/"
_OPF_NS = "http://www.idpf.org/2007/opf"


class FileMetadataExtractor:
    """Extract metadata directly from ebook files (EPUB, PDF)."""

    async def extract_from_epub(self, file_path: str) -> dict:
        """Parse OPF metadata from an EPUB file.

        Returns a dict with keys: title, authors, publisher, date, isbn,
        language, description.
        """
        result: dict = {
            "title": None,
            "authors": [],
            "publisher": None,
            "date": None,
            "isbn": None,
            "language": None,
            "description": None,
        }

        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                # Locate the OPF file from container.xml
                container_xml = zf.read("META-INF/container.xml")
                container_root = fromstring(container_xml)
                # Namespace for container.xml
                cnt_ns = "urn:oasis:names:tc:opendocument:xmlns:container"
                rootfile_el = container_root.find(f".//{{{cnt_ns}}}rootfile")
                if rootfile_el is None:
                    return result

                opf_path = rootfile_el.get("full-path", "")
                if not opf_path:
                    return result

                opf_data = zf.read(opf_path)
                opf_root = fromstring(opf_data)

                # Dublin Core metadata
                metadata_el = opf_root.find(f"{{{_OPF_NS}}}metadata")
                if metadata_el is None:
                    return result

                # Title
                title_el = metadata_el.find(f"{{{_DC_NS}}}title")
                if title_el is not None and title_el.text:
                    result["title"] = title_el.text.strip()

                # Creator(s) -> authors
                for el in metadata_el.findall(f"{{{_DC_NS}}}creator"):
                    if el.text:
                        name = el.text.strip()
                        if name:
                            result["authors"].append(name)

                # Publisher
                pub_el = metadata_el.find(f"{{{_DC_NS}}}publisher")
                if pub_el is not None and pub_el.text:
                    result["publisher"] = pub_el.text.strip()

                # Date
                date_el = metadata_el.find(f"{{{_DC_NS}}}date")
                if date_el is not None and date_el.text:
                    result["date"] = date_el.text.strip()

                # Language
                lang_el = metadata_el.find(f"{{{_DC_NS}}}language")
                if lang_el is not None and lang_el.text:
                    result["language"] = lang_el.text.strip()

                # Description
                desc_el = metadata_el.find(f"{{{_DC_NS}}}description")
                if desc_el is not None and desc_el.text:
                    result["description"] = desc_el.text.strip()

                # Identifier – look for ISBN
                for el in metadata_el.findall(f"{{{_DC_NS}}}identifier"):
                    text = (el.text or "").strip()
                    if text and ("isbn" in text.lower() or re.match(r"^\d{9}[\dXx]$", text) or re.match(r"^\d{13}$", text)):
                        result["isbn"] = text
                        break

        except Exception:
            logger.warning(
                "FileMetadataExtractor: failed to parse EPUB %s", file_path, exc_info=True
            )

        return result

    async def extract_from_pdf(self, file_path: str) -> dict:
        """Extract metadata from a PDF file using basic parsing.

        Reads the document information dictionary (title, author, subject).
        """
        result: dict = {
            "title": None,
            "authors": [],
            "publisher": None,
            "date": None,
            "isbn": None,
            "language": None,
            "description": None,
        }

        try:
            # Try PyPDF2 / pypdf first
            try:
                from pypdf import PdfReader

                reader = PdfReader(file_path)
                info = reader.metadata
                if info:
                    result["title"] = info.title or None
                    if info.author:
                        result["authors"] = [info.author]
                    result["description"] = info.subject or None
            except ImportError:
                pass

            # Fallback: basic trailer parsing for /Info dict
            if not result["title"]:
                result.update(self._parse_pdf_info_basic(file_path))

        except Exception:
            logger.warning(
                "FileMetadataExtractor: failed to parse PDF %s", file_path, exc_info=True
            )

        return result

    @staticmethod
    def _parse_pdf_info_basic(file_path: str) -> dict:
        """Very lightweight PDF info extraction from raw bytes.

        Looks for ``/Title``, ``/Author``, ``/Subject`` in the last 4 KB
        of the file (where the xref/trailer usually sits).
        """
        info: dict = {"title": None, "authors": [], "description": None}

        try:
            with open(file_path, "rb") as f:
                # Read the tail of the file for trailer dict
                f.seek(0, 2)
                size = f.tell()
                tail_size = min(size, 4096)
                f.seek(size - tail_size)
                tail = f.read(tail_size).decode("latin-1", errors="replace")

            # Extract string values between parentheses for known keys
            for key, dest in [("/Title", "title"), ("/Author", None), ("/Subject", "description")]:
                # Match /Key (value) or /Key <hex>
                m = re.search(rf"{key}\s*\(([^)]*)\)", tail)
                if not m:
                    m = re.search(rf"{key}\s*<([0-9A-Fa-f]+)>", tail)
                    if m:
                        try:
                            value = bytes.fromhex(m.group(1)).decode("utf-8", errors="replace")
                        except ValueError:
                            continue
                    else:
                        continue
                else:
                    value = m.group(1)

                value = value.strip()
                if not value:
                    continue

                if dest:
                    info[dest] = value
                elif key == "/Author":
                    info["authors"] = [value]
        except Exception:
            pass

        return info

    def parse_filename(self, filename: str) -> dict:
        """Parse common filename patterns into metadata.

        Supports patterns like:
        - ``书名.作者.epub``
        - ``书名 - 作者.epub``
        - ``作者 - 书名.epub``
        - ``书名.epub``
        """
        result: dict = {
            "title": None,
            "authors": [],
        }

        # Strip extension
        stem = Path(filename).stem.strip()
        if not stem:
            return result

        # Try "title - author" or "author - title"
        if " - " in stem:
            parts = [p.strip() for p in stem.split(" - ", 1)]
            if len(parts) == 2:
                # Heuristic: if the first part is longer, assume title-author
                # Otherwise author-title
                if len(parts[0]) >= len(parts[1]):
                    result["title"] = parts[0]
                    result["authors"] = [parts[1]]
                else:
                    result["authors"] = [parts[0]]
                    result["title"] = parts[1]
                return result

        # Try "title.author" or "title.author.extra"
        if "." in stem:
            parts = [p.strip() for p in stem.split(".")]
            if len(parts) >= 2:
                result["title"] = parts[0]
                result["authors"] = [parts[1]]
                return result

        # Fallback: whole stem is the title
        result["title"] = stem
        return result
