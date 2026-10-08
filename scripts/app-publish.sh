#!/bin/bash
# Publishes the current app as a release colleagues' copies can update from.
# Run by "Publish an Update.app", on the maintainer's Mac only — it is not in
# the release, so a colleague's copy has no such icon.
#
# The release repository is public and holds clean snapshots only: never this
# project's own history, which predates the name checks. Every publish:
#   1. refuses unless the code is committed and pushed, so a release is always
#      something that exists in the private repository too;
#   2. runs the automated checks, and refuses if any fails;
#   3. builds the copy exactly as Share a Clean Copy does and checks it the
#      same way (no student data, no roster name anywhere);
#   4. commits that snapshot to the release repository and pushes it.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HERE/app-lib.sh"

init_log "publish"

PROJECT_DIR="$(find_project_dir)" || {
  say "I couldn't find the Feedback Assistant folder." caution
  exit 1
}
cd "$PROJECT_DIR" || exit 1

RELEASE_DIR="$SUPPORT_DIR/release"
SNAPSHOT="$SUPPORT_DIR/release-snapshot"
RELEASE_URL="https://github.com/$RELEASE_REPO.git"
GIT_AS=(-c "user.name=Fernanda Dinigre" -c "user.email=fdinigre@gmail.com")

[ -d .git ] || fail "This folder is not the maintainer's copy (it has no git history), so it cannot publish."

ask "This publishes the app as it is now, so colleagues get it the next time they click Update.

It sends the app's code only — never your students, scans, marks or reports. It runs the automated checks first and stops if any fails." "Publish" "Cancel" || exit 0

ensure_node_on_path || fail "Node.js is missing, so the checks cannot run."

# ---------------------------------------------------------------------------
# 1. Committed and pushed
# ---------------------------------------------------------------------------

progress "Checking the code is committed…"
if [ -n "$(git status --porcelain --untracked-files=no 2>>"$LOG_FILE")" ]; then
  fail "There are changes that have not been committed yet.

Commit (and push) them first, so the release is the same as the code in your own repository."
fi
run_logged git fetch --quiet origin || fail "Could not reach GitHub to check the code is pushed."
if [ -n "$(git rev-list origin/main..HEAD 2>>"$LOG_FILE")" ]; then
  fail "Your latest commits have not been pushed yet.

Push them first, so the release is the same as the code in your own repository."
fi

# ---------------------------------------------------------------------------
# 2. The automated checks
# ---------------------------------------------------------------------------

progress "Running the automated checks…"
if ! run_logged npm test; then
  fail "One of the automated checks failed, so nothing was published.

The log says which one."
fi
abort_if_cancelled

# ---------------------------------------------------------------------------
# 3. A clean copy, checked
# ---------------------------------------------------------------------------

progress "Building the release…"
build_clean_copy "$PROJECT_DIR" "$SNAPSHOT" || fail "Could not build the release."
PROBLEMS="$(clean_copy_problems "$PROJECT_DIR" "$SNAPSHOT")"
if [ -n "$PROBLEMS" ]; then
  log "CLEAN CHECK FAILED: $PROBLEMS"
  rm -rf "$SNAPSHOT"
  fail "Stopping: the release is not clean, so nothing was published.

$PROBLEMS"
fi
VERSION="$(cat "$SNAPSHOT/VERSION")"

# ---------------------------------------------------------------------------
# 4. Commit and push the snapshot
# ---------------------------------------------------------------------------

progress "Publishing version $VERSION…"
if [ ! -d "$RELEASE_DIR/.git" ]; then
  rm -rf "$RELEASE_DIR"
  run_logged git clone --quiet "$RELEASE_URL" "$RELEASE_DIR" || fail "Could not reach the release repository.

It should be a public repository at github.com/$RELEASE_REPO. If it does not exist yet, create it there (empty, no README) and try again."
fi
(
  cd "$RELEASE_DIR" || exit 1
  git fetch --quiet origin 2>/dev/null && git reset --quiet --hard origin/main 2>/dev/null
  # The snapshot is the whole release: anything no longer in the app goes too.
  /usr/bin/rsync -a --delete --exclude ".git" "$SNAPSHOT/" "$RELEASE_DIR/" || exit 1
  git add -A || exit 1
  if git diff --cached --quiet; then
    echo "nothing changed"
    exit 3
  fi
  git "${GIT_AS[@]}" commit --quiet -m "Release $VERSION" || exit 1
  git push --quiet origin HEAD:main || exit 2
) >> "$LOG_FILE" 2>&1
status=$?
rm -rf "$SNAPSHOT"
progress_done

case "$status" in
  0) ;;
  3)
    say "Nothing to publish: the release already matches the app."
    exit 0
    ;;
  2) fail "The release was prepared but could not be sent to GitHub." ;;
  *) fail "The release could not be prepared." ;;
esac

log "published $VERSION"
say "Published version $VERSION.

Colleagues get it the next time they double-click Update Feedback Assistant."
exit 0
