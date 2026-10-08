#!/bin/bash
# Brings this copy up to the latest published release, keeping every class,
# student, scan, mark and report. Run by "Update Feedback Assistant.app".
#
# A colleague's copy has no git: it downloads the release published to the
# public release repository (see app-publish.sh), replaces the app's code with
# it, and rebuilds. data/, logs/, the AI setting in .env.local and the installed
# components are never touched. If the new version fails to build, the old code
# is put back and rebuilt, so a bad update cannot leave the app unable to start.
#
# The maintainer's own copies are git checkouts and pull from the private
# repository instead, as Update.command always has.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/app-lib.sh"

# This script is part of what gets replaced. bash reads a script as it runs, so
# overwriting it mid-run would execute half of one version and half of the
# next; it reruns itself from a private copy first.
if [ -z "${FA_UPDATE_RELAUNCHED:-}" ]; then
  PROJECT_DIR="$(find_project_dir)" || {
    say "I couldn't find the Feedback Assistant folder.

Keep this icon inside that folder and try again." caution
    exit 1
  }
  RUN_DIR="$(mktemp -d)"
  cp "$HERE/app-update.sh" "$HERE/app-lib.sh" "$RUN_DIR/" || exit 1
  FA_UPDATE_RELAUNCHED="$RUN_DIR" FA_PROJECT_DIR="$PROJECT_DIR" exec /bin/bash "$RUN_DIR/app-update.sh"
fi

init_log "update"

PROJECT_DIR="$FA_PROJECT_DIR"
cd "$PROJECT_DIR" || fail "Could not open the Feedback Assistant folder."
log "project: $PROJECT_DIR"

PORT="${FA_PORT:-3000}"
URL="http://localhost:$PORT"
WORK="$(mktemp -d)"
# The private copy of this script goes too; it is only ever a mktemp folder.
trap 'rm -rf "$WORK" "$FA_UPDATE_RELAUNCHED"' EXIT

ensure_node_on_path || fail "The app's engine (Node.js) is missing. Run Install Feedback Assistant again; nothing you have marked will be lost."

stop_server() {
  local pids
  pids="$(/usr/sbin/lsof -ti "tcp:$PORT" 2>/dev/null || true)"
  [ -n "$pids" ] && { kill $pids 2>/dev/null || true; sleep 1; }
}

rebuild() {
  run_logged npm install --no-audit --no-fund && run_logged npm run build
}

# ---------------------------------------------------------------------------
# The maintainer's copies: pull from the private repository
# ---------------------------------------------------------------------------

if [ -d .git ]; then
  progress "Fetching the latest code…"
  run_logged git pull --ff-only || fail "The update could not be fetched. There may be local changes."
  progress "Rebuilding…"
  stop_server
  rebuild || fail "The update was fetched but the app could not be rebuilt."
  progress_done
  headless || /usr/bin/open "$PROJECT_DIR/Feedback Assistant.app" 2>/dev/null || true
  exit 0
fi

# ---------------------------------------------------------------------------
# A colleague's copy: download the latest release
# ---------------------------------------------------------------------------

progress "Checking for an update…"
ARCHIVE="$WORK/release.tar.gz"
# FA_RELEASE_URL lets a test point this at a local archive instead.
RELEASE_ARCHIVE_URL="${FA_RELEASE_URL:-https://codeload.github.com/$RELEASE_REPO/tar.gz/refs/heads/main}"
if ! /usr/bin/curl -fsSL --max-time 300 -o "$ARCHIVE" "$RELEASE_ARCHIVE_URL" 2>>"$LOG_FILE"; then
  fail "The update could not be downloaded.

Check the internet connection and try again. A school network can block GitHub."
fi
mkdir -p "$WORK/new" && /usr/bin/tar -xzf "$ARCHIVE" -C "$WORK/new" 2>>"$LOG_FILE" \
  || fail "The update downloaded but could not be opened."
NEW="$(find "$WORK/new" -mindepth 1 -maxdepth 1 -type d | head -1)"

# Only ever replace this app with this app.
if ! looks_like_project "$NEW" || [ ! -d "$NEW/app" ] || [ ! -d "$NEW/lib" ]; then
  fail "The download is not a Feedback Assistant release, so nothing was changed."
fi

CURRENT_VERSION="$(cat "$PROJECT_DIR/VERSION" 2>/dev/null || echo "unknown")"
NEW_VERSION="$(cat "$NEW/VERSION" 2>/dev/null || echo "unknown")"
log "current $CURRENT_VERSION, release $NEW_VERSION"
progress_done

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  say "You already have the latest version ($CURRENT_VERSION)."
  exit 0
fi

ask "A new version is available ($NEW_VERSION).

Updating takes a few minutes. Your classes, students, scans, marks and reports are kept exactly as they are." "Update" "Not now" || exit 0

# The app's own files: replaced wholesale. Everything else in the folder —
# data/, logs/, .env.local, node_modules/ — is left alone.
CODE_DIRS=(app lib public scripts specs)
CODE_FILES=(
  package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs
  AGENTS.md CLAUDE.md README.md "SETUP - START HERE.md" VERSION
)
APP_BUNDLES=("Install Feedback Assistant.app" "Feedback Assistant.app" "Update Feedback Assistant.app")

copy_code() { # $1 from, $2 to
  local item
  for item in "${CODE_DIRS[@]}" "${APP_BUNDLES[@]}"; do
    if [ -d "$1/$item" ]; then
      mkdir -p "$2/$item" && /usr/bin/rsync -a --delete "$1/$item/" "$2/$item/" || return 1
    else
      rm -rf "${2:?}/$item"
    fi
  done
  for item in "${CODE_FILES[@]}"; do
    if [ -f "$1/$item" ]; then cp "$1/$item" "$2/$item" || return 1; else rm -f "${2:?}/$item"; fi
  done
}

progress "Updating to $NEW_VERSION…
This is the slow part. Please leave it running."
BACKUP="$WORK/previous"
mkdir -p "$BACKUP" && copy_code "$PROJECT_DIR" "$BACKUP" || fail "Could not set aside the current version, so nothing was changed."
stop_server

if copy_code "$NEW" "$PROJECT_DIR" && rebuild; then
  progress_done
  log "updated to $NEW_VERSION"
  say "Updated to $NEW_VERSION. Opening Feedback Assistant…"
  headless || /usr/bin/open "$PROJECT_DIR/Feedback Assistant.app" 2>/dev/null || true
  exit 0
fi

# Put the old version back rather than leave an app that will not start.
log "update failed; restoring $CURRENT_VERSION"
progress "The update did not work. Putting the previous version back…"
copy_code "$BACKUP" "$PROJECT_DIR" && rebuild
progress_done
fail "The update could not be installed, so the previous version was put back. Nothing you have marked was affected."
