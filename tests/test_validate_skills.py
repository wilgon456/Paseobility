import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
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


class PsWriteTests(unittest.TestCase):
    source = Path(__file__).resolve().parents[1] / 'skills' / 'ps-write'

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.skill = Path(temp.name) / 'ps-write'
        shutil.copytree(self.source, self.skill)

    def test_vendored_references_match_pinned_hashes(self):
        vendor = self.skill / 'vendor/humanize-korean'
        expected = {
            'quick-rules.md': '7a8e66c7b9326c1df7413f7a5662d69e89907591e16ba740e5746bf01f544b85',
            'rewriting-playbook.md': '1f949bb902e6d22027a297c7e820df54a0c14e304e451a607249704dd5e0b381',
            'LICENSE': '4cc7e8c439fe42f09d98457599c129ea6df9e5d0e622750d75952b441a38343f',
        }
        for filename, digest in expected.items():
            with self.subTest(filename=filename):
                self.assertEqual(hashlib.sha256((vendor / filename).read_bytes()).hexdigest(), digest)

    def test_validator_rejects_missing_vendor_files(self):
        self.assertEqual(validator.validate_ps_write(self.skill), [])
        for filename in ('quick-rules.md', 'rewriting-playbook.md', 'LICENSE', 'SOURCES.md'):
            with self.subTest(filename=filename):
                path = Path('vendor/humanize-korean') / filename
                copy = self.skill / path
                copy.unlink()
                self.assertIn(f'ps-write: required file missing: {path.as_posix()}',
                              validator.validate_ps_write(self.skill))
                shutil.copyfile(self.source / path, copy)

    def test_validator_rejects_broken_links_in_both_entry_points(self):
        for filename, target in (
            ('SKILL.md', 'references/korean-style.md'),
            ('references/korean-style.md', '../vendor/humanize-korean/quick-rules.md'),
        ):
            with self.subTest(filename=filename):
                path = self.skill / filename
                original = path.read_text(encoding='utf-8')
                broken = target + '.missing'
                path.write_text(original.replace(f']({target})', f']({broken})'), encoding='utf-8')
                self.assertIn(f'ps-write: broken link in {filename}: {broken}',
                              validator.validate_ps_write(self.skill))
                path.write_text(original, encoding='utf-8')
