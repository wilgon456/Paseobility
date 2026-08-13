#!/usr/bin/env python3
"""Scan checked-in public artifacts for secrets, private markers, and host paths."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from .library import ROOT, contains_privacy_token, iter_files
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from library import ROOT, contains_privacy_token, iter_files  # type: ignore


SECRET_PATTERNS = (
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("github-token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("aws-access-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("slack-token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{20,}")),
)
ABSOLUTE_PATTERNS = (
    ("windows-absolute", re.compile(r"(?i)(?<![A-Za-z0-9])(?:[A-Z]:[\\/])(?![\\/])[^\r\n\"']+")),
    ("posix-user-home", re.compile(r"(?<![A-Za-z0-9])/(?:Users|home|private/var|mnt)/[^\r\n\"']+")),
)
PRIVATE_REVIEWED_ABSOLUTE_PATH_EXAMPLES = {
    "skills/webapp-testing/examples/console_logging.py",
    "skills/webapp-testing/examples/static_html_automation.py",
    "skills/screenshot/SKILL.md",
}


def scan(root: Path) -> list[str]:
    findings: list[str] = []
    try:
        registry = json.loads((root / "registry.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        registry = {}
    private_bundle = any(
        source.get("source_id") == "private-library"
        for source in registry.get("sources", [])
        if isinstance(source, dict)
    )
    for path in iter_files(root):
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".hwp", ".hwpx", ".docx", ".zip", ".woff", ".woff2", ".ttf"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        relative = path.relative_to(root).as_posix()
        if not private_bundle and (contains_privacy_token(text) or contains_privacy_token(relative)):
            findings.append(f"privacy marker: {path}")
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append(f"{label}: {path}")
        for label, pattern in ABSOLUTE_PATTERNS:
            if pattern.search(text) and not (
                private_bundle and relative in PRIVATE_REVIEWED_ABSOLUTE_PATH_EXAMPLES
            ):
                findings.append(f"{label}: {path}")
    return findings


def main() -> int:
    findings = scan(ROOT)
    if findings:
        print("\n".join(findings), file=sys.stderr)
        return 1
    print("repository scan: clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
