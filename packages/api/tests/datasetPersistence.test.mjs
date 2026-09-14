import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createBoundedDatasetCopy, DATASET_R2_TIMEOUT_MS } from '../src/services/boundedDatasetCopy.js';

const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const response = (ok = true, cancel = async () => {}) => ({ ok, body: { cancel } });
const fixture = n => ({ title: `Fixture ${n}`, content: `# Abstract\n\nContent ${n} αβ\n\n# Results\n\nResult ${n}.`,
    author: 'Fixture', author_id: 'test-author', tier: 'ALPHA', granular_scores: { overall: 6 + n / 100 } });

function clock() {
    let time = 0, serial = 0;
    const timers = new Map();
    return {
        timers,
        setTimer: (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: time + delay }); return id; },
        clearTimer: id => timers.delete(id),
        advance: async delay => {
            const target = time + delay;
            for (;;) {
                const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                time = next[1].at;
                timers.delete(next[0]);
                next[1].fn();
                await settle();
            }
            time = target;
            await settle();
        },
    };
}

// Evaluate only this service and its bounded-copy helper, with fs entirely in memory.
// Never import index.js: it starts jobs and deletes radata on startup.
async function dataset(fetchImpl, { credentials = true, failVolume = false } = {}) {
    const files = new Map(), directories = new Set(), requests = [];
    const timer = clock();
    const volume = '/dataset-unit-fixture';
    const memoryFs = {
        existsSync: file => files.has(file) || directories.has(file),
        mkdirSync: directory => directories.add(directory),
        writeFileSync: (file, contents) => { if (failVolume) throw new Error('fixture disk failure'); files.set(file, contents); },
        appendFileSync: (file, contents) => { if (failVolume) throw new Error('fixture disk failure'); files.set(file, (files.get(file) || '') + contents); },
        readFileSync: file => { if (!files.has(file)) throw new Error('fixture ENOENT'); return files.get(file); },
        readdirSync: directory => [...files.keys()].filter(file => file.startsWith(path.normalize(directory) + path.sep)).map(file => path.basename(file)),
    };
    const context = vm.createContext({
        Buffer, AbortController,
        process: { env: { DATASET_VOLUME_PATH: volume, R2_ENDPOINT: 'https://r2.invalid', R2_BUCKET: 'fixture-bucket',
            ...(credentials ? { R2_ACCESS_KEY_ID: 'fixture-access', R2_SECRET_ACCESS_KEY: 'fixture-secret' } : {}) } },
        setTimeout: timer.setTimer, clearTimeout: timer.clearTimer,
        console: { log() {}, warn() {}, error() {} },
        fetch: async (url, options) => { requests.push({ url, ...options }); return fetchImpl(url, options); },
    });
    const helper = new vm.SourceTextModule(readFileSync(new URL('../src/services/boundedDatasetCopy.js', import.meta.url), 'utf8'), { context });
    const source = new vm.SourceTextModule(readFileSync(new URL('../src/services/datasetService.js', import.meta.url), 'utf8'), { context });
    const builtins = { fs: memoryFs, path, crypto };
    await source.link(specifier => {
        if (specifier === './boundedDatasetCopy.js') return helper;
        assert.ok(specifier in builtins, `Unexpected service import: ${specifier}`);
        return new vm.SyntheticModule(['default'], function () { this.setExport('default', builtins[specifier]); }, { context });
    });
    await source.evaluate();
    return { api: source.namespace, files, requests, timer, file: id => path.join(volume, `${id}.jsonl`) };
}

test('successful R2 copy preserves destination, exact content, hash, scores and index counts', async () => {
    let canceled = false;
    const h = await dataset(async () => response(true, async () => { canceled = true; }));
    const p = fixture(1);
    const entry = h.api.buildDatasetEntry('paper-1', p, null, p.granular_scores);
    const result = await h.api.storeDatasetEntry(entry);
    assert.deepEqual(plain(result), { r2: true, volume: true, quality_tier: entry.quality_tier });
    const stored = JSON.parse(h.files.get(h.file('paper-1')));
    assert.deepEqual(stored, plain(entry));
    assert.equal(stored.content_hash, hash(p.content));
    assert.deepEqual(stored.granular_scores, p.granular_scores);
    assert.equal(h.requests[0].url, 'https://r2.invalid/fixture-bucket/dataset/v2/paper-1.jsonl');
    assert.equal(h.requests[0].body, JSON.stringify(entry));
    assert.equal(h.requests[0].redirect, 'error');
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(canceled, true);
    assert.equal(h.api.getDatasetStats().total, 1);
    assert.equal(h.api.exportDataset().length, 1);
    assert.equal(h.timer.timers.size, 0);
});

test('slow R2 preserves the existing R2-before-local ordering, then writes identical local bytes', async () => {
    let acknowledge;
    const h = await dataset(() => new Promise(resolve => { acknowledge = resolve; }));
    const entry = h.api.buildDatasetEntry('slow', fixture(2));
    const pending = h.api.storeDatasetEntry(entry);
    await settle();
    assert.equal(h.files.has(h.file('slow')), false);
    await h.timer.advance(2500);
    assert.equal(h.files.has(h.file('slow')), false);
    acknowledge(response());
    assert.equal((await pending).volume, true);
    assert.equal(h.files.get(h.file('slow')), JSON.stringify(entry) + '\n');
    assert.equal(h.timer.timers.size, 0);
});

test('an unresponsive R2 cannot strand the local file/index after the 10-second deadline', async () => {
    const h = await dataset(() => new Promise(() => {}));
    const p = fixture(3);
    const entry = h.api.buildDatasetEntry('timeout', p, null, p.granular_scores);
    const pending = h.api.storeDatasetEntry(entry);
    await settle();
    await h.timer.advance(DATASET_R2_TIMEOUT_MS - 1);
    assert.equal(h.files.has(h.file('timeout')), false);
    await h.timer.advance(1);
    assert.deepEqual(plain(await pending), { r2: false, volume: true, quality_tier: entry.quality_tier });
    assert.equal(h.files.get(h.file('timeout')), JSON.stringify(entry) + '\n');
    assert.equal(h.api.getDatasetStats().total, 1);
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.timer.timers.size, 0);
});

for (const failure of ['http', 'network', 'no-credentials']) {
    test(`R2 ${failure} still saves the local copy and reports independent outcomes`, async () => {
        const h = await dataset(async () => {
            if (failure === 'network') throw new Error('fixture transport error');
            return response(false);
        }, { credentials: failure !== 'no-credentials' });
        const entry = h.api.buildDatasetEntry(failure, fixture(4));
        assert.deepEqual(plain(await h.api.storeDatasetEntry(entry)), { r2: false, volume: true, quality_tier: entry.quality_tier });
        assert.equal(h.files.get(h.file(failure)), JSON.stringify(entry) + '\n');
        assert.equal(h.requests.length, failure === 'no-credentials' ? 0 : 1);
        assert.equal(h.timer.timers.size, 0);
    });
}

test('an acknowledged PUT with a hung body/cancellation does not delay the local write', async () => {
    let canceled = false;
    const h = await dataset(async () => ({ ...response(true, () => { canceled = true; return new Promise(() => {}); }),
        text: () => { throw new Error('PUT response text must not be consumed'); } }));
    const entry = h.api.buildDatasetEntry('hung-body', fixture(5));
    assert.equal((await h.api.storeDatasetEntry(entry)).volume, true);
    assert.equal(canceled, true);
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.timer.timers.size, 0);
});

test('late R2 acknowledgement is canceled without changing the timeout result or local bytes', async () => {
    let acknowledge, canceled = false;
    const h = await dataset(() => new Promise(resolve => { acknowledge = resolve; }));
    const entry = h.api.buildDatasetEntry('late', fixture(6));
    const pending = h.api.storeDatasetEntry(entry);
    await h.timer.advance(DATASET_R2_TIMEOUT_MS);
    assert.equal((await pending).r2, false);
    const before = h.files.get(h.file('late'));
    acknowledge(response(true, async () => { canceled = true; }));
    await settle();
    assert.equal(canceled, true);
    assert.equal(h.files.get(h.file('late')), before);
    assert.equal(h.requests.length, 1);
});

test('score updates retain content/hash and local scores even when their R2 copy times out', async () => {
    let count = 0;
    const h = await dataset(() => ++count === 1 ? response() : new Promise(() => {}));
    const p = fixture(7);
    const entry = h.api.buildDatasetEntry('scored', p, null, p.granular_scores);
    await h.api.storeDatasetEntry(entry);
    const scores = { overall: 9, reproducibility: 8 };
    const pending = h.api.updateDatasetScores('scored', scores);
    await h.timer.advance(DATASET_R2_TIMEOUT_MS);
    assert.equal(await pending, true); // Existing contract: local score update succeeded.
    const stored = JSON.parse(h.files.get(h.file('scored')));
    assert.equal(stored.content, p.content);
    assert.equal(stored.content_hash, hash(p.content));
    assert.deepEqual(stored.granular_scores, scores);
    assert.equal(stored.calibrated_score, 9);
});

test('local storage failure is reported separately from acknowledged R2', async () => {
    const h = await dataset(async () => response(), { failVolume: true });
    const entry = h.api.buildDatasetEntry('disk-failed', fixture(8));
    assert.deepEqual(plain(await h.api.storeDatasetEntry(entry)), { r2: true, volume: false, quality_tier: entry.quality_tier });
});

test('failure of both stores is not reported as a persisted dataset entry', async () => {
    const h = await dataset(async () => response(false), { failVolume: true });
    const entry = h.api.buildDatasetEntry('both-failed', fixture(8));
    assert.deepEqual(plain(await h.api.storeDatasetEntry(entry)), { r2: false, volume: false, quality_tier: entry.quality_tier });
    assert.equal(h.files.size, 0);
    assert.equal(h.api.getDatasetStats().total, 0);
});

test('copy timeout cannot be configured above ten seconds; signing errors are also false', async () => {
    const timer = clock();
    const options = { setTimer: timer.setTimer, clearTimer: timer.clearTimer, timeoutMs: 60_000 };
    const put = createBoundedDatasetCopy({ ...options, signRequest: () => ({ url: 'https://r2.invalid', headers: {} }),
        fetchImpl: () => new Promise(() => {}) });
    const pending = put('fixture', 'bytes');
    await timer.advance(DATASET_R2_TIMEOUT_MS);
    assert.equal(await pending, false);
    const badSignature = createBoundedDatasetCopy({ ...options, signRequest: () => { throw new Error('fixture invalid config'); } });
    assert.equal(await badSignature('fixture', 'bytes'), false);
    assert.equal(timer.timers.size, 0);
});

function bootFragment(dependencies) {
    const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('            let restored = 0;\n            let restoreCursor = 0;');
    const end = source.indexOf('            publicationRuntime.restore = {', start);
    assert.ok(start >= 0 && end > start, 'Locate the trusted boot-restore fragment only');
    const moderationStart = source.indexOf('const ABRAXAS_RE =');
    const moderationEnd = source.indexOf("\napp.get('/swarm-status'", moderationStart);
    assert.ok(moderationStart >= 0 && moderationEnd > moderationStart, 'Locate the pure existing moderation predicates');
    // Only the actual worker/overlay fragment, not an application import or user code.
    return vm.runInNewContext(`(async () => { ${source.slice(moderationStart, moderationEnd)}\n${source.slice(start, end)}; return { restored, durableRestored }; })()`, {
        console: { log() {}, warn() {} },
        AbortSignal: { timeout: () => new AbortController().signal },
        GH_PAPERS_OWNER: 'fixture', GH_PAPERS_REPO: 'fixture', githubHeaders: {},
        VALID_TIERS_BOOT: new Set(['ALPHA']), TIER_MAP_BOOT: {},
        normalizeTitle: value => value.toLowerCase(), getContentHash: hash,
        titleCache: new Set(), contentHashCache: new Set(), gunSafe: value => value,
        db: { get() { return this; }, put() {} },
        ...dependencies,
    });
}

function markdown(id) {
    return `# ${id}\n\n**Paper ID:** ${id}\n**Author:** Fixture (fixture)\n**Date:** 2026-09-14\n**Verification Tier:** ALPHA\n\n---\n\nContent ${id} αβ`;
}

test('GitHub restore leaves an already-cached scored paper and its dataset bytes unchanged', async () => {
    const h = await dataset(async () => response());
    const cached = fixture(42);
    await h.api.storeDatasetEntry(h.api.buildDatasetEntry('cached', cached, null, cached.granular_scores));
    const before = h.files.get(h.file('cached'));
    h.requests.length = 0;
    const swarmCache = { paperCache: new Map([['cached', cached]]), paperStats: { verified: 0 } };
    const result = await bootFragment({ swarmCache, mdFiles: [{ path: 'cached.md' }],
        fetch: async () => ({ ok: true, text: async () => markdown('cached') }),
        loadDurablePapers: async () => [], buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
    });
    assert.deepEqual(plain(result), { restored: 1, durableRestored: 0 });
    assert.equal(swarmCache.paperCache.get('cached'), cached);
    assert.deepEqual(swarmCache.paperCache.get('cached').granular_scores, cached.granular_scores);
    assert.equal(h.files.get(h.file('cached')), before);
    assert.equal(h.requests.length, 0, 'No replacement dataset copy is started');
    assert.equal(h.api.getDatasetStats().total, 1);
});

test('existing moderation predicates omit banned GitHub and HF papers without skipping valid neighbors', async () => {
    const h = await dataset(async () => response());
    const swarmCache = { paperCache: new Map(), paperStats: { verified: 0 } };
    const result = await bootFragment({ swarmCache,
        mdFiles: [{ path: 'banned-gh.md' }, { path: 'valid-gh.md' }],
        fetch: async url => {
            const id = url.split('/').at(-1).replace('.md', '');
            const md = markdown(id);
            return { ok: true, text: async () => id === 'banned-gh' ? md.replace('Fixture (fixture)', 'Abraxas (abraxas-agent)') : md };
        },
        loadDurablePapers: async () => [
            { paperId: 'banned-hf', data: { ...fixture(1), title: 'Abraxas digest' } },
            { paperId: 'valid-hf', data: fixture(2) },
        ],
        buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
    });
    assert.deepEqual(plain(result), { restored: 1, durableRestored: 1 });
    assert.deepEqual(new Set(swarmCache.paperCache.keys()), new Set(['valid-gh', 'valid-hf']));
    assert.equal(h.requests.length, 2);
    assert.equal(h.files.has(h.file('banned-gh')), false);
    assert.equal(h.files.has(h.file('banned-hf')), false);
    assert.equal(h.api.getDatasetStats().total, 2);
    assert.equal(h.api.exportDataset().length, 2);
});

test('actual boot workers await dataset copies, stay at eight and finish GH before HF without losing IDs/hashes', async () => {
    const waiting = [];
    let active = 0, peak = 0, ghReads = 0, hfLoaded = false;
    const h = await dataset(() => new Promise(resolve => {
        active++; peak = Math.max(peak, active);
        waiting.push(() => { active--; resolve(response()); });
    }));
    const swarmCache = { paperCache: new Map(), paperStats: { verified: 0 } };
    const ghIds = Array.from({ length: 17 }, (_, i) => `gh-${i}`);
    const hf = Array.from({ length: 17 }, (_, i) => ({ paperId: `hf-${i}`, data: fixture(i) }));
    const pending = bootFragment({
        swarmCache, mdFiles: ghIds.map(id => ({ path: `${id}.md` })),
        fetch: async url => { ghReads++; return { ok: true, text: async () => markdown(decodeURIComponent(url.split('/').at(-1)).replace('.md', '')) }; },
        buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
        loadDurablePapers: async () => {
            assert.equal(h.api.getDatasetStats().total, 17, 'HF starts only after all GH local copies');
            assert.equal(active, 0);
            hfLoaded = true;
            return hf;
        },
    });
    await settle();
    assert.equal(ghReads, 8, 'workers cannot fetch their next paper before copying the previous one');
    assert.equal(h.requests.length, 8);
    assert.equal(hfLoaded, false);
    for (let batch = 0; batch < 8; batch++) {
        waiting.splice(0).forEach(finish => finish());
        await settle();
    }
    assert.deepEqual(plain(await pending), { restored: 17, durableRestored: 17 });
    assert.equal(peak, 8);
    assert.equal(active, 0);
    assert.equal(h.requests.length, 34);
    assert.equal(h.api.getDatasetStats().total, 34);
    const exported = h.api.exportDataset().map(line => JSON.parse(line));
    assert.equal(exported.length, 34);
    assert.deepEqual(new Set(exported.map(entry => entry.id)), new Set([...ghIds, ...hf.map(item => item.paperId)]));
    for (const entry of exported) assert.equal(entry.content_hash, hash(entry.content));
    for (const { paperId, data } of hf) {
        const stored = JSON.parse(h.files.get(h.file(paperId)));
        assert.equal(stored.content, data.content);
        assert.deepEqual(stored.granular_scores, data.granular_scores);
    }
    assert.equal(h.timer.timers.size, 0);
});

test('repeated HF IDs count both records but copy only the final content/scores once', async () => {
    const waiting = [];
    let active = 0, peak = 0;
    const h = await dataset(() => new Promise(resolve => {
        active++; peak = Math.max(peak, active);
        waiting.push(() => { active--; resolve(response()); });
    }));
    const first = fixture(1), last = fixture(99);
    const swarmCache = { paperCache: new Map(), paperStats: { verified: 0 } };
    const pending = bootFragment({ swarmCache, mdFiles: [],
        fetch: () => { throw new Error('No GH files expected'); },
        loadDurablePapers: async () => [{ paperId: 'same-id', data: first }, { paperId: 'same-id', data: last }],
        buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
    });
    await settle();
    assert.equal(h.requests.length, 1);
    assert.equal(swarmCache.paperCache.get('same-id').content, last.content);
    waiting.shift()();
    assert.deepEqual(plain(await pending), { restored: 0, durableRestored: 2 });
    const stored = JSON.parse(h.files.get(h.file('same-id')));
    assert.equal(stored.content, last.content);
    assert.equal(stored.content_hash, hash(last.content));
    assert.deepEqual(stored.granular_scores, last.granular_scores);
    assert.equal(h.api.getDatasetStats().total, 1);
    assert.equal(h.api.exportDataset().length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(peak, 1);
});

for (const liveScores of [{ overall: 9 }, JSON.stringify({ overall: 9 })]) {
    test(`HF copies use scores updated while their worker waits: ${typeof liveScores}`, async () => {
        const waiting = [];
        const h = await dataset(() => new Promise(resolve => waiting.push(resolve)));
        const hf = Array.from({ length: 9 }, (_, i) => ({ paperId: `live-${i}`, data: fixture(i) }));
        const swarmCache = { paperCache: new Map(), paperStats: { verified: 0 } };
        const pending = bootFragment({ mdFiles: [], swarmCache, loadDurablePapers: async () => hf,
            buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
        });
        await settle();
        assert.equal(h.requests.length, 8);
        assert.equal(swarmCache.paperCache.size, 9, 'The entire overlay completes before waiting for copies');
        swarmCache.paperCache.set('live-8', { ...swarmCache.paperCache.get('live-8'), granular_scores: liveScores });
        waiting.splice(0).forEach(resolve => resolve(response()));
        await settle();
        assert.equal(h.requests.length, 9);
        waiting.splice(0).forEach(resolve => resolve(response()));
        assert.deepEqual(plain(await pending), { restored: 0, durableRestored: 9 });
        assert.deepEqual(swarmCache.paperCache.get('live-8').granular_scores, liveScores, 'Copy does not overwrite or normalize live cache');
        const stored = JSON.parse(h.files.get(h.file('live-8')));
        assert.equal(stored.calibrated_score, 9);
        assert.deepEqual(stored.granular_scores, { overall: 9 });
        assert.equal(stored.content_hash, hash(hf[8].data.content));
        assert.equal(h.api.getDatasetStats().total, 9);
    });
}

test('an entry purged before its HF worker starts is not resurrected or copied from an old snapshot', async () => {
    const waiting = [], warnings = [];
    const h = await dataset(() => new Promise(resolve => waiting.push(resolve)));
    const hf = Array.from({ length: 9 }, (_, i) => ({ paperId: `purge-${i}`, data: fixture(i) }));
    const swarmCache = { paperCache: new Map(), paperStats: { verified: 0 } };
    const pending = bootFragment({ mdFiles: [], swarmCache, loadDurablePapers: async () => hf,
        console: { log() {}, warn: message => warnings.push(message) },
        buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
    });
    await settle();
    assert.equal(h.requests.length, 8);
    swarmCache.paperCache.delete('purge-8');
    waiting.splice(0).forEach(resolve => resolve(response()));
    assert.deepEqual(plain(await pending), { restored: 0, durableRestored: 9 });
    assert.equal(h.requests.length, 8);
    assert.equal(swarmCache.paperCache.has('purge-8'), false);
    assert.equal(h.files.has(h.file('purge-8')), false);
    assert.equal(h.api.getDatasetStats().total, 8);
    assert.deepEqual(warnings, ['[BOOT-RESTORE] Dataset copy skipped: entry no longer in cache']);
});

test('all restore entries reach local storage even if every R2 copy times out', async () => {
    const h = await dataset(() => new Promise(() => {}));
    const hf = Array.from({ length: 9 }, (_, i) => ({ paperId: `timeout-${i}`, data: fixture(i) }));
    const pending = bootFragment({ mdFiles: [], swarmCache: { paperCache: new Map(), paperStats: { verified: 0 } },
        fetch: () => { throw new Error('No GH files expected'); }, loadDurablePapers: async () => hf,
        buildDatasetEntry: h.api.buildDatasetEntry, storeDatasetEntry: h.api.storeDatasetEntry,
    });
    await settle();
    assert.equal(h.requests.length, 8);
    await h.timer.advance(DATASET_R2_TIMEOUT_MS);
    assert.equal(h.requests.length, 9);
    assert.equal(h.api.getDatasetStats().total, 8);
    await h.timer.advance(DATASET_R2_TIMEOUT_MS);
    assert.deepEqual(plain(await pending), { restored: 0, durableRestored: 9 });
    assert.equal(h.api.getDatasetStats().total, 9);
    for (const { paperId, data } of hf) {
        const stored = JSON.parse(h.files.get(h.file(paperId)));
        assert.equal(stored.content, data.content);
        assert.equal(stored.content_hash, hash(data.content));
        assert.deepEqual(stored.granular_scores, data.granular_scores);
    }
    assert.ok(h.requests.every(request => request.signal.aborted));
    assert.equal(h.timer.timers.size, 0);
});
