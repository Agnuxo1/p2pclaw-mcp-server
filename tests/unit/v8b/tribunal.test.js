import {
    startPresentation,
    evaluateExamination,
    getCategoryTable,
    registerExaminerStatsProvider,
    listExaminers,
    assertNoConflict,
    proposeQuestion,
    endorseQuestion,
    listQuestionProposals,
} from '../../../packages/api/src/services/tribunalService.js';

const PRESENTATION = {
    name: 'Test Agent',
    project_title: 'A distributed consensus protocol for P2P networks',
    project_description: 'We build a distributed systems protocol using consensus algorithms over a P2P network.',
    novelty_claim: 'This is a novel approach to distributed consensus.',
    motivation: 'We wanted to explore decentralized systems and networking.',
};

function present(agentId = `agent-${Date.now()}-${Math.random()}`) {
    return startPresentation(agentId, PRESENTATION);
}

describe('tribunalService — category table', () => {
    it('exposes the target pool sizes from the paper table (30 total, per-category)', () => {
        const table = getCategoryTable();
        const byId = Object.fromEntries(table.categories.map(c => [c.id, c.pool_size]));

        expect(byId.pattern).toBe(3);
        expect(byId.verbal).toBe(3);
        expect(byId.spatial).toBe(2);
        expect(byId.mathematical).toBe(4);
        expect(byId.logical).toBe(3);
        expect(byId.psychology).toBe(4);
        expect(byId.domain).toBe(6);
        expect(byId.trick).toBe(5);

        expect(table.pool_total).toBe(30);
        expect(table.questions_per_exam).toBe(8);
        expect(table.pass_threshold).toBe(0.6);
    });
});

describe('tribunalService — stratified selection', () => {
    it('always selects exactly 8 questions covering 8 distinct categories, over 200 draws', () => {
        const expectedCategories = new Set(['PATTERN', 'VERBAL', 'SPATIAL', 'MATH', 'LOGIC', 'PSYCHOLOGY', 'DOMAIN', 'TRICK']);

        for (let i = 0; i < 200; i++) {
            const result = present(`stratified-${i}`);
            expect(result.error).toBeFalsy();
            expect(result.questions).toHaveLength(8);

            const categories = new Set(result.questions.map(q => q.category));
            expect(categories.size).toBe(8);
            for (const cat of categories) expect(expectedCategories.has(cat)).toBe(true);
        }
    });
});

describe('tribunalService — grading of new questions', () => {
    async function findAndAnswer(questionId, answerText) {
        // Draw presentations until the target question appears (bounded attempts),
        // then answer it correctly and everything else blank, checking its own score.
        for (let attempt = 0; attempt < 500; attempt++) {
            const result = present(`grading-${questionId}-${attempt}`);
            const target = result.questions.find(q => q.id === questionId);
            if (!target) continue;

            const answers = {};
            for (const q of result.questions) {
                answers[q.id] = q.id === questionId ? answerText : 'irrelevant filler answer text';
            }
            const evaluation = await evaluateExamination(result.session_id, answers);
            const entry = evaluation.results.find(r => r.id === questionId);
            return entry;
        }
        throw new Error(`Question ${questionId} was never drawn in 500 attempts`);
    }

    it('grades verbal-3 (elucidate/obfuscate) correctly', async () => {
        const entry = await findAndAnswer('verbal-3', 'They are antonyms: elucidate means to make clear, obfuscate means to make it obscure or confuse.');
        expect(entry.score).toBe(2);
    });

    it('grades math-3 (train speed) correctly', async () => {
        const entry = await findAndAnswer('math-3', 'It takes 3.75 hours at the same 40 mph speed.');
        expect(entry.score).toBe(2);
    });

    it('grades math-4 (sum of first 20 integers) correctly', async () => {
        const entry = await findAndAnswer('math-4', 'The sum is 210.');
        expect(entry.score).toBe(2);
    });

    it('grades logic-3 (affirming the consequent) correctly', async () => {
        const entry = await findAndAnswer('logic-3', 'No, this is not necessarily true — it is the fallacy of affirming the consequent.');
        expect(entry.score).toBe(2);
    });
});

describe('tribunalService — examiner eligibility & conflict of interest', () => {
    afterEach(() => registerExaminerStatsProvider(null));

    it('applies default eligibility thresholds (min_papers=3, min_avg_score=7.0)', () => {
        registerExaminerStatsProvider(() => [
            { agentId: 'eligible-1', papers: 5, avg_score: 8.2 },
            { agentId: 'too-few-papers', papers: 1, avg_score: 9.0 },
            { agentId: 'too-low-score', papers: 10, avg_score: 5.0 },
        ]);

        const { examiners, criteria } = listExaminers();
        expect(criteria.min_papers).toBe(3);
        expect(criteria.min_avg_score).toBe(7.0);

        const ids = examiners.map(e => e.agentId);
        expect(ids).toContain('eligible-1');
        expect(ids).not.toContain('too-few-papers');
        expect(ids).not.toContain('too-low-score');
        expect(examiners.find(e => e.agentId === 'eligible-1').eligible_since).toBeTruthy();
    });

    it('assertNoConflict throws when examiner === subject, passes otherwise', () => {
        expect(() => assertNoConflict('agent-x', 'agent-x')).toThrow();
        expect(assertNoConflict('agent-x', 'agent-y')).toBe(true);
    });
});

describe('tribunalService — dynamic question bank', () => {
    const EXAMINER_A = 'examiner-a';
    const EXAMINER_B = 'examiner-b';
    const EXAMINER_C = 'examiner-c';

    beforeEach(() => {
        registerExaminerStatsProvider(() => [
            { agentId: EXAMINER_A, papers: 5, avg_score: 8.0 },
            { agentId: EXAMINER_B, papers: 5, avg_score: 8.0 },
            { agentId: EXAMINER_C, papers: 5, avg_score: 8.0 },
        ]);
    });
    afterEach(() => registerExaminerStatsProvider(null));

    it('rejects proposals from non-examiners', () => {
        const result = proposeQuestion('random-non-examiner', {
            category: 'LOGIC',
            question: 'This is a perfectly valid twenty-plus character question?',
            expected_keywords: ['a', 'b'],
        });
        expect(result.error).toBe(true);
    });

    it('validates category, question length, and keyword count', () => {
        const badCategory = proposeQuestion(EXAMINER_A, {
            category: 'NOT_A_CATEGORY',
            question: 'This is a perfectly valid twenty-plus character question?',
            expected_keywords: ['a', 'b'],
        });
        expect(badCategory.error).toBe(true);

        const tooShort = proposeQuestion(EXAMINER_A, {
            category: 'LOGIC',
            question: 'short',
            expected_keywords: ['a', 'b'],
        });
        expect(tooShort.error).toBe(true);

        const tooFewKeywords = proposeQuestion(EXAMINER_A, {
            category: 'LOGIC',
            question: 'This is a perfectly valid twenty-plus character question?',
            expected_keywords: ['only-one'],
        });
        expect(tooFewKeywords.error).toBe(true);
    });

    it('rejects self-endorsement, rejects duplicate endorsement, accepts after 2 distinct endorsers, and inserts into the live pool', () => {
        const before = getCategoryTable().categories.find(c => c.id === 'logical').pool_size;

        const proposal = proposeQuestion(EXAMINER_A, {
            category: 'LOGIC',
            question: 'Is every valid deduction also a sound argument? Explain briefly.',
            expected_keywords: ['sound', 'true premises', 'valid'],
            rationale: 'Tests understanding of validity vs soundness.',
        });
        expect(proposal.error).toBeFalsy();
        const { proposal_id } = proposal;

        // Self-endorsement (COI) must be rejected
        const selfEndorse = endorseQuestion(proposal_id, EXAMINER_A);
        expect(selfEndorse.error).toBe(true);

        // First distinct endorsement
        const firstEndorse = endorseQuestion(proposal_id, EXAMINER_B);
        expect(firstEndorse.error).toBeFalsy();
        expect(firstEndorse.status).toBe('pending');
        expect(firstEndorse.endorsements).toBe(1);

        // Duplicate endorsement from the same examiner must be rejected
        const dupEndorse = endorseQuestion(proposal_id, EXAMINER_B);
        expect(dupEndorse.error).toBe(true);

        // Second distinct endorsement -> accepted
        const secondEndorse = endorseQuestion(proposal_id, EXAMINER_C);
        expect(secondEndorse.error).toBeFalsy();
        expect(secondEndorse.status).toBe('accepted');
        expect(secondEndorse.endorsements).toBe(2);

        const after = getCategoryTable().categories.find(c => c.id === 'logical').pool_size;
        expect(after).toBe(before + 1);

        const { proposals } = listQuestionProposals();
        const stored = proposals.find(p => p.id === proposal_id);
        expect(stored.status).toBe('accepted');
    });
});
