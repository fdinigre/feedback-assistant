#!/bin/bash
# Everyday launcher, run by "Feedback Assistant.app". Starts the local server if
# it isn't already running, then opens the browser. No terminal window.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/app-lib.sh"

init_log "launch"

PORT=3000
URL="http://localhost:$PORT"

PROJECT_DIR="$(find_project_dir)" || {
  say "I couldn't find the Feedback Assistant folder.

Keep this icon inside that folder and try again." caution
  exit 1
}
cd "$PROJECT_DIR" || fail "Could not open the Feedback Assistant folder."
log "project: $PROJECT_DIR"

# Already running? Just show it. Opening a second server would fight over the
# port and over the database.
if /usr/bin/curl -fsS --max-time 3 -o /dev/null "$URL" 2>/dev/null; then
  log "already running"
  /usr/bin/open "$URL"
  exit 0
fi

# Not set up yet — send them to the installer rather than failing obscurely.
if [ ! -d node_modules ] || [ ! -f .next/BUILD_ID ]; then
  answer="$(choose "Feedback Assistant hasn't been set up on this Mac yet.

Run the installer once and this icon will work from then on." "Cancel" "Run the installer")"
  if [ "$answer" = "Run the installer" ]; then
    /usr/bin/open "$PROJECT_DIR/Install Feedback Assistant.app" 2>/dev/null || true
  fi
  exit 0
fi

ensure_node_on_path || {
  answer="$(choose "The app's engine (Node.js) is missing.

Running the installer again will put it back. Nothing you've marked will be lost." "Cancel" "Run the installer")"
  [ "$answer" = "Run the installer" ] && /usr/bin/open "$PROJECT_DIR/Install Feedback Assistant.app" 2>/dev/null
  exit 1
}

progress "Starting Feedback Assistant…"

mkdir -p data 2>/dev/null || true
nohup npm run start -- --port "$PORT" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
log "server pid $SERVER_PID"

# Wait for it to answer. 60s is generous; a cold start is a second or two.
ready=""
for _ in $(seq 1 60); do
  sleep 1
  if /usr/bin/curl -fsS --max-time 2 -o /dev/null "$URL" 2>/dev/null; then ready=yes; break; fi
  # If the server died, stop waiting and say so straight away.
  kill -0 "$SERVER_PID" 2>/dev/null || break
done

progress_done

if [ -n "$ready" ]; then
  log "ready"
  /usr/bin/open "$URL"
  exit 0
fi

fail "Feedback Assistant didn't start.

Your marking and class data are safe — this is a problem starting the app, not with your files."
