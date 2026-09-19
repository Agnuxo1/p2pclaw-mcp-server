import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import { sandboxHttpStatus } from '../../packages/api/src/utils/sandboxHttpStatus.js';

describe('sandbox admission HTTP contract', () => {
    test('unavailable isolation is a retryable service failure', () => {
        expect(sandboxHttpStatus({ success: false, error: 'SANDBOX_UNAVAILABLE', isolation: 'unavailable' })).toBe(503);
    });

    test('unconfirmed cleanup is a service failure even after code ran', () => {
        expect(sandboxHttpStatus({ executed: true, success: false, error: 'SANDBOX_CLEANUP_FAILED', isolation: 'docker' })).toBe(503);
    });

    test('saturated execution capacity is rate limited', () => {
        expect(sandboxHttpStatus({ success: false, error: 'SANDBOX_BUSY', isolation: 'unavailable' })).toBe(429);
    });

    test.each([
        { success: true, isolation: 'docker' },
        { success: false, error: 'TIMEOUT', isolation: 'docker' },
        { success: false, exitCode: 1, isolation: 'docker' },
        { blocks_found: 0, results: [] },
    ])('completed execution/verification keeps its existing response semantics: %j', result => {
        expect(sandboxHttpStatus(result)).toBe(200);
    });
});

// Evaluate only a trusted, local route registration with injected dependencies.
// Importing the entire application would erase radata and launch remote jobs.
function routeHandler(route, dependencies) {
    const source = readFileSync(new URL('../../packages/api/src/index.js', import.meta.url), 'utf8');
    const start = Math.max(source.indexOf(`app.post('${route}',`), source.indexOf(`app.post("${route}",`));
    const end = source.indexOf('\n});', start) + '\n});'.length;
    if (start < 0 || end <= start) throw new Error(`Route not found: ${route}`);
    let handler;
    runInNewContext(source.slice(start, end), {
        app: { post: (_path, callback) => { handler = callback; } },
        sandboxHttpStatus,
        console: { log() {} },
        ...dependencies,
    });
    return handler;
}

function response() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('isolated lab HTTP handlers', () => {
    test.each(['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'SANDBOX_CLEANUP_FAILED'])('does not reward admission or cleanup failure: %s', error => {
        const execute = jest.fn().mockResolvedValue({ success: false, error, isolation: 'unavailable', stdout: '', stderr: '' });
        const updateTau = jest.fn();
        const handler = routeHandler('/lab/run-experiment', { isolateSandbox: { execute }, tauCoordinator: { updateTau } });
        const res = response();
        return handler({ body: { code: 'console.log(42)', agentId: 'fixture-agent' } }, res).then(() => {
            expect(res.status).toHaveBeenCalledWith(error === 'SANDBOX_BUSY' ? 429 : 503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error, isolation: 'unavailable' }));
            expect(updateTau).not.toHaveBeenCalled();
            expect(execute).toHaveBeenCalledWith('console.log(42)', expect.objectContaining({ language: 'javascript' }));
        });
    });

    test('preserves a successful isolated experiment and its work credit', async () => {
        const execute = jest.fn().mockResolvedValue({ executed: true, success: true, isolation: 'docker', stdout: '42', stderr: '', exitCode: 0 });
        const updateTau = jest.fn();
        const handler = routeHandler('/lab/run-experiment', { isolateSandbox: { execute }, tauCoordinator: { updateTau } });
        const res = response();
        await handler({ body: { code: 'console.log(42)', agentId: 'fixture-agent' } }, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, isolation: 'docker', stdout: '42' }));
        expect(updateTau).toHaveBeenCalledTimes(1);
    });

    test.each([false, undefined])('never infers execution from Docker isolation when executed=%s', async executed => {
        const execute = jest.fn().mockResolvedValue({ executed, success: false, isolation: 'docker', error: 'TIMEOUT', stdout: '', stderr: '' });
        const updateTau = jest.fn();
        const handler = routeHandler('/lab/run-experiment', { isolateSandbox: { execute }, tauCoordinator: { updateTau } });
        const res = response();
        await handler({ body: { code: 'console.log(42)', agentId: 'fixture-agent' } }, res);
        expect(updateTau).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, executed: false, isolation: 'docker' }));
    });

    test('does not reward an executed job whose cleanup failed', async () => {
        const execute = jest.fn().mockResolvedValue({ executed: true, success: false, isolation: 'docker', error: 'SANDBOX_CLEANUP_FAILED', stdout: '42' });
        const updateTau = jest.fn();
        const handler = routeHandler('/lab/run-experiment', { isolateSandbox: { execute }, tauCoordinator: { updateTau } });
        const res = response();
        await handler({ body: { code: 'console.log(42)', agentId: 'fixture-agent' } }, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(updateTau).not.toHaveBeenCalled();
    });

    test.each(['/lab/run', '/lab/verify-paper'])('reports missing isolated Python before executing %s', async route => {
        const runPythonTool = jest.fn();
        const verifyPaperCode = jest.fn();
        const handler = routeHandler(route, { checkPythonAvailable: async () => false, runPythonTool, verifyPaperCode });
        const res = response();
        await handler({ body: { code: 'print(12345)', content: 'Paper content '.repeat(10) } }, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'SANDBOX_UNAVAILABLE', isolation: 'unavailable' }));
        expect(runPythonTool).not.toHaveBeenCalled();
        expect(verifyPaperCode).not.toHaveBeenCalled();
    });

    test.each(['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'SANDBOX_CLEANUP_FAILED'])('propagates a service failure during paper verification: %s', async error => {
        const verifyPaperCode = jest.fn().mockResolvedValue({ error, isolation: 'unavailable', blocks_verified: 0, results: [] });
        const handler = routeHandler('/lab/verify-paper', {
            checkPythonAvailable: async () => true,
            detectDomain: () => ({ domain: 'mathematics' }),
            verifyPaperCode,
        });
        const res = response();
        await handler({ body: { content: 'Paper content '.repeat(10) } }, res);
        expect(res.status).toHaveBeenCalledWith(error === 'SANDBOX_BUSY' ? 429 : 503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error }));
    });
});

function labCodeHandler(execute, codeExecutionLog) {
    const source = readFileSync(new URL('../../packages/api/src/routes/labRoutes.js', import.meta.url), 'utf8');
    const start = source.indexOf("router.post('/run-code',");
    const end = source.indexOf('\n});', start) + '\n});'.length;
    let handler;
    runInNewContext(source.slice(start, end), {
        router: { post: (_path, callback) => { handler = callback; } },
        executionSandbox: { execute }, sandboxHttpStatus, codeExecutionLog, crypto,
    });
    return handler;
}

describe('legacy /lab/run-code with Docker-only execution', () => {
    test.each([
        ['SANDBOX_UNAVAILABLE', 503, false, 'unavailable'],
        ['SANDBOX_BUSY', 429, false, 'unavailable'],
        ['SANDBOX_CLEANUP_FAILED', 503, true, 'docker'],
        ['TIMEOUT', 200, false, 'docker'],
        ['EXECUTION_FAILED', 200, true, 'docker'],
    ])('does not mint evidence for %s', async (error, status, executed, isolation) => {
        const execute = jest.fn().mockResolvedValue({ success: false, executed, error, isolation, stdout: '', stderr: '' });
        const records = new Map();
        const res = response();
        await labCodeHandler(execute, records)({ body: { code: 'throw new Error("fixture");' } }, res);
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error, execution_hash: null, isolation }));
        expect(records.size).toBe(0);
    });

    test('preserves the successful hash lookup contract and bounds timeout', async () => {
        const code = 'console.log(42);';
        const execute = jest.fn().mockResolvedValue({ executed: true, success: true, isolation: 'docker', stdout: '42\n', stderr: '', exitCode: 0 });
        const records = new Map();
        const res = response();
        await labCodeHandler(execute, records)({ body: { code, timeout: 120000 } }, res);
        const hash = crypto.createHash('sha256').update(code + '42\n').digest('hex');
        expect(execute).toHaveBeenCalledWith(expect.stringContaining(code), { language: 'javascript', timeout: 5000 });
        expect(records.has(hash)).toBe(true);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, executed: true, isolation: 'docker', execution_hash: `sha256:${hash}`, verify_endpoint: `GET /lab/verify-execution?hash=sha256:${hash}` }));
    });

    test('does not mint evidence if the sandbox reports success without executed=true', async () => {
        const execute = jest.fn().mockResolvedValue({ success: true, isolation: 'docker', stdout: '42' });
        const records = new Map();
        const res = response();
        await labCodeHandler(execute, records)({ body: { code: 'console.log(42);' } }, res);
        expect(records.size).toBe(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, executed: false, execution_hash: null }));
    });

    test.each(['vm', 'unavailable', undefined])('does not mint evidence for success and executed=true without Docker isolation: %s', async isolation => {
        const execute = jest.fn().mockResolvedValue({ success: true, executed: true, isolation, stdout: '42' });
        const records = new Map();
        const res = response();
        await labCodeHandler(execute, records)({ body: { code: 'console.log(42);' } }, res);
        expect(records.size).toBe(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, execution_hash: null }));
    });

    test('runtime exceptions become unavailable without evaluating source locally', async () => {
        const execute = jest.fn().mockRejectedValue(new Error('fixture runtime failure'));
        const records = new Map();
        const res = response();
        await labCodeHandler(execute, records)({ body: { code: 'throw new Error("must not run here");' } }, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(records.size).toBe(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ executed: false, error: 'SANDBOX_UNAVAILABLE', execution_hash: null }));
    });
});
