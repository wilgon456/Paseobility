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


@unittest.skipUnless(SHELLS, 'PowerShell required for Windows scanner-helper behavior')
class ScannerHelperTests(unittest.TestCase):
    def test_report_omits_values_and_osv_receives_current_flags(self):
        for shell in SHELLS:
            with self.subTest(shell=shell), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                target, report = root / 'target', root / 'report'
                target.mkdir()
                (target / 'fixture.js').write_text('GITHUB_TOKEN="fixture-sensitive-value-123"')
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
                self.assertNotIn('fixture-sensitive-value-123', content)
                output = json.loads((report / 'osv-scanner.json').read_text(encoding='utf-8-sig'))
                self.assertEqual(output['results'], [])


if __name__ == '__main__':
    unittest.main()
