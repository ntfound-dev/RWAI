import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import List

router = APIRouter()

_MAX_FILE_BYTES  = 10 * 1024 * 1024   # 10 MB per file
_MAX_FILES       = 5
_ALLOWED_EXT     = {".pdf", ".docx", ".doc", ".txt", ".md"}


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            pages.append(text.strip())
    return "\n".join(pages)


def _extract_docx(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


@router.post("/extract-text")
async def extract_text(files: List[UploadFile] = File(...)):
    if len(files) > _MAX_FILES:
        raise HTTPException(400, f"Max {_MAX_FILES} files per request")

    results = []
    for f in files:
        name = (f.filename or "").lower()
        ext  = next((e for e in _ALLOWED_EXT if name.endswith(e)), None)
        if not ext:
            raise HTTPException(400, f"Unsupported file type: {f.filename}. Allowed: {', '.join(_ALLOWED_EXT)}")

        # Read in chunks — reject oversized files without loading all into memory
        chunks: list[bytes] = []
        total = 0
        async for chunk in f:
            total += len(chunk)
            if total > _MAX_FILE_BYTES:
                raise HTTPException(413, f"{f.filename} exceeds {_MAX_FILE_BYTES // (1024*1024)} MB limit")
            chunks.append(chunk)
        data = b"".join(chunks)

        text = ""
        try:
            if ext == ".pdf":
                text = _extract_pdf(data)
            elif ext in (".docx", ".doc"):
                text = _extract_docx(data)
            else:
                decoded = data.decode("utf-8", errors="ignore")
                clean = "".join(c for c in decoded if c.isprintable() or c in "\n\t")
                text = clean.strip() if len(clean.strip()) > 80 else f"[File: {f.filename}]"
        except Exception as e:
            text = f"[Could not extract text from {f.filename}: {type(e).__name__}]"

        results.append({"name": f.filename, "text": text or f"[Empty: {f.filename}]"})

    return JSONResponse({"results": results})
