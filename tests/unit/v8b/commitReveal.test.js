import { commit, reveal, verifyCab } from '../../../packages/api/src/services/v8b/commitReveal.js';

const okVerifier = async () => ({ verified: true, verification_mode: 'structural' });
const failVerifier = async () => ({ verified: false });

describe('commitReveal — happy path', () => {
    it('commit -> reveal produces a valid, signed CAB', async () => {
        const c = commit('proof-content-123');
        expect(c.commit_id).toBeTruthy();
        expect(c.proof_hash).toHaveLength(64); // sha256 hex
        expect(c.expires_at).toBeGreaterThan(Date.now());

        const result = await reveal({ commit_id: c.commit_id, proof: 'proof-content-123', content: 'paper content here' }, okVerifier);

        expect(result.verified).toBe(true);
        expect(result.verification_mode).toBe('structural');
        expect(result.cab.cab_version).toBe(1);
        expect(result.cab.commit_id).toBe(c.commit_id);
        expect(result.cab.proof_hash).toBe(c.proof_hash);
        expect(result.cab.content_hash).toHaveLength(64);
        expect(result.cab.combined_hash).toHaveLength(64);
        expect(result.cab.bounds).toEqual({ commit_window_ms: 10000, reveal_timeout_ms: 180000 });
        expect(result.cab.signature).toBeTruthy();
        expect(result.cab.public_key).toBeTruthy();

        expect(verifyCab(result.cab)).toBe(true);
    });

    it('combined_hash is sha256(proof || content) per paper Eq. 10 (concatenation)', async () => {
        const crypto = await import('node:crypto');
        const c = commit('P');
        const result = await reveal({ commit_id: c.commit_id, proof: 'P', content: 'C' }, okVerifier);
        const expected = crypto.createHash('sha256').update('P' + 'C').digest('hex');
        expect(result.cab.combined_hash).toBe(expected);
    });
});

describe('commitReveal — failure modes', () => {
    it('rejects a hash mismatch (wrong proof at reveal time)', async () => {
        const c = commit('the-real-proof');
        const result = await reveal({ commit_id: c.commit_id, proof: 'a-different-proof', content: 'x' }, okVerifier);
        expect(result.verified).toBe(false);
        expect(result.error).toBe('HASH_MISMATCH');
    });

    it('rejects an expired commit', async () => {
        const c = commit('proof-expiring');
        const realNow = Date.now;
        Date.now = () => realNow() + 11 * 1000; // fast-forward past the 10s window
        try {
            const result = await reveal({ commit_id: c.commit_id, proof: 'proof-expiring', content: 'x' }, okVerifier);
            expect(result.verified).toBe(false);
            expect(result.error).toBe('COMMIT_EXPIRED');
        } finally {
            Date.now = realNow;
        }
    });

    it('rejects a replay of an already-revealed commit (one-time use)', async () => {
        const c = commit('replay-proof');
        const first = await reveal({ commit_id: c.commit_id, proof: 'replay-proof', content: 'x' }, okVerifier);
        expect(first.verified).toBe(true);

        const second = await reveal({ commit_id: c.commit_id, proof: 'replay-proof', content: 'x' }, okVerifier);
        expect(second.verified).toBe(false);
        expect(second.error).toBe('COMMIT_NOT_FOUND');
    });

    it('reports COMMIT_NOT_FOUND for an unknown commit_id', async () => {
        const result = await reveal({ commit_id: 'does-not-exist', proof: 'p', content: 'c' }, okVerifier);
        expect(result.verified).toBe(false);
        expect(result.error).toBe('COMMIT_NOT_FOUND');
    });

    it('surfaces verifier rejection without issuing a CAB', async () => {
        const c = commit('proof-that-fails-verification');
        const result = await reveal({ commit_id: c.commit_id, proof: 'proof-that-fails-verification', content: 'x' }, failVerifier);
        expect(result.verified).toBe(false);
        expect(result.error).toBe('VERIFICATION_FAILED');
        expect(result.cab).toBeUndefined();
    });
});

describe('commitReveal — CAB signature verification', () => {
    it('fails verifyCab when the CAB has been tampered with', async () => {
        const c = commit('tamper-test-proof');
        const result = await reveal({ commit_id: c.commit_id, proof: 'tamper-test-proof', content: 'original content' }, okVerifier);
        expect(verifyCab(result.cab)).toBe(true);

        const tampered = { ...result.cab, content_hash: 'deadbeef'.repeat(8) };
        expect(verifyCab(tampered)).toBe(false);
    });

    it('fails verifyCab on malformed input without throwing', () => {
        expect(verifyCab(null)).toBe(false);
        expect(verifyCab({})).toBe(false);
        expect(verifyCab({ signature: 'not-base64-!!', public_key: 'also-bad' })).toBe(false);
    });
});
