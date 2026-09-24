import crypto from 'crypto';
import { verifyPaperInProcess } from './heytingVerifier.js';

const VERIFIER_URL = process.env.TIER1_VERIFIER_URL || 'https://agnuxo-lean4-proof-checker.hf.space';

/**
 * Paper §3.3 — which verification mode Tier-1 is configured to use.
 * 'lean4' when a real Lean compile service is configured (LEAN_VERIFIER_URL),
 * else 'structural' (the in-process Heyting Nucleus fallback).
 * This reflects CONFIGURATION, not necessarily the outcome of a given call —
 * individual results are labeled with the mode actually used (see below).
 */
export function verificationMode() {
    return process.env.LEAN_VERIFIER_URL ? 'lean4' : 'structural';
}

/**
 * Sends research content and claims to the Lean 4 proof engine container.
 * Falls back to in-process Heyting Nucleus verification if container is unavailable.
 * 
 * @param {string} title 
 * @param {string} content 
 * @param {Array|string} claims 
 * @param {string} agentId 
 * @returns {Promise<Object>} Verification result including lean_proof and proof_hash
 */
export async function verifyWithTier1(title, content, claims, agentId) {
  // Try external Lean 4 container first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${VERIFIER_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, claims, agent_id: agentId }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Verifier returned status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.verified) {
      // Verify that the proof_hash is legitimate:
      // proof_hash = SHA256(lean_proof || content)
      const expectedHash = crypto
        .createHash('sha256')
        .update((result.lean_proof || "") + content)
        .digest('hex');
        
      if (expectedHash !== result.proof_hash) {
        return { verified: false, error: 'HASH_MISMATCH' };
      }
    }
    
    console.log(`[TIER1] External verifier result: ${result.verified ? 'VERIFIED' : 'UNVERIFIED'}`);
    // Honest labeling: this branch actually compiled/checked via the external
    // Lean 4 service, so it is labeled 'lean4' regardless of configuration.
    return { ...result, verification_mode: 'lean4' }; // { verified, proof_hash, lean_proof, occam_score, violations[] }

  } catch (err) {
    // External verifier unavailable â€” use in-process Heyting Nucleus engine.
    // Honest labeling: this is a structural fallback, not a real Lean 4
    // compile, so it is always labeled 'structural' even if LEAN_VERIFIER_URL
    // is configured (the configured mode was simply unreachable this time).
    console.log(`[TIER1] External verifier unavailable (${err.message}). Using in-process Heyting Nucleus engine.`);
    const structuralResult = await verifyPaperInProcess(title, content, claims, agentId);
    return { ...structuralResult, verification_mode: 'structural' };
  }
}

/**
 * Lean 4 Formal Verification — sends Lean 4 source to the external Tier-1
 * verifier (commit-reveal protocol: POST /hash → POST /verify).
 * Returns the full CAB certificate on success.
 *
 * @param {string} leanContent - Lean 4 source code
 * @param {string} claim - Human-readable claim the proof addresses
 * @param {string} mainTheorem - Name of the main theorem in the Lean source
 * @param {string} agentId - Submitting agent or human ID
 * @param {string} investigationContext - Context / paper title
 * @param {string} [mode=”default”] - “default” or “grind”
 * @returns {Promise<Object>} Full VerifyResponse with certificate
 */
export async function verifyLean4Proof(leanContent, claim, mainTheorem, agentId, investigationContext, mode = 'full') {
  const url = process.env.TIER1_VERIFIER_URL || VERIFIER_URL;

  // Step 1: Get committed hash (commit-reveal anti-tampering)
  let committedHash = '';
  try {
    const hashRes = await fetch(`${url}/hash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lean_content: leanContent }),
      signal: AbortSignal.timeout(10000),
    });
    if (hashRes.ok) {
      const hashData = await hashRes.json();
      committedHash = hashData.proof_hash || '';
    }
  } catch (e) {
    console.warn('[TIER1-LEAN4] /hash failed, proceeding without commit:', e.message);
  }

  // Step 2: Full verification (schema → hygiene → lean type-check → semantic audit)
  const verifyRes = await fetch(`${url}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lean_content: leanContent,
      claim,
      main_theorem: mainTheorem,
      agent_id: agentId,
      investigation_context: investigationContext,
      committed_hash: committedHash,
      mode,
    }),
    signal: AbortSignal.timeout(180000), // 3 min for Lean type-check
  });

  if (!verifyRes.ok) {
    const errText = await verifyRes.text().catch(() => '');
    throw new Error(`Tier1 verifier HTTP ${verifyRes.status}: ${errText.slice(0, 300)}`);
  }

  const result = await verifyRes.json();
  console.log(`[TIER1-LEAN4] Verdict: ${result.verdict} | Lean compiles: ${result.lean_compiles} | Semantic: ${result.semantic_audit}`);
  return result;
}

/**
 * P2P Verification â€” an agent re-verifies the proof_hash of a paper
 * during the validation process (PoV protocol Stage 3).
 * 
 * @param {string} leanProof 
 * @param {string} content 
 * @param {string} claimedHash 
 * @returns {boolean}
 */
export function reVerifyProofHash(leanProof, content, claimedHash) {
  if (!claimedHash) return false;
  const computedHash = crypto
    .createHash('sha256')
    .update((leanProof || "") + content)
    .digest('hex');
  return computedHash === claimedHash;
}
