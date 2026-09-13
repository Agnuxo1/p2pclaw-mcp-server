import { jest } from '@jest/globals';
import { sign, verify } from 'node:crypto';
import {
    generateAgentKeypair, signPaper, verifyPaperSignature, vrfProve, vrfVerify,
} from '../../packages/api/src/services/crypto-service.js';

const keys = generateAgentKeypair();
const otherKeys = generateAgentKeypair();
const paper = { content: 'Research: π, λ and reproducible evidence', tier1_proof: 'proof-hash', timestamp: 1770000000000 };
const payload = Buffer.from(JSON.stringify({ content: paper.content, proof_hash: paper.tier1_proof, timestamp: paper.timestamp }), 'utf8');

afterEach(() => jest.restoreAllMocks());

describe('Ed25519 paper signatures', () => {
    test('produces a 64-byte signature independently accepted by the Node API', () => {
        const signature = signPaper(paper, keys.privateKey);
        expect(Buffer.from(signature, 'base64')).toHaveLength(64);
        expect(verify(null, payload, keys.publicKey, Buffer.from(signature, 'base64'))).toBe(true);
    });

    test('accepts a signature produced independently with the same wire payload', () => {
        const signature = sign(null, payload, keys.privateKey).toString('base64');
        expect(verifyPaperSignature(paper, signature, keys.publicKey)).toBe(true);
    });

    test('is deterministic for an unchanged paper', () => {
        expect(signPaper(paper, keys.privateKey)).toBe(signPaper(paper, keys.privateKey));
    });

    test.each([
        ['content', 'Modified manuscript'],
        ['tier1_proof', 'different-proof'],
        ['timestamp', paper.timestamp + 1],
    ])('rejects modification of %s', (field, value) => {
        const signature = signPaper(paper, keys.privateKey);
        expect(verifyPaperSignature({ ...paper, [field]: value }, signature, keys.publicKey)).toBe(false);
    });

    test('rejects a different public key', () => {
        expect(verifyPaperSignature(paper, signPaper(paper, keys.privateKey), otherKeys.publicKey)).toBe(false);
    });

    test('preserves the proof_hash alias', () => {
        const aliasPaper = { content: paper.content, proof_hash: paper.tier1_proof, timestamp: paper.timestamp };
        const signature = signPaper(aliasPaper, keys.privateKey);
        expect(signature).toBe(signPaper(paper, keys.privateKey));
        expect(verifyPaperSignature(aliasPaper, signature, keys.publicKey)).toBe(true);
    });

    test.each([undefined, null, 0])('round-trips absent/zero timestamp: %s', timestamp => {
        const zeroPaper = { content: paper.content, timestamp };
        const signature = signPaper(zeroPaper, keys.privateKey);
        expect(verifyPaperSignature(zeroPaper, signature, keys.publicKey)).toBe(true);
        expect(signature).toBe(signPaper({ content: paper.content, timestamp: 0 }, keys.privateKey));
    });

    test('fails safely for an invalid key or signature', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(signPaper(paper, 'not-a-key')).toBeNull();
        expect(verifyPaperSignature(paper, 'not-a-signature', keys.publicKey)).toBe(false);
        expect(verifyPaperSignature(paper, null, keys.publicKey)).toBe(false);
        expect(verifyPaperSignature(paper, signPaper(paper, keys.privateKey), 'not-a-key')).toBe(false);
    });
});

describe('legacy signed deterministic output', () => {
    test('round-trips and is independently verifiable as Ed25519', () => {
        const result = vrfProve('agent-1', 'round-1', keys.privateKey);
        expect(result.y).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeLessThanOrEqual(1);
        expect(verify(null, Buffer.from('agent-1:round-1'), keys.publicKey, Buffer.from(result.proof, 'base64'))).toBe(true);
        expect(vrfVerify('agent-1', 'round-1', result.y, result.proof, keys.publicKey)).toBe(true);
        expect(vrfProve('agent-1', 'round-1', keys.privateKey)).toEqual(result);
    });

    test('rejects another agent, round, output, key, or malformed proof', () => {
        const { y, proof } = vrfProve('agent-1', 'round-1', keys.privateKey);
        expect(vrfVerify('agent-2', 'round-1', y, proof, keys.publicKey)).toBe(false);
        expect(vrfVerify('agent-1', 'round-2', y, proof, keys.publicKey)).toBe(false);
        expect(vrfVerify('agent-1', 'round-1', y + 0.01, proof, keys.publicKey)).toBe(false);
        expect(vrfVerify('agent-1', 'round-1', y, proof, otherKeys.publicKey)).toBe(false);
        expect(vrfVerify('agent-1', 'round-1', y, 'invalid', keys.publicKey)).toBe(false);
    });
});
