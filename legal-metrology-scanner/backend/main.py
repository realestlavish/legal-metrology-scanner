import argparse
import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import router as api_router
from core.compliance_engine import evaluate_compliance
from core.config import get_settings
from core.database import init_db
from core.llm_parser import parse_raw_text_to_json
from core.ocr_service import OCRService, extract_raw_text_from_image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if sys.version_info >= (3, 13):
    logger.warning(
        "PaddleOCR 2.x needs Python 3.10-3.12. This interpreter is %s. Use the backend .venv (Python 3.11).",
        sys.version.split()[0],
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    logger.info("Legal Metrology API started. PaddleOCR loads on the first /analyze-label request.")
    yield


app = FastAPI(
    title="Legal Metrology Label Scanner API",
    description="Extract product-label text with PaddleOCR, parse the six mandatory Legal Metrology declarations, and score statutory compliance.",
    version="1.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
_origins = _settings.cors_origins
_allow_star = _origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=None if _allow_star else r"https://.*\.vercel\.app",
    allow_credentials=not _allow_star,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root():
    return _health_payload()


@app.get("/health")
async def health():
    return _health_payload()


def _health_payload() -> dict:
    settings = get_settings()
    return {
        "status": "online",
        "service": "Legal Metrology Label Scanner API",
        "ocr": "PaddleOCR",
        "parser_backend": settings.parser_backend,
        "llm_configured": settings.has_llm_key,
        "endpoints": {
            "analyze_label": "POST /analyze-label",
            "analyze": "POST /analyze",
            "upload": "POST /upload",
            "history": "GET /history",
            "health": "GET /health",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract raw text from a local image using PaddleOCR, parse Legal Metrology JSON, and evaluate compliance."
    )
    parser.add_argument("image_path", type=str, nargs="?", help="Path to local image file")
    parser.add_argument("--lang", type=str, default="en", help="OCR language (default: 'en')")
    parser.add_argument("--show-details", action="store_true", help="Print bounding box and confidence score for each line")
    parser.add_argument("--json-only", action="store_true", help="Print only raw JSON output")

    args = parser.parse_args()
    image_path = args.image_path

    if not image_path:
        print("Usage: python main.py <path_to_image_file> [--lang en] [--show-details] [--json-only]")
        sys.exit(1)

    if not os.path.isfile(image_path):
        print(f"Error: Image file not found at path '{image_path}'")
        sys.exit(1)

    print(f"Processing image with PaddleOCR: {image_path} ...\n")
    ocr_service = OCRService(lang=args.lang)

    if args.show_details:
        results = ocr_service.process_image(image_path)
        print("=== DETECTED TEXT DETAILS ===")
        for idx, item in enumerate(results, 1):
            print(f"[{idx}] Text: {item['text']} (Confidence: {item['confidence']:.2%})")
        print("\n=== RAW TEXT ===")
        raw_text = "\n".join(item["text"] for item in results)
        print(raw_text)
    else:
        raw_text = extract_raw_text_from_image(image_path, lang=args.lang)
        print("=== RAW TEXT ===")
        print(raw_text)

    parsed_json = asyncio.run(parse_raw_text_to_json(raw_text))

    if args.json_only:
        print("\n=== PARSED LEGAL METROLOGY JSON ===")
        print(json.dumps(parsed_json, indent=2))
        return

    print("\n=== PARSED LEGAL METROLOGY JSON ===")
    print(json.dumps(parsed_json, indent=2))

    compliance_report = evaluate_compliance(parsed_json)
    print("\n=== LEGAL METROLOGY COMPLIANCE REPORT ===")
    print(compliance_report["formatted_text_report"])
    print(f"\nCOMPLIANCE SCORE: {compliance_report['compliance_score']}%")
    print(f"OVERALL STATUS: {compliance_report['overall_status']}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main()
    else:
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
