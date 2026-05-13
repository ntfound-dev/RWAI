import io
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List

router = APIRouter()


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
    results = []
    for f in files:
        data = await f.read()
        name = (f.filename or "").lower()
        text = ""
        try:
            if name.endswith(".pdf"):
                text = _extract_pdf(data)
            elif name.endswith(".docx") or name.endswith(".doc"):
                text = _extract_docx(data)
            else:
                decoded = data.decode("utf-8", errors="ignore")
                clean = "".join(c for c in decoded if c.isprintable() or c in "\n\t")
                text = clean.strip() if len(clean.strip()) > 80 else f"[File: {f.filename}]"
        except Exception as e:
            text = f"[Could not extract text from {f.filename}: {e}]"

        results.append({"name": f.filename, "text": text or f"[Empty: {f.filename}]"})

    return JSONResponse({"results": results})
