#!/bin/bash
# First-run setup, driven entirely by dialogs. Launched by
# "Install Feedback Assistant.app". Safe to run more than once.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/app-lib.sh"

init_log "setup"

PROJECT_DIR="$(find_project_dir)" || {
  say "I couldn't find the Feedback Assistant folder.

Keep this installer inside that folder and try again." caution
  exit 1
}
log "project: $PROJECT_DIR"
cd "$PROJECT_DIR" || fail "Could not open the Feedback Assistant folder."

PROVIDER="$(detect_provider "$PROJECT_DIR")"
PROVIDER_LABEL="$(provider_label "$PROVIDER")"
PROVIDER_CMD="$(provider_command "$PROVIDER")"
log "provider: $PROVIDER"

# ---------------------------------------------------------------------------
# Welcome — state the cost and the account requirement up front, not at the end
# ---------------------------------------------------------------------------

if [ "$PROVIDER" = "gemini" ]; then
  ACCOUNT_LINE="• your @thekaustschool.org Google account — not a personal Gmail. You'll sign in at the end"
else
  ACCOUNT_LINE="• a paid Claude account (Pro or Max) — the free Claude plan will NOT work"
fi

ask "This sets up Feedback Assistant on this Mac.

It takes about five minutes and needs an internet connection. You won't have to type anything.

What it installs, all inside your own user folder — no administrator password needed:
• Node.js, the engine the app runs on
• the $PROVIDER_LABEL command-line tool, which does the AI marking

You'll also need:
$ACCOUNT_LINE

Nothing already on this Mac is changed or removed." "Install" "Not now" \
  || { log "declined at welcome"; exit 0; }

# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

progress "Step 1 of 4 — checking for Node.js…"

if ensure_node_on_path; then
  log "existing Node is fine, skipping download"
else
  progress "Step 1 of 4 — downloading Node.js (about 50 MB)…"
  install_private_node || fail "Node.js could not be downloaded.

The usual cause is no internet connection, or a school network that blocks nodejs.org."
  ensure_node_on_path || fail "Node.js was downloaded but will not run on this Mac."
fi
abort_if_cancelled

# ---------------------------------------------------------------------------
# Dependencies + build
# ---------------------------------------------------------------------------

progress "Step 2 of 4 — installing the app's components…
This is the slowest part. Please leave it running."

run_logged npm install --no-audit --no-fund || fail "The app's components could not be installed.

If this Mac is on a school network, it may be blocking the download."
abort_if_cancelled

# Must happen before the build and before the app is ever started. This file is
# the only thing selecting the backend now, so a failure here is fatal: carrying
# on would install one CLI and run the other.
if ! configure_provider_env "$PROJECT_DIR" "$PROVIDER"; then
  fail "Could not record which AI to use.

The Feedback Assistant folder may be read-only, or on a disk that is full."
fi

progress "Step 3 of 4 — preparing the app…"
run_logged npm run build || fail "The app could not be prepared.

This usually means a component failed to install correctly."
abort_if_cancelled

# ---------------------------------------------------------------------------
# AI command-line tool
# ---------------------------------------------------------------------------

progress "Step 4 of 4 — installing the $PROVIDER_LABEL tool…"

if [ "$PROVIDER" = "unknown" ]; then
  log "no backend identified; skipping CLI install"
  CLI_PATH=""
else
  if ! CLI_PATH="$(locate_cli "$PROVIDER_CMD")"; then
    install_provider_cli "$PROVIDER" || log "provider CLI install returned non-zero"
    CLI_PATH="$(locate_cli "$PROVIDER_CMD" || true)"
  fi
fi
progress_done

# ---------------------------------------------------------------------------
# Sign-in, then done
# ---------------------------------------------------------------------------

SIGNIN_NOTE=""
[ "$PROVIDER" = "gemini" ] && SIGNIN_NOTE="

Choose your @thekaustschool.org school account, not a personal Gmail. Student work may only go through the school account, and the app refuses to send anything from any other."

if [ -n "$CLI_PATH" ]; then
  log "cli at $CLI_PATH"
  answer="$(choose "Almost done.

One last step: sign in to $PROVIDER_LABEL. A terminal window will open and run the sign-in for you — just follow the prompts in your browser, then close that window.$SIGNIN_NOTE

You can also do this later; the app works without it, but the AI marking won't." "Skip for now" "Sign in now")"
  if [ "$answer" = "Sign in now" ]; then
    open_signin_terminal "$CLI_PATH" || say "I couldn't open the sign-in window automatically.

Open Terminal and run:  $CLI_PATH" caution
  fi
else
  say "Setup finished, but the $PROVIDER_LABEL tool could not be installed.

Everything else works — classes, the gradebook, reviewing marks and exports. Only the AI marking is unavailable until that tool is installed." caution
fi

log "setup complete"

answer="$(choose "Feedback Assistant is ready.

From now on, open it with the 'Feedback Assistant' icon in this folder. You only ever need this installer once." "Done" "Open it now")"
if [ "$answer" = "Open it now" ]; then
  /usr/bin/open "$PROJECT_DIR/Feedback Assistant.app" 2>/dev/null \
    || run_logged bash "$HERE/app-launch.sh"
fi
exit 0
