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

        // Update Cloudflare DNSLink
        console.log(`🔄 Updating Cloudflare DNSLink for app.p2pclaw.com...`);
        const dnsSuccess = await cloudflareService.updateDnsLink('app.p2pclaw.com', rootCid);
        
        if (dnsSuccess) {
            console.log(`✅ app.p2pclaw.com is now pointing to ${rootCid}`);
        } else {
            console.error(`❌ Failed to update Cloudflare DNSLink. Please update manually to: dnslink=/ipfs/${rootCid}`);
        }

    } catch (error) {
        console.error('❌ Deployment Failed:', error);
    }
}

deployFrontend();
