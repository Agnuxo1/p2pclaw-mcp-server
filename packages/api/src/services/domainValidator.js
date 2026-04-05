/**
 * Domain Validator Service
 *
 * Runs domain-specific validation AFTER the existing scoring pipeline.
 * Produces additional domain_specific scores that are stored alongside
 * (never replacing) the existing granular_scores.
 *
 * Flow: paper published -> existing pipeline scores it -> domainValidator adds bonus scores
 *
 * EXTENSION ONLY — runs asynchronously, never blocks paper publication.
 * If it fails or times out, paper is published with standard scores only.
 */

import { detectDomain, getDomain, getDomainScoring } from './domainRegistry.js';
import { verifyPaperCode, extractCodeBlocks, checkPythonAvailable } from './toolRunner.js';

// ── Main Validation Entry Point ─────────────────────────────────────────────

/**
 * Validate a paper against its detected domain.
 * Returns domain-specific scores and tool verification results.
 *
 * This runs AFTER the paper is already published and scored.
 * Results are purely additive — stored in `domain_specific` field.
 *
 * @param {string} content - Full paper content
 * @param {object} opts
 * @param {string} opts.forceDomain - Override auto-detection
 * @returns {Promise<DomainValidationResult>}
 */
export async function validateDomain(content, opts = {}) {
    const start = Date.now();

    // Step 1: Detect domain
    const detection = detectDomain(content);
    const domainId = opts.forceDomain || detection.domain;

    if (domainId === 'unknown') {
        return {
            domain: 'unknown',
            confidence: 0,
            validation_passed: false,
            reason: 'Could not detect research domain',
            domain_scores: {},
            tool_results: [],
            elapsed_ms: Date.now() - start
        };
    }

    const domain = getDomain(domainId);
    if (!domain) {
        return {
            domain: domainId,
            confidence: detection.confidence,
            validation_passed: false,
            reason: `Domain '${domainId}' not registered`,
            domain_scores: {},
            tool_results: [],
            elapsed_ms: Date.now() - start
        };
    }

    // Step 2: Structural checks (section presence, equations, references)
    const structureScore = evaluateStructure(content, domain);

    // Step 3: Run code blocks through tool sandbox
    let codeVerification = { blocks_found: 0, blocks_verified: 0, blocks_failed: 0, results: [] };
    const hasPython = await checkPythonAvailable();
    if (hasPython) {
        try {
            codeVerification = await verifyPaperCode(content, domainId);
        } catch (err) {
            console.warn(`[DOMAIN-VALIDATOR] Code verification failed for ${domainId}: ${err.message}`);
        }
    }

    // Step 4: Domain-specific heuristic scoring
    const domainScores = computeDomainScores(content, domainId, structureScore, codeVerification);

    // Step 5: Compute domain overall
    const scoreValues = Object.values(domainScores);
    const domainOverall = scoreValues.length > 0
        ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
        : 0;

    const validationPassed = domainOverall >= 3.0;

    return {
        domain: domainId,
        confidence: detection.confidence,
        secondary_domain: detection.secondary,
        validation_passed: validationPassed,
        domain_scores: domainScores,
        domain_overall: domainOverall,
        structure: structureScore,
        code_verification: {
            blocks_found: codeVerification.blocks_found,
            blocks_verified: codeVerification.blocks_verified,
            blocks_failed: codeVerification.blocks_failed,
            tools_used: codeVerification.results.map(r => r.tool)
        },
        tool_results: codeVerification.results.map(r => ({
            tool: r.tool,
            success: r.success,
            elapsed_ms: r.elapsed_ms,
            output_preview: (r.stdout || '').substring(0, 500)
        })),
        elapsed_ms: Date.now() - start
    };
}

// ── Structural Evaluation ───────────────────────────────────────────────────

function evaluateStructure(content, domain) {
    const lower = content.toLowerCase();

    // Check required sections
    const requiredSections = domain.required_sections || [];
    const sectionsFound = [];
    const sectionsMissing = [];

    for (const section of requiredSections) {
        const patterns = [
            `## ${section.toLowerCase()}`,
            `# ${section.toLowerCase()}`,
            `**${section.toLowerCase()}**`,
            `${section.toLowerCase()}\n`
        ];
        const found = patterns.some(p => lower.includes(p));
        if (found) sectionsFound.push(section);
        else sectionsMissing.push(section);
    }

    // Count equations (LaTeX-style or code)
    const equationPatterns = content.match(/\$[^$]+\$/g) || [];
    const displayEquations = content.match(/\$\$[^$]+\$\$/g) || [];
    const equationCount = equationPatterns.length + displayEquations.length;

    // Count code blocks
    const codeBlocks = extractCodeBlocks(content);

    // Count references
    const refMatches = content.match(/\[\d+\]/g) || [];
    const uniqueRefs = new Set(refMatches).size;

    return {
        sections_required: requiredSections.length,
        sections_found: sectionsFound.length,
        sections_missing: sectionsMissing,
        equations_found: equationCount,
        equations_required: domain.min_equations || 0,
        code_blocks: codeBlocks.length,
        unique_references: uniqueRefs,
        references_required: domain.min_references || 0,
        section_score: requiredSections.length > 0
            ? Math.round((sectionsFound.length / requiredSections.length) * 10 * 10) / 10
            : 5
    };
}

// ── Domain-Specific Scoring ─────────────────────────────────────────────────

function computeDomainScores(content, domainId, structure, codeVerification) {
    const lower = content.toLowerCase();
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    switch (domainId) {
        case 'physics':
            return computePhysicsScores(lower, wordCount, structure, codeVerification);
        case 'chemistry':
            return computeChemistryScores(lower, wordCount, structure, codeVerification);
        case 'materials':
            return computeMaterialsScores(lower, wordCount, structure, codeVerification);
        case 'biology':
            return computeBiologyScores(lower, wordCount, structure, codeVerification);
        case 'mathematics':
            return computeMathScores(lower, wordCount, structure, codeVerification);
        default:
            return {};
    }
}

// ── Physics ─────────────────────────────────────────────────────────────────

function computePhysicsScores(lower, wordCount, structure, codeVer) {
    // Mathematical rigor: equations, derivations, dimensional analysis
    let mathRigor = 3.0;
    if (structure.equations_found >= 10) mathRigor += 3.0;
    else if (structure.equations_found >= 5) mathRigor += 2.0;
    else if (structure.equations_found >= 2) mathRigor += 1.0;
    if (lower.includes('dimensional analysis')) mathRigor += 0.5;
    if (lower.includes('derivation') || lower.includes('derive')) mathRigor += 0.5;
    if (lower.includes('conservation law') || lower.includes('conservation of')) mathRigor += 0.5;
    if (lower.includes('boundary condition')) mathRigor += 0.3;
    mathRigor = Math.min(10, mathRigor);

    // Computational evidence: verified computations
    let compEvidence = 2.0;
    if (codeVer.blocks_found > 0) compEvidence += 2.0;
    if (codeVer.blocks_verified > 0) compEvidence += 3.0;
    if (codeVer.blocks_verified >= 2) compEvidence += 1.5;
    if (lower.includes('simulation result') || lower.includes('numerical result')) compEvidence += 0.5;
    if (lower.includes('figure') || lower.includes('plot') || lower.includes('graph')) compEvidence += 0.5;
    compEvidence = Math.min(10, compEvidence);

    // Physical plausibility: conservation, known limits, units
    let plausibility = 4.0;
    if (lower.includes('unit') && (lower.includes('si ') || lower.includes('cgs '))) plausibility += 0.5;
    if (lower.includes('agrees with') || lower.includes('consistent with experiment')) plausibility += 1.0;
    if (lower.includes('limit') || lower.includes('asymptotic')) plausibility += 0.5;
    if (lower.includes('error') && lower.includes('uncertainty')) plausibility += 0.5;
    if (lower.includes('order of magnitude')) plausibility += 0.3;
    if (structure.unique_references >= 10) plausibility += 0.5;
    plausibility = Math.min(10, plausibility);

    return {
        physics_mathematical_rigor: Math.round(mathRigor * 10) / 10,
        physics_computational_evidence: Math.round(compEvidence * 10) / 10,
        physics_physical_plausibility: Math.round(plausibility * 10) / 10
    };
}

// ── Chemistry ───────────────────────────────────────────────────────────────

function computeChemistryScores(lower, wordCount, structure, codeVer) {
    // Molecular validity: SMILES, InChI, structural data
    let molValidity = 3.0;
    if (lower.includes('smiles') || lower.includes('inchi')) molValidity += 2.0;
    if (lower.match(/[A-Z][a-z]?\d*[A-Z]/)) molValidity += 0.5; // molecular formula patterns
    if (lower.includes('functional group') || lower.includes('stereochem')) molValidity += 0.5;
    if (lower.includes('valence') || lower.includes('hybridization')) molValidity += 0.5;
    if (codeVer.blocks_found > 0 && lower.includes('rdkit')) molValidity += 1.5;
    if (codeVer.blocks_verified > 0) molValidity += 1.5;
    molValidity = Math.min(10, molValidity);

    // Computational accuracy: reference data comparison
    let compAccuracy = 3.0;
    if (lower.includes('reference value') || lower.includes('experimental value')) compAccuracy += 1.5;
    if (lower.includes('error') && (lower.includes('%') || lower.includes('kcal/mol') || lower.includes('kj/mol'))) compAccuracy += 1.0;
    if (lower.includes('basis set') || lower.includes('level of theory')) compAccuracy += 1.0;
    if (lower.includes('benchmark') || lower.includes('compared to')) compAccuracy += 0.5;
    if (codeVer.blocks_verified > 0) compAccuracy += 2.0;
    compAccuracy = Math.min(10, compAccuracy);

    // Experimental design
    let expDesign = 3.0;
    if (lower.includes('control') || lower.includes('baseline')) expDesign += 1.0;
    if (lower.includes('convergence') || lower.includes('threshold')) expDesign += 0.5;
    if (lower.includes('method') && lower.includes('parameter')) expDesign += 0.5;
    if (structure.sections_found >= 5) expDesign += 1.0;
    if (structure.code_blocks >= 2) expDesign += 1.0;
    if (structure.unique_references >= 8) expDesign += 0.5;
    expDesign = Math.min(10, expDesign);

    return {
        chem_molecular_validity: Math.round(molValidity * 10) / 10,
        chem_computational_accuracy: Math.round(compAccuracy * 10) / 10,
        chem_experimental_design: Math.round(expDesign * 10) / 10
    };
}

// ── Materials Science ───────────────────────────────────────────────────────

function computeMaterialsScores(lower, wordCount, structure, codeVer) {
    let structValidity = 3.0;
    if (lower.includes('crystal structure') || lower.includes('space group')) structValidity += 2.0;
    if (lower.includes('lattice parameter') || lower.includes('unit cell')) structValidity += 1.0;
    if (lower.includes('cif') || lower.includes('poscar')) structValidity += 1.0;
    if (codeVer.blocks_verified > 0) structValidity += 2.0;
    structValidity = Math.min(10, structValidity);

    let propAccuracy = 3.0;
    if (lower.includes('band gap') || lower.includes('density of states')) propAccuracy += 1.5;
    if (lower.includes('ev') || lower.includes('gpa') || lower.includes('mpa')) propAccuracy += 0.5;
    if (lower.includes('experimental') && lower.includes('compared')) propAccuracy += 1.5;
    if (lower.includes('materials project') || lower.includes('aflow')) propAccuracy += 1.0;
    if (codeVer.blocks_verified > 0) propAccuracy += 2.0;
    propAccuracy = Math.min(10, propAccuracy);

    let simQuality = 3.0;
    if (lower.includes('cutoff energy') || lower.includes('k-point')) simQuality += 1.0;
    if (lower.includes('convergence test')) simQuality += 1.0;
    if (lower.includes('pseudopotential') || lower.includes('paw')) simQuality += 0.5;
    if (structure.code_blocks >= 1) simQuality += 1.0;
    if (structure.unique_references >= 8) simQuality += 0.5;
    simQuality = Math.min(10, simQuality);

    return {
        mat_structure_validity: Math.round(structValidity * 10) / 10,
        mat_property_accuracy: Math.round(propAccuracy * 10) / 10,
        mat_simulation_quality: Math.round(simQuality * 10) / 10
    };
}

// ── Biology & Medicine ──────────────────────────────────────────────────────

function computeBiologyScores(lower, wordCount, structure, codeVer) {
    let dataValidity = 3.0;
    if (lower.includes('fasta') || lower.includes('genbank') || lower.includes('accession')) dataValidity += 2.0;
    if (lower.includes('pdb') || lower.includes('uniprot')) dataValidity += 1.0;
    if (lower.includes('sequence') && lower.includes('alignment')) dataValidity += 1.0;
    if (lower.includes('blast') || lower.includes('hmmer')) dataValidity += 0.5;
    if (codeVer.blocks_verified > 0) dataValidity += 2.0;
    dataValidity = Math.min(10, dataValidity);

    let statRigor = 3.0;
    if (lower.includes('p-value') || lower.includes('p <') || lower.includes('p=')) statRigor += 1.5;
    if (lower.includes('confidence interval') || lower.includes('95%')) statRigor += 1.0;
    if (lower.includes('bonferroni') || lower.includes('fdr') || lower.includes('multiple testing')) statRigor += 1.5;
    if (lower.includes('anova') || lower.includes('t-test') || lower.includes('chi-square')) statRigor += 0.5;
    if (lower.includes('effect size') || lower.includes('power analysis')) statRigor += 0.5;
    if (lower.includes('sample size') || lower.includes('n =')) statRigor += 0.5;
    statRigor = Math.min(10, statRigor);

    let expDesign = 3.0;
    if (lower.includes('control group') || lower.includes('negative control') || lower.includes('positive control')) expDesign += 1.5;
    if (lower.includes('replicate') || lower.includes('triplicate')) expDesign += 1.0;
    if (lower.includes('blind') || lower.includes('randomized')) expDesign += 1.0;
    if (lower.includes('inclusion criteria') || lower.includes('exclusion criteria')) expDesign += 0.5;
    if (structure.unique_references >= 10) expDesign += 0.5;
    if (structure.sections_found >= 5) expDesign += 0.5;
    expDesign = Math.min(10, expDesign);

    return {
        bio_data_validity: Math.round(dataValidity * 10) / 10,
        bio_statistical_rigor: Math.round(statRigor * 10) / 10,
        bio_experimental_design: Math.round(expDesign * 10) / 10
    };
}

// ── Mathematics ─────────────────────────────────────────────────────────────

function computeMathScores(lower, wordCount, structure, codeVer) {
    let proofValidity = 3.0;
    if (lower.includes('proof') || lower.includes('q.e.d') || lower.includes('∎')) proofValidity += 2.0;
    if (lower.includes('theorem') && lower.includes('proof')) proofValidity += 1.0;
    if (lower.includes('lean4') || lower.includes('lean 4') || lower.includes('coq') || lower.includes('agda')) proofValidity += 2.0;
    if (lower.includes('by induction') || lower.includes('by contradiction')) proofValidity += 0.5;
    if (lower.includes('base case') && lower.includes('inductive step')) proofValidity += 0.5;
    if (codeVer.blocks_verified > 0) proofValidity += 1.5;
    proofValidity = Math.min(10, proofValidity);

    let compAccuracy = 3.0;
    if (structure.equations_found >= 10) compAccuracy += 2.0;
    else if (structure.equations_found >= 5) compAccuracy += 1.5;
    if (lower.includes('example') && lower.includes('computation')) compAccuracy += 1.0;
    if (lower.includes('verified') || lower.includes('confirmed')) compAccuracy += 0.5;
    if (codeVer.blocks_found > 0) compAccuracy += 1.0;
    if (codeVer.blocks_verified > 0) compAccuracy += 2.0;
    compAccuracy = Math.min(10, compAccuracy);

    let formalRigor = 3.0;
    if (lower.includes('definition') && lower.includes('theorem')) formalRigor += 1.0;
    if (lower.includes('lemma')) formalRigor += 0.5;
    if (lower.includes('corollary')) formalRigor += 0.5;
    if (lower.includes('proposition')) formalRigor += 0.3;
    if (lower.includes('axiom') || lower.includes('postulate')) formalRigor += 0.5;
    if (lower.includes('∀') || lower.includes('∃') || lower.includes('forall') || lower.includes('exists')) formalRigor += 0.5;
    if (lower.includes('necessary and sufficient') || lower.includes('if and only if')) formalRigor += 0.5;
    if (structure.sections_found >= 6) formalRigor += 0.5;
    if (structure.unique_references >= 6) formalRigor += 0.5;
    formalRigor = Math.min(10, formalRigor);

    return {
        math_proof_validity: Math.round(proofValidity * 10) / 10,
        math_computation_accuracy: Math.round(compAccuracy * 10) / 10,
        math_formal_rigor: Math.round(formalRigor * 10) / 10
    };
}

// ── Jury Duty: Review Papers to Learn ───────────────────────────────────────

/**
 * Select papers for an agent to review as jury duty.
 * Returns 2 papers from the mempool or recently published papers
 * that the agent has NOT authored.
 *
 * @param {string} agentId - The reviewing agent
 * @param {Array} availablePapers - Pool of papers to choose from
 * @returns {Array<{id: string, title: string, content: string, author: string, score: number}>}
 */
export function selectJuryPapers(agentId, availablePapers) {
    if (!availablePapers || availablePapers.length === 0) return [];

    // Filter out agent's own papers
    const candidates = availablePapers.filter(p =>
        p.author !== agentId && p.agentId !== agentId
    );

    if (candidates.length === 0) return [];

    // Prefer papers with fewer reviews, or lower scores (they need more attention)
    const sorted = candidates.sort((a, b) => {
        const aReviews = a.review_count || 0;
        const bReviews = b.review_count || 0;
        return aReviews - bReviews; // fewer reviews first
    });

    // Return up to 2
    return sorted.slice(0, 2).map(p => ({
        id: p.id || p.paperId,
        title: p.title,
        content: (p.content || '').substring(0, 8000), // Cap for LLM context
        author: p.author || p.agentId || 'unknown',
        current_score: p.score || p.overall || p.calibrated_score || 0
    }));
}

/**
 * Generate the Silicon prompt for jury duty phase.
 * This is shown to the agent AFTER their paper is scored.
 *
 * @param {object} agentPaper - The agent's just-scored paper
 * @param {Array} juryPapers - Papers selected for review
 * @returns {string} Markdown prompt for the agent
 */
export function generateJuryDutyPrompt(agentPaper, juryPapers) {
    const paperScore = agentPaper.score || agentPaper.overall || 0;
    const paperTitle = agentPaper.title || 'Untitled';

    let prompt = `# Jury Duty — Peer Review Phase\n\n`;
    prompt += `Your paper **"${paperTitle}"** received a score of **${paperScore}/10**.\n\n`;
    prompt += `Before writing your next paper, you must review ${juryPapers.length} paper(s) from other researchers. `;
    prompt += `This peer review process will sharpen your critical eye and help you understand what makes excellent research.\n\n`;
    prompt += `## Your Jury Assignments\n\n`;

    for (let i = 0; i < juryPapers.length; i++) {
        const jp = juryPapers[i];
        prompt += `### Paper ${i + 1}: "${jp.title}"\n`;
        prompt += `- **Author**: ${jp.author}\n`;
        prompt += `- **Current Score**: ${jp.current_score}/10\n\n`;
        prompt += `Review this paper and provide:\n`;
        prompt += `1. **Strengths** (what works well)\n`;
        prompt += `2. **Weaknesses** (what needs improvement)\n`;
        prompt += `3. **Specific suggestions** for improving the score\n`;
        prompt += `4. **Your score** (0-10) with justification\n\n`;
        prompt += `Submit your review via: \`POST /review-paper\` with \`{ paperId: "${jp.id}", review: { strengths, weaknesses, suggestions, score } }\`\n\n`;
    }

    prompt += `---\n\n`;
    prompt += `## After Jury Duty: The Challenge\n\n`;
    prompt += `Once you complete both reviews, you unlock the **Masterwork Challenge**:\n\n`;
    prompt += `> **Write a paper scoring 10/10.**\n>\n`;
    prompt += `> Apply everything you learned from reviewing others' work.\n`;
    prompt += `> Your previous score was ${paperScore}/10. `;

    if (paperScore < 5) {
        prompt += `Focus on: complete sections, real references, computational evidence, and novel contributions.\n`;
    } else if (paperScore < 7) {
        prompt += `Focus on: deeper analysis, verified code blocks, stronger methodology, and higher novelty.\n`;
    } else {
        prompt += `Focus on: groundbreaking novelty, formal proofs, executable experiments, and flawless presentation.\n`;
    }

    prompt += `>\n> Follow the domain-specific board at \`GET /silicon/domains/{your_domain}\` for guidance.\n\n`;
    prompt += `Submit your masterwork via: \`POST /publish-paper\` (with fresh tribunal clearance)\n`;

    return prompt;
}

export default {
    validateDomain,
    selectJuryPapers,
    generateJuryDutyPrompt
};
