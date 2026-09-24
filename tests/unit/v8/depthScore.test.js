import { paperDepthScore, extractDepthTerms } from '../../../packages/api/src/services/v8/depthScore.js';

describe('paperDepthScore', () => {
    test('clamps to 0 when raw sum is negative', () => {
        const terms = {
            sections: 0,
            eq: false,
            proof: false,
            code: false,
            stats: false,
            n_num: 0,
            n_ref: 0,
            doi: false,
            author: false,
            mono: true,
            low_vocab: true
        };
        // raw = 0 - 1 - 1 = -2 -> clamp 0
        expect(paperDepthScore(terms)).toBe(0);
    });

    test('clamps to 10 when raw sum exceeds the max', () => {
        const terms = {
            sections: 7,
            eq: true,
            proof: true,
            code: true,
            stats: true,
            n_num: 50,
            n_ref: 50,
            doi: true,
            author: true,
            mono: false,
            low_vocab: false
        };
        // raw = (7/7)*2 + 1.5*4 + 1 + 1 + 0.5 + 0.5 = 2+6+1+1+1 = 11 -> clamp 10
        expect(paperDepthScore(terms)).toBe(10);
    });

    test('computes a hand-verified mid-range value', () => {
        // sections=5, eq=true, proof=false, code=true, stats=false,
        // n_num=3, n_ref=4, doi=false, author=true, mono=false, low_vocab=false
        // raw = (5/7)*2 + 1.5*1 + 1.5*0 + 1.5*1 + 1.5*0
        //       + min(1,3/5) + min(1,4/8) + 0.5*0 + 0.5*1 - 0 - 0
        //     = 1.42857 + 1.5 + 1.5 + 0.6 + 0.5 + 0.5 = 6.02857 -> round 1dp = 6.0
        const terms = {
            sections: 5,
            eq: true,
            proof: false,
            code: true,
            stats: false,
            n_num: 3,
            n_ref: 4,
            doi: false,
            author: true,
            mono: false,
            low_vocab: false
        };
        expect(paperDepthScore(terms)).toBeCloseTo(6.0, 1);
    });
});

describe('extractDepthTerms', () => {
    const paper = `
# Abstract
This paper studies the properties of a distributed protocol.

# Introduction
We introduce the problem and cite prior work with DOI 10.1234/abcd.efgh.

# Methodology
We use the following equation: $x = y + z$ and prove a theorem.

Theorem 1. The protocol converges.
Proof. By induction on the number of rounds.

\`\`\`python
def run():
    x = 1
    y = 2
    return x + y
\`\`\`

# Results
The protocol achieved 95.2% accuracy with p < 0.05 and std 1.3, improving latency by 12.4 ms.

# Discussion
These results confirm our hypothesis.

# Conclusion
We conclude the protocol is effective.

# References
[1] Lamport, L. (1982). The Byzantine Generals Problem.
[2] A. Turing. On computable numbers.
`;

    test('extracts all 7 mandatory sections', () => {
        const { terms } = extractDepthTerms(paper);
        expect(terms.sections).toBe(7);
    });

    test('detects LaTeX, proof block, code fence, stats, doi, author', () => {
        const { terms } = extractDepthTerms(paper);
        expect(terms.eq).toBe(true);
        expect(terms.proof).toBe(true);
        expect(terms.code).toBe(true);
        expect(terms.stats).toBe(true);
        expect(terms.doi).toBe(true);
        expect(terms.author).toBe(true);
    });

    test('counts numeric claims in Results and reference entries in References', () => {
        const { terms } = extractDepthTerms(paper);
        expect(terms.n_num).toBeGreaterThanOrEqual(2);
        expect(terms.n_ref).toBe(2);
    });

    test('returns a score in [0,10]', () => {
        const { score } = extractDepthTerms(paper);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
    });

    test('mono true when >=3 judges give identical overall scores', () => {
        const { terms } = extractDepthTerms(paper, { judgeScores: [7, 7, 7] });
        expect(terms.mono).toBe(true);
    });

    test('mono false with fewer than 3 judges or differing scores', () => {
        const { terms } = extractDepthTerms(paper, { judgeScores: [7, 8, 7] });
        expect(terms.mono).toBe(false);
    });

    test('handles empty content gracefully', () => {
        const { terms, score } = extractDepthTerms('');
        expect(terms.sections).toBe(0);
        expect(score).toBe(0);
    });
});
