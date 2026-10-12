#!/bin/bash
# Signs this Mac in to Gemini (Google's `agy`), in the Terminal window the
# installer opens for it. Safe to run again at any time.
#
# Why this rather than just running `agy`: Google's sign-in shows the person a
# code in the browser and waits for it to be pasted back into Terminal — but
# only for about a minute, and nothing on screen says the paste is what it is
# waiting for. Colleagues reached the code and watched the window do nothing
# until it said the login had failed. So this says what to do at each step,
# starts again by itself if the minute runs out, and finishes by saying which
# account it is signed in as — refusing to call a personal account done.
#
# Usage: app-signin.sh <path to agy>

AGY="${1:-$HOME/.local/bin/agy}"
SCHOOL="thekaustschool.org"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

# The account agy is signed in as, from the log of a run that sends no prompt.
signed_in_as() {
  local dir log
  dir="$(mktemp -d)"
  log="$dir/agy.log"
  ( cd "$dir" && "$AGY" --log-file "$log" models >/dev/null 2>&1 )
  sed -nE 's/.*applyAuthResult: email=([^ ,]+@[^ ,]+).*/\1/p' "$log" 2>/dev/null | tail -1
  rm -rf "$dir"
}

clear
bold "Sign in to Gemini"
echo
echo "1. Your browser opens a Google page. (If it doesn't, hold ⌘ and click the"
echo "   long link that appears below.)"
echo "2. Choose your @$SCHOOL account — not a personal Gmail — and allow access."
echo "3. The page then shows a code. Copy it."
echo "4. Come back to THIS window, press ⌘V to paste the code, then press Return."
echo
bold "You have about one minute for steps 2–4. If it runs out, it simply starts"
bold "again, and the second time is quicker."
echo

current="$(signed_in_as)"
if [ -n "$current" ]; then
  case "$current" in
    *@"$SCHOOL"|*."$SCHOOL")
      bold "Already signed in as $current. Nothing to do — you can close this window."
      exit 0
      ;;
  esac
fi

for attempt in 1 2 3; do
  [ "$attempt" -gt 1 ] && { echo; bold "Starting again (attempt $attempt of 3)…"; echo; }
  work="$(mktemp -d)"
  # A one-word request is what makes agy sign in from the command line; the
  # code is read from this window even while the request is running.
  ( cd "$work" && "$AGY" -p "Reply with the single word OK." )
  status=$?
  rm -rf "$work"
  [ "$status" -eq 0 ] && break
done

echo
account="$(signed_in_as)"
case "$account" in
  "")
    bold "The sign-in didn't complete."
    echo "Close this window and run Install Feedback Assistant again; it will open"
    echo "this sign-in once more. Everything else in the app works without it."
    ;;
  *@"$SCHOOL"|*."$SCHOOL")
    bold "Signed in as $account. ✓"
    echo "You can close this window and use Feedback Assistant."
    ;;
  *)
    bold "Signed in as $account — that is not a school account."
    echo "Feedback Assistant will refuse to send student work through it. To switch:"
    echo "  1. In this window type:  $AGY"
    echo "  2. In the screen that opens, type  /logout  and press Return,"
    echo "     then  /login , and choose your @$SCHOOL account."
    ;;
esac
echo
