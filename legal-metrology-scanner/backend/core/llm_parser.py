"""LLM + heuristic parsing of OCR text into Legal Metrology JSON."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from core.config import get_settings
from core.heuristic_parser import parse_raw_text_heuristically

logger = logging.getLogger(__name__)

PARSER_SCHEMA_HINT = """
Return ONLY a JSON object with this exact shape:
{
  "manufacturer_details": {"present": true, "name": "", "address": ""},
  "commodity_name": {"present": true, "name": ""},
  "net_quantity": {"present": true, "value": "", "unit": "", "is_standard_unit": true},
  "manufacture_date": {"present": true, "raw_declaration": ""},
  "mrp_details": {
    "present": true,
    "value": "",
    "is_properly_formatted": true,
    "stamped_override_detected": false,
    "override_details": null,
    "inclusive_of_all_taxes": true
  },
  "consumer_care": {
    "present": true,
    "email": "",
    "phone": "",
    "address": "",
    "missing_components": []
  },
  "readability_analysis": {"meets_minimum_readability": true, "issues": []}
}
Use null for unknown strings. present must be true only if the field is actually found.
MRP is_properly_formatted / inclusive_of_all_taxes must be true only if the label says
"inclusive of all taxes" (or a clear equivalent such as "incl. of all taxes").
"""


def parse_raw_text_to_json(raw_text: str) -> dict[str, Any]:
    settings = get_settings()
    heuristic = parse_raw_text_heuristically(raw_text)
    if not raw_text.strip():
        return heuristic

    try:
        if settings.gemini_api_key:
            llm_result = _parse_with_gemini(raw_text, settings.gemini_api_key, settings.gemini_model)
            return _merge(heuristic, llm_result)
        if settings.openai_api_key:
            llm_result = _parse_with_openai(raw_text, settings.openai_api_key, settings.openai_model)
            return _merge(heuristic, llm_result)
    except Exception:
        logger.exception("LLM parsing failed; falling back to heuristic parser")

    return heuristic


def _prompt(raw_text: str) -> str:
    return (
        "You extract mandatory declarations from Indian packaged commodity labels "
        "under the Legal Metrology (Packaged Commodities) Rules, 2011.\n"
        "Extract Manufacturer/Packer/Importer name and address, Common/Generic name, "
        "Net Quantity, Month & Year of manufacture/pack/import, MRP, and Consumer Care details.\n"
        f"{PARSER_SCHEMA_HINT}\n"
        "OCR TEXT:\n"
        f"{raw_text[:12000]}"
    )


def _parse_with_gemini(raw_text: str, api_key: str, model_name: str) -> dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": _prompt(raw_text)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    with httpx.Client(timeout=45.0) as client:
        response = client.post(url, params={"key": api_key}, json=payload)
        response.raise_for_status()
        body = response.json()
    text = (
        body.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    return _coerce_json(text)


def _parse_with_openai(raw_text: str, api_key: str, model_name: str) -> dict[str, Any]:
    payload = {
        "model": model_name,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You extract Legal Metrology label fields as JSON."},
            {"role": "user", "content": _prompt(raw_text)},
        ],
    }
    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        response.raise_for_status()
        body = response.json()
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    return _coerce_json(content)


def _coerce_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("LLM returned empty content")
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.S)
    if fenced:
        cleaned = fenced.group(1)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("LLM did not return a JSON object")
    return parsed


def _merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if key not in merged:
            merged[key] = value
            continue
        if isinstance(merged[key], dict) and isinstance(value, dict):
            child = dict(merged[key])
            child.update({k: v for k, v in value.items() if v not in (None, "", [])})
            if "present" in value:
                child["present"] = bool(value.get("present"))
            merged[key] = child
        elif value not in (None, "", []):
            merged[key] = value
    return merged
