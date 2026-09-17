"""Falsifiers for the subtopic-index permalink collision repair.

The generator emitted the identical group-slug permalink into every
subtopic ``*_index.md`` of a topic group; Jekyll last-write-wins leaves all
but one index page unreachable and the sitemap repeats the ``<loc>``. These
tests pin the deterministic repair:

- collision detection over ``*_index.md`` front matter;
- the group-level index (prefix-owner stem) is identified uniquely and
  keeps the group permalink;
- each subtopic index derives ``/{group-slug}-{parent-permalink-slug}/``
  from its own ``parent_permalink`` — no inference, no content edits;
- only the ``permalink:`` line changes (span isolation);
- the pass is fail-closed: no unique owner, missing parent permalink, or a
  candidate slug already taken are reported, never guessed;
- idempotence and the post-repair uniqueness verification.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from repair_subtopic_index_permalinks import (  # noqa: E402
    identify_group_owner,
    parse_front_matter,
    plan_repairs,
    repair_file,
    verify,
)


def write_page(path: Path, permalink: str, parent_permalink: str = "", parent_basename: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["---", f"title: idx", f"permalink: {permalink}"]
    if parent_basename:
        lines.append(f"parent_basename: {parent_basename}")
    if parent_permalink:
        lines.append(f"parent_permalink: {parent_permalink}")
    lines += ["---", "", "# body", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


class CollisionAndOwnerTests(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.pages = Path(self._tmp.name) / "pages"

    def tearDown(self):
        self._tmp.cleanup()

    def test_no_unique_owner_is_reported_not_guessed(self):
        a = self.pages / "topic_a_index.md"
        b = self.pages / "topic_b_index.md"
        write_page(a, "/group/", "/x/")
        write_page(b, "/group/", "/y/")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(plans, {})
        self.assertTrue(any("no_unique_group_owner" in p for p in problems))

    def test_group_owner_keeps_group_permalink(self):
        owner = self.pages / "topic_1_index.md"
        sub1 = self.pages / "topic_1_sub_a_index.md"
        sub2 = self.pages / "topic_1_sub_b_index.md"
        write_page(owner, "/group/")
        write_page(sub1, "/group/", "/sub-a/")
        write_page(sub2, "/group/", "/sub-b/")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(problems, [])
        self.assertNotIn(owner, plans)
        self.assertEqual(plans[sub1], "/group-sub-a/")
        self.assertEqual(plans[sub2], "/group-sub-b/")

    def test_non_colliding_groups_untouched(self):
        owner = self.pages / "topic_1_index.md"
        sub = self.pages / "topic_1_sub_a_index.md"
        write_page(owner, "/group/")
        write_page(sub, "/group-unique/", "/sub-a/")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(plans, {})
        self.assertEqual(problems, [])


class DerivationAndSafetyTests(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.pages = Path(self._tmp.name) / "pages"

    def tearDown(self):
        self._tmp.cleanup()

    def test_missing_parent_permalink_is_reported(self):
        owner = self.pages / "topic_1_index.md"
        sub = self.pages / "topic_1_sub_a_index.md"
        write_page(owner, "/group/")
        write_page(sub, "/group/", "")
        plans, problems = plan_repairs(self.pages)
        self.assertNotIn(sub, plans)
        self.assertTrue(any("missing_parent_permalink" in p for p in problems))

    def test_candidate_taken_by_other_page_is_reported(self):
        owner = self.pages / "topic_1_index.md"
        sub = self.pages / "topic_1_sub_a_index.md"
        other = self.pages / "unrelated_article.md"
        write_page(owner, "/group/")
        write_page(sub, "/group/", "/sub-a/")
        write_page(other, "/group-sub-a/")
        plans, problems = plan_repairs(self.pages)
        self.assertNotIn(sub, plans)
        self.assertTrue(any("candidate_permalink_already_taken" in p for p in problems))

    def test_repair_file_rewrites_only_permalink_line(self):
        page = self.pages / "topic_1_sub_a_index.md"
        write_page(page, "/group/", "/sub-a/", "topic_1_sub_a")
        original = page.read_text(encoding="utf-8")
        self.assertTrue(repair_file(page, "/group-sub-a/"))
        repaired = page.read_text(encoding="utf-8")
        self.assertIn("permalink: /group-sub-a/", repaired)
        for line in original.splitlines():
            if not line.startswith("permalink:"):
                self.assertIn(line, repaired)

    def test_verify_detects_residual_duplicates(self):
        a = self.pages / "topic_1_sub_a_index.md"
        b = self.pages / "topic_1_sub_b_index.md"
        write_page(a, "/dup/")
        write_page(b, "/dup/")
        problems = verify(self.pages)
        self.assertEqual(len(problems), 1)


class IdempotenceTests(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.pages = Path(self._tmp.name) / "pages"

    def tearDown(self):
        self._tmp.cleanup()

    def test_second_pass_plans_nothing(self):
        owner = self.pages / "topic_1_index.md"
        sub1 = self.pages / "topic_1_sub_a_index.md"
        sub2 = self.pages / "topic_1_sub_b_index.md"
        write_page(owner, "/group/")
        write_page(sub1, "/group/", "/sub-a/")
        write_page(sub2, "/group/", "/sub-b/")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(len(plans), 2)
        for path, permalink in plans.items():
            self.assertTrue(repair_file(path, permalink))
        plans2, problems2 = plan_repairs(self.pages)
        self.assertEqual(plans2, {})
        self.assertEqual(problems2, [])
        self.assertEqual(verify(self.pages), [])



class AllSubtopicGroupTests(unittest.TestCase):
    """No group-level index exists: every member is a subtopic index."""

    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.pages = Path(self._tmp.name) / "pages"

    def tearDown(self):
        self._tmp.cleanup()

    def test_all_subtopic_group_derives_unique_permalinks_for_every_member(self):
        a = self.pages / "topic_1_sub_a_index.md"
        b = self.pages / "topic_1_sub_b_index.md"
        c = self.pages / "topic_1_sub_c_index.md"
        write_page(a, "/topic-1/", "/sub-a/", "topic_1_sub_a")
        write_page(b, "/topic-1/", "/sub-b/", "topic_1_sub_b")
        write_page(c, "/topic-1/", "/sub-c/", "topic_1_sub_c")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(problems, [])
        self.assertEqual(plans[a], "/topic-1-sub-a/")
        self.assertEqual(plans[b], "/topic-1-sub-b/")
        self.assertEqual(plans[c], "/topic-1-sub-c/")

    def test_member_without_parent_permalink_still_fail_closed(self):
        a = self.pages / "group_sub_a_index.md"
        b = self.pages / "group_sub_b_index.md"
        write_page(a, "/group-1/", "/sub-a/", "group_1_sub_a")
        write_page(b, "/group-1/", "", "group_1_sub_b")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(plans, {})
        self.assertTrue(problems)

    def test_unrelated_stems_without_group_prefix_stay_fail_closed(self):
        a = self.pages / "topic_a_index.md"
        b = self.pages / "topic_b_index.md"
        write_page(a, "/group/", "/x/", "topic_a")
        write_page(b, "/group/", "/y/", "topic_b")
        plans, problems = plan_repairs(self.pages)
        self.assertEqual(plans, {})
        self.assertTrue(any("no_unique_group_owner" in p for p in problems))


class FrontMatterTests(unittest.TestCase):
    def test_parse_front_matter_reads_quoted_values(self):
        text = "---\ntitle: 'Sub-Topic Index'\npermalink: /group/\n---\n\nbody\n"
        front = parse_front_matter(text)
        self.assertEqual(front["permalink"], "/group/")
        self.assertEqual(front["title"], "Sub-Topic Index")


if __name__ == "__main__":
    unittest.main()
