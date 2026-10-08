#!/bin/bash
# Makes a copy of this folder that is safe to hand to a colleague.
#
# The point of this tool is one specific hazard: data/ holds real student names,
# scanned work and marks. Git never sees it (.gitignore), but a Finder copy, a
# zip or an AirDrop takes it along silently. So the copy is built by listing what
# to INCLUDE rather than what to leave out — a new folder of student data added
# later is then excluded automatically, instead of leaking because nobody
# remembered to add it to a list.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/app-lib.sh"

init_log "share"

PROJECT_DIR="$(find_project_dir)" || {
  say "I couldn't find the Feedback Assistant folder." caution
  exit 1
}
cd "$PROJECT_DIR" || exit 1

DEST="$HOME/Desktop/Feedback Assistant (for a colleague)"
ZIP="$HOME/Desktop/Feedback Assistant.zip"

ask "This makes a clean copy of Feedback Assistant on your Desktop that you can give to a colleague.

It contains the app only. Your students' names, scans, marks and reports are NOT included, and neither is any account you've signed in to.

Your own copy is not touched." "Make the copy" "Cancel" || exit 0

progress "Building a clean copy…"

rm -rf "$ZIP" 2>/dev/null || true
# The app and nothing else: data/, node_modules/, .next/, .git/, logs and any
# environment file are never included (scripts/app-lib.sh, build_clean_copy).
# HOW TO OPEN.md and AI-BACKENDS.md are maintainer notes, not on the list.
build_clean_copy "$PROJECT_DIR" "$DEST" || fail "Could not create the copy on your Desktop."

# Colleagues mark through Gemini on their school account. Recorded here so the
# installer never asks them to choose, and so the app cannot quietly default to
# Claude on a Mac with no Claude account.
printf 'MFA_AI_PROVIDER=gemini\n' > "$DEST/.env.local" || fail "Could not prepare the copy's settings."

# Verify rather than assume: no file that can hold student data, and no roster
# name written anywhere in the code.
PROBLEMS="$(clean_copy_problems "$PROJECT_DIR" "$DEST")"
if [ -n "$PROBLEMS" ]; then
  log "CLEAN CHECK FAILED: $PROBLEMS"
  rm -rf "$DEST"
  progress_done
  fail "Stopping: the copy is not clean.

$PROBLEMS

Nothing has been shared. If that is a real student, the file needs changing first; if it is an ordinary word that happens to be a name, send the log to whoever set this up."
fi

progress "Compressing…"
( cd "$HOME/Desktop" && zip -qr "$ZIP" "$(basename "$DEST")" ) 2>>"$LOG_FILE" || log "zip failed"

progress_done

SIZE="$(du -sh "$DEST" 2>/dev/null | awk '{print $1}')"
log "clean copy built: $SIZE"

answer="$(choose "Done — a clean copy is on your Desktop ($SIZE).

Checked and confirmed: no student data, no database, no scans, no signed-in account.

Give your colleague the zip file, and tell them to open 'Install Feedback Assistant' inside it once." "Done" "Show me")"
[ "$answer" = "Show me" ] && { /usr/bin/open -R "$ZIP" 2>/dev/null || /usr/bin/open -R "$DEST" 2>/dev/null; }
exit 0
