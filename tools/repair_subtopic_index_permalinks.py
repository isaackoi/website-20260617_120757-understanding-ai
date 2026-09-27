"""Deterministic repair of subtopic-index permalink collisions.

Defect (2026-06 cohort): the generator emits the identical group-slug
``permalink`` into every subtopic ``*_index.md`` of a topic group. Jekyll's
last-write-wins means only ONE index page per group is served — the rest are
unreachable — and the generated sitemap repeats the same ``<loc>`` once per
colliding file.

Repair contract (deterministic, in place):

- the group-level index (its stem is a prefix of every other colliding
  stem) keeps the group permalink;
- each subtopic index gets ``/{group-slug}-{subtopic-slug}/`` where the
  subtopic slug is the basename of the index's own ``parent_permalink``
  (mechanically available, no inference);
- only the ``permalink:`` front-matter line is rewritten — no other change;
- the pass is fail-closed: a group with no unique prefix-owner, a missing
  ``parent_permalink``, or a resulting cross-page permalink collision is
  reported and left untouched;
- idempotent: a second pass changes nothing.

Pure functions + CLI; no network, no provider, no credential access.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

FRONT_MATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
PERMALINK_LINE_RE = re.compile(r"(?m)^permalink:\s*(\S+)\s*$")


def parse_front_matter(text: str) -> dict:
    """Top-level front matter only: indented (nested) keys are ignored.

    Generated article front matter nests blocks (e.g. cross-link maps) that
    can carry their own ``permalink:`` items; accepting them silently
    overwrote the real top-level permalink and manufactured phantom
    duplicate-permalink verdicts.
    """
    match = FRONT_MATTER_RE.match(text)
    if not match:
        return {}
    front = {}
    for line in match.group(1).splitlines():
        if not line or line[0] in " 	-#":
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        front[key.strip()] = value.strip().strip("'\"")
    return front


def read_permalink(path: Path) -> str:
    return parse_front_matter(path.read_text(encoding="utf-8")).get("permalink", "")


def _slug_of(permalink: str) -> str:
    return permalink.strip().strip("/").rsplit("/", 1)[-1]


def find_collisions(index_paths: list[Path]) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {}
    for path in index_paths:
        groups.setdefault(read_permalink(path), []).append(path)
    return {permalink: paths for permalink, paths in groups.items() if len(paths) > 1}


def _stem(path: Path) -> str:
    return path.stem[: -len("_index")] if path.stem.endswith("_index") else path.stem


def identify_group_owner(paths: list[Path]) -> Path | None:
    """The group-level index: its stem is a prefix of every other stem."""
    if not paths:
        return None
    candidates = [
        path
        for path in paths
        if all(other == path or other.stem.startswith(path.stem[: -len("_index")] if path.stem.endswith("_index") else path.stem) for other in paths)
    ]
    if len(candidates) != 1:
        return None
    return candidates[0]


def _all_subtopic_members(paths: list[Path], group_slug: str) -> bool:
    """True when every member is a subtopic index (no group-level owner).

    Guarded: requires 0 prefix-owner candidates (a real group index would
    have been identified), a non-empty ``parent_permalink`` on every member,
    and every member stem sharing the group's underscore-form prefix —
    proof they belong to the same generated group rather than an
    unstructured set.
    """
    if identify_group_owner(paths) is not None:
        return False
    prefix = group_slug.replace("-", "_") + "_"
    for path in paths:
        front = parse_front_matter(path.read_text(encoding="utf-8"))
        if not front.get("parent_permalink", "").strip("/"):
            return False
        if not _stem(path).startswith(prefix):
            return False
    return True


def plan_repairs(pages_root: Path) -> tuple[dict[Path, str], list[str]]:
    """Compute ``{path: new_permalink}`` and fail-closed problem reports."""
    index_paths = sorted(pages_root.rglob("*_index.md"))
    all_permalink_owners: dict[str, str] = {}
    for path in sorted(pages_root.rglob("*.md")):
        permalink = read_permalink(path)
        if permalink:
            all_permalink_owners.setdefault(permalink, path.name)

    plans: dict[Path, str] = {}
    problems: list[str] = []
    for permalink, paths in sorted(find_collisions(index_paths).items()):
        group_slug = _slug_of(permalink)
        owner = identify_group_owner(paths)
        if owner is not None:
            members = [path for path in paths if path != owner]
        elif _all_subtopic_members(paths, group_slug):
            # No group-level index exists: the group permalink is orphaned
            # (never validly served under last-write-wins). Every member is
            # a subtopic index and gets a derived permalink; the group
            # permalink becomes unclaimed.
            members = list(paths)
        else:
            problems.append(
                f"no_unique_group_owner for {permalink}: {[p.name for p in paths]}"
            )
            continue
        for path in members:
            if path == owner:
                continue
            front = parse_front_matter(path.read_text(encoding="utf-8"))
            parent_permalink = front.get("parent_permalink", "")
            if not parent_permalink:
                problems.append(f"missing_parent_permalink: {path.name}")
                continue
            subtopic_slug = _slug_of(parent_permalink)
            if not subtopic_slug:
                problems.append(f"empty_subtopic_slug: {path.name}")
                continue
            candidate = f"/{group_slug}-{subtopic_slug}/"
            existing_owner = all_permalink_owners.get(candidate)
            if existing_owner and existing_owner != path.name:
                problems.append(
                    f"candidate_permalink_already_taken: {candidate} by {existing_owner} (for {path.name})"
                )
                continue
            plans[path] = candidate
            all_permalink_owners[candidate] = path.name
    return plans, problems


def repair_file(path: Path, new_permalink: str) -> bool:
    """Rewrite only the permalink line; True when the file changed."""
    text = path.read_text(encoding="utf-8")
    new_text, count = PERMALINK_LINE_RE.subn(
        f"permalink: {new_permalink}", text, count=1
    )
    if count != 1 or new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8", newline="")
    return True


def verify(pages_root: Path) -> list[str]:
    """Every permalink in pages/ must be unique; return problem reports."""
    seen: dict[str, str] = {}
    problems: list[str] = []
    for path in sorted(pages_root.rglob("*.md")):
        permalink = read_permalink(path)
        if not permalink:
            continue
        if permalink in seen:
            problems.append(
                f"duplicate_permalink_after_repair: {permalink} in {seen[permalink]} and {path.name}"
            )
        seen[permalink] = path.name
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default="pages")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args(argv)

    pages_root = Path(args.root)
    if not pages_root.is_dir():
        print(f"root directory not found: {pages_root}", file=sys.stderr)
        return 2
    if args.verify:
        problems = verify(pages_root)
        for problem in problems:
            print(f"PROBLEM {problem}")
        print(f"verify: duplicate_permalinks={len(problems)}")
        return 1 if problems else 0

    plans, problems = plan_repairs(pages_root)
    for problem in problems:
        print(f"SKIPPED {problem}")
    changed = 0
    for path, new_permalink in sorted(plans.items()):
        if repair_file(path, new_permalink):
            changed += 1
    print(
        f"repair: planned={len(plans)} changed={changed} skipped={len(problems)}"
    )
    problems = verify(pages_root)
    for problem in problems:
        print(f"PROBLEM {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
