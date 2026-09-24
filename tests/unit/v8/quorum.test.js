import { QuorumBook, QUORUM_RULES } from '../../../packages/api/src/services/v8/quorum.js';

describe('QUORUM_RULES', () => {
    test('matches CONTRACT.md /consensus/rules exactly', () => {
        expect(QUORUM_RULES.pov).toEqual({ type: 'pov', quorum: 2, unit: 'validators', timeout_s: 172800 });
        expect(QUORUM_RULES.knowledge_validation).toEqual({
            type: 'knowledge_validation',
            quorum: 0.75,
            timeout_s: 40,
            weighting: 'reputation'
        });
        expect(QUORUM_RULES.self_improvement).toEqual({ type: 'self_improvement', quorum: 0.8, timeout_s: 120 });
        expect(QUORUM_RULES.protocol_change).toEqual({ type: 'protocol_change', quorum: 0.9, timeout_s: 300 });
    });
});

describe('QuorumBook', () => {
    let now;

    beforeEach(() => {
        now = 1000000;
    });

    test('createProposal sets deadline from rule timeout', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        expect(p.status).toBe('open');
        expect(p.deadline).toBe(now + 120 * 1000);
    });

    test('unknown type throws', () => {
        const book = new QuorumBook();
        expect(() => book.createProposal({ type: 'nope', title: 't', description: 'd', proposer: 'a1', now })).toThrow();
    });

    test('vote rejects duplicate votes with DUPLICATE_VOTE code', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'a2', vote: 'yes' });
        try {
            book.vote(p.id, { agentId: 'a2', vote: 'no' });
            throw new Error('should have thrown');
        } catch (e) {
            expect(e.code).toBe('DUPLICATE_VOTE');
        }
    });

    test('resolves accepted when ratio and min voters are met before deadline', () => {
        const book = new QuorumBook({ minVoters: 3 });
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now }); // quorum 0.8
        book.vote(p.id, { agentId: 'a2', vote: 'yes', weight: 1 });
        book.vote(p.id, { agentId: 'a3', vote: 'yes', weight: 1 });
        book.vote(p.id, { agentId: 'a4', vote: 'yes', weight: 1 });
        const resolved = book.resolve(p.id, now + 1000);
        expect(resolved.status).toBe('accepted');
        expect(resolved.tally.yes_ratio).toBe(1);
    });

    test('stays open before quorum/min voters met and deadline not reached', () => {
        const book = new QuorumBook({ minVoters: 3 });
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'a2', vote: 'yes' });
        const resolved = book.resolve(p.id, now + 1000);
        expect(resolved.status).toBe('open');
    });

    test('rejected at deadline when ratio/voters insufficient', () => {
        const book = new QuorumBook({ minVoters: 3 });
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'a2', vote: 'yes' });
        book.vote(p.id, { agentId: 'a3', vote: 'no' });
        const resolved = book.resolve(p.id, now + 121 * 1000); // past 120s deadline
        expect(resolved.status).toBe('rejected');
    });

    test('expired at deadline with zero votes', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        const resolved = book.resolve(p.id, now + 121 * 1000);
        expect(resolved.status).toBe('expired');
    });

    test('pov quorum is an absolute count of 2 validators', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'pov', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'v1', vote: 'yes' });
        let resolved = book.resolve(p.id, now + 10);
        expect(resolved.status).toBe('open');
        book.vote(p.id, { agentId: 'v2', vote: 'yes' });
        resolved = book.resolve(p.id, now + 20);
        expect(resolved.status).toBe('accepted');
    });

    test('pov timeout is 48h and rejects short of quorum at deadline', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'pov', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'v1', vote: 'yes' });
        const resolved = book.resolve(p.id, now + 172800 * 1000 + 1);
        expect(resolved.status).toBe('rejected');
    });

    test('weight 0 votes count as voters but contribute no weight', () => {
        const book = new QuorumBook({ minVoters: 2 });
        const p = book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'a2', vote: 'yes', weight: 1 });
        book.vote(p.id, { agentId: 'a3', vote: 'yes', weight: 0 });
        const tally = book.tally(p.id);
        expect(tally.voters).toBe(2);
        expect(tally.yes_weight).toBe(1);
    });

    test('list filters by status and get returns null for unknown id', () => {
        const book = new QuorumBook();
        book.createProposal({ type: 'self_improvement', title: 't', description: 'd', proposer: 'a1', now });
        expect(book.list({ status: 'open' }).length).toBe(1);
        expect(book.get('does-not-exist')).toBeNull();
    });

    test('voting on a resolved proposal throws PROPOSAL_CLOSED', () => {
        const book = new QuorumBook();
        const p = book.createProposal({ type: 'pov', title: 't', description: 'd', proposer: 'a1', now });
        book.vote(p.id, { agentId: 'v1', vote: 'yes' });
        book.vote(p.id, { agentId: 'v2', vote: 'yes' });
        book.resolve(p.id, now + 10);
        try {
            book.vote(p.id, { agentId: 'v3', vote: 'yes' });
            throw new Error('should have thrown');
        } catch (e) {
            expect(e.code).toBe('PROPOSAL_CLOSED');
        }
    });
});
