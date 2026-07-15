#!/usr/bin/env python3
"""Run the complete read-only CampBrief maintenance validation suite."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def run(label: str, command: list[str]) -> None:
    print(f"\n== {label} ==")
    completed = subprocess.run(command, cwd=ROOT, check=False)
    if completed.returncode:
        raise SystemExit(completed.returncode)


def main() -> int:
    python = sys.executable
    node = shutil.which("node")
    if not node:
        print("node 未安装，无法执行前端语法与单元测试。", file=sys.stderr)
        return 1

    run("竞赛数据", [python, "scripts/validate-competitions.py"])
    run("考试来源", [python, "scripts/validate-exam-sources.py"])
    run("资讯数据", [python, "scripts/validate-daily-news.py"])
    run("GitHub 趋势数据", [python, "scripts/validate-github-trending.py"])
    run("结构化状态", [python, "scripts/check-temporal-status.py"])
    run("轮播健康度", [python, "scripts/check-carousel-health.py"])
    run("Python 单元测试", [python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])

    javascript = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "assets" / "js").glob("*.js"))
    for script in javascript:
        run(f"JS 语法 {script}", [node, "--check", script])
    run(
        "Node 单元与页面依赖测试",
        [node, "--test", "tests/content-utils.test.js", "tests/page-dependencies.test.js"],
    )
    run("Git 空白错误", ["git", "diff", "--check"])
    print("\nAll CampBrief maintenance checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
