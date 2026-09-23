"""Orchestrates OCR -> LLM/heuristic parse -> compliance -> DB persist."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from core.compliance_engine import evaluate_compliance
from core.config import get_settings
from core.database import save_scan
from core.llm_parser import parse_raw_text_to_json
from core.ocr_service import get_ocr_service

logger = logging.getLogger(__name__)


async def analyze_image_payloads(payloads: list[tuple[str, bytes]], lang: str = "en") -> dict[str, Any]:
    settings = get_settings()
    if len(payloads) > settings.max_images:
        raise ValueError(f"A maximum of {settings.max_images} images can be analyzed per request.")

    ocr_service = get_ocr_service(lang=lang or settings.ocr_lang)
    sections: list[str] = []
    plain_sections: list[str] = []
    all_items: list[dict[str, Any]] = []
    per_image: list[dict[str, Any]] = []

    for index, (filename, data) in enumerate(payloads, start=1):
        if len(data) > settings.max_upload_bytes:
            raise ValueError(f"'{filename}' exceeds the {settings.max_upload_bytes} byte upload limit.")
        try:
            items = await asyncio.to_thread(ocr_service.process_image, data)
        except Exception as exc:
            logger.exception("PaddleOCR failed for %s", filename)
            raise RuntimeError(f"PaddleOCR could not process '{filename}': {exc}") from exc

        text = "\n".join(item["text"] for item in items if item.get("text"))
        sections.append(f"--- IMAGE {index}: {filename} ---\n{text}")
        plain_sections.append(text)
        tagged_items: list[dict[str, Any]] = []
        for item in items:
            if isinstance(item, dict):
                tagged = dict(item)
                tagged["image_index"] = index - 1
                tagged_items.append(tagged)
            else:
                tagged_items.append({"text": str(item), "box": [], "confidence": 0.0, "image_index": index - 1})
        all_items.extend(tagged_items)
        per_image.append(
            {
                "filename": filename,
                "line_count": len(tagged_items),
                "raw_text": text,
                "ocr_lines": tagged_items,
            }
        )

    raw_text = "\n\n".join(sections).strip()
    parse_text = "\n\n".join(plain_sections).strip()
    if not parse_text:
        raise ValueError("PaddleOCR did not detect any text. Capture a sharper, well-lit label photo.")

    try:
        parsed = await parse_raw_text_to_json(parse_text)
    except Exception as exc:
        logger.exception("Declaration parsing failed")
        raise RuntimeError(f"Failed to parse OCR text into Legal Metrology fields: {exc}") from exc

    confidences = [
        float(item["confidence"])
        for item in all_items
        if isinstance(item, dict) and item.get("confidence") is not None
    ]
    avg_confidence = (sum(confidences) / len(confidences)) if confidences else 0.0
    warning_msg = (
        "Image is blurry or poorly lit. OCR results may be inaccurate."
        if avg_confidence < 0.70
        else None
    )

    compliance = evaluate_compliance(parsed, all_items)
    filenames = [name for name, _ in payloads]
    scan_id = await asyncio.to_thread(
        lambda: save_scan(
            filenames=filenames,
            raw_text=raw_text,
            parsed=parsed,
            compliance=compliance,
            parser_backend=settings.parser_backend,
        )
    )

    return {
        "filename": filenames[0] if len(filenames) == 1 else ", ".join(filenames),
        "filenames": filenames,
        "image_count": len(payloads),
        "raw_text": raw_text,
        "ocr_lines": all_items,
        "images": per_image,
        "parsed_declarations": parsed,
        "compliance_report": compliance,
        "parser_backend": settings.parser_backend,
        "llm_configured": settings.has_llm_key,
        "scan_id": scan_id,
        "warning": warning_msg,
    }