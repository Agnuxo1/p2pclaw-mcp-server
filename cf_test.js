import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

async function check() {
    console.log("Zone:", zoneId);
    
    // Get all records
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME`, {
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        }
    });
    
    const data = await res.json();
    if (data.result) {
        for (const r of data.result) {
            if (r.name === 'www.p2pclaw.com' && r.proxied === false) {
                console.log(`Restoring ${r.name} to proxied=true...`);
                await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${r.id}`, {
                    method: 'PUT',
                    headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ type: 'CNAME', name: r.name, content: r.content, ttl: 1, proxied: true })
                });
                console.log(`  ✅ Done`);
            }
            
            const stuckDomains = ['hive.p2pclaw.com', 'cdn.p2pclaw.com', 'mempool.p2pclaw.com', 'node-c.p2pclaw.com', 'wheel.p2pclaw.com'];
            if (stuckDomains.includes(r.name)) {
                console.log(`Attempting to DELETE stuck record: ${r.name}...`);
                const delRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${r.id}`, {
                    method: 'DELETE',
                    headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" }
                });
                const delData = await delRes.json();
                if (delData.success) {
                    console.log(`  🗑️ Success: ${r.name} deleted!`);
                } else {
                    console.error(`  ❌ Delete failed for ${r.name}:`, delData.errors);
                }
            }
        }
    }
}

check();
