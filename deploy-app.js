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
    
    // Add all files from packages/app maintaining directory structure for Pinata
    const files = await glob('**/*', { cwd: appDir, nodir: true });
    
    files.forEach(file => {
        const filePath = path.join(appDir, file);
        // Pinata expects a single directory wrapper so we construct the filepath relative to a root folder called "app"
        const relativePath = `app/${file.replace(/\\/g, '/')}`;
        formData.append('file', fs.createReadStream(filePath), {
            filepath: relativePath
        });
    });

    const metadata = JSON.stringify({
        name: `p2pclaw-frontend-${Date.now()}`
    });
    formData.append('pinataMetadata', metadata);

    const pinataOptions = JSON.stringify({
        cidVersion: 0
    });
    formData.append('pinataOptions', pinataOptions);

    console.log(`🌐 Uploading ${files.length} files to Pinata IPFS via REST...`);
    
    try {
        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.PINATA_JWT}`,
            },
            body: formData,
        });

        const resData = await res.json();

        if (!res.ok) {
            console.error('❌ Pinata Error:', resData);
            process.exit(1);
        }

        const rootCid = resData.IpfsHash;

        console.log(`\n✅ Deployment successful!`);
        console.log(`🔗 IPFS Root CID: ${rootCid}`);
        console.log(`🌍 Gateway URL: https://ipfs.io/ipfs/${rootCid}\n`);

        // ── Phase 1 Decentralization: Update 15 Web3 Gateways ──
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
            // 1. Ensure CNAME exists and is NOT proxied (Grey Cloud) -> required for Web3 Gateway to leave "Pending" state
            await cloudflareService.ensureCname(domain);
            
            // 2. Update the DNSLink TXT record to point to the new IPFS CID
            const dnsSuccess = await cloudflareService.updateDnsLink(domain, rootCid);
            if (dnsSuccess) {
                successCount++;
                console.log(`✅ ${domain} successfully linked to ${rootCid}`);
            } else {
                console.error(`❌ Failed to update ${domain}`);
            }
        }
        
        console.log(`\n🎉 Web3 Deployment Complete: ${successCount}/${web3Gateways.length} gateways updated.`);

    } catch (error) {
        console.error('❌ Deployment Failed:', error);
    }
}

deployFrontend();
