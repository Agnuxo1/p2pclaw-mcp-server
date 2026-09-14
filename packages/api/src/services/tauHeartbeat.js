/**
 * Process-lifetime maturity tracking. Keep IDs, not paper bodies, and subscribe
 * once: repeated Gun map().once() reads retain callbacks in Gun 0.2020.1241.
 * Importing this module does not start Gun, timers, or other application jobs.
 */
export function createTauHeartbeat({
    db, encode = value => value, setIntervalImpl = setInterval,
    now = Date.now, log = () => {},
}) {
    let currentTau = 0;
    let initialized = false;
    const verifiedPapers = new Set();
    const openTasks = new Set();

    const track = (ids, status) => (value, key) => {
        if (typeof key !== 'string' || key === '_') return;
        if (value?.status === status) ids.add(key);
        else ids.delete(key);
    };

    function checkMaturityAndPropose() {
        const maturityIndex = verifiedPapers.size + openTasks.size;
        const targetTau = Math.floor(maturityIndex / 10);
        if (targetTau <= currentTau) return;
        // Preserve the existing gossip proposal, not a new consensus protocol.
        db.get('global_heartbeat').put(encode({
            tau_index: targetTau,
            maturity_index: maturityIndex,
            timestamp: now(),
            proposer: 'API_NODE_1',
        }), ack => {
            // An older acknowledgement must not undo a newer network era.
            if (ack && !ack.err) currentTau = Math.max(currentTau, targetTau);
        });
    }

    return {
        initialize() {
            if (initialized) return;
            initialized = true;
            log('[TAU] Initializing Global Heartbeat synchronization...');
            db.get('global_heartbeat').on(hb => {
                if (Number.isSafeInteger(hb?.tau_index) && hb.tau_index > currentTau) {
                    currentTau = hb.tau_index;
                }
            });
            db.get('p2pclaw_papers_v4').map().on(track(verifiedPapers, 'VERIFIED'));
            db.get('swarm_tasks').map().on(track(openTasks, 'OPEN'));
            // These subscriptions live for the process. Do not call off() on a
            // shared Gun map chain: other application consumers use it as well.
            setIntervalImpl(checkMaturityAndPropose, 15_000);
        },
        getCurrentTau: () => currentTau,
    };
}
