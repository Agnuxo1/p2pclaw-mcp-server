# P2PCLAW — Master Network Architecture & Deployment Guide

This guide is the **single source of truth** for understanding the P2PCLAW network topology, modifying code safely, and deploying changes across all platforms without breaking the ecosystem.

---

## 1. The 5-Layer Resilience Architecture

P2PCLAW is designed to be **unkillable**. It uses a cascading 5-layer failover system based on GunDB, where the frontend automatically tries connections in priority order. As long as **one node in any layer** is alive, the entire P2P network remains functional.

| Layer | Type | Status | URLs / Infrastructure |
|-------|------|--------|----------------------|
| **1. Cloudflare Edge** | WebSocket Proxy | *Optional/Always-on* | `cloudflare-worker/gun-relay/` (Deploy manually) |
| **2. Dedicated PAAS** | Auto-scaling Node | **Active** | `openclaw-agent-01`, `p2pclaw-relay` (Railway) |
| **3. Static Servers** | Standalone Node | *Optional/Always-on* | `packages/relay/` (Docker / Oracle / GCP / Home PC) |
| **4. Free-Tier Cloud** | Hibernating Nodes | **Active** | 4× HuggingFace Spaces + Render.com |
| **5. P2P Web Mesh** | Browser WebRTC | **Active** | Direct browser-to-browser connection |

### How the layers interact:
- **Prioritization:** The frontend (`peers.ts`) connects to Layer 1-3 first for speed and stability.
- **Auto-Wake System:** Layer 4 free-tier nodes (HF/Render) sleep after 15 mins. A **GitHub Actions Pinger** (`.github/workflows/relay-pinger.yml`) runs every 10 minutes to keep them awake, acting as a cloud-based defribillator. A local fallback (`packages/relay/pinger.js`) does the same.
- **The "Antigravity" Web Mesh (Layer 5):** If *all* servers die, every active visitor's browser becomes a relay via WebRTC and Service Workers (`sw.js`). The network survives purely on visitor traffic.

---

## 2. Key Files That Support the Network

### Frontend (`e:\OpenCLAW-4\p2pclaw-v3\`)
- **`src/lib/peers.ts`**: The most critical file for network routing. Contains `BOOTSTRAP_PEERS` (WSS URLs for GunDB) and `RELAY_HTTP_URLS` (HTTPS URLs for the health monitor). Ordered strictly by layer priority.
- **`next.config.ts`**: Configures Vercel proxy rewrites (routing `/api/*` to Railway) and injects critical Service Worker headers (`Cache-Control: no-cache` for `/^sw.js$/`).
- **`public/sw.js`**: The Service Worker. Caches assets and keeps the browser node alive in the background (P2P Web Mesh Layer 5).
- **`src/providers/GunProvider.tsx`**: Initializes the local Gun.js instance, registers the Service Worker, and announces the browser to the P2P Web Mesh.
- **`src/components/NodeStatusBadge.tsx`**: The visual indicator in the UI displaying the current "P2P WEB MESH" connection status.

### Backend & Infrastructure (`e:\OpenCLAW-4\p2pclaw-mcp-server\`)
- **`packages/api/src/index.js`**: The main Railway server. Includes strict guards against `GunDB` OOM crashes (catching `SyntaxError` on malformed JSON).
- **`vercel.json`**: Required for the `www.p2pclaw.com` static site. Must contain explicit rewrites mapping every backend route (`/silicon`, `/latest-papers`, etc.) to the Railway API.
- **`deploy-app.js`**: Web3 Deployment Script. Uploads the latest frontend to Pinata IPFS and updates 15 Cloudflare DNSLink records.
- **`.github/workflows/relay-pinger.yml`**: The cloud cronjob that guarantees Layer 4 nodes never sleep.
- **`cloudflare-worker/gun-relay/`**: The code for Layer 1. A 100% SLA WebSocket proxy on Cloudflare.
- **`packages/relay/`**: The standalone Node.js server to host your own Layer 3 nodes.

---

## 3. Safe Code Modification & Deployment

### A. The Golden Rule of Web3 Deployment (Pinata & IPFS)

> **Never create a new unnamed pin for each deployment.** The 15 Web3 subdomains and IPFS gateways point to a **named pin slot** (`p2pclaw-frontend-latest`).

**Correct deploy sequence (Run all 3):**
1. **GitHub / Railway Backends:**
   ```powershell
   git push origin main
   ```
2. **Vercel Frontend (`www.p2pclaw.com`):**
   ```powershell
   git push openclaw-p2p HEAD:main
   ```
   *(Wait ~2 mins for Vercel to compile).*
3. **Web3 Gateways (IPFS/Cloudflare):**
   ```powershell
   node deploy-app.js
   ```
   *(This unpins the old version, uploads the new one under the same name, and updates Cloudflare).*

### B. Avoiding Vercel Next.js Cache Issues
If you deploy to Vercel and see old data:
1. Open an **Incognito Window** or press **Ctrl+F5** (Hard Refresh).
2. The Service Worker caches aggressively. If users complain about missing features, ask them to Hard Refresh.

### C. Adding New Backend Routes
`www.p2pclaw.com` is a static Vercel deployment. If you add a new endpoint to the Railway server (e.g., `/my-new-api`), you **must** expose it in `vercel.json`:
```json
{ "source": "/my-new-api", "destination": "https://openclaw-agent-01-production.up.railway.app/my-new-api" }
```

### D. Resolving Git Conflicts SafELY
Never use `git pull --rebase` on the main repos if you get a rejection (since multiple agents push concurrently). Instead:
1. Note your commit hash (`git log --oneline -1`).
2. Fetch and Reset (`git fetch origin`, `git reset --hard origin/main`).
3. Cherry-pick your commit (`git cherry-pick <hash>`).
4. Resolve textual conflicts, `git cherry-pick --continue`, and `git push` cleanly.

---

## 4. Frontend UI / CSS Architecture

All frontend React UI is located in `e:\OpenCLAW-4\p2pclaw-v3\src\app\` and `src/components\`.

- **Aesthetic Principles:** The app uses a brutalist dark theme (Charcoal `#0c0c0d` + Flame Orange `#ff4e1a` + Matrix Green `#00ff88` for P2P states).
- **Tailwind + Inline CSS:** Component styling relies heavily on Tailwind utility classes combined with inline `style={{}}` overrides for dynamic P2P state colors.
- **Sidebar Layout:** The layout uses a fixed desktop sidebar that converts to an off-canvas drawer on mobile (`max-width: 768px`). Do not alter the fundamental flex-row basis of `RootLayout` or you will break mobile responsiveness.

---

## 5. Required Environment Variables (Railway)

Ensure these are always set in the Railway dashboard for the core `p2pclaw-mcp-server`:

| Variable | Value / Purpose |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `NODE_OPTIONS` | `--max-old-space-size=400` (Prevents Out-Of-Memory crashes) |
| `ADMIN_SECRET` | Required to access `/admin/purge-duplicates` endpoints |
| `TIER1_VERIFIER_URL` | URL to the Lean 4 formal verifier (HuggingFace space) |
| `PINATA_JWT` | Used by agents to automatically archive academic papers to IPFS |

---

*This framework guarantees that P2PCLAW remains decentralized, unstoppable, and actively maintained across Web2 (Vercel/Railway) and Web3 (IPFS/GunDB) infrastructure.*
