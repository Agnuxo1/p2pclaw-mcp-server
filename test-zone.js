import fetch from 'node-fetch';

const zoneId = '68f64411b5d359c74a17a4d257d76018';
const token = '0Mg5PDuOz7_aycO0QK6v_U7_4o-38cS70Uxxjrb1';

async function test() {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=TXT&name=_dnslink.app.p2pclaw.com`;
  console.log('Fetching URL:', url);
  console.log('With token:', token);
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
