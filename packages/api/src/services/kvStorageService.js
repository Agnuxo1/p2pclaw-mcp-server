/**
 * P2PCLAW Paper Storage — Cloudflare R2 + KV dual backend
 * =========================================================
 * Primary:  R2 object storage (10GB free, S3-compatible)
 * Fallback: KV key-value store (1GB free, 100k reads/day)
 *
 * R2 Bucket:    p2pclaw-papers
 * KV Namespace: p2pclaw-papers (80a64e9e04a04ec589bd64c18f56e4f3)
 *
 * R2 uses AWS Signature V4 (S3-compatible). Papers stored as JSON objects.
 * Key format: papers/{paperId}.json
 *
 * Required env vars:
 *   R2_ACCESS_KEY_ID     — R2 S3 access key
 *   R2_SECRET_ACCESS_KEY — R2 S3 secret key
 *   R2_ENDPOINT          — S3 endpoint (https://<accountId>.r2.cloudflarestorage.com)
 *   R2_BUCKET            — Bucket name (default: p2pclaw-papers)
 *   CF_KV_TOKEN          — Cloudflare API token for KV fallback
 *   CF_ACCOUNT_ID        — Cloudflare account ID
 */

import crypto from 'crypto';

// ── R2 Configuration ─────────────────────────────────────────────────────

const R2_ACCESS_KEY = () => process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_KEY = () => process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ENDPOINT   = () => process.env.R2_ENDPOINT || 'https://eaffd2b52c95c69aaad8d859e9dcb52b.r2.cloudflarestorage.com';
const R2_BUCKET     = () => process.env.R2_BUCKET || 'p2pclaw-papers';
const R2_REGION     = 'auto';

// ── KV Fallback Configuration ────────────────────────────────────────────

const CF_ACCOUNT_ID = () => process.env.CF_ACCOUNT_ID || 'eaffd2b52c95c69aaad8d859e9dcb52b';
const CF_KV_TOKEN   = () => process.env.CF_KV_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
const CF_KV_NS_ID   = () => process.env.CF_KV_NS_ID || '80a64e9e04a04ec589bd64c18f56e4f3';

// ── AWS Signature V4 for R2 ──────────────────────────────────────────────

function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(secretKey, dateStamp, region, service) {
    let k = hmacSha256(`AWS4${secretKey}`, dateStamp);
    k = hmacSha256(k, region);
    k = hmacSha256(k, service);
    k = hmacSha256(k, 'aws4_request');
    return k;
}

function signR2Request(method, path, body, contentType) {
    const accessKey = R2_ACCESS_KEY();
    const secretKey = R2_SECRET_KEY();
    if (!accessKey || !secretKey) return null;

    const endpoint = R2_ENDPOINT();
    const bucket = R2_BUCKET();
    const host = endpoint.replace('https://', '');
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const datePart = dateStamp.substring(0, 8);

    const payloadHash = sha256Hex(body || '');
    const canonicalUri = `/${bucket}/${path}`;

    const headers = {
        'host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': dateStamp,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');

    const canonicalRequest = [
        method,
        canonicalUri,
        '',  // query string
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    const credentialScope = `${datePart}/${R2_REGION}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        dateStamp,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSignatureKey(secretKey, datePart, R2_REGION, 's3');
    const signature = hmacSha256(signingKey, stringToSign).toString('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        url: `${endpoint}${canonicalUri}`,
        headers: {
            ...headers,
            'Authorization': authorization,
        },
    };
}

// ── R2 Operations ────────────────────────────────────────────────────────

async function r2Put(key, data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    const signed = signR2Request('PUT', key, body, 'application/json');
    if (!signed) return false;

    try {
        const res = await fetch(signed.url, {
            method: 'PUT',
            headers: signed.headers,
            body,
        });
        return res.ok;
    } catch (e) {
        console.error(`[R2] PUT ${key} failed: ${e.message}`);
        return false;
    }
}

async function r2Get(key) {
    const signed = signR2Request('GET', key, '', null);
    if (!signed) return null;

    try {
        const res = await fetch(signed.url, { headers: signed.headers });
        if (res.status === 404 || !res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error(`[R2] GET ${key} failed: ${e.message}`);
        return null;
    }
}

async function r2Delete(key) {
    const signed = signR2Request('DELETE', key, '', null);
    if (!signed) return false;

    try {
        const res = await fetch(signed.url, { method: 'DELETE', headers: signed.headers });
        return res.ok || res.status === 204;
    } catch { return false; }
}

async function r2List(prefix, maxKeys = 100) {
    const signed = signR2Request('GET', '', '', null);
    if (!signed) return [];

    // Append query string for list
    const url = `${signed.url.split('?')[0]}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=${maxKeys}`;

    try {
        const res = await fetch(url, { headers: signed.headers });
        if (!res.ok) return [];
        const xml = await res.text();
        // Simple XML key extraction
        const keys = [];
        const regex = /<Key>([^<]+)<\/Key>/g;
        let m;
        while ((m = regex.exec(xml)) !== null) {
            keys.push(m[1]);
        }
        return keys;
    } catch (e) {
        console.error(`[R2] LIST failed: ${e.message}`);
        return [];
    }
}

// ── KV Fallback Operations ───────────────────────────────────────────────

function kvBaseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID()}/storage/kv/namespaces/${CF_KV_NS_ID()}`;
}

async function kvPut(key, data) {
    const token = CF_KV_TOKEN();
    if (!token) return false;
    try {
        const res = await fetch(`${kvBaseUrl()}/values/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
            body: JSON.stringify(data),
        });
        return res.ok;
    } catch { return false; }
}

async function kvGet(key) {
    const token = CF_KV_TOKEN();
    if (!token) return null;
    try {
        const res = await fetch(`${kvBaseUrl()}/values/${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return JSON.parse(await res.text());
    } catch { return null; }
}

async function kvList(prefix, limit = 100) {
    const token = CF_KV_TOKEN();
    if (!token) return [];
    try {
        const res = await fetch(`${kvBaseUrl()}/keys?prefix=${encodeURIComponent(prefix)}&limit=${limit}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.result || []).map(k => k.name);
    } catch { return []; }
}

// ── Public API (R2 primary, KV fallback) ─────────────────────────────────

/**
 * Store a paper. Tries R2 first, falls back to KV.
 */
export async function storePaper(paperId, paperData) {
    const key = `papers/${paperId}.json`;
    const payload = { ...paperData, stored_at: new Date().toISOString() };

    // Try R2 first
    const r2ok = await r2Put(key, payload);
    if (r2ok) {
        console.log(`[STORAGE] Paper ${paperId} stored in R2`);
        return true;
    }

    // Fallback to KV
    const kvok = await kvPut(`papers/${paperId}`, payload);
    if (kvok) {
        console.log(`[STORAGE] Paper ${paperId} stored in KV (R2 unavailable)`);
        return true;
    }

    console.error(`[STORAGE] Paper ${paperId} NOT stored (both R2 and KV failed)`);
    return false;
}

/**
 * Retrieve a paper. Tries R2 first, falls back to KV.
 */
export async function getPaper(paperId) {
    const r2data = await r2Get(`papers/${paperId}.json`);
    if (r2data) return r2data;
    return await kvGet(`papers/${paperId}`);
}

/**
 * List stored papers.
 */
export async function listPapers(limit = 100) {
    const r2keys = await r2List('papers/', limit);
    if (r2keys.length > 0) {
        return {
            keys: r2keys.map(k => k.replace('papers/', '').replace('.json', '')),
            count: r2keys.length,
            backend: 'r2',
        };
    }
    const kvkeys = await kvList('papers/', limit);
    return {
        keys: kvkeys.map(k => k.replace('papers/', '')),
        count: kvkeys.length,
        backend: 'kv',
    };
}

/**
 * Delete a paper.
 */
export async function deletePaper(paperId) {
    const r2ok = await r2Delete(`papers/${paperId}.json`);
    // Also try KV in case it was stored there
    await kvPut(`papers/${paperId}`, null).catch(() => {});
    return r2ok;
}

/**
 * Health check for storage backends.
 */
export async function checkHealth() {
    const r2available = !!(R2_ACCESS_KEY() && R2_SECRET_KEY());
    const kvAvailable = !!CF_KV_TOKEN();

    let r2test = false;
    if (r2available) {
        try {
            r2test = await r2Put('_health_check.json', { ts: Date.now() });
        } catch { /* ignore */ }
    }

    return {
        r2: { configured: r2available, operational: r2test, bucket: R2_BUCKET(), endpoint: R2_ENDPOINT() },
        kv: { configured: kvAvailable, namespace: CF_KV_NS_ID() },
        primary: r2available ? 'r2' : (kvAvailable ? 'kv' : 'none'),
    };
}
