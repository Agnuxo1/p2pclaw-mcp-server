/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

const fs = require('fs'); fetch('https://api.cloudflare.com/client/v4/zones/68f64411b5d359c74a17a4d257d76018/web3/hostnames', { headers: { 'Authorization': 'Bearer 0Mg5PDuOz7_aycO0QK6v_U7_4o-38cS70Uxxjrb1', 'Content-Type': 'application/json' } }).then(r => r.json()).then(d => { fs.writeFileSync('cf_web3.json', JSON.stringify(d, null, 2)); process.exit(0); }).catch(e => { fs.writeFileSync('cf_web3.json', String(e)); process.exit(1); });
