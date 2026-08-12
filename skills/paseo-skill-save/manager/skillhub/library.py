"""Core utilities for the skillNload manager.

Standard library only. This module never executes third-party skill content
and never touches the network.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable


VERSION = "0.7.0"
ROOT = Path(__file__).resolve().parents[1]
STATE_SCHEMA_VERSION = 2
REGISTRY_SCHEMA_VERSION = 2
RISK_ORDER = {
    "instructions-only": 0,
    "local-management": 1,
    "scripts": 2,
    "external-write": 3,
    "destructive": 4,
}
KNOWN_TARGETS = ("codex", "claude", "opencode", "paseo", "generic")
TARGET_ALIASES = {
    "codex": "codex",
    "agents": "codex",
    "claude": "claude",
    "claude-code": "claude",
    "opencode": "opencode",
    "paseo": "paseo",
    "generic": "generic",
    "generic-agent": "generic",
}
TARGET_DISPLAY = {
    "codex": "codex",
    "claude": "claude",
    "opencode": "opencode",
    "paseo": "paseo",
    "generic": "generic",
}
COMPATIBILITY_ALIASES = {
    "codex": "codex",
    "claude-code": "claude",
    "generic-agent": "generic",
}
TEXT_SUFFIXES = {
    ".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini",
    ".py", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".sh", ".bash", ".bat",
    ".ps1", ".xml", ".html", ".css", ".csv", ".sql", ".graphql", ".pin",
}
SKIP_PARTS = {
    ".git", "__pycache__", ".pytest_cache", ".mypy_cache", "node_modules",
    "build", "dist", "ai_skill_library.egg-info",
}
PERMITTED_REDISTRIBUTION = {
    "permitted-with-notice",
    "permitted-by-root-license",
}
REDISTRIBUTION_VALUES = {
    "permitted-with-notice",
    "permitted-by-root-license",
    "not-affirmatively-verified",
    "unknown",
    "forbidden",
}
REDISTRIBUTION_ALIASES = {
    "permitted-with-root-license": "permitted-by-root-license",
    "permitted": "unknown",
    "not-stated": "unknown",
    "": "unknown",
}
SECRET_PATTERNS = (
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("github-token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("aws-access-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("slack-token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{20,}")),
)
WINDOWS_DEVICE_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dump(value), encoding="utf-8", newline="\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def utc_now_iso() -> str:
    import datetime as dt

    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def normalize_redistribution(value: Any) -> str:
    """Return the canonical v0.2 redistribution decision.

    Historical or inconsistent spellings are retained as non-permitting
    metadata until a catalog author normalizes and verifies them. Only the
    two values in ``PERMITTED_REDISTRIBUTION`` can pass acquisition.
    """
    raw = str(value or "").strip().casefold()
    if raw in REDISTRIBUTION_VALUES:
        return raw
    return REDISTRIBUTION_ALIASES.get(raw, "unknown")


def normalize_bytes(payload: bytes, suffix: str = "") -> bytes:
    if suffix.lower() in TEXT_SUFFIXES or b"\x00" not in payload:
        return payload.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return payload


def iter_files(path: Path) -> Iterable[Path]:
    if not path.exists():
        return
    for item in sorted(path.rglob("*"), key=lambda p: p.as_posix()):
        if any(part in SKIP_PARTS for part in item.relative_to(path).parts):
            continue
        if item.is_file() or item.is_symlink():
            yield item


def is_reparse_point(path: Path) -> bool:
    if path.is_symlink():
        return True
    if os.name != "nt":
        return False
    try:
        return bool(path.stat(follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (AttributeError, OSError):
        return False


def path_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def directory_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    for item in iter_files(path):
        rel = item.relative_to(path).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        if is_reparse_point(item):
            digest.update(b"link\0")
            digest.update(os.readlink(item).encode("utf-8"))
        else:
            digest.update(b"file\0")
            digest.update(normalize_bytes(item.read_bytes(), item.suffix))
        digest.update(b"\0")
    return digest.hexdigest()


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    lines = text.splitlines()
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return {}
    result: dict[str, str] = {}
    frontmatter = lines[1:end]
    index = 0
    while index < len(frontmatter):
        raw = frontmatter[index]
        if not raw.strip() or raw.lstrip().startswith("#") or raw.startswith((" ", "\t")) or ":" not in raw:
            index += 1
            continue
        key, raw_value = raw.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if value in {"|", "|-", "|+", ">", ">-", ">+"}:
            folded = value.startswith(">")
            continuation: list[str] = []
            index += 1
            while index < len(frontmatter) and (not frontmatter[index] or frontmatter[index].startswith((" ", "\t"))):
                continuation.append(frontmatter[index])
                index += 1
            indents = [len(line) - len(line.lstrip()) for line in continuation if line.strip()]
            indentation = min(indents) if indents else 0
            block = "\n".join(line[indentation:] if line.strip() else "" for line in continuation).strip()
            result[key] = re.sub(r"\s+", " ", block).strip() if folded else block
            continue
        result[key] = value.strip("\"'")
        index += 1
    return result


def tokenize(value: str) -> list[str]:
    return [part for part in re.findall(r"[\w-]+", value.casefold(), flags=re.UNICODE) if part]


def risk_allowed(item_risk: str, allowed: str) -> bool:
    return RISK_ORDER.get(item_risk, 99) <= RISK_ORDER.get(allowed, -1)


def normalize_target(value: str) -> str:
    key = str(value).strip().casefold()
    if key not in TARGET_ALIASES:
        raise ValueError(f"unknown target: {value}")
    return TARGET_ALIASES[key]


def display_target(target: str) -> str:
    return TARGET_DISPLAY.get(target, target)


def run_git(repo: Path, *args: str, check: bool = True) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if check and proc.returncode:
        raise RuntimeError(proc.stderr.strip() or "git command failed")
    return proc.stdout


def state_default_dir() -> Path:
    override = os.environ.get("SKILLHUB_STATE_DIR")
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return Path(base) / "ai-skill-library"
    base = os.environ.get("XDG_STATE_HOME")
    return (Path(base) if base else Path.home() / ".local" / "state") / "ai-skill-library"


def target_roots(home: Path) -> dict[str, Path]:
    return {
        "codex": home / ".agents" / "skills",
        "claude": home / ".claude" / "skills",
        "opencode": home / ".config" / "opencode" / "skills",
        "paseo": home / ".paseo" / "skills",
        "generic": home / ".ai-skill-library" / "skills",
    }


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def blank_state() -> dict[str, Any]:
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "activations": {},
        "snapshots": {},
        "locks": {},
        "overlays": {},
        "acquisitions": {},
        "cache": {},
        "quarantine": [],
        "one_shot": {},
        "feedback": {},
        "sync": {},
        "remote": {},
    }


def migrate_state(data: dict[str, Any]) -> dict[str, Any]:
    """Deterministic migration from v0.1 (schema 1) state to schema 2.

    Router activations, locks, snapshots, and overlay records are preserved
    verbatim; the new lifecycle sections start empty.
    """
    version = data.get("schema_version")
    if version not in (1, STATE_SCHEMA_VERSION):
        raise ValueError(f"unsupported state schema: {version!r}")
    migrated = blank_state()
    if version == STATE_SCHEMA_VERSION:
        migrated.update(data)
        for key, default in blank_state().items():
            migrated.setdefault(key, default)
    else:
        migrated["migrated_from"] = 1
        for key in ("activations", "snapshots", "locks", "overlays"):
            value = data.get(key)
            if isinstance(value, dict):
                migrated[key] = value

    activations = migrated.get("activations", {})
    if isinstance(activations, dict):
        normalized: dict[str, Any] = {}
        for catalog_id, activation in activations.items():
            if not isinstance(activation, dict):
                normalized[catalog_id] = activation
                continue
            activation_copy = dict(activation)
            targets = activation_copy.get("targets", {})
            if isinstance(targets, dict):
                normalized_targets: dict[str, Any] = {}
                for target, record in targets.items():
                    canonical = TARGET_ALIASES.get(str(target).casefold(), str(target))
                    record_copy = dict(record) if isinstance(record, dict) else record
                    if isinstance(record_copy, dict) and canonical != target:
                        record_copy.setdefault("legacy_target", target)
                    normalized_targets[canonical] = record_copy
                activation_copy["targets"] = normalized_targets
            normalized[catalog_id] = activation_copy
        migrated["activations"] = normalized
    migrated["schema_version"] = STATE_SCHEMA_VERSION
    return migrated


def load_state(state_dir: Path) -> dict[str, Any]:
    path = state_dir / "state.json"
    if not path.exists():
        return blank_state()
    data = read_json(path)
    if not isinstance(data, dict):
        raise ValueError("state file is not an object")
    return migrate_state(data)


def save_state(state_dir: Path, state: dict[str, Any]) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    atomic_write(state_dir / "state.json", json_dump(state))


def safe_name(value: str) -> str:
    result = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-")
    if not result:
        raise ValueError("empty safe name")
    return result[:180]


def remove_managed_destination(path: Path, record: dict[str, Any]) -> None:
    if not path.exists() and not path.is_symlink():
        return
    method = record.get("method")
    if method == "symlink":
        if not path.is_symlink():
            raise RuntimeError(f"managed symlink changed into an unmanaged path: {path}")
        path.unlink()
    elif method == "junction":
        if not is_reparse_point(path):
            raise RuntimeError(f"managed junction changed into an unmanaged path: {path}")
        os.rmdir(path)
    elif method == "copy":
        if not record.get("owned") or not path.is_dir() or is_reparse_point(path):
            raise RuntimeError(f"managed copy is no longer a recorded directory: {path}")
        expected = record.get("content_checksum")
        if expected and directory_checksum(path) != expected:
            raise RuntimeError(f"managed copy changed since activation; refusing to remove: {path}")
        shutil.rmtree(path)
    else:
        raise RuntimeError(f"unknown managed destination method for {path}")


def expose(source: Path, destination: Path) -> str:
    if not source.is_dir() or is_reparse_point(source):
        raise ValueError(f"source must be a real directory: {source}")
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(f"destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.symlink(source, destination, target_is_directory=True)
        return "symlink"
    except OSError:
        pass
    if os.name == "nt":
        try:
            proc = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(destination), str(source)],
                capture_output=True,
                text=True,
            )
            if proc.returncode == 0:
                return "junction"
        except OSError:
            pass
    shutil.copytree(source, destination)
    return "copy"


def copy_tree_checked(source: Path, destination: Path) -> str:
    if not source.is_dir() or is_reparse_point(source):
        raise ValueError("source must be a real directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    for item in sorted(source.rglob("*"), key=lambda p: p.as_posix()):
        relative = item.relative_to(source)
        if any(part in {".", "..", ".git"} for part in relative.parts):
            raise ValueError(f"unsafe overlay path: {relative}")
        if is_reparse_point(item):
            raise ValueError(f"symlinks and junctions are not imported: {item}")
        if item.is_file():
            payload = item.read_bytes()
            if b"\x00" in payload and item.suffix.lower() in TEXT_SUFFIXES:
                raise ValueError(f"unexpected binary text file: {item}")
    shutil.copytree(source, destination, symlinks=False)
    return directory_checksum(destination)


_PRIVACY_FINGERPRINTS = frozenset(
    {
        (23, "58f934760a816311a873d854e283fd129889f016d7d1f4864c329060155ce757"),
        (20, "3029900f62cf331c5d9632419f15d428eed80af01bf598040637ea36a05cda98"),
        (4, "e33fa4cffc6af4b900b8cf538ffa7388fcb9978ebd76a009f83a83114b0ffb07"),
        (18, "06ec9578ddc8dfffa2fc2643d51de7ff64a7224616744eb2ecd03f631f221559"),
        (14, "1d28b3c568effca35fef95fe1d0cf712436200d7fba19c42b694de9bf8d3b98c"),
    }
)
_PRIVACY_CANDIDATE = re.compile(r"[A-Za-z0-9_:-]+(?:[\\/][A-Za-z0-9_.-]+)*")


def _privacy_candidates(value: str) -> Iterable[str]:
    """Yield identifiers and path prefixes without retaining private labels."""
    for match in _PRIVACY_CANDIDATE.finditer(value):
        candidate = match.group(0)
        yield candidate
        for separator in ("\\", "/"):
            if separator not in candidate:
                continue
            parts = candidate.split(separator)
            for part in parts:
                if part:
                    yield part
            for end in range(2, len(parts) + 1):
                yield separator.join(parts[:end])


def _contains_fingerprinted_token(
    value: str,
    fingerprints: frozenset[tuple[int, str]],
) -> str | None:
    for candidate in _privacy_candidates(value):
        normalized = candidate.casefold()
        fingerprint = (len(normalized), hashlib.sha256(normalized.encode("utf-8")).hexdigest())
        if fingerprint in fingerprints:
            return "private identifier"
    return None


def contains_privacy_token(value: str) -> str | None:
    return _contains_fingerprinted_token(value, _PRIVACY_FINGERPRINTS)


def is_checkout_root(path: Path) -> bool:
    return (path / "registry.json").is_file() and (path / "catalog").is_dir() and (path / "scripts").is_dir()


def packaged_data_root() -> Path:
    return Path(__file__).resolve().parent / "data"


def catalog_root(explicit: str | None = None) -> tuple[Path, str]:
    """Resolve the catalog root: explicit flag, checkout, or packaged data.

    Returns (root, mode) where mode is "checkout" or "packaged".
    """
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if not (root / "registry.json").is_file():
            raise ValueError(f"catalog root has no registry.json: {root}")
        return root, ("checkout" if is_checkout_root(root) else "packaged")
    env = os.environ.get("SKILLHUB_REPO")
    if env:
        return catalog_root(env)
    if is_checkout_root(ROOT):
        return ROOT, "checkout"
    data = packaged_data_root()
    if (data / "registry.json").is_file():
        return data, "packaged"
    raise ValueError("no catalog root found; pass --repo or reinstall the package")
