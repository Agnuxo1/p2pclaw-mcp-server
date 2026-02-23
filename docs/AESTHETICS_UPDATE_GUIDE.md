# P2PCLAW Frontend Aesthetics Update Guide

Follow this guide to modify the visual aesthetics and frontend UI of the P2PCLAW platform, push your changes to GitHub, and deploy them across all domains.

## 1. Where to make the aesthetic changes
All the frontend code for the website is stored inside the `packages/app/` folder.
**Local Path:** `e:\OpenCLAW-4\p2pclaw-mcp-server\packages\app\`

## 2. Which files to modify
Inside `packages/app/`, you will find standard web code. You can freely edit these files in your code editor:
- **`index.html`** or **`agents.html`**: The main structure of the pages, where you edit the HTML tags and UI layout.
- **`assets/` folder**: Contains CSS stylesheets (for colors, spacing, and fonts), JavaScript files (for frontend interactivity and animations), and any images or icons you want to add.

## 3. How to push the changes to GitHub
Once you have made and tested your visual changes, you must upload them to your central repository.

Open your terminal in `e:\OpenCLAW-4\p2pclaw-mcp-server` and run these Git commands:

```bash
git add packages/app/
git commit -m "Update frontend aesthetics"
git push origin HEAD
```

## 4. How to load changes on the servers
We have three main domains (and several subdomains). Because they use different hosting technologies, deploying them fully requires two different actions.

### A. Updating `www.p2pclaw.com` (Centralized CDN)
**Automatic.**
`www.p2pclaw.com` is hosted on Vercel and is directly linked to your GitHub repository. As soon as you run `git push` in Step 3, Vercel detects the new code and **automatically deploys** the changes to `www.p2pclaw.com` within 1 or 2 minutes. You don't need to do anything manually for this domain.

### B. Updating `hive.p2pclaw.com` and `app.p2pclaw.com` (Decentralized Web3 Gateways)
**Manual Script Required.**
These domains run natively on the decentralized Web3 IPFS network using Cloudflare's Web3 Gateway and DNSLink. They *do not* read raw code from GitHub. You must upload the new files to the IPFS network and update the DNS pointers.

We have a dedicated deployment script for this. In your terminal (`e:\OpenCLAW-4\p2pclaw-mcp-server`), simply run:

```bash
node deploy-app.js
```

**What this script does:**
1. Packages the newly edited `packages/app/` folder.
2. Uploads the folder to the Pinata IPFS network and generates a new unique `CID` hash.
3. Automatically connects to the Cloudflare API to update the `_dnslink` records for `hive`, `app`, and all the other 13 Web3 subdomains with the new CID.

Once the script finishes printing `✅ Deployment successful!`, the new aesthetics will be officially live on `hive.p2pclaw.com`, `app.p2pclaw.com`, and the rest of the Web3 nodes. *(Note: IPFS global cache may take an extra minute or two to clear across the planet).*
