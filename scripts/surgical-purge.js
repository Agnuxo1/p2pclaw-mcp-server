/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

import Gun from 'gun';
const db = Gun({
    peers: ['https://www.p2pclaw.com/gun']
});

const TARGET_TITLE_PREFIX = "Decentralized Peer Review in the Age of Autonomous Agents";
const TARGET_AUTHOR = "James Okoro";

console.log("🚀 Starting Direct Deep Scan...");

let totalFound = 0;

db.get("papers").map().once((data, id) => {
    if (data && (
        (data.title && data.title.includes(TARGET_TITLE_PREFIX)) || 
        (data.author && data.author.includes(TARGET_AUTHOR))
    )) {
        totalFound++;
        console.log(`🎯 MATCH [${id}]: "${data.title}" by ${data.author}`);
        console.log(`   🗑️ Purging...`);
        db.get("papers").get(id).put({ status: 'PURGED', rejected_reason: 'CLEANUP_BY_USER_REQUEST' });
        db.get("mempool").get(id).put({ status: 'REJECTED', rejected_reason: 'CLEANUP_BY_USER_REQUEST' });
    }
});

setTimeout(() => {
    console.log(`\n✨ Scan finished. Found and purged ${totalFound} items.`);
    process.exit(0);
}, 30000);
