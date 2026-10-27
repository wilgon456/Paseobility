"""PowerShell scanner adapters exercise local fixtures, not external tools."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'skills/paseo-spyware-check/scripts/spyware-check.ps1'
SHELLS = [shell for shell in ('pwsh', 'powershell') if shutil.which(shell)]


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash'), 'POSIX Bash required')
class PosixScannerHelperTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('rg'), 'Optional real-ripgrep integration requires rg')
    def test_real_rg_ignores_personal_config_and_repeats_without_leaks(self):
        with tempfile.TemporaryDirectory(prefix='real-rg-scan-') as temporary:
            root = Path(temporary)
            tools, target = root / 'bin', root / 'target # [fixture]'
            tools.mkdir()
            target.mkdir()
            for name in ('bash', 'cat', 'date', 'dirname', 'find', 'git', 'grep',
                         'mkdir', 'mktemp', 'rm', 'sed', 'awk', 'rg'):
                (tools / name).symlink_to(shutil.which(name))
            payload = target / 'skills/paseo-spyware-check/scripts/fixture.js'
            payload.parent.mkdir(parents=True)
            payload.write_text('GITHUB_TOKEN="fixture-sensitive-value-123"')
            config = root / 'invalid-rg-config'
            config.write_text('--invalid-fixture-flag\n')
            for attempt in range(2):
                output = root / ('report-' + str(attempt))
                result = subprocess.run([shutil.which('bash'), str(SCRIPT.with_suffix('.sh')),
                    '--target', str(target), '--out', str(output)],
                    capture_output=True, text=True, timeout=15,
                    env=dict(os.environ, PATH=str(tools), RIPGREP_CONFIG_PATH=str(config)))
                self.assertEqual(result.returncode, 0, result.stderr)
                report = (output / 'report.md').read_text()
                self.assertEqual(report.count('fixture.js:1:'), 1)
                self.assertIn('| High |', report)
                self.assertNotIn('fixture-sensitive-value-123', report)

    def test_repeatable_fixtures_ignore_host_scanners(self):
        suite = SCRIPT.with_name('spyware-check-shell.test.sh')
        with tempfile.TemporaryDirectory(prefix='host-scanner-sentinel-') as temporary:
            root = Path(temporary)
            sentinel = root / 'unexpected-call'
            for name in ('gitleaks', 'trufflehog', 'semgrep', 'osv-scanner', 'trivy', 'shellcheck', 'rg'):
                fake = root / name
                fake.write_text('#!/bin/sh\nprintf unsafe > "$HOST_TOOL_SENTINEL"\nexit 97\n')
                fake.chmod(0o755)
            for attempt in range(2):
                result = subprocess.run([shutil.which('bash'), str(suite)],
                    capture_output=True, text=True, timeout=30,
                    env=dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'],
                             HOST_TOOL_SENTINEL=str(sentinel)))
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertIn('ok 5 - fallback read errors', result.stdout)
                self.assertFalse(sentinel.exists(), 'host optional tool was executed')


@unittest.skipUnless(SHELLS, 'PowerShell required for Windows scanner-helper behavior')
class ScannerHelperTests(unittest.TestCase):
    def test_partial_install_returns_failure_after_remaining_commands(self):
        for shell in SHELLS:
            with self.subTest(shell=shell), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                calls = root / 'calls'
                wrapper = root / 'installer-probe.ps1'
                wrapper.write_text('''
$ErrorActionPreference = 'Stop'
function global:winget {}
function global:pipx {}
function global:cmd.exe {
  Add-Content -LiteralPath $env:INSTALL_CALLS -Value ($args -join ' ') -Encoding UTF8
  $global:LASTEXITCODE = if (($args -join ' ') -match 'Gitleaks.Gitleaks') { 19 } else { 0 }
}
& $env:FIXTURE_INSTALLER -Yes
''', encoding='utf-8')
                result = subprocess.run([shell, '-NoProfile', '-File', str(wrapper)],
                    capture_output=True, text=True, timeout=15,
                    env=dict(os.environ, INSTALL_CALLS=str(calls),
                             FIXTURE_INSTALLER=str(SCRIPT.with_name('install-scanners.ps1'))))
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                commands = calls.read_text(encoding='utf-8-sig').splitlines()
                self.assertEqual(len(commands), 3)
                self.assertIn('AquaSecurity.Trivy', commands[1])
                self.assertIn('pipx install semgrep', commands[2])

    def test_report_omits_values_and_osv_receives_current_flags(self):
        for shell in SHELLS:
            with self.subTest(shell=shell), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                target, report = root / 'target', root / 'report'
                target.mkdir()
                payload = target / 'skills/paseo-spyware-check/scripts/fixture.js'
                payload.parent.mkdir(parents=True)
                payload.write_text('GITHUB_TOKEN="fixture-sensitive-value-123"')
                wrapper = root / 'probe.ps1'
                wrapper.write_text('''
$ErrorActionPreference = 'Stop'
function global:gitleaks { $global:LASTEXITCODE=0 }
function global:trufflehog { $global:LASTEXITCODE=0 }
function global:semgrep { $global:LASTEXITCODE=0 }
function global:trivy { $global:LASTEXITCODE=0 }
function global:Invoke-ScriptAnalyzer {}
function global:osv-scanner {
  $outputIndex = [Array]::IndexOf($args, '--output-file')
  if ($outputIndex -lt 0 -or $args -notcontains '--no-resolve') { throw 'wrong OSV flags' }
  '{"results":[]}' | Set-Content -LiteralPath $args[$outputIndex+1] -Encoding UTF8
  $global:LASTEXITCODE=0
}
& $env:FIXTURE_SCANNER -Target $env:FIXTURE_TARGET -Out $env:FIXTURE_REPORT
''', encoding='utf-8')
                result = subprocess.run([shell, '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(wrapper)], capture_output=True, text=True, timeout=30,
                    env=dict(os.environ, FIXTURE_SCANNER=str(SCRIPT),
                             FIXTURE_TARGET=str(target), FIXTURE_REPORT=str(report)))
                self.assertEqual(result.returncode, 0, result.stderr)
                content = (report / 'report.md').read_text(encoding='utf-8-sig')
                self.assertIn('fixture.js:1:', content)
                self.assertIn('| High |', content)
                self.assertNotIn('fixture-sensitive-value-123', content)
                output = json.loads((report / 'osv-scanner.json').read_text(encoding='utf-8-sig'))
                self.assertEqual(output['results'], [])
                previous = (report / 'report.md').read_bytes()
                again = subprocess.run([shell, '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(wrapper)], capture_output=True, text=True, timeout=30,
                    env=dict(os.environ, FIXTURE_SCANNER=str(SCRIPT),
                             FIXTURE_TARGET=str(target), FIXTURE_REPORT=str(report)))
                self.assertNotEqual(again.returncode, 0)
                self.assertIn('report directory must be empty', again.stderr)
                self.assertEqual((report / 'report.md').read_bytes(), previous)
                nested = subprocess.run([shell, '-NoProfile', '-ExecutionPolicy', 'Bypass',
                    '-File', str(wrapper)], capture_output=True, text=True, timeout=30,
                    env=dict(os.environ, FIXTURE_SCANNER=str(SCRIPT),
                             FIXTURE_TARGET=str(target), FIXTURE_REPORT=str(target / 'report')))
                self.assertNotEqual(nested.returncode, 0)
                self.assertIn('outside the scanned target', nested.stderr)


if __name__ == '__main__':
    unittest.main()
