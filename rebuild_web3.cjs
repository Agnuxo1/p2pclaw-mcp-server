const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const NEW_CID = '/ipfs/QmNTXo1irnR7KcSuTkBd41sU8TpFuQdHPDdAimMYX5EMNw/app';
const domains = ['hive.p2pclaw.com', 'briefing.p2pclaw.com', 'mempool.p2pclaw.com', 'wheel.p2pclaw.com', 'research.p2pclaw.com', 'node-c.p2pclaw.com', 'node-b.p2pclaw.com', 'node-a.p2pclaw.com', 'mirror.p2pclaw.com', 'cdn.p2pclaw.com', 'app.p2pclaw.com', 'skills.p2pclaw.com', 'papers.p2pclaw.com', 'archive.p2pclaw.com', 'agents.p2pclaw.com'];

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('Fetching existing Web3 Hostnames...');
  const data = await request('GET', `/client/v4/zones/${ZONE_ID}/web3/hostnames`);
  
  if (!data.success) {
    console.error('API Error:', data.errors);
    process.exit(1);
  }

  const gateways = data.result || [];
  console.log(`Found ${gateways.length} active gateways.`);

  for (const gw of gateways) {
    if (domains.includes(gw.name)) {
      console.log(`Deleting ${gw.name} (ID: ${gw.id})...`);
      await request('DELETE', `/client/v4/zones/${ZONE_ID}/web3/hostnames/${gw.id}`);
    } else {
        console.log(`Skipping ${gw.name}...`);
    }
  }

  console.log('\n--- Rebuilding Gateways ---');
  for (const domain of domains) {
    console.log(`Creating ${domain} -> ${NEW_CID}`);
    const res = await request('POST', `/client/v4/zones/${ZONE_ID}/web3/hostnames`, {
      name: domain,
      target: 'ipfs',
      dnslink: NEW_CID,
      description: 'P2PCLAW V3 App Node'
    });
    if (res.success) {
        console.log(`✅ ${domain} created`);
    } else {
        console.error(`❌ Failed to create ${domain}:`, res.errors);
    }
  }
}

run();
