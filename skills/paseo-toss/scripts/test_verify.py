"""Regression checks for the portable bundle's integrity boundary."""
from pathlib import Path
import shutil
import tempfile
import unittest
from verify import verify


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'paseo-toss'
        shutil.copytree(Path(__file__).resolve().parents[1], self.root)

    def test_bundle(self):
        errors, count = verify(self.root)
        self.assertEqual(errors, [])
        self.assertGreater(count, 60)

    def test_modified_template_is_rejected(self):
        (self.root / 'upstream/shared/templates/react-vite/package.json').write_text('{}')
        self.assertTrue(any('resource missing or changed' in e for e in verify(self.root)[0]))

    def test_untracked_resource_is_rejected(self):
        (self.root / 'upstream/extra.sh').write_text('exit 0')
        self.assertIn('upstream file inventory differs', verify(self.root)[0])

    def test_nested_discovery_is_rejected(self):
        (self.root / 'upstream/shared/skills/plan/SKILL.md').write_text('extra skill')
        self.assertIn('unexpected nested skill entrypoints', verify(self.root)[0])


if __name__ == '__main__':
    unittest.main()
