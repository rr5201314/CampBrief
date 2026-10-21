from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / 'scripts' / 'validate-exam-sources.py'


class ExamSourceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = json.loads((ROOT / 'static/data/exams.json').read_text(encoding='utf-8'))

    def validate(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'exams.json'
            path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            return subprocess.run(
                [sys.executable, str(VALIDATOR), str(path)],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )

    def test_published_catalogue_needs_no_unpublished_notice_exception(self) -> None:
        result = self.validate(self.data)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('Notice not yet published', result.stdout)

    def test_missing_civil_service_notice_is_no_longer_exempt(self) -> None:
        data = deepcopy(self.data)
        item = next(i for i in data['items'] if i['id'] == 'guokao-2026')
        item['official_url'] = ''
        item['status'] = 'pending'
        result = self.validate(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('guokao-2026: missing current official notice URL', result.stderr)

    def test_notice_still_requires_approved_official_host(self) -> None:
        data = deepcopy(self.data)
        item = next(i for i in data['items'] if i['id'] == 'guokao-2026')
        item['official_url'] = 'https://example.invalid/not-an-official-notice'
        result = self.validate(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unapproved host: example.invalid', result.stderr)


if __name__ == '__main__':
    unittest.main()
