#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 daily-news.json 生成前端按需加载的派生视图文件。

为什么需要这一步
----------------
列表页只需要标题、摘要、来源等元信息，却要下载整份含 `detail` 正文的主文件
（886KB / gzip 293KB），其中正文占了近一半体积；而列表页只有用户真正搜索时
才需要正文。把正文拆出去后：

  static/data/daily-news-list.json    列表数据（不含 detail）  ~143KB gzip ← 首屏
  static/data/daily-news-search.json  id → detail 正文语料      ~174KB gzip ← 搜索时按需

`static/data/daily-news.json` 始终是唯一事实源，保持原样不动（采集流程与
`validate-daily-news.py` 的 REQUIRED_FIELDS 都依赖它带 detail）。本脚本只做
确定性派生，幂等：内容不变时重复运行输出字节相同。

派生文件的消费方与回退
----------------------
- 列表页优先读 `daily-news-list.json`，缺失（未生成/旧部署）时回退到源文件
- 列表页在搜索框获得焦点时才拉 `daily-news-search.json`；未加载时只搜标题与摘要
- 详情页、技术板块继续读源文件，不受影响

因此派生文件缺失或过期都不会让站点坏掉，最坏是退回旧行为。
"""

import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "static" / "data"
SOURCE_PATH = DATA_DIR / "daily-news.json"
LIST_PATH = DATA_DIR / "daily-news-list.json"
SEARCH_PATH = DATA_DIR / "daily-news-search.json"
TZ = timezone(timedelta(hours=8))


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(path: Path, payload) -> tuple:
    """写文件；内容（除 generated_at 外）未变化时不重写，避免无意义 diff。

    返回 (字节数, 是否写入)。
    """
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    size = len(text.encode("utf-8"))
    if path.is_file():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old = None
        if isinstance(old, dict):
            old.pop("generated_at", None)
            current = {key: value for key, value in payload.items() if key != "generated_at"}
            if old == current:
                return size, False
    path.write_text(text, encoding="utf-8")
    return size, True


def source_digest(items: list) -> str:
    """源文件 items 的内容摘要，供校验脚本判断派生视图是否同步。

    只看条目数与 last_updated 不够：`--assign-ids` 会改写条目内容却不改这两个值。
    """
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def build_views(source: dict) -> tuple[dict, dict]:
    items = source.get("items")
    if not isinstance(items, list):
        raise SystemExit("ERROR: daily-news.json 的 items 不是数组")

    stamp = {
        "last_updated": source.get("last_updated"),
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        # 供校验脚本判断派生文件是否与源文件同步
        "source_total": len(items),
        "source_digest": source_digest(items),
    }

    lite_items = []
    corpus = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        body = str(item.get("detail") or "").strip()
        lite_items.append({key: value for key, value in item.items() if key != "detail"})
        item_id = str(item.get("id") or "").strip()
        if item_id and body:
            corpus[item_id] = body

    lite = {**stamp, "total": len(lite_items), "items": lite_items}
    search = {**stamp, "total": len(corpus), "items": corpus}
    return lite, search


def main() -> int:
    if not SOURCE_PATH.is_file():
        print(f"ERROR: 找不到源文件 {SOURCE_PATH}")
        return 1

    try:
        source = load_json(SOURCE_PATH)
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: 无法读取 {SOURCE_PATH.name}：{error}")
        return 1

    lite, search = build_views(source)
    lite_bytes, lite_written = dump_json(LIST_PATH, lite)
    search_bytes, search_written = dump_json(SEARCH_PATH, search)

    changed = "已更新" if (lite_written or search_written) else "无变化，跳过写入"
    print(f"OK: 列表视图 {LIST_PATH.name} — {lite['total']} 条，{lite_bytes / 1024:.0f} KB")
    print(f"OK: 正文语料 {SEARCH_PATH.name} — {search['total']} 条，{search_bytes / 1024:.0f} KB")
    print(f"    {changed}（源文件 {SOURCE_PATH.name} {source.get('total')} 条，保持不动）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
