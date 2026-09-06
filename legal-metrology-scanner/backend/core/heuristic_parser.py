"""Deterministic Legal Metrology field extraction used when no LLM key is set."""

from __future__ import annotations

import re
from typing import Any

MONTHS = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)

STANDARD_UNITS = {
    "g", "gm", "gms", "gram", "grams",
    "kg", "kgs", "kilogram", "kilograms",
    "mg", "ml", "millilitre", "milliliter", "millilitres", "milliliters",
    "l", "ltr", "ltrs", "litre", "liter", "litres", "liters",
    "cm", "m", "metre", "meter", "metres", "meters",
    "no", "nos", "number", "n", "pcs", "pieces",
}

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(
    r"(?:\+91[\s-]?)?(?:1800|1860|0)?[\s-]?\d{3,5}[\s-]?\d{3,5}[\s-]?\d{0,4}"
)
MRP_RE = re.compile(
    r"(?:m\.?\s*r\.?\s*p\.?|maximum\s+retail\s+price|rs\.?|inr|₹)\s*[:\-]?\s*([0-9]+(?:[,.][0-9]{2,})?)",
    re.I,
)
QTY_RE = re.compile(
    r"(?:net\s*(?:qty|quantity|wt|weight|content)?|net)\s*[.:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*"
    r"(kg|kgs|g|gm|gms|grams?|mg|ml|l|ltr|ltrs|litres?|liters?|cm|m|nos?|pcs|pieces?)",
    re.I,
)
QTY_FALLBACK_RE = re.compile(
    r"\b([0-9]+(?:\.[0-9]+)?)\s*(kg|kgs|g|gm|gms|ml|l|ltr|ltrs)\b",
    re.I,
)
DATE_RE = re.compile(
    rf"(?:(?:mfg|mfd|pkd|packed|packing|import(?:ed)?|best\s*before|exp(?:iry)?)"
    rf"[^\n]{{0,20}})?((?:{MONTHS})[.\-/\s]*\d{{2,4}}|\d{{1,2}}[.\-/]\d{{2,4}}|\d{{2}}[.\-/]\d{{4}})",
    re.I,
)


def _is_standard_unit(qty_unit: str | None) -> bool:
    if not qty_unit:
        return False
    lowered = qty_unit.lower()
    return lowered in STANDARD_UNITS or lowered.rstrip("s") in STANDARD_UNITS


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(_present(v) for v in value)
    return True


def parse_raw_text_heuristically(raw_text: str) -> dict[str, Any]:
    text = raw_text or ""
    compact = re.sub(r"[ \t]+", " ", text)
    lower = compact.lower()

    manufacturer = _extract_labeled_block(
        compact,
        labels=(
            r"manufactured\s+by",
            r"mfg(?:d)?\.?\s*by",
            r"packed\s+by",
            r"packer",
            r"imported\s+by",
            r"importer",
            r"marketed\s+by",
            r"mfd\.?\s*by",
        ),
    )
    mfg_name, mfg_address = _split_name_address(manufacturer)

    commodity = _extract_labeled_line(
        compact,
        labels=(r"name\s+of\s+(?:the\s+)?commodity", r"generic\s+name", r"common\s+name"),
    )
    if not commodity:
        commodity = _guess_commodity(compact)

    qty_match = QTY_RE.search(compact) or QTY_FALLBACK_RE.search(compact)
    qty_value = qty_match.group(0).strip() if qty_match else None
    qty_unit = qty_match.group(2).lower() if qty_match else None

    date_match = DATE_RE.search(compact)
    date_value = date_match.group(0).strip() if date_match else None

    mrp_match = MRP_RE.search(compact)
    mrp_value = None
    if mrp_match:
        mrp_value = mrp_match.group(0).strip()
    inclusive = bool(re.search(r"inclusive\s+of\s+all\s+taxes|incl\.?\s*of\s+(?:all\s+)?taxes", lower))
    stamped = bool(re.search(r"stamped|over\s*print|price\s+overwritten", lower))

    emails = [re.sub(r"\s+", "", item).lower() for item in EMAIL_RE.findall(compact)]
    phones = [p.strip() for p in PHONE_RE.findall(compact) if len(re.sub(r"\D", "", p)) >= 8]
    care_block = _extract_labeled_block(
        compact,
        labels=(r"consumer\s+care", r"customer\s+care", r"for\s+complaints", r"feedback"),
    )

    missing_care: list[str] = []
    if not emails:
        missing_care.append("email")
    if not phones:
        missing_care.append("phone")
    if not care_block:
        missing_care.append("address")

    return {
        "manufacturer_details": {
            "present": _present(mfg_name) or _present(mfg_address),
            "name": mfg_name,
            "address": mfg_address,
        },
        "commodity_name": {
            "present": _present(commodity),
            "name": commodity,
        },
        "net_quantity": {
            "present": _present(qty_value),
            "value": qty_value,
            "unit": qty_unit,
            "is_standard_unit": _is_standard_unit(qty_unit),
        },
        "manufacture_date": {
            "present": _present(date_value),
            "raw_declaration": date_value,
        },
        "mrp_details": {
            "present": _present(mrp_value),
            "value": mrp_value,
            "is_properly_formatted": bool(mrp_value and inclusive),
            "stamped_override_detected": stamped,
            "override_details": "Stamped or overwritten price language detected" if stamped else None,
            "inclusive_of_all_taxes": inclusive,
        },
        "consumer_care": {
            "present": bool(emails or phones or care_block),
            "email": emails[0] if emails else None,
            "phone": phones[0] if phones else None,
            "address": care_block,
            "missing_components": missing_care,
        },
        "readability_analysis": {
            "meets_minimum_readability": True,
            "issues": [],
        },
    }


def _extract_labeled_block(text: str, labels: tuple[str, ...]) -> str | None:
    pattern = re.compile(rf"(?:{'|'.join(labels)})\s*[.:\-]?\s*(.+)", re.I | re.S)
    match = pattern.search(text)
    if not match:
        return None
    remainder = match.group(1)
    lines = [ln.strip(" .:-") for ln in remainder.splitlines() if ln.strip()]
    collected: list[str] = []
    stop = re.compile(r"^(mrp|net|pkd|mfg|exp|customer|consumer|email|phone)\b", re.I)
    for line in lines[:5]:
        if collected and stop.match(line):
            break
        collected.append(line)
        if len(" ".join(collected)) > 220:
            break
    return " ".join(collected).strip() or None


def _extract_labeled_line(text: str, labels: tuple[str, ...]) -> str | None:
    pattern = re.compile(rf"(?:{'|'.join(labels)})\s*[:\-]?\s*(.+)", re.I)
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1).splitlines()[0].strip(" :-") or None


def _split_name_address(block: str | None) -> tuple[str | None, str | None]:
    if not block:
        return None, None
    parts = [p.strip(" .:-") for p in re.split(r"[,|\n]", block) if p.strip(" .:-")]
    if not parts:
        return block, block
    name = parts[0].lstrip(".:- ").strip()
    address = ", ".join(parts[1:]).lstrip(".:- ").strip() or block
    return name, address


def _guess_commodity(text: str) -> str | None:
    skip = re.compile(
        r"mrp|net|qty|weight|mfg|pkd|consumer|customer|address|ltd|pvt|india|inclusive|tax|^---",
        re.I,
    )
    for line in text.splitlines():
        cleaned = line.strip()
        if 3 <= len(cleaned) <= 48 and not skip.search(cleaned) and re.search(r"[A-Za-z]{3,}", cleaned):
            return cleaned
    return None
