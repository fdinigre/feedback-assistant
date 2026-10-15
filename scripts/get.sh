#!/bin/bash
# Installs Feedback Assistant from the release repository, for a teacher who
# pastes one line into Terminal:
#
#   curl -fsSL https://raw.githubusercontent.com/fdinigre/feedback-assistant/main/scripts/get.sh | bash
#
# Why not "Download ZIP": a browser marks everything it downloads as
# quarantined, and macOS then refuses to open the app's icons because they are
# not signed by a paid Apple developer account. Getting past that needs an
# administrator on a school Mac. Files fetched by curl in Terminal carry no
# quarantine, so the icons simply open. No administrator password is needed at
# any point; everything goes inside the person's own home folder.
#
# Run again on a Mac that already has it, it updates instead, keeping all data.

# Everything is inside main, so a download cut off half way runs nothing.
main() {
  set -uo pipefail

  local repo="fdinigre/feedback-assistant"
  local dest="${FA_INSTALL_DIR:-$HOME/Feedback Assistant}"
  local url="${FA_RELEASE_URL:-https://codeload.github.com/$repo/tar.gz/refs/heads/main}"

  echo
  echo "Feedback Assistant"
  echo "=================="
  echo

  # Already installed: update it rather than touching anyone's data.
  if [ -f "$dest/package.json" ] && grep -q "myp-feedback-assistant" "$dest/package.json" 2>/dev/null; then
    echo "Feedback Assistant is already installed in: $dest"
    # A copy that came through a browser or AirDrop has its icons refused by macOS
    # ("could not verify… free of malware"). Clearing that on one's own files needs
    # no administrator, so running this line again also unblocks the icons.
    /usr/bin/xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
    echo "Checking for an update instead…"
    FA_PROJECT_DIR="$dest" exec /bin/bash "$dest/scripts/app-update.sh"
  fi
  if [ -e "$dest" ]; then
    echo "There is already something called \"$(basename "$dest")\" in your home folder,"
    echo "and it is not Feedback Assistant. Rename or move it, then run this again."
    exit 1
  fi

  # Global, not local: the clean-up runs after main has returned.
  FA_GET_WORK="$(mktemp -d)" || exit 1
  trap 'rm -rf "${FA_GET_WORK:-}"' EXIT
  local work="$FA_GET_WORK"

  echo "Downloading…"
  if ! /usr/bin/curl -fsSL --max-time 300 -o "$work/release.tar.gz" "$url"; then
    echo
    echo "The download did not work. Check the internet connection and try again."
    echo "(A school network can block GitHub.)"
    exit 1
  fi
  /usr/bin/tar -xzf "$work/release.tar.gz" -C "$work" || { echo "The download could not be opened."; exit 1; }
  local unpacked
  unpacked="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [ ! -f "$unpacked/package.json" ] || ! grep -q "myp-feedback-assistant" "$unpacked/package.json"; then
    echo "The download is not Feedback Assistant, so nothing was installed."
    exit 1
  fi

  mv "$unpacked" "$dest" || { echo "Could not create $dest."; exit 1; }
  # Colleagues mark through Gemini on their school account.
  printf 'MFA_AI_PROVIDER=gemini\n' > "$dest/.env.local"
  # Belt and braces: nothing fetched this way should be quarantined, but if a
  # proxy or tool added the flag, clearing it on one's own files needs no
  # administrator.
  /usr/bin/xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true

  echo "Installed in: $dest"
  echo "Setting it up — windows will ask you a few questions. This takes about five minutes."
  echo
  FA_PROJECT_DIR="$dest" /bin/bash "$dest/scripts/app-setup.sh"

  # Show the folder, so the Feedback Assistant icon is easy to find.
  [ -z "${FA_HEADLESS:-}" ] && /usr/bin/open "$dest" 2>/dev/null
  echo
  echo "Done. Open the app any time with the Feedback Assistant icon in: $dest"
  echo "You can drag that icon to the Dock."
}

main "$@"
