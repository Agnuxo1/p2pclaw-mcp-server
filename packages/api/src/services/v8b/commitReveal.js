/**
 * P2PCLAW Tier-1 Commit-Reveal Protocol (paper §3.3)
 * ====================================================
 * commit(proof)  -> { commit_id, proof_hash, expires_at }   (reveal must START within 10s)
 * reveal({commit_id, proof, content}, verifierFn) -> runs verifierFn with a 180s
 *   timeout, and on success issues a Certificate of Authenticity and Bounds (CAB).
 *
 * Commits are one-time use: once a reveal attempt is accepted for hashing
 * (i.e. the commit exists, is unexpired, and the proof hash matches), the
 * commit is consumed and cannot be replayed.
 */

import crypto from 'node:crypto';
import { verificationMode } from '../tier1Service.js';

const COMMIT_WINDOW_MS = 10 * 1000;
const REVEAL_TIMEOUT_MS = 180 * 1000;
const CAB_VERSION = 1;
const VERIFIER_VERSION = 'p2pclaw-tier1-v8b-1.0.0';

const commits = new Map(); // commit_id -> { proof_hash, expires_at }

function sha256(input) {
    return crypto.createHash('sha256').update(String(input == null ? '' : input)).digest('hex');
}

// ── Ed25519 signing key ──────────────────────────────────────────────────────
// Uses CAB_SIGNING_KEY_PEM from env if set, else an ephemeral key generated
// at boot (still lets anyone verify via the embedded public_key).

let signingPrivateKey;
let signingPublicKeyB64;

function initSigningKey() {
    try {
        if (process.env.CAB_SIGNING_KEY_PEM) {
            signingPrivateKey = crypto.createPrivateKey(process.env.CAB_SIGNING_KEY_PEM);
        } else {
            const { privateKey } = crypto.generateKeyPairSync('ed25519');
            signingPrivateKey = privateKey;
        }
        const publicKey = crypto.createPublicKey(signingPrivateKey);
        signingPublicKeyB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    } catch (e) {
        // Should not happen on any Node >= 12, but never let key init crash the module.
        console.error('[commitReveal] Failed to initialize CAB signing key:', e.message);
    }
}
initSigningKey();

function signPayload(obj) {
    const payload = Buffer.from(JSON.stringify(obj));
    const signature = crypto.sign(null, payload, signingPrivateKey).toString('base64');
    return { signature, public_key: signingPublicKeyB64 };
}

/**
 * Verify a CAB's Ed25519 signature against its embedded public key.
 * Returns true/false. Never throws.
 */
export function verifyCab(cab) {
    if (!cab || typeof cab !== 'object') return false;
    const { signature, public_key, ...core } = cab;
    if (!signature || !public_key) return false;
    try {
        const payload = Buffer.from(JSON.stringify(core));
        const keyDer = Buffer.from(public_key, 'base64');
        const pubKeyObj = crypto.createPublicKey({ key: keyDer, format: 'der', type: 'spki' });
        return crypto.verify(null, payload, pubKeyObj, Buffer.from(signature, 'base64'));
    } catch (_) {
        return false;
    }
}

/**
 * Phase 1: commit to a proof without revealing it.
 * @param {string} proof
 * @returns {{commit_id: string, proof_hash: string, expires_at: number}}
 */
export function commit(proof) {
    if (typeof proof !== 'string' || proof.length === 0) {
        throw new Error('proof (non-empty string) is required');
    }
    const commit_id = crypto.randomUUID();
    const proof_hash = sha256(proof);
    const expires_at = Date.now() + COMMIT_WINDOW_MS;
    commits.set(commit_id, { proof_hash, expires_at });
    return { commit_id, proof_hash, expires_at };
}

/**
 * Phase 2: reveal the proof (+ content) and run verification.
 * @param {{commit_id: string, proof: string, content: string}} input
 * @param {(args: {proof: string, content: string}, signal: AbortSignal) => Promise<{verified: boolean, verification_mode?: string}>} verifierFn
 */
export async function reveal({ commit_id, proof, content }, verifierFn) {
    const entry = commits.get(commit_id);
    if (!entry) {
        return { verified: false, error: 'COMMIT_NOT_FOUND' };
    }
    if (Date.now() > entry.expires_at) {
        commits.delete(commit_id);
        return { verified: false, error: 'COMMIT_EXPIRED' };
    }
    if (sha256(proof) !== entry.proof_hash) {
        return { verified: false, error: 'HASH_MISMATCH' };
    }

    // One-time use: consume the commit now that the reveal is admitted,
    // regardless of what the verifier ultimately decides.
    commits.delete(commit_id);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REVEAL_TIMEOUT_MS);
    let verifierResult;
    try {
        verifierResult = await verifierFn({ proof, content }, controller.signal);
    } catch (e) {
        clearTimeout(timeoutHandle);
        return { verified: false, error: e.name === 'AbortError' ? 'VERIFY_TIMEOUT' : (e.message || 'VERIFY_ERROR').slice(0, 300) };
    }
    clearTimeout(timeoutHandle);

    if (!verifierResult || !verifierResult.verified) {
        return { verified: false, error: 'VERIFICATION_FAILED', detail: verifierResult || null };
    }

    const mode = verifierResult.verification_mode || verificationMode();
    const content_hash = sha256(content);
    const combined_hash = sha256((proof || '') + (content || '')); // paper Eq. 10 (concatenation)
    const issued_at = new Date().toISOString();

    const cabCore = {
        cab_version: CAB_VERSION,
        commit_id,
        proof_hash: entry.proof_hash,
        content_hash,
        combined_hash,
        verification_mode: mode,
        verifier_version: VERIFIER_VERSION,
        issued_at,
        bounds: { commit_window_ms: COMMIT_WINDOW_MS, reveal_timeout_ms: REVEAL_TIMEOUT_MS },
    };
    const { signature, public_key } = signPayload(cabCore);
    const cab = { ...cabCore, signature, public_key };

    return { verified: true, verification_mode: mode, cab };
}

export const __constants = { COMMIT_WINDOW_MS, REVEAL_TIMEOUT_MS, CAB_VERSION, VERIFIER_VERSION };
