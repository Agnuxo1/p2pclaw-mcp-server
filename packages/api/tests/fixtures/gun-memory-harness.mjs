/**
 * Read-only, data-only experiment for Gun 0.2020.1241 map().once retention.
 * Never imports application/index/config, server plugins, dotenv or paper runners.
 * Run each case in a NEW process with --expose-gc and Node filesystem permissions.
 * Does not write files: its single stdout JSON result is captured by the coordinator.
 * The fixed deadline bounds the explicitly authorized overnight investigation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ABSOLUTE_DEADLINE = Date.parse('2026-09-14T06:50:00.000Z');
const PINNED_VERSION = '0.2020.1241';
const PINNED_CORE_SHA256 = 'd5aab0391760193b07730f17f7231ad9cbefb481c4488c07e03e33e6b2ab3501';
const RSS_CEILING = 450 * 1024 * 1024;
const HEAP_CEILING = 330 * 1024 * 1024;
const writeResult = process.stdout.write.bind(process.stdout);
const writeProgress = process.stderr.write.bind(process.stderr);
const started = Date.now();
const startedMono = performance.now();
const require = createRequire(import.meta.url);
const corePath = fileURLToPath(new URL('../../../../../p2pclaw-main/node_modules/gun/gun.js', import.meta.url));
const packagePath = path.join(path.dirname(corePath), 'package.json');
const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const settings = { case: 'idle', papers: 266, tasks: 16, seed: 42, cycles: 16,
    intervalMs: 15000, settleMs: 500, warmupMs: 12000, cooldownMs: 12000 };
let finished = false;
let gun;
let monitor;
let deadlineTimer;
let fixture;
const samples = [];
const guard = { unexpectedModuleLoads: 0, blockedNetworkCalls: 0, blockedFsCalls: 0,
    coreLoaded: false, applicationModulesLoaded: false };
const observations = { roundsIssued: 0, paperCallbacks: 0, taskCallbacks: 0,
    lastRound: { papers: 0, tasks: 0 } };
const membership = { verified: new Set(), open: new Set() };
const membershipChecks = [];

function option(name) {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
}
const selectedCase = option('--case');
if (selectedCase) settings.case = selectedCase;
if (args.includes('--smoke')) Object.assign(settings, {
    cycles: 2, intervalMs: 250, settleMs: 150, warmupMs: 500, cooldownMs: 500,
});
if (!['idle', 'map-once', 'single-subscription'].includes(settings.case)) throw new Error('Invalid case');
if (args.some(arg => !['--case', '--smoke', 'idle', 'map-once', 'single-subscription'].includes(arg))) {
    throw new Error('Unsupported argument; experiment limits are fixed');
}
if (typeof global.gc !== 'function') throw new Error('Run with --expose-gc');
const plannedMs = settings.warmupMs + settings.cycles * settings.intervalMs
    + settings.settleMs + settings.cooldownMs + 5000;
if (Date.now() + plannedMs >= ABSOLUTE_DEADLINE) throw new Error('Overnight deadline would be exceeded');

const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const coreHash = crypto.createHash('sha256').update(fs.readFileSync(corePath)).digest('hex');
const harnessHash = crypto.createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex');
if (metadata.version !== PINNED_VERSION || coreHash !== PINNED_CORE_SHA256) {
    throw new Error('Gun core version/hash mismatch: review the dependency before running');
}

// The child process must not expose inherited configuration to this dependency.
// This does not enumerate, print or copy credential values.
process.env = Object.create(null);

// Defense in depth for a pinned, inspected dependency, NOT a hostile-code sandbox.
// Core gun.js bundles its own modules and needs no external require calls.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request !== corePath || guard.coreLoaded) {
        guard.unexpectedModuleLoads++;
        throw new Error('External module/plugin loading blocked by memory harness');
    }
    guard.coreLoaded = true;
    return originalLoad.call(this, request, parent, isMain);
};
const denyNetwork = () => { guard.blockedNetworkCalls++; throw new Error('Network disabled'); };
globalThis.fetch = denyNetwork;
globalThis.WebSocket = class { constructor() { denyNetwork(); } };
globalThis.XMLHttpRequest = class { constructor() { denyNetwork(); } };
const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(target, ...rest) {
    if (typeof target !== 'string' || path.resolve(target) !== path.resolve(corePath)) {
        guard.blockedFsCalls++;
        throw new Error('Filesystem access outside pinned module load blocked');
    }
    return originalReadFileSync.call(this, target, ...rest);
};
for (const name of ['readFile', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
    'createReadStream', 'createWriteStream', 'open', 'openSync', 'mkdir', 'mkdirSync',
    'rm', 'rmSync', 'unlink', 'unlinkSync', 'rename', 'renameSync', 'watch']) {
    fs[name] = () => { guard.blockedFsCalls++; throw new Error('Filesystem IO disabled'); };
}
for (const name of Object.keys(fs.promises)) {
    if (typeof fs.promises[name] === 'function') {
        fs.promises[name] = async () => { guard.blockedFsCalls++; throw new Error('Filesystem IO disabled'); };
    }
}
// Do not allow dependency diagnostics to print fixture content or internal objects.
for (const name of ['log', 'info', 'warn', 'error', 'debug']) console[name] = () => {};

function paperAt(i) {
    const id = `synthetic-paper-${String(i).padStart(4, '0')}`;
    const targetBytes = [4096, 8192, 16000][i % 3];
    let n = (settings.seed + i * 2654435761) >>> 0;
    let token = '';
    for (let j = 0; j < 64; j++) {
        n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
        token += String.fromCharCode(97 + n % 26);
    }
    const phrase = `Synthetic data only. Record ${id}. Seed ${settings.seed}. ${token} `;
    const content = phrase.repeat(Math.ceil(targetBytes / phrase.length)).slice(0, targetBytes);
    const record = { id, title: `Synthetic record ${i}`, status: 'VERIFIED', content, timestamp: 1700000000000 + i };
    if (Buffer.byteLength(JSON.stringify(record)) > 16 * 1024) throw new Error('Fixture record exceeds 16 KiB');
    return record;
}
function taskAt(i) {
    return { id: `synthetic-task-${String(i).padStart(4, '0')}`, status: 'OPEN', timestamp: 1700000000000 + i };
}
function seed() {
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for (let i = 0; i < settings.papers; i++) {
        const record = paperAt(i);
        const serialized = JSON.stringify(record);
        hash.update(serialized + '\n'); bytes += Buffer.byteLength(serialized);
        // Explicit souls/links avoid storage-dependent lookup of unknown nested
        // souls. The core-only harness deliberately has no persistence adapter.
        gun.get(record.id).put(record);
        gun.get('papers').put({ [record.id]: { '#': record.id } });
    }
    for (let i = 0; i < settings.tasks; i++) {
        const record = taskAt(i);
        hash.update(JSON.stringify(record) + '\n');
        gun.get(record.id).put(record);
        gun.get('tasks').put({ [record.id]: { '#': record.id } });
    }
    return { papers: settings.papers, tasks: settings.tasks, serializedPaperBytes: bytes,
        sha256: hash.digest('hex'), maxRecordBytes: 16 * 1024, executableContent: false };
}
function issueRead() {
    // Each invocation has independent counters, matching tauService's closure shape.
    // No fixture/data array is retained by the harness callback.
    const round = { papers: 0, tasks: 0 };
    observations.lastRound = round;
    observations.roundsIssued++;
    gun.get('papers').map().once(p => {
        if (p?.status === 'VERIFIED') { round.papers++; observations.paperCallbacks++; }
    });
    gun.get('tasks').map().once(t => {
        if (t?.status === 'OPEN') { round.tasks++; observations.taskCallbacks++; }
    });
}
function installSingleSubscriptions() {
    observations.roundsIssued++;
    gun.get('papers').map().on((paper, id) => {
        observations.paperCallbacks++;
        if (paper?.status === 'VERIFIED') membership.verified.add(id);
        else membership.verified.delete(id);
        observations.lastRound.papers = membership.verified.size;
    });
    gun.get('tasks').map().on((task, id) => {
        observations.taskCallbacks++;
        if (task?.status === 'OPEN') membership.open.add(id);
        else membership.open.delete(id);
        observations.lastRound.tasks = membership.open.size;
    });
}
async function verifyMembershipChanges() {
    // Run AFTER all comparable memory samples. Restore original data and links
    // before final integrity validation. This is synthetic in-memory data only.
    const check = (phase, papers, tasks) => {
        const actual = { phase, expectedPapers: papers, actualPapers: membership.verified.size,
            expectedTasks: tasks, actualTasks: membership.open.size };
        actual.valid = actual.expectedPapers === actual.actualPapers && actual.expectedTasks === actual.actualTasks;
        membershipChecks.push(actual);
        if (!actual.valid) throw new Error('Single-subscription membership update check failed: ' + phase);
    };
    const p0 = paperAt(0), p1 = paperAt(1), t0 = taskAt(0), t1 = taskAt(1);
    check('before_changes', settings.papers, settings.tasks);
    gun.get(p0.id).put({ status: 'REJECTED' });
    gun.get(t0.id).put({ status: 'CLOSED' });
    await sleep(500);
    check('status_changes', settings.papers - 1, settings.tasks - 1);
    gun.get('papers').put({ [p1.id]: null });
    gun.get('tasks').put({ [t1.id]: null });
    await sleep(500);
    check('removed_collection_links', settings.papers - 2, settings.tasks - 2);
    gun.get(p0.id).put(p0);
    gun.get(t0.id).put(t0);
    gun.get('papers').put({ [p1.id]: { '#': p1.id } });
    gun.get('tasks').put({ [t1.id]: { '#': t1.id } });
    await sleep(500);
    check('original_restored', settings.papers, settings.tasks);
}
function internalCounts() {
    const root = gun._;
    const stack = [root];
    const seen = new Set();
    const total = { graphNodes: Object.keys(root.graph || {}).length, chains: 0,
        anyCallbacks: 0, oneEntries: 0, completedOneMarkers: 0,
        eventListeners: 0, subscriptionArrayEntries: 0, duplicateTrackerEntries: Object.keys(root.dup?.s || {}).length };
    while (stack.length) {
        const at = stack.pop();
        if (!at || typeof at !== 'object' || seen.has(at)) continue;
        seen.add(at);
        if (seen.size > 20000) throw new Error('Instrumentation chain budget exceeded');
        total.chains++;
        const one = at.one && typeof at.one === 'object' ? Object.values(at.one) : [];
        total.oneEntries += one.length;
        total.completedOneMarkers += one.filter(v => v === '').length;
        total.anyCallbacks += Object.keys(at.any || {}).length;
        total.subscriptionArrayEntries += at.subs?.length || 0;
        for (const tag of Object.values(at.tag || {})) {
            const eventSeen = new Set();
            let event = tag?.to;
            while (event && event.the === tag && !eventSeen.has(event)) {
                eventSeen.add(event); total.eventListeners++; event = event.to;
                if (eventSeen.size > 20000) throw new Error('Instrumentation listener budget exceeded');
            }
        }
        for (const next of Object.values(at.next || {})) stack.push(next);
        if (at.each?._) stack.push(at.each._);
        // Echo entries are linked chain contexts in this pinned Gun version.
        for (const echo of Object.values(at.echo || {})) if (echo?.$?._ === echo) stack.push(echo);
    }
    total.paperMapCallbacks = Object.keys(root.next?.papers?.each?._?.any || {}).length;
    total.taskMapCallbacks = Object.keys(root.next?.tasks?.each?._?.any || {}).length;
    // Traversal-local references are dropped on return; samples store only numbers.
    return total;
}
function integrity() {
    const hash = crypto.createHash('sha256');
    let matches = 0;
    for (const [collection, count, make] of [['papers', settings.papers, paperAt], ['tasks', settings.tasks, taskAt]]) {
        for (let i = 0; i < count; i++) {
            const expected = make(i);
            const soul = gun._.graph[collection]?.[expected.id]?.['#'];
            const actual = gun._.graph[soul];
            if (!actual) return { valid: false, matchedRecords: matches, error: 'MISSING_GRAPH_RECORD' };
            const record = Object.fromEntries(Object.keys(expected).map(k => [k, actual[k]]));
            hash.update(JSON.stringify(record) + '\n');
            if (JSON.stringify(record) !== JSON.stringify(expected)) return { valid: false, matchedRecords: matches, error: 'DATA_CHANGED' };
            matches++;
        }
    }
    const finalHash = hash.digest('hex');
    return { valid: finalHash === fixture.sha256, matchedRecords: matches, sha256: finalHash };
}
function sample(phase, cycle) {
    global.gc();
    const memory = process.memoryUsage();
    if (memory.rss > RSS_CEILING || memory.heapUsed > HEAP_CEILING) return finish('MEMORY_LIMIT', 2);
    const counters = internalCounts();
    samples.push({ elapsedMs: Math.round(performance.now() - startedMono), phase, cycle,
        ...memory, ...counters, roundsIssued: observations.roundsIssued,
        paperCallbacks: observations.paperCallbacks, taskCallbacks: observations.taskCallbacks });
}
function finish(status, exitCode = 0, error = null) {
    if (finished) return;
    finished = true;
    clearInterval(monitor); clearTimeout(deadlineTimer);
    const result = { schema: 'p2pclaw.gun-memory.v1', status, error,
        startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedMono), node: process.version,
        v8: process.versions.v8, platform: process.platform,
        gun: { packageVersion: PINNED_VERSION, entry: 'gun/gun.js', coreSha256: coreHash,
            plugins: [], peers: 0, WebSocket: false, localStorage: false, radisk: false },
        harnessSha256: harnessHash, settings, fixture, guard,
        limits: { rssBytes: RSS_CEILING, postGcHeapBytes: HEAP_CEILING,
            absoluteDeadline: new Date(ABSOLUTE_DEADLINE).toISOString() },
        integrity: status === 'COMPLETED' ? integrity() : null,
        observations, membershipChecks, samples,
        caveats: ['Isolated Gun core; not full application, SEA, server plugins, disk or network.',
            'Counters traverse known Gun contexts, not an exhaustive V8 heap graph.',
            'GC is explicit at identical measurement points; only compare equivalent cases.',
            'JS IO guards are defense in depth for a pinned dependency, not a hostile-code sandbox.'] };
    if (status === 'COMPLETED' && !result.integrity.valid) { result.status = 'INTEGRITY_FAILED'; exitCode = 2; }
    writeResult(JSON.stringify(result) + '\n', () => process.exit(exitCode));
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

async function main() {
    const Gun = require(corePath);
    Gun.log.off = true;
    gun = Gun({ peers: [], WebSocket: false, localStorage: false, radisk: false,
        file: false, multicast: false, axe: false });
    guard.applicationModulesLoaded = Object.keys(require.cache).some(p =>
        p !== corePath && (p.includes('packages/api/src') || p.includes('/gun/lib/') || p.includes('\\gun\\lib\\')));
    if (guard.applicationModulesLoaded) throw new Error('Unexpected application/server module loaded');
    monitor = setInterval(() => {
        const memory = process.memoryUsage();
        if (memory.rss > RSS_CEILING) return finish('MEMORY_LIMIT', 2);
        if (memory.heapUsed > HEAP_CEILING) { global.gc(); if (process.memoryUsage().heapUsed > HEAP_CEILING) finish('MEMORY_LIMIT', 2); }
        if (Date.now() >= ABSOLUTE_DEADLINE) finish('DEADLINE', 2);
    }, 1000);
    deadlineTimer = setTimeout(() => finish('DEADLINE', 2), Math.min(plannedMs, ABSOLUTE_DEADLINE - Date.now()));
    fixture = seed();
    await sleep(250);
    // Materialize the same corpus: control/repeated have one warm-up once pair;
    // the proposed variant has only its one long-lived subscription pair.
    if (settings.case === 'single-subscription') installSingleSubscriptions();
    else issueRead();
    await sleep(settings.warmupMs);
    if (observations.lastRound.papers !== settings.papers || observations.lastRound.tasks !== settings.tasks) {
        sample('warmup_failed', 0);
        throw new Error('Warm-up did not observe the complete fixed corpus');
    }
    sample('baseline', 0);
    const cycleStart = performance.now();
    for (let cycle = 1; cycle <= settings.cycles; cycle++) {
        await sleep(cycleStart + cycle * settings.intervalMs - performance.now());
        if (finished) return;
        if (settings.case === 'map-once') issueRead();
        await sleep(settings.settleMs);
        sample('cycle', cycle);
        if (cycle % 4 === 0) writeProgress(JSON.stringify({ progress: settings.case, cycle,
            totalCycles: settings.cycles, postGcHeapBytes: samples.at(-1).heapUsed,
            oneEntries: samples.at(-1).oneEntries, anyCallbacks: samples.at(-1).anyCallbacks }) + '\n');
    }
    await sleep(settings.cooldownMs);
    sample('cooldown', settings.cycles);
    if (settings.case === 'single-subscription') await verifyMembershipChanges();
    finish('COMPLETED');
}
main().catch(error => finish('HARNESS_ERROR', 2, error.message));
