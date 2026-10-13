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
                                    capture_output=True, text=True, timeout=15)
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


if __name__ == '__main__':
    unittest.main()
