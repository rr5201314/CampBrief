#!/usr/bin/env python3
"""
我爱竞赛网 (52jingsai.com) 竞赛数据采集脚本

从 /bisai 列表页抓取竞赛标题和详情链接，
再逐条访问详情页提取报名时间、主办方等信息，
输出为 CampBrief competitions.json 兼容格式。

用法：
  python3 scripts/collect-52jingsai.py                     # 采集并输出到 stdout
  python3 scripts/collect-52jingsai.py --output data/out.json  # 写入文件
  python3 scripts/collect-52jingsai.py --max 20             # 最多采集 20 条
"""

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

BASE_URL = "https://www.52jingsai.com"
LIST_URL = f"{BASE_URL}/bisai"
FETCH_TIMEOUT = 15
CST = timezone(timedelta(hours=8))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch(url):
    """抓取 GBK 编码页面，返回 UTF-8 字符串。"""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        raw = resp.read()
    return raw.decode("gbk", errors="replace")


def parse_list(html):
    """从列表页提取竞赛链接和标题。优先用 img title 完整标题。"""
    items = []
    seen = set()

    # 匹配模式：<a href="article-xxx"><img ... title="完整标题" /></a>
    for m in re.finditer(
        r'href="(article-(\d+)-\d+\.html)"[^>]*>.*?title="([^"]+)"',
        html, re.DOTALL
    ):
        path, aid, title = m.group(1), m.group(2), m.group(3).strip()
        if aid in seen:
            continue
        # 过滤非竞赛条目
        skip_keywords = ["输入页码", "快速跳转", "真题答案", "学科赛事汇总", "评奖评优", "防水墙", "保卫网站", "远离侵害", "四级真题", "六级真题"]
        if any(kw in title for kw in skip_keywords):
            continue
        if title and len(title) > 6:
            seen.add(aid)
            items.append({"id": aid, "title": title, "url": f"{BASE_URL}/{path}"})

    # 补充：如果 img title 没抓到，用 <a> 文本兜底
    if len(items) < 3:
        for m in re.finditer(r'href="(article-(\d+)-\d+\.html)"[^>]*>([^<]+)', html):
            path, aid, title = m.group(1), m.group(2), m.group(3).strip()
            if aid not in seen and title and len(title) > 6:
                seen.add(aid)
                items.append({"id": aid, "title": title, "url": f"{BASE_URL}/{path}"})

    return items


def parse_detail(html):
    """从详情页提取主办方、报名时间等信息。"""
    info = {}

    # meta description 结构化数据
    desc_m = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', html)
    if desc_m:
        desc = desc_m.group(1)
        # 主办方
        org_m = re.search(r'主办[单位]*[：:]\s*([^|,，]+)', desc)
        if org_m:
            info["organizer"] = org_m.group(1).strip()
        # 报名时间
        time_m = re.search(r'报名时间[：:]\s*([^|,，]+)', desc)
        if time_m:
            info["signup_time"] = time_m.group(1).strip()

    # 正文中的关键词
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)

    # 截止日期
    deadline_m = re.search(r'截止[日期]*[：:]\s*(\d{4}[-年]\d{1,2}[-月]\d{1,2})', text)
    if deadline_m:
        info["deadline"] = deadline_m.group(1)

    # 分类（从面包屑或标签提取）
    cat_m = re.search(r'(英语竞赛|设计比赛|数学竞赛|科技竞赛|商业创业|公益比赛|体育比赛|文学写作|艺术爱好|其他比赛)', text)
    if cat_m:
        info["category"] = cat_m.group(1)

    return info


def stable_id(title, url):
    """生成稳定 ID。"""
    raw = f"{title}|{url}"
    return "comp-52jingsai-" + hashlib.sha256(raw.encode()).hexdigest()[:12]


def main():
    parser = argparse.ArgumentParser(description="我爱竞赛网竞赛采集")
    parser.add_argument("--output", help="输出 JSON 文件路径")
    parser.add_argument("--max", type=int, default=30, help="最多采集条数")
    parser.add_argument("--detail", action="store_true", help="是否抓取详情页（慢）")
    args = parser.parse_args()

    now = datetime.now(CST)

    # 1. 抓取列表页
    print(f"[52jingsai] 抓取列表页: {LIST_URL}", file=sys.stderr)
    try:
        list_html = fetch(LIST_URL)
    except Exception as e:
        print(f"[52jingsai] 列表页抓取失败: {e}", file=sys.stderr)
        sys.exit(1)

    items = parse_list(list_html)[:args.max]
    print(f"[52jingsai] 解析到 {len(items)} 条竞赛", file=sys.stderr)

    if not items:
        print("[52jingsai] 无数据，退出", file=sys.stderr)
        sys.exit(1)

    # 2. 可选：抓取详情页补充信息
    if args.detail:
        for i, item in enumerate(items):
            try:
                print(f"[52jingsai] [{i+1}/{len(items)}] {item['title'][:30]}...", file=sys.stderr)
                detail_html = fetch(item["url"])
                detail = parse_detail(detail_html)
                item.update(detail)
            except Exception as e:
                print(f"[52jingsai] 详情页失败: {e}", file=sys.stderr)

    # 3. 转换为 CampBrief 格式
    competitions = []
    for item in items:
        comp = {
            "id": stable_id(item["title"], item["url"]),
            "name": item["title"],
            "official_url": item["url"],
            "status": "open",
            "tier": "other",
            "signup": item.get("signup_time", ""),
            "schedule": item.get("deadline", ""),
            "organizer": item.get("organizer", ""),
            "summary": f"来源：我爱竞赛网。{item.get('category', '')}",
        }
        competitions.append(comp)

    # 4. 输出
    result = {
        "last_updated": now.isoformat(),
        "source": "52jingsai",
        "total": len(competitions),
        "items": competitions,
    }

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"[52jingsai] 写入 {args.output}: {len(competitions)} 条", file=sys.stderr)
    else:
        print(output_json)

    print(f"[52jingsai] 完成: {len(competitions)} 条竞赛", file=sys.stderr)


if __name__ == "__main__":
    main()
