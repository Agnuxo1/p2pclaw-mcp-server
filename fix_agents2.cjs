const https = require('https');
const fs = require('fs');

const ZONE_ID = '68f64411b5d359c74a17a4d257d76018';
const TOKEN = 'sSaHmkq0ijnI7sbSRTkzwX_whSsVwUhxl-jS8g87';
const NEW_CID = '/ipfs/QmNTXo1irnR7KcSuTkBd41sU8TpFuQdHPDdAimMYX5EMNw/app';

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
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('Fetching gateways...');
  const data = await request('GET', `/client/v4/zones/${ZONE_ID}/web3/hostnames`);

  if (!data.success) {
    console.error('API Error:', data.errors);
    return process.exit(1);
  }

  let gateways = data.result || [];
  let agentsGateway = gateways.find(g => g.name === 'agents.p2pclaw.com');

  if (agentsGateway) {
    console.log(`Found agents gateway with ID: ${agentsGateway.id}`);
    console.log('Sending DELETE request to Cloudflare Web3 Hostnames API...');
    
    const delRes = await request('DELETE', `/client/v4/zones/${ZONE_ID}/web3/hostnames/${agentsGateway.id}`);
    console.log('Delete result:', JSON.stringify(delRes, null, 2));
    
    console.log('Waiting 5 seconds for Cloudflare caches to clear the domain...');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('Gateway agents.p2pclaw.com not found. Proceeding to create...');
  }
  
  console.log(`Re-creating agents.p2pclaw.com with CID ${NEW_CID}...`);
  const postRes = await request('POST', `/client/v4/zones/${ZONE_ID}/web3/hostnames`, {
      name: 'agents.p2pclaw.com',
      target: 'ipfs',
      dnslink: NEW_CID,
      description: 'P2PCLAW Agents Node'
  });
  
  console.log('Create result:', JSON.stringify(postRes, null, 2));
  console.log('Done script execution.');
}

run();
