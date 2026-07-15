#!/usr/bin/env python3
"""Validate the published GitHub Trending data and required editorial fields."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urlsplit


DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "github-trending.json"
CJK_RE = re.compile(r"[\u3400-\u9fff]")


def is_http_url(value: Any) -> bool:
    try:
        parsed = urlsplit(str(value or "").strip())
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["顶层必须是对象"]
    items = data.get("items")
    if not isinstance(items, list):
        return ["items 必须是数组"]
    if data.get("total") != len(items):
        errors.append(f"total={data.get('total')} 与 items 数量 {len(items)} 不一致")

    seen_ids: set[str] = set()
    for item_index, item in enumerate(items):
        label = f"items[{item_index}]"
        if not isinstance(item, dict):
            errors.append(f"{label} 必须是对象")
            continue
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            errors.append(f"{label} 缺少 id")
        elif item_id in seen_ids:
            errors.append(f"{label} id 重复：{item_id}")
        else:
            seen_ids.add(item_id)
        if not is_http_url(item.get("url")):
            errors.append(f"{label} url 不是有效 HTTP(S) 地址")
        repos = item.get("repos")
        if not isinstance(repos, list) or not repos:
            errors.append(f"{label} repos 必须是非空数组")
            continue
        for repo_index, repo in enumerate(repos):
            repo_label = f"{label}.repos[{repo_index}]"
            if not isinstance(repo, dict):
                errors.append(f"{repo_label} 必须是对象")
                continue
            name = str(repo.get("name") or "").strip()
            if not name:
                errors.append(f"{repo_label} 缺少 name")
            if not is_http_url(repo.get("url")):
                errors.append(f"{repo_label} url 不是有效 HTTP(S) 地址")
            for field in ("chinese_summary", "solves_what"):
                value = str(repo.get(field) or "").strip()
                if not value:
                    errors.append(f"{repo_label} 缺少 {field}")
                elif not CJK_RE.search(value):
                    errors.append(f"{repo_label} {field} 必须包含中文")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_PATH)
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: 无法读取 GitHub Trending 数据：{error}", file=sys.stderr)
        return 1
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"GitHub Trending validation passed: {len(data['items'])} lists.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
