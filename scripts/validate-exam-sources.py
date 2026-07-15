#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate the official-source links in the published exam catalogue."""

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse


REQUIRED_LINK_FIELDS = ("official_site", "official_portal", "news_list_url")
POLICY_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "hermes"
    / "skills"
    / "CampBrief"
    / "campbrief-exams"
    / "source-policy.json"
)
VALID_POLICY_MODES = {
    "notice-list",
    "filtered-list",
    "schedule-page",
    "dynamic-list",
    "national-portal",
}
VALID_POLICY_FALLBACKS = {"current-notice", "portal"}
FUTURE_NOTICE_PENDING = {
    "cet-202612",
    "guokao-2026",
    "kaoyan-2026",
    "baoyan-2026",
}
OFFICIAL_HOSTS = {
    "cet-bm.neea.edu.cn",
    "cet.neea.edu.cn",
    "www.neea.edu.cn",
    "tem.fltonline.cn",
    "ielts.neea.cn",
    "ielts-main.neea.cn",
    "www.chinaielts.org",
    "toefl.neea.edu.cn",
    "toefl-main.neea.edu.cn",
    "toefl.neea.cn",
    "toefl-main.neea.cn",
    "www.cpta.com.cn",
    "www.aticicg.org.cn",
    "ncre-bm.neea.edu.cn",
    "ncre.neea.edu.cn",
    "www.ruankao.org.cn",
    "www.patest.cn",
    "ausm.mof.gov.cn",
    "kzp.mof.gov.cn",
    "kjs.mof.gov.cn",
    "cpaexam.cicpa.org.cn",
    "www.cicpa.org.cn",
    "myacca.accaglobal.com",
    "www.accaglobal.com",
    "ntcebm4.neea.edu.cn",
    "ntce.neea.edu.cn",
    "stzbm.cltt.org",
    "www.cltt.org",
    "bm.scs.gov.cn",
    "www.scs.gov.cn",
    "job.mohrss.gov.cn",
    "www.mohrss.gov.cn",
    "yzst.chsi.com.cn",
    "yz.chsi.com.cn",
}


def validate_url(value: object, field: str, item_id: str, errors: list[str]) -> None:
    parsed = urlparse(str(value or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        errors.append(f"{item_id}: {field} is not an absolute HTTP(S) URL")
        return
    if parsed.hostname not in OFFICIAL_HOSTS:
        errors.append(f"{item_id}: {field} uses an unapproved host: {parsed.hostname}")


def validate_string_list(value: object, field: str, item_id: str, errors: list[str]) -> bool:
    if not isinstance(value, list) or not value or not all(isinstance(entry, str) and entry.strip() for entry in value):
        errors.append(f"{item_id}: {field} must be a non-empty string array")
        return False
    return True


def validate_source_policy(items_by_id: dict[str, dict[str, object]], errors: list[str]) -> None:
    try:
        policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"cannot read exam source policy: {error}")
        return

    if not isinstance(policy, dict):
        errors.append("exam source policy must be an object")
        return
    if policy.get("source_of_truth") != "static/data/exams.json":
        errors.append("exam source policy must declare static/data/exams.json as source_of_truth")

    default = policy.get("default")
    if not isinstance(default, dict) or default.get("mode") not in VALID_POLICY_MODES:
        errors.append("exam source policy has an invalid default mode")
    elif default.get("fallback") not in VALID_POLICY_FALLBACKS:
        errors.append("exam source policy has an invalid default fallback")

    entries = policy.get("items")
    if not isinstance(entries, dict):
        errors.append("exam source policy items must be an object")
        return

    for item_id, rule in entries.items():
        if item_id not in items_by_id:
            errors.append(f"exam source policy references missing exam id: {item_id}")
            continue
        if not isinstance(rule, dict):
            errors.append(f"{item_id}: exam source policy rule must be an object")
            continue
        mode = rule.get("mode", default.get("mode") if isinstance(default, dict) else None)
        if mode not in VALID_POLICY_MODES:
            errors.append(f"{item_id}: invalid exam source policy mode: {mode}")
        fallback = rule.get("fallback", default.get("fallback") if isinstance(default, dict) else None)
        if fallback not in VALID_POLICY_FALLBACKS:
            errors.append(f"{item_id}: invalid exam source policy fallback: {fallback}")
        for field in ("match_all", "match_any", "notice_any", "ignore_any"):
            if field in rule:
                validate_string_list(rule[field], field, item_id, errors)
        if mode in {"filtered-list", "dynamic-list"} and not any(
            field in rule for field in ("match_all", "match_any", "notice_any")
        ):
            errors.append(f"{item_id}: {mode} policy needs at least one matching keyword list")
        if rule.get("same_page_notice") is not None and not isinstance(rule["same_page_notice"], bool):
            errors.append(f"{item_id}: same_page_notice must be boolean")
        if rule.get("same_page_notice") is True:
            item = items_by_id[item_id]
            if item.get("official_url") != item.get("news_list_url"):
                errors.append(f"{item_id}: same_page_notice requires official_url to equal news_list_url")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate CampBrief exam official-source links.")
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "static" / "data" / "exams.json",
    )
    args = parser.parse_args()

    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Cannot read {args.path}: {error}", file=sys.stderr)
        return 1

    items = data.get("items")
    if not isinstance(items, list):
        print("items must be an array", file=sys.stderr)
        return 1

    errors: list[str] = []
    ids: set[str] = set()
    items_by_id: dict[str, dict[str, object]] = {}
    missing_notice_ids: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            errors.append("items contains a non-object entry")
            continue
        item_id = str(item.get("id", "")).strip()
        if not item_id:
            errors.append("an exam item is missing id")
            continue
        if item_id in ids:
            errors.append(f"duplicate id: {item_id}")
        ids.add(item_id)
        items_by_id[item_id] = item
        if not str(item.get("name", "")).strip():
            errors.append(f"{item_id}: missing name")

        for field in REQUIRED_LINK_FIELDS:
            validate_url(item.get(field), field, item_id, errors)

        notice_url = str(item.get("official_url", "")).strip()
        if notice_url:
            validate_url(notice_url, "official_url", item_id, errors)
        else:
            missing_notice_ids.add(item_id)
            if item_id not in FUTURE_NOTICE_PENDING:
                errors.append(f"{item_id}: missing current official notice URL")
            if item.get("status") != "pending":
                errors.append(f"{item_id}: a missing official notice is only allowed for pending exams")

    if data.get("total") != len(items):
        errors.append(f"total is {data.get('total')}, but items contains {len(items)} entries")
    if missing_notice_ids != FUTURE_NOTICE_PENDING:
        errors.append(
            "future-notice exception set does not match missing notice URLs: "
            + ", ".join(sorted(missing_notice_ids))
        )

    validate_source_policy(items_by_id, errors)

    if errors:
        print("Exam-source validation failed:", file=sys.stderr)
        print("\n".join(f"- {error}" for error in errors), file=sys.stderr)
        return 1

    print(f"Exam-source validation passed: {len(items)} entries, all active records have official notices.")
    print("Hermes source policy validation passed.")
    print("Notice not yet published (kept as pending): " + ", ".join(sorted(FUTURE_NOTICE_PENDING)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
