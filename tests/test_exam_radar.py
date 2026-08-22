from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


radar = load_script("campbrief_exam_radar", "collect-exam-radar.py")
gate = load_script("campbrief_maintenance_gate_for_radar", "maintenance-gate.py")


SOURCE = {
    "id": "fixture-233-cost-engineer",
    "provider": "233网校",
    "url": "https://radar.example/topic",
    "parser": "233-regional-signup-table",
    "exam_family": "first-level-cost-engineer",
    "exam_name": "一级造价工程师",
    "year": 2026,
    "period": "annual",
    "max_candidates": 3,
    "official_required": True,
    "forbidden_markers": ["预计", "参考往年"],
}


HTML = """
<table>
  <tr><th>地区</th><th>报名时间</th><th>报名入口</th><th>缴费时间</th><th>资格审核</th><th>报名公告</th></tr>
</table>
<table>
  <tr><td>北京</td><td><a href="/beijing-time">8月4日-8月13日</a></td><td>报名入口</td><td>8月15日-8月18日</td><td>网上审核</td><td><a href="/beijing-notice">2026年报名通知</a></td></tr>
  <tr><td>预测省</td><td><a href="/forecast-time">预计8月开放</a></td><td>报名入口</td><td>待定</td><td>待定</td><td><a href="/forecast-notice">预计报名通知</a></td></tr>
</table>
"""


class ExamRadarTests(unittest.TestCase):
    def test_233_split_header_and_data_tables_produce_safe_candidate(self) -> None:
        candidates, rejected = radar.parse_233_regional_signup_table(SOURCE, HTML)
        self.assertEqual(rejected, 1)
        self.assertEqual(len(candidates), 1)
        candidate = candidates[0]
        self.assertEqual(candidate["title"], "2026年北京一级造价工程师报名公告")
        self.assertEqual(candidate["registration"], "8月4日-8月13日")
        self.assertEqual(candidate["payment"], "8月15日-8月18日")
        self.assertEqual(candidate["url"], "https://radar.example/beijing-notice")
        self.assertTrue(candidate["official_required"])

    def test_unchanged_candidate_is_not_re_emitted(self) -> None:
        candidates, _ = radar.parse_233_regional_signup_table(SOURCE, HTML)
        first_changed, fingerprints = radar.changed_candidates(candidates, {})
        second_changed, _ = radar.changed_candidates(candidates, fingerprints)
        self.assertEqual(first_changed, candidates)
        self.assertEqual(second_changed, [])

    def test_exam_radar_candidate_requires_official_verification(self) -> None:
        candidates, _ = radar.parse_233_regional_signup_table(SOURCE, HTML)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps({"candidates": candidates}, ensure_ascii=False), encoding="utf-8")
            tasks = gate.pool_tasks("exams", "exam-radar", path)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["type"], "exam_radar_review")
        self.assertIn("官方域名", tasks[0]["reason"])

    def test_exam_radar_no_change_is_not_a_source_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps({"no_change": True, "candidates": [], "errors": []}), encoding="utf-8")
            self.assertEqual(gate.pool_tasks("exams", "exam-radar", path), [])

    def test_unsafe_exam_radar_candidate_is_rejected(self) -> None:
        unsafe = {"title": "不安全线索", "url": "https://radar.example/unsafe", "kind": "third_party_lead"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps({"candidates": [unsafe]}, ensure_ascii=False), encoding="utf-8")
            tasks = gate.pool_tasks("exams", "exam-radar", path)
        self.assertEqual(tasks[0]["type"], "source_error")
        self.assertIn("官方核验", tasks[0]["reason"])


if __name__ == "__main__":
    unittest.main()
