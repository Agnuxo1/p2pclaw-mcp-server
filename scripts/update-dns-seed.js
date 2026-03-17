#!/usr/bin/env node
/**
 * update-dns-seed.js — Manual Cloudflare DNS seed updater
 *
 * Updates the _dnsaddr.p2pclaw.com TXT record with active Helia peer multiaddrs
 * fetched from the Railway API /helia-peers endpoint.
 *
 * Usage:
 *   CF_API_TOKEN=xxx CF_ZONE_ID=yyy CF_RECORD_ID=zzz node scripts/update-dns-seed.js
 *
 * To find your CF_RECORD_ID:
 *   curl -X GET "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records?name=_dnsaddr.p2pclaw.com&type=TXT" \
 *     -H "Authorization: Bearer <CF_API_TOKEN>" | jq '.result[].id'
 *
 * To CREATE the record if it doesn't exist:
 *   curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
 *     -H "Authorization: Bearer <CF_API_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     --data '{"type":"TXT","name":"_dnsaddr.p2pclaw.com","content":"dnsaddr=placeholder","ttl":300}'
 *
 * Environment variables:
 *   CF_API_TOKEN   — Cloudflare API token with DNS Edit permission
 *   CF_ZONE_ID     — Zone ID for p2pclaw.com (from Cloudflare dashboard)
 *   CF_RECORD_ID   — DNS record ID for _dnsaddr.p2pclaw.com TXT record
 *   API_BASE       — Optional: Railway API base URL (default: https://p2pclaw-api-production-df9f.up.railway.app)
 */

const API_BASE = process.env.API_BASE || 'https://p2pclaw-api-production-df9f.up.railway.app';
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ZONE_ID = process.env.CF_ZONE_ID;
const CF_RECORD_ID = process.env.CF_RECORD_ID;

if (!CF_API_TOKEN || !CF_ZONE_ID || !CF_RECORD_ID) {
    console.error('❌ Missing env vars: CF_API_TOKEN, CF_ZONE_ID, CF_RECORD_ID are all required.');
    console.error('   Run: CF_API_TOKEN=xxx CF_ZONE_ID=yyy CF_RECORD_ID=zzz node scripts/update-dns-seed.js');
    process.exit(1);
}

async function main() {
    console.log(`[DNS Seed] Fetching active peers from ${API_BASE}/helia-peers ...`);

    // 1. Fetch active peers from Railway
    const peersRes = await fetch(`${API_BASE}/helia-peers`);
    if (!peersRes.ok) throw new Error(`/helia-peers returned ${peersRes.status}`);
    const peersData = await peersRes.json();
    const peers = peersData.peers || [];
    console.log(`[DNS Seed] Found ${peers.length} active Helia peers (last 10 min)`);

    // 2. Extract browser-reachable multiaddrs (WebSocket / WebRTC only)
    const dnsAddrs = [];
    for (const peer of peers) {
        for (const ma of (peer.multiaddrs || [])) {
            if (ma && (ma.includes('/wss') || ma.includes('/ws') || ma.includes('/webrtc'))) {
                dnsAddrs.push(`dnsaddr=${ma}`);
            }
        }
    }

    if (dnsAddrs.length === 0) {
        // Fall back to /dns-seed endpoint which has more context
        console.log('[DNS Seed] No multiaddrs from helia-peers, trying /dns-seed ...');
        const seedRes = await fetch(`${API_BASE}/dns-seed`);
        if (seedRes.ok) {
            const seedData = await seedRes.json();
            dnsAddrs.push(...(seedData.records || []));
        }
    }

    if (dnsAddrs.length === 0) {
        console.warn('[DNS Seed] ⚠️  No browser-reachable multiaddrs available. DNS record not updated.');
        console.warn('           This is normal if no browsers have connected recently.');
        process.exit(0);
    }

    // Cap at 10 records (TXT record size limit)
    const recordContent = dnsAddrs.slice(0, 10).join(' ');
    console.log(`[DNS Seed] Updating _dnsaddr.p2pclaw.com with ${Math.min(dnsAddrs.length, 10)} records:`);
    dnsAddrs.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

    // 3. Update Cloudflare TXT record
    const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${CF_RECORD_ID}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${CF_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'TXT',
                name: '_dnsaddr.p2pclaw.com',
                content: recordContent,
                ttl: 300,
            }),
        }
    );

    const cfData = await cfRes.json();
    if (cfData.success) {
        console.log(`✅ _dnsaddr.p2pclaw.com updated successfully!`);
        console.log(`   Record ID: ${cfData.result?.id}`);
        console.log(`   TTL: 300s`);
    } else {
        console.error('❌ Cloudflare update failed:', JSON.stringify(cfData.errors, null, 2));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
