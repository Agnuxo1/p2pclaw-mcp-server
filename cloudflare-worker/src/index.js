/**
 * P2PCLAW Cloudflare Worker — IPFS Gateway + Railway API Proxy
 * ============================================================
 * §4.2.2 of P2PCLAW_Guia_Implementacion_Completa.md
 *
 * Routes:
 *   /api/*       → Railway backend (api-production-ff1b.up.railway.app)
 *   /gun         → Railway Gun.js relay
 *   /health      → pass-through to Railway
 *   /gun-relay/* → Railway Gun.js relay
 *   everything else → IPFS gateway with current CID (app.html, assets, etc.)
 *
 * Deploy: wrangler deploy
 */

// ── Config ─────────────────────────────────────────────────────────────────
const RAILWAY_BACKEND = "https://api-production-ff1b.up.railway.app";
const IPFS_GATEWAYS   = [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://dweb.link/ipfs/"
];

// Current deployed CID — updated by deploy-app.js via wrangler secret
// Fallback to this static CID if KV is unavailable
const FALLBACK_CID = "Qme5UDsjeNovFznJaYjQLXFQvvKPdeeXk2YgGLrh57aTL2";

// Routes that always go to Railway backend
const BACKEND_PREFIXES = [
    "/api/", "/gun", "/health", "/publish-paper", "/validate-paper",
    "/quick-join", "/agent-", "/latest-papers", "/mempool", "/leaderboard",
    "/tau-status", "/presence", "/heartbeat", "/fl/", "/silicon",
    "/admin/", "/hive", "/swarm", "/magnet", "/paper/",
    "/papers.html", "/papers"
];

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        // Route to Railway backend
        if (shouldRouteToBackend(path)) {
            return proxyToRailway(request, url, env);
        }

        // Route static assets and app to IPFS
        return serveFromIPFS(request, url, path, env, ctx);
    }
};

// ── Routing logic ─────────────────────────────────────────────────────────────
function shouldRouteToBackend(path) {
    for (const prefix of BACKEND_PREFIXES) {
        if (path === prefix || path.startsWith(prefix)) return true;
    }
    return false;
}

// ── Railway proxy ─────────────────────────────────────────────────────────────
async function proxyToRailway(request, url, env) {
    const railwayUrl = RAILWAY_BACKEND + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");

    try {
        const resp = await fetch(railwayUrl, {
            method: request.method,
            headers,
            body: request.method !== "GET" && request.method !== "HEAD"
                ? request.body
                : undefined,
        });

        const respHeaders = new Headers(resp.headers);
        addCorsHeaders(respHeaders);

        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers: respHeaders
        });
    } catch (err) {
        return errorResponse(502, `Backend unavailable: ${err.message}`);
    }
}

// ── IPFS serving ─────────────────────────────────────────────────────────────
async function serveFromIPFS(request, url, path, env, ctx) {
    // Resolve current CID (from KV if available, else fallback)
    const cid = await resolveCID(env);

    // Map path to IPFS content path
    let ipfsPath = path;
    if (ipfsPath === "/" || ipfsPath === "") {
        ipfsPath = "/app.html"; // Default to app dashboard
    }
    // Remove leading slash for IPFS URL construction
    const contentPath = ipfsPath.startsWith("/") ? ipfsPath.slice(1) : ipfsPath;
    const fullIpfsPath = contentPath || "app.html";

    // Try gateways in order until one succeeds
    for (const gateway of IPFS_GATEWAYS) {
        const ipfsUrl = `${gateway}${cid}/${fullIpfsPath}`;
        try {
            const resp = await fetch(ipfsUrl, {
                headers: { "Accept": request.headers.get("Accept") || "*/*" },
                cf: { cacheTtl: 3600, cacheEverything: true } // Cache in Cloudflare edge
            });

            if (resp.ok) {
                const respHeaders = new Headers(resp.headers);
                addCorsHeaders(respHeaders);
                // Cache hint for browsers
                respHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
                respHeaders.set("X-P2PCLAW-CID", cid);
                respHeaders.set("X-P2PCLAW-Gateway", gateway);

                return new Response(resp.body, {
                    status: resp.status,
                    headers: respHeaders
                });
            }
        } catch (_) {
            // Try next gateway
        }
    }

    // All IPFS gateways failed — fallback to Railway for app.html
    return proxyToRailway(request, url, env);
}

// ── CID resolution ─────────────────────────────────────────────────────────────
async function resolveCID(env) {
    // Try Cloudflare KV store first (updated by deploy-app.js)
    if (env && env.P2PCLAW_KV) {
        try {
            const kv_cid = await env.P2PCLAW_KV.get("current_cid");
            if (kv_cid) return kv_cid;
        } catch (_) { /* KV unavailable, use fallback */ }
    }
    // Try environment variable (set via wrangler secret)
    if (env && env.CURRENT_CID) return env.CURRENT_CID;
    return FALLBACK_CID;
}

// ── CORS helpers ─────────────────────────────────────────────────────────────
function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Agent-Id",
        "Access-Control-Max-Age": "86400"
    };
}

function addCorsHeaders(headers) {
    for (const [k, v] of Object.entries(corsHeaders())) {
        headers.set(k, v);
    }
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function errorResponse(status, message) {
    return new Response(JSON.stringify({ error: message, status }), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
}
