#!/usr/bin/env python3
"""
竞赛数据完整性校验脚本

检查 competitions.json 中的条目是否满足基本要求：
1. 必须有至少一个链接（official_site 或 official_url）
2. name 不能为空
3. id 不能为空
4. JSON 结构合法

用法：
  python3 scripts/validate-competitions.py              # 检查并报告
  python3 scripts/validate-competitions.py --fix         # 自动移除不合格条目
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "data", "competitions.json")
CST = timezone(timedelta(hours=8))


def validate(items):
    """校验所有条目，返回 (valid, invalid) 两个列表。"""
    valid = []
    invalid = []
    seen_ids = set()

    for item in items:
        issues = []
        item_id = item.get("id", "")
        name = item.get("name", "")
        site = item.get("official_site", "").strip()
        url = item.get("official_url", "").strip()

        if not item_id:
            issues.append("id 为空")
        elif item_id in seen_ids:
            issues.append(f"id 重复: {item_id}")
        else:
            seen_ids.add(item_id)

        if not name:
            issues.append("name 为空")

        if not site and not url:
            issues.append("无任何链接（official_site 和 official_url 都为空）")

        if issues:
            invalid.append({"item": item, "issues": issues})
        else:
            valid.append(item)

    return valid, invalid


def main():
    parser = argparse.ArgumentParser(description="竞赛数据完整性校验")
    parser.add_argument("--fix", action="store_true", help="自动移除不合格条目")
    args = parser.parse_args()

    # 读取数据
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[validate] 数据文件读取失败: {e}", file=sys.stderr)
        sys.exit(1)

    items = data.get("items", [])
    valid, invalid = validate(items)

    # 报告
    print(f"总计: {len(items)} 条")
    print(f"合格: {len(valid)} 条")
    print(f"不合格: {len(invalid)} 条")

    if invalid:
        print("\n=== 不合格条目 ===")
        for entry in invalid:
            item = entry["item"]
            issues = entry["issues"]
            print(f"  {item.get('name', '(无名)')[:40]}")
            for issue in issues:
                print(f"    ✗ {issue}")

    # 修复
    if args.fix and invalid:
        now = datetime.now(CST)
        data["items"] = valid
        data["total"] = len(valid)
        data["last_updated"] = now.isoformat()

        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\n已修复: 移除 {len(invalid)} 条，剩余 {len(valid)} 条")
    elif invalid:
        print("\n预览模式，未修改。加 --fix 自动移除不合格条目。")

    # 退出码
    sys.exit(1 if invalid else 0)


if __name__ == "__main__":
    main()
