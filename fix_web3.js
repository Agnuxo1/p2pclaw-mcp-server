
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ZONE_ID = '68f64411b5d359c74a17a4d257d76018';
const TOKEN = '0Mg5PDuOz7_aycO0QK6v_U7_4o-38cS70Uxxjrb1';
const HEADERS = { 'Authorization': \Bearer \\, 'Content-Type': 'application/json' };
const API_URL = \https://api.cloudflare.com/client/v4/zones/\/web3/hostnames\;

const domains = ['hive.p2pclaw.com', 'briefing.p2pclaw.com', 'mempool.p2pclaw.com', 'wheel.p2pclaw.com', 'research.p2pclaw.com', 'node-c.p2pclaw.com', 'node-b.p2pclaw.com', 'node-a.p2pclaw.com', 'mirror.p2pclaw.com', 'cdn.p2pclaw.com', 'app.p2pclaw.com', 'skills.p2pclaw.com', 'papers.p2pclaw.com', 'archive.p2pclaw.com', 'agents.p2pclaw.com'];
const NEW_CID = '/ipfs/QmNTXo1irnR7KcSuTkBd41sU8TpFuQdHPDdAimMYX5EMNw/app';

async function run() {
  console.log('Fetching existing Web3 Hostnames...');
  const res = await fetch(API_URL, { headers: HEADERS });
  const data = await res.json();
  if (!data.success) return console.error('Auth Failed:', data.errors);
  
  const gateways = data.result || [];
  console.log(\Found \ external gateways.\);

  for (const gw of gateways) {
    if (domains.includes(gw.name)) {
      console.log(\Deleting \ (ID: \)...\);
      const delRes = await fetch(\\/\\, { method: 'DELETE', headers: HEADERS });
      console.log(await delRes.json());
    }
  }

  console.log('Re-creating 15 Web3 Gateways pointing to NEW_CID...');
  for (const domain of domains) {
    console.log(\Creating \...\);
    const createRes = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        name: domain,
        target: 'ipfs',
        description: 'P2PCLAW V3 App Node',
        dnslink: NEW_CID
      })
    });
    console.log(await createRes.json());
  }
}
run();

