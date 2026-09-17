"""Falsifiers for the entity-encoded Liquid repair (roswell cohort 2026-06).

The generator emitted internal-link Liquid into citation/endnote text with
HTML entity encoding; Jekyll cannot process encoded Liquid, so the literal
``{{ ... | relative_url }}`` leaks into visible content. These tests pin the
deterministic decode-in-place repair:

- both canonical encoded forms decode to valid straight-quote Liquid;
- the path argument is preserved verbatim (including inner spaces/dashes);
- nothing outside the encoded spans changes (byte-level span isolation);
- the repair is idempotent (second pass replaces nothing);
- the residue scanner is fail-closed: partial/unknown encodings are
  reported, never rewritten;
- residue scanning detects every brace-entity family after a partial repair.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from repair_entity_encoded_liquid import (  # noqa: E402
    decode_entity_encoded_liquid,
    find_residue,
)


class DecodeCanonicalFormsTests(unittest.TestCase):
    def test_single_encoded_form_decodes(self):
        text = "Title: roswell [daily record](&#123;&#123; 'daily-record/' | relative_url &#125;&#125;) paper"
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertIn(
            "[daily record]({{ 'daily-record/' | relative_url }})", repaired
        )
        self.assertEqual(len(replacements), 1)
        self.assertEqual(replacements[0]["kind"], "single_encoded")
        self.assertEqual(replacements[0]["path"], "daily-record/")

    def test_double_encoded_form_decodes_with_entity_quotes(self):
        text = (
            "summary><p>[Roswell - UFO Crash]("
            "&amp;#123;&amp;#123; &#x27;roswell-ufo-crash/&#x27; | relative_url "
            "&amp;#125;&amp;#125;) in New Mexico"
        )
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertIn(
            "[Roswell - UFO Crash]({{ 'roswell-ufo-crash/' | relative_url }})",
            repaired,
        )
        self.assertEqual(len(replacements), 1)
        self.assertEqual(replacements[0]["kind"], "double_encoded")
        self.assertEqual(replacements[0]["path"], "roswell-ufo-crash/")

    def test_double_encoded_form_with_plain_quotes_decodes(self):
        text = "[legacy](&amp;#123;&amp;#123; 'legacy/' | relative_url &amp;#125;&amp;#125;)"
        repaired, _ = decode_entity_encoded_liquid(text)
        self.assertIn("[legacy]({{ 'legacy/' | relative_url }})", repaired)

    def test_path_argument_preserved_verbatim(self):
        text = "[x](&#123;&#123; '1947-records-f66cf3/sub-dir_' | relative_url &#125;&#125;)"
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertIn("{{ '1947-records-f66cf3/sub-dir_' | relative_url }}", repaired)
        self.assertEqual(replacements[0]["path"], "1947-records-f66cf3/sub-dir_")

    def test_both_forms_in_one_document(self):
        text = (
            "a [one](&#123;&#123; 'one/' | relative_url &#125;&#125;) b "
            "[two](&amp;#123;&amp;#123; &#x27;two/&#x27; | relative_url &amp;#125;&amp;#125;)"
        )
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertEqual(len(replacements), 2)
        self.assertNotIn("&#123;", repaired)
        self.assertNotIn("&amp;#123;", repaired)


class SpanIsolationAndIdempotenceTests(unittest.TestCase):
    def test_nothing_outside_encoded_spans_changes(self):
        text = (
            "Keep &#x27;apostrophe&#x27; entities and [real links](/plain/) as-is. "
            "Then [endnote](&#123;&#123; 'end/' | relative_url &#125;&#125;)."
        )
        repaired, _ = decode_entity_encoded_liquid(text)
        self.assertIn("Keep &#x27;apostrophe&#x27; entities and [real links](/plain/) as-is.", repaired)
        self.assertIn("[endnote]({{ 'end/' | relative_url }})", repaired)

    def test_repair_is_idempotent(self):
        text = "s [x](&#123;&#123; 'p/' | relative_url &#125;&#125;) d [y](&amp;#123;&amp;#123; &#x27;q/&#x27; | relative_url &amp;#125;&amp;#125;)"
        once, first = decode_entity_encoded_liquid(text)
        twice, second = decode_entity_encoded_liquid(once)
        self.assertEqual(once, twice)
        self.assertEqual(first and len(first), 2)
        self.assertEqual(second, [])


class ResidueScannerTests(unittest.TestCase):
    def test_clean_text_has_no_residue(self):
        text = "fine [x]({{ 'p/' | relative_url }}) end"
        self.assertEqual(find_residue(text), [])

    def test_partial_single_encoding_is_reported_not_rewritten(self):
        text = "broken [x](&#123;&#123; 'p/' | relative_url) no-close"
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertEqual(replacements, [])
        self.assertNotEqual(find_residue(text), [])

    def test_double_open_single_close_mismatch_is_reported(self):
        text = "mixed [x](&amp;#123;&amp;#123; 'p/' | relative_url &#125;&#125;)"
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertEqual(replacements, [])
        self.assertNotEqual(find_residue(text), [])

    def test_unknown_double_encoding_is_reported(self):
        text = "odd [x](&amp;amp;#123;&amp;amp;#123; 'p/' | relative_url &amp;amp;#125;&amp;amp;#125;)"
        repaired, replacements = decode_entity_encoded_liquid(text)
        self.assertEqual(replacements, [])
        self.assertNotEqual(find_residue(text), [])


if __name__ == "__main__":
    unittest.main()
