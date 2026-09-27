"""Deterministic decode of entity-encoded Liquid in generated page content.

Defect (website-20260620_160609-roswell-ufo-crash, cohort 2026-06): the
generator emitted internal-link Liquid templates into citation/endnote text
with HTML entity encoding. Jekyll cannot process encoded Liquid, so the
literal ``{{ ... | relative_url }}`` leaks into visible page content
(observed live, 194/242 pages, 460 occurrences).

Two canonical encoded forms exist in this cohort:

- single-encoded:  ``&#123;&#123; 'PATH' | relative_url &#125;&#125;``
- double-encoded:  ``&amp;#123;&amp;#123; &#x27;PATH&#x27; | relative_url &amp;#125;&amp;#125;``

The repair is decode-in-place: each encoded form becomes the valid
straight-quote Liquid ``{{ 'PATH' | relative_url }}`` with the exact path
argument preserved and no other content change. The scanner is fail-closed:
it reports any ``&#123;``-family residue it cannot attribute to the two
canonical forms instead of rewriting it.

Pure functions + CLI; no network, no provider, no credential access.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Opening/closing brace entities, single- and double-encoded, plus the
# apostrophe entity used inside the double-encoded form.
SINGLE_OPEN = "&#123;&#123;"
SINGLE_CLOSE = "&#125;&#125;"
DOUBLE_OPEN = "&amp;#123;&amp;#123;"
DOUBLE_CLOSE = "&amp;#125;&amp;#125;"

# ``PATH`` is any run of characters that is not a brace entity, a pipe, a
# quote or a closing paren; optional straight-quote delimiters are stripped
# and the replacement always emits exactly one quoting pair, preserving the
# path argument verbatim.
_SINGLE_RE = re.compile(
    re.escape(SINGLE_OPEN)
    + r"\s*(?:')?(?P<path>[^&{}|)']+?)(?:')?\s*\|\s*relative_url\s*"
    + re.escape(SINGLE_CLOSE)
)
_DOUBLE_RE = re.compile(
    re.escape(DOUBLE_OPEN)
    + r"\s*(?:&#x27;|')(?P<path>[^&{}|)']+?)(?:&#x27;|')\s*\|\s*relative_url\s*"
    + re.escape(DOUBLE_CLOSE)
)

_RESIDUE_TOKENS = (
    "&#123;",
    "&#125;",
    "&amp;#123;",
    "&amp;#125;",
    # Any deeper encoding level still contains these numeric fragments.
    "#123;",
    "#125;",
)

_VALID_LIQUID_RE = re.compile(r"\{\{\s*'[^{}|]+'\s*\|\s*relative_url\s*\}\}")


def decode_entity_encoded_liquid(text: str) -> tuple[str, list[dict]]:
    """Decode every canonical entity-encoded Liquid form.

    Returns ``(new_text, replacements)`` where each replacement records the
    encoded kind and the preserved path argument. Non-canonical residues are
    left untouched (the post-repair scan reports them).
    """
    replacements: list[dict] = []

    def _sub_single(match: re.Match) -> str:
        replacements.append({"kind": "single_encoded", "path": match.group("path")})
        return "{{ '" + match.group("path") + "' | relative_url }}"

    def _sub_double(match: re.Match) -> str:
        replacements.append({"kind": "double_encoded", "path": match.group("path")})
        return "{{ '" + match.group("path") + "' | relative_url }}"

    new_text = _DOUBLE_RE.sub(_sub_double, text)
    new_text = _SINGLE_RE.sub(_sub_single, new_text)
    return new_text, replacements


def find_residue(text: str) -> list[dict]:
    """Report brace-entity residue the decoder does not attribute."""
    residue = []
    consumed = decode_entity_encoded_liquid(text)[0]
    for token in _RESIDUE_TOKENS:
        for match in re.finditer(re.escape(token), consumed):
            residue.append(
                {
                    "token": token,
                    "index": match.start(),
                    "context": consumed[max(0, match.start() - 40) : match.start() + 60],
                }
            )
    return residue


def repair_file(path: Path) -> tuple[int, list[str]]:
    """Repair one file in place; returns (replacement_count, residues)."""
    original = path.read_text(encoding="utf-8")
    repaired, replacements = decode_entity_encoded_liquid(original)
    if not replacements:
        return 0, find_residue(original)
    path.write_text(repaired, encoding="utf-8", newline="")
    return len(replacements), find_residue(repaired)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default="pages", help="directory to repair (default: pages)")
    parser.add_argument("--verify", action="store_true", help="only scan: report counts and residues, change nothing")
    args = parser.parse_args(argv)

    root = Path(args.root)
    if not root.is_dir():
        print(f"root directory not found: {root}", file=sys.stderr)
        return 2

    total = residue_count = file_count = 0
    for path in sorted(root.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        if args.verify:
            residue = find_residue(text)
            residue_count += len(residue)
            if residue:
                print(f"RESIDUE {path}: {residue[:2]}")
            continue
        count, residues = repair_file(path)
        if count:
            file_count += 1
            total += count
        residue_count += len(residues)
        if residues:
            print(f"RESIDUE after repair {path}: {residues[:2]}")
    if args.verify:
        print(f"verify: residue_tokens={residue_count}")
        return 1 if residue_count else 0
    print(f"repair: files={file_count} replacements={total} residue_tokens={residue_count}")
    return 1 if residue_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
