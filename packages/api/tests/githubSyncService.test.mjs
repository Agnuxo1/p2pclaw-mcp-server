import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubPaperSync, GITHUB_SYNC_TIMEOUT_MS } from '../src/services/githubSyncService.js';

const paper = { title: 'Deterministic paper', author: 'Fixture', author_id: 'fixture-author',
    timestamp: 1700000000000, content: 'Scientific fixture content.', tier: 'ALPHA' };
const reply = (status, headers = {}, data = {}) => ({ status, headers: new Headers(headers), json: async () => data });
const settle = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };

function harness(responses, options = {}) {
    let time = 1700000000000;
    let sequence = 0;
    const timers = new Map();
    const requests = [];
    const logs = [];
    const sync = createGitHubPaperSync({
        env: { GITHUB_PAPERS_SYNC_TOKEN: 'unit-test-token', ...options.env },
        now: () => time,
        setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; },
        clearTimer: id => timers.delete(id),
        logger: { warn: message => logs.push(message) },
        timeoutMs: options.timeoutMs,
        fetchImpl: async (url, request) => {
            requests.push({ url, ...request });
            const result = responses.shift();
            if (result instanceof Error) throw result;
            if (typeof result === 'function') return result(url, request, requests);
            assert.ok(result, 'unexpected extra HTTP request');
            return result;
        },
    });
    return {
        sync, requests, logs, timers,
        now: () => time,
        advance: async ms => {
            const target = time + ms;
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

function matchingFile(url, _request, requests, changes = {}) {
    const encoded = JSON.parse(requests[0].body).content;
    return reply(200, {}, { type: 'file', path: decodeURIComponent(new URL(url).pathname.split('/').at(-1)),
        encoding: 'base64', content: encoded, ...changes });
}

test('keeps destination, payload, branch, authorization and boolean success contract', async () => {
    const h = harness([reply(201)]);
    assert.equal(await h.sync('fixture-id', paper), true);
    const [request] = h.requests;
    assert.match(request.url, /^https:\/\/api\.github\.com\/repos\/Agnuxo1\/p2pclaw-papers\/contents\//);
    assert.equal(request.headers.Authorization, 'token unit-test-token');
    assert.equal(request.redirect, 'error');
    const body = JSON.parse(request.body);
    assert.equal(body.branch, 'main');
    assert.match(Buffer.from(body.content, 'base64').toString(), /\*\*Paper ID:\*\* fixture-id/);
    assert.equal(request.signal.aborted, true);
    assert.equal(h.timers.size, 0);
});

test('preserves repository overrides and GITHUB_TOKEN fallback', async () => {
    const h = harness([reply(200)], { env: { GITHUB_PAPERS_SYNC_TOKEN: '', GITHUB_TOKEN: 'fixture-fallback',
        GITHUB_PAPERS_REPO_OWNER: 'fixture-owner', GITHUB_PAPERS_REPO_NAME: 'fixture-repo' } });
    assert.equal(await h.sync('fixture-id', paper), true);
    assert.match(h.requests[0].url, /\/repos\/fixture-owner\/fixture-repo\/contents\//);
    assert.equal(h.requests[0].headers.Authorization, 'token fixture-fallback');
});

test('missing token does not start HTTP or timers', async () => {
    const h = harness([], { env: { GITHUB_PAPERS_SYNC_TOKEN: '' } });
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.requests.length, 0);
    assert.equal(h.timers.size, 0);
});

for (const data of [
    { ...paper, author_id: 'diagnostic-agent-fixture' },
    { ...paper, author_id: 'github-actions-validator-fixture' },
    { ...paper, title: 'Auto Validator Bootstrap fixture' },
    { ...paper, title: 'Pipeline Verification Test fixture' },
]) {
    test(`keeps existing internal-paper exclusion: ${data.author_id}/${data.title}`, async () => {
        const h = harness([]);
        assert.equal(await h.sync('fixture-id', data), false);
        assert.equal(h.requests.length, 0);
        assert.equal(h.timers.size, 0);
    });
}

for (const status of [400, 401, 403, 404]) {
    test(`HTTP ${status} without a rate-limit signal returns false without retries`, async () => {
        const h = harness([reply(status, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1700003600' },
            { message: 'Resource not accessible by personal access token' })]);
        const before = h.now();
        assert.equal(await h.sync('fixture-id', paper), false);
        assert.equal(h.now(), before);
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].signal.aborted, true);
        assert.equal(h.timers.size, 0);
    });
}

test('primary rate limit beyond the deadline returns false instead of waiting minutes', async () => {
    const h = harness([reply(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700003600' })]);
    const before = h.now();
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.now(), before);
    assert.equal(h.requests.length, 1);
    assert.ok(h.logs.some(message => message.includes('Rate limited')));
});

test('secondary rate limit without a delay hint is recognized but never retried early', async () => {
    const h = harness([reply(403, {}, { message: 'You have exceeded a secondary rate limit.' })]);
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.requests.length, 1);
    assert.ok(h.logs.some(message => message.includes('Rate limited')));
});

test('429 without hints uses the minimum one-minute delay and returns immediately', async () => {
    const h = harness([reply(429)]);
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
});

for (const [status, headers] of [
    [429, { 'retry-after': '2' }],
    [403, { 'retry-after': '2' }],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000002' }],
    [429, { 'retry-after': new Date(1700000002000).toUTCString() }],
]) {
    test(`honors a short rate-limit wait before retrying: ${status} ${JSON.stringify(headers)}`, async () => {
        const h = harness([reply(status, headers), reply(201)]);
        const result = h.sync('fixture-id', paper);
        await settle();
        await h.advance(1999);
        assert.equal(h.requests.length, 1);
        await h.advance(1);
        assert.equal(await result, true);
        assert.equal(h.requests.length, 2);
        assert.equal(h.timers.size, 0);
    });
}

test('does not retry before the primary reset even when Retry-After is shorter', async () => {
    const h = harness([reply(403, { 'retry-after': '1', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700003600' })]);
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.requests.length, 1);
});

test('a zero Retry-After still leaves one second between mutative requests', async () => {
    const h = harness([reply(429, { 'retry-after': '0' }), reply(201)]);
    const result = h.sync('fixture-id', paper);
    await settle();
    await h.advance(999);
    assert.equal(h.requests.length, 1);
    await h.advance(1);
    assert.equal(await result, true);
    assert.equal(h.requests.length, 2);
});

test('bounded network and server retries preserve one payload and stop after three PUTs', async () => {
    const h = harness([new Error('fixture network failure'), reply(503), reply(502)]);
    const result = h.sync('fixture-id', { ...paper, timestamp: undefined });
    await settle();
    await h.advance(1000);
    await h.advance(2000);
    assert.equal(await result, false);
    assert.equal(h.requests.length, 3);
    assert.equal(new Set(h.requests.map(request => request.body)).size, 1);
    assert.equal(h.timers.size, 0);
});

for (const status of [409, 422]) {
    test(`${status} is success only when the existing file's exact bytes match`, async () => {
        const h = harness([reply(status), matchingFile]);
        assert.equal(await h.sync('fixture-id', paper), true);
        assert.deepEqual(h.requests.map(request => request.method), ['PUT', 'GET']);
        assert.match(h.requests[1].url, /\?ref=main$/);
        assert.equal(h.requests[1].body, undefined);
    });
}

for (const changes of [
    { content: Buffer.from('different content').toString('base64') },
    { content: '###not-base64###' },
    { path: 'another-file.md' },
    { encoding: 'none' },
    { type: 'symlink' },
]) {
    test(`422 cannot confirm mismatched or unsupported existing content: ${JSON.stringify(changes)}`, async () => {
        const h = harness([reply(422), (url, request, requests) => matchingFile(url, request, requests, changes)]);
        assert.equal(await h.sync('fixture-id', paper), false);
        assert.deepEqual(h.requests.map(request => request.method), ['PUT', 'GET']);
    });
}

test('a generic 422 with no existing file fails instead of claiming an idempotent copy', async () => {
    const h = harness([reply(422), reply(404)]);
    assert.equal(await h.sync('fixture-id', paper), false);
    assert.equal(h.requests.length, 2);
});

test('base64 line breaks from GitHub do not change byte equality', async () => {
    const h = harness([reply(422), (url, request, requests) => {
        const content = JSON.parse(requests[0].body).content.replace(/(.{60})/g, '$1\n');
        return matchingFile(url, request, requests, { content });
    }]);
    assert.equal(await h.sync('fixture-id', paper), true);
});

for (const lateStatus of [201, 409, 503]) {
test(`the total deadline bounds an abort-ignoring fetch and prevents late follow-ups after ${lateStatus}`, async () => {
    let finishFetch;
    const h = harness([() => new Promise(resolve => { finishFetch = resolve; })], { timeoutMs: 100_000 });
    const result = h.sync('fixture-id', paper);
    await settle();
    await h.advance(GITHUB_SYNC_TIMEOUT_MS);
    assert.equal(await result, false);
    assert.equal(h.requests[0].signal.aborted, true);
    let closed = false;
    finishFetch({ ...reply(lateStatus), body: { cancel: async () => { closed = true; } } });
    await settle();
    await h.advance(20_000);
    assert.equal(h.requests.length, 1);
    assert.equal(closed, true);
    assert.equal(h.timers.size, 0);
});
}

test('response bodies are canceled on success, permission failure and before retry waits', async () => {
    for (const status of [201, 401, 403, 503]) {
        let canceled = false;
        const h = harness([{ ...reply(status), body: { cancel: async () => { canceled = true; } } }, reply(201)]);
        const result = h.sync('fixture-id', paper);
        await settle();
        assert.equal(canceled, true, `HTTP ${status} response canceled`);
        if (status === 503) await h.advance(1000);
        assert.equal(await result, status === 201 || status === 503);
        assert.equal(h.requests[0].signal.aborted, true);
        assert.equal(h.timers.size, 0);
    }
});

test('the total deadline also covers a stalled response body on permission classification', async () => {
    const h = harness([{ ...reply(403), json: () => new Promise(() => {}) }]);
    const result = h.sync('fixture-id', paper);
    await settle();
    await h.advance(GITHUB_SYNC_TIMEOUT_MS);
    assert.equal(await result, false);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.timers.size, 0);
});

test('all attempts share one deadline, including existing-file verification', async () => {
    const h = harness([reply(503), reply(422), () => new Promise(() => {})], { timeoutMs: 3000 });
    const result = h.sync('fixture-id', paper);
    await settle();
    await h.advance(1000);
    assert.equal(h.requests.length, 3);
    await h.advance(2000);
    assert.equal(await result, false);
    assert.equal(h.requests.length, 3);
    assert.ok(h.requests.every(request => request.signal.aborted));
    assert.equal(h.timers.size, 0);
});
