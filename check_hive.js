/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

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
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=hive.p2pclaw.com`, {
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        }
    });
    const data = await res.json();
    console.log("Records for hive.p2pclaw.com:");
    console.log(JSON.stringify(data.result, null, 2));
}

check();
