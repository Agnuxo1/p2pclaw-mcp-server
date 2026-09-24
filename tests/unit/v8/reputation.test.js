import { progressIndicator, updateQualityEMA, reputationDelta, applyReputation } from '../../../packages/api/src/services/v8/reputation.js';

describe('progressIndicator (Eq. 8)', () => {
    test('hand-computed value with default weights', () => {
        // tpsRatio=0.5, vwuRatio=0.5, igTerm=clamp01(0.8*0.5)=0.4
        // P = 0.3*0.5 + 0.5*0.5 + 0.2*0.4 = 0.15+0.25+0.08 = 0.48
        const p = progressIndicator({ tps: 50, tpsMax: 100, vwu: 30, vwuMax: 60, ig: 0.8, thetaIG: 0.5 });
        expect(p).toBeCloseTo(0.48, 6);
    });

    test('throws when weights do not sum to 1', () => {
        expect(() =>
            progressIndicator({ tps: 1, tpsMax: 1, vwu: 1, vwuMax: 1, ig: 1, thetaIG: 1 }, { alpha: 0.5, beta: 0.5, gamma: 0.5 })
        ).toThrow();
    });

    test('handles zero maxima with ratio 0', () => {
        const p = progressIndicator({ tps: 5, tpsMax: 0, vwu: 5, vwuMax: 0, ig: 0, thetaIG: 0 });
        expect(p).toBe(0);
    });

    test('clamps ratios above 1', () => {
        const p = progressIndicator({ tps: 200, tpsMax: 100, vwu: 0, vwuMax: 100, ig: 0, thetaIG: 0 }, { alpha: 1, beta: 0, gamma: 0 });
        expect(p).toBe(1);
    });
});

describe('updateQualityEMA', () => {
    test('hand-computed EMA', () => {
        // 0.95*0.8 + 0.05*0.6 = 0.79
        expect(updateQualityEMA(0.8, 0.6, 0.95)).toBeCloseTo(0.79, 6);
    });

    test('returns q when qBarPrev is null', () => {
        expect(updateQualityEMA(null, 0.6, 0.95)).toBe(0.6);
    });
});

describe('reputationDelta (Eq. 9)', () => {
    test('hand-computed delta with transfer term', () => {
        // localTerm = 0.95*(0.1 + (0.7-0.6)) = 0.95*0.2 = 0.19
        // transferTerm = 0.05*(10/40)*5 = 0.0625
        // total = 0.2525
        const d = reputationDelta({ deltaIJ: 0.1, q0i: 0.7, qBar0i: 0.6, tauBarI: 10, tauBarJ: 20, dTauJ: 5 }, { lambda: 0.95 });
        expect(d).toBeCloseTo(0.2525, 6);
    });

    test('transfer term is 0 when tauBarJ <= 0', () => {
        const d = reputationDelta({ deltaIJ: 0.1, q0i: 0.7, qBar0i: 0.6, tauBarI: 10, tauBarJ: 0, dTauJ: 5 }, { lambda: 0.95 });
        expect(d).toBeCloseTo(0.95 * 0.2, 6);
    });
});

describe('applyReputation', () => {
    test('clamps above 1', () => {
        expect(applyReputation(0.9, 0.3)).toBe(1);
    });

    test('clamps below 0', () => {
        expect(applyReputation(0.1, -0.5)).toBe(0);
    });

    test('normal addition within range', () => {
        expect(applyReputation(0.5, 0.1)).toBeCloseTo(0.6, 6);
    });
});
