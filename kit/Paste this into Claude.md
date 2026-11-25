Copy everything below the line and paste it into Claude Code on the server Mac
(open Terminal, run `claude`, then paste). Claude will do the setup and stop to ask you
whenever it needs you: which Clerk app to use, and approving the Clerk sign-in in your browser.
No Mac password is needed.

---

Set up **TC Quoting Estimate** to run as a server on this Mac, and keep it backed up.

Context:
- It's my construction estimating / job management web app (Next.js + SQLite). Code lives in the
  public GitHub repo `tradiescombined/brains-cad-brain`.
- An install kit was downloaded to this Mac, usually `~/Downloads/BrainsCadBrain-Server-Kit/`.
  It contains `Install on this Mac.command` (the full install script, so read it and follow the same
  steps), `brains-cad-brain.bundle` (offline copy of the repo, to use only if GitHub access fails), and
  this file.
- The step-by-step for you is `docs/INSTALL-FOR-CLAUDE.md` in the repo (Node without Homebrew, Clerk through
  its CLI without showing keys, the rebuild gotcha, done checks). Read it first and follow it.
  The human guide is `docs/SELF-HOSTING.md`.

Do this, checking each step worked before moving on:
1. Ask me first: a full server on this Mac, or use one that already runs on another Mac.
   Then make sure Node 22+ and git are there (INSTALL-FOR-CLAUDE.md step 1, no Homebrew needed).
   For anything I must type or approve, tell me exactly what, and suggest the `!` prefix.
2. Clone https://github.com/tradiescombined/brains-cad-brain.git to `~/brains-cad-brain` (fall back to the bundle only if GitHub access
   fails, then set `origin` to https://github.com/tradiescombined/brains-cad-brain.git).
   After setup, also run `zsh mac-app/build.sh` to install the TC Quoting Estimate app in Applications.
3. `npm run setup`.
4. Clerk keys (INSTALL-FOR-CLAUDE.md step 4): ask me for my Clerk app ID (or help me create the app),
   sign the Clerk CLI in, `link --app` and `env pull --file .env`. Never run `clerk init`, and never
   print or read the keys. Then stop the server if it runs and `npm run setup` again (step 5).
5. `npm run service:install` (auto-start at login + nightly 2am backup), then `npm run doctor` and fix
   anything it flags.
6. Backups: set `BCB_BACKUP_DIR` in `.env` to
   `~/Library/Mobile Documents/com~apple~CloudDocs/BrainsCadBrain-backups` so the nightly backup is
   also copied to iCloud Drive, and run `npm run backup` once to prove it works.
7. Keep the Mac working as a server: walk me through preventing sleep, auto-restart after a power
   failure, and automatic login (per section 8 of the guide).
8. Finish by opening http://localhost:3000 for me, telling me to sign in first (so I become the
   Owner), and giving me the address other devices on my network should use
   (`http://<LocalHostName>.local:3000`).

Rules: don't commit or push anything to GitHub unless I ask (the code's backup IS GitHub; app data is
backed up by `npm run backup` / iCloud, never committed to git since it holds client data). Don't
enable `BCB_AUTH_BYPASS` on this server. To get newer versions later, use `npm run update`.
