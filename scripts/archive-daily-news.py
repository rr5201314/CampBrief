#!/usr/bin/env python3
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "static" / "data" / "daily-news.json"
ARCHIVE_PATTERN = "daily-news-archive-{}.json"
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
    for month_key, month_items in sorted(archive_buckets.items()):
        archive_path = DATA_PATH.parent / ARCHIVE_PATTERN.format(month_key)
        archive_payload = {
            "last_updated": payload.get("last_updated"),
            "items": month_items,
        }
        dump_json(archive_path, archive_payload)
        archive_totals[month_key] = len(month_items)

    payload["items"] = keep_items
    dump_json(DATA_PATH, payload)

    kept_total = len(keep_items)
    archived_total = sum(archive_totals.values())
    combined_total = kept_total + archived_total
    if combined_total != original_total:
        raise AssertionError(
            f"count mismatch: kept={kept_total} archived={archived_total} original={original_total}"
        )

    print(f"主文件条数: {kept_total}")
    for month_key, count in archive_totals.items():
        print(f"归档 {month_key}: {count}")
    print(f"归档总条数: {archived_total}")
    print(f"总条数: {combined_total}")
    print("校验: 主文件 + 归档 = 原条数，且 id 全局唯一")


if __name__ == "__main__":
    main()
