from __future__ import annotations

from pathlib import Path, PurePosixPath
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "scripts" / "hermes" / "skills" / "CampBrief"
SCOPES = {
    "campbrief-daily-news": "daily-news",
    "campbrief-daily-news-juya": "daily-news-juya",
    "campbrief-exams": "exams",
    "campbrief-competitions": "competitions",
}


class SkillMaintenanceContractTests(unittest.TestCase):
    def test_every_skill_uses_gate_short_circuit_and_ack(self) -> None:
        for directory, scope in SCOPES.items():
            with self.subTest(skill=directory):
                text = (SKILLS / directory / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("scripts/maintenance-gate.py", text)
                self.assertIn(f"--scope {scope}", text)
                self.assertIn('"$GATE_RC" -eq 0', text)
                self.assertIn('"$GATE_RC" -eq 20', text)
                self.assertIn('"$GATE_RC" -ne 10', text)
                self.assertIn(f"--scope {scope} --ack", text)
                self.assertIn("只读取", text)

    def test_skills_do_not_define_execution_frequency(self) -> None:
        forbidden = ("每天运行", "每周运行", "每月运行", "每隔", "执行频率为", "至少每天")
        for directory in SCOPES:
            with self.subTest(skill=directory):
                text = (SKILLS / directory / "SKILL.md").read_text(encoding="utf-8")
                for phrase in forbidden:
                    self.assertNotIn(phrase, text)

    def test_path_executed_workflows_do_not_depend_on_skill_registration(self) -> None:
        for directory in SCOPES:
            with self.subTest(skill=directory):
                text = (SKILLS / directory / "SKILL.md").read_text(encoding="utf-8")
                frontmatter = text.split("---", 2)[1]
                description = next(
                    line.removeprefix("description: ")
                    for line in frontmatter.splitlines()
                    if line.startswith("description: ")
                )
                self.assertLessEqual(len(description), 60)
                self.assertTrue(description.endswith("."))
                keys = [line.split(":", 1)[0] for line in frontmatter.splitlines() if line.strip()]
                self.assertEqual(keys, ["name", "description"])
                self.assertIn("cron 提示词", text)
                self.assertIn("SKILL_FILE", text)
                self.assertIn("../../../../..", text)
                self.assertNotIn("campbrief.repo_path", text)
                repo = PurePosixPath("/data/data/com.termux/files/home/projects/CampBrief")
                skill_file = repo / "scripts/hermes/skills/CampBrief" / directory / "SKILL.md"
                self.assertEqual(skill_file.parents[5], repo)


if __name__ == "__main__":
    unittest.main()
