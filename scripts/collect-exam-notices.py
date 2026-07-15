#!/usr/bin/env python3
"""Batch-probe exam official pages and report only unresolved notice discovery.

The script never edits exams.json and never parses dates into lifecycle fields. It only
checks source reachability and link matching; ambiguous/new/missing results are handed
to Hermes through maintenance-gate.py.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "exams.json"
DEFAULT_POLICY = (
    ROOT
    / "scripts"
    / "hermes"
    / "skills"
    / "CampBrief"
    / "campbrief-exams"
    / "source-policy.json"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Accept-Encoding": "identity",
}


class LinkParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.links: list[dict[str, str]] = []
        self._href = ""
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a" or self._href:
            return
        href = dict(attrs).get("href") or ""
        if href and not href.lower().startswith(("javascript:", "mailto:", "tel:")):
            self._href = urljoin(self.base_url, href)
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._href:
            return
        text = re.sub(r"\s+", " ", unescape(" ".join(self._text))).strip()
        self.links.append({"url": canonical_url(self._href), "text": text})
        self._href = ""
        self._text = []


def canonical_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parts = urlsplit(text)
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return text
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def decode_html(raw: bytes, content_type: str) -> str:
    charset_match = re.search(r"charset=([\w-]+)", content_type or "", re.I)
    candidates = [charset_match.group(1)] if charset_match else []
    head = raw[:4096].decode("ascii", errors="ignore")
    meta_match = re.search(r"charset=[\"']?([\w-]+)", head, re.I)
    if meta_match:
        candidates.append(meta_match.group(1))
    candidates.extend(["utf-8", "gb18030"])
    for charset in candidates:
        try:
            return raw.decode(charset)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def fetch(url: str, timeout: float) -> str:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        content_type = response.headers.get("Content-Type", "")
    return decode_html(raw, content_type)


def extract_links(html: str, base_url: str) -> list[dict[str, str]]:
    parser = LinkParser(base_url)
    parser.feed(html)
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, str]] = []
    for link in parser.links:
        identity = (link["url"], link["text"])
        if not link["url"] or identity in seen:
            continue
        seen.add(identity)
        result.append(link)
    return result


def visible_text(html: str) -> str:
    without_code = re.sub(r"<(script|style|noscript)\b[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", without_code))).strip()


def contains(value: str, terms: list[Any]) -> list[str]:
    folded = value.casefold()
    return [str(term) for term in terms if str(term).casefold() in folded]


def link_matches(link: dict[str, str], rule: dict[str, Any]) -> bool:
    blob = f"{link.get('text', '')} {link.get('url', '')}"
    ignore_any = rule.get("ignore_any") or []
    if contains(blob, ignore_any):
        return False
    match_all = rule.get("match_all") or []
    match_any = rule.get("match_any") or []
    notice_any = rule.get("notice_any") or []
    if match_all and len(contains(blob, match_all)) != len(match_all):
        return False
    if match_any and not contains(blob, match_any):
        return False
    if notice_any and not contains(blob, notice_any):
        return False
    return bool(match_all or match_any or notice_any)


def classify_item(
    item: dict[str, Any], rule: dict[str, Any], html: str | None, error: str | None
) -> dict[str, Any]:
    item_id = str(item.get("id") or "missing-id")
    base = {
        "id": item_id,
        "name": str(item.get("name") or ""),
        "mode": str(rule.get("mode") or "notice-list"),
        "news_list_url": str(item.get("news_list_url") or ""),
        "current_official_url": str(item.get("official_url") or ""),
    }
    if item.get("status") == "done":
        return {**base, "status": "not_applicable", "reason": "已结束期次不再探测新公告"}
    if error:
        return {**base, "status": "source_error", "reason": error}
    if html is None:
        return {**base, "status": "source_error", "reason": "来源未返回 HTML"}

    mode = str(rule.get("mode") or "notice-list")
    if mode == "national-portal":
        return {
            **base,
            "status": "reachable_current",
            "reason": "全国官方固定入口可访问",
        }
    if mode in {"schedule-page", "dynamic-list"} or rule.get("same_page_notice") is True:
        text = visible_text(html)
        if len(text) < 80:
            return {
                **base,
                "status": "needs_render",
                "reason": "来源返回内容过少或只有页面壳，需要 Hermes 渲染官方页面",
            }
        return {
            **base,
            "status": "content_review",
            "reason": "固定或动态官方页可访问；页面内容变化需由 Hermes 定向比较当前期次字段",
            "content_fingerprint": hashlib.sha256(text.encode("utf-8")).hexdigest()[:20],
            "content_excerpt": text[:500],
        }

    links = extract_links(html, base["news_list_url"])
    current_url = canonical_url(base["current_official_url"])
    list_url = canonical_url(base["news_list_url"])
    current_found = bool(
        current_url
        and (current_url == list_url or any(link["url"] == current_url for link in links))
    )
    matched = [link for link in links if link_matches(link, rule)]
    new_matches = [link for link in matched if link["url"] != current_url]

    if len(new_matches) == 1:
        return {
            **base,
            "status": "candidate",
            "reason": "发现一个与来源策略匹配、但尚未作为当前公告发布的链接",
            "candidates": new_matches,
            "current_found": current_found,
        }
    if len(new_matches) > 1:
        return {
            **base,
            "status": "ambiguous",
            "reason": "发现多个匹配链接，脚本无法安全判断当前期次",
            "candidates": new_matches[:20],
            "current_found": current_found,
        }
    if current_found:
        return {
            **base,
            "status": "current",
            "reason": "当前官方公告仍可在来源页中命中",
        }
    return {
        **base,
        "status": "no_match",
        "reason": "来源可访问，但当前公告和策略关键词均未命中",
        "link_count": len(links),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--at", help="固定报告时间，ISO8601 且带时区")
    args = parser.parse_args()
    if args.timeout <= 0 or args.workers <= 0:
        parser.error("--timeout 和 --workers 必须大于 0")
    try:
        generated_at = (
            datetime.fromisoformat(args.at.replace("Z", "+00:00"))
            if args.at
            else datetime.now(timezone.utc)
        )
        if generated_at.tzinfo is None:
            raise ValueError
    except ValueError:
        parser.error("--at 必须是带时区的 ISO8601")

    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
        policy = json.loads(args.policy.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"[FATAL] 无法读取考试数据或来源策略：{error}", file=sys.stderr)
        return 2
    items = [item for item in data.get("items", []) if isinstance(item, dict)]
    default_rule = policy.get("default") if isinstance(policy.get("default"), dict) else {}
    item_rules = policy.get("items") if isinstance(policy.get("items"), dict) else {}

    urls = sorted(
        {
            str(item.get("news_list_url"))
            for item in items
            if item.get("status") != "done" and item.get("news_list_url")
        }
    )
    fetched: dict[str, tuple[str | None, str | None]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(fetch, url, args.timeout): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                fetched[url] = (future.result(), None)
            except Exception as error:  # 单个来源失败不终止批次。
                fetched[url] = (None, str(error))

    report_items: list[dict[str, Any]] = []
    for item in items:
        rule = dict(default_rule)
        specific = item_rules.get(str(item.get("id")))
        if isinstance(specific, dict):
            rule.update(specific)
        url = str(item.get("news_list_url") or "")
        if item.get("status") == "done":
            html, error = None, None
        elif not url:
            html, error = None, "缺少 news_list_url"
        else:
            html, error = fetched.get(url, (None, "来源未执行"))
        report_items.append(classify_item(item, rule, html, error))

    counts: dict[str, int] = {}
    for entry in report_items:
        counts[entry["status"]] = counts.get(entry["status"], 0) + 1
    report = {
        "schema_version": 1,
        "generated_at": generated_at.astimezone(timezone.utc).isoformat(),
        "source": "exam-official-pages",
        "summary": {
            "items": len(report_items),
            "unique_urls_fetched": len(urls),
            "source_errors": sum(1 for _, error in fetched.values() if error),
            "status_counts": counts,
        },
        "items": report_items,
    }
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[exam-probe] {counts} -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
