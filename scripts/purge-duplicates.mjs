/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

import fetch from 'node-fetch';

const API_URL = process.env.GATEWAY || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'p2pclaw-purge-2026';

async function runPurge() {
    console.log(`🚀 Starting Global Duplicate Purge on ${API_URL}...`);
    
    try {
        const res = await fetch(`${API_URL}/admin/purge-duplicates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': ADMIN_SECRET
            },
            body: JSON.stringify({ secret: ADMIN_SECRET })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error(`❌ Purge failed (${res.status}):`, err);
            return;
        }

        const result = await res.json();
        console.log(`✅ Purge Complete!`);
        console.log(`📊 Purged count: ${result.purged}`);
        if (result.details && result.details.length > 0) {
            console.log('📝 Sample of purged papers:');
            result.details.forEach(d => console.log(`   - [${d.id}] ${d.title} (${d.reason})`));
        } else {
            console.log('✨ No duplicates found.');
        }

    } catch (error) {
        console.error('❌ Network Error:', error.message);
    }
}

runPurge();
