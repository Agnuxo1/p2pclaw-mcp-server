import { krippendorffAlpha, interJudgeAgreement } from '../../../packages/api/src/services/v8/krippendorff.js';

// Canonical example: Krippendorff (2011), "Computing Krippendorff's
// Alpha-Reliability" — 4 coders x 12 units (also reproduced on the
// Wikipedia "Krippendorff's alpha" article as the worked example).
// Reference values: interval alpha = 0.849, nominal alpha = 0.743.
const A = [1, 2, 3, 3, 2, 1, 4, 1, 2, null, null, null];
const B = [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, null, null];
const C = [null, 3, 3, 3, 2, 3, 4, 2, 2, 5, 1, null];
const D = [1, 2, 3, 3, 2, 4, 4, 1, 2, 5, 1, null];
const CANONICAL = [A, B, C, D];

describe('krippendorffAlpha', () => {
    test('matches the canonical reference example (interval)', () => {
        const { alpha, n_pairable_values, n_units_used } = krippendorffAlpha(CANONICAL, { metric: 'interval' });
        expect(Number(alpha.toFixed(3))).toBeCloseTo(0.849, 3);
        expect(n_pairable_values).toBe(40);
        expect(n_units_used).toBe(11); // last unit has 0 pairable values, dropped
    });

    test('matches the canonical reference example (nominal)', () => {
        const { alpha } = krippendorffAlpha(CANONICAL, { metric: 'nominal' });
        expect(Number(alpha.toFixed(3))).toBeCloseTo(0.743, 3);
    });

    test('returns null alpha with fewer than 2 judges', () => {
        const { alpha } = krippendorffAlpha([[1, 2, 3]], { metric: 'interval' });
        expect(alpha).toBeNull();
    });

    test('returns alpha 1 when observed and expected disagreement are both zero', () => {
        const matrix = [
            [2, 2, 2],
            [2, 2, 2]
        ];
        const { alpha } = krippendorffAlpha(matrix, { metric: 'interval' });
        expect(alpha).toBe(1);
    });

    test('drops units with fewer than 2 pairable values', () => {
        const matrix = [
            [1, null, 3],
            [1, null, 5]
        ];
        const { n_units_used, n_pairable_values } = krippendorffAlpha(matrix, { metric: 'interval' });
        expect(n_units_used).toBe(2);
        expect(n_pairable_values).toBe(4);
    });

    test('empty matrix returns null alpha', () => {
        const { alpha, n_pairable_values, n_units_used } = krippendorffAlpha([], { metric: 'interval' });
        expect(alpha).toBeNull();
        expect(n_pairable_values).toBe(0);
        expect(n_units_used).toBe(0);
    });
});

describe('interJudgeAgreement', () => {
    test('builds contract object from judge_details, interpretation reliable', () => {
        const judgeDetails = [
            { judge: 'j1', scores: { novelty: 8, rigor: 7, clarity: 9 } },
            { judge: 'j2', scores: { novelty: 8, rigor: 7, clarity: 9 } },
            { judge: 'j3', scores: { novelty: 8, rigor: 6, clarity: 9 } }
        ];
        const result = interJudgeAgreement(judgeDetails, ['novelty', 'rigor', 'clarity']);
        expect(result.metric).toBe('interval');
        expect(result.n_judges).toBe(3);
        expect(result.n_dimensions).toBe(3);
        expect(result.alpha).toBeGreaterThan(0.8);
        expect(result.interpretation).toBe('reliable');
    });

    test('insufficient when fewer than 2 judges', () => {
        const result = interJudgeAgreement([{ judge: 'j1', scores: { novelty: 8 } }], ['novelty']);
        expect(result.alpha).toBeNull();
        expect(result.interpretation).toBe('insufficient');
    });

    test('rounds alpha to 3 decimals', () => {
        const judgeDetails = [
            { judge: 'j1', scores: { a: 1, b: 2, c: 3, d: 4 } },
            { judge: 'j2', scores: { a: 1, b: 2, c: 3, d: 5 } },
            { judge: 'j3', scores: { a: 2, b: 2, c: 3, d: 4 } }
        ];
        const result = interJudgeAgreement(judgeDetails, ['a', 'b', 'c', 'd']);
        expect(result.alpha).toBe(Math.round(result.alpha * 1000) / 1000);
    });
});
