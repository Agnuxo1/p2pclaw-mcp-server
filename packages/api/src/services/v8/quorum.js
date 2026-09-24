/**
 * P2PCLAW v8 — In-memory BFT quorum proposals (CONTRACT.md /consensus/*)
 * ==========================================================================
 * Rules mirror GET /consensus/rules exactly:
 *   pov: quorum 2 (absolute validator count), timeout 172800s (48h)
 *   knowledge_validation: quorum 0.75 (ratio), timeout 40s, reputation-weighted
 *   self_improvement: quorum 0.80 (ratio), timeout 120s
 *   protocol_change: quorum 0.90 (ratio), timeout 300s
 */

export const QUORUM_RULES = {
    pov: { type: 'pov', quorum: 2, unit: 'validators', timeout_s: 172800 },
    knowledge_validation: { type: 'knowledge_validation', quorum: 0.75, timeout_s: 40, weighting: 'reputation' },
    self_improvement: { type: 'self_improvement', quorum: 0.8, timeout_s: 120 },
    protocol_change: { type: 'protocol_change', quorum: 0.9, timeout_s: 300 }
};

const MAX_PROPOSALS = 1000;
const DEFAULT_MIN_VOTERS = 3;

let idCounter = 0;
function nextId() {
    idCounter++;
    return `q_${Date.now().toString(36)}_${idCounter}`;
}

export class QuorumBook {
    constructor({ minVoters = DEFAULT_MIN_VOTERS } = {}) {
        this.proposals = new Map(); // id -> proposal
        this.minVoters = minVoters;
    }

    _evictIfNeeded() {
        if (this.proposals.size <= MAX_PROPOSALS) return;
        // Drop the oldest resolved proposal (by created_at) to cap size.
        let oldestId = null;
        let oldestTs = Infinity;
        for (const [id, p] of this.proposals.entries()) {
            if (p.status !== 'open' && p.created_at < oldestTs) {
                oldestTs = p.created_at;
                oldestId = id;
            }
        }
        if (oldestId) this.proposals.delete(oldestId);
    }

    createProposal({ type, title, description, proposer, now = Date.now() }) {
        const rule = QUORUM_RULES[type];
        if (!rule) throw new Error(`QuorumBook: unknown proposal type "${type}"`);

        const id = nextId();
        const deadline = now + rule.timeout_s * 1000;
        const proposal = {
            id,
            type,
            title,
            description,
            proposer,
            created_at: now,
            deadline,
            status: 'open',
            votes: new Map(), // agentId -> {vote, weight}
            resolved_at: null
        };
        this.proposals.set(id, proposal);
        this._evictIfNeeded();
        return this._view(proposal);
    }

    get(id) {
        const p = this.proposals.get(id);
        return p ? this._view(p) : null;
    }

    list({ status } = {}) {
        const all = Array.from(this.proposals.values());
        const filtered = status ? all.filter((p) => p.status === status) : all;
        return filtered.map((p) => this._view(p));
    }

    vote(id, { agentId, vote, weight = 1 }) {
        const p = this.proposals.get(id);
        if (!p) throw new Error(`QuorumBook: proposal "${id}" not found`);
        if (p.status !== 'open') {
            const err = new Error(`QuorumBook: proposal "${id}" is not open (status=${p.status})`);
            err.code = 'PROPOSAL_CLOSED';
            throw err;
        }
        if (vote !== 'yes' && vote !== 'no') {
            throw new Error(`QuorumBook: vote must be "yes" or "no", got "${vote}"`);
        }
        if (p.votes.has(agentId)) {
            const err = new Error(`QuorumBook: agent "${agentId}" already voted on "${id}"`);
            err.code = 'DUPLICATE_VOTE';
            throw err;
        }
        p.votes.set(agentId, { vote, weight: Math.max(0, weight) });
        return this._view(p);
    }

    tally(id) {
        const p = this.proposals.get(id);
        if (!p) return null;
        let yesWeight = 0;
        let noWeight = 0;
        for (const { vote, weight } of p.votes.values()) {
            if (vote === 'yes') yesWeight += weight;
            else noWeight += weight;
        }
        const totalWeight = yesWeight + noWeight;
        const yesRatio = totalWeight > 0 ? yesWeight / totalWeight : 0;
        return {
            yes_weight: yesWeight,
            no_weight: noWeight,
            total_weight: totalWeight,
            yes_ratio: yesRatio,
            voters: p.votes.size
        };
    }

    /**
     * resolve(id, now) -> settles the proposal if it can be decided or if
     * its deadline has passed. Returns the (possibly updated) proposal view.
     */
    resolve(id, now = Date.now()) {
        const p = this.proposals.get(id);
        if (!p) throw new Error(`QuorumBook: proposal "${id}" not found`);
        if (p.status !== 'open') return this._view(p);

        const rule = QUORUM_RULES[p.type];
        const tally = this.tally(id);
        const pastDeadline = now >= p.deadline;

        if (p.type === 'pov') {
            // absolute validator count
            const yesVoters = Array.from(p.votes.values()).filter((v) => v.vote === 'yes').length;
            if (yesVoters >= rule.quorum) {
                p.status = 'accepted';
                p.resolved_at = now;
            } else if (pastDeadline) {
                p.status = tally.voters === 0 ? 'expired' : 'rejected';
                p.resolved_at = now;
            }
            return this._view(p);
        }

        // ratio-quorum types
        const meetsQuorum = tally.yes_ratio >= rule.quorum && tally.voters >= this.minVoters;
        if (meetsQuorum) {
            p.status = 'accepted';
            p.resolved_at = now;
        } else if (pastDeadline) {
            if (tally.voters === 0) {
                p.status = 'expired';
            } else if (tally.yes_ratio >= rule.quorum && tally.voters >= this.minVoters) {
                p.status = 'accepted';
            } else {
                p.status = 'rejected';
            }
            p.resolved_at = now;
        }
        return this._view(p);
    }

    _view(p) {
        return {
            id: p.id,
            type: p.type,
            title: p.title,
            description: p.description,
            proposer: p.proposer,
            created_at: p.created_at,
            deadline: p.deadline,
            status: p.status,
            tally: this.tally(p.id)
        };
    }
}
