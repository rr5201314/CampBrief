from __future__ import annotations

from datetime import datetime, timezone
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


gate = load_script("campbrief_maintenance_gate", "maintenance-gate.py")
exam_probe = load_script("campbrief_exam_probe", "collect-exam-notices.py")
link_checker = load_script("campbrief_link_checker", "check-daily-news-links.py")


class MaintenanceGateTests(unittest.TestCase):
    def test_daily_candidate_dedup_and_new_handoff(self) -> None:
        published = json.loads((ROOT / "static" / "data" / "daily-news.json").read_text(encoding="utf-8"))["items"][0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(
                json.dumps({"candidates": [published]}, ensure_ascii=False),
                encoding="utf-8",
            )
            self.assertEqual(gate.pool_tasks("daily-news", "rss", path), [])

            path.write_text(
                json.dumps(
                    {
                        "candidates": [
                            {
                                "title": "全新候选",
                                "url": "https://example.com/new?utm_source=test",
                                "source": "fixture",
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            tasks = gate.pool_tasks("daily-news", "rss", path)
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["type"], "candidate_review")

    def test_empty_candidate_pool_becomes_source_exception(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps({"candidates": []}), encoding="utf-8")
            tasks = gate.pool_tasks("daily-news", "rss", path)
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["type"], "source_error")

    def test_only_acknowledged_exception_is_suppressed_until_retry_window(self) -> None:
        entry = gate.task(
            "source_error",
            "daily-news",
            "fixture",
            reason="fixture error",
        )
        current = datetime(2026, 7, 15, tzinfo=timezone.utc)
        emitted, suppressed, state = gate.apply_state(
            [entry], {"version": 1, "tasks": {}}, current, 72
        )
        self.assertEqual(len(emitted), 1)
        self.assertEqual(suppressed, [])

        emitted, suppressed, _ = gate.apply_state(
            [entry], state, current.replace(day=16), 72
        )
        self.assertEqual(len(emitted), 1)
        self.assertEqual(suppressed, [])

        state["tasks"][entry["key"]]["acknowledged_at"] = current.isoformat()
        emitted, suppressed, _ = gate.apply_state(
            [entry], state, current.replace(day=16), 72
        )
        self.assertEqual(emitted, [])
        self.assertEqual(len(suppressed), 1)

    def test_blank_collector_fields_do_not_erase_published_facts(self) -> None:
        published = {
            "name": "示例竞赛",
            "official_url": "https://example.com/contest",
            "organizer": "正式主办方",
            "signup": "截至 8 月 1 日",
        }
        candidate = {
            "name": "示例竞赛",
            "official_url": "https://example.com/contest",
            "organizer": "",
            "signup": "",
        }
        self.assertEqual(gate.candidate_differences(published, candidate), {})

    def test_acknowledge_report_marks_matching_state(self) -> None:
        entry = gate.task("source_error", "exams", "fixture", reason="failed")
        current = datetime(2026, 7, 15, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "report.json"
            state_path = Path(directory) / "state.json"
            report_path.write_text(json.dumps({"tasks": [entry]}), encoding="utf-8")
            state_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "tasks": {
                            entry["key"]: {
                                "fingerprint": entry["fingerprint"],
                                "last_emitted": current.isoformat(),
                                "last_seen": current.isoformat(),
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                gate.acknowledge_report(report_path, state_path, current), 0
            )
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(
                state["tasks"][entry["key"]]["acknowledged_at"],
                current.isoformat(),
            )

    def test_daily_link_report_only_hands_off_non_ok_results(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "links.json"
            report_path.write_text(
                json.dumps(
                    {
                        "results": [
                            {
                                "state": "ok",
                                "url": "https://example.com/ok",
                                "ids": ["news-ok"],
                                "titles": ["正常链接"],
                            },
                            {
                                "state": "restricted",
                                "status_code": 403,
                                "url": "https://example.com/restricted",
                                "ids": ["news-restricted"],
                                "titles": ["受限链接"],
                            },
                            {
                                "state": "broken",
                                "status_code": 404,
                                "url": "https://example.com/missing",
                                "ids": ["news-missing"],
                                "titles": ["失效链接"],
                            },
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            tasks = gate.daily_link_report_tasks(report_path)
            self.assertEqual([entry["type"] for entry in tasks], ["link_review", "link_review"])
            self.assertEqual(
                [entry["payload"]["state"] for entry in tasks],
                ["restricted", "broken"],
            )

    def test_link_checker_can_partition_shared_daily_news_file_by_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            data_path = Path(directory) / "daily.json"
            data_path.write_text(
                json.dumps(
                    {
                        "items": [
                            {"id": "news-rss", "title": "RSS", "source": "RSS", "url": "https://example.com/rss"},
                            {"id": "news-juya", "title": "Juya", "source": "juya AI 日报", "url": "https://example.com/juya"},
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            juya = link_checker.load_urls(data_path, only_sources={"juya AI 日报"})
            non_juya = link_checker.load_urls(data_path, exclude_sources={"juya AI 日报"})
            self.assertEqual(list(juya), ["https://example.com/juya"])
            self.assertEqual(list(non_juya), ["https://example.com/rss"])


class ExamProbeTests(unittest.TestCase):
    def test_extract_and_match_notice_links(self) -> None:
        html = """
        <a href="/notice/current.html"><span>2026 年考试报名通知</span></a>
        <a href="/notice/result.html">2026 年成绩查询</a>
        """
        links = exam_probe.extract_links(html, "https://exam.example/list/")
        rule = {"match_all": ["2026"], "match_any": ["报名"], "ignore_any": ["成绩"]}
        matched = [link for link in links if exam_probe.link_matches(link, rule)]
        self.assertEqual(
            matched,
            [{"url": "https://exam.example/notice/current.html", "text": "2026 年考试报名通知"}],
        )

    def test_new_notice_and_current_notice_classification(self) -> None:
        item = {
            "id": "exam-2026",
            "name": "示例考试",
            "status": "pending",
            "news_list_url": "https://exam.example/list/",
            "official_url": "https://exam.example/notice/old.html",
        }
        rule = {"mode": "filtered-list", "match_all": ["示例考试"], "match_any": ["报名"]}
        current_html = '<a href="/notice/old.html">示例考试报名</a>'
        self.assertEqual(
            exam_probe.classify_item(item, rule, current_html, None)["status"],
            "current",
        )

        new_html = current_html + '<a href="/notice/new.html">示例考试报名</a>'
        result = exam_probe.classify_item(item, rule, new_html, None)
        self.assertEqual(result["status"], "candidate")
        self.assertEqual(result["candidates"][0]["url"], "https://exam.example/notice/new.html")

    def test_fixed_portal_only_needs_reachability(self) -> None:
        item = {
            "id": "rolling",
            "name": "滚动考试",
            "status": "open",
            "news_list_url": "https://exam.example/",
        }
        result = exam_probe.classify_item(
            item, {"mode": "national-portal"}, "<html></html>", None
        )
        self.assertEqual(result["status"], "reachable_current")

    def test_schedule_page_emits_content_fingerprint(self) -> None:
        item = {
            "id": "schedule",
            "name": "日程考试",
            "status": "open",
            "news_list_url": "https://exam.example/schedule",
        }
        html = "<main><h1>官方考试日程</h1><p>" + ("本页包含报名与考试日期。" * 12) + "</p></main>"
        result = exam_probe.classify_item(item, {"mode": "schedule-page"}, html, None)
        self.assertEqual(result["status"], "content_review")
        self.assertEqual(len(result["content_fingerprint"]), 20)


if __name__ == "__main__":
    unittest.main()
