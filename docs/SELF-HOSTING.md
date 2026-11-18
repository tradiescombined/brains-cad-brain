# Running Brains Cad Brain on your own Mac

This guide sets up Brains Cad Brain as a **server** on a Mac you own, installed from GitHub. Everyone
in your team opens it in a web browser and signs in with Google or Apple.

You don't need to be a developer. You'll paste a few commands into **Terminal** (Applications →
Utilities → Terminal). Paste one command, press Enter, wait for it to finish, then paste the next.

The main guide is for **macOS**. If the server is ever a Windows PC or a Linux machine, see the
appendices at the end. The commands are the same and only a few steps differ.

**Contents**

- [Quick install on a Mac](#quick-install-on-a-mac)
1. [What you need](#1-what-you-need)
2. [Install the tools](#2-install-the-tools)
3. [Get access to the code on GitHub](#3-get-access-to-the-code-on-github)
4. [Download (clone) the app](#4-download-clone-the-app)
5. [First install: `npm run setup`](#5-first-install-npm-run-setup)
6. [Sign-in: choose option A or B](#6-sign-in-choose-option-a-or-b)
7. [Start the server and open it](#7-start-the-server-and-open-it)
8. [Start automatically and keep the Mac awake](#8-start-automatically-and-keep-the-mac-awake)
9. [Updating to a new version](#9-updating-to-a-new-version)
10. [Backups (to iCloud Drive) and restoring](#10-backups-to-icloud-drive-and-restoring)
11. [Troubleshooting](#11-troubleshooting)
12. [Command cheat sheet](#12-command-cheat-sheet)
- [Appendix A: Windows server](#appendix-a-windows-server)
- [Appendix B: Linux server](#appendix-b-linux-server)

---

## Quick install on a Mac

If you're comfortable following instructions, this is the whole installation. Each step is
explained in detail in the numbered sections below.

```bash
# 1. Homebrew, the installer for developer tools. When it finishes, run the 2 "Next steps" lines it prints.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js, Git and the GitHub tool
brew install node git gh

# 3. Log in to GitHub: choose GitHub.com → HTTPS → Yes → Login with a web browser
gh auth login

# 4. Download the app into your home folder (not Desktop/Documents/iCloud) and install it
cd ~
gh repo clone KolinCunningham/brains-cad-brain
cd brains-cad-brain && npm run setup

# 5. Add your Clerk sign-in keys (see section 6), save, then rebuild with them
open -e .env
npm run setup

# 6. Start automatically at login, with a nightly 2 am backup
npm run service:install
```

Then:
- On the Mac, open **http://localhost:3000** and **sign in yourself first** (you become the Owner).
- From other devices on the same network, open **http://&lt;mac-name&gt;.local:3000**. To find
  `<mac-name>`, look in System Settings → General → Sharing → *Local hostname*, or run
  `scutil --get LocalHostName`.
- Keep the Mac awake and logged in ([section 8](#8-start-automatically-and-keep-the-mac-awake)).
- Turn on the nightly iCloud Drive backup copy ([section 10](#10-backups-to-icloud-drive-and-restoring)).
- Check everything with `npm run doctor`.

---

## 1. What you need

- **A Mac that stays on.** It's the server, so it must be on, logged in and awake whenever people
  use the app. Any Mac from the last several years is enough (Apple silicon or Intel).
- **Node.js 22 (LTS) or newer**, the engine the app runs on. **Git** downloads the code and its updates.
- **Access to the private GitHub repository** `KolinCunningham/brains-cad-brain`, either through
  your GitHub account or a "deploy key" (step 3).
- **A free Clerk account** ([clerk.com](https://clerk.com)). Clerk runs the Google and Apple sign-in.
- For access from **outside** your office network (option B): a **domain name** you own (for example
  `yourbusiness.com.au`) and a free **Cloudflare** account.

---

## 2. Install the tools

1. Install **Homebrew** ([brew.sh](https://brew.sh)):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   It asks for your Mac password, which doesn't show as you type, and may install Apple's
   "Command Line Tools". At the end it prints **Next steps** with two commands that add Homebrew to
   your PATH. Run those too.
2. Install Node.js, Git and the GitHub tool:
   ```bash
   brew install node git gh
   ```
3. Check:
   ```bash
   node --version
   git --version
   ```
   Node should print `v22` or higher.

---

## 3. Get access to the code on GitHub

The repository is private. Pick **one** way to give this Mac access.

### Option 1 (easiest): log in with the GitHub tool

```bash
gh auth login
```
Answer: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git with your GitHub credentials) →
**Login with a web browser**. Copy the one-time code, press Enter and approve it in the browser.
Your GitHub account must have access to the repository.

### Option 2 (more locked-down): a read-only deploy key

A deploy key gives this one computer **read-only** access to this one repository, and nothing else.

1. Create a key:
   ```bash
   ssh-keygen -t ed25519 -C "bcb-server" -f ~/.ssh/bcb_deploy -N ""
   ```
2. Copy the **public** half to the clipboard:
   ```bash
   pbcopy < ~/.ssh/bcb_deploy.pub
   ```
3. On GitHub, open the repository → **Settings → Deploy keys → Add deploy key**. Title
   `BCB server`, paste the key, and leave **Allow write access** unticked. Only a repository admin
   can do this.

---

## 4. Download (clone) the app

Put the app in your **home folder**: `~/brains-cad-brain`. **Don't** use Desktop, Documents,
Downloads or iCloud Drive. macOS privacy protection stops background services from reading those
folders, so auto-start would fail. Syncing a live database also risks damaging it.

**If you used `gh auth login`:**
```bash
cd ~
gh repo clone KolinCunningham/brains-cad-brain
cd brains-cad-brain
```

**If you used a deploy key:**
```bash
cd ~
git -c core.sshCommand="ssh -i ~/.ssh/bcb_deploy" clone git@github.com:KolinCunningham/brains-cad-brain.git
cd brains-cad-brain
git config core.sshCommand "ssh -i ~/.ssh/bcb_deploy"
```
(The last line makes future updates use the same key. If asked "Are you sure you want to continue
connecting?", type `yes`.)

Every command from here on runs **inside the `brains-cad-brain` folder**. In a new Terminal window,
go back there first with `cd ~/brains-cad-brain`.

---

## 5. First install: `npm run setup`

```bash
npm run setup
```

This takes a few minutes the first time. It:

1. checks your Node.js version
2. downloads the exact libraries the app needs (`npm ci`)
3. creates your settings file **`.env`** (copied from `.env.example`). If `.env` already exists, it
   is never overwritten.
4. creates the `data/`, `logs/` and `backups/` folders
5. creates the database `data/bcb.db`, or brings its structure up to date. It **never deletes
   data**: if a change would remove anything, it stops and tells you.
6. adds starter data (tax rates, lists, a starter price list and one sample client and estimate),
   but **only** if the database is empty
7. builds the app

You can run `npm run setup` again at any time. It only does what's needed. **Run it again every time
you change `.env`**, because the sign-in key is built into the app.

At the end it warns that sign-in isn't configured yet. That's expected. Do step 6 next.

---

## 6. Sign-in: choose option A or B

Everyone signs in with **Google** or **Apple** through Clerk. Access is invite-only:

- The **first person to sign in becomes the Owner**. Sign in yourself straight after the server is
  running. To make sure nobody else can claim it, put your email in `.env` first:
  `BCB_OWNER_EMAIL=you@yourbusiness.com.au`.
- The Owner adds people in **Settings → Users** (name, email, role). Those people can then sign in
  with Google or Apple using that email. Anyone else sees "ask the business owner to add you".

| | **A. Local network only** | **B. Access from anywhere** |
|---|---|---|
| Who can use it | Devices on the same Wi-Fi or network as the Mac | Anyone with the link, from anywhere (still invite-only) |
| Address | `http://<mac-name>.local:3000` or `http://192.168.x.x:3000` | `https://bcb.yourbusiness.com.au` |
| Needs | A free Clerk account | Your own domain, Clerk **production** instance, Cloudflare (free) |
| Google sign-in | Yes, works straight away | Yes (needs your own Google OAuth app) |
| Apple sign-in | No. Apple needs HTTPS and a real domain | Yes (needs a paid Apple Developer account) |
| Setup time | 10 minutes | 1–2 hours, plus waiting for DNS |

You can start with A and move to B later. Nothing in the app's data changes.

### Option A: local network only

1. Sign up at [dashboard.clerk.com](https://dashboard.clerk.com) and **Create application**. Name it
   after your business (people see "Sign in to <name>"). Tick **Google** (and Apple if you like; it
   won't work until option B). You can untick **Email** so Google is the only way in.
2. In the Clerk dashboard open **Configure → API keys**. You're in the **Development** instance,
   which is the default. Copy the **Publishable key** (`pk_test_…`) and the **Secret key** (`sk_test_…`).
3. Open the settings file with `open -e .env`, paste the keys after the `=` signs, and save (⌘S):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxx
   CLERK_SECRET_KEY=sk_test_xxxxxxxx
   ```
4. Rebuild with the keys:
   ```bash
   npm run setup
   ```
5. Go to step 7.

In Development mode Clerk uses its own shared Google credentials, so you don't need a Google Cloud
project, and the sign-in page shows a small "Development mode" label. That's normal. Development
instances are meant for testing and small teams. If you outgrow it, or need Apple, move to option B.

### Option B: access from anywhere (own domain + HTTPS + Cloudflare Tunnel)

**Cloudflare Tunnel** connects your Mac to Cloudflare from the inside. You don't need to open ports
on your router, you don't need a fixed IP address, and Cloudflare handles the HTTPS certificate for
free. This guide uses the subdomain `bcb.yourbusiness.com.au`. Replace it with your own.

#### B1. Put your domain on Cloudflare

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a domain** →
   enter `yourbusiness.com.au` → Free plan.
2. Cloudflare shows two **nameservers**. Log in where you bought the domain (e.g. GoDaddy, Crazy
   Domains, VentraIP) and replace the nameservers with Cloudflare's. Wait until Cloudflare says the
   domain is **Active**. That can take a few hours.
   (Cloudflare copies your existing DNS records, so your website and email keep working. Check the
   list it imports.)

#### B2. Create the tunnel

1. In Cloudflare open **Zero Trust → Networks → Tunnels** (newer accounts:
   **Networks → Connectors → Cloudflare Tunnels**) → **Create a tunnel** → **Cloudflared** → name
   it `bcb-server`.
2. Choose **macOS**. Cloudflare shows a command with a long token. On the Mac run:
   ```bash
   brew install cloudflared
   sudo cloudflared service install <TOKEN>
   ```
   The tunnel is now a background service that starts with the Mac. In the dashboard the connector
   shows **Healthy**.
3. Click **Next** (or the tunnel's **Public Hostname** tab → **Add a public hostname**):
   - Subdomain: `bcb`, Domain: `yourbusiness.com.au`
   - Service: Type **HTTP**, URL **`localhost:3000`**
   - Save.
4. Recommended: so the app can **only** be reached through the tunnel, add `HOST=127.0.0.1` to `.env`.

#### B3. Clerk production instance

1. In the Clerk dashboard, use the switch at the top to go from **Development** to **Production** →
   **Create production instance**. Enter the domain people will use: `bcb.yourbusiness.com.au`.
2. Clerk lists some **DNS records** (CNAMEs such as `clerk.…` and `accounts.…`, plus email ones).
   Add each one in Cloudflare → your domain → **DNS → Add record**. Copy the name and target
   exactly, and set **Proxy status to "DNS only" (grey cloud)**. Clerk's records must not go
   through Cloudflare's proxy.
3. Back in Clerk open **Domains** and wait until every record shows **Verified**. Certificates are
   then issued automatically.
4. Production needs **your own** Google (and Apple) credentials. See the checklist below.
5. Open **Configure → API keys** while in **Production**. Copy the `pk_live_…` and `sk_live_…`
   keys into `.env` instead of the `pk_test_`/`sk_test_` ones. Run `npm run setup`, restart
   (`npm run service:stop` then `npm run service:start`), and open `https://bcb.yourbusiness.com.au`.

#### Google and Apple setup checklist (production)

1. **Clerk** (dashboard.clerk.com, Production instance): under **User & authentication → SSO
   connections**, enable **Google** and **Apple**. Under *Email, phone, username* you can turn off
   password sign-in so social sign-in is the only way in. Set the application name to your business name.
2. **Google** (Google Cloud Console → APIs & Services):
   - Configure the **OAuth consent screen**: External, app name, support email and your domain.
     Then **publish** it ("In production"). While it says "Testing", only listed test users can sign in.
   - **Credentials → Create OAuth client ID → Web application**. Under **Authorized redirect URIs**
     add the redirect URI shown on Clerk's Google connection page.
   - Paste the Client ID and Client secret into Clerk's Google connection ("Use custom credentials").
3. **Apple** (developer.apple.com → Certificates, IDs & Profiles; needs a paid Apple Developer account):
   - Create an **App ID** with *Sign in with Apple* turned on.
   - Create a **Services ID**. This is the "client ID". Turn on Sign in with Apple and configure
     it: primary App ID, your domain, and the **Return URL** shown in Clerk.
   - Create a **Key** with Sign in with Apple enabled and download the `.p8` file.
   - In Clerk's Apple connection enter the Services ID, Team ID, Key ID and the `.p8` contents.
   - People who choose **Hide my email** get a `@privaterelay.appleid.com` address. Invite that
     address in Settings → Users, or ask them to share their real email.
   - Apple only works with **HTTPS and a real domain**, so Apple sign-in is option B only.
     Google works in both options.
4. **`.env`** on the server: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live_…), `CLERK_SECRET_KEY`
   (sk_live_…), and optionally `BCB_OWNER_EMAIL`. The `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and similar
   lines are already filled in. **Never** add `BCB_AUTH_BYPASS` or `BCB_ALLOW_TEST_BYPASS`. Those
   are for automated tests only, and `npm run serve` refuses to start if either is set.
5. Run `npm run setup`, restart, **sign in as the owner first**, then add your team in Settings → Users.

---

## 7. Start the server and open it

To try it out in a Terminal window:
```bash
npm run serve
```
You should see `Listening on 0.0.0.0:3000` and `Ready`. Closing the window, or pressing **Ctrl+C**,
stops the server. For everyday use, install auto-start instead (step 8). Stop this one first.

- On the Mac itself, open **http://localhost:3000**
- From other devices on the same network, open **http://&lt;mac-name&gt;.local:3000**. The name is
  in System Settings → General → Sharing → *Local hostname*, or run `scutil --get LocalHostName`.
  If a device can't use `.local` names (some older Android phones), use the IP address instead:
  run `ipconfig getifaddr en0`, then open `http://<that IP>:3000`.
- With option B, open **https://bcb.yourbusiness.com.au**

The first time, macOS may ask **"Do you want the application node to accept incoming network
connections?"**. Click **Allow**. Then **sign in yourself first** to become the Owner.

Settings you can change in `.env` (afterwards, run `npm run setup` and restart):

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port number in the address |
| `HOST` | `0.0.0.0` | `0.0.0.0` = other devices can connect; `127.0.0.1` = this Mac only (fine with Cloudflare Tunnel) |
| `BCB_OWNER_EMAIL` | (none) | Only this email can become the Owner on first sign-in |
| `BCB_BACKUP_DIR` | (none) | Extra folder to copy every backup to (e.g. iCloud Drive) |
| `BCB_BACKUP_KEEP` | `30` | How many backups to keep |

Check everything at any time:
```bash
npm run doctor
```
It reports Node, `.env` and keys, the database (with record counts), the build, whether the server
is running, when the last backup was taken, and whether GitHub has a newer version.

Server output is saved in `logs/server-YYYY-MM.log`. Logs are kept for 12 months.

---

## 8. Start automatically and keep the Mac awake

### Auto-start

```bash
npm run service:install
```
This creates two background jobs in `~/Library/LaunchAgents`:
- `com.brainscadbrain.server`: starts the server now and whenever you log in, and restarts it if it stops
- `com.brainscadbrain.backup`: runs a backup every night at 2:00 am

It prints exactly what it created and how to undo it. To control it:
```bash
npm run service:status      # installed? running?
npm run service:stop        # stop the server (e.g. before a restore)
npm run service:start       # start it again
npm run service:uninstall   # remove auto-start and nightly backup (your data is untouched)
```
**If you upgrade Node.js** (`brew upgrade`), run `npm run service:install` again.

### Keep the Mac awake and logged in

The jobs only run while your user is **logged in**, and nothing works while the Mac is asleep.

1. **Never sleep.** Open System Settings → **Energy** (on a MacBook: **Battery → Options**):
   - turn **on** "Prevent automatic sleeping when the display is off". The screen can still turn off.
   - turn **on** "Wake for network access"
   - turn **on** "Start up automatically after a power failure" (desktop Macs)

   Or do all of that in Terminal:
   ```bash
   sudo pmset -a sleep 0 disksleep 0 womp 1 autorestart 1
   ```
   (`sleep 0` = never sleep, `womp 1` = wake for network, `autorestart 1` = start up after a power
   failure. Check with `pmset -g`.)
2. **Log in automatically after a restart.** System Settings → **Users & Groups → Automatically log
   in as** → your user. This option isn't available while **FileVault** is on. If you keep
   FileVault, someone has to log in after each restart, and the server starts the moment they do.
3. **Updates:** macOS updates can restart the Mac. With steps 1–2 done, it comes back up on its own.
   Check with `npm run doctor` after an update.
4. A MacBook used as a server should stay plugged in, with the lid open (or connected to an
   external display).

---

## 9. Updating to a new version

```bash
npm run update
```

It:
1. refuses to start if files from GitHub were edited on this Mac, so nothing gets lost
2. asks GitHub for news. If there's nothing new it says **"Already up to date"** and stops.
3. takes a **backup**
4. stops the auto-start server if it's installed. If you started the server by hand with
   `npm run serve`, it asks you to stop it (Ctrl+C) and run the update again.
5. downloads the new version (`git pull --ff-only`), installs libraries, updates the database
   structure (never deleting data) and rebuilds
6. starts the auto-start server again, or tells you to run `npm run serve`

If something fails during the rebuild, it **puts the previous version back automatically**.

---

## 10. Backups (to iCloud Drive) and restoring

### Taking backups

```bash
npm run backup
```
This saves a complete, checked copy of the database to `backups/bcb-YYYY-MM-DD-HHmm.db`. It's safe
to run while people are working. The newest 30 backups are kept (change this with
`BCB_BACKUP_KEEP`). With auto-start installed (step 8), a backup runs **every night at 2 am**.

### Nightly copy to iCloud Drive

If the Mac's disk dies, backups on that disk die with it. To copy every backup to **iCloud Drive**
as well:

1. Make sure iCloud Drive is on: System Settings → your name → iCloud → **iCloud Drive**.
2. Add this line to `.env` (`open -e .env`), exactly as written:
   ```
   BCB_BACKUP_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/BrainsCadBrain-backups
   ```
   (That is iCloud Drive's real location on disk. The folder appears in Finder as
   **iCloud Drive → BrainsCadBrain-backups**. `~` means your home folder. Don't add quotes.)
3. Test it now:
   ```bash
   npm run backup
   ```
   It should say `Copied to …/BrainsCadBrain-backups/bcb-….db`. The iCloud copy keeps the newest
   30 too.
4. **The next morning**, run `npm run doctor` and check the line
   `Extra backup folder … (N backups)`. If the nightly copy didn't arrive, `logs/service-backup.log`
   will say **"Operation not permitted"**. macOS has blocked the background job from iCloud Drive.
   To fix it: System Settings → **Privacy & Security → Full Disk Access** → **+** → press
   **⌘⇧G**, type `/opt/homebrew/bin/node`, click **Open**, and make sure the switch is on.
   (Repeat this after a Node.js upgrade.)

An external USB drive works the same way, for example
`BCB_BACKUP_DIR=/Volumes/BackupDrive/BrainsCadBrain-backups`.

Also keep a copy of your **`.env`** file somewhere safe, such as a password manager. It holds your
Clerk keys.

### Restoring a backup

1. Stop the server:
   - auto-start → `npm run service:stop`
   - started by hand → Ctrl+C in its window
2. See the available backups:
   ```bash
   npm run restore
   ```
3. Restore one. Use the name from the list, or the full path to a file. To restore from iCloud
   Drive, drag the file from Finder into Terminal after typing `npm run restore -- `.
   ```bash
   npm run restore -- bcb-2026-11-18-0200.db
   ```
   Restore refuses while the server is running. It checks the backup file is a healthy database,
   **saves a safety copy of the current database first** (`backups/…-before-restore.db`), swaps in
   the backup and brings its structure up to date.
4. Start the server again: `npm run service:start`, or `npm run serve`.

### Moving to a new Mac

Install on the new Mac (Quick install, steps 1–5). Copy your `.env` across, then run
`npm run setup` again. Restore the latest backup (it's in iCloud Drive) with
`npm run restore -- <file>`, then `npm run service:install`.

---

## 11. Troubleshooting

Start with `npm run doctor`. Its FAIL and WARN lines usually say what to do. Server messages are in
`logs/server-YYYY-MM.log`. Auto-start and nightly-backup messages are in `logs/service-server.log`
and `logs/service-backup.log`.

| What you see | What to do |
|---|---|
| Every page shows **"Internal Server Error"**, and the log says **"Clerk keys are missing from your environment"** | The Clerk keys in `.env` are empty, or you added them but didn't rebuild. Paste the keys, run `npm run setup`, restart. |
| `npm run serve` says **"Refusing to start: BCB_AUTH_BYPASS is set"** | Delete the `BCB_AUTH_BYPASS` / `BCB_ALLOW_TEST_BYPASS` lines from `.env` / `.env.local`. They switch sign-in off and are for automated tests only. |
| **"Port 3000 is already in use"** | It's already running, probably under auto-start (`npm run service:status`). Or use another port: `PORT=3001` in `.env`. |
| Works on the Mac but **not from other devices** | Same Wi-Fi or network? Try the IP address instead of `.local`. Check System Settings → Network → Firewall → Options: *node* must be allowed. `HOST` must not be `127.0.0.1` for option A. |
| Nothing works in the morning | The Mac slept or logged out. See step 8. |
| Sign-in completes but **comes back to the sign-in page**, on `http://…:3000` | Check the Mac's date and time are correct. Some browsers are strict about sign-in cookies on plain `http://` addresses. Try another browser, or use option B (HTTPS). |
| **"Ask the business owner to add …"** after signing in | That person isn't in Settings → Users (or is inactive). The Owner adds them with the **same email** they sign in with. |
| The wrong person became Owner | Set `BCB_OWNER_EMAIL` before the first sign-in. Afterwards, an Owner can change roles in Settings → Users. |
| Apple sign-in error such as `invalid_client` | The Services ID, Return URL or domain in Apple's setup doesn't exactly match what Clerk shows. |
| Google: "Access blocked: app is in testing" | Publish the OAuth consent screen in Google Cloud. |
| `npm run update`: **"Files … have been changed on this computer"** | Someone edited the app's files. To throw those edits away: `git checkout -- .` then update again. |
| `update` / `setup`: **"schema change would delete or rename existing data"** | Nothing was changed. Keep the backup and contact your developer. A manual migration is needed. |
| `npm run update`: **"Could not reach GitHub"** | Internet down, or this Mac lost GitHub access: `gh auth status`, or check the deploy key is still on the repo. |
| Auto-start doesn't start, and `logs/service-server.log` says **"Operation not permitted"** | The app folder is inside Desktop, Documents, Downloads or iCloud. Move it to `~/brains-cad-brain` and run `npm run service:install` again. |
| Nightly iCloud copy missing | See step 10, item 4 (Full Disk Access for node). |
| Auto-start stopped after `brew upgrade` | Run `npm run service:install` again. |
| Option B: Cloudflare shows **error 502 / 1033** | Error 1033 means the tunnel connector isn't running (`sudo launchctl list \| grep cloudflared`). Error 502 means the app isn't running on port 3000 (`npm run doctor`). |

---

## 12. Command cheat sheet

Run these in `~/brains-cad-brain`.

| Command | What it does |
|---|---|
| `npm run setup` | First install, and after changing `.env` (safe to repeat) |
| `npm run serve` | Run the server in this window |
| `npm run doctor` | Health check |
| `npm run update` | Get the newest version from GitHub (backs up first) |
| `npm run backup` | Back up the database now |
| `npm run restore` | List backups. Add `-- <file>` to restore one (stop the server first) |
| `npm run service:install` | Auto-start at login plus nightly 2 am backup |
| `npm run service:status` / `service:stop` / `service:start` | Control the auto-start server |
| `npm run service:uninstall` | Remove auto-start (data untouched) |

---

## Appendix A: Windows server

Everything above applies except these steps. Use **PowerShell**. "As administrator" means
right-click PowerShell and choose **Run as administrator**.

- **Tools (step 2):**
  `winget install OpenJS.NodeJS.LTS`, `winget install Git.Git`, `winget install GitHub.cli`.
  Then close PowerShell and open it again.
- **Folder (step 4):** `C:\Users\<you>\brains-cad-brain`. Not a OneDrive-synced folder.
  Deploy key: if `~/.ssh` doesn't exist, run `mkdir ~/.ssh` first. If `-N ""` is rejected, leave it
  out and press Enter twice.
- **Editing `.env`:** `notepad .env`
- **Firewall:** allow the prompt on *Private networks*, or as administrator:
  `New-NetFirewallRule -DisplayName "Brains Cad Brain" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private`
- **Address from other devices:** `http://<PC-name>:3000` or the IPv4 address from `ipconfig`.
- **Auto-start (step 8):** in PowerShell **as administrator**, in the app folder, run
  `npm run service:install`. This creates the Task Scheduler tasks `\brainscadbrain\Server` and
  `\brainscadbrain\Backup`. The server starts when Windows starts, even before anyone logs in, runs
  without a window and restarts if it stops. The backup runs nightly at 2 am, or as soon as possible
  if the PC was off. Set Settings → System → Power → **Sleep: Never**.
- **Backup copy:** e.g. `BCB_BACKUP_DIR=C:\Users\<you>\OneDrive\BrainsCadBrain-backups`.
- **Cloudflare Tunnel:** install the `.msi` from the tunnel page, then as administrator run
  `cloudflared.exe service install <TOKEN>`.

## Appendix B: Linux server

- **Tools (Ubuntu/Debian):**
  `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -` then
  `sudo apt-get install -y nodejs git gh`. If `gh` is missing, use a deploy key.
- **Folder:** `~/brains-cad-brain`. Edit settings with `nano .env`.
- **Firewall (option A):** `sudo ufw allow 3000/tcp`. Address: `http://<hostname>.local:3000` (needs
  avahi) or the IP from `hostname -I`.
- **Auto-start:** `npm run service:install` creates systemd user units in `~/.config/systemd/user`:
  `brainscadbrain.service` and `brainscadbrain-backup.timer` (nightly at 2:00). It also turns on
  "linger" so they run at boot without a login. If it prints a `sudo loginctl enable-linger …`
  command, run that. Live log: `journalctl --user -u brainscadbrain -f`.
- **Cloudflare Tunnel:** the `apt` commands from the tunnel page, then
  `sudo cloudflared service install <TOKEN>`.

<sub>Tested status: the scripts were run end to end on macOS: setup, doctor, backup, serve, restore,
update, and generating and validating the launchd files with `plutil -lint`. The Windows Task
Scheduler and Linux systemd definitions are generated by the same code and unit-tested, but they
haven't yet been run on a real Windows or Linux machine. On those systems `npm run serve` always
works, and `npm run service:install -- --dry-run` writes the definition files without registering
anything, so you can inspect them. There is no Docker setup.</sub>
