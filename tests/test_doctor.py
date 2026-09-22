"""Offline tests for scripts/paseobility-doctor.py.

The doctor is a read-only, deterministic, stdlib-only helper. These tests never
touch the network, the real Paseo CLI, the real Cua Driver, or the host home:
every CLI case passes an explicit non-existent ``--paseo``/``--cua-bin`` and a
temporary ``--target-home``. Executable fixtures stand in for cua-driver and
need an execution bit, so those cases are POSIX-only; the pure parse/state
cases run on every platform (including Windows).
"""
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
DOCTOR = ROOT / "scripts/paseobility-doctor.py"

FULL_FIXTURE = '''#!__PY__
import json
import sys

args = sys.argv[1:]
if args[:1] == ["--version"]:
    print("cua-driver 0.28.2 (fake)")
    sys.exit(0)
if args[:2] == ["permissions", "status"]:
    print(json.dumps({"accessibility": True, "screen_recording": True}))
    sys.exit(0)
if args[:1] == ["status"]:
    print(json.dumps({"running": True}))
    sys.exit(0)
if args[:1] == ["mcp"]:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            continue
        method = message.get("method")
        if method == "initialize":
            print(json.dumps({"jsonrpc": "2.0", "id": message.get("id"),
                              "result": {"protocolVersion": "2024-11-05",
                                         "capabilities": {},
                                         "serverInfo": {"name": "fake",
                                                        "version": "1"}}}),
                  flush=True)
        elif method == "tools/list":
            print(json.dumps({"jsonrpc": "2.0", "id": message.get("id"),
                              "result": {"tools": [{"name": "a"},
                                                   {"name": "b"}]}}),
                  flush=True)
    sys.exit(0)
sys.exit(1)
'''

STOPPED_FIXTURE = FULL_FIXTURE.replace(
    'print(json.dumps({"running": True}))',
    'print(json.dumps({"running": False}))')

SILENT_FIXTURE = '''#!__PY__
import sys
import time

args = sys.argv[1:]
if args[:1] == ["--version"]:
    print("cua-driver 0.28.2 (fake)")
    sys.exit(0)
if args[:1] == ["status"]:
    print("{\\"running\\": true}")
    sys.exit(0)
if args[:1] == ["mcp"]:
    time.sleep(120)
sys.exit(0)
'''

# Scenario-driven MCP fixture: the JSON scenario file path comes from
# FAKE_MCP_SCENARIO_FILE. It lets a test choose the negotiated protocolVersion,
# inject JSON-RPC errors, omit jsonrpc, and drive pagination, without any new
# production surface.
SCENARIO_FIXTURE = '''#!__PY__
import json
import os
import sys

args = sys.argv[1:]
if args[:1] == ["--version"]:
    print("cua-driver 0.28.2 (fake)")
    sys.exit(0)
if args[:1] == ["mcp"]:
    with open(os.environ["FAKE_MCP_SCENARIO_FILE"], encoding="utf-8") as handle:
        scenario = json.load(handle)
    phase = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            continue
        method = message.get("method")
        if method == "initialize":
            if scenario.get("init_error") is not None:
                out = {"id": message.get("id"), "error": scenario["init_error"]}
            else:
                out = {"id": message.get("id"), "result": scenario["init"]}
            if not scenario.get("omit_jsonrpc"):
                out["jsonrpc"] = scenario.get("jsonrpc", "2.0")
            print(json.dumps(out), flush=True)
        elif method == "tools/list":
            pages = scenario.get("pages") or []
            page = pages[min(phase, len(pages) - 1)] if pages else {"tools": []}
            phase += 1
            print(json.dumps({"jsonrpc": scenario.get("jsonrpc", "2.0"),
                              "id": message.get("id"), "result": page}),
                  flush=True)
    sys.exit(0)
sys.exit(1)
'''


def load_doctor_module():
    spec = importlib.util.spec_from_file_location("paseobility_doctor", DOCTOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_doctor(*args, timeout=90):
    return subprocess.run(
        [sys.executable, str(DOCTOR), *args],
        capture_output=True, text=True, timeout=timeout)


def offline_args(temp_home):
    return ["--paseo", str(ROOT / "no-such-paseo"),
            "--cua-bin", str(ROOT / "no-such-cua"),
            "--target-home", str(temp_home)]


def iter_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from iter_strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from iter_strings(item)


class DoctorUnitTests(unittest.TestCase):
    """Cross-platform pure-function tests (run on Windows too)."""

    @classmethod
    def setUpClass(cls):
        cls.doctor = load_doctor_module()

    def test_extract_semver_is_bounded(self):
        self.assertEqual(self.doctor.extract_semver("cua-driver 0.28.2 (fake)"),
                         "0.28.2")
        self.assertEqual(self.doctor.extract_semver("paseo 0.9.0-beta.2"),
                         "0.9.0-beta.2")
        self.assertIsNone(self.doctor.extract_semver("no version here"))
        self.assertIsNone(self.doctor.extract_semver("secret /home/bob/.aws"))

    def test_manifest_must_be_trusted(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            (base / "paseobility.json").write_text(json.dumps(
                {"version": "2.8.1", "skills": ["paseo-cua"]}))
            self.assertIsNotNone(self.doctor.load_manifest(str(base)))
            (base / "paseobility.json").write_text(json.dumps(
                {"version": "2.8.1", "skills": ["not-a-skill"]}))
            self.assertIsNone(self.doctor.load_manifest(str(base)))
            (base / "paseobility.json").write_text(json.dumps(
                {"version": "latest", "skills": ["paseo-cua"]}))
            self.assertIsNone(self.doctor.load_manifest(str(base)))
            (base / "paseobility.json").write_text("{not json")
            self.assertIsNone(self.doctor.load_manifest(str(base)))

    def test_install_tree_diff_detects_missing_modified_extra(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "skills"
            target = base / "target"
            skill_src = source / "paseo-cua"
            skill_tgt = target / "paseo-cua"
            (skill_src / "references").mkdir(parents=True)
            (skill_tgt / "references").mkdir(parents=True)
            (skill_src / "SKILL.md").write_text("same")
            (skill_tgt / "SKILL.md").write_text("same")
            (skill_src / "references" / "a.md").write_text("a")
            (skill_tgt / "references" / "a.md").write_text("changed")
            (skill_tgt / "extra.txt").write_text("extra")
            # Generated cache artifacts are never shipped: they must not appear
            # as differences on either side of the comparison.
            (skill_tgt / "__pycache__").mkdir()
            (skill_tgt / "__pycache__" / "junk.pyc").write_text("cache")
            (skill_src / "generated.pyc").write_text("cache")
            (skill_tgt / ".DS_Store").write_text("junk")
            diff = self.doctor._tree_diff(str(skill_src), str(skill_tgt))
            self.assertEqual(diff["modified"], ["references/a.md"])
            self.assertEqual(diff["extra"], ["extra.txt"])
            self.assertEqual(diff["missing"], [])

    def test_check_skill_install_absent_and_partial(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "skills"
            (source / "paseo-cua").mkdir(parents=True)
            (source / "paseo-cua" / "SKILL.md").write_text("x")
            absent = self.doctor.check_skill_install(
                str(base / "missing"), str(source), False, "ok")
            self.assertEqual(absent["status"], "absent")
            self.assertEqual(absent["skills_present"], 0)

    def test_check_skill_install_gated_on_complete_source(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "skills"
            (source / "paseo-cua").mkdir(parents=True)
            (source / "paseo-cua" / "SKILL.md").write_text("x")
            target = base / "target"
            (target / "paseo-cua").mkdir(parents=True)
            (target / "paseo-cua" / "SKILL.md").write_text("x")
            # An empty/absent source pack must never yield a false "ok".
            empty = self.doctor.check_skill_install(
                str(target), str(source), False, "missing")
            self.assertEqual(empty["status"], "unknown")
            invalid = self.doctor.check_skill_install(
                str(target), str(source), False, "unknown")
            self.assertEqual(invalid["status"], "unknown")

    def test_tree_files_skips_generated_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            (base / "keep.md").write_text("keep")
            (base / "__pycache__").mkdir()
            (base / "__pycache__" / "x.pyc").write_text("cache")
            (base / "stale.pyc").write_text("cache")
            (base / ".DS_Store").write_text("junk")
            self.assertEqual(sorted(self.doctor._tree_files(str(base))),
                             ["keep.md"])


class DoctorJsonTests(unittest.TestCase):
    def test_json_report_shape(self):
        with tempfile.TemporaryDirectory() as temp:
            result = run_doctor("--source-root", str(ROOT), "--json",
                                *offline_args(temp))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["schema"], "paseobility-doctor/v1")
        for key in ("tool_version", "platform", "skill_source", "skill_install",
                    "paseo", "cua", "mcp", "manual_e2e"):
            self.assertIn(key, report)
        self.assertEqual(report["skill_source"]["status"], "ok")
        self.assertEqual(report["skill_source"]["skills"], 7)
        self.assertEqual(report["cua"]["status"], "absent")
        self.assertEqual(report["paseo"]["cli"], "absent")
        self.assertEqual(report["mcp"]["status"], "not_checked")
        self.assertFalse(report["manual_e2e"]["performed_by_doctor"])
        self.assertEqual(report["manual_e2e"]["status"], "not_run")

    def test_json_carries_no_paths_or_raw_output(self):
        with tempfile.TemporaryDirectory() as temp:
            result = run_doctor("--source-root", str(ROOT), "--json",
                                *offline_args(temp))
            report = json.loads(result.stdout)
            home = os.path.expanduser("~")
            username = os.environ.get("USER") or os.environ.get("USERNAME") or ""
            for text in iter_strings(report):
                self.assertNotIn(str(ROOT), text, "source path leaked")
                self.assertNotIn(str(temp), text, "target path leaked")
                self.assertNotIn(home, text, "home path leaked")
                if len(username) >= 3:
                    self.assertNotIn(username, text, "username leaked")

    def test_json_is_deterministic(self):
        with tempfile.TemporaryDirectory() as temp:
            first = run_doctor("--source-root", str(ROOT), "--json",
                               *offline_args(temp))
            second = run_doctor("--source-root", str(ROOT), "--json",
                                *offline_args(temp))
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)

    def test_missing_root_is_usage_error(self):
        with tempfile.TemporaryDirectory() as temp:
            result = run_doctor("--json", "--root", str(ROOT / "no-such-dir"),
                                *offline_args(temp))
        self.assertEqual(result.returncode, 2)
        self.assertIn("not a directory", result.stderr)

    def test_text_mode_runs_read_only(self):
        with tempfile.TemporaryDirectory() as temp:
            result = run_doctor("--source-root", str(ROOT), *offline_args(temp))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Paseobility doctor", result.stdout)
        self.assertIn("Skill source", result.stdout)


@unittest.skipIf(os.name == "nt", "executable fixtures require POSIX exec bits")
class DoctorCuaFixtureTests(unittest.TestCase):
    def _fixture(self, body):
        temp = tempfile.TemporaryDirectory(prefix="paseobility-doctor-")
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "fake-cua-driver"
        path.write_text(body.replace("__PY__", sys.executable))
        path.chmod(0o755)
        return path

    def _run(self, driver, *extra, timeout=10):
        temp = tempfile.TemporaryDirectory(prefix="paseobility-home-")
        self.addCleanup(temp.cleanup)
        return run_doctor("--source-root", str(ROOT), "--json",
                          "--paseo", str(ROOT / "no-such-paseo"),
                          "--target-home", temp.name,
                          "--cua-bin", str(driver),
                          "--timeout", str(timeout), *extra)

    def test_permissions_and_mcp_handshake(self):
        driver = self._fixture(FULL_FIXTURE)
        result = self._run(driver, "--check-mcp", timeout=5)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["cua"]["status"], "present")
        self.assertIn("0.28.2", report["cua"]["version"])
        if platform.system() == "Darwin":
            self.assertEqual(report["cua"]["permissions"]["status"], "granted")
        else:
            self.assertEqual(report["cua"]["permissions"]["status"],
                             "not_applicable")
        self.assertEqual(report["cua"]["daemon"]["status"], "running")
        self.assertEqual(report["mcp"]["status"], "ok")
        self.assertEqual(report["mcp"]["tool_count"], 2)
        self.assertEqual(report["mcp"]["scope"],
                         "protocol_and_tools_discovery_only")

    def test_mcp_requires_a_running_daemon(self):
        driver = self._fixture(STOPPED_FIXTURE)
        result = self._run(driver, "--check-mcp", timeout=5)
        report = json.loads(result.stdout)
        self.assertEqual(report["cua"]["daemon"]["status"], "stopped")
        self.assertEqual(report["mcp"]["status"], "not_checked")
        self.assertIsNone(report["mcp"]["tool_count"])

    def test_mcp_probe_is_bounded_and_reports_failure(self):
        driver = self._fixture(SILENT_FIXTURE)
        started = time.monotonic()
        result = self._run(driver, "--check-mcp", timeout=1)
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["cua"]["daemon"]["status"], "running")
        self.assertEqual(report["mcp"]["status"], "failed")
        self.assertIsNone(report["mcp"]["tool_count"])
        self.assertLess(elapsed, 30, "bounded timeout should return promptly")


@unittest.skipIf(os.name == "nt", "executable fixtures require POSIX exec bits")
class DoctorMcpProbeTests(unittest.TestCase):
    """Focused regressions for the MCP probe: framing, protocol validation, and
    pagination truncation. probe_mcp is called in-process so caps can be lowered
    without a new production flag."""

    @classmethod
    def setUpClass(cls):
        cls.doctor = load_doctor_module()

    def _fixture(self):
        temp = tempfile.TemporaryDirectory(prefix="paseobility-mcp-")
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "fake-cua-driver"
        path.write_text(SCENARIO_FIXTURE.replace("__PY__", sys.executable))
        path.chmod(0o755)
        return path

    def _patch(self, name, value):
        old = getattr(self.doctor, name)
        setattr(self.doctor, name, value)
        self.addCleanup(setattr, self.doctor, name, old)

    def _probe(self, scenario, timeout=10):
        driver = self._fixture()
        temp = tempfile.TemporaryDirectory(prefix="paseobility-mcp-scenario-")
        self.addCleanup(temp.cleanup)
        scenario_file = Path(temp.name) / "scenario.json"
        scenario_file.write_text(json.dumps(scenario))
        old = os.environ.get("FAKE_MCP_SCENARIO_FILE")
        os.environ["FAKE_MCP_SCENARIO_FILE"] = str(scenario_file)
        try:
            return self.doctor.probe_mcp(str(driver), timeout, "running")
        finally:
            if old is None:
                os.environ.pop("FAKE_MCP_SCENARIO_FILE", None)
            else:
                os.environ["FAKE_MCP_SCENARIO_FILE"] = old

    @staticmethod
    def _init(protocol="2024-11-05", **extra):
        scenario = {"init": {"protocolVersion": protocol, "capabilities": {}},
                    "pages": [{"tools": []}]}
        scenario.update(extra)
        return scenario

    def test_large_frame_over_64k_is_parsed(self):
        # A real tools/list frame exceeds 64 KiB; splitting it must not lose it.
        big = "x" * 100000
        scenario = self._init()
        scenario["pages"] = [{"tools": [{"name": "big-a"},
                                        {"name": "big-b", "description": big}]}]
        result = self._probe(scenario)
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["tool_count"], 2)
        self.assertEqual(result["pages"], 1)

    def test_oversize_frame_is_rejected_bounded(self):
        self._patch("MCP_MAX_FRAME_BYTES", 4096)
        self._patch("MCP_MAX_TOTAL_BYTES", 8192)
        scenario = self._init()
        scenario["pages"] = [{"tools": [{"name": "big", "description": "x" * 20000}]}]
        started = time.monotonic()
        result = self._probe(scenario, timeout=5)
        elapsed = time.monotonic() - started
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("cap", result["hint"])
        self.assertLess(elapsed, 30, "oversize cap must fail promptly")

    def test_pagination_truncation_reports_incomplete(self):
        self._patch("MCP_MAX_PAGES", 2)
        scenario = self._init()
        scenario["pages"] = [{"tools": [{"name": "a"}], "nextCursor": "next"}]
        result = self._probe(scenario)
        self.assertEqual(result["status"], "incomplete", result)
        self.assertEqual(result["tool_count"], 1)
        self.assertEqual(result["pages"], 2)

    def test_jsonrpc_error_is_rejected(self):
        scenario = self._init(init_error={"code": -32600, "message": "bad"})
        result = self._probe(scenario)
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("error", result["hint"])

    def test_missing_jsonrpc_is_rejected(self):
        result = self._probe(self._init(omit_jsonrpc=True))
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("JSON-RPC 2.0", result["hint"])

    def test_unsupported_protocol_is_rejected(self):
        result = self._probe(self._init(protocol="1999-01-01"))
        self.assertEqual(result["status"], "incompatible", result)

    def test_duplicate_and_malformed_tools_do_not_inflate(self):
        scenario = self._init()
        scenario["pages"] = [{"tools": [{"name": "a"}, {"name": "a"},
                                        {"noname": True}, "junk", {"name": ""}]}]
        result = self._probe(scenario)
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["tool_count"], 1)


if __name__ == "__main__":
    unittest.main()
