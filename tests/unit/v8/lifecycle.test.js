import { lifecycleStage } from '../../../packages/api/src/services/v8/lifecycle.js';

describe('lifecycleStage', () => {
    test('MEMPOOL by default status', () => {
        expect(lifecycleStage({ id: 'p1', status: 'MEMPOOL' })).toBe('MEMPOOL');
    });

    test('missing paper is MEMPOOL', () => {
        expect(lifecycleStage(null)).toBe('MEMPOOL');
    });

    test('VERIFIED by status', () => {
        expect(lifecycleStage({ id: 'p2', status: 'VERIFIED' })).toBe('VERIFIED');
    });

    test('PROMOTED by status', () => {
        expect(lifecycleStage({ id: 'p3', status: 'PROMOTED' })).toBe('PROMOTED');
    });

    test('PROMOTED by network_validations >= 2 (array form)', () => {
        expect(lifecycleStage({ id: 'p4', status: 'VERIFIED', network_validations: [1, 2] })).toBe('PROMOTED');
    });

    test('PROMOTED by validations field alias (number form)', () => {
        expect(lifecycleStage({ id: 'p5', status: 'VERIFIED', validations: 3 })).toBe('PROMOTED');
    });

    test('not promoted when only 1 validation', () => {
        expect(lifecycleStage({ id: 'p6', status: 'VERIFIED', network_validations: 1 })).toBe('VERIFIED');
    });

    test('PODIUM when promoted and in podium set', () => {
        const podiumIds = new Set(['p7']);
        expect(lifecycleStage({ id: 'p7', status: 'PROMOTED' }, { podiumIds })).toBe('PODIUM');
    });

    test('CANONICAL when promoted, overall >= 8.5, and ipfs_cid present', () => {
        const paper = { id: 'p8', status: 'PROMOTED', score: 9.0, ipfs_cid: 'bafy123' };
        expect(lifecycleStage(paper)).toBe('CANONICAL');
    });

    test('CANONICAL reads overall from granular_scores JSON string', () => {
        const paper = {
            id: 'p9',
            status: 'PROMOTED',
            ipfs_cid: 'bafy456',
            granular_scores: JSON.stringify({ overall: 8.6 })
        };
        expect(lifecycleStage(paper)).toBe('CANONICAL');
    });

    test('not CANONICAL without ipfs_cid even if score is high', () => {
        const paper = { id: 'p10', status: 'PROMOTED', score: 9.5 };
        expect(lifecycleStage(paper)).toBe('PROMOTED');
    });

    test('not CANONICAL below custom threshold', () => {
        const paper = { id: 'p11', status: 'PROMOTED', score: 9.0, ipfs_cid: 'x' };
        expect(lifecycleStage(paper, { canonicalThreshold: 9.9 })).toBe('PROMOTED');
    });
});
