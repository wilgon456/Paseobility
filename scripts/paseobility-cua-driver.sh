#!/usr/bin/env bash
# Ensure the trycua Cua Driver exists for the paseo-cua skill.
#
# Idempotent: reuses an existing working cua-driver and never auto-upgrades it.
# A candidate that exists but fails `cua-driver --version` is reported as broken
# and left untouched (exit 5); it is never overwritten or upgraded.
#
# Downloads the pinned upstream installer scripts (install.sh plus the two
# helpers it delegates to) into a local temporary directory and runs them
# there, so the delegated _install-rust.sh is the pinned copy rather than a
# rolling fetch (never a blind `curl | bash`). It never edits shell rc or
# registers MCP config, and it never starts the driver daemon.
#
# Pinned upstream source reviewed at PIN_SHA (libs/cua-driver/scripts/):
#   install.sh, _install-rust.sh — they resolve/download a release and call the
#   daemon-stop helpers (`stop_cua_driver_daemons`, `show_cua_driver_daemon_survivors`);
#   neither starts a daemon, so this helper cannot either. OS permission grants
#   stay manual, and binary presence is not permission readiness.
set -euo pipefail

PIN_VERSION="${PASEOBILITY_CUA_PIN_VERSION:-0.28.2}"
PIN_SHA="${PASEOBILITY_CUA_PIN_SHA:-9bbfa7dd3e27ca7f1861ede70aaca390174493f9}"
RAW_BASE="${PASEOBILITY_CUA_RAW_BASE:-https://raw.githubusercontent.com/trycua/cua/${PIN_SHA}/libs/cua-driver/scripts}"
BIN_DIR="${PASEOBILITY_CUA_BIN_DIR:-$HOME/.local/bin}"
INSTALLER_DIR="${PASEOBILITY_CUA_INSTALLER_DIR:-}"
DRIVER_BIN="${PASEOBILITY_CUA_DRIVER_BIN:-}"
# Optional expected SHA-256 digests for the pinned installer scripts. When set,
# a mismatch aborts before execution. Upstream publishes no checksums, so these
# are only checked when an operator supplies them out of band.
EXPECT_INSTALL="${PASEOBILITY_CUA_INSTALL_SHA256:-}"
EXPECT_RUST="${PASEOBILITY_CUA_RUST_SHA256:-}"
EXPECT_COMMON="${PASEOBILITY_CUA_COMMON_SHA256:-}"
PINNED_FILES="install.sh _install-rust.sh _install-common.sh"
MODE="ensure"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: paseobility-cua-driver.sh [--check] [--dry-run] [--bin-dir DIR] [--version V]

Ensures the trycua Cua Driver (cua-driver) is installed and reused. It does not
upgrade an existing driver, start the daemon, edit shell rc, or register MCP.

A candidate that exists but fails `cua-driver --version` is reported as broken
and left untouched (exit 5) rather than being overwritten or upgraded.

Options:
  --check         Report presence only; do not install (exit 3 when missing)
  --dry-run       Print the install plan without downloading or executing
  --bin-dir DIR   Visible binary directory (default ~/.local/bin)
  --version V     Pinned Cua Driver version to install (default 0.28.2)

Test hooks (environment):
  PASEOBILITY_CUA_INSTALLER_DIR   Use this directory's installer scripts
                                  instead of downloading the pinned ones.
  PASEOBILITY_CUA_RAW_BASE        Base URL for the pinned installer scripts.
  PASEOBILITY_CUA_DRIVER_BIN      Treat this path as the installed binary.
  PASEOBILITY_CUA_BIN_DIR         Same as --bin-dir.
  PASEOBILITY_CUA_INSTALL_SHA256  Expected digest of install.sh.
  PASEOBILITY_CUA_RUST_SHA256     Expected digest of _install-rust.sh.
  PASEOBILITY_CUA_COMMON_SHA256   Expected digest of _install-common.sh.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --bin-dir) BIN_DIR="${2:?--bin-dir requires a path}"; shift 2 ;;
    --version) PIN_VERSION="${2:?--version requires a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# Print the candidate path if an executable exists; existence only. Whether it
# actually works is decided by driver_version.
detect_driver() {
  if [ -n "$DRIVER_BIN" ] && [ -x "$DRIVER_BIN" ]; then
    printf '%s\n' "$DRIVER_BIN"
    return 0
  fi
  if command -v cua-driver >/dev/null 2>&1; then
    command -v cua-driver
    return 0
  fi
  if [ -x "$BIN_DIR/cua-driver" ]; then
    printf '%s\n' "$BIN_DIR/cua-driver"
    return 0
  fi
  return 1
}

# Print the first --version line when `--version` exits 0 with output. Returns
# nonzero for a broken candidate, an empty output, or a missing executable.
driver_version() {
  local out=""
  out="$("$1" --version 2>/dev/null | head -n 1)" || out=""
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    return 1
  fi
}

expected_digest() {
  case "$1" in
    install.sh) printf '%s' "$EXPECT_INSTALL" ;;
    _install-rust.sh) printf '%s' "$EXPECT_RUST" ;;
    _install-common.sh) printf '%s' "$EXPECT_COMMON" ;;
    *) printf '' ;;
  esac
}

verify_digest() {
  local name="$1" path="$2" expected actual
  expected="$(expected_digest "$name")"
  [ -n "$expected" ] || return 0
  actual="$(sha256_of "$path" || true)"
  if [ -z "$actual" ]; then
    echo "[cua-driver] no sha256 tool available to verify $name" >&2
    return 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "[cua-driver] digest mismatch for $name (expected $expected, got $actual)" >&2
    return 1
  fi
  printf '[cua-driver] verified pinned digest for %s\n' "$name"
}

report_digests() {
  local name path
  printf '[cua-driver] installer digests (pinned %s):\n' "$PIN_SHA"
  for name in $PINNED_FILES; do
    path="$1/$name"
    if [ -f "$path" ]; then
      printf '  %s  %s\n' "$(sha256_of "$path" || printf 'unavailable')" "$name"
    fi
  done
}

if candidate="$(detect_driver)"; then
  if version="$(driver_version "$candidate")"; then
    printf '[cua-driver] present: %s (%s)\n' "$candidate" "$version"
    exit 0
  fi
  printf '[cua-driver] %s exists but `cua-driver --version` failed; treating it as broken and leaving it untouched.\n' "$candidate" >&2
  printf '[cua-driver] fix or remove it, or pass --skip-cua-driver for a skills-only install; this helper will not overwrite or upgrade it.\n' >&2
  exit 5
fi

if [ "$MODE" = "check" ]; then
  printf '[cua-driver] missing (not on PATH and not at %s/cua-driver)\n' "$BIN_DIR"
  exit 3
fi

printf '[cua-driver] not found; installing pinned Cua Driver %s\n' "$PIN_VERSION"

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[cua-driver] dry-run: would fetch pinned installer scripts at %s and run install.sh --no-modify-path --bin-dir %s\n' "$PIN_SHA" "$BIN_DIR"
  exit 0
fi

tmp=""
cleanup() { if [ -n "$tmp" ]; then rm -rf "$tmp"; fi; }
trap cleanup EXIT

if [ -n "$INSTALLER_DIR" ]; then
  src="$INSTALLER_DIR"
  [ -f "$src/install.sh" ] || { echo "[cua-driver] installer script missing: $src/install.sh" >&2; exit 4; }
  printf '[cua-driver] using provided installer dir %s\n' "$src"
else
  if ! command -v curl >/dev/null 2>&1; then
    echo "[cua-driver] curl not found; cannot download the installer (pass --skip-cua-driver for a skills-only install)" >&2
    exit 4
  fi
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/paseobility-cua.XXXXXX")"
  src="$tmp"
  for f in $PINNED_FILES; do
    if ! curl -fsSL "$RAW_BASE/$f" -o "$src/$f"; then
      echo "[cua-driver] failed to download $f from pinned commit $PIN_SHA" >&2
      exit 4
    fi
    [ -s "$src/$f" ] || { echo "[cua-driver] downloaded file is empty: $f" >&2; exit 4; }
    verify_digest "$f" "$src/$f" || exit 4
  done
fi

report_digests "$src"

mkdir -p "$BIN_DIR"
if ! CUA_DRIVER_RS_VERSION="$PIN_VERSION" CUA_DRIVER_RS_NO_MODIFY_PATH=1 \
     bash "$src/install.sh" --no-modify-path --bin-dir "$BIN_DIR"; then
  echo "[cua-driver] runtime setup failed: the upstream installer exited non-zero; installation may be incomplete (partial files possible)." >&2
  exit 4
fi

if candidate="$(detect_driver)"; then
  if version="$(driver_version "$candidate")"; then
    printf '[cua-driver] installed: %s (%s)\n' "$candidate" "$version"
    exit 0
  fi
  printf '[cua-driver] runtime setup failed: cua-driver exists at %s but `--version` failed; installation may be incomplete (partial files possible).\n' "$candidate" >&2
  exit 4
fi

printf '[cua-driver] runtime setup failed: cua-driver is not visible on PATH or at %s after install; installation may be incomplete (partial files possible).\n' "$BIN_DIR" >&2
exit 4
