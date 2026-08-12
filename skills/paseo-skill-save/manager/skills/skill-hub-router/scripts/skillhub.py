#!/usr/bin/env python3
"""Portable launcher and pinned minimal-runtime bootstrap for Skill Hub.

The launcher first uses an explicitly selected checkout, an enclosing checkout,
or an installed Python package.  If the skill was installed by itself, it
creates a manager-owned sparse checkout at an exact public revision.  It never
downloads or executes workload skills during bootstrap.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import Iterable


PUBLIC_REPOSITORY = "https://github.com/wilgon456/skillNload.git"
PUBLIC_REF = "v0.6.0"
PUBLIC_REVISION = "1d1167259a1cb132db8679dce3fef13fb6373015"
COPY_DIRECTORIES = (
    "skillhub",
    "scripts",
    "catalog",
    "profiles",
    "schemas",
    "skills/skill-hub-router",
)
COPY_FILES = ("registry.json", "LICENSE", "NOTICE")
SKIP_NAMES = {".git", "__pycache__", ".pytest_cache", "build", "dist"}


class BootstrapError(RuntimeError):
    pass


def is_link(path: Path) -> bool:
    if path.is_symlink():
        return True
    if os.name != "nt":
        return False
    try:
        return bool(path.stat(follow_symlinks=False).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (AttributeError, OSError):
        return False


def state_dir() -> Path:
    override = os.environ.get("SKILLHUB_STATE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        return (Path(base) if base else Path.home() / "AppData" / "Local") / "ai-skill-library"
    base = os.environ.get("XDG_STATE_HOME")
    return (Path(base) if base else Path.home() / ".local" / "state") / "ai-skill-library"


def manager_ready(root: Path) -> bool:
    required_files = (root / "registry.json", root / "scripts" / "skillhub.py")
    required_dirs = (root / "skillhub", root / "catalog", root / "skills" / "skill-hub-router")
    return (
        root.is_dir()
        and not is_link(root)
        and all(path.is_file() and not is_link(path) for path in required_files)
        and all(path.is_dir() and not is_link(path) for path in required_dirs)
    )


def within(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def iter_payload_files(root: Path) -> Iterable[tuple[str, Path]]:
    for relative in COPY_FILES:
        path = root / relative
        if path.is_file():
            yield relative, path
    for relative in COPY_DIRECTORIES:
        directory = root / relative
        if not directory.is_dir():
            continue
        if is_link(directory):
            raise BootstrapError(f"runtime source contains a linked directory: {relative}")
        for path in sorted(directory.rglob("*"), key=lambda item: item.as_posix()):
            child = path.relative_to(root)
            if any(part in SKIP_NAMES for part in child.parts):
                continue
            if is_link(path):
                raise BootstrapError(f"runtime source contains a link or reparse point: {child.as_posix()}")
            if path.is_file():
                yield child.as_posix(), path


def payload_digest(root: Path) -> str:
    digest = hashlib.sha256()
    found = False
    for relative, path in iter_payload_files(root):
        if is_link(path):
            raise BootstrapError(f"runtime source contains a symbolic link: {relative}")
        found = True
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
        digest.update(b"\0")
    if not found:
        raise BootstrapError("runtime source is empty")
    return digest.hexdigest()


def runtime_root() -> Path:
    root = state_dir() / "runtime"
    if root.exists() and (not root.is_dir() or is_link(root)):
        raise BootstrapError("runtime path exists but is not a manager-owned directory")
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def record_path(root: Path) -> Path:
    return root / "manager.json"


def write_record(root: Path, manager: Path, digest: str, source_kind: str, revision: str | None) -> None:
    if not within(manager, root):
        raise BootstrapError("refusing to record a runtime outside manager-owned state")
    value = {
        "schema_version": 1,
        "path": str(manager.resolve()),
        "content_digest": digest,
        "source_kind": source_kind,
        "revision": revision,
    }
    fd, temporary = tempfile.mkstemp(prefix=".manager.", suffix=".json", dir=str(root), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, record_path(root))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def recorded_manager(root: Path) -> Path | None:
    record = record_path(root)
    if not record.exists():
        return None
    try:
        value = json.loads(record.read_text(encoding="utf-8"))
        manager = Path(value["path"]).resolve()
        expected = str(value["content_digest"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise BootstrapError("managed runtime record is invalid") from exc
    if not within(manager, root) or not manager_ready(manager):
        raise BootstrapError("managed runtime is missing or outside its owned directory")
    if payload_digest(manager) != expected:
        raise BootstrapError("managed runtime content changed; refusing to execute it")
    return manager


def copy_checkout(source: Path, root: Path) -> Path:
    source = source.expanduser().resolve()
    if not manager_ready(source):
        raise BootstrapError("bootstrap checkout does not contain the public manager boundary")
    digest = payload_digest(source)
    target = root / f"manager-{digest[:16]}" / "source"
    if target.exists():
        if not manager_ready(target) or payload_digest(target) != digest:
            raise BootstrapError("owned runtime destination exists with unexpected content")
        write_record(root, target, digest, "checkout-copy", None)
        return target

    temporary = root / f".manager-{digest[:16]}-{os.getpid()}"
    if temporary.exists() or not within(temporary, root):
        raise BootstrapError("temporary runtime destination is unsafe")
    try:
        temporary.mkdir()
        for relative in COPY_FILES:
            source_file = source / relative
            if source_file.is_file():
                destination = temporary / "source" / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, destination)
        for relative in COPY_DIRECTORIES:
            source_directory = source / relative
            if source_directory.is_dir():
                shutil.copytree(
                    source_directory,
                    temporary / "source" / relative,
                    symlinks=False,
                    ignore=shutil.ignore_patterns(*SKIP_NAMES),
                )
        copied = temporary / "source"
        if not manager_ready(copied) or payload_digest(copied) != digest:
            raise BootstrapError("persisted runtime failed its content verification")
        target.parent.mkdir(parents=True, exist_ok=False)
        os.replace(copied, target)
        temporary.rmdir()
    finally:
        if temporary.exists() and within(temporary, root):
            shutil.rmtree(temporary)
    write_record(root, target, digest, "checkout-copy", None)
    return target


def run_git(*arguments: str, cwd: Path | None = None) -> str:
    completed = subprocess.run(
        ["git", *arguments],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=180,
    )
    if completed.returncode:
        detail = completed.stderr.strip()
        for argument in arguments:
            if "://" in argument:
                detail = detail.replace(argument, "<repository>")
        detail = detail.replace(PUBLIC_REPOSITORY, "<public-repository>")
        raise BootstrapError("git operation failed" + (f": {detail[-500:]}" if detail else ""))
    return completed.stdout.strip()


def clone_pinned_manager(root: Path) -> Path:
    if not shutil.which("git"):
        raise BootstrapError("Git is required for first-use bootstrap; alternatively run install.py from the repository")
    override = os.environ.get("SKILLHUB_BOOTSTRAP_REPOSITORY")
    repository = override or PUBLIC_REPOSITORY
    revision = os.environ.get("SKILLHUB_BOOTSTRAP_REVISION") if override else PUBLIC_REVISION
    ref = os.environ.get("SKILLHUB_BOOTSTRAP_REF") if override else PUBLIC_REF
    if override and not revision:
        raise BootstrapError("a bootstrap repository override requires SKILLHUB_BOOTSTRAP_REVISION")
    assert revision is not None
    if re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise BootstrapError("bootstrap revision must be an exact lowercase commit SHA")
    target = root / f"manager-{revision[:16]}" / "source"
    if target.exists():
        if not manager_ready(target):
            raise BootstrapError("owned pinned runtime destination is incomplete")
        digest = payload_digest(target)
        write_record(root, target, digest, "pinned-git", revision)
        return target

    temporary = root / f".manager-{revision[:16]}-{os.getpid()}"
    if temporary.exists() or not within(temporary, root):
        raise BootstrapError("temporary pinned runtime destination is unsafe")
    try:
        clone = ["clone", "--filter=blob:none", "--no-checkout"]
        if ref:
            clone.extend(("--depth", "1", "--branch", ref))
        clone.extend(("--", repository, str(temporary)))
        run_git(*clone)
        run_git("sparse-checkout", "init", "--cone", cwd=temporary)
        run_git("sparse-checkout", "set", *COPY_DIRECTORIES, cwd=temporary)
        run_git("checkout", "--detach", revision, cwd=temporary)
        actual = run_git("rev-parse", "HEAD", cwd=temporary)
        if actual != revision:
            raise BootstrapError("pinned runtime revision verification failed")
        if not manager_ready(temporary):
            raise BootstrapError("pinned sparse checkout is missing manager files")
        digest = payload_digest(temporary)
        target.parent.mkdir(parents=True, exist_ok=False)
        os.replace(temporary, target)
    finally:
        if temporary.exists() and within(temporary, root):
            shutil.rmtree(temporary)
    write_record(root, target, digest, "pinned-git", revision)
    return target


def enclosing_manager() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if manager_ready(parent):
            return parent
    return None


def dispatch_checkout(root: Path, arguments: list[str]) -> int:
    environment = os.environ.copy()
    environment["SKILLHUB_REPO"] = str(root)
    return subprocess.call(
        [sys.executable, str(root / "scripts" / "skillhub.py"), *arguments],
        env=environment,
    )


def main(arguments: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    try:
        owned_root = runtime_root()
        force = os.environ.get("SKILLHUB_FORCE_BOOTSTRAP") == "1"
        if force:
            source = os.environ.get("SKILLHUB_BOOTSTRAP_FROM_CHECKOUT")
            manager = copy_checkout(Path(source), owned_root) if source else clone_pinned_manager(owned_root)
            return dispatch_checkout(manager, arguments)

        explicit = os.environ.get("SKILLHUB_REPO")
        if explicit:
            manager = Path(explicit).expanduser().resolve()
            if not manager_ready(manager):
                raise BootstrapError("SKILLHUB_REPO does not contain a valid manager checkout")
            return dispatch_checkout(manager, arguments)

        if os.environ.get("SKILLHUB_PREFER_RUNTIME") == "1":
            manager = recorded_manager(owned_root)
            if manager:
                return dispatch_checkout(manager, arguments)

        manager = enclosing_manager()
        if manager:
            return dispatch_checkout(manager, arguments)

        specification = importlib.util.find_spec("skillhub")
        specification_origin = Path(specification.origin).resolve() if specification and specification.origin else None
        if specification_origin is not None and specification_origin != Path(__file__).resolve():
            return subprocess.call([sys.executable, "-m", "skillhub", *arguments])

        manager = recorded_manager(owned_root)
        if manager is None:
            print("[skillhub] Preparing the pinned minimal manager runtime...", file=sys.stderr)
            manager = clone_pinned_manager(owned_root)
        return dispatch_checkout(manager, arguments)
    except (BootstrapError, OSError, subprocess.SubprocessError) as exc:
        print(f"skillhub bootstrap error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
