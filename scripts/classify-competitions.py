#!/usr/bin/env python3
"""
竞赛含金量批量对照脚本

读取 competitions.json 和 competition-tier-ref.json，
按「主办方优先、竞赛名称辅助」的规则批量更新 tier 和 prestige。
未命中参考表的条目输出到 stdout，供人工核对后补全参考表。

用法：
  python3 scripts/classify-competitions.py                # 预览模式（不写入）
  python3 scripts/classify-competitions.py --apply         # 实际写入
  python3 scripts/classify-competitions.py --report out.json  # 输出未命中条目
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "data", "competitions.json")
REF_FILE = os.path.join(ROOT, "scripts", "competition-tier-ref.json")
CST = timezone(timedelta(hours=8))


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def match_organizer(org, ref_organizers):
    """在参考表中匹配主办方，返回 (tier, prestige, matched_key) 或 None。"""
    if not org:
        return None
    # 精确匹配
    if org in ref_organizers:
        entry = ref_organizers[org]
        return (entry["tier"], entry["prestige"], org)
    # 模糊匹配：参考表 key 是 org 的子串
    for key, entry in ref_organizers.items():
        if key in org:
            return (entry["tier"], entry["prestige"], key)
    return None


def match_competition(name, ref_competitions):
    """在参考表中匹配竞赛名，返回 (tier, prestige, matched_key) 或 None。"""
    if not name:
        return None
    # 精确匹配
    if name in ref_competitions:
        entry = ref_competitions[name]
        return (entry["tier"], entry["prestige"], name)
    # 模糊匹配：参考表 key 是 name 的子串
    for key, entry in ref_competitions.items():
        if key in name:
            return (entry["tier"], entry["prestige"], key)
    return None


def main():
    parser = argparse.ArgumentParser(description="竞赛含金量批量对照")
    parser.add_argument("--apply", action="store_true", help="实际写入（默认只预览）")
    parser.add_argument("--report", help="输出未命中条目到 JSON 文件")
    args = parser.parse_args()

    # 加载数据
    data = load_json(DATA_FILE)
    ref = load_json(REF_FILE)
    ref_orgs = ref.get("organizers", {})
    ref_comps = ref.get("competitions", {})

    items = data.get("items", [])
    changed = []
    unmatched = []

    for item in items:
        name = item.get("name", "")
        org = item.get("organizer", "")
        old_tier = item.get("tier", "hobby")
        old_prestige = item.get("prestige", 4)

        result = None
        source = ""

        # 1. 优先按主办方匹配
        result = match_organizer(org, ref_orgs)
        if result:
            source = f"organizer:{result[2]}"

        # 2. 主办方未命中，按竞赛名匹配
        if not result:
            result = match_competition(name, ref_comps)
            if result:
                source = f"competition:{result[2]}"

        if result:
            new_tier, new_prestige = result[0], result[1]
            if new_tier != old_tier or new_prestige != old_prestige:
                changed.append({
                    "name": name,
                    "organizer": org,
                    "old_tier": old_tier,
                    "old_prestige": old_prestige,
                    "new_tier": new_tier,
                    "new_prestige": new_prestige,
                    "source": source,
                })
                if args.apply:
                    item["tier"] = new_tier
                    item["prestige"] = new_prestige
        else:
            unmatched.append({
                "name": name,
                "organizer": org,
                "tier": old_tier,
                "prestige": old_prestige,
                "official_url": item.get("official_url", ""),
            })

    # 输出结果
    print(f"总计: {len(items)} 条")
    print(f"命中参考表: {len(items) - len(unmatched)} 条")
    print(f"需修正: {len(changed)} 条")
    print(f"未命中（需人工核对）: {len(unmatched)} 条")

    if changed:
        print("\n=== 修正项 ===")
        for c in changed:
            print(f"  {c['name'][:40]}")
            print(f"    主办: {c['organizer'][:30]}")
            print(f"    {c['old_tier']}({c['old_prestige']}) → {c['new_tier']}({c['new_prestige']})")
            print(f"    依据: {c['source']}")
            print()

    if unmatched:
        print("\n=== 未命中（需人工核对）===")
        for u in unmatched:
            print(f"  {u['name'][:45]}")
            print(f"    主办: {u['organizer'][:35] or '(空)'}")
            print(f"    当前: {u['tier']}({u['prestige']})")
            print()

    # 写入
    if args.apply and changed:
        now = datetime.now(CST)
        data["last_updated"] = now.isoformat()
        save_json(DATA_FILE, data)
        print(f"已写入 {DATA_FILE}，修正 {len(changed)} 条")
    elif changed:
        print("\n预览模式，未写入。加 --apply 实际写入。")

    # 输出未命中报告
    if args.report and unmatched:
        save_json(args.report, {"unmatched": unmatched, "total": len(unmatched)})
        print(f"未命中条目已写入 {args.report}")


if __name__ == "__main__":
    main()
