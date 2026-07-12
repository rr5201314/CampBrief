#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞书群机器人通知脚本

读取 data/daily-news-raw.json 候选池摘要，通过飞书自定义机器人 webhook 发送到群。
消息内容包含关键词 "CampBrief"（满足飞书机器人的安全设置）。

用法：
  python3 scripts/notify-feishu.py
  python3 scripts/notify-feishu.py --webhook https://open.feishu.cn/...  # 显式指定 webhook
  python3 scripts/notify-feishu.py --batch morning                         # 标注批次（morning/noon）

环境变量：
  FEISHU_WEBHOOK：飞书自定义机器人 webhook URL（GitHub Actions 中通过 secrets 注入）
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_PATH = os.path.join(ROOT, "data", "daily-news-raw.json")

# 北京时区
CST = timezone(timedelta(hours=8))

BATCH_LABELS = {
    "morning": "早间采集（排除 juya）",
    "noon": "午间采集（juya AI 日报）",
    "full": "全量采集",
}


def now_cst():
    return datetime.now(CST)


def load_raw():
    if not os.path.exists(RAW_PATH):
        return None
    with open(RAW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_text_message(data, batch):
    """构建飞书文本消息。包含关键词 CampBrief 满足安全校验。"""
    total = data.get("total", 0)
    sources_ok = data.get("sources_ok", 0)
    sources_failed = data.get("sources_failed", 0)
    errors = data.get("errors", [])
    collected_at = data.get("collected_at", "")

    # 解析采集时间为北京时间
    try:
        dt = datetime.fromisoformat(collected_at)
        if dt.tzinfo:
            dt = dt.astimezone(CST)
        collected_str = dt.strftime("%Y-%m-%d %H:%M") + " 北京时间"
    except (ValueError, TypeError):
        collected_str = collected_at or "未知"

    batch_label = BATCH_LABELS.get(batch, batch or "采集")

    lines = [
        f"CampBrief 候选池已就绪",
        f"",
        f"批次：{batch_label}",
        f"采集时间：{collected_str}",
        f"候选条目：{total} 条",
        f"源状态：{sources_ok} 成功 / {sources_failed} 失败",
    ]

    if errors:
        failed_names = [e.get("source", "?") for e in errors[:5]]
        lines.append(f"失败源：{', '.join(failed_names)}")
        if len(errors) > 5:
            lines.append(f"  （另有 {len(errors) - 5} 个失败源）")

    # 飞书应用机器人无法接收其他机器人的消息事件，需手动 @ nienie 触发
    lines.append("")
    lines.append("收到通知后，在群里 @nienie 发送：执行 campbrief-daily-news")

    return "\n".join(lines)


def send_feishu(webhook_url, text):
    """发送飞书文本消息。"""
    payload = {
        "msg_type": "text",
        "content": {"text": text},
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        result = json.loads(body)
        if result.get("code", 0) != 0 and result.get("StatusCode", 0) != 0:
            raise RuntimeError(f"飞书返回错误：{body}")
    return result


def main():
    parser = argparse.ArgumentParser(description="飞书群机器人通知")
    parser.add_argument("--webhook", help="飞书 webhook URL（默认读环境变量 FEISHU_WEBHOOK）")
    parser.add_argument("--batch", choices=["morning", "noon", "full"], default="full", help="采集批次标签")
    args = parser.parse_args()

    webhook = args.webhook or os.environ.get("FEISHU_WEBHOOK", "")
    if not webhook:
        print("[notify] 未提供 webhook：请用 --webhook 或设置 FEISHU_WEBHOOK 环境变量", file=sys.stderr)
        return 1

    data = load_raw()
    if data is None:
        print(f"[notify] 候选池文件不存在：{RAW_PATH}", file=sys.stderr)
        return 1

    text = build_text_message(data, args.batch)
    print(f"[notify] 发送飞书通知（批次: {args.batch}）...")
    print(f"[notify] 消息内容预览：\n{text}\n")

    try:
        send_feishu(webhook, text)
        print("[notify] 发送成功")
        return 0
    except urllib.error.URLError as e:
        print(f"[notify] 网络错误：{e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"[notify] 发送失败：{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
