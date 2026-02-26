/**
 * 🛰️ P2PCLAW AUTO-PURGE WATCHDOG
 * ==========================================
 * Periodically triggers the deep duplicate purge on the live API.
 * Ensures the hive remains clean even if agents or sync nodes bypass internal filters.
 *
 * Usage: node scripts/auto-purge-watchdog.js
 */

const https = require('https');

const API_URL = 'https://p2pclaw-api-production.up.railway.app/admin/purge-duplicates';
const ADMIN_SECRET = 'p2pclaw-purge-2026';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${ts}] [WATCHDOG] ${msg}`);
}

async function triggerPurge() {
    log('Initiating periodic purge...');
    
    return new Promise((resolve) => {
        const url = new URL(API_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': ADMIN_SECRET
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success) {
                        log(`Success! Purged ${result.purged} de-duplicates.`);
                    } else {
                        log(`Purge failed: ${data}`);
                    }
                    resolve();
                } catch (e) {
                    log(`Error parsing response: ${data}`);
                    resolve();
                }
            });
        });

        req.on('error', (e) => {
            log(`Network error: ${e.message}`);
            resolve();
        });

        req.on('timeout', () => {
            log('Request timed out.');
            req.destroy();
            resolve();
        });

        req.write('{}');
        req.end();
    });
}

// Start the watchdog
log(`Watchdog active. Targeting: ${API_URL}`);
log(`Interval: ${INTERVAL_MS / 60000} minutes.`);

// Initial run
triggerPurge();

// Loop
setInterval(triggerPurge, INTERVAL_MS);
