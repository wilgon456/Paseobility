"""Private-GitHub onboarding for paseo_skill_save.

Implements the automated onboarding flow:
1. detect `gh` CLI
2. check auth status
3. identify account
4. inspect/create/reuse private repo
5. clone, validate, and initialize only valid marker private repos

Never makes actual GitHub API calls in tests; uses mocks.
Never stores credentials in URL/config.
Never changes visibility or force-pushes.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .remote import REMOTE_MARKER, REMOTE_REPO_NAME, REMOTE_SCHEMA_VERSION, SUPPORTED_REMOTE_SCHEMA_VERSIONS, RemoteError, validate_remote_url, verify_portable_repo


def _git_env(*, use_user_global: bool = False) -> dict[str, str]:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    if use_user_global:
        # ``gh auth setup-git`` must be able to update the user's normal Git
        # configuration.  Pointing GIT_CONFIG_GLOBAL at os.devnull works on
        # POSIX but fails on Windows because Git cannot lock the ``nul``
        # device.  setup-git stores only the gh credential-helper command, not
        # a token; all other operations remain isolated below.
        env.pop("GIT_CONFIG_GLOBAL", None)
    else:
        env["GIT_CONFIG_GLOBAL"] = os.devnull
        # Preserve config isolation while allowing authenticated HTTPS access
        # to private GitHub repositories.  The helper asks the already
        # authenticated gh CLI for credentials at runtime; no secret is put in
        # the remote URL or written into the portable repository.
        env["GIT_CONFIG_COUNT"] = "2"
        env["GIT_CONFIG_KEY_0"] = "credential.https://github.com.helper"
        env["GIT_CONFIG_VALUE_0"] = ""
        env["GIT_CONFIG_KEY_1"] = "credential.https://github.com.helper"
        env["GIT_CONFIG_VALUE_1"] = "!gh auth git-credential"
    env.pop("GIT_ASKPASS", None)
    env.pop("SSH_ASKPASS", None)
    return env


def _gh(
    args: list[str], *, timeout: int = 30, use_user_git_config: bool = False
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gh"] + args,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        env=_git_env(use_user_global=use_user_git_config),
    )


def detect_gh() -> bool:
    """Check if `gh` is available on PATH."""
    try:
        proc = subprocess.run(
            ["gh", "--version"],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )
        return proc.returncode == 0
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False


def check_auth() -> dict[str, Any]:
    if not detect_gh():
        return {
            "authenticated": False,
            "code": "github-cli-not-found",
            "command": "install gh CLI from https://cli.github.com",
        }

    proc = _gh(["auth", "status", "--hostname", "github.com"])
    if proc.returncode != 0:
        return {
            "authenticated": False,
            "code": "github-auth-required",
            "command": "gh auth login --hostname github.com",
            "stderr": proc.stderr.strip()[:400],
        }

    return {"authenticated": True}


def identify_account() -> dict[str, Any]:
    auth = check_auth()
    if not auth["authenticated"]:
        return auth

    proc = _gh(["api", "user", "--jq", ".login"])
    if proc.returncode != 0:
        return {
            "authenticated": True,
            "login": None,
            "code": "github-api-failed",
            "stderr": proc.stderr.strip()[:400],
        }

    login = proc.stdout.strip()
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?", login):
        return {
            "authenticated": True,
            "login": None,
            "code": "invalid-login",
            "detail": f"unexpected GitHub login format: {login!r}",
        }

    return {"authenticated": True, "login": login}


def inspect_repo(login: str) -> dict[str, Any]:
    """Inspect the paseo_skill_save repository for a given login.

    Returns a dict with: exists, is_private, is_empty, is_archived, error.
    403/500 are never classified as 404 (missing).
    """
    repo_full = f"{login}/{REMOTE_REPO_NAME}"

    proc = _gh(
        ["repo", "view", repo_full, "--json", "isPrivate,isArchived,isEmpty,nameWithOwner", "-q", "."],
        timeout=30,
    )

    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        # Do not infer absence from a generic error message before checking
        # authorization/server failures.  GitHub CLI errors can include the
        # words "not found" in responses that are not a safe create signal.
        if "403" in stderr or "forbidden" in stderr.casefold():
            return {"exists": False, "code": "github-forbidden", "detail": stderr[:400]}
        if "500" in stderr or "internal server error" in stderr.casefold():
            return {"exists": False, "code": "github-server-error", "detail": stderr[:400]}
        if "Could not resolve to a Repository" in stderr or "not found" in stderr.casefold():
            return {"exists": False, "code": "not-found"}
        return {"exists": False, "code": "github-error", "detail": stderr[:400]}

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"exists": False, "code": "github-bad-response", "detail": proc.stdout[:400]}

    if not isinstance(data, dict):
        return {"exists": False, "code": "github-bad-response"}

    is_private = data.get("isPrivate", False)
    is_archived = data.get("isArchived", False)
    is_empty = data.get("isEmpty", None)

    result: dict[str, Any] = {
        "exists": True,
        "is_private": is_private,
        "is_archived": is_archived,
        "is_empty": is_empty,
        "name_with_owner": data.get("nameWithOwner", repo_full),
    }

    if not is_private:
        result["refused"] = True
        result["reason"] = "repository is public; paseo_skill_save must be private"
        return result

    if is_archived:
        result["refused"] = True
        result["reason"] = "repository is archived"
        return result

    return result


def clone_and_validate_marker(remote_url: str, temp_dir: Path) -> dict[str, Any]:
    """Shallow-clone the remote and validate library.json marker and structure.

    Returns a dict with: valid_marker, item_count, catalog_ids, error.
    The clone is discarded after validation (caller provides temp dir).
    """
    if temp_dir.exists():
        shutil.rmtree(str(temp_dir), ignore_errors=True)

    proc = subprocess.run(
        ["git", "clone", "--quiet", "--depth", "1", "--branch", "main", remote_url, str(temp_dir)],
        text=True, encoding="utf-8", errors="replace", capture_output=True,
        timeout=120,
        env=_git_env(),
    )

    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        if "not found" in stderr.casefold() or "Could not find" in stderr:
            return {"valid_marker": False, "is_empty": True,
                    "reason": "empty repository (no main branch)"}
        return {"valid_marker": False, "reason": f"clone failed: {stderr[:400]}"}

    lib_path = temp_dir / "library.json"
    if not lib_path.is_file():
        return {"valid_marker": False, "reason": "no library.json; not a skill save repository"}

    try:
        library = json.loads(lib_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return {"valid_marker": False, "reason": f"library.json is not valid: {exc}"}

    if library.get("marker") != REMOTE_MARKER:
        return {
            "valid_marker": False,
            "reason": f"marker mismatch: expected {REMOTE_MARKER!r}, got {library.get('marker')!r}",
        }

    schema_version = library.get("schema_version")
    if schema_version not in SUPPORTED_REMOTE_SCHEMA_VERSIONS:
        return {
            "valid_marker": False,
            "reason": f"unsupported schema version: {schema_version}",
        }

    try:
        diag = verify_portable_repo(temp_dir)
    except RemoteError as exc:
        return {"valid_marker": False, "reason": f"validation failed: {exc}"}

    return {
        "valid_marker": True,
        "item_count": len(diag.get("catalog_ids", [])),
        "catalog_ids": diag.get("catalog_ids", []),
        "schema_version": schema_version,
        "valid": diag.get("valid", False),
    }


def create_private_repo(login: str, local_repo: Path) -> dict[str, Any]:
    """Create a new private paseo_skill_save repository on GitHub.

    Initializes the local repo with the marker library.json and pushes it.
    """
    if local_repo.exists():
        return {"status": "create-failed", "code": "unmanaged-local-destination",
                "detail": f"refusing to replace existing path: {local_repo}"}

    proc = _gh(
        ["repo", "create", f"{login}/{REMOTE_REPO_NAME}", "--private",
         "--description", "Private skillNload portable library backup",
        ],
        timeout=60,
    )
    if proc.returncode != 0:
        return {"status": "create-failed", "code": "github-create-failed",
                "stderr": proc.stderr.strip()[:400]}

    library = {
        "marker": REMOTE_MARKER,
        "schema_version": REMOTE_SCHEMA_VERSION,
        "generated_at": _utc_now(),
        "item_count": 0,
        "catalog_ids": [],
    }

    local_repo.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "-C", str(local_repo), "init", "--quiet"],
                   capture_output=True, env=_git_env())
    subprocess.run(["git", "-C", str(local_repo), "config", "core.symlinks", "false"],
                   capture_output=True, env=_git_env())
    subprocess.run(["git", "-C", str(local_repo), "branch", "-M", "main"],
                   capture_output=True, env=_git_env())

    (local_repo / "catalog" / "items").mkdir(parents=True, exist_ok=True)
    (local_repo / "objects").mkdir(parents=True, exist_ok=True)

    (local_repo / "library.json").write_text(
        json.dumps(library, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8", newline="\n",
    )

    subprocess.run(["git", "-C", str(local_repo), "add", "library.json", "catalog", "objects"],
                   capture_output=True, env=_git_env())
    subprocess.run(
        ["git", "-C", str(local_repo), "-c", "user.email=skillhub@local",
         "-c", "user.name=skillhub", "commit", "--quiet", "-m",
         "initialize paseo_skill_save"],
        capture_output=True, env=_git_env(),
    )

    remote_url = f"https://github.com/{login}/{REMOTE_REPO_NAME}.git"
    subprocess.run(["git", "-C", str(local_repo), "remote", "add", "skill-save", remote_url],
                   capture_output=True, env=_git_env())
    push = subprocess.run(
        ["git", "-C", str(local_repo), "push", "--quiet", "-u", "skill-save", "main"],
        capture_output=True, timeout=60, env=_git_env(),
    )

    if push.returncode != 0:
        return {"status": "push-failed", "code": "github-push-failed",
                "stderr": push.stderr.strip()[:400]}

    return {
        "status": "created",
        "remote": remote_url,
        "branch": "main",
        "login": login,
        "repo": f"{login}/{REMOTE_REPO_NAME}",
    }


def _utc_now() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def initialize_empty_private_repo(remote_url: str, local_repo: Path) -> dict[str, Any]:
    """Initialize an empty private repo with the marker and push."""
    if local_repo.exists():
        return {"status": "init-failed", "code": "unmanaged-local-destination",
                "detail": f"refusing to replace existing path: {local_repo}"}
    library = {
        "marker": REMOTE_MARKER,
        "schema_version": REMOTE_SCHEMA_VERSION,
        "generated_at": _utc_now(),
        "item_count": 0,
        "catalog_ids": [],
    }

    local_repo.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "-C", str(local_repo), "init", "--quiet"],
                   capture_output=True, env=_git_env())
    subprocess.run(["git", "-C", str(local_repo), "config", "core.symlinks", "false"],
                   capture_output=True, env=_git_env())
    subprocess.run(["git", "-C", str(local_repo), "branch", "-M", "main"],
                   capture_output=True, env=_git_env())

    (local_repo / "catalog" / "items").mkdir(parents=True, exist_ok=True)
    (local_repo / "objects").mkdir(parents=True, exist_ok=True)

    (local_repo / "library.json").write_text(
        json.dumps(library, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8", newline="\n",
    )

    subprocess.run(["git", "-C", str(local_repo), "add", "library.json", "catalog", "objects"],
                   capture_output=True, env=_git_env())
    subprocess.run(
        ["git", "-C", str(local_repo), "-c", "user.email=skillhub@local",
         "-c", "user.name=skillhub", "commit", "--quiet", "-m",
         "initialize paseo_skill_save"],
        capture_output=True, env=_git_env(),
    )

    subprocess.run(["git", "-C", str(local_repo), "remote", "add", "skill-save", remote_url],
                   capture_output=True, env=_git_env())
    push = subprocess.run(
        ["git", "-C", str(local_repo), "push", "--quiet", "-u", "skill-save", "main"],
        capture_output=True, timeout=60, env=_git_env(),
    )

    if push.returncode != 0:
        return {"status": "init-failed", "code": "github-push-failed",
                "stderr": push.stderr.strip()[:400]}

    return {"status": "initialized", "remote": remote_url}


def onboard_github(work_dir: Path) -> dict[str, Any]:
    """Run the full GitHub onboarding flow.

    Steps:
    1. detect gh
    2. check auth
    3. setup-git
    4. identify account
    5. inspect repo via gh CLI
    6. if 404 -> create private; if exists+empty -> initialize with marker;
       if exists+nonempty -> clone and validate marker; refuse public/archived

    Returns a structured JSON dict with status, remote_url, and details.
    """
    if not detect_gh():
        return {"status": "error", "code": "github-cli-not-found",
                "command": "install gh CLI from https://cli.github.com"}

    auth = check_auth()
    if not auth["authenticated"]:
        return {"status": "error", **auth}

    setup_proc = _gh(
        ["auth", "setup-git", "--hostname", "github.com"],
        use_user_git_config=True,
    )
    if setup_proc.returncode != 0:
        return {
            "status": "error",
            "code": "github-setup-git-failed",
            "stderr": setup_proc.stderr.strip()[:400],
        }

    account = identify_account()
    if not account.get("login"):
        return {"status": "error", **account}

    login = account["login"]
    remote_url = f"https://github.com/{login}/{REMOTE_REPO_NAME}.git"

    inspect = inspect_repo(login)
    if inspect.get("refused"):
        return {
            "status": "error",
            "code": f"github-repo-refused-{inspect.get('reason', 'unknown')}",
            "detail": inspect,
        }

    if not inspect.get("exists"):
        code = inspect.get("code", "github-error")
        if code == "not-found":
            local_repo = work_dir / "remote-repo"
            return create_private_repo(login, local_repo)
        else:
            return {
                "status": "error",
                "code": code,
                "detail": inspect.get("detail", "unknown error"),
            }

    if not inspect.get("is_private"):
        return {
            "status": "error",
            "code": "github-repo-refused-public",
            "detail": f"{login}/{REMOTE_REPO_NAME} is public; must be private",
        }

    local_repo = work_dir / "remote-repo"

    if inspect.get("is_empty") is True:
        result = initialize_empty_private_repo(remote_url, local_repo)
        if result.get("status") == "initialized":
            return {
                "status": "ready",
                "remote": remote_url,
                "login": login,
                "repo": f"{login}/{REMOTE_REPO_NAME}",
                "action": "empty-repo-initialized",
            }
        return {"status": "error", "code": "empty-repo-init-failed",
                "detail": result}

    validated_remote_url = validate_remote_url(remote_url)
    if validated_remote_url is None:
        return {"status": "error", "code": "bad-remote-url",
                "detail": f"invalid remote URL: {remote_url}"}

    with tempfile.TemporaryDirectory(prefix="gh-validate-") as tmp_name:
        tmp_dir = Path(tmp_name)
        clone_result = clone_and_validate_marker(validated_remote_url, tmp_dir)
        if not clone_result.get("valid_marker"):
            if clone_result.get("is_empty"):
                result = initialize_empty_private_repo(validated_remote_url, local_repo)
                if result.get("status") == "initialized":
                    return {
                        "status": "ready",
                        "remote": validated_remote_url,
                        "login": login,
                        "repo": f"{login}/{REMOTE_REPO_NAME}",
                        "action": "empty-repo-initialized",
                    }
                return {"status": "error", "code": "empty-repo-init-failed",
                        "detail": result}
            return {
                "status": "error",
                "code": "github-repo-refused-nonempty-markerless",
                "detail": f"repository exists but has no valid marker: {clone_result.get('reason')}",
            }

        return {
            "status": "ready",
            "remote": validated_remote_url,
            "login": login,
            "repo": f"{login}/{REMOTE_REPO_NAME}",
            "action": "existing-repo-reused",
            "marker_validation": {
                "valid": True,
                "item_count": clone_result.get("item_count", 0),
            },
        }


def clone_remote(remote_url: str, local_repo: Path) -> dict[str, Any]:
    """Clone a remote paseo_skill_save repository for local sync."""
    validated = validate_remote_url(remote_url)
    if validated is None:
        return {"status": "clone-failed", "stderr": f"invalid remote URL: {remote_url}"}

    if local_repo.exists():
        return {"status": "clone-refused-existing-path",
                "stderr": f"refusing to replace existing path: {local_repo}"}

    proc = subprocess.run(
        ["git", "clone", "--quiet", "--branch", "main", validated, str(local_repo)],
        text=True, encoding="utf-8", errors="replace", capture_output=True,
        timeout=120, env=_git_env(),
    )

    if proc.returncode != 0:
        return {"status": "clone-failed", "stderr": proc.stderr.strip()[:400]}

    try:
        diag = verify_portable_repo(local_repo)
    except RemoteError as exc:
        # The clone directory only exists because this function created it;
        # remove this untrusted staging result rather than leave it usable.
        shutil.rmtree(str(local_repo), ignore_errors=True)
        return {"status": "clone-invalid-remote", "stderr": str(exc)}
    if not diag.get("valid"):
        shutil.rmtree(str(local_repo), ignore_errors=True)
        return {"status": "clone-invalid-remote", "stderr": "remote validation failed"}

    subprocess.run(
        ["git", "-C", str(local_repo), "remote", "add", "skill-save", validated],
        capture_output=True, env=_git_env(),
    )

    return {"status": "cloned", "path": str(local_repo), "remote": validated}
