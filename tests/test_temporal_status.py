from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from temporal_status import effective_status, lifecycle_issues  # noqa: E402


class TemporalStatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = json.loads(
            (ROOT / "tests" / "temporal-status-cases.json").read_text(encoding="utf-8")
        )

    def test_shared_cases(self) -> None:
        for entry in self.cases:
            with self.subTest(entry["name"]):
                now = datetime.fromisoformat(entry["now"].replace("Z", "+00:00"))
                self.assertEqual(
                    effective_status(entry["item"], entry["kind"], now),
                    entry["expected"],
                )

    def test_invalid_date_is_reported(self) -> None:
        item = {
            "status": "open",
            "lifecycle": {
                "mode": "scheduled",
                "time_zone": "Asia/Shanghai",
                "registration_end": "2026-02-31",
            },
        }
        self.assertTrue(lifecycle_issues(item))

        instant_item = {
            "status": "open",
            "lifecycle": {
                "mode": "scheduled",
                "registration_end": "2026-02-31T23:59:00+08:00",
            },
        }
        self.assertTrue(lifecycle_issues(instant_item))

    def test_scheduled_open_requires_registration_end(self) -> None:
        item = {
            "status": "open",
            "lifecycle": {
                "mode": "scheduled",
                "time_zone": "Asia/Shanghai",
                "event_end": "2026-08-31",
            },
        }
        self.assertTrue(any("registration_end" in issue for issue in lifecycle_issues(item)))

    def test_unstructured_open_requires_verification(self) -> None:
        now = datetime.fromisoformat("2026-07-15T00:00:00+00:00")
        self.assertEqual(
            effective_status({"status": "open"}, "competition", now, require_lifecycle=True),
            "unknown",
        )


if __name__ == "__main__":
    unittest.main()
