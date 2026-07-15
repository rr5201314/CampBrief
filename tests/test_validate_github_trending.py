from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate-github-trending.py"
SPEC = importlib.util.spec_from_file_location("validate_github_trending", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load validate-github-trending.py")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class GitHubTrendingValidationTests(unittest.TestCase):
    def fixture(self) -> dict:
        return {
            "total": 1,
            "items": [
                {
                    "id": "github-daily-2026-07-15",
                    "url": "https://github.com/trending?since=daily",
                    "repos": [
                        {
                            "name": "owner/repo",
                            "url": "https://github.com/owner/repo",
                            "chinese_summary": "这是中文概述。",
                            "solves_what": "解决一个明确问题。",
                        }
                    ],
                }
            ],
        }

    def test_valid_data_passes(self) -> None:
        self.assertEqual(validator.validate(self.fixture()), [])

    def test_missing_or_english_editorial_fields_fail(self) -> None:
        data = self.fixture()
        data["items"][0]["repos"][0]["chinese_summary"] = "English only"
        data["items"][0]["repos"][0]["solves_what"] = ""
        errors = validator.validate(data)
        self.assertTrue(any("chinese_summary 必须包含中文" in error for error in errors))
        self.assertTrue(any("缺少 solves_what" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
