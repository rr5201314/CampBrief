#!/usr/bin/env python3
"""Run deterministic maintenance checks and emit a compact Hermes handoff queue.

Exit codes:
  0  deterministic path completed; Hermes is not required
  10 new or changed exception tasks require Hermes
  20 the gate itself could not complete safely
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from temporal_status import effective_status, lifecycle_issues


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "igshid",
    "spm",
    "from",
    "source",
}
SCOPES = ("daily-news", "daily-news-juya", "exams", "competitions", "all")
CHECKS: dict[str, list[list[str]]] = {
    "daily-news": [
        ["scripts/validate-daily-news.py"],
        ["scripts/check-carousel-health.py"],
    ],
    "daily-news-juya": [
        ["scripts/validate-daily-news.py"],
        ["scripts/check-carousel-health.py"],
    ],
    "exams": [
        ["scripts/check-temporal-status.py", "--scope", "exams"],
        ["scripts/validate-exam-sources.py"],
        ["scripts/check-carousel-health.py"],
    ],
    "competitions": [
        ["scripts/check-temporal-status.py", "--scope", "competitions"],
        ["scripts/validate-competitions.py"],
        ["scripts/check-carousel-health.py"],
    ],
    "all": [["scripts/check-project.py"]],
}


def now_utc(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--at 必须包含时区")
    return parsed.astimezone(timezone.utc)


def canonical_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parts = urlsplit(text)
    except ValueError:
        return text
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return text
    query = [
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_QUERY_KEYS
    ]
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), "")
    )


def normalized_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).casefold()


def fingerprint(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def task(
    task_type: str,
    scope: str,
    key: str,
    *,
    severity: str = "normal",
    source: str = "",
    item_id: str = "",
    title: str = "",
    reason: str,
    payload: Any = None,
) -> dict[str, Any]:
    result = {
        "key": f"{scope}:{task_type}:{key}",
        "type": task_type,
        "scope": scope,
        "severity": severity,
        "source": source,
        "item_id": item_id,
        "title": title,
        "reason": reason,
    }
    if payload is not None:
        result["payload"] = payload
    result["fingerprint"] = fingerprint(result)
    return result


def parse_pool_argument(value: str) -> tuple[str, Path]:
    name, separator, raw_path = value.partition("=")
    if not separator or not name.strip() or not raw_path.strip():
        raise argparse.ArgumentTypeError("--candidate-pool 必须是 NAME=PATH")
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return name.strip(), path


def error_marker_task(scope: str, name: str, path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        message = path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError as error:
        message = str(error)
    return task(
        "source_error",
        scope,
        name,
        severity="high",
        source=name,
        reason=message or "上游脚本失败",
    )


def published_indexes(scope: str) -> dict[str, Any]:
    if scope.startswith("daily-news"):
        items = load_json(DATA_DIR / "daily-news.json").get("items", [])
        return {
            "items": items,
            "ids": {str(item.get("id")) for item in items if item.get("id")},
            "url_title": {
                (canonical_url(item.get("url")), normalized_text(item.get("title")))
                for item in items
            },
            "urls": {canonical_url(item.get("url")) for item in items},
        }
    if scope == "competitions":
        items = load_json(DATA_DIR / "competitions.json").get("items", [])
        return {
            "items": items,
            "by_id": {str(item.get("id")): item for item in items if item.get("id")},
            "by_url": {
                canonical_url(item.get("official_url") or item.get("official_site")): item
                for item in items
                if item.get("official_url") or item.get("official_site")
            },
            "by_name": {normalized_text(item.get("name")): item for item in items},
        }
    return {"items": []}


def candidate_differences(
    published: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Compare only facts the collector actually supplied; blanks never erase published facts."""
    differences: dict[str, dict[str, Any]] = {}
    for field in ("name", "organizer", "signup", "schedule"):
        candidate_value = candidate.get(field)
        if candidate_value in (None, ""):
            continue
        if normalized_text(candidate_value) != normalized_text(published.get(field)):
            differences[field] = {
                "published": published.get(field),
                "candidate": candidate_value,
            }
    candidate_url = canonical_url(
        candidate.get("official_url") or candidate.get("official_site") or candidate.get("url")
    )
    published_url = canonical_url(
        published.get("official_url") or published.get("official_site") or published.get("url")
    )
    if candidate_url and candidate_url != published_url:
        differences["url"] = {"published": published_url, "candidate": candidate_url}
    return differences


def pool_tasks(scope: str, name: str, path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return [
            task(
                "source_error",
                scope,
                name,
                severity="high",
                source=name,
                reason=f"候选池不存在：{path}",
            )
        ]
    try:
        data = load_json(path)
    except (OSError, json.JSONDecodeError) as error:
        return [
            task(
                "source_error",
                scope,
                name,
                severity="high",
                source=name,
                reason=f"候选池无法读取：{error}",
            )
        ]
    if not isinstance(data, dict):
        return [
            task(
                "source_error",
                scope,
                name,
                severity="high",
                source=name,
                reason="候选池顶层必须是对象",
            )
        ]

    result: list[dict[str, Any]] = []
    for index, error in enumerate(data.get("errors") or []):
        if not isinstance(error, dict):
            error = {"error": str(error)}
        source = str(error.get("source") or name)
        result.append(
            task(
                "source_error",
                scope,
                f"{source}:{index}",
                severity="high",
                source=source,
                reason=str(error.get("error") or "采集源返回错误"),
                payload=error,
            )
        )

    items = data.get("candidates") if isinstance(data.get("candidates"), list) else data.get("items")
    if not isinstance(items, list):
        result.append(
            task(
                "source_error",
                scope,
                f"{name}:shape",
                severity="high",
                source=name,
                reason="候选池缺少 candidates/items 数组",
            )
        )
        return result
    if not items and not result:
        result.append(
            task(
                "source_error",
                scope,
                f"{name}:empty",
                source=name,
                reason="候选池为空，脚本无法确认是确实无新增还是来源未命中",
            )
        )
        return result

    indexes = published_indexes(scope)
    for index, candidate in enumerate(items):
        if not isinstance(candidate, dict):
            result.append(
                task(
                    "source_error",
                    scope,
                    f"{name}:{index}",
                    source=name,
                    reason="候选不是对象",
                    payload=candidate,
                )
            )
            continue
        item_id = str(candidate.get("id") or "")
        title = str(candidate.get("title") or candidate.get("name") or "")
        url = canonical_url(
            candidate.get("url")
            or candidate.get("official_url")
            or candidate.get("official_site")
        )
        identity = item_id or fingerprint({"title": normalized_text(title), "url": url})

        if scope.startswith("daily-news"):
            exact = item_id in indexes["ids"] if item_id else False
            exact = exact or (url, normalized_text(title)) in indexes["url_title"]
            if exact:
                continue
            same_url = bool(url and url in indexes["urls"])
            result.append(
                task(
                    "candidate_review",
                    scope,
                    identity,
                    source=str(candidate.get("source") or name),
                    item_id=item_id,
                    title=title,
                    reason=(
                        "同一原文 URL 出现新的标题/拆分项，需要编辑判断"
                        if same_url
                        else "采集到尚未发布的新候选"
                    ),
                    payload=candidate,
                )
            )
            continue

        if scope == "competitions":
            existing = indexes["by_id"].get(item_id) if item_id else None
            existing = existing or indexes["by_url"].get(url)
            existing = existing or indexes["by_name"].get(normalized_text(title))
            if not existing:
                result.append(
                    task(
                        "candidate_review",
                        scope,
                        identity,
                        source=name,
                        item_id=item_id,
                        title=title,
                        reason="采集到尚未发布的新竞赛候选",
                        payload=candidate,
                    )
                )
                continue
            differences = candidate_differences(existing, candidate)
            if differences:
                result.append(
                    task(
                        "candidate_change",
                        scope,
                        str(existing.get("id") or identity),
                        source=name,
                        item_id=str(existing.get("id") or item_id),
                        title=title,
                        reason="已发布竞赛的来源字段发生变化，需要核验后合并",
                        payload={"differences": differences, "candidate": candidate},
                    )
                )
    return result


def exam_report_tasks(path: Path) -> list[dict[str, Any]]:
    scope = "exams"
    if not path.exists():
        return [
            task(
                "source_error",
                scope,
                "exam-report",
                severity="high",
                source="exam-notice-probe",
                reason=f"考试探测报告不存在：{path}",
            )
        ]
    try:
        report = load_json(path)
    except (OSError, json.JSONDecodeError) as error:
        return [
            task(
                "source_error",
                scope,
                "exam-report",
                severity="high",
                source="exam-notice-probe",
                reason=f"考试探测报告无法读取：{error}",
            )
        ]
    result: list[dict[str, Any]] = []
    clean_states = {"current", "reachable_current", "not_applicable"}
    for entry in report.get("items") or []:
        if not isinstance(entry, dict):
            continue
        status = str(entry.get("status") or "invalid")
        if status in clean_states:
            continue
        item_id = str(entry.get("id") or "missing-id")
        result.append(
            task(
                "exam_notice_review",
                scope,
                item_id,
                severity="high" if status in {"source_error", "no_match"} else "normal",
                source="exam-notice-probe",
                item_id=item_id,
                title=str(entry.get("name") or ""),
                reason=str(entry.get("reason") or f"考试来源探测状态：{status}"),
                payload=entry,
            )
        )
    return result


def daily_link_report_tasks(path: Path) -> list[dict[str, Any]]:
    scope = "daily-news"
    if not path.exists():
        return [
            task(
                "source_error",
                scope,
                "daily-link-report",
                severity="high",
                source="daily-news-link-check",
                reason=f"资讯链接检查报告不存在：{path}",
            )
        ]
    try:
        report = load_json(path)
    except (OSError, json.JSONDecodeError) as error:
        return [
            task(
                "source_error",
                scope,
                "daily-link-report",
                severity="high",
                source="daily-news-link-check",
                reason=f"资讯链接检查报告无法读取：{error}",
            )
        ]

    result: list[dict[str, Any]] = []
    for entry in report.get("results") or []:
        if not isinstance(entry, dict):
            continue
        state = str(entry.get("state") or "invalid")
        if state == "ok":
            continue
        ids = [str(item) for item in entry.get("ids") or [] if str(item)]
        url = canonical_url(entry.get("url"))
        key = ",".join(ids) or fingerprint(url)
        if state == "broken":
            reason = "已发布资讯原文返回确定性失效响应，需要核验替换或下架"
        elif state == "restricted":
            reason = "已发布资讯原文返回访问限制，需要用浏览器或原始来源定向复核"
        elif state == "error":
            reason = "已发布资讯原文出现网络或解析错误，需要定向复核"
        else:
            reason = f"资讯链接检查返回未知状态：{state}"
        result.append(
            task(
                "link_review",
                scope,
                key,
                severity="high" if state in {"broken", "invalid"} else "normal",
                source="daily-news-link-check",
                item_id=ids[0] if len(ids) == 1 else "",
                title=" / ".join(str(item) for item in entry.get("titles") or []),
                reason=reason,
                payload=entry,
            )
        )
    return result


def data_status_tasks(scope: str, current: datetime) -> list[dict[str, Any]]:
    sources: list[tuple[str, str, Path]] = []
    if scope in {"exams", "all"}:
        sources.append(("exams", "exam", DATA_DIR / "exams.json"))
    if scope in {"competitions", "all"}:
        sources.append(("competitions", "competition", DATA_DIR / "competitions.json"))
    result: list[dict[str, Any]] = []
    for name, kind, path in sources:
        try:
            items = load_json(path).get("items", [])
        except (OSError, json.JSONDecodeError):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id") or "missing-id")
            issues = lifecycle_issues(item)
            if issues:
                result.append(
                    task(
                        "lifecycle_error",
                        name,
                        item_id,
                        severity="high",
                        item_id=item_id,
                        title=str(item.get("name") or ""),
                        reason="；".join(issues),
                    )
                )
                continue
            effective = effective_status(
                item, kind, current, require_lifecycle=True
            )
            if effective == "unknown":
                result.append(
                    task(
                        "status_review",
                        name,
                        item_id,
                        severity="high",
                        item_id=item_id,
                        title=str(item.get("name") or ""),
                        reason="当前状态缺少可靠生命周期或已超过复核期限",
                        payload={"stored_status": item.get("status"), "lifecycle": item.get("lifecycle")},
                    )
                )
            elif item.get("status") == "ongoing" and not item.get("lifecycle"):
                result.append(
                    task(
                        "status_review",
                        name,
                        item_id,
                        item_id=item_id,
                        title=str(item.get("name") or ""),
                        reason="比赛中状态缺少结束边界，无法自动收敛为已完赛",
                    )
                )
    return result


def content_completion_tasks(scope: str) -> list[dict[str, Any]]:
    if scope not in {"daily-news", "all"}:
        return []
    try:
        items = load_json(DATA_DIR / "github-trending.json").get("items", [])
    except (OSError, json.JSONDecodeError):
        return []
    result: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "missing-id")
        for repo in item.get("repos") or []:
            if not isinstance(repo, dict):
                continue
            missing = [
                field
                for field in ("chinese_summary", "solves_what")
                if not str(repo.get(field) or "").strip()
                or not re.search(r"[\u3400-\u9fff]", str(repo.get(field) or ""))
            ]
            if missing:
                name = str(repo.get("name") or "missing-repo")
                result.append(
                    task(
                        "content_completion",
                        "daily-news",
                        f"{item_id}:{name}",
                        item_id=item_id,
                        title=name,
                        reason=f"GitHub 趋势项目字段为空或缺少中文，需要编辑补充：{', '.join(missing)}",
                        payload=repo,
                    )
                )
    return result


def scope_worktree_changed(scope: str) -> bool:
    paths_by_scope = {
        "daily-news": ["data/daily-news.json", "data/github-trending.json"],
        "daily-news-juya": ["data/daily-news.json"],
        "exams": ["data/exams.json"],
        "competitions": ["data/competitions.json"],
        "all": ["data"],
    }
    completed = subprocess.run(
        ["git", "diff", "--quiet", "--", *paths_by_scope[scope]],
        cwd=ROOT,
        check=False,
    )
    return completed.returncode == 1


def touch_last_updated(scope: str, current: datetime) -> bool:
    files_by_scope = {
        "daily-news": [DATA_DIR / "daily-news.json"],
        "daily-news-juya": [DATA_DIR / "daily-news.json"],
        "exams": [DATA_DIR / "exams.json"],
        "competitions": [DATA_DIR / "competitions.json"],
    }
    changed = False
    timestamp = current.astimezone(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")
    for path in files_by_scope.get(scope, []):
        data = load_json(path)
        if data.get("last_updated") == timestamp:
            continue
        data["last_updated"] = timestamp
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        changed = True
    return changed


def run_checks(scope: str, fix: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    checks: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []
    changed = False
    commands = [list(command) for command in CHECKS[scope]]
    if fix and scope in {"exams", "competitions"}:
        commands[0].append("--fix")
    elif fix and scope == "all":
        commands.insert(0, ["scripts/check-temporal-status.py", "--fix"])

    tracked_paths = []
    if scope in {"exams", "all"}:
        tracked_paths.append(DATA_DIR / "exams.json")
    if scope in {"competitions", "all"}:
        tracked_paths.append(DATA_DIR / "competitions.json")
    before = {path: path.read_bytes() for path in tracked_paths if path.exists()}

    for command in commands:
        completed = subprocess.run(
            [sys.executable, *command],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        output = (completed.stdout + completed.stderr).strip()
        check = {
            "command": " ".join(["python", *command]),
            "exit_code": completed.returncode,
            "status": "passed" if completed.returncode == 0 else "failed",
        }
        if output:
            check["output_tail"] = output[-4000:]
        checks.append(check)
        if completed.returncode:
            tasks.append(
                task(
                    "validation_error",
                    scope,
                    fingerprint(command),
                    severity="high",
                    source=command[0],
                    reason=f"批量校验失败：{' '.join(command)}",
                    payload={"exit_code": completed.returncode, "output_tail": output[-4000:]},
                )
            )
    changed = any(path.exists() and path.read_bytes() != content for path, content in before.items())
    changed = changed or scope_worktree_changed(scope)
    return checks, tasks, changed


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "tasks": {}}
    try:
        state = load_json(path)
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "tasks": {}}
    return state if isinstance(state, dict) and isinstance(state.get("tasks"), dict) else {"version": 1, "tasks": {}}


def apply_state(
    tasks: list[dict[str, Any]], state: dict[str, Any], current: datetime, retry_hours: float
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    emitted: list[dict[str, Any]] = []
    suppressed: list[dict[str, Any]] = []
    previous = state.get("tasks", {})
    next_tasks: dict[str, Any] = {}
    retry_delta = timedelta(hours=retry_hours)
    for entry in tasks:
        record = previous.get(entry["key"], {})
        last_raw = record.get("last_emitted")
        try:
            last_emitted = datetime.fromisoformat(str(last_raw).replace("Z", "+00:00"))
            if last_emitted.tzinfo is None:
                raise ValueError
            last_emitted = last_emitted.astimezone(timezone.utc)
        except (TypeError, ValueError):
            last_emitted = None
        should_emit = (
            record.get("fingerprint") != entry["fingerprint"]
            or not record.get("acknowledged_at")
            or last_emitted is None
            or current - last_emitted >= retry_delta
        )
        if should_emit:
            emitted.append(entry)
            emitted_at = current.isoformat()
            acknowledged_at = None
        else:
            suppressed.append(
                {
                    "key": entry["key"],
                    "type": entry["type"],
                    "reason": "与上次已交接异常相同，仍在重试抑制窗口内",
                }
            )
            emitted_at = record["last_emitted"]
            acknowledged_at = record.get("acknowledged_at")
        next_tasks[entry["key"]] = {
            "fingerprint": entry["fingerprint"],
            "last_emitted": emitted_at,
            "last_seen": current.isoformat(),
        }
        if acknowledged_at:
            next_tasks[entry["key"]]["acknowledged_at"] = acknowledged_at
    return emitted, suppressed, {"version": 1, "tasks": next_tasks}


def acknowledge_report(report_path: Path, state_path: Path, current: datetime) -> int:
    try:
        report = load_json(report_path)
        state = load_state(state_path)
    except (OSError, json.JSONDecodeError) as error:
        print(f"[FATAL] 无法读取交接报告或状态：{error}", file=sys.stderr)
        return 20
    acknowledged = 0
    records = state.get("tasks", {})
    for entry in report.get("tasks") or []:
        if not isinstance(entry, dict):
            continue
        record = records.get(entry.get("key"))
        if not isinstance(record, dict) or record.get("fingerprint") != entry.get("fingerprint"):
            continue
        record["acknowledged_at"] = current.isoformat()
        acknowledged += 1
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as error:
        print(f"[FATAL] 无法写入异常确认状态：{error}", file=sys.stderr)
        return 20
    print(f"[maintenance] acknowledged={acknowledged} report={report_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=SCOPES, required=True)
    parser.add_argument(
        "--candidate-pool",
        action="append",
        default=[],
        type=parse_pool_argument,
        metavar="NAME=PATH",
        help="采集器候选池，可重复传入",
    )
    parser.add_argument("--exam-report", type=Path, help="collect-exam-notices.py 生成的报告")
    parser.add_argument(
        "--daily-link-report",
        type=Path,
        help="check-daily-news-links.py 生成的报告",
    )
    parser.add_argument(
        "--error-marker",
        action="append",
        default=[],
        type=parse_pool_argument,
        metavar="NAME=PATH",
        help="存在时转为 source_error 的上游错误文件，可重复传入",
    )
    parser.add_argument("--report", type=Path, help="机器可读交接报告路径")
    parser.add_argument("--state", type=Path, help="本地异常去重状态路径")
    parser.add_argument("--ack", type=Path, help="确认某份交接报告已由 Hermes 成功处理")
    parser.add_argument("--retry-after-hours", type=float, default=72.0)
    parser.add_argument("--fix", action="store_true", help="先确定性同步 scheduled 状态")
    parser.add_argument(
        "--touch-last-updated",
        action="store_true",
        help="仅在当前没有任何异常时，确定性写入本次成功核验时间",
    )
    parser.add_argument("--at", help="固定运行时间，ISO8601 且带时区")
    parser.add_argument("--no-state", action="store_true", help="不读取或写入异常去重状态")
    args = parser.parse_args()
    if args.retry_after_hours < 0:
        parser.error("--retry-after-hours 不能小于 0")
    try:
        current = now_utc(args.at)
    except ValueError as error:
        parser.error(str(error))

    report_path = args.report or ROOT / "local-notes" / "maintenance" / f"{args.scope}-handoff.json"
    state_path = args.state or ROOT / "local-notes" / "maintenance" / f"{args.scope}-state.json"
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    if not state_path.is_absolute():
        state_path = ROOT / state_path
    if args.ack:
        if args.no_state:
            parser.error("--ack 不能与 --no-state 同时使用")
        ack_path = args.ack if args.ack.is_absolute() else ROOT / args.ack
        return acknowledge_report(ack_path, state_path, current)

    try:
        checks, all_tasks, changed = run_checks(args.scope, args.fix)
        all_tasks.extend(data_status_tasks(args.scope, current))
        all_tasks.extend(content_completion_tasks(args.scope))
        for name, path in args.candidate_pool:
            all_tasks.extend(pool_tasks(args.scope, name, path))
        for name, path in args.error_marker:
            marker_task = error_marker_task(args.scope, name, path)
            if marker_task:
                all_tasks.append(marker_task)
        if args.exam_report:
            exam_path = args.exam_report if args.exam_report.is_absolute() else ROOT / args.exam_report
            all_tasks.extend(exam_report_tasks(exam_path))
        if args.daily_link_report:
            link_path = (
                args.daily_link_report
                if args.daily_link_report.is_absolute()
                else ROOT / args.daily_link_report
            )
            all_tasks.extend(daily_link_report_tasks(link_path))

        unique = {entry["key"]: entry for entry in all_tasks}
        all_tasks = sorted(
            unique.values(),
            key=lambda entry: (
                0 if entry["severity"] == "high" else 1,
                entry["type"],
                entry["key"],
            ),
        )
        if args.touch_last_updated and not all_tasks:
            changed = touch_last_updated(args.scope, current) or changed
        if args.no_state:
            emitted, suppressed, next_state = all_tasks, [], {"version": 1, "tasks": {}}
        else:
            emitted, suppressed, next_state = apply_state(
                all_tasks, load_state(state_path), current, args.retry_after_hours
            )

        decision = "hermes_required" if emitted else ("script_changes_ready" if changed else "no_action")
        report = {
            "schema_version": 1,
            "generated_at": current.isoformat(),
            "scope": args.scope,
            "decision": decision,
            "exit_code": 10 if emitted else 0,
            "summary": {
                "checks": len(checks),
                "checks_failed": sum(check["exit_code"] != 0 for check in checks),
                "deterministic_changes": changed,
                "tasks_emitted": len(emitted),
                "tasks_suppressed": len(suppressed),
                "current_exceptions": len(all_tasks),
            },
            "checks": checks,
            "tasks": emitted,
            "suppressed": suppressed,
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if not args.no_state:
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state_path.write_text(json.dumps(next_state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception as error:  # Gate 自身失败必须与业务异常分开。
        print(f"[FATAL] maintenance gate failed: {error}", file=sys.stderr)
        return 20

    print(
        f"[maintenance] scope={args.scope} decision={decision} "
        f"tasks={len(emitted)} suppressed={len(suppressed)} report={report_path}"
    )
    return 10 if emitted else 0


if __name__ == "__main__":
    raise SystemExit(main())
