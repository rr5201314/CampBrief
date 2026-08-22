#!/usr/bin/env python3
"""Collect third-party exam radar leads; never publish them as exam facts.

A radar lead is only a prompt for Hermes to locate and verify an official notice.
This script deliberately writes no public data and never treats third-party dates as
publishable facts.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "scripts" / "exam-radar-sources.json"
DEFAULT_STATE = ROOT / "local-notes" / "maintenance" / "exam-radar-state.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Accept-Encoding": "identity",
}


class TableParser(HTMLParser):
    """Extract text and links from ordinary HTML tables without dependencies."""

    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.tables: list[list[list[dict[str, Any]]]] = []
        self._table_stack: list[list[list[dict[str, Any]]]] = []
        self._row: list[dict[str, Any]] | None = None
        self._cell: dict[str, Any] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "table":
            table: list[list[dict[str, Any]]] = []
            self.tables.append(table)
            self._table_stack.append(table)
            return
        if not self._table_stack:
            return
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = {"text": [], "links": []}
        elif tag == "a" and self._cell is not None:
            href = dict(attrs).get("href") or ""
            if href:
                self._cell["links"].append(urljoin(self.base_url, href))

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell["text"].append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._cell is not None and self._row is not None:
            text = re.sub(r"\s+", " ", unescape("".join(self._cell["text"]))).strip()
            self._row.append({"text": text, "links": self._cell["links"]})
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table_stack:
            if self._row:
                self._table_stack[-1].append(self._row)
            self._row = None
        elif tag == "table" and self._table_stack:
            self._table_stack.pop()


def normalized(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).strip()


def http_url(value: Any) -> str:
    text = str(value or "").strip()
    parts = urlsplit(text)
    return text if parts.scheme in {"http", "https"} and parts.netloc else ""


def fetch(url: str, timeout: float) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
        content_type = response.headers.get("Content-Type", "")
    charset = re.search(r"charset=([\w-]+)", content_type, re.I)
    encodings = [charset.group(1)] if charset else []
    encodings.extend(["utf-8", "gb18030"])
    for encoding in encodings:
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def table_header_index(table: list[list[dict[str, Any]]]) -> tuple[int, dict[str, int]] | None:
    required = {"地区", "报名时间", "缴费时间", "资格审核", "报名公告"}
    for row_index, row in enumerate(table):
        index = {normalized(cell["text"]): position for position, cell in enumerate(row)}
        if required.issubset(index):
            return row_index, index
    return None


def candidate_id(source_id: str, region: str, notice_url: str) -> str:
    payload = f"{source_id}|{region}|{notice_url}".encode("utf-8")
    return f"exam-radar-{hashlib.sha256(payload).hexdigest()[:12]}"


def is_prediction(candidate: dict[str, Any], markers: list[str]) -> bool:
    haystack = " ".join(str(value) for value in candidate.values()).casefold()
    return any(str(marker).casefold() in haystack for marker in markers)


def parse_233_regional_signup_table(source: dict[str, Any], html: str) -> tuple[list[dict[str, Any]], int]:
    parser = TableParser(str(source["url"]))
    parser.feed(html)
    matching_headers: list[tuple[list[list[dict[str, Any]]], int, dict[str, int]]] = []
    for table in parser.tables:
        header = table_header_index(table)
        if header:
            matching_headers.append((table, header[0], header[1]))
    if not matching_headers:
        raise ValueError("未找到包含地区、报名时间、缴费时间、资格审核、报名公告的表格")

    header_table, header_row, columns = matching_headers[0]
    column_count = len(columns)
    data_tables = [
        table
        for table in parser.tables
        if any(len(row) >= column_count for row in table)
    ]
    if not data_tables:
        raise ValueError("找到雷达表头，但未找到对应数据行")
    table = max(data_tables, key=lambda value: sum(len(row) >= column_count for row in value))
    # 233 puts the header in an outer table and its rows in a nested table. Other
    # providers may keep both in one table, so retain the latter layout as well.
    data_rows = table[header_row + 1 :] if table is header_table else table
    source_id = str(source["id"])
    provider = str(source["provider"])
    year = int(source["year"])
    exam_name = str(source["exam_name"])
    markers = [str(value) for value in source.get("forbidden_markers") or []]
    candidates: list[dict[str, Any]] = []
    rejected_predictions = 0

    for row in data_rows:
        if len(row) <= max(columns.values()):
            continue
        region = normalized(row[columns["地区"]]["text"])
        registration = normalized(row[columns["报名时间"]]["text"])
        payment = normalized(row[columns["缴费时间"]]["text"])
        qualification_review = normalized(row[columns["资格审核"]]["text"])
        notice_cell = row[columns["报名公告"]]
        notice_url = next((http_url(link) for link in reversed(notice_cell["links"]) if http_url(link)), "")
        if not region or not registration or not notice_url:
            continue
        candidate = {
            "id": candidate_id(source_id, region, notice_url),
            "kind": "third_party_lead",
            "source": provider,
            "radar_source_id": source_id,
            "radar_url": str(source["url"]),
            "url": notice_url,
            "third_party_notice_url": notice_url,
            "title": f"{year}年{region}{exam_name}报名公告",
            "exam_family": str(source["exam_family"]),
            "exam_name": exam_name,
            "year": year,
            "period": str(source["period"]),
            "region": region,
            "registration": registration,
            "payment": payment,
            "qualification_review": qualification_review,
            "official_required": bool(source.get("official_required", True)),
        }
        if is_prediction(candidate, markers):
            rejected_predictions += 1
            continue
        candidates.append(candidate)

    max_candidates = int(source.get("max_candidates", len(candidates)))
    return candidates[:max_candidates], rejected_predictions


PARSERS = {"233-regional-signup-table": parse_233_regional_signup_table}


def load_sources(path: Path, only_ids: set[str]) -> list[dict[str, Any]]:
    config = json.loads(path.read_text(encoding="utf-8"))
    sources = config.get("sources")
    if not isinstance(sources, list):
        raise ValueError("雷达来源配置必须包含 sources 数组")
    result: list[dict[str, Any]] = []
    required = {"id", "provider", "url", "parser", "exam_family", "exam_name", "year", "period"}
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("雷达来源必须是对象")
        missing = sorted(required - source.keys())
        if missing:
            raise ValueError(f"雷达来源缺少字段：{', '.join(missing)}")
        if source["parser"] not in PARSERS:
            raise ValueError(f"不支持的雷达解析器：{source['parser']}")
        if not http_url(source["url"]):
            raise ValueError(f"雷达来源 URL 非法：{source['url']}")
        if only_ids and source["id"] not in only_ids:
            continue
        result.append(source)
    if only_ids and not result:
        raise ValueError("--only 未匹配任何雷达来源")
    return result


def parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--at 必须是带时区的 ISO8601")
    return parsed.astimezone(timezone.utc)


def content_fingerprint(candidate: dict[str, Any]) -> str:
    payload = json.dumps(candidate, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "sources": {}}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "sources": {}}
    return state if isinstance(state, dict) and isinstance(state.get("sources"), dict) else {"version": 1, "sources": {}}


def changed_candidates(
    candidates: list[dict[str, Any]], previous: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    fingerprints = {str(candidate["id"]): content_fingerprint(candidate) for candidate in candidates}
    changed = [candidate for candidate in candidates if previous.get(str(candidate["id"])) != fingerprints[str(candidate["id"])]]
    return changed, fingerprints


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--only", action="append", default=[], help="只运行指定 source id，可重复")
    parser.add_argument("--at", help="固定输出时间，ISO8601 且带时区")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout 必须大于 0")

    config_path = args.config if args.config.is_absolute() else ROOT / args.config
    state_path = args.state if args.state.is_absolute() else ROOT / args.state
    output_path = args.output if args.output.is_absolute() else ROOT / args.output
    try:
        generated_at = parse_time(args.at)
        sources = load_sources(config_path, set(args.only))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[FATAL] 无法读取雷达配置：{error}", file=sys.stderr)
        return 2

    previous_state = load_state(state_path)
    next_state = {"version": 1, "sources": dict(previous_state["sources"])}
    candidates: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    rejected_predictions = 0
    observed = 0
    unchanged = 0
    for source in sources:
        source_id = str(source["id"])
        try:
            html = fetch(str(source["url"]), args.timeout)
            parsed, rejected = PARSERS[str(source["parser"])](source, html)
            observed += len(parsed)
            prior = previous_state["sources"].get(source_id, {})
            changed, fingerprints = changed_candidates(parsed, prior.get("candidate_fingerprints", {}))
            candidates.extend(changed)
            unchanged += len(parsed) - len(changed)
            rejected_predictions += rejected
            next_state["sources"][source_id] = {
                "candidate_fingerprints": fingerprints,
                "last_checked": generated_at.isoformat(),
            }
        except Exception as error:
            errors.append({"source": source_id, "error": str(error)})

    output = {
        "schema_version": 1,
        "generated_at": generated_at.isoformat(),
        "source": "exam-third-party-radar",
        "no_change": not candidates and not errors,
        "summary": {
            "sources_configured": len(sources),
            "sources_failed": len(errors),
            "candidates_observed": observed,
            "candidates": len(candidates),
            "unchanged": unchanged,
            "rejected_predictions": rejected_predictions,
        },
        "candidates": candidates,
        "errors": errors,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(next_state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"[exam-radar] observed={observed} candidates={len(candidates)} "
        f"unchanged={unchanged} errors={len(errors)} -> {output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
