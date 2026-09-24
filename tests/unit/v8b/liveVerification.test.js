import { jest } from '@jest/globals';
import {
    computeReferenceVerification,
    verifyReferenceMultiSource,
    crossRefVerify,
    arxivVerify,
    semanticScholarVerify,
} from '../../../packages/api/src/services/liveVerificationService.js';

jest.setTimeout(30000); // Semantic Scholar throttling (1 req/s) can add real delay across several refs

function jsonResponse(body, ok = true) {
    return { ok, status: ok ? 200 : 404, json: async () => body, text: async () => JSON.stringify(body) };
}

function notFoundCrossRef() {
    return jsonResponse({ message: { items: [] } });
}
function notFoundArxiv() {
    return { ok: true, status: 200, text: async () => '<feed></feed>', json: async () => ({}) };
}
function notFoundSemanticScholar() {
    return jsonResponse({ data: [] });
}

function notFoundOpenAlex() {
    return jsonResponse({ results: [] });
}

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
});

describe('liveVerificationService — Semantic Scholar fallback ordering', () => {
    it('is only called when CrossRef and arXiv both fail to confirm a reference', async () => {
        const calls = [];
        global.fetch = jest.fn(async (url) => {
            calls.push(url);
            if (url.includes('api.crossref.org')) return notFoundCrossRef();
            if (url.includes('export.arxiv.org')) return notFoundArxiv();
            if (url.includes('api.semanticscholar.org')) {
                return jsonResponse({ data: [{ title: 'A Real Paper About Consensus', year: 2020, externalIds: { DOI: '10.1234/abc' } }] });
            }
            throw new Error('unexpected url ' + url);
        });

        const result = await verifyReferenceMultiSource('[1] Some Author. A Real Paper About Consensus Systems. 2020.');

        expect(result.status).toBe('verified');
        expect(result.source).toBe('semantic_scholar');
        expect(calls.some(u => u.includes('api.crossref.org'))).toBe(true);
        expect(calls.some(u => u.includes('export.arxiv.org'))).toBe(true);
        expect(calls.some(u => u.includes('api.semanticscholar.org'))).toBe(true);
    });

    it('does not call Semantic Scholar when CrossRef already confirms the reference', async () => {
        const calls = [];
        global.fetch = jest.fn(async (url) => {
            calls.push(url);
            if (url.includes('api.crossref.org')) {
                return jsonResponse({ message: { items: [{ score: 90, DOI: '10.1/x', title: ['Found Paper'] }] } });
            }
            throw new Error('should not reach ' + url);
        });

        const result = await verifyReferenceMultiSource('[1] Some Author. Found Paper. 2020.');
        expect(result.status).toBe('verified');
        expect(result.source).toBe('crossref');
        expect(calls.some(u => u.includes('api.semanticscholar.org'))).toBe(false);
        expect(calls.some(u => u.includes('export.arxiv.org'))).toBe(false);
    });

    it('never throws — network errors on every source mean "unchecked", not fabricated', async () => {
        global.fetch = jest.fn(async () => { throw new Error('network down'); });
        const result = await verifyReferenceMultiSource('[1] Some Author. Some Unreachable Paper. 2020.');
        expect(result.status).toBe('unchecked');

        const cr = await crossRefVerify('[1] x');
        const ax = await arxivVerify('[1] x');
        const ss = await semanticScholarVerify('[1] x');
        expect(cr.found).toBe(false);
        expect(ax.found).toBe(false);
        expect(ss.found).toBe(false);
    });
});

describe('liveVerificationService — reference_verification summary math & ghost flag', () => {
    const content = `
## References
[1] Author A. Verified By CrossRef Paper. 2019.
[2] Author B. Verified By CrossRef Paper Two. 2020.
[3] Author C. Totally Unfindable Paper One. 2021.
[4] Author D. Totally Unfindable Paper Two. 2022.
`;

    it('computes total/verified/unverifiable/ratio and sources, no ghost flag when ratio <= 0.5', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('api.crossref.org')) {
                if (url.includes('Verified')) {
                    return jsonResponse({ message: { items: [{ score: 90, DOI: '10.1/x', title: ['Verified Paper'] }] } });
                }
                return notFoundCrossRef();
            }
            if (url.includes('export.arxiv.org')) return notFoundArxiv();
            if (url.includes('api.semanticscholar.org')) return notFoundSemanticScholar();
            if (url.includes('api.openalex.org')) return notFoundOpenAlex();
            throw new Error('unexpected url ' + url);
        });

        const summary = await computeReferenceVerification(content);

        expect(summary.total).toBe(4);
        expect(summary.verified).toBe(2);
        expect(summary.unverifiable).toBe(2);
        expect(summary.unverifiable_ratio).toBe(0.5);
        expect(summary.sources.crossref).toBe(2);
        expect(summary.ghost_citation_flag).toBe(false); // 0.5 is not > 0.5
        expect(summary.items.length).toBe(4);
    });

    it('sets ghost_citation_flag when unverifiable_ratio > 0.5', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('api.crossref.org')) return notFoundCrossRef();
            if (url.includes('export.arxiv.org')) return notFoundArxiv();
            if (url.includes('api.semanticscholar.org')) return notFoundSemanticScholar();
            if (url.includes('api.openalex.org')) return notFoundOpenAlex();
            throw new Error('unexpected url ' + url);
        });

        const summary = await computeReferenceVerification(content);
        expect(summary.unverifiable).toBe(4);
        expect(summary.unverifiable_ratio).toBe(1);
        expect(summary.ghost_citation_flag).toBe(true);
    });

    it('returns an empty-but-valid summary when there is no references section', async () => {
        global.fetch = jest.fn();
        const summary = await computeReferenceVerification('## Abstract\nNo refs here.');
        expect(summary.total).toBe(0);
        expect(summary.ghost_citation_flag).toBe(false);
        expect(summary.items).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('liveVerificationService — match guard against fabricated references', () => {
    it('a fuzzy search hit whose title does not match the citation is not a verification', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('api.crossref.org')) {
                return jsonResponse({ message: { items: [{ score: 95, DOI: '10.1/other', title: ['Byzantine fault tolerance can be fast'] }] } });
            }
            if (url.includes('export.arxiv.org')) {
                return { ok: true, status: 200, text: async () => '<feed><entry><title>Unrelated Quantum Paper</title><id>http://arxiv.org/abs/1234.5678</id></entry></feed>' };
            }
            if (url.includes('api.semanticscholar.org')) return notFoundSemanticScholar();
            if (url.includes('api.openalex.org')) return notFoundOpenAlex();
            throw new Error('unexpected url ' + url);
        });
        const result = await verifyReferenceMultiSource('[6] Fabricated, Q. (2031). A Paper That Does Not Exist. Journal of Nowhere.');
        expect(result.status).toBe('unverifiable');
    });

    it('a DOI that CrossRef does not know is unverifiable without consulting other sources', async () => {
        const calls = [];
        global.fetch = jest.fn(async (url) => {
            calls.push(url);
            if (url.includes('api.crossref.org/works/')) return { ok: false, status: 404, json: async () => ({}) };
            if (url.includes('doi.org/api/handles/')) return jsonResponse({ responseCode: 100 });
            throw new Error('should not reach ' + url);
        });
        const result = await verifyReferenceMultiSource('[6] Fabricated, Q. (2031). Fake. https://doi.org/10.9999/fake.0001');
        expect(result.status).toBe('unverifiable');
        expect(result.reason).toBe('doi_not_found');
        expect(calls.length).toBe(2); // CrossRef + DOI handle registry, nothing else
    });

    it('a DOI registered outside CrossRef (DataCite arXiv DOI) is confirmed through arXiv', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('api.crossref.org/works/')) return { ok: false, status: 404, json: async () => ({}) };
            if (url.includes('doi.org/api/handles/')) return jsonResponse({ responseCode: 1 });
            if (url.includes('export.arxiv.org') && url.includes('id_list=1706.03762')) {
                return { ok: true, status: 200, text: async () => '<feed><entry><title>Attention Is All You Need</title><id>http://arxiv.org/abs/1706.03762v7</id></entry></feed>' };
            }
            throw new Error('unexpected url ' + url);
        });
        const result = await verifyReferenceMultiSource('[1] Vaswani, A. et al. (2017). Attention Is All You Need. NeurIPS. https://doi.org/10.48550/arXiv.1706.03762');
        expect(result.status).toBe('verified');
        expect(result.source).toBe('arxiv');
    });

    it('a DOI that resolves to the cited title is verified', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('api.crossref.org/works/')) {
                return jsonResponse({ message: { title: ['The Byzantine Generals Problem'], issued: { 'date-parts': [[1982]] } } });
            }
            throw new Error('should not reach ' + url);
        });
        const result = await verifyReferenceMultiSource('[3] Lamport, L. (1982). The Byzantine Generals Problem. https://doi.org/10.1145/357172.357176');
        expect(result.status).toBe('verified');
        expect(result.source).toBe('crossref');
    });

    it('unchecked references are excluded from the ghost-citation ratio', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.includes('Verified')) {
                if (url.includes('api.crossref.org')) return jsonResponse({ message: { items: [{ score: 90, DOI: '10.1/x', title: ['Verified By CrossRef Paper'] }] } });
            }
            throw new Error('rate limited');
        });
        const summary = await computeReferenceVerification(`
## References
[1] Author A. Verified By CrossRef Paper. 2019.
[2] Author C. Totally Unreachable Paper One. 2021.
[3] Author D. Totally Unreachable Paper Two. 2022.
`);
        expect(summary.verified).toBe(1);
        expect(summary.unchecked).toBe(2);
        expect(summary.unverifiable).toBe(0);
        expect(summary.unverifiable_ratio).toBe(0);
        expect(summary.ghost_citation_flag).toBe(false);
    });
});
