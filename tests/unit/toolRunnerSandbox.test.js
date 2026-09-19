import { jest } from '@jest/globals';
import { sandbox } from '../../packages/api/src/services/IsolateSandbox.js';
import { runPythonTool, checkPythonAvailable, verifyPaperCode, extractCodeBlocks, buildPythonWrapper } from '../../packages/api/src/services/toolRunner.js';
import { getHashCount, generateExecutionHash, verifyExecutionHash } from '../../packages/api/src/services/executionHashService.js';

const wrappedResult = (success = true) => ({ success: true, executed: true, isolation: 'docker', exitCode: 0,
    stdout: JSON.stringify({ success, stdout: '42\n', stderr: success ? '' : 'Python exception', result: null }), stderr: '' });

afterEach(() => jest.restoreAllMocks());

test('Python availability checks the sandbox daemon and image, never host Python', async () => {
    const check = jest.spyOn(sandbox, 'checkAvailability').mockResolvedValue({ available: false });
    expect(await checkPythonAvailable()).toBe(false);
    expect(check).toHaveBeenCalledWith('python');
    check.mockResolvedValue({ available: true });
    expect(await checkPythonAvailable()).toBe(true);
});

test('code reaches only the Docker wrapper and success gets a stored execution hash', async () => {
    const execute = jest.spyOn(sandbox, 'execute').mockResolvedValue(wrappedResult());
    const code = 'print(42) # successful isolated test';
    const result = await runPythonTool(code, { timeout: 999999, domain: 'mathematics', tool: 'sympy' });
    expect(execute).toHaveBeenCalledWith(buildPythonWrapper(code), { language: 'python', timeout: 60000 });
    expect(result).toMatchObject({ success: true, executed: true, isolation: 'docker', stdout: '42\n', tool: 'sympy' });
    expect(result.execution_hash).toBe(generateExecutionHash(code, '42\n'));
    expect((await verifyExecutionHash(result.execution_hash)).valid).toBe(true);
});

test.each(['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'TIMEOUT', 'OUTPUT_LIMIT', 'SANDBOX_CLEANUP_FAILED'])('failure %s cannot create a hash or parse spoofed success output', async error => {
    const count = getHashCount();
    jest.spyOn(sandbox, 'execute').mockResolvedValue({ ...wrappedResult(), success: false, executed: false, error, isolation: 'unavailable' });
    const result = await runPythonTool('print(42)');
    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.execution_hash).toBeNull();
    expect(getHashCount()).toBe(count);
});

test.each([
    { ...wrappedResult(), isolation: 'vm' },
    { ...wrappedResult(), executed: false },
    { ...wrappedResult(), stdout: 'raw text without wrapper JSON' },
    { ...wrappedResult(), stdout: JSON.stringify({ success: 'yes', stdout: '', stderr: '' }) },
    wrappedResult(false),
])('only strict successful confirmed Docker results are hashed: %j', async execution => {
    const count = getHashCount();
    jest.spyOn(sandbox, 'execute').mockResolvedValue(execution);
    const result = await runPythonTool('print(42)');
    expect(result.success).toBe(false);
    expect(result.execution_hash).toBeNull();
    expect(getHashCount()).toBe(count);
});

test('invalid and oversized raw Python code is rejected before wrapping', async () => {
    const execute = jest.spyOn(sandbox, 'execute');
    expect((await runPythonTool('x'.repeat(128 * 1024 + 1))).error).toBe('INVALID_CODE');
    expect((await runPythonTool(null)).executed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
});

test('Python source is encoded as data rather than interpolated into wrapper indentation', () => {
    const code = 'print("quotes \\\" and newline")\nraise SystemExit(0)';
    const wrapper = buildPythonWrapper(code);
    expect(wrapper).toContain(Buffer.from(code).toString('base64'));
    expect(wrapper).toContain('except BaseException:');
    expect(wrapper).not.toContain(code);
});

test('paper extraction remains compatible and stops after sandbox admission failure', async () => {
    const paper = 'Intro\n```python\nprint("a sufficiently long first block")\n```\n\n```sympy\nprint("a sufficiently long second block")\n```';
    expect(extractCodeBlocks(paper).map(b => b.language)).toEqual(['python', 'sympy']);
    const execute = jest.spyOn(sandbox, 'execute').mockResolvedValue({ success: false, executed: false,
        error: 'SANDBOX_BUSY', isolation: 'unavailable', stdout: '', stderr: 'Both slots are in use.' });
    expect(await verifyPaperCode(paper, 'mathematics')).toMatchObject({
        success: false, error: 'SANDBOX_BUSY', isolation: 'unavailable', executed: false,
        blocks_found: 2, blocks_failed: 1, blocks_verified: 0, blocks_skipped: 1,
    });
    expect(execute).toHaveBeenCalledTimes(1);
});
