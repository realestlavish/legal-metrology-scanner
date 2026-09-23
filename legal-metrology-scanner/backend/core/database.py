"""SQLite persistence for scan results (stdlib only; no SQLAlchemy required)."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from core.config import get_settings

logger = logging.getLogger(__name__)

_db_path: Optional[str] = None


def _resolve_sqlite_path(database_url: str) -> Optional[str]:
    if database_url.startswith("sqlite:///"):
        return database_url.replace("sqlite:///", "", 1)
    parsed = urlparse(database_url)
    if parsed.scheme in {"", "sqlite"}:
        return parsed.path or database_url
    logger.warning("Only SQLite is supported out of the box. DATABASE_URL=%s will not be used.", database_url)
    return None


def init_db() -> None:
    global _db_path
    settings = get_settings()
    path = _resolve_sqlite_path(settings.database_url)
    if not path:
        _db_path = None
        return
    try:
        _db_path = path
        with sqlite3.connect(_db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS scans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    filenames TEXT,
                    raw_text TEXT,
                    parsed_json TEXT,
                    compliance_json TEXT,
                    compliance_score REAL,
                    parser_backend TEXT,
                    overall_status TEXT
                )
                """
            )
            conn.commit()
    except Exception:
        logger.exception("Database initialization failed; scans will not be persisted")
        _db_path = None


def save_scan(
    *,
    filenames: list[str],
    raw_text: str,
    parsed: dict[str, Any],
    compliance: dict[str, Any],
    parser_backend: str,
) -> Optional[int]:
    if not _db_path:
        return None
    try:
        with sqlite3.connect(_db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO scans (
                    created_at, filenames, raw_text, parsed_json, compliance_json,
                    compliance_score, parser_backend, overall_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    ", ".join(filenames),
                    raw_text,
                    json.dumps(parsed, ensure_ascii=False),
                    json.dumps(compliance, ensure_ascii=False),
                    float(compliance.get("compliance_score") or 0),
                    parser_backend,
                    str(compliance.get("overall_status") or ""),
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)
    except Exception:
        logger.exception("Failed to persist scan record")
        return None


def get_recent_scans(limit: int = 10) -> list[dict[str, Any]]:
    if not _db_path:
        return []
    try:
        with sqlite3.connect(_db_path) as conn:
            cursor = conn.execute(
                """
                SELECT id, created_at, filenames, raw_text, parsed_json, compliance_json,
                       compliance_score, parser_backend, overall_status
                FROM scans
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            results: list[dict[str, Any]] = []
            for row in rows:
                parsed: dict[str, Any] = {}
                if row[4]:
                    try:
                        loaded = json.loads(row[4])
                        if isinstance(loaded, dict):
                            parsed = loaded
                    except Exception:
                        parsed = {}
                compliance: dict[str, Any] = {}
                if row[5]:
                    try:
                        loaded = json.loads(row[5])
                        if isinstance(loaded, dict):
                            compliance = loaded
                    except Exception:
                        compliance = {}
                fname = row[2] or ""
                file_list = [part.strip() for part in str(fname).split(",") if part.strip()]
                results.append(
                    {
                        "id": row[0],
                        "scan_id": row[0],
                        "created_at": row[1],
                        "filename": fname,
                        "filenames": file_list,
                        "raw_text": row[3] or "",
                        "parsed_declarations": parsed,
                        "compliance_report": compliance,
                        "compliance_score": row[6],
                        "parser_backend": row[7],
                        "overall_status": row[8],
                        "ocr_lines": [],
                        "warning": None,
                    }
                )
            return results
    except Exception:
        logger.exception("Failed to retrieve recent scans")
        return []

