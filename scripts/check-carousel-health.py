#!/usr/bin/env python3
"""Read-only health report for the four list-page carousels."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from typing import Any

from temporal_status import effective_status, lifecycle_issues


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MIN_ITEMS = 3
MAX_ITEMS = 15
DEFAULT_MAX_AGE_HOURS = 36


def load(name: str) -> dict[str, Any]:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--at 必须包含时区")
    return parsed


def published_at(item: dict[str, Any]) -> datetime | None:
    value = item.get("published") or item.get("date")
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def categories(item: dict[str, Any]) -> set[str]:
    values = item.get("categories")
    if isinstance(values, list):
        return {str(value) for value in values}
    return {str(item.get("category"))} if item.get("category") else set()


def news_candidates(items: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    start = now - timedelta(hours=72)
    recent = [item for item in items if (stamp := published_at(item)) and start <= stamp <= now]
    result = [item for item in recent if int(item.get("priority") or 1) >= 4]
    if len(result) < MIN_ITEMS:
        existing_ids = {item.get("id") for item in result}
        result.extend(
            item
            for item in recent
            if int(item.get("priority") or 1) == 3 and item.get("id") not in existing_ids
        )
    result.sort(key=lambda item: published_at(item) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return result[:MAX_ITEMS]


def duplicate_ids(items: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for item in items:
        item_id = str(item.get("id") or "")
        if not item_id or item_id in seen:
            duplicates.append(item_id or "(missing-id)")
        seen.add(item_id)
    return duplicates


def lifecycle_carousel_candidate(
    item: dict[str, Any], kind: str, now: datetime
) -> bool:
    lifecycle = item.get("lifecycle")
    if not isinstance(lifecycle, dict) or lifecycle_issues(item):
        return False
    status = effective_status(item, kind, now, require_lifecycle=True)
    return status == "open" or (
        status == "pending" and lifecycle.get("mode") == "scheduled"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--at", help="固定核验时间，ISO8601 且带时区")
    parser.add_argument("--strict", action="store_true", help="将健康警告视为失败")
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=DEFAULT_MAX_AGE_HOURS,
        help="数据集最近更新时间的最大宽限小时数；设为 0 关闭（默认 36）",
    )
    args = parser.parse_args()
    try:
        now = parse_now(args.at)
    except ValueError as exc:
        parser.error(str(exc))

    daily_data = load("daily-news.json")
    github_data = load("github-trending.json")
    competition_data = load("competitions.json")
    exam_data = load("exams.json")
    daily_items = daily_data.get("items", [])
    github_items = github_data.get("items", [])
    competitions = competition_data.get("items", [])
    exams = exam_data.get("items", [])

    errors: list[str] = []
    warnings: list[str] = []
    for name, data in (
        ("daily-news", daily_data),
        ("github-trending", github_data),
        ("competitions", competition_data),
        ("exams", exam_data),
    ):
        raw_updated = data.get("last_updated")
        try:
            updated = datetime.fromisoformat(str(raw_updated).replace("Z", "+00:00"))
            if updated.tzinfo is None:
                raise ValueError
        except ValueError:
            errors.append(f"{name}: last_updated 缺失或不是带时区的 ISO8601")
            continue
        age_hours = (now - updated).total_seconds() / 3600
        print(f"[freshness] {name}: {age_hours:.1f} 小时前更新")
        if age_hours < -2:
            warnings.append(f"{name}: last_updated 比当前时间超前 {-age_hours:.1f} 小时")
        if args.max_age_hours > 0 and age_hours > args.max_age_hours:
            warnings.append(f"{name}: 已超过 {args.max_age_hours:g} 小时未更新")
    for name, items in (
        ("daily-news", daily_items),
        ("github-trending", github_items),
        ("competitions", competitions),
        ("exams", exams),
    ):
        duplicates = duplicate_ids(items)
        if duplicates:
            errors.append(f"{name}: id 缺失或重复: {', '.join(duplicates[:10])}")

    daily_carousel = news_candidates(
        [item for item in daily_items if "tech" not in categories(item)], now
    )
    tech_carousel = news_candidates(
        [item for item in daily_items if "tech" in categories(item)] + github_items, now
    )
    competition_eligible = [
        item
        for item in competitions
        if lifecycle_carousel_candidate(item, "competition", now)
    ]
    exam_eligible = [
        item
        for item in exams
        if lifecycle_carousel_candidate(item, "exam", now)
    ]
    module_counts = {
        "每日资讯": len(daily_carousel),
        "技术": len(tech_carousel),
        "竞赛": min(len(competition_eligible), MAX_ITEMS),
        "考试": min(len(exam_eligible), MAX_ITEMS),
    }
    for name, count in module_counts.items():
        state = "显示" if count >= MIN_ITEMS else "隐藏"
        print(f"[carousel] {name}: {count} 张候选卡片，页面将{state}轮播")
        if count < MIN_ITEMS:
            warnings.append(f"{name}: 候选不足 {MIN_ITEMS} 张")

    for name, items in (("competitions", competitions), ("exams", exams)):
        invalid = [
            (item.get("id", "(missing-id)"), issue)
            for item in items
            for issue in lifecycle_issues(item)
        ]
        errors.extend(f"{name}/{item_id}: {issue}" for item_id, issue in invalid)

    for name, items in (
        ("竞赛", competition_eligible),
        ("考试", exam_eligible),
    ):
        missing = [item.get("id", "(missing-id)") for item in items if not item.get("lifecycle")]
        covered = len(items) - len(missing)
        print(f"[coverage] {name}轮播候选: lifecycle {covered}/{len(items)}")
        if missing:
            warnings.append(f"{name}: {len(missing)} 个轮播候选仍依赖人工 status")

    for name, items, kind in (
        ("竞赛", competitions, "competition"),
        ("考试", exams, "exam"),
    ):
        unknown = [
            item.get("id", "(missing-id)")
            for item in items
            if effective_status(item, kind, now, require_lifecycle=True) == "unknown"
        ]
        print(f"[safety] {name}: {len(unknown)} 条当前显示为待核验并排除出首页/轮播")
        if unknown:
            warnings.append(f"{name}: {len(unknown)} 条状态待核验")

    for warning in warnings:
        print(f"[WARN] {warning}")
    for error in errors:
        print(f"[ERROR] {error}", file=sys.stderr)
    if errors or (warnings and args.strict):
        return 1
    print("Carousel health check completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
