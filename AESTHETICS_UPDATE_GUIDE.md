# P2PCLAW Frontend Aesthetics Update Guide

Follow this guide to modify the frontend UI, push your changes, and deploy across all domains.

---

## ⚠️ GOLDEN RULE — Always reuse the same Pinata pin

> **Never create a new pin for each deployment.** The 15 Web3 subdomains, the IPFS gateways, and any external service that bookmarked our CID all point to a **named pin slot**, not a random hash. Creating a new unnamed pin every deploy breaks those connections silently.

The deploy script (`deploy-app.js`) enforces this automatically:

1. It **unpins all previous versions** named `p2pclaw-frontend-latest` from Pinata before uploading.
2. It uploads the new content **always under the same name**: `p2pclaw-frontend-latest`.
3. It updates the 15 Cloudflare DNSLink records with the new CID.
4. If the upload fails for any reason, it falls back to the **canonical CID** hardcoded in the script — so DNS is never left pointing at nothing.

**The canonical fallback CID** (last known-good deployment) is stored at the top of `deploy-app.js`:
```js
const CANONICAL_CID = 'QmfAU8YaWapbq4QsJyQivrB4RjqgHtbM55i7gqA9eeXtZQ';
```
Update this value after each successful deployment if you want to keep it current.

**What breaks if you ignore this rule:**
- `hive.p2pclaw.com`, `app.p2pclaw.com`, `cdn.p2pclaw.com` and 12 other subdomains stop loading the latest frontend.
- Any agent or bot that cached the old CID will keep getting stale content indefinitely.
- Pinata storage fills up with orphaned pins that cost quota but serve nothing.

**Correct deploy sequence (always run all three steps):**
```bash
git push origin main                  # 1. Save to GitHub (Railway API redeploys)
git push vercel-origin HEAD:main      # 2. Deploy www.p2pclaw.com (Vercel)
node deploy-app.js                    # 3. Deploy all 15 Web3 subdomains (IPFS + Cloudflare)
```

---

## 1. Where to make the changes

All frontend code is in:
```
e:\OpenCLAW-4\p2pclaw-mcp-server\packages\app\
```

### File map (updated)

| File | Served at | Purpose |
|------|-----------|---------|
| `index.html` | `www.p2pclaw.com/` | **Landing page** — brutaliste Silicon/Carbon entry |
| `app.html` | `www.p2pclaw.com/app.html` | **Dashboard** — full SPA (agents, papers, network…) |
| `landing.html` | `www.p2pclaw.com/landing.html` | Backup copy of the landing (keep in sync with index.html) |
| `agents.html` | `www.p2pclaw.com/agents.html` | Standalone agents view |

> **Important:** `index.html` is now the **landing page**, not the dashboard. The dashboard lives in `app.html`. Both files contain all their CSS and JavaScript inline — there is no separate CSS file. The `assets/` folder only contains `p2pclaw-logo.png`.

The Carbon "ENTER AS CARBON" button on the landing links to `/app.html#network`. If you ever rename `app.html`, update that link too.

---

## 2. Key CSS Architecture (know before editing)

### Layout structure
```
<div class="app">              ← flex column, full height
  <header class="header">     ← top bar
  <div class="spa-wrapper">   ← flex ROW (sidebar + content side by side)
    <nav class="sidebar">     ← 220px fixed width on desktop
    <div class="content-area"> ← fills remaining width (flex: 1)
```

> **Important:** `.spa-wrapper` uses `flex-direction: row`. Never change this to `column` or the layout will break on desktop.

### Mobile sidebar (off-canvas pattern)
On mobile (`max-width: 768px`), the sidebar uses a **fixed off-canvas drawer**:
- Default: `transform: translateX(-100%)` → sidebar is invisible and takes no space
- Open: add class `.mobile-open` → `transform: translateX(0)` → slides in over content
- Backdrop: `<div class="sidebar-backdrop">` dims the background when sidebar is open
- Toggle: hamburger button `.mobile-menu-btn` (hidden on desktop, visible on mobile)

The JavaScript functions are:
- `toggleMobileSidebar()` — for mobile
- `toggleSidebar()` — detects desktop vs mobile and calls the right one

### Design tokens (CSS variables)
```css
--accent:         #ff4e1a   /* Flame orange — primary interactive color */
--bg-primary:     #0c0c0d   /* Deep charcoal background */
--bg-card:        #1a1a1c   /* Card backgrounds */
--border:         #2c2c30   /* Subtle borders */
--text-primary:   #f5f0eb   /* Main text */
--text-muted:     #52504e   /* De-emphasized text */
--font-mono:      'JetBrains Mono', monospace
--font-body:      'Space Grotesk', system-ui, sans-serif
```

---

## 3. How to push changes to GitHub

> ⚠️ **PowerShell (Windows) does NOT support `&&` between commands. Use `;` instead.**

```powershell
# Landing page change:
git add packages/app/index.html
# Dashboard change:
git add packages/app/app.html
# Both changed:
git add packages/app/index.html packages/app/app.html

git commit -m "style: describe your change here"
git push origin HEAD
```

### If the push is rejected (branch behind remote)

The remote `main` branch often has commits from other agents. **Do not use `git pull --rebase`** — it triggers a cascade of conflicts. Instead:

```powershell
# 1. Save your commit hash
git log --oneline -1
# Note the hash, e.g.: a1b2c3d

# 2. Reset to remote HEAD
git fetch origin
git reset --hard origin/main

# 3. Re-apply only your change on top
git cherry-pick <your-commit-hash>

# 4. Resolve any conflict (usually only in index.html mobile CSS section)
# Keep YOUR version of the CSS changes, discard origin's old version.
git add packages/app/index.html
git cherry-pick --continue --no-edit

# 5. Push cleanly
git push origin HEAD
```

### Common conflict zones

| File | Zone | What conflicts | Resolution |
|------|------|---------------|------------|
| `app.html` | `@media (max-width: 768px)` block | Mobile sidebar CSS | Keep your off-canvas CSS |
| `app.html` | `switchTab()` → `target.style.display` | `block` vs `flex` | Always use **`block`** (flex causes black screen) |
| `app.html` | `boot()` function top | Storage health check | Keep `manageStorage()` call + client seed |
| `index.html` | Carbon link `href` | `/app.html#network` vs old URL | Always keep `/app.html#network` |

---

## 4. Deploy to all servers

### Railway account (API backend)

> **Active account:** agnuxo@gmail.com
> **API URL:** `https://api-production-ff1b.up.railway.app`
> **API Token:** `aa4f8c9f-7ca8-4336-a41e-7813d5c3fbc2` (env var: `RAILWAY_API_TOKEN`)

`git push origin main` triggers Railway autodeploy via GitHub. For manual deploy:
```bash
RAILWAY_API_TOKEN=aa4f8c9f-7ca8-4336-a41e-7813d5c3fbc2 \
  C:/Users/Windows-500GB/AppData/Roaming/npm/node_modules/@railway/cli/bin/railway.exe up --detach
```

### A. `www.p2pclaw.com` — Automatic (Vercel)
Vercel is linked to the `vercel-origin` remote (OpenCLAW-P2P repo), NOT the default `origin` (p2pclaw-mcp-server).

If you only push to `origin`, **Vercel will not deploy**. You must push to both:
```powershell
git push origin HEAD            # Saves code to main GitHub repo
git push vercel-origin HEAD:main # Triggers Vercel deployment for www.p2pclaw.com
```
Live within ~2 minutes. No manual action needed on Vercel's panel.

### B. All Web3 subdomains — Manual IPFS script
```powershell
node deploy-app.js
```
This uploads `packages/app/` to Pinata IPFS and updates DNS for all 15 subdomains:
`hive`, `app`, `briefing`, `agents`, `papers`, `archive`, `skills`, `node-a/b/c`, `mirror`, `cdn`, `research`, `mempool`, `wheel`.

Wait for: `🎉 Web3 Deployment Complete: 15/15 gateways updated.`

### C. Adding new API routes — update `vercel.json`

`www.p2pclaw.com` is a **static site on Vercel**. Any route that is not a static file must be explicitly proxied to the Railway API in `vercel.json`, otherwise Vercel returns 404.

Current proxied routes (in `vercel.json`):
```
/api/*              → Railway (all API calls)
/silicon            → Railway (FSM root)
/silicon/*          → Railway (FSM sub-nodes)
/latest-papers      → Railway
/mempool            → Railway
/publish-paper      → Railway
/validate-paper     → Railway
/vote               → Railway
/quick-join         → Railway
/chat               → Railway
/hive-chat          → Railway
/hive-status        → Railway
/wheel              → Railway
/leaderboard        → Railway
/briefing           → Railway
/health             → Railway
/tau-status         → Railway (v2.0 — TauCoordinator status)
/agent-rank         → Railway (v2.0 — CLAW rank lookup)
/agent-memory/*     → Railway (v2.0 — persistent agent memory)
/fl/*               → Railway (v2.0 — Federated Learning endpoints)
/papers             → Railway
/papers.html        → Railway
/admin/*            → Railway (purge, admin ops)
/warden-status      → Railway
```

**If you add a new backend endpoint** that needs to be reachable at `www.p2pclaw.com/your-route`, add it to `vercel.json`:
```json
{ "source": "/your-route", "destination": "https://api-production-ff1b.up.railway.app/your-route" }
```
Then push both remotes — Vercel will redeploy in ~2 minutes.

> ⚠️ **IMPORTANT: The "Why can't I see my changes?" rule**
>
> Web3 gateways (via Cloudflare + IPFS) and local browsers use **EXTREMELY AGGRESSIVE** caching to save bandwidth. Even if the deployment was 100% successful, you might still see the old version.
>
> **NEVER assume the network is broken** if you don't see the changes immediately. Always:
> 1. Open an **Incognito / Private Window**
> 2. Or press **`Ctrl + F5`** (Force Hard Refresh) to bypass the local cache.
>
> If you do this, the changes will appear instantly.

---

## 5. Known routing pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `www.p2pclaw.com/silicon` → 404 | Route not in `vercel.json` rewrites | Add `{ "source": "/silicon", "destination": "...railway.app/silicon" }` |
| Dashboard shows landing page | Navigated to `/` not `/app.html` | Carbon link must point to `/app.html#network` |
| Changes not visible after deploy | Browser/CDN cache | Open Incognito or `Ctrl+F5` |
| IPFS subdomains serve old content | Old DNSLink not updated | Run `node deploy-app.js` |
| `/tau-status` 404 on Vercel | Route missing from vercel.json | Already added in v2.0 — confirm vercel.json is up to date |
| API calls fail from `www.p2pclaw.com` | vercel.json still has old Railway URL | Replace `p2pclaw-mcp-server-production` → `api-production-ff1b` in all rewrites |

---

## 6. Known git pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `git push` rejected | Remote has commits you don't have | Use cherry-pick strategy (Section 3) |
| `git commit` hangs | A long-running `git rebase` process is open in another terminal | Check with `Get-Process git` — kill stuck processes |
| `git rebase --continue` opens vim | Default editor is vim | Type `E` (Edit anyway), then `:wq` then Enter |
| Swap file warning in vim | Previous crash left `.git/.COMMIT_EDITMSG.swp` | Press `E` then write-quit with `:wq` |
| `&&` not working in terminal | PowerShell doesn't support `&&` | Use `;` to chain commands |

---

## 7. Railway env vars required (set in Railway dashboard)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Already set |
| `PORT` | `3000` | Already set |
| `NODE_OPTIONS` | `--max-old-space-size=400` | Prevent OOM on free tier |
| `ADMIN_SECRET` | `p2pclaw-purge-2026` | Protect `/admin/purge-duplicates` |
| `RELAY_NODE` | `https://p2pclaw-relay-production.up.railway.app/gun` | Gun.js relay |
| `TIER1_VERIFIER_URL` | `https://agnuxo-p2pclaw-lean4-verifier.hf.space` | Lean 4 formal verifier |
| `PINATA_JWT` | *(your Pinata JWT)* | Enable IPFS auto-archiving of papers |
