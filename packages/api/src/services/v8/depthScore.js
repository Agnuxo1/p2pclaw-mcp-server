/**
 * P2PCLAW v8 — Paper depth score (Eq. 13 of OpenCLAW-P2P v7, arXiv 2604.19792)
 * =============================================================================
 * d = max(0, min(10,
 *       (S/7)*2 + 1.5*eq + 1.5*proof + 1.5*code + 1.5*stats
 *       + min(1, n_num/5) + min(1, n_ref/8)
 *       + 0.5*doi + 0.5*author - mono - low_vocab))
 *
 * Booleans are treated as 0/1. S in [0,7] (mandatory sections present).
 */

const MANDATORY_SECTIONS = ['abstract', 'introduction', 'methodology', 'results', 'discussion', 'conclusion', 'references'];

/**
 * paperDepthScore(terms)
 * terms: { sections, eq, proof, code, stats, n_num, n_ref, doi, author, mono, low_vocab }
 * Returns the score rounded to 1 decimal, clamped to [0, 10].
 */
export function paperDepthScore(terms) {
    const t = terms || {};
    const S = clampNum(t.sections, 0, 7);
    const eq = bool01(t.eq);
    const proof = bool01(t.proof);
    const code = bool01(t.code);
    const stats = bool01(t.stats);
    const nNum = Math.max(0, Number(t.n_num) || 0);
    const nRef = Math.max(0, Number(t.n_ref) || 0);
    const doi = bool01(t.doi);
    const author = bool01(t.author);
    const mono = bool01(t.mono);
    const lowVocab = bool01(t.low_vocab);

    const raw =
        (S / 7) * 2 +
        1.5 * eq +
        1.5 * proof +
        1.5 * code +
        1.5 * stats +
        Math.min(1, nNum / 5) +
        Math.min(1, nRef / 8) +
        0.5 * doi +
        0.5 * author -
        mono -
        lowVocab;

    const clamped = Math.max(0, Math.min(10, raw));
    return Math.round(clamped * 10) / 10;
}

function bool01(v) {
    return v ? 1 : 0;
}

function clampNum(v, min, max) {
    const n = Number(v) || 0;
    return Math.max(min, Math.min(max, n));
}

// ── Deterministic text feature extraction ──────────────────────────────────

const SECTION_PATTERNS = {
    abstract: /^#{1,3}\s*abstract\b/im,
    introduction: /^#{1,3}\s*introduction\b/im,
    methodology: /^#{1,3}\s*(methodology|methods)\b/im,
    results: /^#{1,3}\s*results\b/im,
    discussion: /^#{1,3}\s*discussion\b/im,
    conclusion: /^#{1,3}\s*conclusion(s)?\b/im,
    references: /^#{1,3}\s*references\b/im
};

/**
 * extractDepthTerms(content, {judgeScores})
 * content: markdown paper text.
 * judgeScores: optional array of numbers (overall-like judge values) used to
 *   compute `mono` — true when >=3 judges gave an identical value.
 * Returns {score, terms}.
 */
export function extractDepthTerms(content, { judgeScores } = {}) {
    const text = typeof content === 'string' ? content : '';

    // S: count mandatory sections present, by heading match.
    let S = 0;
    for (const key of MANDATORY_SECTIONS) {
        if (SECTION_PATTERNS[key].test(text)) S++;
    }

    // eq: LaTeX present.
    const eq = /\$\$[^$]+\$\$/.test(text) || /\$[^$\n]+\$/.test(text) || /\\begin\{equation\}/.test(text);

    // proof: Proof/Theorem/Lemma block, or a lean4 code fence.
    const proof = /\b(proof|theorem|lemma)\b\s*[:.]?/i.test(text) || /```lean4?\b/i.test(text);

    // code: fenced code block with a language tag and >= 3 lines.
    const code = hasSubstantialCodeFence(text);

    // stats: p-values, confidence intervals, std, t-test, chi-square, ANOVA, ±.
    const stats =
        /\bp\s*[<>=]\s*0?\.\d+/i.test(text) ||
        /\bconfidence interval\b/i.test(text) ||
        /\b(std|standard deviation)\b/i.test(text) ||
        /\bt-test\b/i.test(text) ||
        /\bchi-square\b/i.test(text) ||
        /\bANOVA\b/.test(text) ||
        /±/.test(text);

    // n_num: numeric claims (numbers with units, %, or decimals) in the Results section.
    const resultsSection = extractSection(text, /^#{1,3}\s*results\b/im);
    const nNum = countNumericClaims(resultsSection);

    // n_ref: unique reference entries in the References section.
    const referencesSection = extractSection(text, /^#{1,3}\s*references\b/im);
    const nRef = countReferenceEntries(referencesSection);

    // doi: DOI pattern present anywhere.
    const doi = /10\.\d{4,9}\/\S+/.test(text);

    // author: "Surname, X." or "X. Surname" pattern in references.
    const author = /\b[A-Z][a-zA-Z'-]+,\s*[A-Z]\.\s*/.test(referencesSection) || /\b[A-Z]\.\s*[A-Z][a-zA-Z'-]+\b/.test(referencesSection);

    // low_vocab: type-token ratio < 0.25, only meaningful for papers > 1500 words.
    // Documented threshold: below this word count TTR is naturally high/noisy,
    // so low_vocab is forced false to avoid false positives on short papers.
    const words = (text.match(/[A-Za-z']+/g) || []).map((w) => w.toLowerCase());
    let lowVocab = false;
    if (words.length > 1500) {
        const uniqueWords = new Set(words);
        const ttr = uniqueWords.size / words.length;
        lowVocab = ttr < 0.25;
    }

    // mono: >= 3 judges with all identical overall-like values.
    let mono = false;
    if (Array.isArray(judgeScores) && judgeScores.length >= 3) {
        const first = judgeScores[0];
        mono = judgeScores.every((v) => v === first);
    }

    const terms = {
        sections: S,
        eq,
        proof,
        code,
        stats,
        n_num: nNum,
        n_ref: nRef,
        doi,
        author,
        mono,
        low_vocab: lowVocab
    };

    return { score: paperDepthScore(terms), terms };
}

function extractSection(text, headingRegex) {
    const match = headingRegex.exec(text);
    if (!match) return '';
    const start = match.index + match[0].length;
    // find next heading of same or higher level after start
    const rest = text.slice(start);
    const nextHeading = /^#{1,3}\s+\S/m.exec(rest);
    return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function hasSubstantialCodeFence(text) {
    const fenceRegex = /```([a-zA-Z0-9_+-]+)\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRegex.exec(text)) !== null) {
        const lang = m[1];
        const body = m[2];
        if (lang && lang.toLowerCase() !== 'text' && lang.toLowerCase() !== 'plain') {
            const lines = body.split('\n').filter((l) => l.trim().length > 0);
            if (lines.length >= 3) return true;
        }
    }
    return false;
}

function countNumericClaims(section) {
    if (!section) return 0;
    // Numbers with a unit, %, or decimal point (avoids bare integers like list markers).
    const regex = /\b\d+(\.\d+)?\s*(%|percent|ms|s|kg|km|mb|gb|x|units?)\b|\b\d+\.\d+\b/gi;
    const matches = section.match(regex) || [];
    // reasonable cap to avoid runaway counts on pathological input
    return Math.min(matches.length, 200);
}

function countReferenceEntries(section) {
    if (!section) return 0;
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    const entries = new Set();
    for (const line of lines) {
        const bracketMatch = /^\[(\d+)\]/.exec(line);
        const numberedMatch = /^(\d+)[.)]\s+/.exec(line);
        if (bracketMatch) {
            entries.add(`[${bracketMatch[1]}]`);
        } else if (numberedMatch) {
            entries.add(numberedMatch[1]);
        }
    }
    return entries.size;
}
