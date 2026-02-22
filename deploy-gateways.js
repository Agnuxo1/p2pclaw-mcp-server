import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { cloudflareService } from './packages/api/src/services/cloudflareService.js';

async function deployGateways() {
    console.log('🚀 Starting P2PCLAW Web3 Unified Decentralization...');

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
    
    // We upload to a wrapper directory named 'p2pclaw'
    files.forEach(file => {
        const filePath = path.join(appDir, file);
        // This ensures the CID represents a directory containing ONLY 'index.html' and related files.
        const relativePath = `p2pclaw/${file.replace(/\\/g, '/')}`;
        formData.append('file', fs.createReadStream(filePath), {
            filepath: relativePath
        });
    });

    const metadata = JSON.stringify({
        name: `p2pclaw-unified-sp-${Date.now()}`
    });
    formData.append('pinataMetadata', metadata);
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

    console.log(`🌐 Uploading ${files.length} files to Pinata IPFS via REST...`);
    
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

        console.log(`\n✅ IPFS Upload successful!`);
        console.log(`🔗 Wrapper CID: ${rootCid}`);
        // Because of the 'p2pclaw' wrapper, the actual path is <CID>/p2pclaw
        const directIpfsPath = `${rootCid}/p2pclaw`;
        console.log(`🌍 Gateway Path: /ipfs/${directIpfsPath}\n`);

        const subdomains = ['app', 'agents', 'archive', 'papers', 'skills'];
        
        console.log(`🔄 Updating Cloudflare DNS and CNAMEs for ${subdomains.length} gateways...`);
        let allSuccess = true;
        for (const sub of subdomains) {
            const domain = `${sub}.p2pclaw.com`;
            console.log(`\n--- Configuring ${domain} ---`);
            
            // 1. Ensure CNAME -> ipfs.cloudflare.com exists
            await cloudflareService.ensureCname(domain);
            
            // 2. Ensure TXT _dnslink points to the correct folder inside the wrapper
            const dnsSuccess = await cloudflareService.updateDnsLink(domain, directIpfsPath);
            
            if (dnsSuccess) {
                console.log(`✅ ${domain} successfully routed to IPFS.`);
            } else {
                console.error(`❌ Failed to route ${domain}.`);
                allSuccess = false;
            }
        }
        
        if (allSuccess) {
            console.log('\n🎉 All gateways updated! Please wait 1-2 minutes for DNS propagation and Cloudflare Web3 cache refresh.');
        }

    } catch (error) {
        console.error('❌ Deployment Failed:', error);
    }
}

deployGateways();
