import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

try:
    import yaml
except ImportError:
    raise unittest.SkipTest("PyYAML is a validation-only dependency; use uv run --with pyyaml")

spec = importlib.util.spec_from_file_location('skill_catalog_validator', Path(__file__).resolve().parents[1] / 'scripts/validate-skills.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.skill = self.root / 'skills' / 'paseo-test'
        self.skill.mkdir(parents=True)
        (self.root / 'VERSION').write_text('1.0.0\n')
        self.manifest = {'version':'1.0.0', 'skills':['paseo-test']}
        self.write_manifest()
        self.skill_file = self.skill / 'SKILL.md'
        self.skill_file.write_text('---\nname: paseo-test\ndescription: >-\n  Run the test workflow.\n---\nUseful instructions.\n')

    def write_manifest(self):
        (self.root / 'paseobility.json').write_text(json.dumps(self.manifest))

    def test_folded_description_and_matching_catalog(self):
        self.assertEqual(validator.validate(self.root), [])

    def test_version_and_duplicate_catalog_drift(self):
        self.manifest.update(version='2.0.0', skills=['paseo-test','paseo-test'])
        self.write_manifest()
        errors = '\n'.join(validator.validate(self.root))
        self.assertIn('duplicate', errors)
        self.assertIn('version differs', errors)

    def test_missing_or_unlisted_skill_fails(self):
        (self.root / 'skills' / 'unlisted').mkdir()
        self.assertIn('directories differ', '\n'.join(validator.validate(self.root)))
        self.skill_file.unlink()
        self.assertTrue(validator.validate(self.root))

    def test_name_description_and_yaml_are_checked(self):
        for content, expected in [
            ('---\nname: wrong\ndescription: test\n---\nbody', 'name mismatch'),
            ('---\nname: paseo-test\ndescription: []\n---\nbody', 'description missing'),
            ('---\nname: [\n---\nbody', 'invalid YAML'),
        ]:
            self.skill_file.write_text(content)
            self.assertIn(expected, '\n'.join(validator.validate(self.root)))

    def test_missing_body_is_rejected(self):
        self.skill_file.write_text('---\nname: paseo-test\ndescription: test\n---\n')
        self.assertIn('instructions missing', '\n'.join(validator.validate(self.root)))

    def test_non_object_manifests_return_validation_errors(self):
        for manifest in [None, [], "catalog", 42]:
            with self.subTest(manifest=manifest):
                (self.root / 'paseobility.json').write_text(json.dumps(manifest))
                self.assertTrue(validator.validate(self.root))
