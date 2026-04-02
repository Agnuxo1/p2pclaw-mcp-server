/**
 * P2PCLAW Paper Format Service
 * ============================
 * Takes raw text drafts and structures them into proper academic papers
 * using multi-provider LLM chain (Cloudflare → Cerebras → Mistral → Groq → NVIDIA → OpenRouter).
 *
 * Does NOT replace any existing service — purely additive.
 */

import { callLLMChain } from './llmChain.js';

console.log('[FORMAT] Multi-provider LLM chain loaded.');

const ACADEMIC_SECTIONS = [
    "Abstract",
    "Introduction",
    "Methodology",
    "Results",
    "Discussion",
    "Conclusion",
    "References"
];

const FORMAT_PROMPT = `You are an academic paper formatter for the P2PCLAW research network.

Your task: Take the user's raw text/idea and structure it into a proper academic research paper in Markdown format.

Rules:
1. PRESERVE all original ideas, claims, and technical content exactly as the author intended
2. DO NOT invent data, results, or citations that the author did not provide
3. Structure the paper with these 7 mandatory sections: ${ACADEMIC_SECTIONS.join(", ")}
4. Use proper academic tone and language
5. Add placeholder references like [1], [2] where the author should add real citations
6. The Abstract should be 150-250 words summarizing the paper
7. Output ONLY the formatted Markdown paper, no explanations
8. Minimum 500 words total

User's raw text:
`;

/**
 * Call multi-provider LLM chain to format a paper draft.
 * Chain: Cloudflare GLM-4 → Cerebras → Mistral → Groq → NVIDIA → OpenRouter
 */
async function callLLMForFormat(prompt) {
    const result = await callLLMChain(
        [{ role: "user", content: prompt }],
        { maxTokens: 4096, temperature: 0.3, tag: "FORMAT", minLength: 200 }
    );
    return result ? result.text : null;
}

/**
 * Format a raw text draft into a structured academic paper.
 * @param {string} rawText - The user's unstructured text/idea
 * @param {string} paperType - "research" | "review" | "technical" | "proof"
 * @returns {object} { formatted: string, sections: string[], wordCount: number }
 */
export async function formatPaperDraft(rawText, paperType = "research") {
    const typeContext = {
        research: "original research paper with novel findings",
        review: "literature review paper synthesizing existing research",
        technical: "technical report with implementation details",
        proof: "mathematical proof paper with formal reasoning"
    };

    const fullPrompt = FORMAT_PROMPT.replace(
        "proper academic research paper",
        typeContext[paperType] || typeContext.research
    ) + rawText;

    const formatted = await callLLMForFormat(fullPrompt);

    if (!formatted) {
        // Deterministic fallback: structure the raw text with section headers
        const words = rawText.split(/\s+/);
        const chunkSize = Math.ceil(words.length / 5);
        const fallback = `# ${rawText.split(/[.\n]/)[0].slice(0, 100)}

## Abstract

${words.slice(0, Math.min(50, words.length)).join(" ")}...

## Introduction

${words.slice(0, chunkSize).join(" ")}

## Methodology

${words.slice(chunkSize, chunkSize * 2).join(" ")}

## Results

${words.slice(chunkSize * 2, chunkSize * 3).join(" ")}

## Discussion

${words.slice(chunkSize * 3, chunkSize * 4).join(" ")}

## Conclusion

${words.slice(chunkSize * 4).join(" ")}

## References

[1] Author, A. (2026). *Placeholder Reference*. Journal of P2PCLAW Research.
`;
        return {
            formatted: fallback,
            sections: ACADEMIC_SECTIONS,
            wordCount: words.length,
            llm_used: false
        };
    }

    // Count words in formatted output
    const wordCount = formatted.split(/\s+/).filter(w => w.length > 0).length;

    // Detect which sections are present
    const sectionsFound = ACADEMIC_SECTIONS.filter(s =>
        formatted.toLowerCase().includes(`## ${s.toLowerCase()}`) ||
        formatted.toLowerCase().includes(`# ${s.toLowerCase()}`)
    );

    return {
        formatted,
        sections: sectionsFound,
        wordCount,
        llm_used: true
    };
}
