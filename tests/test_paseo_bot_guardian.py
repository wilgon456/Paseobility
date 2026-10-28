"""Guardian service build and installer plan on Windows; registers nothing and changes no system state."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GUARDIAN = ROOT / 'tools/paseo-bot/guardian'
CSC = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'


@unittest.skipUnless(sys.platform == 'win32' and CSC.is_file(), 'Windows .NET Framework compiler')
class GuardianTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.exe = Path(cls.tmp.name) / 'PaseoBotGuardian.exe'
        build = subprocess.run([str(CSC), '/nologo', '/target:exe', '/warnaserror', '/r:System.ServiceProcess.dll',
                                '/r:System.Management.dll', '/out:' + str(cls.exe), str(GUARDIAN / 'PaseoBotGuardian.cs')],
                               capture_output=True, text=True)
        cls.build = build

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_builds_without_warnings(self):
        self.assertEqual(self.build.returncode, 0, self.build.stdout)

    def check(self, text):
        ini = Path(self.tmp.name) / 'guardian.ini'
        ini.write_text(text, encoding='utf-8')
        return subprocess.run([str(self.exe), '--check-config', str(ini)], capture_output=True, text=True).returncode

    def test_config_requires_a_valid_sid_command_and_match(self):
        self.assertEqual(self.check('UserSid=S-1-5-21-1-2-3-1001\nCommand=C:\\Python\\pythonw.exe\nMatch=supervisor.py\n'), 0)
        self.assertNotEqual(self.check('UserSid=not-a-sid\nCommand=x\nMatch=y\n'), 0)
        self.assertNotEqual(self.check('UserSid=S-1-5-21-1-2-3-1001\nMatch=supervisor.py\n'), 0)

    def test_installer_without_apply_only_plans(self):
        sid = subprocess.run(['powershell.exe', '-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],
                             capture_output=True, text=True).stdout.strip()
        r = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(GUARDIAN / 'install-guardian.ps1'),
                            '-UserSid', sid, '-Pythonw', sys.executable, '-State', self.tmp.name],
                           capture_output=True, text=True, encoding='utf-8')
        plan = json.loads(r.stdout)
        self.assertTrue(plan['ok'], r.stdout); self.assertFalse(plan['result']['applied'])
        self.assertIn('never as SYSTEM', plan['result']['runsAs'])


if __name__ == '__main__':
    unittest.main()
