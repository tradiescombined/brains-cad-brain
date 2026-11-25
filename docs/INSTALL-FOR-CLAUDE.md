# Installing TC Quoting Estimate on a Mac: steps for Claude

Written for Claude Code on the Mac you are installing on. Every step lists what to check before moving on.
It was first run on Kevin's Mac on 24 Nov 2026 (Apple silicon, macOS 27). The human guide is `docs/SELF-HOSTING.md`.

## Rules
- Ask the person before installing, committing, pushing or deleting anything.
- Never open, print or copy the contents of `.env`, `.env.*` or `.clerk/`. To check a key, count lines only:
  `grep -cE '^CLERK_SECRET_KEY=sk_' .env`.
- Don't use `sudo`, don't change security settings, and don't use `--dangerously-skip-permissions`.
- Never set `BCB_AUTH_BYPASS` or `BCB_ALLOW_TEST_BYPASS` on a real install.
- App data (`data/`, `backups/`, `logs/`) is client data. Never commit it.
- The first person to sign in becomes the Owner. That must be the person the Mac belongs to, not you.

## 0. Decide first (ask the person)
Each install is its own server with its **own database**. Ask:
- **A. Full server on this Mac.** Follow every step below.
- **B. Use a server that already runs on another Mac.** Don't install anything. The office opens
  `http://<that Mac's LocalHostName>.local:3000`, or its Tailscale address on port 3000.

Then check the Mac. `uname -m`: `arm64` is Apple silicon; `x86_64` is Intel. `sw_vers -productVersion`.
`xcode-select -p` must print a path. If it doesn't, ask the person to run `xcode-select --install`.

## 1. Node 22 (no Homebrew, no password)
If `node -v` already prints v22 or higher, skip this step. Otherwise install the official build into the user's folder:
```bash
V=v22.12.0; ARCH=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)
T=$(mktemp -d); cd "$T"; F=node-$V-darwin-$ARCH.tar.gz
curl -fsSLO https://nodejs.org/dist/$V/$F && curl -fsSLO https://nodejs.org/dist/$V/SHASUMS256.txt
grep " $F\$" SHASUMS256.txt | shasum -a 256 -c -          # must print: OK
tar xzf $F && rm -rf ~/.local/node && mv node-$V-darwin-$ARCH ~/.local/node
mkdir -p ~/.local/bin && for b in node npm npx; do ln -sf ~/.local/node/bin/$b ~/.local/bin/$b; done
```
Check: `zsh -lic 'command -v node npx'` prints paths under `~/.local/bin`. If it doesn't, add
`export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc`. In your own shell commands, put
`export PATH=~/.local/node/bin:$PATH` first.
Homebrew (`brew install node`) also works, but it needs the person's Mac password.

## 2. Download
```bash
git clone https://github.com/tradiescombined/brains-cad-brain.git ~/brains-cad-brain   # public repo
```
Put it in the home folder, **not** Desktop, Documents, Downloads or iCloud: auto-start can't read those.
Check: `git -C ~/brains-cad-brain log --oneline -1`.

## 3. First setup
```bash
cd ~/brains-cad-brain && npm run setup
```
Check: it ends with `✔ Built` and `Done`. A warning that the Clerk keys are empty is expected at this stage.
If `npm ci` fails with "package.json and package-lock.json are not in sync", the lock file on GitHub is out of date.
Run `npm install`, run setup again, and tell the person: the changed `package-lock.json` has to be pushed (fixed once in bad3202).

## 4. Sign-in keys (Clerk)
The app already contains Clerk. **Don't run `clerk init`**: it could create a second application.
1. Ask the person whether they already have a Clerk application for this install. If they don't, they create one at
   https://dashboard.clerk.com (framework Next.js, with Email and Google on, and Apple if wanted). Note its ID, `app_...`.
   If the person pastes Clerk's "Set up Clerk" prompt, its "Dashboard-selected Clerk application" line contains the ID.
2. Sign the Clerk CLI in. Run it in the background; it opens the browser, and the person approves:
   `cd ~/brains-cad-brain && npx -y clerk@latest auth login`. Check: the output says `Logged in as ...`.
3. Link the project and pull the keys, without printing them:
   ```bash
   cp -p .env .env.before-clerk
   npx -y clerk@latest link --app app_XXXXXXXX </dev/null
   npx -y clerk@latest env pull --file .env </dev/null
   chmod 600 .env .env.before-clerk
   grep -cE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_' .env; grep -cE '^CLERK_SECRET_KEY=sk_' .env   # each must print 1
   ```
   Pipe the CLI output through `grep -vE 'sk_|pk_'` so no key ever reaches the transcript.
Without the CLI, the person pastes both keys into `.env` themselves (`open -e ~/brains-cad-brain/.env`).
These are development keys (`pk_test_`), which are fine on the office network. Public HTTPS needs the
production steps in SELF-HOSTING.md, section 6B.

## 5. Rebuild with the keys
The publishable key is built into the app, so a rebuild is needed. **`npm run setup` skips the build while
anything answers on port 3000**, so stop the server first if it is already running:
```bash
U=gui/$(id -u); launchctl bootout $U/com.brainscadbrain.server 2>/dev/null; sleep 3
npm run setup                                             # must print ✔ Built
```

## 6. Auto-start, nightly backup, Mac app
```bash
npm run service:install        # LaunchAgents com.brainscadbrain.server (port 3000) and .backup (02:00)
zsh mac-app/build.sh           # "/Applications/TC Quoting Estimate.app" (needs node on PATH; records its path)
npm run backup                 # first backup, must say "verified"
```
If you stopped the server in step 5 and didn't run service:install again, start it with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.brainscadbrain.server.plist`.

## 7. Done when
- `curl -s -o /dev/null -w '%{http_code}' localhost:3000/sign-in` prints `200`. It may take about 30 s after a start.
- `npm run doctor` has no FAIL. The only WARN left is "nobody has signed in yet".
- `git status --short` is empty. Otherwise `npm run update` will refuse later.
- Then open the app (`open "/Applications/TC Quoting Estimate.app"`) and tell the person to **sign in first**,
  so they become the Owner. Other devices use `http://$(scutil --get LocalHostName).local:3000`.

## Intel Macs
The same steps work: step 1 picks `darwin-x64` by itself. Build the Mac app on that Mac. Never copy
an Apple-silicon `.app` across.

## Updating later
`cd ~/brains-cad-brain && npm run update`: backup, pull, install, schema, rebuild and restart. If it refuses
because of local changes, look at `git status`. Don't throw changes away without asking.
