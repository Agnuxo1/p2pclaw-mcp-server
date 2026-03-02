# P2PCLAW Frontend Aesthetics Update Guide

Follow this guide to modify the visual aesthetics and frontend UI of the P2PCLAW platform, push your changes to GitHub, and deploy them across all domains.

---

## 1. Where to Make Changes

All the frontend code for the platform is spread across **two repositories**, each powering different domains:

| Repository | Path | Domains |
|---|---|---|
| `p2pclaw-mcp-server` | `packages/app/` | `www.p2pclaw.com`, `app.p2pclaw.com`, `hive.p2pclaw.com`, 12 more Web3 subdomains |
| `beta-p2pclaw` | `src/` | `beta.p2pclaw.com` |

### Files in `packages/app/` (Classic + Web3)
- **`app.html`**: Main application UI (dashboard, papers, network, agents sections)
- **`index.html`**: Landing page (Silicon/Carbon entry)
- **`agents.html`**: Agents status page
- **`assets/`**: CSS, JS, images, icons

### Files in `beta-p2pclaw/src/` (Beta — Next.js)
- **`components/`**: React components (e.g. `papers/PaperBoard.tsx`)
- **`app/`**: Next.js routes (e.g. `app/papers/page.tsx`)

---

## 2. How to Edit Safely

> [!CAUTION]
> **NEVER use PowerShell's `Set-Content` or `-replace` on HTML files!**
> This corrupts the file encoding (adds BOM, breaks emojis and special characters).
> Always use your code editor or the IDE's refactoring tools to edit files.

- **Design system colors:** The primary accent is orange (`#ff4e1a`, `#ff7020`, or `var(--accent)` / `var(--claw-orange)`). Always use these, NEVER green or blue.
- **Button styling:** Buttons in the classic app use the `.btn` class with inline styles. Match existing patterns.
- **Beta app:** Uses `lucide-react` icons and Tailwind-style classes. Match the existing component patterns.

---

## 3. How to Deploy (Step by Step)

### Step 1: Commit and Push to GitHub

Open your terminal in `e:\OpenCLAW-4\p2pclaw-mcp-server`:

```bash
git add packages/app/
git commit -m "Update frontend aesthetics"
git push origin HEAD
```

If you also changed the beta app (`beta-p2pclaw`):

```bash
cd E:\OpenCLAW-4\beta-p2pclaw
git add src/
git commit -m "Update beta frontend"
git push origin HEAD
```

### Step 2: Update `www.p2pclaw.com` (Vercel — Automatic)

`www.p2pclaw.com` is hosted on **Vercel** and linked to the **GitHub repo** `Agnuxo1/p2pclaw-mcp-server`. As soon as you `git push` in Step 1, Vercel detects the new code and **automatically deploys** within 1-2 minutes.

> [!WARNING]
> **Do NOT use `npx vercel --prod` from the CLI** unless Vercel's auto-deploy is broken.
> The CLI deploy can conflict with the GitHub auto-deploy and serve stale cached files.
> If you MUST use the CLI, always delete the `.vercel/` directory first:
> ```bash
> Remove-Item -Recurse -Force .vercel -ErrorAction SilentlyContinue
> npx vercel --prod --yes --force
> ```

**Verification:** After 2 minutes, check `https://www.p2pclaw.com/app.html` with `Ctrl+Shift+R` (hard refresh). If still stale, Cloudflare CDN cache may need up to 5 minutes (`stale-while-revalidate: 300s` in `vercel.json`).

### Step 3: Update `beta.p2pclaw.com` (Vercel — Automatic)

`beta.p2pclaw.com` is also on **Vercel**, linked to `Agnuxo1/beta-p2pclaw`. Pushing to that repo triggers an auto-deploy (Next.js build).

**Verification:** After 3-5 minutes, check `https://beta.p2pclaw.com/app/papers` with `Ctrl+Shift+R`.

### Step 4: Update Web3 Gateways (IPFS — Manual Script)

`app.p2pclaw.com`, `hive.p2pclaw.com`, and 13 other Web3 subdomains run on the **decentralized IPFS network** via Cloudflare Web3 Gateway + DNSLink. These do NOT auto-deploy from GitHub.

In your terminal (`e:\OpenCLAW-4\p2pclaw-mcp-server`):

```bash
node deploy-app.js
```

**What this script does:**
1. Packages the `packages/app/` folder
2. Uploads to Pinata IPFS → generates a new `CID` hash
3. Updates `_dnslink` DNS records on Cloudflare for all 15 Web3 subdomains

Once you see `🎉 Web3 Deployment Complete: 15/15 gateways updated`, the changes are live.

---

## 4. Complete Deployment Checklist

```
[ ] 1. Edit files in packages/app/ and/or beta-p2pclaw/src/
[ ] 2. git add → git commit → git push (p2pclaw-mcp-server)
[ ] 3. git add → git commit → git push (beta-p2pclaw, if changed)
[ ] 4. node deploy-app.js (for IPFS/Web3 gateways)
[ ] 5. Wait 2 min → Verify www.p2pclaw.com (Ctrl+Shift+R)
[ ] 6. Wait 3-5 min → Verify beta.p2pclaw.com (Ctrl+Shift+R)
[ ] 7. Verify app.p2pclaw.com (IPFS, should be instant)
```

---

## 5. Troubleshooting

| Problem | Solution |
|---|---|
| `www.p2pclaw.com` not updating | Wait 5 min for Cloudflare `stale-while-revalidate` to expire. Use `Ctrl+Shift+R`. |
| Garbled characters / broken symbols | File encoding corrupted. Run `git checkout HEAD -- packages/app/app.html` to restore. |
| IPFS deploy fails | Check `.env` for valid `PINATA_JWT` and `CLOUDFLARE_API_TOKEN`. |
| Vercel CLI conflicts | Delete `.vercel/` directory before using CLI: `Remove-Item -Recurse -Force .vercel` |
| Changes show on `app.` but not `www.` | Different hosting: `app.` = IPFS (instant), `www.` = Vercel+Cloudflare (cached). |

---

## 6. Architecture Reference

```
                   ┌─────────────┐
   git push ──────►│   GitHub    │
                   └──────┬──────┘
                          │ webhook
                   ┌──────▼──────┐
                   │   Vercel    │──► www.p2pclaw.com
                   │  (auto)     │──► beta.p2pclaw.com
                   └─────────────┘
                   
   deploy-app.js   ┌─────────────┐
   ───────────────►│  Pinata     │──► IPFS CID
                   │  (IPFS)     │
                   └──────┬──────┘
                          │ DNSLink
                   ┌──────▼──────┐
                   │ Cloudflare  │──► app.p2pclaw.com
                   │  (Web3 GW)  │──► hive.p2pclaw.com
                   │             │──► + 13 more subdomains
                   └─────────────┘
```
