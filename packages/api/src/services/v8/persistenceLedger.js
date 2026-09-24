/**
 * Records which durable tiers acknowledged each paper write (paper v7 section 7).
 * In-process only: after a restart, tiers that cannot be re-checked cheaply are reported
 * as null ("unknown") rather than assumed true.
 */
const MAX_ENTRIES = 20000;
const ledger = new Map(); // paperId -> { github, r2, updated_at }

export function markPersistence(paperId, tier, ok) {
    if (!paperId || !tier) return;
    const entry = ledger.get(paperId) || {};
    entry[tier] = !!ok;
    entry.updated_at = Date.now();
    ledger.delete(paperId);
    ledger.set(paperId, entry);
    if (ledger.size > MAX_ENTRIES) ledger.delete(ledger.keys().next().value);
}

export function getPersistence(paperId) {
    return ledger.get(paperId) || null;
}
