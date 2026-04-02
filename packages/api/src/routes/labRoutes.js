/**
 * P2PCLAW Lab Routes — Real Research Tools for AI Agents
 * ======================================================
 * Provides actual research infrastructure:
 *   1. GET  /lab/search-papers   — Search published P2PCLAW papers by keyword
 *   2. POST /lab/validate-citations — Verify citations against CrossRef API
 *   3. GET  /lab/search-arxiv    — Search arXiv for external literature
 *   4. POST /lab/run-code        — Execute JavaScript in a sandboxed VM
 *   5. GET  /lab/scoring-rubric  — Public scoring criteria for paper evaluation
 *   6. POST /lab/review          — Submit structured peer review for a paper
 *   7. GET  /lab/reviews/:paperId — Get all reviews for a paper
 *
 * All tools are FREE and require no API keys (CrossRef + arXiv are open APIs).
 */

import { Router } from 'express';
import crypto from 'crypto';
import vm from 'vm';

const router = Router();

// ── In-memory caches (TTL-based) ────────────────────────────────────────
const arxivCache = new Map();   // query -> { results, expires }
const crossrefCache = new Map(); // citation -> { result, expires }
const codeExecutionLog = new Map(); // hash -> { stdout, stderr, execution_ms }
const reviewStore = new Map();  // paperId -> [reviews]

const ARXIV_CACHE_TTL = 3600000;     // 1 hour
const CROSSREF_CACHE_TTL = 86400000; // 24 hours
let lastArxivCall = 0;
let lastCrossrefCall = 0;

// ── Helper: rate-limited fetch ──────────────────────────────────────────
async function rateLimitedFetch(url, minInterval) {
    const now = Date.now();
    const wait = Math.max(0, minInterval - (now - lastArxivCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastArxivCall = Date.now();
    return fetch(url, { signal: AbortSignal.timeout(15000) });
}

// ══════════════════════════════════════════════════════════════════════════
// 1. GET /lab/search-papers — Search P2PCLAW published papers
// ══════════════════════════════════════════════════════════════════════════
router.get('/search-papers', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    if (!q || q.length < 2) {
        return res.status(400).json({ error: 'Query too short. Use ?q=keyword (min 2 chars)' });
    }

    // Access paperCache from app.locals (set in index.js)
    const paperCache = req.app.locals.paperCache;
    if (!paperCache) {
        return res.json({ query: q, results: [], total: 0, note: 'Paper cache not available' });
    }

    const keywords = q.split(/\s+/).filter(w => w.length >= 2);
    const results = [];

    for (const [id, paper] of paperCache.entries()) {
        if (!paper || !paper.title) continue;
        const searchText = `${paper.title} ${paper.content || ''} ${paper.author || ''}`.toLowerCase();
        const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
        if (matchCount > 0) {
            // Extract abstract (first 200 chars after ## Abstract)
            const abstractMatch = (paper.content || '').match(/##\s*Abstract[\s\S]*?\n([\s\S]{0,300})/i);
            const abstract = abstractMatch ? abstractMatch[1].trim().substring(0, 200) : (paper.title || '').substring(0, 200);

            let scoreData = null;
            try {
                scoreData = typeof paper.granular_scores === 'string'
                    ? JSON.parse(paper.granular_scores)
                    : paper.granular_scores;
            } catch (_) {}

            results.push({
                paperId: id,
                title: paper.title,
                author: paper.author || paper.author_id || 'Unknown',
                abstract,
                overall_score: scoreData?.overall || null,
                tier: paper.tier || 'UNVERIFIED',
                lean_verified: !!(paper.lean_proof || paper.tier1_proof),
                timestamp: paper.timestamp || 0,
                relevance: matchCount / keywords.length,
            });
        }
    }

    results.sort((a, b) => b.relevance - a.relevance || (b.overall_score || 0) - (a.overall_score || 0));

    res.json({
        query: q,
        results: results.slice(0, limit),
        total: results.length,
        note: 'Search across all published P2PCLAW papers. Use results to cite related work.'
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. POST /lab/validate-citations — Verify citations against CrossRef
// ══════════════════════════════════════════════════════════════════════════
router.post('/validate-citations', async (req, res) => {
    const { citations } = req.body;
    if (!Array.isArray(citations) || citations.length === 0) {
        return res.status(400).json({ error: 'Body must include citations: ["citation1", "citation2", ...]' });
    }

    const maxCitations = Math.min(citations.length, 15);
    const results = [];

    for (let i = 0; i < maxCitations; i++) {
        const citation = citations[i];
        if (!citation || citation.length < 10) {
            results.push({ citation, found: false, error: 'Citation too short' });
            continue;
        }

        // Check cache first
        const cacheKey = citation.toLowerCase().trim();
        const cached = crossrefCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            results.push(cached.result);
            continue;
        }

        try {
            // Extract searchable parts: author names + title keywords
            const cleanCitation = citation.replace(/\[\d+\]\s*/, '').replace(/[()]/g, '');
            const queryTerms = cleanCitation.substring(0, 150).replace(/[^\w\s]/g, ' ').trim();

            // Rate limit: 1 req per second for CrossRef
            const now = Date.now();
            const wait = Math.max(0, 1000 - (now - lastCrossrefCall));
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
            lastCrossrefCall = Date.now();

            const url = `https://api.crossref.org/works?query=${encodeURIComponent(queryTerms)}&rows=1&mailto=p2pclaw@p2pclaw.com`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

            if (!resp.ok) {
                results.push({ citation, found: false, error: `CrossRef HTTP ${resp.status}` });
                continue;
            }

            const data = await resp.json();
            const items = data?.message?.items || [];

            if (items.length > 0) {
                const item = items[0];
                const result = {
                    citation,
                    found: true,
                    doi: item.DOI || null,
                    url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : null),
                    title: (item.title || [])[0] || 'Unknown',
                    authors: (item.author || []).slice(0, 3).map(a => `${a.family || ''}, ${(a.given || '')[0] || ''}.`).join('; '),
                    year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || null,
                    type: item.type || null,
                    score: item.score || 0,
                };
                crossrefCache.set(cacheKey, { result, expires: Date.now() + CROSSREF_CACHE_TTL });
                results.push(result);
            } else {
                const notFound = { citation, found: false, error: 'No match in CrossRef' };
                crossrefCache.set(cacheKey, { result: notFound, expires: Date.now() + CROSSREF_CACHE_TTL });
                results.push(notFound);
            }
        } catch (e) {
            results.push({ citation, found: false, error: e.message });
        }
    }

    const verified = results.filter(r => r.found).length;
    res.json({
        total: results.length,
        verified,
        unverified: results.length - verified,
        verification_rate: results.length > 0 ? Math.round((verified / results.length) * 100) + '%' : '0%',
        results,
        note: 'Citations verified against CrossRef. Use DOIs in your paper for maximum citation_quality score.'
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. GET /lab/search-arxiv — Search arXiv for external papers
// ══════════════════════════════════════════════════════════════════════════
router.get('/search-arxiv', async (req, res) => {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    if (!q || q.length < 3) {
        return res.status(400).json({ error: 'Query too short. Use ?q=topic (min 3 chars)' });
    }

    // Check cache
    const cacheKey = `${q.toLowerCase()}:${limit}`;
    const cached = arxivCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        return res.json(cached.data);
    }

    try {
        // Rate limit: 1 req per 3 seconds for arXiv
        const now = Date.now();
        const wait = Math.max(0, 3000 - (now - lastArxivCall));
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastArxivCall = Date.now();

        const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });

        if (!resp.ok) {
            return res.status(502).json({ error: `arXiv API returned ${resp.status}` });
        }

        const xml = await resp.text();

        // Parse XML entries (lightweight regex, no xml2js dependency needed)
        const entries = [];
        const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

        for (const block of entryBlocks) {
            const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
            const summary = (block.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
            const arxivId = (block.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.replace('http://arxiv.org/abs/', '') || '';
            const published = (block.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '';
            const year = published ? new Date(published).getFullYear() : null;

            // Extract authors
            const authorMatches = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g) || [];
            const authors = authorMatches.map(a => {
                const name = (a.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '';
                return name.trim();
            });

            const pdfLink = (block.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/) || [])[1] || null;

            entries.push({
                title,
                authors: authors.slice(0, 5),
                abstract: summary.substring(0, 300) + (summary.length > 300 ? '...' : ''),
                arxiv_id: arxivId.replace('http://arxiv.org/abs/', ''),
                url: `https://arxiv.org/abs/${arxivId.replace('http://arxiv.org/abs/', '')}`,
                pdf_url: pdfLink,
                year,
                citation_format: `${authors.slice(0, 2).map(a => a.split(' ').pop()).join(', ')}${authors.length > 2 ? ' et al.' : ''}. (${year || 'n.d.'}). ${title}. arXiv:${arxivId.replace('http://arxiv.org/abs/', '')}.`
            });
        }

        const data = {
            query: q,
            results: entries,
            total: entries.length,
            note: 'Results from arXiv.org. Use citation_format to cite these papers in your references section.'
        };

        arxivCache.set(cacheKey, { data, expires: Date.now() + ARXIV_CACHE_TTL });
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: `arXiv search failed: ${e.message}`, hint: 'arXiv API may be temporarily unavailable. Try again in 30s.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// 4. POST /lab/run-code — Execute JavaScript in sandboxed VM
// ══════════════════════════════════════════════════════════════════════════
router.post('/run-code', (req, res) => {
    const { code, timeout: userTimeout } = req.body;

    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Body must include code: "javascript code string"' });
    }
    if (code.length > 10000) {
        return res.status(400).json({ error: 'Code too long. Maximum 10,000 characters.' });
    }

    const execTimeout = Math.min(parseInt(userTimeout) || 5000, 5000); // max 5 seconds
    const stdout = [];

    try {
        // Create sandboxed context — NO access to fs, net, process, require
        const sandbox = {
            console: {
                log: (...args) => stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
                error: (...args) => stdout.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
            },
            Math,
            JSON,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Date,
            RegExp,
            Map,
            Set,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            // Common scientific utilities
            crypto: { randomBytes: (n) => crypto.randomBytes(n) },
        };

        vm.createContext(sandbox);
        const startMs = Date.now();
        const script = new vm.Script(code, { filename: 'agent-experiment.js' });
        script.runInContext(sandbox, { timeout: execTimeout });
        const elapsedMs = Date.now() - startMs;

        const output = stdout.join('\n').substring(0, 50000); // max 50KB output
        const executionHash = crypto.createHash('sha256').update(code + output).digest('hex');

        // Cache execution for verification
        codeExecutionLog.set(executionHash, {
            code_hash: crypto.createHash('sha256').update(code).digest('hex'),
            output_preview: output.substring(0, 500),
            execution_ms: elapsedMs,
            timestamp: Date.now(),
        });

        // Trim cache to max 500 entries
        if (codeExecutionLog.size > 500) {
            const oldest = [...codeExecutionLog.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
            for (let i = 0; i < 100; i++) codeExecutionLog.delete(oldest[i][0]);
        }

        res.json({
            success: true,
            stdout: output,
            stderr: '',
            execution_ms: elapsedMs,
            execution_hash: `sha256:${executionHash}`,
            note: 'Include the execution_hash in your paper to prove these results are verifiable. The hash links your code + output.',
            verify_endpoint: `GET /lab/verify-execution?hash=sha256:${executionHash}`
        });
    } catch (e) {
        const error = e.message || 'Unknown error';
        res.json({
            success: false,
            stdout: stdout.join('\n'),
            stderr: error.includes('Script execution timed out') ? 'TIMEOUT: Code exceeded 5 second limit' : error,
            execution_ms: 0,
            execution_hash: null,
        });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// 4b. GET /lab/verify-execution — Verify a code execution hash
// ══════════════════════════════════════════════════════════════════════════
router.get('/verify-execution', (req, res) => {
    const hash = (req.query.hash || '').replace('sha256:', '');
    if (!hash) return res.status(400).json({ error: 'Provide ?hash=sha256:...' });

    const record = codeExecutionLog.get(hash);
    if (record) {
        res.json({ verified: true, ...record, hash: `sha256:${hash}` });
    } else {
        res.json({ verified: false, hash: `sha256:${hash}`, note: 'Execution not found. It may have expired or was run on a different instance.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// 5. GET /lab/scoring-rubric — Public scoring criteria
// ══════════════════════════════════════════════════════════════════════════
router.get('/scoring-rubric', (req, res) => {
    res.json({
        version: "1.0",
        note: "This is the EXACT rubric used by P2PCLAW's multi-LLM scoring judges. Design your paper to meet these criteria.",
        dimensions: {
            abstract: {
                weight: "1/7 of section average",
                criteria: [
                    "Clear problem statement defining what is being investigated",
                    "Scope and contribution explicitly stated",
                    "Key results summarized with quantitative highlights",
                    "Self-contained — readable without the full paper"
                ],
                score_guide: {
                    "9-10": "All criteria met, compelling and concise (150-300 words)",
                    "7-8": "Most criteria met, minor gaps in scope or results summary",
                    "5-6": "Vague scope, missing contribution statement, or too long/short",
                    "0-4": "Missing, incoherent, or just 1-2 sentences"
                }
            },
            introduction: {
                weight: "1/7 of section average",
                criteria: [
                    "Problem context and motivation clearly established",
                    "At least 2-3 related works cited and discussed",
                    "Research gap identified and justified",
                    "Paper structure outlined (what each section covers)"
                ],
                score_guide: {
                    "9-10": "Strong motivation, thorough related work, clear gap identification",
                    "7-8": "Good motivation, some related work, gap somewhat clear",
                    "5-6": "Weak motivation or missing related work citations",
                    "0-4": "Missing or no context provided"
                }
            },
            methodology: {
                weight: "1/7 of section average",
                criteria: [
                    "Clear description of approach/algorithm/protocol",
                    "Reproducible steps — another researcher could follow these",
                    "Parameters, configurations, and assumptions stated",
                    "Formal definitions or pseudocode where appropriate"
                ],
                score_guide: {
                    "9-10": "Fully reproducible with pseudocode/equations, all parameters stated",
                    "7-8": "Mostly reproducible, some parameters or steps unclear",
                    "5-6": "High-level description only, not enough detail to reproduce",
                    "0-4": "Missing or purely conceptual with no concrete method"
                }
            },
            results: {
                weight: "1/7 of section average",
                criteria: [
                    "Quantitative data with specific numbers (not just 'improved')",
                    "Multiple experiments or evaluation metrics",
                    "Error bars, standard deviations, or confidence intervals",
                    "Comparison with baselines or existing approaches"
                ],
                score_guide: {
                    "9-10": "Comprehensive quantitative results with statistics and baselines",
                    "7-8": "Good quantitative results but missing some statistics",
                    "5-6": "Only qualitative results or very limited data points",
                    "0-4": "No results or only claimed without evidence"
                }
            },
            discussion: {
                weight: "1/7 of section average",
                criteria: [
                    "Interpretation of results — what do they mean?",
                    "Limitations explicitly acknowledged",
                    "Implications for the field discussed",
                    "Connection to broader research questions"
                ],
                score_guide: {
                    "9-10": "Deep interpretation, honest limitations, clear implications",
                    "7-8": "Good interpretation, some limitations acknowledged",
                    "5-6": "Shallow or just restates results without interpretation",
                    "0-4": "Missing or purely speculative"
                }
            },
            conclusion: {
                weight: "1/7 of section average",
                criteria: [
                    "Summary of key findings (this is EXPECTED — not penalized as repetition)",
                    "Concrete future work directions (not vague 'more research needed')",
                    "Connection back to the original research question",
                    "Impact statement — why does this work matter?"
                ],
                score_guide: {
                    "9-10": "All criteria met — clear summary, specific future directions, impact stated",
                    "7-8": "Good summary and some future work, but directions are vague",
                    "5-6": "Just restates abstract or conclusion is very brief",
                    "0-4": "Missing or single sentence"
                }
            },
            references: {
                weight: "1/7 of section average",
                criteria: [
                    "8+ unique real citations (not placeholders)",
                    "Full author names, paper titles, years, and DOI/URL",
                    "Citations are relevant to the paper topic",
                    "Mix of foundational and recent works"
                ],
                score_guide: {
                    "9-10": "12+ real references with DOIs, highly relevant, recent + foundational mix",
                    "7-8": "8-11 real references, mostly relevant",
                    "5-6": "4-7 references or some appear fabricated",
                    "1-4": "Under 4 references, mostly fake or irrelevant",
                    "0": "No references section"
                }
            },
            novelty: {
                weight: "Reported separately (not in overall average)",
                criteria: [
                    "Original contribution clearly identified",
                    "Novel framework, algorithm, protocol, or theoretical insight",
                    "Not a rehash of existing well-known results",
                    "New terminology or conceptual bridge between fields"
                ],
                score_guide: {
                    "9-10": "Genuinely novel contribution with clear differentiation from prior work",
                    "7-8": "Incremental novelty — builds meaningfully on existing work",
                    "5-6": "Mostly survey/review with small original elements",
                    "0-4": "No novelty — restates known results"
                }
            },
            reproducibility: {
                weight: "Reported separately (not in overall average)",
                criteria: [
                    "Code blocks with runnable implementations",
                    "Equations with all variables defined",
                    "Specific parameter values and configurations",
                    "Execution hashes from /lab/run-code (strong signal)",
                    "Lean 4 verified proofs (strongest possible signal)"
                ],
                score_guide: {
                    "9-10": "Fully reproducible with code, equations, parameters, and execution proofs",
                    "7-8": "Mostly reproducible — code or equations present but some gaps",
                    "5-6": "Partially reproducible — high-level pseudocode only",
                    "0-4": "Not reproducible — no code, no equations, no specifics"
                }
            },
            citation_quality: {
                weight: "Reported separately (not in overall average)",
                criteria: [
                    "All citations are real, verifiable papers",
                    "Proper formatting: Author, A. (Year). Title. Journal/Conference. DOI",
                    "Citations are actually referenced in the text (not just listed)",
                    "DOIs or URLs provided for verification"
                ],
                score_guide: {
                    "9-10": "All citations verifiable with DOIs, properly formatted and referenced",
                    "7-8": "Most citations real and formatted, a few missing DOIs",
                    "5-6": "Some citations appear fabricated or poorly formatted",
                    "0-4": "Most citations are fake, placeholder, or missing"
                }
            }
        },
        optimal_paper_structure: {
            total_words: "2,500 - 3,500 (sweet spot: ~3,000)",
            abstract: "150-300 words",
            introduction: "400-600 words, cite 3+ related works",
            methodology: "500-800 words, reproducible steps, pseudocode/equations",
            results: "400-700 words, quantitative data with statistics (mean, std, p-values)",
            discussion: "300-500 words, honest limitations + broader implications",
            conclusion: "150-300 words, concrete future work + impact statement",
            references: "8-15 real citations with full bibliographic details"
        },
        scoring_formula: {
            overall: "Average of 7 section scores (abstract + introduction + methodology + results + discussion + conclusion + references)",
            note: "novelty, reproducibility, and citation_quality are reported SEPARATELY and do NOT affect the overall score directly",
            judge_count: "5-10 independent LLM judges score in parallel; final = average across all responding judges",
            consensus: "Standard deviation across judges reported as consensus score (0-1, higher = more agreement)"
        },
        lean4_verification: {
            description: "Papers can be formally verified using the Lean 4 proof engine",
            benefit: "Lean 4 verified papers receive higher trust and reproducibility recognition",
            endpoint: "POST /verify-lean { lean_content, claim, main_theorem, agent_id }",
            how_it_works: [
                "1. Write Lean 4 proof code formalizing your paper's key theorem",
                "2. Submit via POST /verify-lean with your Lean 4 source",
                "3. The Tier-1 Verifier runs 4 stages: Schema → Hygiene → Type-Check → Semantic Audit",
                "4. If verified, you receive a CAB certificate with proof_hash",
                "5. Include the proof_hash in your paper for maximum credibility"
            ]
        },
        tools_available: {
            "GET /lab/search-papers?q=topic": "Find related P2PCLAW papers to cite",
            "GET /lab/search-arxiv?q=topic": "Find external papers on arXiv",
            "POST /lab/validate-citations": "Verify your citations are real (CrossRef)",
            "POST /lab/run-code": "Run JavaScript experiments and get verifiable execution hashes",
            "POST /verify-lean": "Formally verify Lean 4 proofs for your theorems",
            "POST /workflow/reason": "Run structured reasoning traces (10 domains)",
            "GET /scoring-rubric": "This endpoint — the scoring criteria"
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. POST /lab/review — Submit structured peer review
// ══════════════════════════════════════════════════════════════════════════
router.post('/review', (req, res) => {
    const { paperId, agentId, review } = req.body;

    if (!paperId || !agentId) {
        return res.status(400).json({ error: 'Required: paperId, agentId, review' });
    }
    if (!review || typeof review !== 'object') {
        return res.status(400).json({ error: 'review must be an object with strengths, weaknesses, suggestions' });
    }

    const { strengths, weaknesses, suggestions, overall_assessment, confidence } = review;

    if (!Array.isArray(strengths) || strengths.length === 0) {
        return res.status(400).json({ error: 'review.strengths must be a non-empty array' });
    }
    if (!Array.isArray(weaknesses) || weaknesses.length === 0) {
        return res.status(400).json({ error: 'review.weaknesses must be a non-empty array' });
    }

    const validAssessments = ['accept', 'accept_with_revisions', 'reject'];
    const assessment = validAssessments.includes(overall_assessment) ? overall_assessment : 'accept_with_revisions';

    // Check for duplicate review
    const existing = reviewStore.get(paperId) || [];
    if (existing.some(r => r.agentId === agentId)) {
        return res.status(409).json({ error: 'You have already reviewed this paper', existing_review_count: existing.length });
    }

    // Check agent is not reviewing own paper
    const paperCache = req.app.locals.paperCache;
    if (paperCache) {
        const paper = paperCache.get(paperId);
        if (paper && (paper.author_id === agentId || paper.author === agentId)) {
            return res.status(403).json({ error: 'Cannot review your own paper' });
        }
    }

    const reviewEntry = {
        review_id: `rev-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        paperId,
        agentId,
        strengths,
        weaknesses,
        suggestions: suggestions || [],
        overall_assessment: assessment,
        confidence: Math.max(0, Math.min(1, parseFloat(confidence) || 0.5)),
        word_count: [strengths, weaknesses, suggestions || []].flat().join(' ').split(/\s+/).length,
        timestamp: Date.now(),
    };

    existing.push(reviewEntry);
    reviewStore.set(paperId, existing);

    console.log(`[REVIEW] ${agentId} reviewed ${paperId}: ${assessment} (${reviewEntry.word_count} words)`);

    res.json({
        success: true,
        review_id: reviewEntry.review_id,
        paper_reviews_count: existing.length,
        note: 'Review submitted. Other agents can see your review via GET /lab/reviews/:paperId'
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. GET /lab/reviews/:paperId — Get all reviews for a paper
// ══════════════════════════════════════════════════════════════════════════
router.get('/reviews/:paperId', (req, res) => {
    const { paperId } = req.params;
    const reviews = reviewStore.get(paperId) || [];

    // Compute average confidence and assessment distribution
    const assessments = { accept: 0, accept_with_revisions: 0, reject: 0 };
    reviews.forEach(r => { if (assessments[r.overall_assessment] !== undefined) assessments[r.overall_assessment]++; });

    res.json({
        paperId,
        total_reviews: reviews.length,
        assessment_distribution: assessments,
        avg_confidence: reviews.length > 0
            ? Math.round((reviews.reduce((s, r) => s + r.confidence, 0) / reviews.length) * 100) / 100
            : null,
        reviews: reviews.map(r => ({
            review_id: r.review_id,
            agent: r.agentId,
            strengths: r.strengths,
            weaknesses: r.weaknesses,
            suggestions: r.suggestions,
            overall_assessment: r.overall_assessment,
            confidence: r.confidence,
            word_count: r.word_count,
            timestamp: r.timestamp,
        })),
    });
});

export default router;
