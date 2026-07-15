#!/usr/bin/env python3
"""
赛氪 (saikr.com) 竞赛数据采集脚本

从 https://www.saikr.com/index/hot/contest 热门竞赛排行榜抓取竞赛卡片，
该页面为服务端渲染（SSR）HTML，无需浏览器自动化即可直接解析。

输出为 CampBrief competitions.json 兼容格式，与 collect-52jingsai.py 对齐。

用法：
  python3 scripts/collect-saikr.py                         # 采集并输出到 stdout
  python3 scripts/collect-saikr.py --output data/out.json  # 写入文件
  python3 scripts/collect-saikr.py --max 20                # 最多采集 20 条
"""

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from html import unescape

BASE_URL = "https://www.saikr.com"
LIST_URL = f"{BASE_URL}/index/hot/contest"
FETCH_TIMEOUT = 20
CST = timezone(timedelta(hours=8))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 非竞赛条目过滤关键词（标题命中即丢弃）
# 赛氪热门榜会混入资讯/活动/课程类条目，虽然 URL 都是 /vse/ 开头
SKIP_KEYWORDS = [
    "保研", "考研", "保送研究生", "定位分析", "规划", "冲刺清单",
    "时间轴", "复盘", "必备网站", "工具合集", "区别", "值不值得",
    "失败经历", "放弃保研",
]


def fetch(url):
    """抓取页面，返回 UTF-8 字符串。"""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def parse_list(html):
    """从热门竞赛排行榜解析竞赛卡片。

    页面结构：
      <li class="item [one|two|three]">
        <a href="/vse/XXX" class="imgbox mr20"><img class="img" src="..." /></a>
        <div class="list-info">
          <a href="/vse/XXX">竞赛标题</a>
          <p class="text">状态提示文本</p>
          <div class="btm-info">
            <div class="linkbox">
              <a href="/u/XXX"><img class="img-logo" src="..."/><p>主办方</p></a>
            </div>
            <span class="mr20">30.3万 浏览</span>
            <span>5258 关注</span>
          </div>
        </div>
      </li>
    """
    items = []
    seen_vse = set()

    li_blocks = re.findall(
        r'<li[^>]+class="item[^"]*"[^>]*>(.*?)</li>',
        html,
        re.DOTALL
    )

    for block in li_blocks:
        # 1. 竞赛详情链接（必须是 /vse/ 开头，过滤 /news/detail/ 等资讯类）
        link_m = re.search(r'<a[^>]+href="(/vse/[^"]+)"[^>]*>([^<]+)</a>', block)
        if not link_m:
            continue
        vse_path = link_m.group(1)
        vse_id = vse_path.rsplit("/", 1)[-1]

        if vse_id in seen_vse:
            continue
        seen_vse.add(vse_id)

        name = unescape(link_m.group(2).strip())

        # 2. 非竞赛过滤
        if any(kw in name for kw in SKIP_KEYWORDS):
            continue

        # 3. 封面图
        img_m = re.search(r'<img[^>]+class="img"[^>]+src="([^"]+)"', block)
        cover = img_m.group(1) if img_m else ""

        # 4. 状态提示文本（截断到 200 字，避免整段公告污染数据）
        text_m = re.search(r'<p[^>]+class="text"[^>]*>([^<]*)</p>', block)
        status_hint = unescape(text_m.group(1).strip()) if text_m else ""
        if len(status_hint) > 200:
            status_hint = status_hint[:200] + "..."

        # 5. 主办方
        org_m = re.search(
            r'<div[^>]+class="linkbox"[^>]*>.*?<p[^>]*>([^<]+)</p>',
            block, re.DOTALL
        )
        organizer = unescape(org_m.group(1).strip()) if org_m else ""

        # 6. 浏览量 + 关注数
        spans = re.findall(r'<span[^>]*>([^<]+)</span>', block)
        views = ""
        followers = ""
        for s in spans:
            s_clean = unescape(s.strip())
            if "浏览" in s_clean:
                views = s_clean.replace("浏览", "").replace("&nbsp;", "").strip()
            elif "关注" in s_clean:
                followers = s_clean.replace("关注", "").replace("&nbsp;", "").strip()

        # 7. 排行榜排名（one/two/three 分别为 1/2/3，其余为 null）
        rank_m = re.search(r'<li[^>]+class="item\s+(one|two|three)"', block)
        rank = {"one": 1, "two": 2, "three": 3}.get(
            rank_m.group(1) if rank_m else "", None
        )

        items.append({
            "vse_id": vse_id,
            "name": name,
            "official_url": BASE_URL + vse_path,
            "cover": cover,
            "status_hint": status_hint,
            "organizer": organizer,
            "views": views,
            "followers": followers,
            "rank": rank,
        })

    return items


def infer_status(name, status_hint):
    """从标题和状态提示推断竞赛状态。

    赛氪列表页不直接给状态字段，需要根据文本线索推断：
    - 标题含"收官"、"已结束" → done
    - 标题含"最后"、"截止"、"报名中"、"即将" → open
    - status_hint 含"正在报名"、"报名时间" → open
    - 默认 → pending
    """
    text = (name + " " + status_hint).lower()
    if any(kw in name for kw in ["收官", "已结束", "圆满结束", "闭幕"]):
        return "done"
    if any(kw in name for kw in ["最后", "截止", "即将", "倒计时", "报名中"]):
        return "open"
    if any(kw in status_hint for kw in ["正在报名", "报名时间", "报名进行", "报名即将"]):
        return "open"
    if "已结束" in status_hint or "评审已结束" in status_hint:
        return "done"
    return "pending"


def parse_signup_deadline(name, status_hint):
    """从标题或状态提示中提取报名截止日期。

    赛氪标题常含日期线索，如「【7月18日收官】」「【最后13天】」。
    提取不到时返回空字符串，由 skill 层兜底。
    """
    text = name + " " + status_hint
    # 匹配「X月X日截止」「截止X月X日」「X月X日收官」等具体日期
    # 不匹配「最后N天」这类相对时间，避免 signup 字段出现纯数字
    patterns = [
        r'(\d{1,2}月\d{1,2}日)\s*(?:截止|收官|结束)',
        r'截止[：:]*\s*(\d{1,2}月\d{1,2}日)',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return ""


def stable_id(name, url):
    """生成稳定 ID。与 52jingsai 源保持一致的 hash 策略。"""
    raw = f"{name}|{url}"
    return "comp-saikr-" + hashlib.sha256(raw.encode()).hexdigest()[:12]


def to_campbrief_format(items):
    """转换为 CampBrief competitions.json 兼容格式。"""
    competitions = []
    for item in items:
        url = item.get("official_url", "").strip()
        if not url:
            continue

        signup = parse_signup_deadline(item["name"], item.get("status_hint", ""))

        comp = {
            "id": stable_id(item["name"], url),
            "name": item["name"],
            "official_url": url,
            "status": infer_status(item["name"], item.get("status_hint", "")),
            "tier": "other",  # 默认 other，由 classify-competitions.py 对照参考表分配
            "signup": signup,
            "schedule": "",
            "organizer": item.get("organizer", ""),
            "summary": f"来源：赛氪。浏览 {item.get('views', '?')}，关注 {item.get('followers', '?')}",
            "search": "",
        }
        competitions.append(comp)

    return competitions


def main():
    parser = argparse.ArgumentParser(description="赛氪热门竞赛采集")
    parser.add_argument("--output", help="输出 JSON 文件路径")
    parser.add_argument("--max", type=int, default=50, help="最多采集条数（默认 50）")
    args = parser.parse_args()

    now = datetime.now(CST)

    # 1. 抓取列表页
    print(f"[saikr] 抓取列表页: {LIST_URL}", file=sys.stderr)
    try:
        list_html = fetch(LIST_URL)
    except Exception as e:
        print(f"[saikr] 列表页抓取失败: {e}", file=sys.stderr)
        sys.exit(1)

    items = parse_list(list_html)[:args.max]
    print(f"[saikr] 解析到 {len(items)} 条竞赛", file=sys.stderr)

    if not items:
        print("[saikr] 无数据，退出", file=sys.stderr)
        sys.exit(1)

    # 2. 转换为 CampBrief 格式
    competitions = to_campbrief_format(items)

    # 3. 输出
    result = {
        "last_updated": now.isoformat(),
        "source": "saikr",
        "total": len(competitions),
        "items": competitions,
    }

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"[saikr] 写入 {args.output}: {len(competitions)} 条", file=sys.stderr)
    else:
        print(output_json)

    print(f"[saikr] 完成: {len(competitions)} 条竞赛", file=sys.stderr)


if __name__ == "__main__":
    main()
