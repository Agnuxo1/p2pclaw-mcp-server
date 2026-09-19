import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { IsolateSandbox, SANDBOX_LIMITS } from '../../packages/api/src/services/IsolateSandbox.js';

const imageId = `sha256:${'a'.repeat(64)}`;
const configured = { SANDBOX_PYTHON_IMAGE: 'operator/science:tested', SANDBOX_JAVASCRIPT_IMAGE: 'operator/node:tested' };

function fakeDocker({ daemon = 'linux', missing = false, volumes = null, imageMissing = false, run, cleanup } = {}) {
    const calls = [];
    const spawnProcess = jest.fn((command, args, options) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = new EventEmitter();
        child.kill = jest.fn();
        const call = { command, args, options, child, input: null };
        calls.push(call);
        child.stdin.end = jest.fn(input => {
            call.input = input;
            queueMicrotask(() => {
                const complete = (stdout = '', exitCode = 0, stderr = '') => {
                    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
                    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
                    child.emit('close', exitCode);
                };
                if (missing) return child.emit('error', new Error('ENOENT'));
                if (args[0] === 'info') return complete(daemon);
                if (args[0] === 'image') return complete(imageMissing ? '' : JSON.stringify({ id: imageId, os: 'linux', volumes }), imageMissing ? 1 : 0);
                if (args[0] === 'rm') return cleanup ? cleanup(call, complete) : complete();
                if (args[0] === 'run') return run ? run(call, complete) : complete('42\n');
                throw new Error('Unexpected Docker command');
            });
        });
        return child;
    });
    return { calls, spawnProcess };
}

function subject(fake, env = configured) {
    return new IsolateSandbox('./unused-and-never-created', { spawnProcess: fake.spawnProcess, env });
}

describe('Docker-only sandbox admission', () => {
    test('construction/import does not start Docker or create files', () => {
        const fake = fakeDocker();
        subject(fake);
        expect(fake.spawnProcess).not.toHaveBeenCalled();
        const source = readFileSync(new URL('../../packages/api/src/services/IsolateSandbox.js', import.meta.url), 'utf8');
        expect(source).not.toMatch(/from ['"]node:(?:vm|fs)['"]|await sandbox\.init\(/);
    });

    test.each(['python', 'javascript'])('missing operator image fails closed for %s', async language => {
        const fake = fakeDocker();
        const result = await subject(fake, {}).execute('print(42)', { language, image: 'attacker/image' });
        expect(result).toMatchObject({ success: false, executed: false, error: 'SANDBOX_UNAVAILABLE', isolation: 'unavailable', stdout: '' });
        expect(fake.spawnProcess).not.toHaveBeenCalled();
    });

    test.each([{ missing: true }, { daemon: 'windows' }, { imageMissing: true }, { volumes: { '/data': {} } }])('Docker/image prerequisite failure does not execute code: %j', async setup => {
        const fake = fakeDocker(setup);
        const result = await subject(fake).execute('print(42)', { language: 'python' });
        expect(result.error).toBe('SANDBOX_UNAVAILABLE');
        expect(result.executed).toBe(false);
        expect(fake.calls.every(c => c.command === 'docker')).toBe(true);
        expect(fake.calls.some(c => c.args[0] === 'run')).toBe(false);
        expect(fake.calls.some(c => c.args.includes('pull'))).toBe(false);
    });

    test('invalid language and oversized code do not start a process', async () => {
        const fake = fakeDocker();
        const service = subject(fake);
        expect((await service.execute('echo test', { language: 'sh' })).error).toBe('UNSUPPORTED_LANGUAGE');
        expect((await service.execute('x'.repeat(SANDBOX_LIMITS.codeBytes + 1))).error).toBe('INVALID_CODE');
        expect(fake.spawnProcess).not.toHaveBeenCalled();
    });

    test('in-flight and cached prerequisite checks are shared', async () => {
        const fake = fakeDocker();
        const service = subject(fake);
        const results = await Promise.all([service.checkAvailability('python'), service.checkAvailability('python')]);
        expect(results.every(r => r.available)).toBe(true);
        await service.checkAvailability('python');
        expect(fake.calls.map(c => c.args[0])).toEqual(['info', 'image']);
    });
});

describe('bounded container lifecycle', () => {
    test.each(['python', 'javascript'])('uses immutable local image, stdin and fixed restrictions for %s', async language => {
        const fake = fakeDocker();
        const timer = jest.spyOn(global, 'setTimeout');
        try {
            const result = await subject(fake).execute('arbitrary code $() `literal`', {
                language, image: 'untrusted:latest', memory: '900g', cpus: '99', timeout: 999_999,
            });
            const call = fake.calls.find(c => c.args[0] === 'run');
            expect(result).toMatchObject({ success: true, executed: true, isolation: 'docker', stdout: '42\n' });
            expect(call.input).toBe('arbitrary code $() `literal`');
            expect(call.options).toMatchObject({ shell: false, windowsHide: true });
            expect(call.args).toEqual(expect.arrayContaining([
                '--pull=never', '--network=none', '--read-only', '--user=65534:65534',
                '--cap-drop=ALL', '--security-opt=no-new-privileges', '--ipc=none', '--log-driver=none',
                '--pids-limit', '64', '--memory', '512m', '--memory-swap', '--cpus', '0.5', imageId,
                '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777',
            ]));
            expect(call.args).not.toEqual(expect.arrayContaining(['-v', '--volume', '--privileged', 'untrusted:latest', '900g', '99']));
            expect(call.args.at(-1)).toBe('-');
            expect(call.args[call.args.indexOf('--entrypoint') + 1]).toBe(language === 'python' ? 'python3' : 'node');
            expect(timer.mock.calls.some(([, ms]) => ms === 60_000)).toBe(true);
            expect(fake.calls.at(-1).args).toEqual(['rm', '--force', call.args[call.args.indexOf('--name') + 1]]);
        } finally { timer.mockRestore(); }
    });

    test('nonzero code execution is not success', async () => {
        const fake = fakeDocker({ run: (_call, done) => done('', 1, 'Python error') });
        expect(await subject(fake).execute('raise Exception()', { language: 'python' }))
            .toMatchObject({ success: false, executed: true, isolation: 'docker', error: 'EXECUTION_FAILED', exitCode: 1 });
    });

    test('Docker launch failures are unavailable, not successful execution', async () => {
        const fake = fakeDocker({ run: (_call, done) => done('', 125, 'daemon failure') });
        expect(await subject(fake).execute('print(42)', { language: 'python' }))
            .toMatchObject({ success: false, executed: false, error: 'SANDBOX_UNAVAILABLE' });
        expect(fake.calls.at(-1).args[0]).toBe('rm');
    });

    test('timeout kills the CLI and removes the container before returning', async () => {
        const fake = fakeDocker({ run: () => {} });
        const result = await subject(fake).execute('while True: pass', { language: 'python', timeout: 5 });
        expect(result).toMatchObject({ success: false, error: 'TIMEOUT', executed: false, isolation: 'docker' });
        expect(fake.calls.find(c => c.args[0] === 'run').child.kill).toHaveBeenCalledWith('SIGKILL');
        expect(fake.calls.at(-1).args[0]).toBe('rm');
    });

    test('combined output is bounded and overflow triggers cleanup', async () => {
        const fake = fakeDocker({ run: (call, done) => {
            call.child.stdout.emit('data', Buffer.alloc(SANDBOX_LIMITS.outputBytes, 'a'));
            done('', 0, 'overflow');
        } });
        const result = await subject(fake).execute('print(42)', { language: 'python' });
        expect(result.error).toBe('OUTPUT_LIMIT');
        expect(result.success).toBe(false);
        expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBe(SANDBOX_LIMITS.outputBytes);
        expect(fake.calls.at(-1).args[0]).toBe('rm');
    });

    test('two slots are shared across service instances and released after cleanup', async () => {
        const held = [];
        const fake = fakeDocker({ run: (_call, done) => held.push(done) });
        const a = subject(fake);
        const b = subject(fake);
        const first = a.execute('print(1)', { language: 'python' });
        const second = b.execute('print(2)', { language: 'python' });
        const busy = await a.execute('print(3)', { language: 'python' });
        expect(busy).toMatchObject({ success: false, executed: false, error: 'SANDBOX_BUSY', isolation: 'unavailable' });
        await new Promise(resolve => setImmediate(resolve));
        expect(held).toHaveLength(2);
        held.forEach(done => done('ok'));
        await Promise.all([first, second]);
        const nextFake = fakeDocker();
        expect((await subject(nextFake).execute('print(4)', { language: 'python' })).success).toBe(true);
    });

    test('already auto-removed container is a successful cleanup', async () => {
        const fake = fakeDocker({ cleanup: (_call, done) => done('', 1, 'Error response from daemon: No such container: sandbox') });
        expect((await subject(fake).execute('print(42)', { language: 'python' })).success).toBe(true);
    });

    test('an aborted Docker client plus no-such-container is uncertain, not confirmed cleanup', async () => {
        // Separate module state: this failure intentionally latches that process.
        await jest.isolateModulesAsync(async () => {
            const { IsolateSandbox: FreshSandbox } = await import('../../packages/api/src/services/IsolateSandbox.js');
            const fake = fakeDocker({
                run: () => {},
                cleanup: (_call, done) => done('', 1, 'Error response from daemon: No such container: sandbox'),
            });
            const isolated = new FreshSandbox(undefined, { spawnProcess: fake.spawnProcess, env: configured });
            const result = await isolated.execute('while True: pass', { language: 'python', timeout: 5 });
            expect(result).toMatchObject({ success: false, executed: false, error: 'SANDBOX_CLEANUP_FAILED' });
            const calls = fake.calls.length;
            expect((await isolated.execute('print(42)', { language: 'python' })).error).toBe('SANDBOX_UNAVAILABLE');
            expect(fake.calls).toHaveLength(calls);
        });
    });

    // Keep last: an uncertain cleanup intentionally latches the process closed.
    test('failed cleanup blocks further jobs rather than accumulating containers', async () => {
        const fake = fakeDocker({ cleanup: (_call, done) => done('', 1, 'Cannot connect to Docker daemon') });
        const result = await subject(fake).execute('print(42)', { language: 'python' });
        expect(result).toMatchObject({ success: false, error: 'SANDBOX_CLEANUP_FAILED' });
        const another = fakeDocker();
        expect((await subject(another).execute('print(43)', { language: 'python' })).error).toBe('SANDBOX_UNAVAILABLE');
        expect(another.spawnProcess).not.toHaveBeenCalled();
    });
});
