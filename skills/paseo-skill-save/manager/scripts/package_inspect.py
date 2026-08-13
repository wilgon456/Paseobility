#!/usr/bin/env python3
"""Inspect release archives for required manager data and excluded payloads."""
from __future__ import annotations

import argparse
import re
import sys
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_PARTS = {"archive", "vendor", "docs", "tests", ".github"}
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
)


def non_router_skill_path(entry: str) -> bool:
    """Return true when a release archive contains a workload-skill payload."""

    parts = Path(entry).parts
    if len(parts) > 1 and parts[0] == "skills":
        return parts[1] != "skill-hub-router"
    if len(parts) > 3 and parts[:3] == ("skillhub", "data", "skills"):
        return parts[3] != "skill-hub-router"
    return False


def names(path: Path) -> tuple[list[str], dict[str, bytes]]:
    if path.suffix == ".whl":
        with zipfile.ZipFile(path) as archive:
            return archive.namelist(), {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}
    if path.name.endswith(".tar.gz"):
        with tarfile.open(path, "r:gz") as archive:
            members = archive.getmembers()
            payloads = {}
            for member in members:
                if member.isfile():
                    handle = archive.extractfile(member)
                    if handle is not None:
                        payloads[member.name] = handle.read()
            return [member.name for member in members], payloads
    raise ValueError(f"unsupported package archive: {path}")


def inspect(path: Path) -> list[str]:
    entries, payloads = names(path)
    if path.name.endswith(".tar.gz"):
        roots = {Path(entry).parts[0] for entry in entries if Path(entry).parts}
        prefix = next(iter(roots)) + "/" if len(roots) == 1 else ""
        if prefix:
            entries = [entry[len(prefix):] if entry.startswith(prefix) else entry for entry in entries]
            payloads = {entry[len(prefix):] if entry.startswith(prefix) else entry: data for entry, data in payloads.items()}
    errors: list[str] = []
    if path.suffix == ".whl":
        required = {
            "skillhub/cli.py",
            "skillhub/acquire.py",
            "skillhub/data/registry.json",
            "skillhub/data/catalog/index.json",
            "skillhub/data/schemas/registry-v2.json",
            "skillhub/data/profiles/default.json",
            "skillhub/data/skills/skill-hub-router/SKILL.md",
            "skillhub/data/skills/skill-hub-router/scripts/skillhub.py",
        }
    else:
        # An sdist is a source boundary. setup.py copies these files under
        # skillhub/data when it builds the wheel from that source archive.
        required = {
            "skillhub/cli.py",
            "skillhub/acquire.py",
            "registry.json",
            "catalog/index.json",
            "schemas/registry-v2.json",
            "profiles/default.json",
            "skills/skill-hub-router/SKILL.md",
            "skills/skill-hub-router/scripts/skillhub.py",
        }
    missing = sorted(required - set(entries))
    errors.extend(f"{path.name}: missing {name}" for name in missing)
    for entry in entries:
        parts = set(Path(entry).parts)
        if parts & FORBIDDEN_PARTS:
            errors.append(f"{path.name}: forbidden package path {entry}")
        if non_router_skill_path(entry):
            errors.append(f"{path.name}: private workload skill leaked into package: {entry}")
        if entry.endswith("bin/skillhub.py"):
            errors.append(f"{path.name}: checkout-only adapter launcher leaked into package: {entry}")
        if re.search(r"(?i)(?:[A-Z]:[\\/]|/(?:Users|home|private/var|mnt)/)", entry):
            errors.append(f"{path.name}: absolute machine path in package name: {entry}")
    for entry, payload in payloads.items():
        if any(pattern.search(payload.decode("utf-8", errors="ignore")) for pattern in SECRET_PATTERNS):
            errors.append(f"{path.name}: secret-like content in {entry}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", nargs="*", type=Path)
    args = parser.parse_args(argv)
    archives = args.archives or sorted((ROOT / "dist").glob("*.whl")) + sorted((ROOT / "dist").glob("*.tar.gz"))
    if not archives:
        print("no wheel or sdist found; run scripts/build_package.py first", file=sys.stderr)
        return 2
    errors = []
    for archive in archives:
        errors.extend(inspect(archive))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("package inspect: clean (" + ", ".join(path.name for path in archives) + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
