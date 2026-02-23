
import fetch from 'node-fetch';

const ZONE_ID = '68f64411b5d359c74a17a4d257d76018';
const TOKEN = 'sSaHmkq0ijnI7sbSRTkzwX_whSsVwUhxl-jS8g87'; // Using the newer token
const NEW_CID = '/ipfs/QmNTXo1irnR7KcSuTkBd41sU8TpFuQdHPDdAimMYX5EMNw/app';
const API_URL = \https://api.cloudflare.com/client/v4/zones/\/web3/hostnames\;

const headers = {
  'Authorization': \Bearer \\,
  'Content-Type': 'application/json'
};

async function run() {
  console.log('Fetching gateways...');
  let res = await fetch(API_URL, { headers });
  let data = await res.json();
  
  if (!data.success) {
    console.log('Token failed:', data.errors);
    return;
  }
  
  let gateways = data.result;
  let agentsGateway = gateways.find(g => g.name === 'agents.p2pclaw.com');
  
  if (agentsGateway) {
    console.log(\Found agents gateway: \\);
    console.log(\Current dnslink: \\);
    
    console.log('Attempting to force DELETE...');
    let delRes = await fetch(\\/\\, { method: 'DELETE', headers });
    console.log('Delete result:', await delRes.json());
  } else {
    console.log('agents gateway not found.');
  }

  // Check again to see if we have < 15 and can create
  res = await fetch(API_URL, { headers });
  data = await res.json();
  gateways = data.result;
  console.log(\Total gateways now: \/15\);

  if (gateways.length < 15 || !gateways.find(g => g.name === 'agents.p2pclaw.com')) {
    console.log('Creating new agents gateway...');
    let postRes = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'agents.p2pclaw.com',
        target: 'ipfs',
        dnslink: NEW_CID,
        description: 'P2PCLAW Agents Node'
      })
    });
    console.log('Create result:', await postRes.json());
  } else {
    console.log('Still at 15 gateways, cannot recreate.');
  }
}

run();

