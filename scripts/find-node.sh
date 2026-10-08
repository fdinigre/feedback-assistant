#!/bin/bash
# Makes `node` and `npm` available to a double-clicked .command script.
#
# Double-clicked scripts run in a bare, non-login shell, so they do NOT read
# ~/.zshrc / ~/.zprofile. Anything installed by a version manager (nvm, fnm,
# volta, asdf) or by Homebrew-into-your-profile is therefore invisible to them
# even though `node -v` works fine when you type it in Terminal.
#
# Strategy, in order:
#   1. the usual system-wide install locations
#   2. borrow the PATH from your real login shell (covers every version manager)
#   3. source nvm directly
#   4. glob the known version-manager install directories

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.volta/bin"

have_node() { command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; }

# 2. Borrow the login shell's PATH.
if ! have_node; then
  _login_path="$("${SHELL:-/bin/zsh}" -lic 'printf %s "$PATH"' 2>/dev/null)"
  [ -n "$_login_path" ] && export PATH="$_login_path:$PATH"
fi

# 3. nvm.
if ! have_node; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

# 4. Known version-manager locations.
if ! have_node; then
  for _d in "$HOME"/.nvm/versions/node/*/bin \
            "$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin \
            "$HOME"/.local/share/fnm/node-versions/*/installation/bin \
            "$HOME"/.fnm/node-versions/*/installation/bin \
            "$HOME"/.asdf/installs/nodejs/*/bin \
            "$HOME"/.volta/tools/image/node/*/bin \
            /usr/local/opt/node@*/bin \
            /opt/homebrew/opt/node@*/bin; do
    if [ -x "$_d/node" ]; then export PATH="$_d:$PATH"; break; fi
  done
fi

if ! have_node; then
  mkdir -p data
  {
    echo "Node diagnostic — $(date)"
    echo
    echo "SHELL=$SHELL"
    echo "PATH=$PATH"
    echo
    echo "--- login shell sees ---"
    "${SHELL:-/bin/zsh}" -lic 'echo "PATH=$PATH"; echo "node: $(command -v node 2>&1)"; echo "npm: $(command -v npm 2>&1)"; node -v 2>&1' 2>&1
    echo
    echo "--- common locations ---"
    for p in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.volta/bin/node" "$HOME/.nvm/nvm.sh"; do
      [ -e "$p" ] && echo "EXISTS $p" || echo "missing $p"
    done
    echo
    echo "--- profile files mentioning node ---"
    grep -l -iE 'nvm|fnm|volta|asdf|node' "$HOME"/.zshrc "$HOME"/.zprofile "$HOME"/.bash_profile "$HOME"/.profile 2>/dev/null
  } > data/node-diagnostic.txt 2>&1

  echo ""
  echo "Could not find Node.js/npm from a double-clicked script."
  echo "I wrote details to:  data/node-diagnostic.txt"
  echo "Share that file (or the output of 'which node' in Terminal) and it can be fixed."
  echo ""
  echo "If 'which node' in Terminal also prints nothing, install the LTS from https://nodejs.org"
  echo ""
  echo "Press any key to close."; read -n 1
  exit 1
fi
