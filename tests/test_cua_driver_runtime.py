"""Exercise the Cua Driver runtime step offline with mocked installers.

No network and no real host change: the upstream installer is replaced by a
local fake (PASEOBILITY_CUA_INSTALLER_DIR) or by local ``file://`` URLs
(PASEOBILITY_CUA_RAW_BASE), and the host-runtime branch is redirected to a temp
bin dir with PASEOBILITY_CUA_BIN_DIR. ``$HOME`` is never repurposed -- the
skills target is redirected with ``--target-home`` instead.

PowerShell wrappers are source-reviewed only (no pwsh on this host); that
limitation is documented in the README rather than asserted from source text.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
DRIVER = ROOT / "scripts/paseobility-cua-driver.sh"
INIT = ROOT / "scripts/paseobility-init.sh"

WORKING_BINARY = "#!/usr/bin/env bash\necho 'cua-driver 0.28.2 (fake)'\n"
BROKEN_BINARY = "#!/usr/bin/env bash\necho 'broken cua-driver' >&2\nexit 3\n"

FAKE_INSTALLER = r'''#!/usr/bin/env bash
set -euo pipefail
if [ -n "${FAKE_LOG:-}" ]; then
  printf 'run %s\n' "$*" >> "$FAKE_LOG"
fi
bin_dir=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --bin-dir) bin_dir="$2"; shift 2 ;;
    --bin-dir=*) bin_dir="${1#*=}"; shift ;;
    *) shift ;;
  esac
done
[ -n "$bin_dir" ] || bin_dir="$HOME/.local/bin"
if [ "${FAKE_EXIT:-0}" != "0" ]; then
  echo "fake installer: simulated failure" >&2
  exit "${FAKE_EXIT}"
fi
mode="${FAKE_MODE:-ok}"
if [ "$mode" = "none" ]; then
  exit 0
fi
mkdir -p "$bin_dir"
if [ "$mode" = "broken" ]; then
  cat > "$bin_dir/cua-driver" <<'BIN'
#!/usr/bin/env bash
echo "broken cua-driver" >&2
exit 3
BIN
else
  cat > "$bin_dir/cua-driver" <<'BIN'
#!/usr/bin/env bash
echo "cua-driver 0.28.2 (fake)"
BIN
fi
chmod +x "$bin_dir/cua-driver"
'''


def sanitized_path():
    """PATH without any entry that already provides cua-driver."""
    keep = []
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if entry and os.path.exists(os.path.join(entry, "cua-driver")):
            continue
        keep.append(entry)
    return os.pathsep.join(keep)


class CuaDriverRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="paseobility-cua-runtime-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.bin_dir = self.base / "bin"
        self.log = self.base / "fake.log"
        self.installer_dir = self.base / "installer"
        self.installer_dir.mkdir()
        (self.installer_dir / "install.sh").write_text(FAKE_INSTALLER)
        (self.base / "tmp").mkdir()
        (self.base / "home").mkdir()

    def env(self, **extra):
        # HOME stays the real host home so the installer's "custom --target-home"
        # detection is exercised honestly. The host bin dir is redirected with
        # PASEOBILITY_CUA_BIN_DIR (a test hook), never by repurposing HOME.
        merged = {
            "PATH": sanitized_path(),
            "HOME": os.environ["HOME"],
            "TMPDIR": str(self.base / "tmp"),
            "PASEOBILITY_CUA_INSTALLER_DIR": str(self.installer_dir),
            "PASEOBILITY_CUA_BIN_DIR": str(self.bin_dir),
            "FAKE_LOG": str(self.log),
        }
        merged.update({k: str(v) for k, v in extra.items()})
        return merged

    def run_driver(self, *args, env=None):
        return subprocess.run(["bash", str(DRIVER), *args],
                              capture_output=True, text=True, timeout=60,
                              env=env or self.env())

    def install(self, *args, env=None):
        return subprocess.run(
            ["bash", str(INIT), "--target-home", str(self.base / "home"),
             "--root", str(ROOT), "--no-context", "--no-paseo-check", *args],
            capture_output=True, text=True, timeout=60, env=env or self.env())

    def reads(self):
        return self.log.read_text() if self.log.exists() else ""

    def write_binary(self, content, executable=True):
        self.bin_dir.mkdir(exist_ok=True)
        binary = self.bin_dir / "cua-driver"
        binary.write_text(content)
        binary.chmod(0o755 if executable else 0o644)
        return binary

    # --- driver: install / reuse / skip / failure -------------------------

    def test_missing_runtime_installs_once(self):
        result = self.run_driver("--bin-dir", str(self.bin_dir))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.bin_dir / "cua-driver").exists())
        self.assertEqual(len(self.reads().strip().splitlines()), 1)
        self.assertIn("installed:", result.stdout)

    def test_existing_working_driver_is_reused_without_installing(self):
        self.write_binary(WORKING_BINARY)
        result = self.run_driver("--bin-dir", str(self.bin_dir))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("present:", result.stdout)
        self.assertEqual(self.reads(), "")

    def test_existing_broken_executable_is_preserved(self):
        binary = self.write_binary(BROKEN_BINARY)
        result = self.run_driver("--bin-dir", str(self.bin_dir))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("broken", result.stderr.lower())
        self.assertEqual(binary.read_text(), BROKEN_BINARY)
        self.assertEqual(self.reads(), "")

    def test_existing_non_executable_is_treated_as_installing(self):
        self.write_binary(BROKEN_BINARY, executable=False)
        result = self.run_driver("--bin-dir", str(self.bin_dir))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(self.reads().strip().splitlines()), 1)

    def test_check_reports_missing_without_installing(self):
        result = self.run_driver("--check", "--bin-dir", str(self.bin_dir))
        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        self.assertFalse((self.bin_dir / "cua-driver").exists())

    def test_dry_run_does_not_execute_installer(self):
        result = self.run_driver("--dry-run", "--bin-dir", str(self.bin_dir))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("dry-run", result.stdout)
        self.assertEqual(self.reads(), "")
        self.assertFalse((self.bin_dir / "cua-driver").exists())

    def test_installer_failure_is_nonzero(self):
        result = self.run_driver("--bin-dir", str(self.bin_dir),
                                 env=self.env(FAKE_EXIT=7))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.bin_dir / "cua-driver").exists())

    def test_installer_success_but_broken_binary_fails(self):
        result = self.run_driver("--bin-dir", str(self.bin_dir),
                                 env=self.env(FAKE_MODE="broken"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("runtime setup failed", result.stderr)

    def test_installer_success_but_missing_binary_fails(self):
        result = self.run_driver("--bin-dir", str(self.bin_dir),
                                 env=self.env(FAKE_MODE="none"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("runtime setup failed", result.stderr)

    # --- driver: download path + optional digests -------------------------

    def _serve(self):
        served = self.base / "served"
        served.mkdir(exist_ok=True)
        (served / "install.sh").write_text(FAKE_INSTALLER)
        (served / "_install-rust.sh").write_text("#!/usr/bin/env bash\n:\n")
        (served / "_install-common.sh").write_text("#!/usr/bin/env bash\n:\n")
        return served

    def test_pinned_download_uses_local_raw_base(self):
        served = self._serve()
        env = self.env(PASEOBILITY_CUA_RAW_BASE=f"file://{served}",
                       PASEOBILITY_CUA_INSTALLER_DIR="")
        result = self.run_driver("--bin-dir", str(self.bin_dir), env=env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.bin_dir / "cua-driver").exists())

    def test_expected_digest_mismatch_aborts_before_running(self):
        served = self._serve()
        env = self.env(PASEOBILITY_CUA_RAW_BASE=f"file://{served}",
                       PASEOBILITY_CUA_INSTALLER_DIR="",
                       PASEOBILITY_CUA_INSTALL_SHA256="0" * 64)
        result = self.run_driver("--bin-dir", str(self.bin_dir), env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.bin_dir / "cua-driver").exists())
        self.assertEqual(self.reads(), "")

    def test_expected_digest_match_proceeds(self):
        served = self._serve()
        digest = hashlib.sha256((served / "install.sh").read_bytes()).hexdigest()
        env = self.env(PASEOBILITY_CUA_RAW_BASE=f"file://{served}",
                       PASEOBILITY_CUA_INSTALLER_DIR="",
                       PASEOBILITY_CUA_INSTALL_SHA256=digest)
        result = self.run_driver("--bin-dir", str(self.bin_dir), env=env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("verified pinned digest for install.sh", result.stdout)

    # --- installer selection + isolation ----------------------------------

    def test_custom_target_home_skips_runtime_by_default(self):
        result = self.install("--skill", "paseo-cua")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("skipped for custom --target-home", result.stdout)
        self.assertEqual(self.reads(), "")
        self.assertTrue((self.base / "home/.agents/skills/paseo-cua/SKILL.md").exists())
        self.assertFalse((self.bin_dir / "cua-driver").exists())
        self.assertFalse((self.base / "home/.local/bin/cua-driver").exists())

    def test_unrelated_skill_does_not_request_runtime(self):
        result = self.install("--skill", "paseo-share")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("not requested", result.stdout)
        self.assertEqual(self.reads(), "")

    def test_full_package_requests_runtime_but_skips_for_custom_target(self):
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("skipped for custom --target-home", result.stdout)
        self.assertEqual(self.reads(), "")
        self.assertTrue((self.base / "home/.agents/skills/paseo-cua/SKILL.md").exists())

    def test_skip_cua_driver_flag(self):
        result = self.install("--skill", "paseo-cua", "--skip-cua-driver")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("--skip-cua-driver", result.stdout)
        self.assertEqual(self.reads(), "")

    def test_allow_host_runtime_installs_on_host_bin(self):
        result = self.install("--skill", "paseo-cua", "--allow-host-runtime")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.bin_dir / "cua-driver").exists())
        self.assertFalse((self.base / "home/.local/bin/cua-driver").exists())
        self.assertEqual(len(self.reads().strip().splitlines()), 1)

    def test_allow_host_runtime_failure_is_nonzero_but_skills_remain(self):
        result = self.install("--skill", "paseo-cua", "--allow-host-runtime",
                              env=self.env(FAKE_EXIT=5))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("runtime setup failed", result.stdout)
        self.assertIn("partial files possible", result.stdout)
        self.assertTrue((self.base / "home/.agents/skills/paseo-cua/SKILL.md").exists())
        self.assertFalse((self.bin_dir / "cua-driver").exists())


if __name__ == "__main__":
    unittest.main()
