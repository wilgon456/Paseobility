#!/usr/bin/env python3
"""Cross-platform, fail-closed static scanner for skill-save registration."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import Any, Iterable
from urllib.parse import urlparse


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

SECRET_TOKEN_PATTERN = re.compile(
    r"gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|"
    r"xox[baprs]-[0-9A-Za-z-]{20,}",
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
            r"ANTHROPIC_API_KEY|api[_-]?key|webhook|pastebin|"
            r"discord(?:app)?\.com/api/webhooks",
            re.IGNORECASE,
        ),
    ),
    (
        "embedded secret or private key",
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|"
            r"gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|"
            r"xox[baprs]-[0-9A-Za-z-]{20,}"
        ),
    ),
)
MEDIUM_PATTERNS = (
    (
        "install-time script indicator",
        re.compile(r"preinstall|postinstall|prepare|prepublish", re.IGNORECASE),
    ),
    (
        "dynamic execution, obfuscation, or environment access indicator",
        re.compile(
            r"child_process|\beval\s*\(|\bFunction\s*\(|base64|atob|"
            r"Buffer\.from|process\.env",
            re.IGNORECASE,
        ),
    ),
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
        return bool(
            path.stat(follow_symlinks=False).st_file_attributes
            & stat.FILE_ATTRIBUTE_REPARSE_POINT
        )
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
            raise ScanError(
                "unsafe-link",
                "scan source contains a link or reparse point",
                candidate.relative_to(root).as_posix(),
            )


def _git_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
        }
    )
    return environment


def _run_git(arguments: list[str], timeout: int, cwd: Path | None = None) -> str:
    try:
        completed = subprocess.run(
            ["git", *arguments],
            cwd=cwd,
            env=_git_environment(),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout,
            check=False,
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
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "github.com", "www.github.com"
    }:
        return None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ScanError(
            "invalid-github-url",
            "GitHub source must not contain credentials, a query, or a fragment",
        )
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise ScanError("invalid-github-url", "GitHub source must identify a repository")
    owner, repository = parts[0], parts[1].removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(
        r"[A-Za-z0-9_.-]+", repository
    ):
        raise ScanError("invalid-github-url", "GitHub owner or repository name is invalid")
    revision = ""
    subdirectory = ""
    if len(parts) > 2:
        if len(parts) < 5 or parts[2] != "tree":
            raise ScanError(
                "invalid-github-url",
                "GitHub source must be a repository root or /tree/<revision>/<skill-path>",
            )
        revision = parts[3]
        subdirectory = "/".join(parts[4:])
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", revision):
            raise ScanError(
                "invalid-github-url",
                "GitHub revision must be a branch, tag, or commit without option-like characters",
            )
        if not re.fullmatch(r"[A-Za-z0-9._/-]+", subdirectory):
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
            _run_git(
                ["-C", str(checkout), "fetch", "--depth", "1", "origin", github["revision"]],
                timeout,
            )
            _run_git(["-C", str(checkout), "checkout", "--detach", "FETCH_HEAD"], timeout)
        else:
            _run_git(
                ["clone", "--filter=blob:none", "--depth", "1", "--no-tags", repository_git, str(checkout)],
                timeout,
            )
        commit = _run_git(["-C", str(checkout), "rev-parse", "HEAD"], timeout)
        tree = _run_git(["-C", str(checkout), "rev-parse", "HEAD^{tree}"], timeout)
        selected = (checkout / github["path"]).resolve() if github["path"] else checkout.resolve()
        if not _path_within(selected, checkout) or not selected.is_dir():
            raise ScanError("missing-skill-path", "GitHub skill path is missing or unsafe")
        pinned_path = github["path"] or "."
        pinned_source = f"{github['repository']}/tree/{commit}/{pinned_path}"
        return selected, {
            "kind": "github",
            "repository": github["repository"],
            "commit": commit,
            "tree": tree,
            "path": github["path"],
            "skill_manifest": (selected / "SKILL.md").is_file(),
        }, pinned_source

    source = Path(target).expanduser().resolve()
    _assert_link_free(source)
    snapshot = workspace / "local-source"
    shutil.copytree(source, snapshot, symlinks=True)
    _assert_link_free(snapshot)
    return snapshot, {
        "kind": "local",
        "path": str(source),
        "skill_manifest": (snapshot / "SKILL.md").is_file(),
    }, str(snapshot)


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


def _classify(
    relative: str, line: str, *, scanner_payload: bool = False
) -> tuple[str, str] | None:
    if scanner_payload or relative.startswith("skills/paseo-spyware-check/"):
        patterns = (*HIGH_PATTERNS, *MEDIUM_PATTERNS)
        if any(pattern.search(line) for _, pattern in patterns):
            return "Info", "self-reference in scanner implementation or documentation"
        return None
    for reason, pattern in HIGH_PATTERNS:
        if pattern.search(line):
            return "High", reason
    for reason, pattern in MEDIUM_PATTERNS:
        if pattern.search(line):
            return "Medium", reason
    return None


def _scan_files(root: Path) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    manifest = root / "SKILL.md"
    scanner_payload = manifest.is_file() and bool(
        re.search(
            r"(?m)^name:\s*paseo-spyware-check\s*$",
            manifest.read_text(encoding="utf-8", errors="replace"),
        )
    )
    for candidate in _iter_payload_files(root):
        if not _is_high_signal(candidate):
            continue
        relative = candidate.relative_to(root).as_posix()
        size = candidate.stat().st_size
        if size > MAX_SCAN_BYTES:
            findings.append(
                {
                    "severity": "Info",
                    "path": relative,
                    "line": 0,
                    "reason": "high-signal file exceeded the static text scan size limit",
                    "evidence": f"size={size}",
                }
            )
            continue
        text = candidate.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            classification = _classify(
                relative, line, scanner_payload=scanner_payload
            )
            if classification is None:
                continue
            severity, reason = classification
            findings.append(
                {
                    "severity": severity,
                    "path": relative,
                    "line": number,
                    "reason": reason,
                    "evidence": _redact_evidence(line),
                }
            )
            if len(findings) >= MAX_FINDINGS:
                return findings
    return findings


def scan_target(target: str, workspace: Path, timeout: int = 180) -> tuple[dict[str, Any], str]:
    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    if _is_link_or_reparse(workspace):
        raise ScanError("unsafe-workspace", "scan workspace is a link or reparse point")
    selected, source, add_source = _acquire_source(target, workspace, timeout)
    _assert_link_free(selected)
    findings = _scan_files(selected)
    counts = {
        severity.casefold(): sum(1 for row in findings if row["severity"] == severity)
        for severity in ("Critical", "High", "Medium", "Info")
    }
    verdict = "high" if counts["critical"] or counts["high"] else (
        "medium" if counts["medium"] else "low"
    )
    receipt: dict[str, Any] = {
        "status": "scan-complete",
        "scanner": {
            "name": "paseo-spyware-check",
            "schema_version": 1,
            "mode": "bundled-python-static",
        },
        "target": target,
        "source": source,
        "pinned_source": add_source if source["kind"] == "github" else None,
        "content_checksum": directory_checksum(selected),
        "verdict": verdict,
        "counts": counts,
        "findings": findings,
        "limitations": [
            "Static pattern checks do not prove that a skill is safe.",
            "Dependencies and target code were not installed, imported, built, or executed.",
        ],
    }
    canonical = json.dumps(receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    receipt["receipt_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return receipt, add_source


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="GitHub repository/tree URL or local skill directory")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        with tempfile.TemporaryDirectory(prefix="paseo-spyware-python-") as temporary:
            receipt, _ = scan_target(args.target, Path(temporary), args.timeout)
    except (ScanError, OSError, subprocess.SubprocessError) as exc:
        payload = {
            "status": "error",
            "code": getattr(exc, "code", "scan-failed"),
            "message": str(exc),
            "detail": getattr(exc, "detail", ""),
        }
        print(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True))
        return 2
    print(json.dumps(receipt, ensure_ascii=True, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
