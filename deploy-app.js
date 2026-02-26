import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { cloudflareService } from './packages/api/src/services/cloudflareService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Canonical CID — fallback if Pinata upload fails ──────────────────────────
// This is the last known-good deployment CID. Always used as fallback.
const CANONICAL_CID = 'QmfAU8YaWapbq4QsJyQivrB4RjqgHtbM55i7gqA9eeXtZQ';
const PIN_NAME = 'p2pclaw-frontend-latest';

/**
 * Find and unpin any previous pins with the same name, so Pinata stays clean
 * and we always have exactly one active pin.
 */
async function unpinPrevious(jwt) {
    try {
        const res = await fetch(
            `https://api.pinata.cloud/data/pinList?name=${encodeURIComponent(PIN_NAME)}&status=pinned`,
            { headers: { Authorization: `Bearer ${jwt}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const pins = data.rows || [];
        for (const pin of pins) {
            console.log(`🗑️  Unpinning old version: ${pin.ipfs_pin_hash}`);
            await fetch(`https://api.pinata.cloud/pinning/unpin/${pin.ipfs_pin_hash}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` }
            });
        }
    } catch (e) {
        console.warn(`⚠️ Could not unpin previous: ${e.message}`);
    }
}

async function deployFrontend() {
    console.log('🚀 Starting P2PCLAW Web3 Frontend Deployment...');

    if (!process.env.PINATA_JWT) {
        console.error('❌ Missing PINATA_JWT. Cannot deploy to IPFS.');
        process.exit(1);
    }

    if (!process.env.CLOUDFLARE_ZONE_ID || !process.env.CLOUDFLARE_API_TOKEN) {
        console.warn('⚠️ Missing Cloudflare credentials. DNSLink will NOT be updated.');
    }

    const appDir = path.join(__dirname, 'packages', 'app');

    if (!fs.existsSync(appDir)) {
        console.error(`❌ App directory not found at ${appDir}`);
        process.exit(1);
    }

    console.log(`📦 Bundling files from ${appDir}...`);

    const formData = new FormData();

    const files = await glob('**/*', { cwd: appDir, nodir: true });

    files.forEach(file => {
        const filePath = path.join(appDir, file);
        const relativePath = `app/${file.replace(/\\/g, '/')}`;
        formData.append('file', fs.createReadStream(filePath), {
            filepath: relativePath
        });
    });

    // Fixed pin name — always overwrites the same slot
    formData.append('pinataMetadata', JSON.stringify({ name: PIN_NAME }));
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    console.log(`🌐 Uploading ${files.length} files to Pinata IPFS (pin: "${PIN_NAME}")...`);

    let rootCid = CANONICAL_CID;

    try {
        // Remove previous pin with same name before uploading new one
        await unpinPrevious(process.env.PINATA_JWT);

        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
            body: formData,
        });

        const resData = await res.json();

        if (!res.ok) {
            console.error('❌ Pinata Error:', resData);
            console.warn(`⚠️ Using canonical fallback CID: ${CANONICAL_CID}`);
        } else {
            rootCid = resData.IpfsHash;
            console.log(`\n✅ Upload successful!`);
            console.log(`🔗 IPFS Root CID: ${rootCid}`);
            console.log(`🌍 Gateway URL: https://ipfs.io/ipfs/${rootCid}/app/index.html\n`);
        }
    } catch (error) {
        console.warn(`⚠️ Upload failed: ${error.message}`);
        console.warn(`⚠️ Using canonical fallback CID: ${CANONICAL_CID}`);
    }

    // ── Update 15 Web3 Gateways with the new (or fallback) CID ──────────────
    const web3Gateways = [
        'hive.p2pclaw.com', 'briefing.p2pclaw.com', 'mempool.p2pclaw.com',
        'wheel.p2pclaw.com', 'research.p2pclaw.com', 'node-c.p2pclaw.com',
        'node-b.p2pclaw.com', 'node-a.p2pclaw.com', 'mirror.p2pclaw.com',
        'cdn.p2pclaw.com', 'app.p2pclaw.com', 'skills.p2pclaw.com',
        'papers.p2pclaw.com', 'archive.p2pclaw.com', 'agents.p2pclaw.com'
    ];

    console.log(`\n🔄 Updating Cloudflare DNS & Web3 Status for ${web3Gateways.length} gateways...`);
    let successCount = 0;

    for (const domain of web3Gateways) {
        console.log(`\n▶ Processing ${domain}`);
        await cloudflareService.ensureCname(domain);
        const dnsSuccess = await cloudflareService.updateDnsLink(domain, rootCid);
        if (dnsSuccess) {
            successCount++;
            console.log(`✅ ${domain} → ${rootCid}`);
        } else {
            console.error(`❌ Failed to update ${domain}`);
        }
    }

    console.log(`\n🎉 Web3 Deployment Complete: ${successCount}/${web3Gateways.length} gateways updated.`);
    console.log(`📌 Active CID: ${rootCid}`);
}

deployFrontend();
