#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check whether published daily-news source URLs are currently reachable."""

import argparse
import json
import sys
import time
from collections import OrderedDict, Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "daily-news.json"
USER_AGENT = "Mozilla/5.0 (compatible; CampBriefLinkCheck/1.0)"
RESTRICTED_STATUS_CODES = {401, 403, 429}


def load_urls(path: Path) -> OrderedDict[str, list[dict[str, str]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data.get("items")
    if not isinstance(items, list):
        raise ValueError("items 必须是数组")

    grouped = OrderedDict()
    for item in items:
        url = str(item.get("url", "")).strip()
        title = str(item.get("title", "未命名资讯")).strip()
        content_id = str(item.get("id", "")).strip()
        if not url:
            raise ValueError(f"资讯缺少 URL：{title}")
        if not content_id:
            raise ValueError(f"资讯缺少 ID：{title}")
        grouped.setdefault(url, []).append({"id": content_id, "title": title})
    return grouped


def check_url(url: str, timeout: float) -> dict:
    started = time.monotonic()
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Range": "bytes=0-32767",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response.read(1)
            status_code = response.getcode()
            return {
                "state": "ok",
                "status_code": status_code,
                "final_url": response.geturl(),
                "content_type": response.headers.get_content_type(),
                "error": "",
                "elapsed_ms": round((time.monotonic() - started) * 1000),
            }
    except HTTPError as error:
        state = "restricted" if error.code in RESTRICTED_STATUS_CODES else "broken"
        return {
            "state": state,
            "status_code": error.code,
            "final_url": error.geturl() or url,
            "content_type": error.headers.get_content_type() if error.headers else "",
            "error": str(error.reason),
            "elapsed_ms": round((time.monotonic() - started) * 1000),
        }
    except (URLError, TimeoutError, OSError, ValueError) as error:
        return {
            "state": "error",
            "status_code": None,
            "final_url": url,
            "content_type": "",
            "error": str(getattr(error, "reason", error)),
            "elapsed_ms": round((time.monotonic() - started) * 1000),
        }


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="检查每日资讯原文链接的可访问性。")
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--workers", type=int, default=6, help="并发请求数，默认 6")
    parser.add_argument("--timeout", type=float, default=12, help="单个链接超时秒数，默认 12")
    parser.add_argument("--report", type=Path, help="可选：写入 JSON 检查报告")
    parser.add_argument(
        "--fail-on-restricted",
        action="store_true",
        help="将 401、403、429 等受限响应视为失败，用于自动发布前的严格检查",
    )
    args = parser.parse_args()

    if args.workers < 1 or args.timeout <= 0:
        parser.error("--workers 必须大于 0，--timeout 必须大于 0")

    try:
        grouped_urls = load_urls(args.path)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: 无法加载资讯数据：{error}")
        return 1

    results_by_url = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(check_url, url, args.timeout): url
            for url in grouped_urls
        }
        for future in as_completed(futures):
            url = futures[future]
            try:
                results_by_url[url] = future.result()
            except Exception as error:  # 保证单个请求异常不终止整次检查
                results_by_url[url] = {
                    "state": "error",
                    "status_code": None,
                    "final_url": url,
                    "content_type": "",
                    "error": str(error),
                    "elapsed_ms": 0,
                }

    results = []
    for url, entries in grouped_urls.items():
        result = {
            "url": url,
            "ids": [entry["id"] for entry in entries],
            "titles": [entry["title"] for entry in entries],
            **results_by_url[url],
        }
        results.append(result)
        if result["state"] != "ok":
            status = result["status_code"] if result["status_code"] is not None else "网络错误"
            print(f"{result['state'].upper()}: {status} | {' / '.join(result['ids'])} | {' / '.join(result['titles'])} | {url}")

    counts = Counter(result["state"] for result in results)
    report = {
        "checked_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "data_file": str(args.path.resolve()),
        "summary": {
            "unique_urls": len(results),
            "ok": counts["ok"],
            "broken": counts["broken"],
            "restricted": counts["restricted"],
            "error": counts["error"],
        },
        "results": results,
    }
    if args.report:
        write_report(args.report, report)
        print(f"报告已写入：{args.report}")

    print(
        "检查完成："
        f"{counts['ok']} 可用，{counts['broken']} 失效，"
        f"{counts['restricted']} 受限，{counts['error']} 网络错误"
    )
    failures = counts["broken"] + counts["error"]
    if args.fail_on_restricted:
        failures += counts["restricted"]
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
