"""Generated hints must reflect module instructions and an evidenced manager."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/paseobility-context.sh'


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash') and shutil.which('node'),
                     'POSIX Bash and Node required for the context helper')
class ContextTests(unittest.TestCase):
    def generate(self, manifest, locks=(), nested=False):
        with tempfile.TemporaryDirectory(prefix='paseo-context-') as temporary:
            root = Path(temporary)
            (root / 'package.json').write_text(json.dumps(manifest))
            for lock in locks:
                (root / lock).write_text('fixture')
            if nested:
                module = root / 'packages/app'
                module.mkdir(parents=True)
                (module / 'AGENTS.md').write_text('MODULE_INSTRUCTION_FIXTURE')
            result = subprocess.run(['bash', str(SCRIPT), '--root', str(root)],
                                    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            context = (root / '.paseobility/context.md').read_text()
            commands = (root / '.paseobility/commands.md').read_text()
            return context, commands

    def test_declared_manager_and_nested_instructions_are_preserved(self):
        context, commands = self.generate({'packageManager': 'bun@1.3.0'},
                                          ('pnpm-lock.yaml',), nested=True)
        self.assertIn('MODULE_INSTRUCTION_FIXTURE', context)
        self.assertIn('packages/app/AGENTS.md', context)
        self.assertIn('`bun install`', commands)
        self.assertNotIn('`pnpm install`', commands)

    def test_multiple_lockfiles_do_not_invent_an_install_command(self):
        _, commands = self.generate({}, ('pnpm-lock.yaml', 'package-lock.json'))
        self.assertIn('unresolved', commands)
        self.assertNotIn('`pnpm install`', commands)
        self.assertNotIn('`npm install`', commands)

    def test_missing_or_unsupported_manager_does_not_default_to_npm(self):
        for manifest in ({}, {'packageManager': 'unknown@1.0.0'}):
            with self.subTest(manifest=manifest):
                _, commands = self.generate(manifest)
                self.assertIn('unresolved', commands)
                self.assertNotIn('`npm install`', commands)

    def test_single_bun_lock_is_detected_without_declaration(self):
        _, commands = self.generate({}, ('bun.lock',))
        self.assertIn('`bun install`', commands)

    def test_dev_engines_manager_precedes_lockfile_inference(self):
        _, commands = self.generate({'devEngines': {'packageManager':
            {'name': 'yarn', 'version': '4.0.0'}}}, ('package-lock.json',))
        self.assertIn('`yarn install`', commands)
        self.assertNotIn('`npm install`', commands)

    def test_repeated_generation_drains_large_skipped_context(self):
        with tempfile.TemporaryDirectory(prefix='paseo-context-') as temporary:
            root = Path(temporary)
            (root / 'README.md').write_text('x' * 200000)
            command = ['bash', str(SCRIPT), '--root', str(root)]
            first = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(first.returncode, 0, first.stderr)
            context = root / '.paseobility/context.md'
            original = context.read_bytes()
            second = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(context.read_bytes(), original)

    def test_stdout_does_not_create_output_directory(self):
        with tempfile.TemporaryDirectory(prefix='paseo-context-') as temporary:
            root = Path(temporary)
            result = subprocess.run(
                ['bash', str(SCRIPT), '--root', str(root), '--stdout'],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(root.iterdir()), [])

    def test_project_map_handles_shell_and_regex_characters_in_root(self):
        with tempfile.TemporaryDirectory(prefix='paseo-context-') as temporary:
            root = Path(temporary) / 'project#[demo]'
            root.mkdir()
            (root / 'main.txt').write_text('fixture')
            result = subprocess.run(
                ['bash', str(SCRIPT), '--root', str(root)],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            project_map = (root / '.paseobility/project-map.md').read_text()
            self.assertIn('\nmain.txt\n', project_map)

    def test_nested_generated_trees_are_not_instruction_sources(self):
        with tempfile.TemporaryDirectory(prefix='paseo-context-') as temporary:
            root = Path(temporary)
            for directory in ['packages/app/node_modules/dependency',
                              'packages/app/.paseobility']:
                source = root / directory / 'AGENTS.md'
                source.parent.mkdir(parents=True)
                source.write_text('GENERATED_INSTRUCTION_FIXTURE')
            result = subprocess.run(
                ['bash', str(SCRIPT), '--root', str(root)],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            context = (root / '.paseobility/context.md').read_text()
            self.assertNotIn('GENERATED_INSTRUCTION_FIXTURE', context)


if __name__ == '__main__':
    unittest.main()
