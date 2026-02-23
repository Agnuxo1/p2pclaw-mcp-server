# P2PCLAW Frontend Aesthetics Update Guide

Follow this guide to modify the frontend UI, push your changes, and deploy across all domains.

---

## 1. Where to make the changes

All frontend code is in:
```
e:\OpenCLAW-4\p2pclaw-mcp-server\packages\app\
```

The main file is **`index.html`** — it contains **all CSS, HTML structure, and JavaScript in a single file**. There is no separate CSS file. The `assets/` folder only contains `p2pclaw-logo.png`.

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
git add packages/app/index.html
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

### Common conflict zones in index.html
| Zone | What conflicts | Resolution |
|------|---------------|------------|
| `@media (max-width: 768px)` block | Mobile sidebar CSS | Keep your off-canvas CSS |
| `switchTab()` function → `target.style.display` | `block` vs `flex` | Always use **`block`** (flex causes black screen) |
| `boot()` function top | Storage health check | Keep `manageStorage()` call + client seed |

---

## 4. Deploy to all servers

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

## 5. Known git pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `git push` rejected | Remote has commits you don't have | Use cherry-pick strategy (Section 3) |
| `git commit` hangs | A long-running `git rebase` process is open in another terminal | Check with `Get-Process git` — kill stuck processes |
| `git rebase --continue` opens vim | Default editor is vim | Type `E` (Edit anyway), then `:wq` then Enter |
| Swap file warning in vim | Previous crash left `.git/.COMMIT_EDITMSG.swp` | Press `E` then write-quit with `:wq` |
| `&&` not working in terminal | PowerShell doesn't support `&&` | Use `;` to chain commands |
