#!/bin/bash
# TC Quoting Estimate: one-click server install for a Mac.
# Double-click this file. If macOS blocks it: right-click → Open → Open.
# Safe to run again; it skips anything already done.

set -u
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${BCB_INSTALL_DIR:-$HOME/brains-cad-brain}"
REPO="tradiescombined/brains-cad-brain"
SKIP_SERVICE="${BCB_SKIP_SERVICE:-0}"

bold() { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✔\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\n\033[31m✘ %s\033[0m\n" "$1"; echo "Press Enter to close."; read -r _; exit 1; }

bold "TC Quoting Estimate: server install"
echo "  Installs into: $INSTALL_DIR"

# 1. Homebrew
bold "1/7  Homebrew (developer tool installer)"
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "  Installing Homebrew. It will ask for this Mac's login password (typing is invisible)."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Homebrew install failed."
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  SHELLRC="$HOME/.zprofile"
  grep -q "brew shellenv" "$SHELLRC" 2>/dev/null || echo "eval \"\$($(command -v brew) shellenv)\"" >> "$SHELLRC"
fi
command -v brew >/dev/null 2>&1 || die "Homebrew not found after install."
ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"

# 2. Node, Git, GitHub CLI
bold "2/7  Node.js and Git"
for pkg in node git; do
  if ! command -v "$pkg" >/dev/null 2>&1; then brew install "$pkg" || die "Could not install $pkg"; fi
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || { brew upgrade node || die "Node 22+ needed (have $(node -v))."; }
ok "Node $(node -v), $(git --version)"

# 3. Get the code: GitHub (preferred, gives updates + backup of code) or the offline bundle
bold "3/7  Get the app code"
if [ -d "$INSTALL_DIR/.git" ]; then
  ok "Already downloaded. Leaving it as is (use 'npm run update' to get new versions)."
else
  if git clone -q "https://github.com/$REPO.git" "$INSTALL_DIR"; then
    ok "Downloaded from GitHub"
  elif [ -f "$KIT_DIR/brains-cad-brain.bundle" ]; then
    warn "GitHub not available. Using the offline copy from this kit."
    git clone -q "$KIT_DIR/brains-cad-brain.bundle" "$INSTALL_DIR" -b main || die "Could not unpack the offline copy."
    git -C "$INSTALL_DIR" remote set-url origin "https://github.com/$REPO.git"
    ok "Unpacked offline copy (origin set to GitHub for future updates)"
  else
    die "Could not download the code. Check the internet connection and run this again."
  fi
fi
cd "$INSTALL_DIR" || die "Missing $INSTALL_DIR"

# 4. First setup (install, database, build)
bold "4/7  Install, create database, build (takes a few minutes)"
npm run setup || die "Setup failed. Run 'npm run doctor' in $INSTALL_DIR for details."

# 5. Sign-in keys
bold "5/7  Sign-in keys (Clerk)"
if grep -qE '^CLERK_SECRET_KEY=sk_' .env 2>/dev/null && grep -qE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_' .env 2>/dev/null; then
  ok "Clerk keys already in .env"
else
  echo "  Create a free app at https://clerk.com (turn on Google and Apple),"
  echo "  open API Keys, and paste both keys into the .env file that's opening now:"
  echo "     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_..."
  echo "     CLERK_SECRET_KEY=sk_..."
  open -e .env
  echo; read -r -p "  Save .env, then press Enter here to rebuild with the keys (or type 'skip'): " ans
  if [ "${ans:-}" != "skip" ]; then npm run setup || die "Rebuild failed."; else warn "Skipped. Pages show an error until keys are added and 'npm run setup' is run."; fi
fi

# 6. Auto-start + nightly backup
bold "6/7  Start automatically + nightly 2am backup"
if [ "$SKIP_SERVICE" = "1" ]; then
  warn "Skipped (BCB_SKIP_SERVICE=1). Start manually with: npm run serve"
else
  npm run service:install || warn "Auto-start not installed. Start manually with: npm run serve"
fi

bold "7/7  Mac app (TC Quoting Estimate in Applications)"
if command -v swiftc >/dev/null 2>&1; then
  zsh "$INSTALL_DIR/mac-app/build.sh" && ok "Installed the TC Quoting Estimate app. Open it from Applications or Launchpad." || warn "Mac app build failed. The website still works in a browser."
else
  warn "Xcode command line tools missing, so the Mac app was skipped. Run: xcode-select --install, then: zsh ~/brains-cad-brain/mac-app/build.sh"
fi

bold "Health check"
npm run doctor || true

HOST="$(scutil --get LocalHostName 2>/dev/null || hostname)"
bold "Done"
echo "  On this Mac:          http://localhost:3000   (sign in FIRST: you become the Owner)"
echo "  Other office devices: http://$HOST.local:3000"
echo "  App folder:           $INSTALL_DIR"
echo "  Guide:                $INSTALL_DIR/docs/SELF-HOSTING.md"
echo
echo "Press Enter to close."; read -r _
