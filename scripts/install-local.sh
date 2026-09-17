#!/usr/bin/env bash
# scripts/install-local.sh — populate OpenCode plugin cache with a symlink to this working tree.
#
# Why: OpenCode 1.17.x resolves plugins ONLY from ~/.cache/opencode/packages/<scope>/<name>@<version>/node_modules/<name>/.
# `npm link` and `package.json` `file:` references do NOT work for this. Discovered 2026-07-09 while smoke-testing.
# This script is the single command that replaces ~15 min of manual cache surgery.
#
# Usage:
#   ./scripts/install-local.sh                  # install current version
#   ./scripts/install-local.sh --uninstall      # remove symlinks we created
#   ./scripts/install-local.sh --reinstall     # uninstall + install
#
# After install, add to your ~/.config/opencode/opencode.json (or project opencode.json):
#   "plugin": ["@grudanov-nikolay/agenttrace-opencode-plugin@<version>"]
#
# The script is idempotent: re-running just refreshes the symlink.

set -euo pipefail

# --- arg parsing ---
MODE="install"
for arg in "$@"; do
  case "$arg" in
    --uninstall)  MODE="uninstall" ;;
    --reinstall)  MODE="reinstall" ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

# --- derive paths from package.json ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_JSON="$REPO_ROOT/package.json"

if [ ! -f "$PKG_JSON" ]; then
  echo "ERROR: $PKG_JSON not found. Run this from the repo root, or fix the script." >&2
  exit 1
fi

# Read name and version from package.json via node (node is required for OpenCode anyway)
PKG_NAME=$(node -e "process.stdout.write(require('$PKG_JSON').name)")
PKG_VERSION=$(node -e "process.stdout.write(require('$PKG_JSON').version)")

# Extract scope (e.g. "@grudanov-nikolay/agenttrace-opencode-plugin" -> "@grudanov-nikolay")
if [[ "$PKG_NAME" != @*/* ]]; then
  echo "ERROR: package name must be scoped (got: $PKG_NAME). This script assumes OpenCode cache layout for scoped packages." >&2
  exit 1
fi
SCOPE="${PKG_NAME%%/*}"  # "@grudanov-nikolay"
NAME="${PKG_NAME#*/}"    # "agenttrace-opencode-plugin"

CACHE_ROOT="${HOME}/.cache/opencode/packages"
CACHE_PKG_DIR="$CACHE_ROOT/$SCOPE/$NAME@$PKG_VERSION"
CACHE_PKG_LINK="$CACHE_PKG_DIR/node_modules/$SCOPE/$NAME"
TRACE_LOG="${HOME}/.raindrop/trace.log"

# --- helpers ---
log() { printf '[install-local] %s\n' "$*"; }

uninstall() {
  log "Removing $CACHE_PKG_LINK"
  if [ -L "$CACHE_PKG_LINK" ]; then
    rm "$CACHE_PKG_LINK"
    log "  ✓ symlink removed"
  elif [ -e "$CACHE_PKG_LINK" ]; then
    echo "  ! $CACHE_PKG_LINK exists but is not a symlink (probably a real dir from `npm install`). Not removing — please clean manually if you want a symlink." >&2
  else
    log "  (nothing to remove)"
  fi
  # Try to remove empty parent dirs
  rmdir "$CACHE_PKG_DIR/node_modules/$SCOPE" 2>/dev/null || true
  rmdir "$CACHE_PKG_DIR/node_modules" 2>/dev/null || true
  rmdir "$CACHE_PKG_DIR" 2>/dev/null || true
  rmdir "$CACHE_ROOT/$SCOPE" 2>/dev/null || true
}

install() {
  log "Installing $PKG_NAME@$PKG_VERSION"
  log "  repo:  $REPO_ROOT"
  log "  cache: $CACHE_PKG_DIR"
  mkdir -p "$CACHE_PKG_DIR/node_modules/$SCOPE"
  # If target exists and is a symlink, replace; if it's a real dir, refuse.
  if [ -L "$CACHE_PKG_LINK" ]; then
    rm "$CACHE_PKG_LINK"
  elif [ -e "$CACHE_PKG_LINK" ]; then
    echo "  ! $CACHE_PKG_LINK exists and is not a symlink. Move it aside, then re-run." >&2
    exit 1
  fi
  ln -s "$REPO_ROOT" "$CACHE_PKG_LINK"
  # OpenCode resolves plugin entries as `<pkg>@<version>` and looks for
  # `<cache>/package.json` at the package root. Without it the plugin is
  # silently skipped. Copy the repo's package.json (idempotent).
  cp -f "$PKG_JSON" "$CACHE_PKG_DIR/package.json"
  log "  ✓ symlinked $CACHE_PKG_LINK -> $REPO_ROOT"
  log "  ✓ copied   $CACHE_PKG_DIR/package.json"
  log ""
  log "Next: ensure your opencode config lists this plugin:"
  log "  ~/.config/opencode/opencode.json:"
  log '    "plugin": ["'"$PKG_NAME@$PKG_VERSION"'"]'
  log ""
  log "Then start OpenCode and check that 'Loading $PKG_NAME v$PKG_VERSION' appears."
  log "Trace logs (if F-002.6 trace_only enabled): $TRACE_LOG"
}

# --- dispatch ---
case "$MODE" in
  install)   install ;;
  uninstall) uninstall ;;
  reinstall) uninstall; install ;;
esac
