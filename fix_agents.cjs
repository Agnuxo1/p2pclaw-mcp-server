
const https = require('https');

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
        'Authorization': \Bearer \\,
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
  const data = await request('GET', \/client/v4/zones/\/web3/hostnames\);
  
  if (!data.success) {
    console.error('API Error:', data.errors);
    process.exit(1);
  }

  let gateways = data.result || [];
  let agentsGateway = gateways.find(g => g.name === 'agents.p2pclaw.com');

  if (agentsGateway) {
    console.log(\Found agents.p2pclaw.com (ID: \). Deleting...\);
    const delRes = await request('DELETE', \/client/v4/zones/\/web3/hostnames/\\);
    console.log('Delete result:', JSON.stringify(delRes, null, 2));
    
    // Wait 3 seconds for Cloudflare to process the deletion fully
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('agents.p2pclaw.com not found in the current 15 gateways.');
  }

  console.log('Fetching updated list to confirm deletion...');
  const checkData = await request('GET', \/client/v4/zones/\/web3/hostnames\);
  let updatedGateways = checkData.result || [];
  console.log(\Total gateways now: \/15\);

  if (updatedGateways.length < 15) {
    console.log('Recreating agents.p2pclaw.com...');
    const postRes = await request('POST', \/client/v4/zones/\/web3/hostnames\, {
      name: 'agents.p2pclaw.com',
      target: 'ipfs',
      dnslink: NEW_CID,
      description: 'P2PCLAW Agents Node'
    });
    console.log('Create result:', JSON.stringify(postRes, null, 2));
  } else {
    console.log('ERROR: Still stuck at 15 gateways, cannot recreate.');
  }
}

run();

