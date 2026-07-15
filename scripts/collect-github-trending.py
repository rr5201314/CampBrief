#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CampBrief GitHub 趋势采集脚本

职责：
  抓取 GitHub 官方 Trending 页面（daily/weekly/monthly），提取 Top 10 仓库，
  生成榜单条目写入 static/data/github-trending.json。

榜单规则：
  - 日榜：每天采集，标题如「7月12日 GitHub趋势日榜」
  - 周榜：每周一采集，标题如「7月第2周 GitHub趋势周榜」
  - 月榜：每月1日采集，标题如「7月 GitHub趋势月榜」

数据结构：
  每个榜单条目包含 repos 数组（Top 10），每个 repo 含 name/url/language/stars/
  stars_delta/description/chinese_summary/solves_what。
  chinese_summary 和 solves_what 由脚本留空，后续由 Hermes skill 填充。

用法：
  python3 scripts/collect-github-trending.py                # 按日期自动判断采集哪些榜单
  python3 scripts/collect-github-trending.py --force-all    # 强制采集全部三种榜单（初始化用）
  python3 scripts/collect-github-trending.py --force daily  # 强制只采集日榜
"""

import argparse
import html
import json
import math
import os
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

# 仓库根目录（脚本位于 <root>/scripts/ 下）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "static", "data", "github-trending.json")

TRENDING_URL = "https://github.com/trending"
FETCH_TIMEOUT = 20
TOP_N = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 北京时区
CST = timezone(timedelta(hours=8))


def stable_id(trend_type, date_str):
    """生成稳定的榜单 ID，如 github-daily-2026-07-12"""
    return f"github-{trend_type}-{date_str}"


def fetch(url):
    """抓取 URL 内容，返回文本。"""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=ctx) as resp:
        data = resp.read()
        if data.startswith(b"\xef\xbb\xbf"):
            data = data[3:]
        return data.decode("utf-8", errors="replace")


def parse_trending(html_text):
    """解析 GitHub Trending 页面 HTML，提取仓库列表。"""
    repos = []
    articles = re.findall(r'<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>(.*?)</article>',
                          html_text, re.DOTALL)

    for article in articles:
        repo = {}

        link_match = re.search(r'<h2[^>]*>\s*<a[^>]*href="(/[^"]+)"', article)
        if not link_match:
            continue
        path = link_match.group(1).strip().split("?")[0].split("#")[0]
        if not path or path == "/":
            continue
        repo["full_name"] = path.lstrip("/")
        repo["url"] = f"https://github.com{path}"

        desc_match = re.search(r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>(.*?)</p>',
                               article, re.DOTALL)
        if desc_match:
            desc = re.sub(r"<[^>]+>", "", desc_match.group(1))
            desc = html.unescape(desc).strip()
        else:
            desc = ""
        repo["description"] = desc

        lang_match = re.search(r'itemprop="programmingLanguage"[^>]*>([^<]+)<', article)
        repo["language"] = lang_match.group(1).strip() if lang_match else ""

        stars_link = re.search(r'<a[^>]*href="[^"]+/stargazers"[^>]*>(.*?)</a>',
                               article, re.DOTALL)
        if stars_link:
            stars_text = re.sub(r"<[^>]+>", "", stars_link.group(1))
            nums = re.findall(r"[\d,]+", stars_text)
            repo["stars"] = int(nums[0].replace(",", "")) if nums else 0
        else:
            repo["stars"] = 0

        forks_link = re.search(r'<a[^>]*href="[^"]+/forks"[^>]*>(.*?)</a>',
                               article, re.DOTALL)
        if forks_link:
            forks_text = re.sub(r"<[^>]+>", "", forks_link.group(1))
            nums = re.findall(r"[\d,]+", forks_text)
            repo["forks"] = int(nums[0].replace(",", "")) if nums else 0
        else:
            repo["forks"] = 0

        today_match = re.search(r'([\d,]+)\s+stars\s+(today|this week|this month)', article)
        if today_match:
            repo["stars_delta"] = int(today_match.group(1).replace(",", ""))
            repo["trend_period"] = today_match.group(2)
        else:
            repo["stars_delta"] = 0
            repo["trend_period"] = ""

        repos.append(repo)

    return repos


def build_repo_entry(repo, rank):
    """把解析出的仓库对象转为榜单中的项目条目。"""
    return {
        "rank": rank,
        "name": repo.get("full_name", ""),
        "url": repo.get("url", ""),
        "language": repo.get("language") or "未知",
        "stars": repo.get("stars", 0),
        "forks": repo.get("forks", 0),
        "stars_delta": repo.get("stars_delta", 0),
        "trend_period": repo.get("trend_period", ""),
        "description": repo.get("description", ""),
        # 以下字段由 Hermes skill 后续填充，脚本留空
        "chinese_summary": "",
        "solves_what": "",
    }


def build_chart_entry(trend_type, repos, now):
    """构建一个榜单条目（日榜/周榜/月榜）。"""
    date_str = now.strftime("%Y-%m-%d")
    entry_id = stable_id(trend_type, date_str)

    # 中文标题
    month = now.month
    day = now.day
    if trend_type == "daily":
        title = f"{month}月{day}日 GitHub趋势日榜"
        period_label = "今日"
        url = f"{TRENDING_URL}?since=daily"
    elif trend_type == "weekly":
        week_of_month = math.ceil(day / 7)
        title = f"{month}月第{week_of_month}周 GitHub趋势周榜"
        period_label = "本周"
        url = f"{TRENDING_URL}?since=weekly"
    else:  # monthly
        title = f"{month}月 GitHub趋势月榜"
        period_label = "本月"
        url = f"{TRENDING_URL}?since=monthly"

    # 优先级规则：周榜/月榜固定 priority=4（最高），日榜默认 priority=2 由 agent 后续调整
    if trend_type in ("weekly", "monthly"):
        priority = 4
    else:
        priority = 2

    # 取 Top N
    top_repos = repos[:TOP_N]
    repo_entries = [build_repo_entry(r, i + 1) for i, r in enumerate(top_repos)]

    # 摘要
    lang_parts = []
    for r in top_repos[:5]:
        lang = r.get("language", "")
        if lang and lang not in lang_parts:
            lang_parts.append(lang)
    lang_summary = "、".join(lang_parts[:3]) if lang_parts else "多语言"
    summary = f"{title}，Top {len(repo_entries)} 项目涵盖 {lang_summary} 等，{period_label}社区最受关注的开源项目。"

    # detail 字段（用于搜索）
    detail_parts = []
    for r in repo_entries:
        detail_parts.append(f"{r['name']} - {r['description']}")
    detail = "\n".join(detail_parts)

    return {
        "id": entry_id,
        "title": title,
        "url": url,
        "date": date_str,
        "published": now.isoformat(),
        "summary": summary,
        "detail": detail,
        "priority": priority,
        "category": "tech",
        "subcategory": "github",
        "source": "GitHub Trending",
        "trend_type": trend_type,
        "repos": repo_entries,
    }


def load_existing():
    """读取已有数据，返回 items 列表。"""
    if not os.path.exists(OUTPUT):
        return []
    try:
        with open(OUTPUT, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("items", [])
    except (OSError, json.JSONDecodeError):
        return []


def merge_entries(new_entries, existing_items):
    """合并新旧条目：同 ID 覆盖，新条目追加，按日期降序排序。"""
    by_id = {item["id"]: item for item in existing_items}
    for entry in new_entries:
        by_id[entry["id"]] = entry  # 同 ID 覆盖

    all_items = list(by_id.values())
    # 按 published 降序
    all_items.sort(key=lambda x: x.get("published", ""), reverse=True)
    # 只保留最近 90 天的条目，避免文件无限增长
    cutoff = (datetime.now(CST) - timedelta(days=90)).isoformat()
    all_items = [item for item in all_items if item.get("published", "") >= cutoff]
    return all_items


def collect_trending(trend_type):
    """采集指定类型的趋势数据，返回 repos 列表。"""
    since_param = trend_type if trend_type != "monthly" else "monthly"
    url = f"{TRENDING_URL}?since={since_param}"
    print(f"[github-trending] 抓取 {trend_type}: {url}")
    html_text = fetch(url)
    repos = parse_trending(html_text)
    print(f"[github-trending] {trend_type}: 解析到 {len(repos)} 个仓库")
    return repos


def main():
    parser = argparse.ArgumentParser(description="CampBrief GitHub 趋势采集脚本")
    parser.add_argument("--force-all", action="store_true",
                        help="强制采集全部三种榜单（初始化用）")
    parser.add_argument("--force", choices=["daily", "weekly", "monthly"],
                        help="强制只采集指定类型")
    args = parser.parse_args()

    now = datetime.now(CST)

    # 确定要采集哪些榜单
    if args.force_all:
        types = ["daily", "weekly", "monthly"]
    elif args.force:
        types = [args.force]
    else:
        # 按日期自动判断
        types = ["daily"]
        if now.weekday() == 0:  # 周一
            types.append("weekly")
        if now.day == 1:  # 每月1日
            types.append("monthly")

    print(f"[github-trending] 采集类型: {', '.join(types)} ({now.strftime('%Y-%m-%d %H:%M')} 北京时间)")

    new_entries = []
    for trend_type in types:
        try:
            repos = collect_trending(trend_type)
            if not repos:
                print(f"[github-trending] {trend_type}: 未解析到仓库，跳过")
                continue
            entry = build_chart_entry(trend_type, repos, now)
            new_entries.append(entry)
            print(f"[github-trending] {trend_type}: 生成榜单 '{entry['title']}'，Top {len(entry['repos'])} 项目")
        except Exception as e:
            print(f"[github-trending] {trend_type}: 采集失败: {e}")

    if not new_entries:
        print("[github-trending] 未生成任何榜单条目")
        sys.exit(1)

    # 合并到已有数据
    existing_items = load_existing()
    all_items = merge_entries(new_entries, existing_items)

    output = {
        "last_updated": now.isoformat(),
        "source": "GitHub Trending",
        "total": len(all_items),
        "items": all_items,
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[github-trending] 完成: 新增/更新 {len(new_entries)} 条榜单，总计 {len(all_items)} 条 -> {os.path.relpath(OUTPUT, ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[github-trending] 已中断")
        sys.exit(130)
