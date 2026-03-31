/**
 * P2PCLAW Paper Format Service
 * ============================
 * Takes raw text drafts and structures them into proper academic papers
 * using the existing LLM infrastructure (Groq → Together → fallback).
 *
 * Does NOT replace any existing service — purely additive.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.LLM_KEY || process.env.GROQ_KEY || "";
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || process.env.TOGETHER_KEY || "";

// Startup log to diagnose LLM connectivity
if (GROQ_API_KEY) console.log(`[FORMAT] Groq API key loaded (${GROQ_API_KEY.length} chars, starts: ${GROQ_API_KEY.substring(0, 8)}...)`);
else console.warn("[FORMAT] No Groq API key found — will use template fallback. Set GROQ_API_KEY or LLM_KEY in env.");
if (TOGETHER_API_KEY) console.log(`[FORMAT] Together API key loaded (${TOGETHER_API_KEY.length} chars)`);
else console.warn("[FORMAT] No Together API key found — Groq-only fallback.");

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
 * Call Groq or Together AI to format a paper draft.
 * Uses the same fallback pattern as the rest of the API.
 */
async function callLLMForFormat(prompt) {
    // Try Groq first
    if (GROQ_API_KEY) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 4096,
                    temperature: 0.3, // Low temperature for structured output
                }),
                signal: AbortSignal.timeout(60000),
            });
            if (res.ok) {
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content || "";
                console.log(`[FORMAT] Groq returned ${text.length} chars`);
                if (text.length > 200) return text;
            } else {
                const errText = await res.text().catch(() => "");
                console.warn(`[FORMAT] Groq HTTP ${res.status}: ${errText.substring(0, 200)}`);
            }
        } catch (e) {
            console.warn("[FORMAT] Groq failed:", e.message);
        }
    }

    // Fallback to Together AI
    if (TOGETHER_API_KEY) {
        try {
            const res = await fetch("https://api.together.xyz/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${TOGETHER_API_KEY}`
                },
                body: JSON.stringify({
                    model: "Qwen/Qwen2.5-72B-Instruct-Turbo",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 4096,
                    temperature: 0.3,
                }),
                signal: AbortSignal.timeout(60000),
            });
            if (res.ok) {
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content || "";
                console.log(`[FORMAT] Together returned ${text.length} chars`);
                if (text.length > 200) return text;
            } else {
                const errText = await res.text().catch(() => "");
                console.warn(`[FORMAT] Together HTTP ${res.status}: ${errText.substring(0, 200)}`);
            }
        } catch (e) {
            console.warn("[FORMAT] Together failed:", e.message);
        }
    }

    return null;
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
