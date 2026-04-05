/**
 * P2PCLAW Scientific API Proxy Service
 * =====================================
 * Provides rate-limited, cached access to public scientific APIs.
 * Whitelist-only: crossref, pubchem, oeis, uniprot, materials_project
 *
 * Each API has:
 *   - base URL and URL builder
 *   - rate limit (ms between calls)
 *   - response transformer (extracts relevant data)
 *   - in-memory cache with TTL (max 500 entries)
 */

// ── Cache ──────────────────────────────────────────────────────────────
const cache = new Map();          // key -> { data, expires }
const MAX_CACHE_ENTRIES = 500;
const DEFAULT_CACHE_TTL = 3600000; // 1 hour

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) { cache.delete(key); return null; }
    return entry.data;
}

function cacheSet(key, data, ttl = DEFAULT_CACHE_TTL) {
    // Evict oldest entries if at capacity
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const first = cache.keys().next().value;
        cache.delete(first);
    }
    cache.set(key, { data, expires: Date.now() + ttl });
}

// ── Per-API last-call timestamps (for rate limiting) ───────────────────
const lastCallTimestamps = {};

async function rateLimitedFetch(apiName, url, rateMs) {
    const now = Date.now();
    const last = lastCallTimestamps[apiName] || 0;
    const wait = Math.max(0, rateMs - (now - last));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallTimestamps[apiName] = Date.now();

    const headers = { "User-Agent": "P2PCLAW/1.0 (https://p2pclaw.com; p2pclaw@p2pclaw.com)" };

    // Materials Project needs API key
    if (apiName === "materials_project" && process.env.MP_API_KEY) {
        headers["X-API-KEY"] = process.env.MP_API_KEY;
    }

    const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
    });
    return resp;
}

// ── API definitions ────────────────────────────────────────────────────
const API_REGISTRY = {
    crossref: {
        name: "CrossRef",
        description: "Academic paper metadata and DOI resolution",
        rateMs: 1000,
        buildUrl: (query) => {
            // Detect DOI patterns for direct lookup (much more accurate)
            const doiMatch = query.match(/^(10\.\d{4,}\/\S+)$/);
            if (doiMatch) {
                return `https://api.crossref.org/works/${encodeURIComponent(doiMatch[1])}?mailto=p2pclaw@p2pclaw.com`;
            }
            return `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&mailto=p2pclaw@p2pclaw.com`;
        },
        transform: (data) => {
            // Direct DOI lookup returns { message: { ... } } (single work, no items array)
            if (data?.message?.DOI && !data?.message?.items) {
                const item = data.message;
                return {
                    total_results: 1,
                    doi_direct: true,
                    results: [{
                        title: (item.title || [])[0] || "Untitled",
                        authors: (item.author || []).map(a => `${a.given || ""} ${a.family || ""}`.trim()).slice(0, 5),
                        doi: item.DOI || null,
                        year: item.published?.["date-parts"]?.[0]?.[0] || item.created?.["date-parts"]?.[0]?.[0] || null,
                        journal: (item["container-title"] || [])[0] || null,
                        type: item.type || null,
                        url: item.URL || null,
                        citations: item["is-referenced-by-count"] || 0,
                    }],
                };
            }
            // Query search returns { message: { items: [...] } }
            const items = data?.message?.items || [];
            return {
                total_results: data?.message?.["total-results"] || 0,
                results: items.map(item => ({
                    title: (item.title || [])[0] || "Untitled",
                    authors: (item.author || []).map(a => `${a.given || ""} ${a.family || ""}`.trim()).slice(0, 5),
                    doi: item.DOI || null,
                    year: item.published?.["date-parts"]?.[0]?.[0] || null,
                    journal: (item["container-title"] || [])[0] || null,
                    type: item.type || null,
                    url: item.URL || null,
                    citations: item["is-referenced-by-count"] || 0,
                })),
            };
        },
    },

    pubchem: {
        name: "PubChem",
        description: "Chemical compound data (NCBI)",
        rateMs: 500,
        buildUrl: (query) =>
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/JSON`,
        transform: (data) => {
            const compounds = data?.PC_Compounds || [];
            if (compounds.length === 0) return { found: false, query_note: "No compound found with that name" };
            const c = compounds[0];
            // Extract props
            const props = {};
            for (const p of c.props || []) {
                const label = p.urn?.label || "";
                const name = p.urn?.name || "";
                const val = p.value?.sval || p.value?.ival || p.value?.fval || null;
                if (label === "IUPAC Name" && name === "Preferred") props.iupac_name = val;
                if (label === "Molecular Formula") props.molecular_formula = val;
                if (label === "Molecular Weight") props.molecular_weight = val;
                if (label === "InChI") props.inchi = val;
                if (label === "SMILES" && name === "Canonical") props.smiles = val;
            }
            return {
                found: true,
                cid: c.id?.id?.cid || null,
                ...props,
                atom_count: c.atoms?.aid?.length || 0,
                bond_count: c.bonds?.aid1?.length || 0,
            };
        },
    },

    oeis: {
        name: "OEIS",
        description: "Online Encyclopedia of Integer Sequences",
        rateMs: 2000,
        buildUrl: (query) =>
            `https://oeis.org/search?fmt=json&q=${encodeURIComponent(query)}`,
        transform: (data) => {
            // OEIS returns a top-level array (not { results: [...] })
            const results = Array.isArray(data) ? data : (data?.results || []);
            return {
                count: results.length,
                results: results.slice(0, 5).map(seq => ({
                    id: seq.number != null ? `A${String(seq.number).padStart(6, "0")}` : null,
                    name: seq.name || null,
                    first_terms: (seq.data || "").split(",").slice(0, 15).join(", "),
                    formula: (seq.formula || []).slice(0, 3),
                    references: seq.reference?.length || 0,
                })),
            };
        },
    },

    uniprot: {
        name: "UniProt",
        description: "Protein sequence and function database",
        rateMs: 1000,
        buildUrl: (query) =>
            `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&format=json&size=5`,
        transform: (data) => {
            const results = data?.results || [];
            return {
                total: results.length,
                results: results.map(entry => ({
                    accession: entry.primaryAccession || null,
                    name: entry.proteinDescription?.recommendedName?.fullName?.value || entry.uniProtkbId || null,
                    organism: entry.organism?.scientificName || null,
                    gene: (entry.genes || []).map(g => g.geneName?.value).filter(Boolean).slice(0, 3),
                    length: entry.sequence?.length || null,
                    function: (entry.comments || [])
                        .filter(c => c.commentType === "FUNCTION")
                        .map(c => (c.texts || []).map(t => t.value).join(" "))
                        .join(" ")
                        .substring(0, 300) || null,
                })),
            };
        },
    },

    materials_project: {
        name: "Materials Project",
        description: "Materials science database (requires MP_API_KEY env var)",
        rateMs: 1000,
        buildUrl: (query) =>
            `https://api.materialsproject.org/materials/summary/?formula=${encodeURIComponent(query)}&_limit=5`,
        transform: (data) => {
            const docs = data?.data || [];
            if (!Array.isArray(docs)) return { found: false, note: "Unexpected response format" };
            return {
                total: docs.length,
                results: docs.map(d => ({
                    material_id: d.material_id || null,
                    formula: d.formula_pretty || null,
                    space_group: d.symmetry?.symbol || null,
                    band_gap: d.band_gap != null ? `${d.band_gap} eV` : null,
                    energy_above_hull: d.energy_above_hull != null ? `${d.energy_above_hull} eV/atom` : null,
                    is_stable: d.is_stable || null,
                    density: d.density != null ? `${d.density} g/cm^3` : null,
                })),
            };
        },
    },

    // Fix #8: arXiv search API — enables agents to find related work
    arxiv: {
        name: "arXiv",
        description: "Academic preprint search (physics, CS, math, biology, etc.)",
        rateMs: 3000,  // arXiv requests 3s between calls
        buildUrl: (query) =>
            `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=relevance`,
        transform: (data) => {
            // arXiv returns Atom XML — parse it with regex (no XML parser needed)
            const text = typeof data === "string" ? data : JSON.stringify(data);
            const entries = [];
            const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
            let match;
            while ((match = entryRegex.exec(text)) !== null && entries.length < 5) {
                const entry = match[1];
                const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, " ").trim() || "";
                const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.replace(/\s+/g, " ").trim().substring(0, 300) || "";
                const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.trim() || "";
                const idUrl = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || "";
                const arxivId = idUrl.match(/abs\/(.+)/)?.[1] || idUrl;
                const authors = [];
                const authorRegex = /<name>([\s\S]*?)<\/name>/g;
                let aMatch;
                while ((aMatch = authorRegex.exec(entry)) !== null && authors.length < 5) {
                    authors.push(aMatch[1].trim());
                }
                const cats = (entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [])[1] || "";
                entries.push({
                    arxiv_id: arxivId,
                    title,
                    authors,
                    abstract: summary,
                    published: published.substring(0, 10),
                    category: cats,
                    url: `https://arxiv.org/abs/${arxivId}`,
                    doi: (entry.match(/<arxiv:doi>([\s\S]*?)<\/arxiv:doi>/) || [])[1]?.trim() || null,
                });
            }
            return {
                total: entries.length,
                results: entries,
            };
        },
    },

    // Fix #8b: Semantic Scholar search — complements arXiv for published work
    semantic_scholar: {
        name: "Semantic Scholar",
        description: "Academic paper search with citation counts and abstracts",
        rateMs: 1000,
        buildUrl: (query) =>
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=title,authors,year,citationCount,abstract,externalIds`,
        transform: (data) => {
            const papers = data?.data || [];
            return {
                total: data?.total || papers.length,
                results: papers.map(p => ({
                    paper_id: p.paperId || null,
                    title: p.title || null,
                    authors: (p.authors || []).map(a => a.name).slice(0, 5),
                    year: p.year || null,
                    citations: p.citationCount || 0,
                    abstract: p.abstract ? p.abstract.substring(0, 300) : null,
                    doi: p.externalIds?.DOI || null,
                    arxiv_id: p.externalIds?.ArXiv || null,
                })),
            };
        },
    },
};

// ── Main query function ────────────────────────────────────────────────
export async function queryAPI(apiName, query) {
    const api = API_REGISTRY[apiName];
    if (!api) {
        return { error: "unknown_api", available: Object.keys(API_REGISTRY) };
    }

    if (!query || typeof query !== "string" || query.trim().length < 1) {
        return { error: "empty_query" };
    }

    // Materials Project requires API key
    if (apiName === "materials_project" && !process.env.MP_API_KEY) {
        return { error: "mp_api_key_required", hint: "Set MP_API_KEY environment variable to use Materials Project API" };
    }

    const cacheKey = `${apiName}:${query.trim().toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, _cached: true };

    const url = api.buildUrl(query.trim());

    try {
        const resp = await rateLimitedFetch(apiName, url, api.rateMs);

        if (!resp.ok) {
            if (resp.status === 404) return { error: "not_found", api: apiName, query };
            return { error: "api_error", status: resp.status, api: apiName };
        }

        // arXiv returns XML, not JSON — detect and handle accordingly
        const contentType = resp.headers.get("content-type") || "";
        const raw = contentType.includes("xml") || contentType.includes("atom") || apiName === "arxiv"
            ? await resp.text()
            : await resp.json();
        const transformed = api.transform(raw);
        const result = { api: apiName, api_name: api.name, query, ...transformed };

        cacheSet(cacheKey, result);
        return result;
    } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
            return { error: "api_timeout", api: apiName, timeout_ms: 15000 };
        }
        return { error: "api_unavailable", api: apiName, message: err.message };
    }
}

export function getAvailableAPIs() {
    return Object.entries(API_REGISTRY).map(([id, api]) => ({
        id,
        name: api.name,
        description: api.description,
        rate_limit_ms: api.rateMs,
        requires_key: id === "materials_project",
    }));
}

export function getProxyCacheStats() {
    let active = 0;
    const now = Date.now();
    for (const entry of cache.values()) {
        if (entry.expires > now) active++;
    }
    return { total_entries: cache.size, active_entries: active, max_entries: MAX_CACHE_ENTRIES };
}
