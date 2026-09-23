import asyncio
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from api.pipeline import analyze_image_payloads
from core.database import get_recent_scans

router = APIRouter()

ALLOWED_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "application/octet-stream",
}


def _collect_uploads(
    file: UploadFile | None,
    files: list[UploadFile] | None,
) -> list[UploadFile]:
    collected: list[UploadFile] = []
    if file is not None:
        collected.append(file)
    if files:
        collected.extend(files)
    unique: list[UploadFile] = []
    seen_ids: set[int] = set()
    for item in collected:
        if id(item) in seen_ids:
            continue
        seen_ids.add(id(item))
        unique.append(item)
    return unique


@router.get("/history")
async def get_history(limit: int = Query(default=10, ge=1, le=100)):
    try:
        scans = await asyncio.to_thread(get_recent_scans, limit)
        return JSONResponse(scans)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch scan history: {exc}") from exc


@router.post("/analyze-label")
async def analyze_label(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    lang: str = Query(default="en"),
):
    return await _analyze(file, files, lang)


@router.post("/analyze")
async def analyze_alias(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    lang: str = Query(default="en"),
):
    return await _analyze(file, files, lang)


@router.post("/upload")
async def upload_alias(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    lang: str = Query(default="en"),
):
    return await _analyze(file, files, lang)


async def _analyze(
    file: UploadFile | None,
    files: list[UploadFile] | None,
    lang: str,
):
    uploads = _collect_uploads(file, files)
    if not uploads:
        raise HTTPException(
            status_code=400,
            detail="No image uploaded. Send one or more files as form field 'file' or 'files' (max 3).",
        )

    payloads: list[tuple[str, bytes]] = []
    for upload in uploads[:3]:
        content_type = (upload.content_type or "").lower()
        if content_type and content_type not in ALLOWED_TYPES and not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {upload.content_type}")
        data = await upload.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"Uploaded file '{upload.filename}' is empty.")
        payloads.append((upload.filename or "label.jpg", data))

    try:
        result = await analyze_image_payloads(payloads, lang=lang)
        return JSONResponse(result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Label analysis failed: {exc}",
        ) from exc
