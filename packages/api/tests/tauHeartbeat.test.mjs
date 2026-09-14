import test from 'node:test';
import assert from 'node:assert/strict';
import { createTauHeartbeat } from '../src/services/tauHeartbeat.js';

function fixture() {
    const listeners = new Map(), timers = [], proposals = [];
    let mapped = 0;
    const db = { get(name) {
        return {
            map() { mapped++; return this; },
            on(fn) {
                assert.equal(listeners.has(name), false, `Duplicate subscription: ${name}`);
                listeners.set(name, fn);
            },
            once() { assert.fail('No repeated once subscriptions'); },
            off() { assert.fail('No shared chain off'); },
            put(value, acknowledge) { proposals.push({ value, acknowledge }); },
        };
    } };
    const heartbeat = createTauHeartbeat({ db, now: () => 123456,
        encode: value => ({ ...value, encoded: true }),
        setIntervalImpl(fn, delay) { assert.equal(delay, 15000); timers.push(fn); },
    });
    const emit = (name, value, id) => listeners.get(name)(value, id);
    const paper = (id, status = 'VERIFIED') => emit('p2pclaw_papers_v4', status === null ? null : { status }, id);
    const task = (id, status = 'OPEN') => emit('swarm_tasks', status === null ? null : { status }, id);
    return { heartbeat, listeners, timers, proposals, paper, task,
        network: value => emit('global_heartbeat', value), tick: () => timers[0](),
        mapCount: () => mapped,
    };
}

test('construction is inert; initialization and 1000 ticks never add subscriptions', () => {
    const h = fixture();
    assert.equal(h.listeners.size, 0); assert.equal(h.timers.length, 0);
    h.heartbeat.initialize(); h.heartbeat.initialize();
    for (let i = 0; i < 1000; i++) h.tick();
    assert.equal(h.listeners.size, 3); assert.equal(h.mapCount(), 2);
    assert.equal(h.timers.length, 1); assert.equal(h.proposals.length, 0);
});

test('counts unique collection keys, not duplicate Gun callbacks', () => {
    const h = fixture(); h.heartbeat.initialize();
    for (let i = 0; i < 8; i++) { h.paper(`p-${i}`); h.paper(`p-${i}`); }
    h.task('t-0'); h.task('t-1'); h.task('t-1');
    h.paper('_'); h.paper(undefined); h.paper(42); h.tick();
    assert.equal(h.proposals.length, 1);
    assert.deepEqual(h.proposals[0].value, {
        tau_index: 1, maturity_index: 10, timestamp: 123456, proposer: 'API_NODE_1', encoded: true,
    });
    h.proposals[0].acknowledge({ ok: 1 });
    assert.equal(h.heartbeat.getCurrentTau(), 1);
    h.tick(); assert.equal(h.proposals.length, 1);
});

test('status changes and tombstones remove IDs; reactivation restores them once', () => {
    const h = fixture(); h.heartbeat.initialize();
    for (let i = 0; i < 9; i++) h.paper(`p-${i}`);
    h.task('t'); h.paper('p-0', 'REJECTED'); h.task('t', 'CLOSED');
    h.tick(); assert.equal(h.proposals.length, 0);
    h.paper('p-0'); h.task('t'); h.paper('p-1', null);
    h.tick(); assert.equal(h.proposals.length, 0);
    h.paper('p-1'); h.tick();
    assert.equal(h.proposals[0].value.maturity_index, 10);
    h.proposals[0].acknowledge({ ok: 1 });
    for (let i = 0; i < 9; i++) h.paper(`p-${i}`, null);
    h.task('t', null); h.tick();
    assert.equal(h.heartbeat.getCurrentTau(), 1, 'Era must never decrease');
    assert.equal(h.proposals.length, 1);
});

test('collection keys remain distinct across papers and tasks', () => {
    const h = fixture(); h.heartbeat.initialize();
    for (let i = 0; i < 5; i++) { h.paper(`id-${i}`); h.task(`id-${i}`); }
    h.tick(); assert.equal(h.proposals[0].value.maturity_index, 10);
});

test('remote era is monotonic and accepts only safe integer indices', () => {
    const h = fixture(); h.heartbeat.initialize(); h.network({ tau_index: 5 });
    for (const tau_index of [4, -1, Infinity, NaN, '99', 1.5, Number.MAX_SAFE_INTEGER + 1]) h.network({ tau_index });
    h.network(null); h.network({}); assert.equal(h.heartbeat.getCurrentTau(), 5);
    for (let i = 0; i < 10; i++) h.paper(`p-${i}`);
    h.tick(); assert.equal(h.proposals.length, 0);
});

test('failed/missing acknowledgements do not advance era; next tick can retry', () => {
    const h = fixture(); h.heartbeat.initialize();
    for (let i = 0; i < 10; i++) h.paper(`p-${i}`);
    h.tick(); h.proposals[0].acknowledge({ err: 'fixture' });
    assert.equal(h.heartbeat.getCurrentTau(), 0);
    h.tick(); h.proposals[1].acknowledge(undefined);
    assert.equal(h.heartbeat.getCurrentTau(), 0);
    h.tick(); h.proposals[2].acknowledge({ ok: 1 });
    assert.equal(h.heartbeat.getCurrentTau(), 1);
});

test('late acknowledgements cannot undo a newer remote or local era', () => {
    const h = fixture(); h.heartbeat.initialize();
    for (let i = 0; i < 20; i++) h.paper(`p-${i}`);
    h.tick();
    for (let i = 0; i < 10; i++) h.paper(`p-${i}`, null);
    h.tick();
    h.proposals[0].acknowledge({ ok: 1 }); h.proposals[1].acknowledge({ ok: 1 });
    assert.equal(h.heartbeat.getCurrentTau(), 2);
    h.network({ tau_index: 9 }); h.proposals[0].acknowledge({ ok: 1 });
    assert.equal(h.heartbeat.getCurrentTau(), 9);
});
