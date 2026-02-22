import { db } from './packages/api/src/config/gun.js';
import { gunSafe } from './packages/api/src/utils/gunUtils.js';

const factId = "seed-fact-27";
const atomicFact = {
    id: factId,
    subject: "Cross-Relay Sync",
    predicate: "works",
    content: "Phase 27 synchronization demonstrates successful inter-relay gossip protocols.",
    sourcePaperId: "test-paper",
    confidence: 1.0,
    timestamp: Date.now()
};

db.get('knowledge_graph').get(factId).put(gunSafe(atomicFact), (ack) => {
    if (ack.err) {
        console.error("Error seeding fact:", ack.err);
    } else {
        console.log("Seed fact successfully written to Gun.js:", factId);
    }
    process.exit(0);
});
