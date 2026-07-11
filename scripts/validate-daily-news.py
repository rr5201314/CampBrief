#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate published daily-news data before an automated release."""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse


REQUIRED_FIELDS = ("title", "url", "published", "summary", "detail", "source", "category")
SHARED_URL_SOURCE = "juya AI 日报"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate CampBrief daily-news JSON data.")
    parser.add_argument(
        "path",
        nargs="?",
        default=Path(__file__).resolve().parents[1] / "data" / "daily-news.json",
        type=Path,
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

    errors = []
    if data.get("total") != len(items):
        errors.append(f"total 为 {data.get('total')}，但 items 实际为 {len(items)}")

    url_groups = defaultdict(list)
    identity_seen = set()
    for index, item in enumerate(items, start=1):
        missing = [field for field in REQUIRED_FIELDS if not str(item.get(field, "")).strip()]
        if missing:
            errors.append(f"第 {index} 条缺少字段：{', '.join(missing)}")
            continue

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
