import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const web3Gateways = [
    'hive.p2pclaw.com', 'briefing.p2pclaw.com', 'mempool.p2pclaw.com',
    'wheel.p2pclaw.com', 'research.p2pclaw.com', 'node-c.p2pclaw.com',
    'node-b.p2pclaw.com', 'node-a.p2pclaw.com', 'mirror.p2pclaw.com',
    'cdn.p2pclaw.com', 'app.p2pclaw.com', 'skills.p2pclaw.com',
    'papers.p2pclaw.com', 'archive.p2pclaw.com', 'agents.p2pclaw.com'
];

async function recoverCnames() {
    console.log("Restoring Cloudflare CNAMEs for Web3 gateways...");

    // 1. Get existing CNAMEs
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME`, {
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        }
    });
    
    const data = await res.json();
    const existingNames = new Set(data.result.map(r => r.name));

    for (const domain of web3Gateways) {
        if (!existingNames.has(domain)) {
            console.log(`Missing CNAME for ${domain}. Creating it (proxied=false)...`);

            const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${apiToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    type: "CNAME",
                    name: domain,
                    content: "cloudflare-ipfs.com",
                    ttl: 1, // Auto
                    proxied: false // MUST BE FALSE for IPFS gateways
                })
            });

            const createData = await createRes.json();
            if (createData.success) {
                console.log(`✅ successfully restored CNAME for ${domain}`);
            } else {
                console.error(`❌ Failed to restore ${domain}:`, createData.errors);
            }
        } else {
            console.log(`⚡ ${domain} CNAME already exists.`);
        }
    }
}

recoverCnames();
