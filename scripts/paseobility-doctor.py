#!/usr/bin/env python3
"""Deterministic, read-only Paseobility/Paseo diagnostics (Python stdlib only).

Cross-platform: macOS, Linux, and Windows. The bash and PowerShell entry points
(scripts/paseobility-doctor.sh / .ps1) are thin wrappers over this script.

Design rules:
  * Read-only. Nothing is installed, started, stopped, or written. No GUI tool
    is ever invoked and no daemon is ever launched implicitly.
  * Bounded subprocess timeouts on every external command.
  * JSON mode emits only allow-listed, structured fields: statuses, counts,
    validated skill names, and sanitized semantic versions. It never emits
    absolute paths, raw command output, usernames, or arbitrary upstream text,
    so it does not rely on string replacement to hide secrets.
  * An absent / not-checked / unknown Cua state is never reported as success.
  * The MCP check runs only when --check-mcp is passed AND an existing Cua
    daemon is confirmed running via a read-only status probe. Only then does it
    open its own child `cua-driver mcp` connection and perform initialize ->
    notifications/initialized -> tools/list on that one stdio connection,
    reporting protocol/tools discovery only. It is explicitly NOT a GUI
    end-to-end test. The probe is not race-free by design: if the daemon stops
    between the status check and the child connection, the underlying server may
    still start, so the report never promises that no daemon was launched.

The skill source pack is anchored at the repository that contains this script
(script_dir/..); --root is the *project* under inspection and is independent of
it. --source-root overrides the pack location (used by isolated tests).

Exit code: 0 means "a report was generated", not "everything is ready".
"""

import argparse
import json
import os
import platform
import queue
import re
import shutil
import subprocess
import sys
import threading
import time

SCHEMA = "paseobility-doctor/v1"
MCP_SCOPE = "protocol_and_tools_discovery_only"
VERSION_FALLBACK = "dev"
VERSION_PATTERN = re.compile(
    r"(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:[-+][0-9A-Za-z.\-]{1,32})?")

# Fixed, allow-listed skill names. A manifest naming anything else is not
# trusted, so a compromised or edited manifest cannot smuggle new strings into
# the shareable report.
KNOWN_SKILLS = (
    "paseo-agent-cleanup",
    "paseo-browser",
    "paseo-cua",
    "paseo-orchestration",
    "paseo-project",
    "paseo-share",
    "paseo-spyware-check",
)

MCP_TIMEOUT_CAP = 30.0
MCP_MAX_FRAMES = 256
# A real tools/list response is a single JSON line that can exceed 64 KiB (the
# live 0.28.2 server's tools/list frame is well over that). A too-small readline
# cap silently splits one frame into unparseable chunks, so it is set to a
# bounded but realistic 2 MiB frame / 4 MiB total and oversize is rejected
# explicitly rather than misread.
MCP_MAX_FRAME_BYTES = 2 * 1024 * 1024
MCP_MAX_TOTAL_BYTES = 4 * 1024 * 1024
MCP_MAX_TOOLS = 4096
MCP_MAX_PAGES = 20
# Only a negotiated protocol version the client actually supports is accepted.
MCP_REQUEST_PROTOCOL = "2024-11-05"
MCP_SUPPORTED_PROTOCOLS = ("2024-11-05", "2025-03-26", "2025-06-18")

# Generated artifacts are never part of a shipped skill: they appear when the
# test suite imports/byte-compiles sources or when a macOS checkout is browsed.
# Excluding them keeps a whole-tree install comparison honest instead of
# reporting a false "modified".
TREE_SKIP_DIR_NAMES = frozenset({"__pycache__"})
TREE_SKIP_FILE_NAMES = frozenset({".DS_Store"})
TREE_SKIP_FILE_SUFFIXES = (".pyc",)

MANUAL_E2E_NOTE = (
    "Native and browser GUI end-to-end probes are manual and must be run from "
    "the e2e runbook. This doctor never performs GUI actions; a Cua "
    "verify_state of 'unknown' is not a pass."
)


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def extract_semver(text):
    """Return the first bounded semantic version in text, or None.

    Only the matched x.y.z token (plus an optional short pre-release/build
    suffix) is kept, so arbitrary command output can never reach the report."""
    if not isinstance(text, str):
        return None
    match = VERSION_PATTERN.search(text)
    return match.group(0) if match else None


def _read_tool_version(script_dir):
    version_file = os.path.join(os.path.dirname(script_dir), "VERSION")
    try:
        with open(version_file, "r", encoding="utf-8") as handle:
            value = handle.readline().strip()
    except OSError:
        return VERSION_FALLBACK
    return extract_semver(value) or VERSION_FALLBACK


def _os_token():
    system = platform.system().lower()
    if system == "darwin":
        return "macos"
    if system == "windows":
        return "windows"
    if system == "linux":
        return "linux"
    return system or "unknown"


def _arch_token():
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "arm64"
    if machine in ("x86_64", "amd64"):
        return "x86_64"
    if machine in ("i386", "i686", "x86"):
        return "x86"
    return machine or "unknown"


def run_command(argv, timeout):
    """Run argv with a bounded timeout. Returns (returncode|None, stdout)."""
    try:
        completed = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            timeout=max(0.1, timeout),
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None, ""
    output = completed.stdout.decode("utf-8", "replace")
    return completed.returncode, output


def first_line(text):
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------

def find_paseo_cli(override):
    if override:
        return override if os.path.exists(override) else None
    found = shutil.which("paseo")
    if found:
        return found
    candidates = ["/Applications/Paseo.app/Contents/Resources/bin/paseo"]
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        candidates.append(os.path.join(
            local_appdata, "Programs", "Paseo", "resources", "bin", "paseo.cmd"))
    for program_files in (os.environ.get("ProgramFiles"),
                          os.environ.get("ProgramFiles(x86)")):
        if program_files:
            candidates.append(os.path.join(
                program_files, "Paseo", "resources", "bin", "paseo.cmd"))
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None


def default_cua_bin_dirs():
    """Candidate binary directories, in search order.

    Windows installs publish to the per-user ``.local\\bin`` (the installer
    default) but some hosts also expose the driver under LOCALAPPDATA, so both
    are searched."""
    home = os.path.expanduser("~")
    dirs = [os.path.join(home, ".local", "bin")]
    if _os_token() == "windows":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            dirs.append(os.path.join(
                local_appdata, "Programs", "Cua", "cua-driver", "bin"))
    return dirs


def find_cua_driver(override, bin_dirs):
    if override:
        return override if os.path.exists(override) else None
    found = shutil.which("cua-driver")
    if found:
        return found
    for bin_dir in bin_dirs:
        for name in ("cua-driver.exe", "cua-driver"):
            candidate = os.path.join(bin_dir, name)
            if os.path.exists(candidate):
                return candidate
    return None


# --------------------------------------------------------------------------
# manifest + integrity
# --------------------------------------------------------------------------

def load_manifest(source_root):
    """Return a trusted, normalized manifest, or None.

    Trusted means: a JSON object with a bounded semantic version and a non-empty
    ``skills`` list drawn only from KNOWN_SKILLS."""
    manifest_path = os.path.join(source_root, "paseobility.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    version = extract_semver(data.get("version"))
    if not version:
        return None
    skills = data.get("skills")
    if not isinstance(skills, list) or not skills:
        return None
    if not all(isinstance(name, str) and name in KNOWN_SKILLS for name in skills):
        return None
    return {"version": version, "skills": list(dict.fromkeys(skills))}


def check_skill_source(source_root, manifest):
    skills_dir = os.path.join(source_root, "skills")
    if not os.path.isdir(skills_dir):
        return {
            "status": "missing",
            "manifest_version": manifest["version"] if manifest else None,
            "skills": 0,
            "missing_skills": list(KNOWN_SKILLS),
            "hint": "skill source directory is absent under the source pack",
        }
    present = sorted(
        entry for entry in os.listdir(skills_dir)
        if os.path.isfile(os.path.join(skills_dir, entry, "SKILL.md"))
    )
    missing = [name for name in KNOWN_SKILLS if name not in present]
    if manifest is None:
        status = "unknown"
        hint = "paseobility.json manifest missing or invalid; cannot verify the pack"
    elif missing:
        status = "incomplete"
        hint = "skill source is missing expected skills"
    else:
        status = "ok"
        hint = None
    return {
        "status": status,
        "manifest_version": manifest["version"] if manifest else None,
        "skills": len([name for name in present if name in KNOWN_SKILLS]),
        "missing_skills": missing,
        "hint": hint,
    }


def _tree_files(root):
    """Relative-path -> absolute-path map for a shipped tree.

    Generated artifacts (``__pycache__``, ``*.pyc``, ``.DS_Store``) are skipped
    because they are never shipped and would otherwise show up as spurious
    differences. Read errors are re-raised (``os.walk`` swallows them by
    default) so an unreadable tree is reported as unknown, not silently clean."""
    files = {}

    def _raise(error):
        raise error

    for dirpath, dirs, names in os.walk(root, onerror=_raise):
        dirs[:] = sorted(
            name for name in dirs if name not in TREE_SKIP_DIR_NAMES)
        for name in names:
            if name in TREE_SKIP_FILE_NAMES or name.endswith(TREE_SKIP_FILE_SUFFIXES):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            files[rel] = full
    return files


def _same_file(left, right):
    with open(left, "rb") as handle:
        left_bytes = handle.read()
    with open(right, "rb") as handle:
        right_bytes = handle.read()
    return left_bytes == right_bytes


def _tree_diff(source_dir, target_dir):
    source = _tree_files(source_dir)
    target = _tree_files(target_dir)
    missing = [rel for rel in source if rel not in target]
    modified = []
    for rel, path in source.items():
        if rel in target and not _same_file(path, target[rel]):
            modified.append(rel)
    extra = [rel for rel in target if rel not in source]
    return {"missing": missing, "modified": modified, "extra": extra}


def check_skill_install(target_dir, source_dir, optional, source_status):
    """Whole-tree comparison of an installed skill set against the source pack.

    Compares every shipped file (not just SKILL.md), so missing, modified, and
    extra files are all accounted for. The comparison is gated on a complete,
    trusted source pack: if the manifest is invalid or the source skills are
    missing, the installed tree cannot be judged, so the status is ``unknown``
    (never a false ``ok``). Unrelated extra skills in the target are ignored."""
    base = {
        "status": "unknown",
        "optional": optional,
        "skills_expected": len(KNOWN_SKILLS),
        "skills_present": 0,
        "missing_skills": [],
        "modified_skills": [],
        "extra_files": 0,
    }
    if source_status != "ok":
        base["hint"] = ("skill source is not a complete, trusted pack "
                        "(invalid/absent manifest or missing source skills); "
                        "install comparison skipped")
        return base
    if not os.path.isdir(target_dir):
        base["status"] = "absent"
        base["missing_skills"] = list(KNOWN_SKILLS)
        base["hint"] = ("optional install target is absent" if optional
                        else "install target directory is absent")
        return base
    missing = []
    modified = []
    extra = 0
    present = 0
    try:
        for name in KNOWN_SKILLS:
            src_skill = os.path.join(source_dir, name)
            if not os.path.isfile(os.path.join(src_skill, "SKILL.md")):
                continue
            tgt_skill = os.path.join(target_dir, name)
            if not os.path.isdir(tgt_skill):
                missing.append(name)
                continue
            present += 1
            diff = _tree_diff(src_skill, tgt_skill)
            extra += len(diff["extra"])
            if diff["missing"] or diff["modified"]:
                modified.append(name)
    except OSError:
        base["status"] = "unknown"
        base["hint"] = "one or more installed files could not be read"
        return base

    if missing and present == 0:
        status = "empty"
        hint = "no expected skills found in the install target"
    elif missing:
        status = "partial"
        hint = "some expected skills are not installed (selected install?)"
    elif modified or extra:
        status = "incomplete"
        hint = "installed tree differs from the source pack"
    else:
        status = "ok"
        hint = None
    return {
        "status": status,
        "optional": optional,
        "skills_expected": len(KNOWN_SKILLS),
        "skills_present": present,
        "missing_skills": missing,
        "modified_skills": modified,
        "extra_files": extra,
        "hint": hint,
    }


# --------------------------------------------------------------------------
# Paseo / Cua probes
# --------------------------------------------------------------------------

def check_paseo(cli, timeout):
    if not cli:
        return {
            "cli": "absent",
            "version": None,
            "reachability": "not_checked",
            "hint": "Paseo CLI not found; skills can still be installed without it",
        }
    code, output = run_command([cli, "--version"], timeout)
    version = extract_semver(output) if code == 0 else None
    daemon_code, _ = run_command([cli, "daemon", "status", "--json"], timeout)
    if daemon_code is None:
        reachability = "unknown"
        hint = "could not run `paseo daemon status --json`"
    elif daemon_code == 0:
        reachability = "reachable"
        hint = None
    else:
        reachability = "unreachable"
        hint = "Paseo daemon is not reachable; start Paseo if you need live tools"
    return {"cli": "present", "version": version,
            "reachability": reachability, "hint": hint}


def _load_json(text):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return None


def _grant_field(data, names):
    for name in names:
        value = data.get(name)
        if isinstance(value, bool):
            return value
        if isinstance(value, dict):
            for key in ("granted", "value", "ok", "authorized"):
                if isinstance(value.get(key), bool):
                    return value[key]
    return None


def check_cua_permissions(driver, timeout):
    if _os_token() != "macos":
        return {
            "status": "not_applicable",
            "hint": "Accessibility/Screen Recording grants apply to macOS only",
        }
    code, output = run_command(
        [driver, "permissions", "status", "--json"], timeout)
    if code != 0:
        return {
            "status": "not_checked",
            "hint": ("driver does not expose `permissions status --json`; "
                     "confirm grants manually"),
        }
    data = _load_json(output)
    if not isinstance(data, dict):
        return {
            "status": "not_checked",
            "hint": "permission status was not structured JSON",
        }
    nested = data.get("permissions")
    if isinstance(nested, dict):
        data = {**data, **nested}
    accessible = _grant_field(data, ("accessibility", "accessibility_granted"))
    recording = _grant_field(data, ("screen_recording", "screen_recording_granted"))
    if accessible is None or recording is None:
        return {
            "status": "unknown",
            "hint": ("driver did not report both Accessibility and "
                     "Screen Recording as booleans; 'unknown' is not 'denied'"),
        }
    if accessible and recording:
        return {"status": "granted", "hint": None}
    return {
        "status": "denied",
        "hint": "grant Accessibility and Screen Recording to the driver app",
    }


def _running_field(data):
    if isinstance(data.get("running"), bool):
        return data["running"]
    for key in ("daemon", "status"):
        value = data.get(key)
        if isinstance(value, dict) and isinstance(value.get("running"), bool):
            return value["running"]
        if key == "status" and isinstance(value, str):
            if value.lower() in ("running", "ready", "ok"):
                return True
            if value.lower() in ("stopped", "not_running", "inactive"):
                return False
    return None


def check_cua_daemon(driver, timeout):
    """Read-only daemon probe. Only a confirmed 'running' gates an MCP check.

    The MCP probe is not a race-free no-new-daemon guarantee: this status is
    sampled once, and if the daemon stops between here and the probe's own child
    connection the underlying MCP server may still start."""
    code, output = run_command([driver, "status", "--json"], timeout)
    if code != 0:
        return {
            "status": "not_checked",
            "hint": ("daemon status unavailable (unsupported driver subcommand?); "
                     "MCP left unchecked"),
        }
    data = _load_json(output)
    if isinstance(data, dict):
        running = _running_field(data)
    else:
        # 0.28.2 prints human text even with --json, e.g.
        # "Cua Driver daemon is running". Only the running/stopped fact is read.
        # The negative patterns are tested first so text that mentions both a
        # stopping and a running phrase can never be read as a positive.
        lowered = output.lower()
        if ("not running" in lowered or "daemon is stopped" in lowered
                or "no daemon" in lowered):
            running = False
        elif "daemon is running" in lowered or "daemon running" in lowered:
            running = True
        else:
            running = None
    if running is True:
        return {"status": "running", "hint": None}
    if running is False:
        return {"status": "stopped",
                "hint": "Cua daemon is not running; start it before an MCP check"}
    return {
        "status": "not_checked",
        "hint": "daemon status schema not recognized; MCP left unchecked",
    }


def check_cua(driver, timeout):
    if not driver:
        return {
            "status": "absent",
            "version": None,
            "permissions": {"status": "not_checked",
                            "hint": "no cua-driver candidate found"},
            "daemon": {"status": "not_checked",
                       "hint": "no cua-driver candidate found"},
            "hint": "cua-driver not found; install it for the paseo-cua skill",
        }
    version_code, version_output = run_command([driver, "--version"], timeout)
    version = extract_semver(version_output) if version_code == 0 else None
    if not version:
        return {
            "status": "unknown",
            "version": None,
            "permissions": {"status": "not_checked",
                            "hint": "cannot probe a driver that failed --version"},
            "daemon": {"status": "not_checked",
                       "hint": "cannot probe a driver that failed --version"},
            "hint": ("cua-driver exists but `--version` did not confirm it; "
                     "treat as broken, not ready"),
        }
    return {
        "status": "present",
        "version": version,
        "permissions": check_cua_permissions(driver, timeout),
        "daemon": check_cua_daemon(driver, timeout),
        "hint": None,
    }


# --------------------------------------------------------------------------
# MCP probe (explicit-only, bounded, own-child cleanup)
# --------------------------------------------------------------------------

def _mcp_child(driver):
    return subprocess.Popen(
        [driver, "mcp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )


class _McpReader:
    """Bounded stdout reader: caps frame count, frame size, and total bytes.

    ``error`` records the first cap that was hit (or None). A frame larger than
    the cap is rejected explicitly instead of being split into unparseable
    partial lines that would silently drop a valid response."""

    def __init__(self, stream):
        self._queue = queue.Queue(maxsize=MCP_MAX_FRAMES)
        self._stream = stream
        self.error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        total = 0
        try:
            while True:
                line = self._stream.readline(MCP_MAX_FRAME_BYTES)
                if not line:
                    break
                total += len(line)
                if total > MCP_MAX_TOTAL_BYTES:
                    self.error = "total_bytes_cap"
                    break
                if len(line) >= MCP_MAX_FRAME_BYTES and not line.endswith("\n"):
                    self.error = "frame_bytes_cap"
                    break
                try:
                    self._queue.put_nowait(line)
                except queue.Full:
                    self.error = "frame_count_cap"
                    break
        except Exception:  # pragma: no cover - defensive
            pass
        finally:
            try:
                self._queue.put_nowait(None)
            except queue.Full:
                pass

    def next_payload(self, deadline):
        """Return a decoded payload, "EOF", or None on deadline."""
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            try:
                line = self._queue.get(timeout=remaining)
            except queue.Empty:
                return None
            if line is None:
                return "EOF"
            stripped = line.strip()
            if not stripped:
                continue
            payload = _load_json(stripped)
            if payload is None:
                continue
            return payload

    def join(self, timeout):
        self._thread.join(timeout=timeout)


def _rpc_call(child, reader, deadline, request):
    try:
        child.stdin.write(json.dumps(request) + "\n")
        child.stdin.flush()
    except (OSError, ValueError):
        return None
    request_id = request.get("id")
    while True:
        payload = reader.next_payload(deadline)
        if payload is None or payload == "EOF":
            return None
        if isinstance(payload, dict) and payload.get("id") == request_id:
            return payload


def _notify(child, reader, method):
    del reader
    try:
        child.stdin.write(json.dumps(
            {"jsonrpc": "2.0", "method": method}) + "\n")
        child.stdin.flush()
    except (OSError, ValueError):
        pass


def _rpc_error(response, label):
    """Return a failure hint if response is not a clean JSON-RPC 2.0 result."""
    if not isinstance(response, dict):
        return "%s did not return a JSON-RPC response" % label
    if response.get("jsonrpc") != "2.0":
        return "%s response was not JSON-RPC 2.0" % label
    if "error" in response:
        return "%s returned a JSON-RPC error" % label
    if "result" not in response:
        return "%s did not return a JSON-RPC result" % label
    return None


def _cap_hint(code):
    if code == "frame_bytes_cap":
        return ("an MCP frame exceeded the %d-byte cap; probe aborted"
                % MCP_MAX_FRAME_BYTES)
    if code == "total_bytes_cap":
        return ("MCP output exceeded the %d-byte total cap; probe aborted"
                % MCP_MAX_TOTAL_BYTES)
    if code == "frame_count_cap":
        return "too many MCP frames; probe aborted"
    return None


def probe_mcp(driver, timeout, daemon_status):
    """initialize -> notifications/initialized -> tools/list on one stdio
    connection. Returns a status dict; never a GUI claim."""
    result = {"status": "not_checked", "tool_count": None, "pages": 0,
              "scope": MCP_SCOPE, "hint": None}
    if not driver:
        result["status"] = "unavailable"
        result["hint"] = "no cua-driver candidate to run `mcp`"
        return result
    if daemon_status != "running":
        result["hint"] = ("MCP probe skipped: an existing Cua daemon was not "
                          "confirmed running via the read-only status probe")
        return result

    timeout = min(float(timeout), MCP_TIMEOUT_CAP)
    try:
        child = _mcp_child(driver)
    except OSError:
        result["status"] = "failed"
        result["hint"] = "could not start `cua-driver mcp`"
        return result

    reader = _McpReader(child.stdout)
    deadline = time.monotonic() + timeout
    try:
        init = _rpc_call(child, reader, deadline, {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": MCP_REQUEST_PROTOCOL,
                       "capabilities": {},
                       "clientInfo": {"name": "paseobility-doctor",
                                      "version": VERSION_FALLBACK}}})
        error = _rpc_error(init, "initialize")
        if error:
            result["status"] = "failed"
            result["hint"] = error
            return result
        init_result = init["result"]
        if not isinstance(init_result, dict):
            result["status"] = "failed"
            result["hint"] = "initialize result was malformed"
            return result
        protocol = init_result.get("protocolVersion")
        capabilities = init_result.get("capabilities")
        if not isinstance(protocol, str) or not isinstance(capabilities, dict):
            result["status"] = "failed"
            result["hint"] = "initialize result was malformed"
            return result
        if protocol not in MCP_SUPPORTED_PROTOCOLS:
            result["status"] = "incompatible"
            result["hint"] = ("server negotiated an unsupported protocol "
                              "version; no supported version was agreed")
            return result

        _notify(child, reader, "notifications/initialized")

        tools = []
        seen = set()
        cursor = None
        pages = 0
        truncated = False
        while True:
            if pages >= MCP_MAX_PAGES or time.monotonic() >= deadline:
                truncated = cursor is not None
                break
            params = {"cursor": cursor} if cursor else {}
            response = _rpc_call(child, reader, deadline, {
                "jsonrpc": "2.0", "id": 2 + pages, "method": "tools/list",
                "params": params})
            error = _rpc_error(response, "tools/list")
            if error:
                result["status"] = "failed"
                result["hint"] = error
                return result
            page = response["result"]
            if not isinstance(page, dict) or not isinstance(page.get("tools"), list):
                result["status"] = "failed"
                result["hint"] = "tools/list result was malformed"
                return result
            for tool in page["tools"]:
                if (isinstance(tool, dict)
                        and isinstance(tool.get("name"), str) and tool["name"]
                        and tool["name"] not in seen):
                    seen.add(tool["name"])
                    tools.append(tool["name"])
            pages += 1
            if len(tools) >= MCP_MAX_TOOLS:
                truncated = True
                break
            cursor = page.get("nextCursor")
            if not isinstance(cursor, str) or not cursor:
                cursor = None
                break
        result["pages"] = pages
        if not tools:
            result["status"] = "empty"
            result["tool_count"] = 0
            result["hint"] = "tools/list returned no named tools"
        elif truncated:
            result["status"] = "incomplete"
            result["tool_count"] = len(tools)
            result["hint"] = ("tools/list pagination stopped at a page/tool cap "
                              "or deadline with a cursor still pending; the tool "
                              "count is partial")
        else:
            result["status"] = "ok"
            result["tool_count"] = len(tools)
    except (OSError, ValueError):
        result["status"] = "failed"
        result["hint"] = "MCP stdio connection error"
    finally:
        try:
            child.stdin.close()
        except Exception:  # pragma: no cover - defensive
            pass
        _terminate(child)
        reader.join(timeout=1)
        try:
            child.stdout.close()
        except Exception:  # pragma: no cover - defensive
            pass
        if result["status"] == "failed":
            hint = _cap_hint(reader.error)
            if hint:
                result["hint"] = hint
    return result


def _terminate(child):
    try:
        child.terminate()
    except Exception:  # pragma: no cover - defensive
        pass
    try:
        child.wait(timeout=2)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        child.kill()
    except Exception:  # pragma: no cover - defensive
        pass
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:  # pragma: no cover - defensive
        pass


# --------------------------------------------------------------------------
# report assembly
# --------------------------------------------------------------------------

def resolve_project_root(root_arg):
    if root_arg:
        candidate = os.path.abspath(os.path.expanduser(root_arg))
        if not os.path.isdir(candidate):
            raise ValueError("root path is not a directory")
        return candidate
    code, output = run_command(["git", "rev-parse", "--show-toplevel"], 5)
    if code == 0:
        toplevel = first_line(output)
        if toplevel and os.path.isdir(toplevel):
            return os.path.abspath(toplevel)
    return os.getcwd()


def build_report(args):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_root = os.path.abspath(os.path.expanduser(
        args.source_root)) if args.source_root else os.path.dirname(script_dir)
    project_root = resolve_project_root(args.root)
    target_home = os.path.abspath(os.path.expanduser(
        args.target_home)) if args.target_home else os.path.expanduser("~")

    manifest = load_manifest(source_root)
    source_dir = os.path.join(source_root, "skills")
    source_info = check_skill_source(source_root, manifest)
    install_targets = {
        "agents": (os.path.join(target_home, ".agents", "skills"), False),
        "claude": (os.path.join(target_home, ".claude", "skills"), True),
    }

    paseo_cli = find_paseo_cli(args.paseo)
    cua_bin_dirs = [args.cua_bin_dir] if args.cua_bin_dir else default_cua_bin_dirs()
    cua_driver = find_cua_driver(args.cua_bin, cua_bin_dirs)
    cua = check_cua(cua_driver, args.timeout)

    if args.check_mcp:
        mcp = probe_mcp(cua_driver, args.timeout, cua["daemon"]["status"])
    else:
        mcp = {"status": "not_checked", "tool_count": None, "pages": 0,
               "scope": MCP_SCOPE,
               "hint": "pass --check-mcp to probe protocol/tools discovery"}

    report = {
        "schema": SCHEMA,
        "tool_version": _read_tool_version(script_dir),
        "platform": {"os": _os_token(), "arch": _arch_token()},
        "skill_source": source_info,
        "skill_install": {
            name: check_skill_install(target, source_dir, optional,
                                      source_info["status"])
            for name, (target, optional) in install_targets.items()
        },
        "paseo": check_paseo(paseo_cli, args.timeout),
        "cua": cua,
        "mcp": mcp,
        "manual_e2e": {
            "status": "not_run",
            "performed_by_doctor": False,
            "note": MANUAL_E2E_NOTE,
        },
    }
    return report, project_root, source_root, target_home


def render_text(report, project_root, source_root, target_home):
    lines = []
    add = lines.append
    add("Paseobility doctor")
    add("project root: %s" % project_root)
    add("source pack:  %s" % source_root)
    add("target home:  %s" % target_home)

    source = report["skill_source"]
    add("")
    add("== Skill source ==")
    add("manifest_version: %s" % source["manifest_version"])
    add("skills: %s" % source["skills"])
    add("status: %s" % source["status"])
    if source["missing_skills"]:
        add("missing: %s" % ", ".join(source["missing_skills"]))
    if source.get("hint"):
        add("hint: %s" % source["hint"])

    add("")
    add("== Skill install ==")
    for name, info in sorted(report["skill_install"].items()):
        detail = "status=%s skills=%s/%s" % (
            info["status"], info["skills_present"], info["skills_expected"])
        if info["missing_skills"]:
            detail += " missing=%s" % ",".join(info["missing_skills"])
        if info["modified_skills"]:
            detail += " modified=%s" % ",".join(info["modified_skills"])
        if info["extra_files"]:
            detail += " extra_files=%s" % info["extra_files"]
        add("%s: %s" % (name, detail))
        if info.get("hint"):
            add("    hint: %s" % info["hint"])

    add("")
    add("== Paseo ==")
    paseo = report["paseo"]
    add("cli: %s" % paseo["cli"])
    add("version: %s" % (paseo["version"] or "unknown"))
    add("daemon: %s" % paseo["reachability"])
    if paseo.get("hint"):
        add("hint: %s" % paseo["hint"])

    add("")
    add("== Cua Driver ==")
    cua = report["cua"]
    add("status: %s" % cua["status"])
    add("version: %s" % (cua["version"] or "unknown"))
    add("permissions: %s" % cua["permissions"]["status"])
    add("daemon: %s" % cua["daemon"]["status"])
    for key in ("hint",):
        if cua.get(key):
            add("%s: %s" % (key, cua[key]))
    for section in ("permissions", "daemon"):
        if cua[section].get("hint"):
            add("%s hint: %s" % (section, cua[section]["hint"]))

    add("")
    add("== MCP ==")
    add("status: %s" % report["mcp"]["status"])
    add("tools: %s" % (report["mcp"]["tool_count"]
                       if report["mcp"]["tool_count"] is not None else "n/a"))
    add("pages: %s" % report["mcp"]["pages"])
    add("scope: %s" % report["mcp"]["scope"])
    if report["mcp"].get("hint"):
        add("hint: %s" % report["mcp"]["hint"])

    add("")
    add("Note: exit 0 means a report was generated, not that everything is ready.")
    add("GUI end-to-end is manual and is not performed by this doctor.")
    return "\n".join(lines)


def build_parser():
    parser = argparse.ArgumentParser(
        description="Read-only Paseobility/Paseo diagnostics (JSON or text).")
    parser.add_argument("--root", default=None,
                        help="project root under inspection (default: git "
                             "toplevel or cwd); independent of the pack")
    parser.add_argument("--source-root", default=None,
                        help="override the skill pack root (default: the repo "
                             "containing this script)")
    parser.add_argument("--target-home", default=None,
                        help="home containing installed skills (default: ~)")
    parser.add_argument("--json", action="store_true",
                        help="emit deterministic shareable JSON (allow-listed)")
    parser.add_argument("--check-mcp", action="store_true",
                        help="probe the Cua MCP server (needs a running daemon)")
    parser.add_argument("--paseo", default=None, help="explicit paseo CLI path")
    parser.add_argument("--cua-bin", default=None,
                        help="explicit cua-driver path")
    parser.add_argument("--cua-bin-dir", default=None,
                        help="directory searched for a cua-driver binary")
    parser.add_argument("--timeout", type=float, default=5.0,
                        help="per-command timeout in seconds (default: 5)")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    try:
        report, project_root, source_root, target_home = build_report(args)
    except ValueError as error:
        print("[doctor] %s" % error, file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render_text(report, project_root, source_root, target_home))
    return 0


if __name__ == "__main__":
    sys.exit(main())
