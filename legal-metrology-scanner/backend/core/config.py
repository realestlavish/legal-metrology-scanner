"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_ROOT / ".env")


def _csv(value: str) -> list[str]:
    items = [item.strip() for item in value.split(",") if item.strip()]
    return items or ["*"]


class Settings:
    gemini_api_key: str
    gemini_model: str
    openai_api_key: str
    openai_model: str
    database_url: str
    cors_origins: list[str]
    ocr_lang: str
    max_upload_bytes: int
    max_images: int

    def __init__(self) -> None:
        gemini = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY") or ""
        self.gemini_api_key = gemini.strip()
        self.gemini_model = (os.getenv("GEMINI_MODEL") or "gemini-2.0-flash").strip()
        self.openai_api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        self.openai_model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
        self.database_url = (os.getenv("DATABASE_URL") or "sqlite:///./scans.db").strip()
        self.cors_origins = _csv(os.getenv("CORS_ORIGINS") or "*")
        self.ocr_lang = (os.getenv("OCR_LANG") or "en").strip()
        self.max_upload_bytes = int(os.getenv("MAX_UPLOAD_BYTES") or str(12 * 1024 * 1024))
        self.max_images = int(os.getenv("MAX_IMAGES") or "3")

    @property
    def has_llm_key(self) -> bool:
        return bool(self.gemini_api_key or self.openai_api_key)

    @property
    def parser_backend(self) -> str:
        if self.gemini_api_key:
            return "gemini"
        if self.openai_api_key:
            return "openai"
        return "heuristic"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
