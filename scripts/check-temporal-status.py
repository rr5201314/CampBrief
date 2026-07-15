#!/usr/bin/env python3
"""Validate and optionally synchronize structured lifecycle statuses."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

from temporal_status import effective_status, lifecycle_issues


ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "exams": (ROOT / "static" / "data" / "exams.json", "exam", {"pending", "open", "closed", "done"}),
    "competitions": (
        ROOT / "static" / "data" / "competitions.json",
        "competition",
        {"pending", "open", "closed", "ongoing", "done"},
    ),
}
ACTIVE_STATUSES = {"pending", "open", "closed", "ongoing"}


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("--at 必须包含时区")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=["all", *SOURCES], default="all")
    parser.add_argument("--at", help="固定核验时间，ISO8601 且带时区")
    parser.add_argument("--fix", action="store_true", help="同步结构化条目的 status")
    parser.add_argument(
        "--strict-coverage",
        action="store_true",
        help="将活跃条目缺少 lifecycle 视为错误（补齐存量前不建议用于自动发布）",
    )
    args = parser.parse_args()

    try:
        now = parse_now(args.at)
    except (ValueError, argparse.ArgumentTypeError) as exc:
        parser.error(str(exc))

    selected = SOURCES if args.scope == "all" else {args.scope: SOURCES[args.scope]}
    errors: list[str] = []
    drift_count = 0

    for name, (path, kind, allowed_statuses) in selected.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data.get("items", [])
        changed = 0
        covered = 0
        uncovered_active: list[str] = []

        for item in items:
            item_id = item.get("id", "(missing-id)")
            status = item.get("status")
            if status not in allowed_statuses:
                errors.append(f"{name}/{item_id}: 非法 status={status!r}")
                continue

            issues = lifecycle_issues(item)
            errors.extend(f"{name}/{item_id}: {issue}" for issue in issues)
            lifecycle = item.get("lifecycle")
            if lifecycle:
                covered += 1
            elif status in ACTIVE_STATUSES:
                uncovered_active.append(item_id)

            if issues or not lifecycle or lifecycle.get("mode") != "scheduled":
                continue
            expected = effective_status(item, kind, now)
            if expected != status:
                drift_count += 1
                print(f"[DRIFT] {name}/{item_id}: {status} -> {expected}")
                if args.fix:
                    item["status"] = expected
                    changed += 1

        print(
            f"[temporal] {name}: {len(items)} 条，lifecycle 覆盖 {covered} 条，"
            f"活跃未覆盖 {len(uncovered_active)} 条"
        )
        if uncovered_active:
            preview = ", ".join(uncovered_active[:10])
            suffix = " ..." if len(uncovered_active) > 10 else ""
            print(f"[WARN] {name} 活跃未覆盖示例: {preview}{suffix}")
            if args.strict_coverage:
                errors.append(f"{name}: {len(uncovered_active)} 个活跃条目缺少 lifecycle")

        if changed:
            data["last_updated"] = now.astimezone(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"[FIXED] {name}: 已同步 {changed} 个状态")

    if errors:
        for error in errors:
            print(f"[ERROR] {error}", file=sys.stderr)
        return 1
    if drift_count and not args.fix:
        print(f"[ERROR] 发现 {drift_count} 个结构化状态漂移；使用 --fix 同步", file=sys.stderr)
        return 1
    print("Temporal status check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
