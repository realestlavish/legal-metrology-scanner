"""Legal Metrology (Packaged Commodities) Rules, 2011 checklist."""

from __future__ import annotations

from typing import Any


MANDATORY_RULES = (
    ("R1", "Manufacturer / Packer / Importer name and address"),
    ("R2", "Common / generic name of the commodity"),
    ("R3", "Net quantity in standard units"),
    ("R4", "Month and year of manufacture / packing / import"),
    ("R5", "MRP inclusive of all taxes"),
    ("R6", "Consumer care name, telephone and/or email"),
)


def evaluate_compliance(parsed: dict[str, Any], ocr_items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rules: list[dict[str, Any]] = []

    manufacturer = parsed.get("manufacturer_details") or {}
    name_ok = _truthy(manufacturer.get("present")) and (
        _filled(manufacturer.get("name")) or _filled(manufacturer.get("address"))
    )
    address_ok = _filled(manufacturer.get("address"))
    rules.append(_rule("R1", MANDATORY_RULES[0][1], name_ok and address_ok, _r1_reason(name_ok, address_ok)))

    commodity = parsed.get("commodity_name") or {}
    commodity_ok = _truthy(commodity.get("present")) and _filled(commodity.get("name"))
    rules.append(_rule("R2", MANDATORY_RULES[1][1], commodity_ok, None if commodity_ok else "Common/generic name of the commodity was not found."))

    quantity = parsed.get("net_quantity") or {}
    qty_ok = _truthy(quantity.get("present")) and _filled(quantity.get("value"))
    unit_ok = bool(quantity.get("is_standard_unit", True)) if qty_ok else False
    qty_pass = qty_ok and unit_ok
    qty_reason = None
    if not qty_ok:
        qty_reason = "Net quantity declaration was not found."
    elif not unit_ok:
        qty_reason = "Net quantity is not expressed in a standard unit (g, kg, ml, L, etc.)."
    rules.append(_rule("R3", MANDATORY_RULES[2][1], qty_pass, qty_reason))

    date = parsed.get("manufacture_date") or {}
    date_ok = _truthy(date.get("present")) and _filled(date.get("raw_declaration"))
    rules.append(_rule("R4", MANDATORY_RULES[3][1], date_ok, None if date_ok else "Month and year of manufacture/packing/import was not found."))

    mrp = parsed.get("mrp_details") or {}
    mrp_present = _truthy(mrp.get("present")) and _filled(mrp.get("value"))
    inclusive = bool(mrp.get("inclusive_of_all_taxes") or mrp.get("is_properly_formatted"))
    stamped = bool(mrp.get("stamped_override_detected"))
    mrp_ok = mrp_present and inclusive and not stamped
    mrp_reason = None
    if not mrp_present:
        mrp_reason = "MRP / retail sale price was not found."
    elif not inclusive:
        mrp_reason = 'MRP must be declared as "inclusive of all taxes".'
    elif stamped:
        mrp_reason = mrp.get("override_details") or "Stamped or overwritten MRP is not a valid printed declaration."
    rules.append(_rule("R5", MANDATORY_RULES[4][1], mrp_ok, mrp_reason))

    care = parsed.get("consumer_care") or {}
    contact_ok = _filled(care.get("email")) or _filled(care.get("phone"))
    care_ok = _truthy(care.get("present")) and contact_ok
    care_reason = None
    if not care_ok:
        missing = care.get("missing_components") or []
        care_reason = "Consumer care contact is incomplete. Missing: " + (", ".join(missing) if missing else "phone or email.")
    rules.append(_rule("R6", MANDATORY_RULES[5][1], care_ok, care_reason))

    readability = parsed.get("readability_analysis") or {}
    issues = list(readability.get("issues") or [])
    if ocr_items:
        heights = [item.get("relative_height") or 0 for item in ocr_items if item.get("text")]
        if heights:
            median = sorted(heights)[len(heights) // 2]
            if median < 0.012:
                issues.append("Detected text is very small relative to the label image; print height may be below Rule 7/9 thresholds.")
    readability_ok = not issues
    parsed["readability_analysis"] = {
        "meets_minimum_readability": readability_ok,
        "issues": issues,
    }

    passed = sum(1 for rule in rules if rule["passed"])
    total = len(rules)
    score = int(round((passed / total) * 100)) if total else 0
    is_compliant = passed == total
    failed = total - passed
    summary = (
        "All six mandatory Legal Metrology declarations were verified."
        if is_compliant
        else f"{failed} of {total} mandatory declarations failed. Compliance score {score}%."
    )
    formatted_lines = [f"{rule['rule_id']} {rule['rule_name']}: {rule['status']}" for rule in rules]
    if issues:
        formatted_lines.append("Readability notes: " + "; ".join(issues))

    return {
        "overall_status": "COMPLIANT" if is_compliant else "NON_COMPLIANT",
        "is_compliant": is_compliant,
        "compliance_score": score,
        "rules": rules,
        "failed_rules_count": failed,
        "summary": summary,
        "formatted_text_report": "\n".join(formatted_lines),
    }


def _rule(rule_id: str, rule_name: str, passed: bool, reason: str | None) -> dict[str, Any]:
    return {
        "rule_id": rule_id,
        "rule_name": rule_name,
        "status": "PASS" if passed else "FAIL",
        "passed": bool(passed),
        "reason": None if passed else reason,
    }


def _r1_reason(name_ok: bool, address_ok: bool) -> str | None:
    if name_ok and address_ok:
        return None
    if not name_ok and not address_ok:
        return "Manufacturer/packer/importer name and address were not found."
    if not address_ok:
        return "Manufacturer/packer name was found but a complete address is missing."
    return "Manufacturer/packer address was found but the name is missing."


def _filled(value: Any) -> bool:
    return bool(str(value).strip()) if value is not None else False


def _truthy(value: Any) -> bool:
    if value is None:
        return False
    return bool(value)
