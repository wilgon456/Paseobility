"""Canonical dependency-free static receipt gate for skill registration.

This module treats every target as untrusted data.  It may clone or snapshot a
source and read text files, but it never imports, builds, installs, or executes
the target payload.  Paseobility bundles a byte-for-byte compatible copy of
this implementation because it must scan before the manager is bootstrapped.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
from typing import Any, Iterable
from urllib.parse import urlparse

import importlib.util

_POLICY_SPEC = importlib.util.spec_from_file_location(
    "paseo_scanner_policy", Path(__file__).with_name("security_policy.py")
)
if _POLICY_SPEC is None or _POLICY_SPEC.loader is None:
    raise ImportError("bundled security policy contract is unavailable")
policy = importlib.util.module_from_spec(_POLICY_SPEC)
_POLICY_SPEC.loader.exec_module(policy)


TEXT_SUFFIXES = {
    ".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini",
    ".py", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".sh", ".bash", ".zsh",
    ".bat", ".cmd", ".ps1", ".xml", ".html", ".css", ".csv", ".sql",
    ".graphql", ".env",
}
HIGH_SIGNAL_NAMES = {
    "dockerfile", "makefile", "justfile", "package.json", "package-lock.json",
    "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "cargo.toml", "cargo.lock",
    "go.mod", "go.sum", "pyproject.toml", "pipfile", "poetry.lock",
}
SKIP_PARTS = {
    ".git", "__pycache__", ".pytest_cache", ".mypy_cache", "node_modules",
    "build", "dist", "vendor", "ai_skill_library.egg-info",
}
MAX_SCAN_BYTES = 2 * 1024 * 1024
MAX_FINDINGS = 500
SCANNER_NAME = "paseo-spyware-check"
SCANNER_SCHEMA_VERSION = 2

LIFECYCLE_FIELDS = frozenset({"preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"})
DOCUMENTATION_NAMES = frozenset({"skill.md", "readme", "readme.md", "readme.txt", "changelog.md", "license", "license.md"})
CONFIGURATION_NAMES = frozenset({
    "package.json", "pyproject.toml", "setup.py", "setup.cfg", "cargo.toml", "go.mod",
    "dockerfile", "makefile", "justfile", "taskfile.yml", "taskfile.yaml",
})
EXECUTABLE_SUFFIXES = frozenset({
    ".py", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".sh", ".bash", ".zsh",
    ".bat", ".cmd", ".ps1", ".rb", ".pl", ".php", ".rs", ".go",
})

SECRET_TOKEN_PATTERN = re.compile(
    r"gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,}",
    re.IGNORECASE,
)
ASSIGNED_SECRET_PATTERN = re.compile(
    r"(?i)((?:api[_-]?key|token|password|secret)\s*[:=]\s*)"
    r"(?:['\"])?[^\s,'\";]+(?:['\"])?"
)
HIGH_PATTERNS = (
    (
        "remote execution, hidden execution, or persistence indicator",
        re.compile(
            r"curl\s+.*\|\s*(?:sh|bash|zsh)|wget\s+.*\|\s*(?:sh|bash|zsh)|"
            r"EncodedCommand|DownloadString|Invoke-Expression|Start-Process.*Hidden|"
            r"New-ScheduledTask|CurrentVersion\\Run|launchctl|LaunchAgents|crontab|systemctl",
            re.IGNORECASE,
        ),
    ),
    (
        "credential or exfiltration indicator",
        re.compile(
            r"\.ssh|\.aws|\.npmrc|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|"
            r"ANTHROPIC_API_KEY|api[_-]?key|webhook|pastebin|discord(?:app)?\.com/api/webhooks",
            re.IGNORECASE,
        ),
    ),
    (
        "embedded secret or private key",
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|"
            r"gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,}"
        ),
    ),
)
REMOTE_PIPE_PATTERN = re.compile(r"\b(?:curl|wget)\b[^\n]{0,240}\|\s*(?:ba|z|da|k)?sh\b", re.IGNORECASE)
PERSISTENCE_PATTERN = re.compile(
    r"(?:launchctl|LaunchAgents|crontab|systemctl\s+(?:enable|start)|"
    r"schtasks\s+/create|New-ScheduledTask|CurrentVersion\\Run|startup\s+folder)",
    re.IGNORECASE,
)
PRIVATE_KEY_PATTERN = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")
DYNAMIC_EXECUTION_PATTERN = re.compile(
    r"child_process|\beval\s*\(|\bFunction\s*\(|base64|atob|Buffer\.from|"
    r"subprocess\.(?:run|Popen|call)|os\.system|shell\s*=\s*True",
    re.IGNORECASE,
)
API_KEY_NAME_PATTERN = re.compile(
    r"\b(?:[A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)|API[_-]?KEY)\b"
)
NETWORK_PATTERN = re.compile(
    r"(?:https?://|\b(?:fetch|axios|requests?\.(?:get|post|put|delete)|urllib|httpx)\s*\(|"
    r"\b(?:openai|anthropic|google\.generativeai|slack_sdk)\b)",
    re.IGNORECASE,
)
SUBPROCESS_PATTERN = re.compile(r"(?:child_process|subprocess\.|os\.system|shell\s*=\s*True)", re.IGNORECASE)
FILESYSTEM_PATTERN = re.compile(r"(?:\bopen\s*\(|fs\.(?:read|write|append)|pathlib\.|readFile|writeFile)", re.IGNORECASE)
EXTERNAL_WRITE_PATTERN = re.compile(
    r"(?:requests?\.(?:post|put|delete)|fetch\s*\([^\n]{0,160}\b(?:POST|PUT|DELETE)\b|"
    r"github\.com/[^\n]{0,100}/(?:issues|pulls|contents)|webhook)",
    re.IGNORECASE,
)


class ScanError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.detail = detail


def _is_link_or_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    if os.name != "nt":
        return False
    try:
        return bool(path.stat(follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (AttributeError, OSError):
        return True


def _path_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def _assert_link_free(root: Path) -> None:
    if not root.is_dir() or _is_link_or_reparse(root):
        raise ScanError("unsafe-source", "scan source is not a safe directory")
    for candidate in root.rglob("*"):
        if _is_link_or_reparse(candidate):
            raise ScanError("unsafe-link", "scan source contains a link or reparse point", candidate.relative_to(root).as_posix())


def _git_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update({"GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull})
    return environment


def _run_git(arguments: list[str], timeout: int, cwd: Path | None = None) -> str:
    try:
        completed = subprocess.run(
            ["git", *arguments], cwd=cwd, env=_git_environment(), text=True,
            encoding="utf-8", errors="replace", capture_output=True, timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise ScanError("git-missing", "Git is required to inspect GitHub sources") from exc
    except subprocess.TimeoutExpired as exc:
        raise ScanError("git-timeout", "Git operation timed out") from exc
    if completed.returncode:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise ScanError("git-failed", "Could not acquire the source for static inspection", detail[-500:])
    return completed.stdout.strip()


def _parse_github_source(value: str) -> dict[str, str] | None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"github.com", "www.github.com"}:
        return None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ScanError("invalid-github-url", "GitHub source must not contain credentials, a query, or a fragment")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise ScanError("invalid-github-url", "GitHub source must identify a repository")
    owner, repository = parts[0], parts[1].removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repository):
        raise ScanError("invalid-github-url", "GitHub owner or repository name is invalid")
    revision = ""
    subdirectory = ""
    if len(parts) > 2:
        if len(parts) < 4 or parts[2] != "tree":
            raise ScanError("invalid-github-url", "GitHub source must be a repository root or /tree/<revision>/<skill-path>")
        revision = parts[3]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", revision) or revision.startswith("-") or ".." in revision:
            raise ScanError("invalid-github-url", "GitHub revision must be a safe non-option-like branch, tag, or commit")
        subdirectory = "/".join(parts[4:])
        if subdirectory in {"", "."}:
            subdirectory = ""
        elif not re.fullmatch(r"[A-Za-z0-9._/-]+", subdirectory) or any(part in {"", ".", ".."} for part in subdirectory.split("/")):
            raise ScanError("invalid-github-url", "GitHub skill path has unsupported characters")
    return {
        "owner": owner,
        "repository_name": repository,
        "repository": f"https://github.com/{owner}/{repository}",
        "revision": revision,
        "path": subdirectory,
    }


def _acquire_source(target: str, workspace: Path, timeout: int) -> tuple[Path, dict[str, Any], str]:
    github = _parse_github_source(target)
    if github is not None:
        checkout = workspace / "repository"
        repository_git = github["repository"] + ".git"
        if github["revision"]:
            _run_git(["init", str(checkout)], timeout)
            _run_git(["-C", str(checkout), "remote", "add", "origin", repository_git], timeout)
            _run_git(["-C", str(checkout), "fetch", "--depth", "1", "origin", github["revision"]], timeout)
            _run_git(["-C", str(checkout), "checkout", "--detach", "FETCH_HEAD"], timeout)
        else:
            _run_git(["clone", "--filter=blob:none", "--depth", "1", "--no-tags", repository_git, str(checkout)], timeout)
        commit = _run_git(["-C", str(checkout), "rev-parse", "HEAD"], timeout)
        tree = _run_git(["-C", str(checkout), "rev-parse", "HEAD^{tree}"], timeout)
        selected = (checkout / github["path"]).resolve() if github["path"] else checkout.resolve()
        if not _path_within(selected, checkout) or not selected.is_dir():
            raise ScanError("missing-skill-path", "GitHub skill path is missing or unsafe")
        pinned_path = github["path"] or "."
        pinned_source = f"{github['repository']}/tree/{commit}/{pinned_path}"
        return selected, {"kind": "github", "repository": github["repository"], "commit": commit, "tree": tree, "path": github["path"], "skill_manifest": (selected / "SKILL.md").is_file()}, pinned_source
    source = Path(target).expanduser().resolve()
    _assert_link_free(source)
    snapshot = workspace / "local-source"
    shutil.copytree(source, snapshot, symlinks=True)
    _assert_link_free(snapshot)
    return snapshot, {"kind": "local", "path": str(source), "skill_manifest": (snapshot / "SKILL.md").is_file()}, str(snapshot)


def _iter_payload_files(root: Path) -> Iterable[Path]:
    for candidate in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        relative = candidate.relative_to(root)
        if any(part in SKIP_PARTS for part in relative.parts):
            continue
        if candidate.is_file():
            yield candidate


def _normalized_bytes(payload: bytes, suffix: str) -> bytes:
    if suffix.casefold() in TEXT_SUFFIXES or b"\x00" not in payload:
        return payload.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return payload


def directory_checksum(root: Path) -> str:
    digest = hashlib.sha256()
    for candidate in _iter_payload_files(root):
        relative = candidate.relative_to(root).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0file\0")
        digest.update(_normalized_bytes(candidate.read_bytes(), candidate.suffix))
        digest.update(b"\0")
    return digest.hexdigest()


def _is_high_signal(path: Path) -> bool:
    return path.name.casefold() in HIGH_SIGNAL_NAMES or path.suffix.casefold() in TEXT_SUFFIXES


def _redact_evidence(line: str) -> str:
    redacted = SECRET_TOKEN_PATTERN.sub("<redacted-token>", line)
    redacted = ASSIGNED_SECRET_PATTERN.sub(r"\1<redacted>", redacted)
    return redacted.strip()[:300]


def _source_role(path: Path) -> str:
    name = path.name.casefold()
    parts = {part.casefold() for part in path.parts}
    if name in DOCUMENTATION_NAMES or path.suffix.casefold() in {".md", ".markdown", ".txt"} or parts & {"docs", "documentation", "examples", "references"}:
        return "documentation"
    if name in CONFIGURATION_NAMES or name in HIGH_SIGNAL_NAMES:
        return "configuration"
    if path.suffix.casefold() in EXECUTABLE_SUFFIXES:
        return "executable"
    return "data"


def _finding(
    *, severity: str, rule_id: str, relative: str, line: int, reason: str,
    evidence: str, role: str, confidence: str, mitigation: str,
    capabilities: Iterable[str] = (), blocks: bool = False, review: bool = False,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "severity": severity,
        "rule_id": rule_id,
        "path": relative,
        "line": line,
        "source_role": role,
        "reason": reason,
        "evidence": _redact_evidence(evidence),
        "confidence": confidence,
        "mitigation": mitigation,
        "capabilities": sorted(set(capabilities)),
        "blocks": bool(blocks),
        "review": bool(review),
    }
    row["finding_id"] = policy.finding_id(row)
    return row


def _package_json_findings(relative: str, text: str, role: str) -> list[dict[str, Any]]:
    if Path(relative).name.casefold() != "package.json":
        return []
    try:
        value = json.loads(text)
    except (TypeError, ValueError):
        return []
    scripts = value.get("scripts") if isinstance(value, dict) else None
    if not isinstance(scripts, dict):
        return []
    rows: list[dict[str, Any]] = []
    for field in sorted(set(str(key) for key in scripts) & LIFECYCLE_FIELDS):
        rows.append(_finding(
            severity="Medium", rule_id=f"package.lifecycle.{field}", relative=relative, line=0,
            reason=f"package.json defines the {field} lifecycle field",
            evidence=f"scripts.{field} = {scripts.get(field)!r}", role=role,
            confidence="high", mitigation="Review the lifecycle command and register only after explicit local approval.",
            capabilities=("subprocess",), review=True,
        ))
    return rows


def _line_findings(relative: str, line: str, number: int, role: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    redacted = _redact_evidence(line)
    if SECRET_TOKEN_PATTERN.search(line):
        rows.append(_finding(
            severity="High", rule_id="secret.actual-token", relative=relative, line=number,
            reason="credential token material was found", evidence=redacted, role=role,
            confidence="high", mitigation="Remove the token and rotate it before registration.",
            capabilities=("credentials",), blocks=True,
        ))
    if PRIVATE_KEY_PATTERN.search(line):
        rows.append(_finding(
            severity="High", rule_id="secret.private-key", relative=relative, line=number,
            reason="private-key material was found", evidence=redacted, role=role,
            confidence="high", mitigation="Remove and rotate the private key before registration.",
            capabilities=("credentials",), blocks=True,
        ))
    if role != "documentation" and REMOTE_PIPE_PATTERN.search(line):
        rows.append(_finding(
            severity="High", rule_id="execution.remote-pipe", relative=relative, line=number,
            reason="remote content is piped directly into a shell", evidence=redacted, role=role,
            confidence="high", mitigation="Remove remote shell piping and use a reviewed, pinned artifact.",
            capabilities=("network", "subprocess"), blocks=True,
        ))
    elif role == "documentation" and REMOTE_PIPE_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="documentation.remote-pipe-example", relative=relative, line=number,
            reason="documentation mentions a remote shell-pipe example", evidence=redacted, role=role,
            confidence="medium", mitigation="Treat the example as untrusted text; do not execute it.",
        ))
    if role != "documentation" and PERSISTENCE_PATTERN.search(line):
        rows.append(_finding(
            severity="High", rule_id="persistence.autostart", relative=relative, line=number,
            reason="an operating-system persistence mechanism was found", evidence=redacted, role=role,
            confidence="high", mitigation="Remove autostart/persistence behavior before registration.",
            capabilities=("filesystem", "subprocess"), blocks=True,
        ))
    elif role == "documentation" and PERSISTENCE_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="documentation.persistence-example", relative=relative, line=number,
            reason="documentation mentions a persistence mechanism", evidence=redacted, role=role,
            confidence="medium", mitigation="Treat the mention as untrusted text; do not apply it automatically.",
        ))
    if role != "documentation" and DYNAMIC_EXECUTION_PATTERN.search(line):
        rows.append(_finding(
            severity="Medium", rule_id="execution.dynamic-code", relative=relative, line=number,
            reason="dynamic execution or shell invocation was found in executable/configuration content", evidence=redacted, role=role,
            confidence="medium", mitigation="Review the exact call and keep execution behind an explicit local confirmation gate.",
            capabilities=("subprocess",), review=True,
        ))
    if API_KEY_NAME_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="capability.credentials.api-key-name", relative=relative, line=number,
            reason="an API-key or credential variable name indicates credential capability", evidence=redacted, role=role,
            confidence="high", mitigation="Provide credentials only through the host's approved secret flow; never embed them in the skill.",
            capabilities=("credentials",),
        ))
    if NETWORK_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="capability.network.external-api", relative=relative, line=number,
            reason="an external API or network operation indicates network capability", evidence=redacted, role=role,
            confidence="medium", mitigation="Review the destination, data flow, and host confirmation before network use.",
            capabilities=("network",),
        ))
    if role != "documentation" and SUBPROCESS_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="capability.subprocess", relative=relative, line=number,
            reason="executable content can invoke a subprocess", evidence=redacted, role=role,
            confidence="high", mitigation="Keep subprocess execution behind explicit local confirmation.",
            capabilities=("subprocess",),
        ))
    if role != "documentation" and FILESYSTEM_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="capability.filesystem", relative=relative, line=number,
            reason="executable content accesses the filesystem", evidence=redacted, role=role,
            confidence="medium", mitigation="Review paths and limit filesystem access to the intended scope.",
            capabilities=("filesystem",),
        ))
    if EXTERNAL_WRITE_PATTERN.search(line):
        rows.append(_finding(
            severity="Info", rule_id="capability.external-write", relative=relative, line=number,
            reason="an API write or webhook operation indicates external-write capability", evidence=redacted, role=role,
            confidence="medium", mitigation="Require a separate confirmation immediately before the external write.",
            capabilities=("external-write", "network"),
        ))
    return rows


def _scan_files_with_metadata(root: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    files_considered = 0
    files_scanned = 0
    truncated = False
    truncation_reasons: list[str] = []
    manifest = root / "SKILL.md"
    scanner_payload = manifest.is_file() and bool(re.search(r"(?m)^name:\s*paseo-spyware-check\s*$", manifest.read_text(encoding="utf-8", errors="replace")))
    for candidate in _iter_payload_files(root):
        if not _is_high_signal(candidate):
            continue
        files_considered += 1
        relative = candidate.relative_to(root).as_posix()
        role = _source_role(candidate)
        size = candidate.stat().st_size
        if size > MAX_SCAN_BYTES:
            truncated = True
            truncation_reasons.append(f"file-too-large:{relative}")
            findings.append(_finding(
                severity="Info", rule_id="scan.file-truncated", relative=relative, line=0,
                reason="high-signal file exceeded the static text scan size limit", evidence=f"size={size}", role=role,
                confidence="high", mitigation="Review the file separately before registration.",
            ))
            continue
        text = candidate.read_text(encoding="utf-8", errors="replace")
        files_scanned += 1
        self_reference = scanner_payload or relative.startswith("skills/paseo-spyware-check/")
        rows = _package_json_findings(relative, text, role)
        for number, line in enumerate(text.splitlines(), start=1):
            rows.extend(_line_findings(relative, line, number, role))
        if self_reference:
            informational: list[dict[str, Any]] = []
            for row in rows:
                row = dict(row)
                row["severity"] = "Info"
                row["rule_id"] = f"scanner.self-reference.{row['rule_id']}"
                row["reason"] = "the bundled scanner source contains a static rule pattern"
                row["mitigation"] = "This is scanner implementation text, not target payload behavior."
                row["capabilities"] = []
                row["blocks"] = False
                row["review"] = False
                row["finding_id"] = policy.finding_id(row)
                informational.append(row)
            rows = informational
        findings.extend(rows)
        if len(findings) >= MAX_FINDINGS:
            findings = findings[:MAX_FINDINGS]
            truncated = True
            truncation_reasons.append("max-findings")
            break
    return findings, {
        "schema_version": SCANNER_SCHEMA_VERSION,
        "files_considered": files_considered,
        "files_scanned": files_scanned,
        "max_findings": MAX_FINDINGS,
        "max_scan_bytes_per_file": MAX_SCAN_BYTES,
        "truncated": truncated,
        "truncation_reasons": sorted(set(truncation_reasons)),
        "target_code_executed": False,
    }


def _scan_files(root: Path) -> list[dict[str, Any]]:
    return _scan_files_with_metadata(root)[0]


def scan_target_with_path(target: str, workspace: Path, timeout: int = 180) -> tuple[dict[str, Any], str, Path]:
    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    if _is_link_or_reparse(workspace):
        raise ScanError("unsafe-workspace", "scan workspace is a link or reparse point")
    selected, source, add_source = _acquire_source(target, workspace, timeout)
    _assert_link_free(selected)
    findings, scan_metadata = _scan_files_with_metadata(selected)
    counts = {severity.casefold(): sum(1 for row in findings if row["severity"] == severity) for severity in ("Critical", "High", "Medium", "Info")}
    verdict = "high" if counts["critical"] or counts["high"] else ("medium" if counts["medium"] else "low")
    checksum = directory_checksum(selected)
    security_policy = policy.build_policy(
        source=source,
        checksum=checksum,
        findings=findings,
        scanner_schema_version=SCANNER_SCHEMA_VERSION,
    )
    receipt: dict[str, Any] = {
        "status": "scan-complete",
        "scanner": {"name": SCANNER_NAME, "schema_version": SCANNER_SCHEMA_VERSION, "mode": "bundled-python-static"},
        "target": target,
        "source": source,
        "pinned_source": add_source if source["kind"] == "github" else None,
        "content_checksum": checksum,
        "verdict": verdict,
        "counts": counts,
        "findings": findings,
        "scan": scan_metadata,
        "policy": security_policy,
        "limitations": [
            "Static pattern checks do not prove that a skill is safe.",
            "Dependencies and target code were not installed, imported, built, or executed.",
            "Receipt SHA-256 is an integrity digest, not a digital or server signature.",
        ],
    }
    canonical = json.dumps(receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    receipt["receipt_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return receipt, add_source, selected


def scan_target(target: str, workspace: Path, timeout: int = 180) -> tuple[dict[str, Any], str]:
    receipt, add_source, _ = scan_target_with_path(target, workspace, timeout)
    return receipt, add_source


def validate_receipt(receipt: Any) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise ScanError("spyware-check-invalid", "Spyware scan returned no valid receipt")
    scanner = receipt.get("scanner")
    counts = receipt.get("counts")
    findings = receipt.get("findings")
    source = receipt.get("source")
    digest = receipt.get("receipt_sha256")
    if receipt.get("status") != "scan-complete" or not isinstance(scanner, dict) or scanner.get("name") != SCANNER_NAME or scanner.get("schema_version") != SCANNER_SCHEMA_VERSION or not isinstance(counts, dict) or not isinstance(findings, list) or not isinstance(source, dict) or source.get("kind") not in {"github", "local"} or not isinstance(receipt.get("content_checksum"), str) or not re.fullmatch(r"[0-9a-f]{64}", receipt["content_checksum"]) or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ScanError("spyware-check-invalid", "Spyware scan receipt is incomplete")
    expected_counts = {severity: 0 for severity in ("critical", "high", "medium", "info")}
    for severity in expected_counts:
        value = counts.get(severity)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ScanError("spyware-check-invalid", "Spyware scan receipt has invalid finding counts")
    finding_identifiers: list[str] = []
    for finding in findings:
        if not isinstance(finding, dict) or str(finding.get("severity", "")).casefold() not in expected_counts:
            raise ScanError("spyware-check-invalid", "Spyware scan finding is invalid")
        for field in ("finding_id", "rule_id", "confidence", "evidence", "mitigation", "path", "source_role"):
            if not isinstance(finding.get(field), (str, int)) or finding.get(field) in {"", None}:
                raise ScanError("spyware-check-invalid", f"Spyware scan finding is missing {field}")
        if not isinstance(finding.get("capabilities"), list) or not isinstance(finding.get("blocks"), bool) or not isinstance(finding.get("review"), bool):
            raise ScanError("spyware-check-invalid", "Spyware scan finding has invalid policy metadata")
        if finding.get("finding_id") != policy.finding_id(finding):
            raise ScanError("spyware-check-invalid", "Spyware finding ID is not stable for its rule/evidence")
        finding_identifiers.append(str(finding["finding_id"]))
        expected_counts[str(finding["severity"]).casefold()] += 1
    if counts != expected_counts:
        raise ScanError("spyware-check-invalid", "Spyware scan counts do not match its findings")
    verdict = "high" if counts["critical"] or counts["high"] else ("medium" if counts["medium"] else "low")
    if receipt.get("verdict") != verdict:
        raise ScanError("spyware-check-invalid", "Spyware scan verdict is inconsistent")
    scan_metadata = receipt.get("scan")
    if (
        not isinstance(scan_metadata, dict)
        or scan_metadata.get("schema_version") != SCANNER_SCHEMA_VERSION
        or not all(isinstance(scan_metadata.get(field), int) and not isinstance(scan_metadata.get(field), bool) and scan_metadata.get(field) >= 0 for field in ("files_considered", "files_scanned", "max_findings", "max_scan_bytes_per_file"))
        or scan_metadata.get("files_scanned") > scan_metadata.get("files_considered")
        or not isinstance(scan_metadata.get("truncated"), bool)
        or not isinstance(scan_metadata.get("truncation_reasons"), list)
        or not all(isinstance(reason, str) and reason for reason in scan_metadata.get("truncation_reasons", []))
        or scan_metadata.get("target_code_executed") is not False
    ):
        raise ScanError("spyware-check-invalid", "Spyware scan truncation metadata is invalid")
    try:
        policy.validate_policy(
            receipt.get("policy"),
            expected_source=source,
            expected_checksum=receipt["content_checksum"],
            expected_finding_ids=finding_identifiers,
        )
    except policy.PolicyError as exc:
        raise ScanError("spyware-check-invalid", f"Spyware policy binding is invalid: {exc}") from exc
    unsigned = dict(receipt)
    unsigned.pop("receipt_sha256", None)
    expected_digest = hashlib.sha256(json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    if digest != expected_digest:
        raise ScanError("spyware-check-invalid", "Spyware scan receipt digest does not match")
    return receipt


def main(argv: list[str] | None = None) -> int:
    import argparse
    import tempfile

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args(argv)
    try:
        with tempfile.TemporaryDirectory(prefix="skillnload-spyware-") as temporary:
            receipt, _ = scan_target(args.target, Path(temporary), args.timeout)
            print(json.dumps(receipt, ensure_ascii=True, indent=2, sort_keys=True))
    except (ScanError, OSError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "error", "code": getattr(exc, "code", "scan-failed"), "message": str(exc), "detail": getattr(exc, "detail", "")}, ensure_ascii=True, indent=2, sort_keys=True))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
