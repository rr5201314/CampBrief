#!/usr/bin/env python3
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "static" / "data" / "daily-news.json"
ARCHIVE_PATTERN = "daily-news-archive-{}.json"
ARCHIVE_INDEX_PATH = REPO_ROOT / "static" / "data" / "daily-news-archives.json"
TZ = timezone(timedelta(hours=8))


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(path: Path, payload):
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def parse_published(value: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        raise ValueError("missing published")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        normalized = " ".join(text.split())
        for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                return datetime.strptime(normalized, fmt)
            except ValueError:
                continue
        raise


def write_archive_index():
    """写出归档月份清单（前端只读这一个文件，不再逐月探测）。

    前端原先用「从主文件最早月份起逐月 fetch、遇 404 停」的方式探测归档是否存在：
    手机上一次列表页访问会顺带下载好几个完整归档（每个 ~170KB gzip），
    而它只想知道「有哪几个月可点」。归档是否存在只由文件系统决定，这里一次性列出。
    """
    months = sorted(
        path.stem[len("daily-news-archive-"):]
        for path in DATA_PATH.parent.glob("daily-news-archive-*.json")
    )
    dump_json(
        ARCHIVE_INDEX_PATH,
        {
            "last_updated": datetime.now(TZ).isoformat(timespec="seconds"),
            "archives": months,
        },
    )
    return months


def main():
    payload = load_json(DATA_PATH)
    items = payload.get("items", [])
    original_total = len(items)
    cutoff = datetime.now(TZ) - timedelta(days=30)

    keep_items = []
    archive_buckets = {}
    all_ids = []

    for item in items:
        item_id = item.get("id")
        if not item_id:
          raise AssertionError("found item without id")
        all_ids.append(item_id)
        published_at = parse_published(item.get("published"))
        if published_at >= cutoff:
            keep_items.append(item)
            continue
        month_key = published_at.astimezone(TZ).strftime("%Y-%m")
        archive_buckets.setdefault(month_key, []).append(item)

    duplicates = [item_id for item_id, count in Counter(all_ids).items() if count > 1]
    if duplicates:
        raise AssertionError(f"duplicate ids found: {duplicates[:10]}")

    archive_totals = {}
    newly_archived = {}
    for month_key, month_items in sorted(archive_buckets.items()):
        archive_path = DATA_PATH.parent / ARCHIVE_PATTERN.format(month_key)
        # 读取已有归档文件并合并（按 id 去重），避免覆盖丢失历史归档
        existing_items = []
        if archive_path.exists():
            try:
                existing_payload = load_json(archive_path)
                existing_items = existing_payload.get("items", [])
            except (json.JSONDecodeError, OSError):
                existing_items = []
        existing_ids = {item.get("id") for item in existing_items if item.get("id")}
        merged_items = list(existing_items)
        added = 0
        for item in month_items:
            if item.get("id") not in existing_ids:
                merged_items.append(item)
                existing_ids.add(item.get("id"))
                added += 1
        archive_payload = {
            "last_updated": payload.get("last_updated"),
            "items": merged_items,
        }
        dump_json(archive_path, archive_payload)
        archive_totals[month_key] = len(merged_items)
        newly_archived[month_key] = added

    payload["items"] = keep_items
    payload["total"] = len(keep_items)
    dump_json(DATA_PATH, payload)

    kept_total = len(keep_items)
    archived_total = sum(archive_totals.values())
    new_archived_total = sum(newly_archived.values())
    combined_total = kept_total + new_archived_total
    if combined_total != original_total:
        raise AssertionError(
            f"count mismatch: kept={kept_total} newly_archived={new_archived_total} original={original_total}"
        )

    archive_months = write_archive_index()

    print(f"主文件条数: {kept_total}")
    for month_key, count in archive_totals.items():
        print(f"归档 {month_key}: {count}")
    print(f"归档总条数: {archived_total}")
    print(f"总条数: {combined_total}")
    print(f"归档清单: {len(archive_months)} 个月份 → {ARCHIVE_INDEX_PATH.name}")
    print("校验: 主文件 + 归档 = 原条数，且 id 全局唯一")

    # 主文件内容变了，前端派生视图必须同步重建，否则列表页会显示过期资讯
    views_script = REPO_ROOT / "scripts" / "build-daily-news-views.py"
    result = subprocess.run(
        [sys.executable, str(views_script)], capture_output=True, text=True
    )
    if result.returncode != 0:
        raise SystemExit(f"ERROR: 派生视图重建失败：{result.stdout}{result.stderr}")
    print(result.stdout.strip())


if __name__ == "__main__":
    main()
