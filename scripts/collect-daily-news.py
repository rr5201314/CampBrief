#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CampBrief 每日资讯 - RSS 采集脚本（候选池生成器）

职责：
  从配置的 RSS 源抓取最新条目，归一化为统一的候选格式，写入 data/daily-news-raw.json。
  本脚本只做确定性采集，不做编辑判断。后续由 Hermes Agent 读取候选池做筛选、摘要、分类。

设计约束：
  - 纯 Python 标准库，无第三方依赖，termux 直接可跑
  - 单源失败不影响其他源，错误记录在 errors 字段
  - 输出路径相对脚本所在位置定位仓库根目录，不依赖 CWD

用法：
  python3 scripts/collect-daily-news.py
"""

import json
import os
import re
import ssl
import sys
import html
import urllib.request
import urllib.error
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

# 仓库根目录（脚本位于 <root>/scripts/ 下）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_OUTPUT = os.path.join(ROOT, "data", "daily-news-raw.json")

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
    # --- 每日趣闻（轻松有趣、有知识增量；不含八卦黑料） ---
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


def main():
    print(f"[collect] 开始采集，共 {len(SOURCES)} 个源")
    all_candidates = []
    errors = []

    for src in SOURCES:
        try:
            print(f"[collect] 抓取 {src['name']} ...", end=" ", flush=True)
            xml_text = fetch(src["url"])
            items = parse_rss(xml_text, src)
            items = items[:MAX_PER_SOURCE]
            all_candidates.extend(items)
            print(f"OK ({len(items)} 条)")
        except Exception as e:
            errors.append({"source": src["name"], "url": src["url"], "error": str(e)})
            print(f"失败: {e}")

    # 按发布时间降序（解析失败的排后面）
    def sort_key(c):
        try:
            return datetime.fromisoformat(c["published"])
        except (ValueError, TypeError):
            return datetime.min.replace(tzinfo=timezone.utc)
    all_candidates.sort(key=sort_key, reverse=True)

    output = {
        "collected_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "total": len(all_candidates),
        "sources_ok": len(SOURCES) - len(errors),
        "sources_failed": len(errors),
        "errors": errors,
        "candidates": all_candidates,
    }

    os.makedirs(os.path.dirname(RAW_OUTPUT), exist_ok=True)
    with open(RAW_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[collect] 完成: {len(all_candidates)} 条候选 -> {os.path.relpath(RAW_OUTPUT, ROOT)}")
    if errors:
        print(f"[collect] {len(errors)} 个源失败，详见 errors 字段")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[collect] 已中断")
        sys.exit(130)
