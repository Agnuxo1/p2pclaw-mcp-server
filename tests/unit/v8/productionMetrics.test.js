import { computeProductionMetrics, EventLog } from '../../../packages/api/src/services/v8/productionMetrics.js';

describe('EventLog', () => {
    test('records and filters events by since()', () => {
        const log = new EventLog();
        const now = 1000000;
        log.record('publish_attempt', now - 5000);
        log.record('publish_accepted', now - 1000);
        const recent = log.since(2000).filter((e) => Date.now() - e.at <= 2000);
        expect(Array.isArray(recent)).toBe(true);
    });

    test('caps size at maxSize (ring buffer)', () => {
        const log = new EventLog(5);
        for (let i = 0; i < 10; i++) log.record('publish_attempt', i);
        expect(log.events.length).toBe(5);
        expect(log.events[0].at).toBe(5); // oldest 5 dropped
    });
});

describe('computeProductionMetrics', () => {
    const now = 2_000_000_000_000;

    function makePaper(overrides = {}) {
        return {
            id: 'p1',
            status: 'VERIFIED',
            word_count: 3000,
            score: 7.5,
            ...overrides
        };
    }

    test('produces the exact CONTRACT shape top-level keys', () => {
        const result = computeProductionMetrics({ now });
        expect(Object.keys(result).sort()).toEqual(
            ['agents', 'generated_at', 'judges', 'limitations', 'papers', 'publishing', 'storage_tiers', 'tribunal'].sort()
        );
        expect(Object.keys(result.papers).sort()).toEqual(
            ['lifecycle', 'mempool', 'promoted', 'score', 'total', 'verified', 'word_count', 'inter_judge_alpha'].sort()
        );
    });

    test('counts agents real vs simulated', () => {
        const agents = [{ id: 'a1' }, { id: 'a2', type: 'SIMULATED' }, { id: 'a3' }];
        const simulatedIds = new Set(['a3']);
        const result = computeProductionMetrics({ agents, simulatedIds, now });
        expect(result.agents.total).toBe(3);
        expect(result.agents.simulated).toBe(2);
        expect(result.agents.real).toBe(1);
    });

    test('builds a 10-bin histogram (0-1 .. 9-10) over overall scores', () => {
        const papers = [makePaper({ score: 0.5 }), makePaper({ score: 9.9 }), makePaper({ score: 10 }), makePaper({ score: 5.2 })];
        const result = computeProductionMetrics({ papers, now });
        expect(result.papers.score.histogram.length).toBe(10);
        expect(result.papers.score.histogram[0].bin).toBe('0-1');
        expect(result.papers.score.histogram[9].bin).toBe('9-10');
        // score=10 falls in top bin
        expect(result.papers.score.histogram[9].count).toBe(2); // 9.9 and 10
        expect(result.papers.score.histogram[0].count).toBe(1);
        expect(result.papers.score.histogram[5].count).toBe(1);
    });

    test('reads overall score from granular_scores JSON string when present', () => {
        const papers = [makePaper({ score: undefined, granular_scores: JSON.stringify({ overall: 6.3 }) })];
        const result = computeProductionMetrics({ papers, now });
        expect(result.papers.score.n).toBe(1);
        expect(result.papers.score.mean).toBeCloseTo(6.3, 2);
    });

    test('computes lifecycle counts consistent with paper statuses', () => {
        const papers = [
            makePaper({ status: 'MEMPOOL' }),
            makePaper({ status: 'VERIFIED' }),
            makePaper({ status: 'PROMOTED', score: 9.0, ipfs_cid: 'x' })
        ];
        const result = computeProductionMetrics({ papers, now });
        expect(result.papers.lifecycle.MEMPOOL).toBe(1);
        expect(result.papers.lifecycle.VERIFIED).toBe(1);
        expect(result.papers.lifecycle.CANONICAL).toBe(1); // promoted + score>=8.5 + ipfs_cid
        expect(result.papers.mempool).toBe(1);
    });

    test('publishing and tribunal metrics computed from windowed events', () => {
        const events = [
            { kind: 'publish_attempt', at: now - 1000 },
            { kind: 'publish_attempt', at: now - 2000 },
            { kind: 'publish_accepted', at: now - 1000 },
            { kind: 'publish_rejected', at: now - 500 },
            { kind: 'tribunal_session', at: now - 100 },
            { kind: 'tribunal_pass', at: now - 50 },
            { kind: 'publish_attempt', at: now - 100 * 3600 * 1000 } // outside 24h window
        ];
        const result = computeProductionMetrics({ events, now });
        expect(result.publishing.attempts).toBe(2);
        expect(result.publishing.accepted).toBe(1);
        expect(result.publishing.rejected).toBe(1);
        expect(result.publishing.failure_rate).toBeCloseTo(0.5, 2);
        expect(result.tribunal.sessions).toBe(1);
        expect(result.tribunal.passed).toBe(1);
        expect(result.tribunal.pass_rate).toBeCloseTo(1, 2);
    });

    test('storage_tiers reflects storageConfig booleans for all 5 tiers', () => {
        const result = computeProductionMetrics({ storageConfig: { memory: true, gun: true, r2: false, github: true, volume: false }, now });
        expect(result.storage_tiers).toEqual([
            { tier: 'memory', configured: true },
            { tier: 'gun', configured: true },
            { tier: 'r2', configured: false },
            { tier: 'github', configured: true },
            { tier: 'volume', configured: false }
        ]);
    });

    test('limitations is a non-empty array of strings', () => {
        const result = computeProductionMetrics({ now });
        expect(Array.isArray(result.limitations)).toBe(true);
        expect(result.limitations.length).toBeGreaterThan(0);
        for (const l of result.limitations) expect(typeof l).toBe('string');
    });
});

describe('computeProductionMetrics — judges and agreement are observed, never invented', () => {
    it('reports alpha mean as null and judges as null when nothing has been scored', () => {
        const m = computeProductionMetrics({ papers: [{ id: 'p1', status: 'VERIFIED' }], now: 1_000_000 });
        expect(m.papers.inter_judge_alpha).toEqual({ n: 0, mean: null });
        expect(m.judges.observed_recent).toBe(0);
        expect(m.judges.mean_per_paper).toBeNull();
    });

    it('counts distinct judges on papers scored in the last 24 h and averages judge_count', () => {
        const now = Date.parse('2026-09-24T12:00:00Z');
        const fresh = { judges: ['groq', 'cerebras', 'mistral'], judge_count: 3, scored_at: '2026-09-24T10:00:00Z', inter_judge_agreement: { alpha: 0.7 } };
        const old = { judges: ['nvidia'], judge_count: 1, scored_at: '2026-09-20T10:00:00Z', inter_judge_agreement: { alpha: 0.5 } };
        const m = computeProductionMetrics({
            papers: [{ id: 'a', status: 'VERIFIED', granular_scores: JSON.stringify(fresh) }, { id: 'b', status: 'VERIFIED', granular_scores: old }],
            now,
        });
        expect(m.judges.observed_recent).toBe(3);
        expect(m.judges.mean_per_paper).toBe(2);
        expect(m.papers.inter_judge_alpha).toEqual({ n: 2, mean: 0.6 });
    });
});
