#!/usr/bin/env python3
"""Build the manager wheel and sdist into dist/ without touching any registry.

The hosted CI images do not consistently preinstall the third-party ``wheel``
package. Build the pure-Python wheel directly after setuptools has populated
``build/lib`` so package builds remain offline and reproducible.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import re
import shutil
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> int:
    proc = subprocess.run(command, cwd=ROOT)
    return proc.returncode


def wheel_name(project: dict[str, object]) -> str:
    name = re.sub(r"[-_.]+", "_", str(project["name"]))
    return f"{name}-{project['version']}-py3-none-any.whl"


def wheel_metadata(project: dict[str, object]) -> dict[str, bytes]:
    name = str(project["name"])
    version = str(project["version"])
    lines = [
        "Metadata-Version: 2.1",
        f"Name: {name}",
        f"Version: {version}",
        f"Summary: {project['description']}",
        "License: Apache-2.0",
        f"Requires-Python: {project['requires-python']}",
        "Author: skillNload contributors",
        "Classifier: Development Status :: 4 - Beta",
        "Classifier: Environment :: Console",
        "Classifier: Operating System :: OS Independent",
        "Classifier: Programming Language :: Python :: 3",
        "Classifier: Topic :: Software Development :: Libraries",
        "",
    ]
    scripts = project.get("scripts", {})
    entry_points = "[console_scripts]\n" + "\n".join(f"{key} = {value}" for key, value in sorted(scripts.items())) + "\n"
    info = re.sub(r"[-_.]+", "_", name) + f"-{version}.dist-info"
    return {
        f"{info}/METADATA": "\n".join(lines).encode("utf-8"),
        f"{info}/WHEEL": (
            "Wheel-Version: 1.0\n"
            "Generator: skillnload build_package.py\n"
            "Root-Is-Purelib: true\n"
            "Tag: py3-none-any\n"
        ).encode("utf-8"),
        f"{info}/entry_points.txt": entry_points.encode("utf-8"),
    }


def record_line(name: str, payload: bytes) -> str:
    digest = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).rstrip(b"=").decode("ascii")
    return f"{name},sha256={digest},{len(payload)}"


def build_wheel(build_lib: Path, dist: Path, project: dict[str, object]) -> Path:
    entries: dict[str, bytes] = {}
    for path in sorted(build_lib.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_file():
            entries[path.relative_to(build_lib).as_posix()] = path.read_bytes()
    entries.update(wheel_metadata(project))
    dist_info = re.sub(r"[-_.]+", "_", str(project["name"])) + f"-{project['version']}.dist-info"
    record_name = f"{dist_info}/RECORD"
    record = "\n".join(record_line(name, payload) for name, payload in sorted(entries.items())) + f"\n{record_name},,\n"
    entries[record_name] = record.encode("utf-8")
    output = dist / wheel_name(project)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o644 << 16
            archive.writestr(info, payload)
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean", action="store_true", help="remove dist/ first")
    args = parser.parse_args(argv)
    dist = ROOT / "dist"
    if args.clean and dist.exists():
        shutil.rmtree(dist)
    if args.clean:
        for generated in (ROOT / "build", ROOT / "skillnload.egg-info", ROOT / "ai_skill_library.egg-info"):
            if generated.exists():
                shutil.rmtree(generated)
    dist.mkdir(parents=True, exist_ok=True)
    with (ROOT / "pyproject.toml").open("rb") as handle:
        project = tomllib.load(handle)["project"]
    build_lib = ROOT / "build" / "lib"
    code = run([sys.executable, "setup.py", "build_py", "--build-lib", str(build_lib)])
    if code:
        return code
    wheel = build_wheel(build_lib, dist, project)
    print(f"built {wheel.name}")
    return run([sys.executable, "setup.py", "sdist", "--dist-dir", str(dist)])


if __name__ == "__main__":
    raise SystemExit(main())
