/**
 * P2PCLAW Live Verification Service
 * ===================================
 * Performs REAL, live verification of paper content during scoring:
 *
 *   1. CrossRef Citation Verification — are the references real papers?
 *   2. arXiv Novelty Search — does similar work already exist?
 *   3. Code Execution — does the Python/JS code actually run?
 *   4. Lean4 Formal Verification — do the proofs type-check?
 *
 * All verifications run in parallel with timeouts to avoid blocking scoring.
 * Results feed back into calibration score adjustments.
 *
 * This service calls existing infrastructure (CrossRef API, arXiv API,
 * Node.js VM sandbox, tier1Service) — it does NOT duplicate them.
 */

import crypto from "crypto";
import vm from "vm";

// ── 1. CrossRef Citation Verification ──────────────────────────────────────

/**
 * Extract citations from the paper's References section and verify each
 * against the CrossRef API (free, no auth needed).
 *
 * Returns: { total, verified, unverified, results: [...], verification_rate }
 */
async function verifyCitations(content) {
    // Extract references section
    const refMatch = content.match(/##?\s*references([\s\S]*?)$/i);
    if (!refMatch) return { total: 0, verified: 0, unverified: 0, results: [], verification_rate: 0, error: "no_references_section" };

    const refText = refMatch[1];

    // Extract individual citations: lines starting with [N] or numbered entries
    const citationLines = refText
        .split("\n")
        .map(l => l.trim())
        .filter(l => /^\[?\d+\]?\s*.{15,}/.test(l) || /^[-•]\s*.{15,}/.test(l))
        .slice(0, 12); // Max 12 to stay within rate limits

    if (citationLines.length === 0) return { total: 0, verified: 0, unverified: 0, results: [], verification_rate: 0, error: "no_parseable_citations" };

    const results = [];
    let lastCall = 0;

    for (const citation of citationLines) {
        try {
            // Rate limit: 1 req per 1.2 seconds for CrossRef politeness
            const now = Date.now();
            const wait = Math.max(0, 1200 - (now - lastCall));
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
            lastCall = Date.now();

            // Clean citation for search
            const cleanCitation = citation
                .replace(/^\[?\d+\]?\s*/, "")
                .replace(/[()[\]]/g, "")
                .replace(/doi[:.]?\s*\S+/gi, "")
                .substring(0, 150)
                .replace(/[^\w\s]/g, " ")
                .trim();

            if (cleanCitation.length < 10) {
                results.push({ citation: citation.substring(0, 80), found: false, reason: "too_short" });
                continue;
            }

            const url = `https://api.crossref.org/works?query=${encodeURIComponent(cleanCitation)}&rows=1&mailto=p2pclaw@p2pclaw.com`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });

            if (!resp.ok) {
                results.push({ citation: citation.substring(0, 80), found: false, reason: `http_${resp.status}` });
                continue;
            }

            const data = await resp.json();
            const items = data?.message?.items || [];

            if (items.length > 0 && items[0].score > 40) {
                const item = items[0];
                results.push({
                    citation: citation.substring(0, 80),
                    found: true,
                    doi: item.DOI || null,
                    title: (item.title || [])[0] || "Unknown",
                    year: item.published?.["date-parts"]?.[0]?.[0] || null,
                    crossref_score: item.score,
                });
            } else {
                results.push({
                    citation: citation.substring(0, 80),
                    found: false,
                    reason: items.length === 0 ? "no_match" : `low_score_${items[0]?.score}`,
                });
            }
        } catch (e) {
            results.push({
                citation: citation.substring(0, 80),
                found: false,
                reason: e.name === "TimeoutError" ? "timeout" : e.message.substring(0, 50),
            });
        }
    }

    const verified = results.filter(r => r.found).length;
    return {
        total: results.length,
        verified,
        unverified: results.length - verified,
        verification_rate: results.length > 0 ? Math.round((verified / results.length) * 100) : 0,
        results,
    };
}

// ── 2. arXiv Novelty Search ────────────────────────────────────────────────

/**
 * Search arXiv for papers similar to the submitted paper.
 * If highly similar papers exist, the novelty claim is weakened.
 *
 * Strategy: extract title + key terms from abstract, search arXiv,
 * check if any result has high title similarity.
 */
async function searchNovelty(content) {
    // Extract title (first # heading) and abstract
    const titleMatch = content.match(/^#\s+(.+)/m);
    const abstractMatch = content.match(/##?\s*abstract([\s\S]*?)(?=##?\s)/i);

    const title = (titleMatch ? titleMatch[1] : "").trim();
    const abstract = (abstractMatch ? abstractMatch[1] : "").trim();

    if (!title && !abstract) return { searched: false, error: "no_title_or_abstract" };

    // Build search query: title words + abstract keywords
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "of", "in", "to", "for", "and", "or", "but", "with", "on", "at", "by", "from", "that", "this", "we", "our", "it", "its"]);
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 6);
    const abstractWords = abstract.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w));

    // Pick top keywords by specificity (longer words, less common)
    const wordFreq = {};
    for (const w of abstractWords) wordFreq[w] = (wordFreq[w] || 0) + 1;
    const topAbstractWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([w]) => w);

    const query = [...new Set([...titleWords, ...topAbstractWords])].slice(0, 8).join(" ");
    if (query.length < 5) return { searched: false, error: "query_too_short" };

    try {
        const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=relevance&sortOrder=descending`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!resp.ok) return { searched: false, error: `arxiv_http_${resp.status}` };

        const xml = await resp.text();
        const entries = [];
        const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

        for (const block of entryBlocks) {
            const arxivTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, " ").trim() || "";
            const arxivId = (block.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.replace("http://arxiv.org/abs/", "") || "";
            const published = (block.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || "";
            const year = published ? new Date(published).getFullYear() : null;
            const authorMatches = block.match(/<name>([\s\S]*?)<\/name>/g) || [];
            const authors = authorMatches.map(a => (a.match(/<name>([\s\S]*?)<\/name>/) || [])[1]?.trim() || "").slice(0, 3);

            // Compute title similarity (Jaccard on words)
            const titleWordsA = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const titleWordsB = new Set(arxivTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const intersection = [...titleWordsA].filter(w => titleWordsB.has(w)).length;
            const union = new Set([...titleWordsA, ...titleWordsB]).size;
            const similarity = union > 0 ? Math.round((intersection / union) * 100) : 0;

            entries.push({
                title: arxivTitle,
                arxiv_id: arxivId.replace("http://arxiv.org/abs/", ""),
                year,
                authors,
                title_similarity: similarity,
                url: `https://arxiv.org/abs/${arxivId.replace("http://arxiv.org/abs/", "")}`,
            });
        }

        // Sort by similarity
        entries.sort((a, b) => b.title_similarity - a.title_similarity);

        const highSimilarity = entries.filter(e => e.title_similarity > 50);
        const maxSimilarity = entries.length > 0 ? entries[0].title_similarity : 0;

        return {
            searched: true,
            query,
            results: entries,
            total_found: entries.length,
            high_similarity_count: highSimilarity.length,
            max_similarity: maxSimilarity,
            novelty_concern: maxSimilarity > 60 ? "high" : maxSimilarity > 40 ? "medium" : "low",
            note: maxSimilarity > 60
                ? `Found existing paper with ${maxSimilarity}% title similarity — novelty claim may be weakened`
                : maxSimilarity > 40
                    ? `Some similar work exists (${maxSimilarity}% similarity) — ensure clear differentiation`
                    : "No highly similar papers found on arXiv — novelty claim appears supported",
        };
    } catch (e) {
        return { searched: false, error: e.name === "TimeoutError" ? "arxiv_timeout" : e.message.substring(0, 60) };
    }
}

// ── 3. Code Execution ──────────────────────────────────────────────────────

/**
 * Extract code blocks from paper and attempt to execute them.
 * - JavaScript: executed in Node.js VM sandbox (same as /lab/run-code)
 * - Python: attempted via child_process if python3 available, else static analysis
 *
 * Returns execution results with hashes for each block.
 */
async function executeCodeBlocks(content) {
    const results = [];

    // Extract all fenced code blocks with language annotation
    const codeBlockRegex = /```(python|py|javascript|js|lean|lean4)?\s*\n([\s\S]*?)```/gi;
    let match;
    const blocks = [];
    while ((match = codeBlockRegex.exec(content)) !== null) {
        const lang = (match[1] || "").toLowerCase();
        const code = match[2].trim();
        if (code.length > 5 && code.length < 10000) {
            blocks.push({ lang: lang === "py" ? "python" : lang === "js" ? "javascript" : lang || "unknown", code });
        }
    }

    if (blocks.length === 0) return { total: 0, executed: 0, results: [], note: "no_code_blocks_found" };

    for (const block of blocks.slice(0, 5)) { // Max 5 blocks
        if (block.lang === "javascript") {
            // Execute JS in sandbox (same as /lab/run-code)
            const execResult = executeJsSandbox(block.code);
            results.push({ ...execResult, language: "javascript" });
        } else if (block.lang === "python") {
            // Try Python execution, fall back to static analysis
            const execResult = await executePython(block.code);
            results.push({ ...execResult, language: "python" });
        } else if (block.lang === "lean" || block.lang === "lean4") {
            // Lean code is handled by Lean4 verification (separate flow)
            results.push({
                language: "lean4",
                executed: false,
                note: "lean4_code_handled_by_formal_verification_pipeline",
                code_preview: block.code.substring(0, 100),
            });
        } else {
            results.push({
                language: block.lang || "unknown",
                executed: false,
                note: "unsupported_language",
                code_preview: block.code.substring(0, 100),
            });
        }
    }

    const executed = results.filter(r => r.executed).length;
    const passed = results.filter(r => r.success).length;
    return {
        total: results.length,
        executed,
        passed,
        failed: executed - passed,
        results,
    };
}

/**
 * Execute JavaScript in a Node.js VM sandbox.
 */
function executeJsSandbox(code) {
    const stdout = [];
    try {
        const sandbox = {
            console: {
                log: (...args) => stdout.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
                error: (...args) => stdout.push("[ERROR] " + args.map(a => String(a)).join(" ")),
            },
            Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Map, Set,
            parseInt, parseFloat, isNaN, isFinite,
        };
        vm.createContext(sandbox);
        const startMs = Date.now();
        const script = new vm.Script(code, { filename: "paper-code.js" });
        script.runInContext(sandbox, { timeout: 5000 });
        const elapsedMs = Date.now() - startMs;
        const output = stdout.join("\n").substring(0, 5000);
        const hash = crypto.createHash("sha256").update(code + output).digest("hex");

        return {
            executed: true,
            success: true,
            output: output.substring(0, 500),
            execution_ms: elapsedMs,
            execution_hash: `sha256:${hash}`,
        };
    } catch (e) {
        return {
            executed: true,
            success: false,
            error: e.message.includes("timed out") ? "TIMEOUT_5s" : e.message.substring(0, 100),
            output: stdout.join("\n").substring(0, 200),
        };
    }
}

/**
 * Execute Python code if python3 is available on the system.
 * Falls back to static syntax analysis if not.
 */
async function executePython(code) {
    // Safety: reject code with dangerous patterns
    const DANGEROUS = /\b(import\s+os|import\s+sys|import\s+subprocess|__import__|eval\s*\(|exec\s*\(|open\s*\(|os\.system|os\.popen|subprocess\.|shutil\.|pathlib\.|socket\.|http\.|urllib\.|requests\.)/;
    if (DANGEROUS.test(code)) {
        return {
            executed: false,
            success: false,
            error: "blocked_dangerous_code",
            note: "Code contains dangerous imports (os, subprocess, etc.) — execution blocked for safety",
            static_analysis: analyzePythonStatic(code),
        };
    }

    // Try executing with python3
    try {
        const { execSync } = await import("child_process");

        // Wrap code in a safe execution envelope with timeout
        const wrappedCode = `
import signal, sys, json, hashlib
signal.alarm(5)  # 5 second timeout
_stdout_capture = []
_orig_print = print
def print(*args, **kwargs):
    _stdout_capture.append(' '.join(str(a) for a in args))
    _orig_print(*args, **kwargs)
try:
${code.split("\n").map(l => "    " + l).join("\n")}
except Exception as e:
    print(f"ERROR: {e}")
output = '\\n'.join(_stdout_capture)
h = hashlib.sha256((${JSON.stringify(code)} + output).encode()).hexdigest()
_orig_print(f"\\n__EXEC_HASH__:{h}")
`;

        const result = execSync(`python3 -c ${JSON.stringify(wrappedCode)}`, {
            timeout: 8000,
            maxBuffer: 1024 * 50,
            stdio: ["pipe", "pipe", "pipe"],
        });

        const output = result.toString("utf-8");
        const hashMatch = output.match(/__EXEC_HASH__:(\w+)/);
        const cleanOutput = output.replace(/\n__EXEC_HASH__:\w+\s*$/, "").trim();

        return {
            executed: true,
            success: true,
            output: cleanOutput.substring(0, 500),
            execution_hash: hashMatch ? `sha256:${hashMatch[1]}` : null,
            runtime: "python3",
        };
    } catch (e) {
        // If python3 not found, fall back to static analysis
        if (e.code === "ENOENT" || (e.message && e.message.includes("not found"))) {
            return {
                executed: false,
                success: false,
                note: "python3_not_available_on_server",
                static_analysis: analyzePythonStatic(code),
            };
        }
        // Python execution error (syntax error, runtime error, timeout)
        const stderr = e.stderr ? e.stderr.toString("utf-8").substring(0, 300) : "";
        const stdout = e.stdout ? e.stdout.toString("utf-8").substring(0, 300) : "";
        return {
            executed: true,
            success: false,
            error: e.killed ? "TIMEOUT_8s" : stderr || e.message.substring(0, 100),
            output: stdout.substring(0, 200),
            runtime: "python3",
        };
    }
}

/**
 * Static analysis for Python code when execution is not possible.
 * Checks syntax patterns, imports, function definitions, etc.
 */
function analyzePythonStatic(code) {
    const lines = code.split("\n").filter(l => l.trim().length > 0);
    const hasDef = /\bdef\s+\w+\s*\(/.test(code);
    const hasClass = /\bclass\s+\w+/.test(code);
    const hasImport = /\b(import|from)\s+\w+/.test(code);
    const hasLoop = /\b(for|while)\s+.+:/.test(code);
    const hasCondition = /\bif\s+.+:/.test(code);
    const hasReturn = /\breturn\s+/.test(code);
    const hasTry = /\btry\s*:/.test(code);
    const hasComputation = /[\+\-\*\/\%\*\*]|np\.|pd\.|torch\.|scipy\.|sklearn\.|matplotlib/.test(code);

    // Check for common scientific libraries
    const scientificLibs = [];
    if (/numpy|np\./.test(code)) scientificLibs.push("numpy");
    if (/pandas|pd\./.test(code)) scientificLibs.push("pandas");
    if (/torch|nn\./.test(code)) scientificLibs.push("pytorch");
    if (/scipy/.test(code)) scientificLibs.push("scipy");
    if (/sklearn/.test(code)) scientificLibs.push("scikit-learn");
    if (/matplotlib|plt\./.test(code)) scientificLibs.push("matplotlib");
    if (/networkx|nx\./.test(code)) scientificLibs.push("networkx");

    // Check for syntax errors (basic)
    const indentErrors = lines.filter((l, i) => {
        if (i === 0) return false;
        const prev = lines[i - 1];
        if (prev.trim().endsWith(":") && !l.match(/^\s+/)) return true;
        return false;
    });

    const realIndicators = [hasDef, hasImport, hasLoop, hasCondition, hasReturn, hasComputation].filter(Boolean).length;

    return {
        lines: lines.length,
        has_functions: hasDef,
        has_classes: hasClass,
        has_imports: hasImport,
        has_loops: hasLoop,
        has_conditions: hasCondition,
        has_computation: hasComputation,
        has_error_handling: hasTry,
        scientific_libraries: scientificLibs,
        real_indicator_count: realIndicators,
        possible_indent_errors: indentErrors.length,
        quality: realIndicators >= 4 ? "real_code" : realIndicators >= 2 ? "plausible" : "template",
    };
}

// ── 4. Lean4 Formal Verification ───────────────────────────────────────────

/**
 * Extract Lean4 code blocks from paper and submit for verification.
 * Uses the existing tier1Service infrastructure.
 */
async function verifyLean4Blocks(content, tier1Url) {
    // Extract Lean code blocks
    const leanBlocks = [];
    const leanRegex = /```(?:lean|lean4)\s*\n([\s\S]*?)```/gi;
    let match;
    while ((match = leanRegex.exec(content)) !== null) {
        const code = match[1].trim();
        if (code.length > 10) leanBlocks.push(code);
    }

    if (leanBlocks.length === 0) {
        // Check for proof_hash claims without actual code
        const hasProofClaim = /proof_hash|lean_certificate|formally\s+verified/i.test(content);
        return {
            blocks_found: 0,
            verified: 0,
            results: [],
            has_unsubstantiated_claim: hasProofClaim,
            note: hasProofClaim
                ? "Paper claims formal verification but contains no Lean4 code"
                : "No Lean4 code blocks found",
        };
    }

    const verifierUrl = tier1Url || process.env.TIER1_VERIFIER_URL || "https://agnuxo-lean4-proof-checker.hf.space";
    const results = [];

    for (const leanCode of leanBlocks.slice(0, 3)) { // Max 3 blocks
        try {
            // Extract main theorem name from Lean code
            const theoremMatch = leanCode.match(/theorem\s+(\w+)/);
            const mainTheorem = theoremMatch ? theoremMatch[1] : "main";

            // Extract claim from surrounding text
            const claimMatch = content.match(/(?:we\s+prove|we\s+verify|theorem\s+states|formally\s+verify)[:\s]*([^.]+)/i);
            const claim = claimMatch ? claimMatch[1].trim().substring(0, 200) : "Formal verification of paper theorem";

            // Step 1: Get committed hash
            let committedHash = null;
            try {
                const hashResp = await fetch(`${verifierUrl}/hash`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: leanCode }),
                    signal: AbortSignal.timeout(10000),
                });
                if (hashResp.ok) {
                    const hashData = await hashResp.json();
                    committedHash = hashData.hash || hashData.proof_hash || null;
                }
            } catch (_) {
                // Hash step optional — continue without it
            }

            // Step 2: Full verification
            const verifyResp = await fetch(`${verifierUrl}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lean_content: leanCode,
                    claim,
                    main_theorem: mainTheorem,
                    agent_id: "calibration-system",
                    investigation_context: "Live verification during scoring",
                    committed_hash: committedHash,
                    mode: "full",
                }),
                signal: AbortSignal.timeout(180000), // 3 min — Lean compilation can be slow
            });

            if (!verifyResp.ok) {
                results.push({
                    code_preview: leanCode.substring(0, 100),
                    verified: false,
                    error: `verifier_http_${verifyResp.status}`,
                });
                continue;
            }

            const verifyData = await verifyResp.json();
            results.push({
                code_preview: leanCode.substring(0, 100),
                verified: verifyData.verdict === "ACCEPTED",
                verdict: verifyData.verdict,
                lean_compiles: verifyData.lean_compiles || false,
                semantic_audit: verifyData.semantic_audit || null,
                proof_hash: verifyData.proof_hash || null,
                stages_passed: verifyData.stages_passed || null,
            });
        } catch (e) {
            results.push({
                code_preview: leanCode.substring(0, 100),
                verified: false,
                error: e.name === "TimeoutError" ? "lean_verification_timeout_3min" : e.message.substring(0, 80),
            });
        }
    }

    const verified = results.filter(r => r.verified).length;
    return {
        blocks_found: leanBlocks.length,
        verified,
        failed: results.length - verified,
        results,
    };
}

// ── Master Orchestrator ────────────────────────────────────────────────────

/**
 * Run ALL live verifications in parallel with independent timeouts.
 * Each verification is wrapped in Promise.allSettled so a single failure
 * never blocks the others.
 *
 * @param {string} content - Full paper markdown content
 * @returns {object} Combined verification results
 */
async function runLiveVerification(content) {
    const startMs = Date.now();

    // Run all 4 verifications in parallel
    const [citationResult, noveltyResult, codeResult, lean4Result] = await Promise.allSettled([
        verifyCitations(content),
        searchNovelty(content),
        executeCodeBlocks(content),
        verifyLean4Blocks(content),
    ]);

    const elapsed = Date.now() - startMs;

    return {
        verification_time_ms: elapsed,
        citations: citationResult.status === "fulfilled" ? citationResult.value : { error: citationResult.reason?.message },
        novelty: noveltyResult.status === "fulfilled" ? noveltyResult.value : { error: noveltyResult.reason?.message },
        code_execution: codeResult.status === "fulfilled" ? codeResult.value : { error: codeResult.reason?.message },
        lean4: lean4Result.status === "fulfilled" ? lean4Result.value : { error: lean4Result.reason?.message },
    };
}

/**
 * Convert live verification results into calibration score adjustments.
 * These adjustments are ADDED to existing calibration adjustments.
 */
function verificationToAdjustments(verification) {
    const adjustments = {};
    const bonuses = {};

    // 1. Citation verification results
    const cit = verification.citations;
    if (cit && typeof cit.verification_rate === "number") {
        if (cit.verification_rate < 30 && cit.total >= 3) {
            adjustments.references = `crossref_verified_${cit.verified}/${cit.total}(${cit.verification_rate}%): cap at 3`;
            adjustments.references_cap = 3;
            adjustments.citation_quality = `crossref_low_rate_${cit.verification_rate}%: cap at 3`;
            adjustments.citation_quality_cap = 3;
        } else if (cit.verification_rate >= 70) {
            bonuses.references = `crossref_verified_${cit.verified}/${cit.total}(${cit.verification_rate}%): +1 bonus`;
            bonuses.references_bonus = 1;
            bonuses.citation_quality = `crossref_high_rate: +1 bonus`;
            bonuses.citation_quality_bonus = 1;
        }
    }

    // 2. Novelty search results
    const nov = verification.novelty;
    if (nov && nov.searched) {
        if (nov.novelty_concern === "high") {
            adjustments.novelty = `arxiv_similar_paper_found(${nov.max_similarity}%_similarity): cap at 4`;
            adjustments.novelty_cap = 4;
        } else if (nov.novelty_concern === "low" && nov.total_found > 0) {
            bonuses.novelty = `arxiv_no_similar_papers: +1 novelty bonus`;
            bonuses.novelty_bonus = 1;
        }
    }

    // 3. Code execution results
    const code = verification.code_execution;
    if (code && code.total > 0) {
        if (code.passed > 0) {
            bonuses.reproducibility = `code_executed_${code.passed}/${code.total}_passed: +2 reproducibility bonus`;
            bonuses.reproducibility_bonus = 2;
        } else if (code.executed > 0 && code.passed === 0) {
            adjustments.reproducibility = `code_executed_but_all_failed(${code.failed}/${code.total}): cap at 3`;
            adjustments.reproducibility_cap = 3;
            adjustments.results = `code_fails_to_run: cap at 4`;
            adjustments.results_cap = 4;
        }
    }

    // 4. Lean4 verification results
    const lean = verification.lean4;
    if (lean && lean.blocks_found > 0) {
        if (lean.verified > 0) {
            bonuses.reproducibility = `lean4_verified_${lean.verified}/${lean.blocks_found}: +3 formal verification bonus`;
            bonuses.reproducibility_bonus = 3;
            bonuses.methodology = `lean4_formal_proof_verified: +1 methodology bonus`;
            bonuses.methodology_bonus = 1;
        } else if (lean.failed > 0) {
            adjustments.reproducibility = `lean4_verification_failed(${lean.failed}/${lean.blocks_found}): cap at 4`;
            adjustments.reproducibility_cap = 4;
        }
    }
    if (lean && lean.has_unsubstantiated_claim) {
        adjustments.reproducibility = `claims_formal_verification_without_lean4_code: cap at 3`;
        adjustments.reproducibility_cap = 3;
    }

    return { adjustments, bonuses };
}

export {
    verifyCitations,
    searchNovelty,
    executeCodeBlocks,
    verifyLean4Blocks,
    runLiveVerification,
    verificationToAdjustments,
};
