#!/usr/bin/env python3
"""Shared deterministic lifecycle status rules for exams and competitions."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import re
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


BOUNDARY_FIELDS = (
    "registration_start",
    "registration_end",
    "event_start",
    "event_end",
)
DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
OFFSET_INSTANT_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$"
)


def _date_value(value: str) -> date | None:
    if not DATE_ONLY_RE.fullmatch(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _instant_value(value: str) -> datetime | None:
    if not OFFSET_INSTANT_RE.fullmatch(value):
        return None
    if _date_value(value[:10]) is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def boundary_type(value: Any) -> str:
    if not isinstance(value, str):
        return "invalid"
    if _date_value(value) is not None:
        return "date"
    if _instant_value(value) is not None:
        return "instant"
    return "invalid"


def lifecycle_issues(item: dict[str, Any]) -> list[str]:
    lifecycle = item.get("lifecycle")
    if lifecycle is None:
        return []
    if not isinstance(lifecycle, dict):
        return ["lifecycle 必须是对象"]

    mode = lifecycle.get("mode")
    if mode not in {"scheduled", "rolling", "manual"}:
        return ["lifecycle.mode 必须是 scheduled、rolling 或 manual"]
    if mode != "scheduled":
        issues: list[str] = []
        verified_at = _instant_value(str(lifecycle.get("verified_at", "")))
        review_after = _instant_value(str(lifecycle.get("review_after", "")))
        if verified_at is None:
            issues.append(f"{mode} lifecycle 必须提供带时区的 verified_at")
        if review_after is None:
            issues.append(f"{mode} lifecycle 必须提供带时区的 review_after")
        if verified_at is not None and review_after is not None and verified_at >= review_after:
            issues.append("verified_at 必须早于 review_after")
        if verified_at is not None and review_after is not None and review_after - verified_at > timedelta(hours=72):
            issues.append("manual/rolling 的复核有效期不得超过 72 小时")
        return issues

    issues: list[str] = []
    populated = [field for field in BOUNDARY_FIELDS if lifecycle.get(field)]
    if not populated:
        issues.append("scheduled lifecycle 至少需要一个时间边界")
    if item.get("status") == "open" and not lifecycle.get("registration_end"):
        issues.append("scheduled 的 open 状态必须提供 registration_end")

    types: dict[str, str] = {}
    for field in populated:
        value_type = boundary_type(lifecycle[field])
        types[field] = value_type
        if value_type == "invalid":
            issues.append(f"{field} 必须是 YYYY-MM-DD 或带时区的 ISO8601 时间")

    if "date" in types.values():
        try:
            ZoneInfo(str(lifecycle.get("time_zone", "")))
        except (ZoneInfoNotFoundError, ValueError):
            issues.append("使用日期值时必须提供有效的 lifecycle.time_zone")
    if lifecycle.get("verified_at") and _instant_value(str(lifecycle["verified_at"])) is None:
        issues.append("verified_at 必须是带时区的 ISO8601 时间")

    for start, end in (("registration_start", "registration_end"), ("event_start", "event_end")):
        if not lifecycle.get(start) or not lifecycle.get(end):
            continue
        start_type = types.get(start)
        end_type = types.get(end)
        if start_type == end_type == "date" and _date_value(lifecycle[start]) > _date_value(lifecycle[end]):
            issues.append(f"{start} 不能晚于 {end}")
        if start_type == end_type == "instant" and _instant_value(lifecycle[start]) > _instant_value(lifecycle[end]):
            issues.append(f"{start} 不能晚于 {end}")
        if start_type != end_type and {start_type, end_type} == {"date", "instant"}:
            try:
                zone = ZoneInfo(str(lifecycle.get("time_zone", "")))
            except (ZoneInfoNotFoundError, ValueError):
                continue
            start_day = (
                _date_value(lifecycle[start])
                if start_type == "date"
                else _instant_value(lifecycle[start]).astimezone(zone).date()
            )
            end_day = (
                _date_value(lifecycle[end])
                if end_type == "date"
                else _instant_value(lifecycle[end]).astimezone(zone).date()
            )
            if start_day > end_day:
                issues.append(f"{start} 不能晚于 {end}")
    return issues


def _boundary_started(value: str | None, now: datetime, time_zone: str | None) -> bool:
    if not value:
        return False
    value_type = boundary_type(value)
    if value_type == "date":
        return now.astimezone(ZoneInfo(str(time_zone))).date() >= _date_value(value)
    return now >= _instant_value(value)


def _boundary_passed(value: str | None, now: datetime, time_zone: str | None) -> bool:
    """Date-only end boundaries include the whole local calendar day."""
    if not value:
        return False
    value_type = boundary_type(value)
    if value_type == "date":
        return now.astimezone(ZoneInfo(str(time_zone))).date() > _date_value(value)
    return now > _instant_value(value)


def effective_status(
    item: dict[str, Any],
    kind: str,
    now: datetime | None = None,
    require_lifecycle: bool = False,
) -> str | None:
    """Derive status from lifecycle; preserve stored status when lifecycle is absent or manual."""
    status = item.get("status")
    lifecycle = item.get("lifecycle")
    if not isinstance(lifecycle, dict):
        return "unknown" if require_lifecycle and status == "open" else status
    issues = lifecycle_issues(item)
    if issues:
        return "unknown" if require_lifecycle and status == "open" else status

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("now 必须包含时区")
    if lifecycle.get("mode") != "scheduled":
        review_after = _instant_value(lifecycle["review_after"])
        if current > review_after and status != "done":
            return "unknown"
        return status
    time_zone = lifecycle.get("time_zone")

    registration_started = (
        _boundary_started(lifecycle.get("registration_start"), current, time_zone)
        if lifecycle.get("registration_start")
        else True
    )
    registration_ended = _boundary_passed(lifecycle.get("registration_end"), current, time_zone)
    event_started = _boundary_started(lifecycle.get("event_start"), current, time_zone)
    event_ended = _boundary_passed(lifecycle.get("event_end"), current, time_zone)

    if event_ended:
        return "done"
    if lifecycle.get("registration_start") and not registration_started:
        return "pending"
    if lifecycle.get("registration_end") and registration_started and not registration_ended:
        return "open"
    if registration_ended:
        if kind == "competition" and event_started:
            return "ongoing"
        return "closed"
    if kind == "competition" and event_started:
        return "ongoing"
    return status
