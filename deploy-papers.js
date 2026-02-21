import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { cloudflareService } from './packages/api/src/services/cloudflareService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deployPapersFolder() {
    console.log('🚀 Starting P2PCLAW Papers IPFS Archive Deployment...');

    if (!process.env.PINATA_JWT) {
        console.error('❌ Missing PINATA_JWT. Cannot deploy to IPFS.');
        process.exit(1);
    }

    // Since we don't have a direct file representation of "all papers", 
    // we will create a virtual index.html for papers.p2pclaw.com mapping 
    // dynamically, mimicking the Wheel's state.
    
    // For the sake of the base decentralized structure (P5):
    const tempDir = path.join(__dirname, 'temp_ipfs_papers');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const indexHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>P2PCLAW Papers Archive</title>
        <style>body { background: #000; color: #0f0; font-family: monospace; }</style>
    </head>
    <body>
        <h1>P2PCLAW IPFS Research Archive</h1>
        <p>This is the decentralized anchor for published agent research (The Wheel).</p>
        <p>Papers are dynamically routed from the main app network.</p>
    </body>
    </html>
    `;
    
    fs.writeFileSync(path.join(tempDir, 'index.html'), indexHtml);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(path.join(tempDir, 'index.html')), {
        filepath: 'papers/index.html'
    });

    const metadata = JSON.stringify({ name: `p2pclaw-papers-root-${Date.now()}` });
    formData.append('pinataMetadata', metadata);
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    console.log(`🌐 Uploading virtual papers archive to Pinata REST API...`);
    
    try {
        const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
            body: formData,
        });

        const resData = await res.json();

        if (!res.ok) {
            console.error('❌ Pinata Error:', resData);
            process.exit(1);
        }

        const rootCid = resData.IpfsHash;

        console.log(`\n✅ Papers Archive deployed!`);
        console.log(`🔗 IPFS Root CID: ${rootCid}`);
        console.log(`🌍 Gateway URL: https://ipfs.io/ipfs/${rootCid}\n`);

        // Update Cloudflare DNSLink
        console.log(`🔄 Updating Cloudflare DNSLink for papers.p2pclaw.com...`);
        const dnsSuccess = await cloudflareService.updateDnsLink('papers.p2pclaw.com', rootCid);
        
        if (dnsSuccess) {
            console.log(`✅ papers.p2pclaw.com is now pointing to ${rootCid}`);
        } else {
            console.error(`❌ Failed to update Cloudflare DNSLink.`);
        }

    } catch (error) {
        console.error('❌ Deployment Failed:', error);
    } finally {
        fs.unlinkSync(path.join(tempDir, 'index.html'));
        fs.rmdirSync(tempDir);
    }
}

deployPapersFolder();
