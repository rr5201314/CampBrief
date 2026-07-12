#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate published daily-news data before an automated release."""

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit


REQUIRED_FIELDS = ("id", "title", "url", "published", "summary", "detail", "source", "category")
SHARED_URL_SOURCE = "juya AI 日报"
CONTENT_ID_PATTERN = re.compile(r"^news-[0-9a-f]{16}$")
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source", "spm"}


def canonical_source_url(value: str) -> str:
    """Strip tracking-only URL parts before deriving a content ID."""
    parts = urlsplit(str(value or "").strip())
    query = [
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_QUERY_KEYS
    ]
    return urlunsplit((
        parts.scheme.lower(),
        parts.netloc.lower(),
        parts.path or "/",
        urlencode(query, doseq=True),
        "",
    ))


def build_content_id(item: dict) -> str:
    """Create an ID once for a new published item; existing IDs are never recalculated."""
    title = re.sub(r"\s+", " ", str(item.get("title", "")).strip()).casefold()
    published = str(item.get("published", "")).strip()
    payload = "\x1f".join((canonical_source_url(item.get("url", "")), published, title))
    return "news-" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def assign_missing_ids(data: dict) -> bool:
    """Backfill IDs and put the immutable identifier first for readable diffs."""
    items = data.get("items")
    if not isinstance(items, list):
        return False

    changed = False
    normalized_items = []
    for item in items:
        if not isinstance(item, dict):
            normalized_items.append(item)
            continue
        if not str(item.get("id", "")).strip():
            item = {"id": build_content_id(item), **{key: value for key, value in item.items() if key != "id"}}
            changed = True
        elif next(iter(item), None) != "id":
            item = {"id": item["id"], **{key: value for key, value in item.items() if key != "id"}}
            changed = True
        normalized_items.append(item)

    if changed:
        data["items"] = normalized_items
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate CampBrief daily-news JSON data.")
    parser.add_argument(
        "path",
        nargs="?",
        default=Path(__file__).resolve().parents[1] / "data" / "daily-news.json",
        type=Path,
    )
    parser.add_argument(
        "--assign-ids",
        action="store_true",
        help="为缺少 id 的已发布条目补齐稳定 ID，并保持现有 ID 不变",
    )
    args = parser.parse_args()

    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: 无法读取资讯数据：{error}")
        return 1

    items = data.get("items")
    if not isinstance(items, list):
        print("ERROR: items 必须是数组")
        return 1

    if args.assign_ids and assign_missing_ids(data):
        args.path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        items = data["items"]
        print(f"INFO: 已补齐资讯 ID：{args.path}")

    errors = []
    if data.get("total") != len(items):
        errors.append(f"total 为 {data.get('total')}，但 items 实际为 {len(items)}")

    url_groups = defaultdict(list)
    identity_seen = set()
    id_seen = set()
    for index, item in enumerate(items, start=1):
        missing = [field for field in REQUIRED_FIELDS if not str(item.get(field, "")).strip()]
        if missing:
            errors.append(f"第 {index} 条缺少字段：{', '.join(missing)}")
            continue

        content_id = str(item["id"]).strip()
        if not CONTENT_ID_PATTERN.fullmatch(content_id):
            errors.append(f"第 {index} 条 ID 格式无效：{content_id}")
        elif content_id in id_seen:
            errors.append(f"第 {index} 条与其他条目使用了重复 ID：{content_id}")
        id_seen.add(content_id)

        parsed = urlparse(item["url"])
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            errors.append(f"第 {index} 条 URL 无效：{item['url']}")

        identity = (item["url"], item["title"], item["published"])
        if identity in identity_seen:
            errors.append(f"第 {index} 条与其他条目重复（URL、标题、发布时间完全相同）：{item['title']}")
        identity_seen.add(identity)
        url_groups[item["url"]].append(item)

    for url, group in url_groups.items():
        if len(group) < 2:
            continue
        if any(item["source"] != SHARED_URL_SOURCE for item in group):
            titles = " / ".join(item["title"] for item in group)
            errors.append(f"非日报条目复用了同一原文 URL：{titles} -> {url}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    shared_urls = sum(1 for group in url_groups.values() if len(group) > 1)
    print(f"OK: {len(items)} 条资讯；{shared_urls} 个日报共享 URL 已按条目身份保留")
    return 0


if __name__ == "__main__":
    sys.exit(main())
