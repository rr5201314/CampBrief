from __future__ import annotations

from datetime import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from temporal_status import effective_status  # noqa: E402

SPEC = importlib.util.spec_from_file_location("carousel_health", ROOT / "scripts/check-carousel-health.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load check-carousel-health.py")
health = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(health)


class CarouselHealthTests(unittest.TestCase):
    now = datetime.fromisoformat("2026-10-10T12:00:00+00:00")

    def test_important_fallback_is_opt_in_and_latest_first(self):
        items = [
            {"id": "older", "priority": 2, "published": "2026-10-08T09:00:00Z"},
            {"id": "latest", "priority": 2, "published": "2026-10-10T11:00:00Z"},
            {"id": "third", "priority": 2, "published": "2026-10-09T09:00:00Z"},
            {"id": "second", "priority": 2, "published": "2026-10-10T10:00:00Z"},
        ]
        self.assertEqual(health.news_candidates(items, self.now), [])
        result = health.news_candidates(items, self.now, important_fallback=True)
        self.assertEqual([item["id"] for item in result], ["latest", "second", "third"])

    def test_real_exam_and_competition_states_match_frontend(self):
        # Exercise actual collector-generated timestamps, not only hand-written fixtures.
        for name, kind in (("exams.json", "exam"), ("competitions.json", "competition")):
            items = health.load(name)["items"]
            script = """
const fs = require('node:fs');
const c = require('./assets/js/content-utils.js');
const [kind, now] = process.argv.slice(1);
const items = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(items.map(i => ({
  status: c.effectiveStatus(i, {kind, now, requireLifecycle: true}),
  candidate: c.isCarouselCandidate(i, kind, {now})
}))));
"""
            frontend = json.loads(subprocess.check_output(
                ["node", "-e", script, kind, self.now.isoformat()],
                input=json.dumps(items), text=True, cwd=ROOT,
            ))
            for item, result in zip(items, frontend, strict=True):
                with self.subTest(id=item["id"]):
                    self.assertEqual(result["status"], effective_status(item, kind, self.now, require_lifecycle=True))
                    self.assertEqual(result["candidate"], health.lifecycle_carousel_candidate(item, kind, self.now))

    def test_real_tech_candidates_match_frontend(self):
        items = [i for i in health.load("daily-news.json")["items"] if i.get("category") == "tech"]
        items += health.load("github-trending.json")["items"]
        script = """
const fs = require('node:fs');
const vm = require('node:vm');
const now = process.argv[1];
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
const context = vm.createContext({Date: FixedDate, document: {addEventListener() {}}});
vm.runInContext(fs.readFileSync('./assets/js/tech.js', 'utf8'), context);
console.log(JSON.stringify(context.pickTechCarouselItems(JSON.parse(fs.readFileSync(0, 'utf8'))).map(i => i.id)));
"""
        frontend = json.loads(subprocess.check_output(
            ["node", "-e", script, self.now.isoformat()],
            input=json.dumps(items), text=True, cwd=ROOT,
        ))
        expected = health.news_candidates(items, self.now, important_fallback=True)
        self.assertEqual(frontend, [item["id"] for item in expected])


if __name__ == "__main__":
    unittest.main()
