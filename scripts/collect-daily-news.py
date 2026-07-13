#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CampBrief 每日资讯 - RSS 采集脚本（候选池生成器）

职责：
  从配置的 RSS 源抓取最新条目，归一化为统一的候选格式，写入指定候选池。
  本脚本只做确定性采集，不做编辑判断。后续由 Hermes Agent 读取候选池做筛选、摘要、分类。

设计约束：
  - 纯 Python 标准库，无第三方依赖，termux 直接可跑
  - 单源失败不影响其他源，错误记录在 errors 字段
  - 输出路径相对脚本所在位置定位仓库根目录，不依赖 CWD

用法：
  python3 scripts/collect-daily-news.py              # 采集全部源
  python3 scripts/collect-daily-news.py --exclude "juya AI 日报"  # 排除指定源
  python3 scripts/collect-daily-news.py --only "juya AI 日报"      # 只采集指定源
  python3 scripts/collect-daily-news.py --output local-notes/candidate-pools/news.json
"""

import argparse
import json
import os
import re
import ssl
import sys
import html
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

# 仓库根目录（脚本位于 <root>/scripts/ 下）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_OUTPUT = os.path.join(ROOT, "data", "daily-news-raw.json")
# 所有采集窗口按北京时间自然日判断，避免手机时区或 RSS 原始时区造成跨日误收录。
BEIJING = timezone(timedelta(hours=8))

# 抓取超时（秒）
FETCH_TIMEOUT = 20
# 每个源最多取多少条候选，避免单源刷屏
MAX_PER_SOURCE = 15

# ---------------------------------------------------------------------------
# RSS 源配置
# category_hint 只是给 Agent 的参考分类，Agent 会做最终分类决策。
# 想新增源：在这里加一条即可。RSSHub 公共实例可能限流，失败会被跳过。
# ---------------------------------------------------------------------------

# RSSHub 公共实例（中文站点多需通过 RSSHub 获取）。公共实例稳定性一般，
# 失败会被脚本自动跳过并记录在 errors 字段，不影响其他源。
# 如有自建 RSSHub 实例，替换此处即可。
RSSHUB_BASE = "https://rsshub.app"

SOURCES = [
    # --- 技术动态 ---
    {
        "name": "Hacker News",
        "url": "https://hnrss.org/frontpage",
        "category_hint": "tech",
        "lang": "en",
    },
    {
        "name": "36氪",
        "url": "https://36kr.com/feed",
        "category_hint": "tech",
        "lang": "zh",
    },
    {
        "name": "少数派",
        "url": "https://sspai.com/feed",
        "category_hint": "tech",
        "lang": "zh",
    },
    {
        "name": "Solidot",
        "url": "https://www.solidot.org/index.rss",
        "category_hint": "tech",
        "lang": "zh",
    },
    # --- AI 资讯（juya AI 日报）---
    # juya 的特点：一篇日报包含多条 AI 资讯，Agent 需要从单篇日报中拆分出独立条目
    # RSS 主源，markdown 备份见 https://github.com/jujuyaya/juya-ai-daily/tree/main/BACKUP
    {
        "name": "juya AI 日报",
        "url": "https://daily.juya.uk/rss.xml",
        "category_hint": "ai",
        "lang": "zh",
        "split_required": True,
        "split_hint": "该源每篇文章是一份 AI 日报，包含多条独立资讯。Agent 需解析正文，按资讯条目拆分为多个候选，每条独立收录。",
    },
    # --- 体育（重大赛事） ---
    {
        "name": "BBC Sport",
        "url": "http://feeds.bbci.co.uk/sport/rss.xml?edition=int",
        "category_hint": "sports",
        "lang": "en",
    },
    {
        "name": "The Guardian Sport",
        "url": "https://www.theguardian.com/sport/rss",
        "category_hint": "sports",
        "lang": "en",
    },
    # --- 每日速览（轻量综合资讯、有知识增量；不含八卦黑料） ---
    {
        "name": "Atlas Obscura",
        "url": "https://www.atlasobscura.com/feeds/latest",
        "category_hint": "fun",
        "lang": "en",
    },
]

# 不少站点对非浏览器 UA 直接 403，RSS 阅读器普遍用浏览器 UA
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CampBriefBot/1.0; +https://github.com/campbrief/campbrief)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def strip_html(text):
    """去除 HTML 标签并还原实体，截断过长的描述。"""
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", text)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > 300:
        cleaned = cleaned[:300] + "…"
    return cleaned


def parse_date(raw):
    """把 RFC822(RSS) 或 ISO8601(Atom) 日期解析为带时区的 ISO 字符串。"""
    if not raw:
        return ""
    raw = raw.strip()
    # 尝试 RFC822（RSS pubDate 常见格式）
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except (TypeError, ValueError):
        pass
    # 尝试 ISO8601（Atom，Python 3.12 的 fromisoformat 支持 Z）
    try:
        iso = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        pass
    return raw  # 解析失败原样返回，交给 Agent 处理


def fetch(url):
    """抓取 URL 内容，返回文本。失败抛异常。"""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=ctx) as resp:
        data = resp.read()
        # RSSHub / 多数 RSS 源是 utf-8，带 BOM 时去掉
        if data.startswith(b"\xef\xbb\xbf"):
            data = data[3:]
        return data.decode("utf-8", errors="replace")


def parse_rss(xml_text, source):
    """解析 RSS 2.0 / Atom 1.0，返回候选条目列表。"""
    candidates = []
    root = ET.fromstring(xml_text)

    # RSS 2.0: <rss><channel><item>
    if root.tag == "rss" or root.tag.endswith("}rss"):
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            desc = item.findtext("description") or ""
            if title and link:
                candidates.append(build_candidate(title, link, pub, desc, source))
        return candidates

    # Atom: <feed xmlns="http://www.w3.org/2005/Atom"><entry>
    atom_ns = "{http://www.w3.org/2005/Atom}"
    if root.tag == atom_ns + "feed" or root.tag.endswith("}feed"):
        for entry in root.iter(atom_ns + "entry"):
            title_el = entry.find(atom_ns + "title")
            title = (title_el.text or "").strip() if title_el is not None else ""
            link_el = entry.find(atom_ns + "link")
            link = ""
            if link_el is not None:
                link = link_el.get("href", "") or ""
            pub = ""
            for pub_tag in ("published", "updated"):
                pub_el = entry.find(atom_ns + pub_tag)
                if pub_el is not None and pub_el.text:
                    pub = pub_el.text.strip()
                    break
            desc = ""
            for desc_tag in ("summary", "content"):
                desc_el = entry.find(atom_ns + desc_tag)
                if desc_el is not None and desc_el.text:
                    desc = desc_el.text
                    break
            if title and link:
                candidates.append(build_candidate(title, link, pub, desc, source))
        return candidates

    return candidates


def build_candidate(title, link, pub, desc, source):
    return {
        "title": html.unescape(title),
        "url": link,
        "published": parse_date(pub),
        "source": source["name"],
        "summary_raw": strip_html(desc),
        "category_hint": source["category_hint"],
        "lang": source["lang"],
    }


def load_existing_candidates(output_path):
    """读取已有候选池，返回 (candidates, errors) 或 ([], [])。"""
    if not os.path.exists(output_path):
        return [], []
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("candidates", []), data.get("errors", [])
    except (OSError, json.JSONDecodeError):
        return [], []


def merge_candidates(new_items, existing_items):
    """合并新旧候选，按 (url, title) 去重，保留新条目。"""
    seen = set()
    merged = []
    for item in new_items + existing_items:
        key = (item.get("url", ""), item.get("title", ""))
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def recent_candidates(candidates, now=None):
    """仅保留北京时间今天和前一天发布、且日期可解析的候选。"""
    now = now or datetime.now(BEIJING)
    allowed_dates = {now.date(), (now - timedelta(days=1)).date()}
    kept = []
    for item in candidates:
        published = str(item.get("published", "")).strip()
        try:
            parsed = datetime.fromisoformat(published.replace("Z", "+00:00"))
        except ValueError:
            try:
                normalized = re.sub(r"\s+", " ", published)
                parsed = datetime.strptime(normalized, "%Y-%m-%d %H:%M:%S %z")
            except ValueError:
                continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        if parsed.astimezone(BEIJING).date() in allowed_dates:
            kept.append(item)
    return kept


def main():
    parser = argparse.ArgumentParser(description="CampBrief RSS 采集脚本")
    parser.add_argument("--exclude", metavar="NAME", help="排除指定源（按 name 匹配，可逗号分隔多个）")
    parser.add_argument("--only", metavar="NAME", help="只采集指定源（按 name 匹配，可逗号分隔多个），结果合并到当前输出候选池")
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="候选池输出路径；相对路径以仓库根目录为基准，默认 data/daily-news-raw.json",
    )
    args = parser.parse_args()

    output_path = os.path.abspath(
        os.path.expanduser(args.output)
        if args.output and os.path.isabs(os.path.expanduser(args.output))
        else os.path.join(ROOT, os.path.expanduser(args.output or "data/daily-news-raw.json"))
    )

    exclude_names = {n.strip() for n in (args.exclude or "").split(",") if n.strip()}
    only_names = {n.strip() for n in (args.only or "").split(",") if n.strip()}

    # 确定本次采集的源
    if only_names:
        target_sources = [s for s in SOURCES if s["name"] in only_names]
        skipped = [s["name"] for s in SOURCES if s["name"] not in only_names]
        if skipped:
            print(f"[collect] --only 模式，跳过: {', '.join(skipped)}")
    elif exclude_names:
        target_sources = [s for s in SOURCES if s["name"] not in exclude_names]
        skipped = [s["name"] for s in SOURCES if s["name"] in exclude_names]
        if skipped:
            print(f"[collect] --exclude 模式，跳过: {', '.join(skipped)}")
    else:
        target_sources = SOURCES

    print(f"[collect] 开始采集，共 {len(target_sources)} 个源")
    new_candidates = []
    errors = []

    for src in target_sources:
        try:
            print(f"[collect] 抓取 {src['name']} ...", end=" ", flush=True)
            xml_text = fetch(src["url"])
            items = parse_rss(xml_text, src)
            items = items[:MAX_PER_SOURCE]
            new_candidates.extend(items)
            print(f"OK ({len(items)} 条)")
        except Exception as e:
            errors.append({"source": src["name"], "url": src["url"], "error": str(e)})
            print(f"失败: {e}")

    # --only 模式：合并到已有候选池
    if only_names:
        existing_candidates, existing_errors = load_existing_candidates(output_path)
        # 过滤掉与新采集同源的旧条目（同源用新数据覆盖）
        new_source_names = {s["name"] for s in target_sources}
        kept_existing = [c for c in existing_candidates if c.get("source") not in new_source_names]
        all_candidates = merge_candidates(new_candidates, kept_existing)
        # 合并 errors（去掉与新采集同源的旧错误）
        kept_existing_errors = [e for e in existing_errors if e.get("source") not in new_source_names]
        errors = kept_existing_errors + errors
        print(f"[collect] --only 模式：新增 {len(new_candidates)} 条，保留旧候选 {len(kept_existing)} 条，合并后 {len(all_candidates)} 条")
    else:
        all_candidates = new_candidates

    before_window_filter = len(all_candidates)
    all_candidates = recent_candidates(all_candidates)
    print(
        f"[collect] 北京时间窗口（今天和前一天）：保留 {len(all_candidates)} 条，"
        f"过滤 {before_window_filter - len(all_candidates)} 条过期或日期无法解析的候选"
    )

    # 按发布时间降序（解析失败的排后面）
    def sort_key(c):
        try:
            return datetime.fromisoformat(c["published"])
        except (ValueError, TypeError):
            return datetime.min.replace(tzinfo=timezone.utc)
    all_candidates.sort(key=sort_key, reverse=True)

    output = {
        "collected_at": datetime.now(BEIJING).isoformat(),
        "total": len(all_candidates),
        "sources_ok": len(target_sources) - len(errors),
        "sources_failed": len(errors),
        "errors": errors,
        "candidates": all_candidates,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    try:
        display_path = os.path.relpath(output_path, ROOT)
    except ValueError:
        # Windows 中绝对输出路径可能与仓库位于不同盘符，relpath 会抛异常。
        display_path = output_path
    print(f"[collect] 完成: {len(all_candidates)} 条候选 -> {display_path}")
    if errors:
        print(f"[collect] {len(errors)} 个源失败，详见 errors 字段")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[collect] 已中断")
        sys.exit(130)
