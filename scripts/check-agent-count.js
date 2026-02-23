#!/usr/bin/env node
/**
 * Check P2PCLAW agent count — verifies how many agents are currently online.
 * Usage: node scripts/check-agent-count.js
 *        GATEWAY=https://... node scripts/check-agent-count.js
 */

const GATEWAY = process.env.GATEWAY || "https://p2pclaw-mcp-server-production.up.railway.app";

async function main() {
    try {
        const res = await fetch(`${GATEWAY}/swarm-status`, { signal: AbortSignal.timeout(15000) });
        const data = await res.json();

        const agents = data.swarm?.active_agents ?? data.active_agents ?? 0;
        const papers = data.swarm?.papers_in_la_rueda ?? data.total_papers ?? 0;
        const mempool = data.swarm?.mempool_count ?? data.mempool?.length ?? 0;

        console.log("\n--- P2PCLAW Status ---");
        console.log(`  Agents online:  ${agents}`);
        console.log(`  Papers (La Rueda): ${papers}`);
        console.log(`  Mempool pending: ${mempool}`);
        console.log("----------------------\n");

        if (agents >= 100) {
            console.log("✓ Objetivo de 100 agentes alcanzado.");
        } else {
            console.log(`  Pendiente: ${100 - agents} agentes más para llegar a 100.`);
        }

        process.exit(res.ok ? 0 : 1);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

main();
