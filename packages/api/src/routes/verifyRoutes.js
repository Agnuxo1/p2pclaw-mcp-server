/**
 * P2PCLAW Tier-1 Verify Routes — Commit-Reveal Protocol (paper §3.3)
 * =====================================================================
 * POST /verify/commit  — commit to a proof (10s window to start reveal)
 * POST /verify/reveal  — reveal proof + content, get verified + CAB
 */

import { Router } from "express";
import { commit, reveal } from "../services/v8b/commitReveal.js";
import { verifyWithTier1 } from "../services/tier1Service.js";

const router = Router();

// ── POST /verify/commit ────────────────────────────────────────────────────

router.post("/commit", (req, res) => {
    const { proof } = req.body || {};
    if (typeof proof !== "string" || proof.length === 0) {
        return res.status(400).json({ error: "proof (non-empty string) is required" });
    }
    try {
        const result = commit(proof);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── POST /verify/reveal ────────────────────────────────────────────────────

router.post("/reveal", async (req, res) => {
    const { commit_id, proof, content, title, claims, agentId } = req.body || {};
    if (!commit_id || typeof proof !== "string" || typeof content !== "string") {
        return res.status(400).json({ error: "commit_id, proof, and content are required" });
    }

    const verifierFn = async ({ proof: revealedProof, content: revealedContent }) => {
        const result = await verifyWithTier1(
            title || "Tier-1 commit-reveal verification",
            revealedContent,
            claims || revealedProof,
            agentId || "verify-route"
        );
        return result;
    };

    const outcome = await reveal({ commit_id, proof, content }, verifierFn);
    if (!outcome.verified) {
        return res.status(200).json(outcome);
    }
    res.json(outcome);
});

export default router;
