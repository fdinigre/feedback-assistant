#!/bin/bash
# Shared helpers for the double-clickable Feedback Assistant apps.
#
# These run when Finder launches a .app bundle, which means: no login profile is
# sourced, no terminal is attached, and stdout goes somewhere nobody will ever
# look. So everything a person needs to see goes through osascript dialogs, and a
# full transcript goes to a log file that can be sent on for help.
#
# Every UI call is best-effort. A dialog that fails to draw must never be the
# reason a setup fails.

APP_TITLE="Feedback Assistant"
NODE_FALLBACK_VERSION="v22.23.2"   # used only when nodejs.org can't be reached
NODE_MIN_MAJOR=20                  # Next.js 16 needs 20+; older we replace
SUPPORT_DIR="$HOME/Library/Application Support/Feedback Assistant"
PRIVATE_NODE_DIR="$SUPPORT_DIR/node"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FILE="/tmp/feedback-assistant.log"

# Logs go in the project folder's logs/ directory. ~/Library/Application Support
# is hidden in Finder and awkward to reach, which makes "send me the log"
# needlessly hard for the exact person most likely to need it.
init_log() {
  local dir="${FA_PROJECT_DIR:-$SUPPORT_DIR}/logs"
  mkdir -p "$dir" 2>/dev/null || dir="$SUPPORT_DIR"
  mkdir -p "$dir" 2>/dev/null || true
  LOG_FILE="$dir/${1:-setup}.log"
  : > "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/feedback-assistant-${1:-setup}.log"
  {
    echo "=== $APP_TITLE — ${1:-setup} — $(date) ==="
    echo "macOS $(sw_vers -productVersion 2>/dev/null) on $(uname -m)"
  } >> "$LOG_FILE" 2>&1
}

log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOG_FILE" 2>&1; }

# Runs a command with all output captured. Returns the command's exit status.
run_logged() {
  log "RUN: $*"
  "$@" >> "$LOG_FILE" 2>&1
  local status=$?
  log "EXIT $status"
  return $status
}

# ---------------------------------------------------------------------------
# Dialogs
# ---------------------------------------------------------------------------

# AppleScript string literals need backslashes and double quotes escaped.
as_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# "tell me to activate" brings osascript's OWN dialog to the front. Going
# through System Events would do the same but needs Automation permission,
# which is one more thing macOS can silently refuse.
#
# Each helper falls back to plain text on the terminal if AppleScript is
# unavailable or refused, because these scripts may be relayed through Terminal
# when macOS blocks the app from reading a protected folder.

have_tty() { [ -t 0 ] && [ -t 1 ]; }

# FA_HEADLESS=1 answers every question with its first, safe-for-a-test choice
# and draws nothing: confirm in ask(), the left button in choose(). Only for
# exercising these scripts end to end; nobody double-clicking sets it.
headless() { [ -n "${FA_HEADLESS:-}" ]; }

# Confirm/cancel. Returns 0 for confirm, 1 for cancel.
ask() { # message, confirm-label, cancel-label
  local msg confirm cancel reply
  msg="$1"; confirm="${2:-Continue}"; cancel="${3:-Cancel}"
  headless && { log "ask (headless, yes): $msg"; return 0; }
  if /usr/bin/osascript >/dev/null 2>&1 <<APPLESCRIPT
    tell me to activate
    display dialog "$(as_escape "$msg")" with title "$APP_TITLE" buttons {"$(as_escape "$cancel")", "$(as_escape "$confirm")"} default button "$(as_escape "$confirm")" cancel button "$(as_escape "$cancel")" with icon note
APPLESCRIPT
  then return 0; fi

  # AppleScript said no, or failed. If someone is watching a terminal, ask there.
  if have_tty; then
    printf '\n%s\n\n%s? [y/N] ' "$msg" "$confirm"
    read -r reply
    case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
  fi
  log "ask(): no dialog and no terminal — treating as cancel"
  return 1
}

# One-button message. icon: note | caution | stop
say() {
  local msg icon
  msg="$1"; icon="${2:-note}"
  headless && { log "say (headless): $msg"; return 0; }
  /usr/bin/osascript >/dev/null 2>&1 <<APPLESCRIPT && return 0
    tell me to activate
    display dialog "$(as_escape "$msg")" with title "$APP_TITLE" buttons {"OK"} default button "OK" with icon $icon
APPLESCRIPT
  printf '\n%s\n' "$msg"
  have_tty && { printf '\nPress Return to continue. '; read -r _; }
  return 0
}

# Two buttons; echoes the label chosen.
choose() { # message, left-label, right-label(default)
  local msg left right out reply
  msg="$1"; left="$2"; right="$3"
  headless && { log "choose (headless, $left): $msg"; printf '%s' "$left"; return 0; }
  out="$(/usr/bin/osascript 2>/dev/null <<APPLESCRIPT
    tell me to activate
    button returned of (display dialog "$(as_escape "$msg")" with title "$APP_TITLE" buttons {"$(as_escape "$left")", "$(as_escape "$right")"} default button "$(as_escape "$right")" with icon note)
APPLESCRIPT
)"
  if [ -n "$out" ]; then printf '%s' "$out"; return 0; fi

  if have_tty; then
    printf '\n%s\n\n  1) %s\n  2) %s\n\nChoose [2]: ' "$msg" "$left" "$right"
    read -r reply
    case "$reply" in 1) printf '%s' "$left" ;; *) printf '%s' "$right" ;; esac
    return 0
  fi
  printf '%s' "$right"
}

# ---------------------------------------------------------------------------
# Progress window
#
# A background osascript holding a dialog open. The next progress() call
# dismisses the previous one. If the person clicks Stop, that osascript exits by
# itself, which progress_cancelled() notices between steps.
# ---------------------------------------------------------------------------

PROGRESS_PID=""

progress() {
  progress_done
  local msg
  msg="$(as_escape "$1")"
  log "STEP: $1"
  printf '%s\n' "$1"
  headless && return 0
  /usr/bin/osascript >/dev/null 2>&1 <<APPLESCRIPT &
    tell me to activate
    display dialog "$msg" with title "$APP_TITLE" buttons {"Stop"} giving up after 86400 with icon note
APPLESCRIPT
  PROGRESS_PID=$!
}

progress_done() {
  if [ -n "$PROGRESS_PID" ]; then
    kill "$PROGRESS_PID" 2>/dev/null || true
    wait "$PROGRESS_PID" 2>/dev/null || true
    PROGRESS_PID=""
  fi
}

progress_cancelled() {
  [ -n "$PROGRESS_PID" ] && ! kill -0 "$PROGRESS_PID" 2>/dev/null
}

# Call between steps so Stop actually stops.
abort_if_cancelled() {
  if progress_cancelled; then
    PROGRESS_PID=""
    log "cancelled by user"
    say "Setup stopped. Nothing is broken — you can run the installer again whenever you like."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Failure path — always points at the log, which is what makes remote help work
# ---------------------------------------------------------------------------

fail() {
  progress_done
  log "FAILED: $1"
  local answer
  answer="$(choose "$1

A log file records exactly what happened. Send it to whoever set this up and they can tell you what went wrong." "Quit" "Show me the log")"
  [ "$answer" = "Show me the log" ] && { /usr/bin/open -R "$LOG_FILE" 2>/dev/null || true; }
  exit 1
}

# ---------------------------------------------------------------------------
# Locating the project folder
#
# The .app sits inside the project folder, so the executable at
# <project>/Something.app/Contents/MacOS/x is three directories down. If the app
# has been dragged somewhere else, ask instead of guessing.
# ---------------------------------------------------------------------------

looks_like_project() {
  [ -f "$1/package.json" ] && grep -q "myp-feedback-assistant" "$1/package.json" 2>/dev/null
}

find_project_dir() {
  local candidate

  # The .app stub that launched us worked this out from its own location.
  if [ -n "${FA_PROJECT_DIR:-}" ] && looks_like_project "$FA_PROJECT_DIR"; then
    printf '%s' "$FA_PROJECT_DIR"; return 0
  fi

  # Otherwise: this library lives in <project>/scripts/, so the parent is it.
  candidate="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
  if [ -n "$candidate" ] && looks_like_project "$candidate"; then
    printf '%s' "$candidate"; return 0
  fi

  candidate="$(/usr/bin/osascript -e 'POSIX path of (choose folder with prompt "Where is the Feedback Assistant folder?")' 2>/dev/null)"
  candidate="${candidate%/}"
  if [ -n "$candidate" ] && looks_like_project "$candidate"; then
    printf '%s' "$candidate"; return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

node_major() { "$1" -v 2>/dev/null | sed -e 's/^v//' -e 's/\..*//'; }

# Echoes a directory containing a usable node + npm, or nothing. Prefers a Node
# the person already has, and only then the private copy we manage.
locate_node_bin() {
  local candidates=() dir major
  candidates+=("/opt/homebrew/bin" "/usr/local/bin" "/usr/bin")
  candidates+=("$PRIVATE_NODE_DIR/bin")
  candidates+=("$HOME/.volta/bin" "$HOME/.local/bin")
  for dir in "$HOME"/.nvm/versions/node/*/bin \
             "$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin \
             "$HOME"/.asdf/installs/nodejs/*/bin; do
    [ -d "$dir" ] && candidates+=("$dir")
  done

  for dir in "${candidates[@]}"; do
    [ -x "$dir/node" ] && [ -x "$dir/npm" ] || continue
    major="$(node_major "$dir/node")"
    [ -n "$major" ] && [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null || continue
    printf '%s' "$dir"
    return 0
  done
  return 1
}

# Newest release in the pinned LTS line, resolved at run time so this doesn't rot.
resolve_node_version() {
  local json version=""
  json="$(curl -fsSL --max-time 20 https://nodejs.org/dist/index.json 2>/dev/null)" || json=""
  if [ -n "$json" ]; then
    version="$(printf '%s' "$json" | /usr/bin/python3 -c '
import json, sys
try:
    releases = json.load(sys.stdin)
except Exception:
    sys.exit(0)
lts = [r for r in releases if r.get("lts") and r["version"].startswith("v22.")]
print(lts[0]["version"] if lts else "")
' 2>/dev/null)"
  fi
  printf '%s' "${version:-$NODE_FALLBACK_VERSION}"
}

# Downloads a private Node into Application Support: no admin password, nothing
# added to the shell PATH, and any Node the person already had is left untouched.
install_private_node() {
  local version arch tarball url tmp expected actual
  version="$(resolve_node_version)"
  case "$(uname -m)" in
    arm64)  arch="darwin-arm64" ;;
    x86_64) arch="darwin-x64" ;;
    *) log "unsupported architecture $(uname -m)"; return 1 ;;
  esac
  tarball="node-$version-$arch.tar.gz"
  url="https://nodejs.org/dist/$version/$tarball"
  tmp="$(mktemp -d)" || return 1

  log "downloading $url"
  run_logged curl -fsSL --max-time 900 -o "$tmp/$tarball" "$url" || { rm -rf "$tmp"; return 1; }

  # Verify against the published checksums. A truncated or substituted download
  # would otherwise show up much later as an inexplicable build error.
  if curl -fsSL --max-time 60 -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$version/SHASUMS256.txt" 2>/dev/null; then
    expected="$(grep " $tarball\$" "$tmp/SHASUMS256.txt" | awk '{print $1}')"
    actual="$(shasum -a 256 "$tmp/$tarball" | awk '{print $1}')"
    if [ -n "$expected" ] && [ "$expected" != "$actual" ]; then
      log "checksum mismatch: expected $expected, got $actual"
      rm -rf "$tmp"; return 1
    fi
    log "checksum verified"
  else
    log "checksums unavailable — continuing without verification"
  fi

  rm -rf "$PRIVATE_NODE_DIR" 2>/dev/null || true
  mkdir -p "$PRIVATE_NODE_DIR" || { rm -rf "$tmp"; return 1; }
  run_logged tar -xzf "$tmp/$tarball" -C "$PRIVATE_NODE_DIR" --strip-components=1 || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"

  [ -x "$PRIVATE_NODE_DIR/bin/node" ] || return 1
  log "private Node installed: $("$PRIVATE_NODE_DIR/bin/node" -v)"
  return 0
}

# Puts a usable node/npm on PATH for the rest of this script. Returns 1 if none.
ensure_node_on_path() {
  local dir
  if dir="$(locate_node_bin)"; then
    export PATH="$dir:$PATH"
    log "using Node at $dir ($("$dir/node" -v 2>/dev/null))"
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# AI provider
#
# Which assistant the app talks to is a property of the CODE in this folder, not
# something the installer should decide. Detect it from what's actually here, so
# the Claude build and the Gemini build each install the right thing with no
# question asked and no chance of installing the wrong one.
# ---------------------------------------------------------------------------

# True when this copy can run either backend, so the choice is the person's to
# make rather than something to infer from which files exist.
is_dual_backend() { [ -f "$1/lib/ai/provider.ts" ] && [ -f "$1/lib/ai/gemini.ts" ] && [ -f "$1/lib/ai/claude.ts" ]; }

# What the app is already set to, from .env.local. Empty if not set.
current_provider() { # $1 project dir
  local v
  [ -f "$1/.env.local" ] || return 0
  v="$(grep '^MFA_AI_PROVIDER=' "$1/.env.local" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' \r')"
  printf '%s' "$(printf '%s' "$v" | tr 'A-Z' 'a-z')"
}

detect_provider() { # $1 project dir -> "gemini" | "claude" | "unknown"
  # A single-backend copy answers itself.
  if ! is_dual_backend "$1"; then
    [ -f "$1/lib/ai/gemini.ts" ] && { printf 'gemini'; return; }
    [ -f "$1/lib/ai/claude.ts" ] && { printf 'claude'; return; }
    printf 'unknown'; return
  fi

  # Already configured — keep it, so re-running the installer isn't a chance to
  # silently switch someone's backend out from under them.
  local existing; existing="$(current_provider "$1")"
  case "$existing" in gemini|claude) printf '%s' "$existing"; return ;; esac

  # A colleague's copy — from Share a Clean Copy or downloaded from the release
  # repository — has no git history. Colleagues mark through Gemini on their
  # school account, so there is nothing to ask.
  [ -d "$1/.git" ] || { printf 'gemini'; return; }

  # Otherwise it is the maintainer's own copy, and only she can answer: the two
  # differ by what account they'll need and what it costs.
  local answer
  answer="$(choose "Which AI should do the marking?

Gemini — signs in with your @thekaustschool.org school Google account. This is the one the school has approved for student work.

Claude — needs a paid Claude Pro or Max account. The free Claude plan will not work.

You can change this later by re-running this installer." "Claude" "Gemini")"

  case "$answer" in
    Claude) printf 'claude' ;;
    Gemini) printf 'gemini' ;;
    *) printf 'gemini' ;;   # dialog unavailable: the free option is the safe default
  esac
}

provider_command() { # $1 provider -> the CLI binary name
  case "$1" in
    gemini) printf 'agy' ;;   # Google's Antigravity CLI; the old `gemini` CLI stopped serving personal accounts in June 2026
    *)      printf 'claude' ;;
  esac
}

provider_label() {
  case "$1" in
    gemini) printf 'Gemini' ;;
    *)      printf 'Claude' ;;
  esac
}

# Installing the right CLI is only half the job. The build that supports both
# backends picks one at RUNTIME from MFA_AI_PROVIDER and DEFAULTS TO CLAUDE, so
# without this a Gemini copy would install the Gemini CLI and then quietly try to
# talk to Claude on a machine that has no Claude. Written before the build so the
# setting is in place whichever way Next.js reads it.
configure_provider_env() { # $1 project dir, $2 provider
  local env_file="$1/.env.local" line="MFA_AI_PROVIDER=$2"

  # Only meaningful on a build that can actually switch backends.
  [ -f "$1/lib/ai/provider.ts" ] || { log "single-backend build; no provider env needed"; return 0; }
  case "$2" in gemini|claude) ;; *) return 0 ;; esac

  if [ -f "$env_file" ] && grep -q '^MFA_AI_PROVIDER=' "$env_file"; then
    # Preserve anything else already in the file.
    /usr/bin/sed -i '' "s|^MFA_AI_PROVIDER=.*|$line|" "$env_file" 2>/dev/null || return 1
  else
    printf '%s\n' "$line" >> "$env_file" || return 1
  fi

  # Verify. This file is now the only thing selecting the backend, and an
  # unwritten one means the app quietly falls back to Claude — on a machine that
  # may have no Claude account.
  grep -q "^$line\$" "$env_file" 2>/dev/null || { log "FAILED to write $line"; return 1; }
  log "wrote $line to .env.local"
}

locate_cli() { # $1 binary name
  local dir
  for dir in "$PRIVATE_NODE_DIR/bin" "$HOME/.local/bin" "/opt/homebrew/bin" "/usr/local/bin"; do
    [ -x "$dir/$1" ] && { printf '%s' "$dir/$1"; return 0; }
  done
  command -v "$1" 2>/dev/null && return 0
  return 1
}

# Installs the CLI the app needs. Each has its own installer script that puts
# the binary in ~/.local/bin. Neither needs an administrator password.
install_provider_cli() { # $1 provider
  case "$1" in
    gemini)
      run_logged bash -c 'curl -fsSL https://antigravity.google/cli/install.sh | bash'
      ;;
    claude)
      run_logged bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
      ;;
    *)
      return 1
      ;;
  esac
}

# Opens Terminal running the sign-in. This is the one place a terminal window is
# unavoidable: both CLIs sign in interactively, printing a code and waiting for
# the browser round trip. The person still types nothing — the command is run
# for them.
open_signin_terminal() { # $1 cli path
  local cli
  cli="$(as_escape "$1")"
  /usr/bin/osascript >/dev/null 2>&1 <<APPLESCRIPT || return 1
    tell application "Terminal"
      activate
      do script "clear; echo 'Follow the prompts to sign in, then close this window.'; echo; '$cli'"
    end tell
APPLESCRIPT
}

# ---------------------------------------------------------------------------
# Clean copies and releases
#
# A copy for a colleague (Share a Clean Copy) and a published release (Publish
# an Update) are built the same way, from the same list, and checked the same
# way. The list says what to INCLUDE: data/ holds real student names, scans and
# marks, and anything added to the folder later is left out until it is named
# here, rather than leaking because nobody remembered to exclude it.
# ---------------------------------------------------------------------------

# Where releases are published, and where colleagues' copies fetch them from.
RELEASE_REPO="fdinigre/feedback-assistant"

RELEASE_ITEMS=(
  app lib public scripts specs
  package.json package-lock.json
  next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs
  AGENTS.md CLAUDE.md README.md "SETUP - START HERE.md"
  "Install Feedback Assistant.app"
  "Feedback Assistant.app"
  "Update Feedback Assistant.app"
)

# Copies the app into $2 (created empty) from project $1, and stamps a VERSION.
build_clean_copy() { # $1 project dir, $2 destination
  local src="$1" dest="$2" item
  rm -rf "$dest" && mkdir -p "$dest" || return 1
  for item in "${RELEASE_ITEMS[@]}"; do
    [ -e "$src/$item" ] || { log "skip (absent): $item"; continue; }
    cp -R "$src/$item" "$dest/" 2>>"$LOG_FILE" || { log "could not copy $item"; return 1; }
  done
  # Belt and braces: if anything above ever starts carrying student data, drop it.
  rm -rf "$dest/data" "$dest/node_modules" "$dest/.next" "$dest/.git" "$dest/logs" 2>/dev/null
  find "$dest" \( -name ".env*" -o -name ".DS_Store" -o -name "*.bak" \) -delete 2>/dev/null
  local commit=""
  commit="$(git -C "$src" rev-parse --short HEAD 2>/dev/null || true)"
  printf '%s%s\n' "$(date -u +%Y.%m.%d-%H%M)" "${commit:+ ($commit)}" > "$dest/VERSION"
}

# Prints what is wrong with a copy, or nothing. Two checks: no file that can
# hold student data, and no name from the current rosters anywhere in any file
# — the second catches a name written into the code itself (an example in a
# comment, a seeded sample), which no file-type check can see.
clean_copy_problems() { # $1 project dir (for its rosters), $2 copy
  local leaked names found
  leaked="$(find "$2" \( -name "*.db" -o -name "*.db-wal" -o -name "*.db-shm" -o -name "*.pdf" -o -path "*/data/*" \) 2>/dev/null | head -5)"
  if [ -n "$leaked" ]; then
    printf 'Files that may hold student data:\n%s\n' "$leaked"
    return
  fi
  [ -f "$1/data/app.db" ] && command -v sqlite3 >/dev/null 2>&1 || return 0
  names="$(mktemp)"
  # Case-sensitive and whole-word: names are capitalised, and "mais" is a word.
  sqlite3 "$1/data/app.db" "SELECT name FROM students UNION SELECT alias FROM student_aliases" 2>>"$LOG_FILE" \
    | tr -s ' \t' '\n\n' | awk 'length >= 3' | sort -u > "$names"
  if [ -s "$names" ]; then
    found="$(grep -rnowFf "$names" "$2" 2>/dev/null | head -5)"
    [ -n "$found" ] && printf 'A name from your rosters appears in:\n%s\n' "$found"
  fi
  rm -f "$names"
}
