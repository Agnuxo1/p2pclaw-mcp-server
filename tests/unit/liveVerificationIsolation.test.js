import { jest } from '@jest/globals';

const execute = jest.fn();
const runPythonTool = jest.fn();
const checkPythonAvailable = jest.fn();
jest.unstable_mockModule('../../packages/api/src/services/IsolateSandbox.js', () => ({ sandbox: { execute } }));
jest.unstable_mockModule('../../packages/api/src/services/toolRunner.js', () => ({ runPythonTool, checkPythonAvailable }));
const { executeCodeBlocks, verificationToAdjustments } = await import('../../packages/api/src/services/liveVerificationService.js');

beforeEach(() => { jest.clearAllMocks(); });

test('unavailable JS runtime cannot execute code on host or award a bonus', async () => {
    execute.mockResolvedValue({ executed: false, success: false, error: 'SANDBOX_UNAVAILABLE', isolation: 'unavailable' });
    const result = await executeCodeBlocks('```javascript\nconsole.log("fixture");\n```');
    expect(execute).toHaveBeenCalledWith('console.log("fixture");', { language: 'javascript', timeout: 5000 });
    expect(result).toMatchObject({ executed: 0, passed: 0, failed: 0 });
    expect(result.results[0]).toMatchObject({ executed: false, execution_hash: null, isolation: 'unavailable' });
    expect(verificationToAdjustments({ code_execution: result }).bonuses).toEqual({});
});

test('completed isolated JS execution is recorded with a hash', async () => {
    execute.mockResolvedValue({ executed: true, success: true, stdout: 'fixture\n', isolation: 'docker' });
    const result = await executeCodeBlocks('```js\nconsole.log("fixture");\n```');
    expect(result).toMatchObject({ executed: 1, passed: 1, failed: 0 });
    expect(result.results[0].execution_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
});

test('runtime failure is distinct from a failed code execution', async () => {
    execute.mockResolvedValue({ executed: true, success: false, error: 'TIMEOUT', isolation: 'docker' });
    const result = await executeCodeBlocks('```js\nwhile (true) {}\n```');
    expect(result).toMatchObject({ executed: 1, passed: 0, failed: 1 });
    expect(result.results[0].execution_hash).toBeNull();
});

test('busy Python runtime is not treated as executed after availability check', async () => {
    checkPythonAvailable.mockResolvedValue(true);
    runPythonTool.mockResolvedValue({ executed: false, success: false, error: 'SANDBOX_BUSY', isolation: 'unavailable' });
    const result = await executeCodeBlocks('```python\nprint("fixture")\n```');
    expect(result).toMatchObject({ executed: 0, passed: 0, failed: 0 });
    expect(result.results[0]).toMatchObject({ error: 'SANDBOX_BUSY', execution_hash: null });
});

test('Python unavailable retains only static analysis', async () => {
    checkPythonAvailable.mockResolvedValue(false);
    const result = await executeCodeBlocks('```python\nprint("fixture")\n```');
    expect(runPythonTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({ executed: 0, passed: 0 });
    expect(result.results[0].static_analysis).toBeDefined();
});

test.each(['vm', 'unavailable', undefined])('JS rejects successful results without Docker isolation: %s', async isolation => {
    execute.mockResolvedValue({ executed: true, success: true, stdout: 'fixture', isolation });
    const result = await executeCodeBlocks('```js\nconsole.log("fixture");\n```');
    expect(result).toMatchObject({ executed: 0, passed: 0, failed: 0 });
    expect(result.results[0].execution_hash).toBeNull();
    expect(verificationToAdjustments({ code_execution: result }).bonuses).toEqual({});
});

test.each(['host', 'unavailable', undefined])('Python rejects receipts without Docker isolation: %s', async isolation => {
    checkPythonAvailable.mockResolvedValue(true);
    runPythonTool.mockResolvedValue({ executed: true, success: true, stdout: 'fixture', execution_hash: 'claimed', isolation });
    const result = await executeCodeBlocks('```python\nprint("fixture")\n```');
    expect(result).toMatchObject({ executed: 0, passed: 0, failed: 0 });
    expect(result.results[0].execution_hash).toBeNull();
});

test('Python runtime errors expose neither details nor execution evidence', async () => {
    checkPythonAvailable.mockRejectedValue(new Error('private runtime diagnostic'));
    const result = await executeCodeBlocks('```python\nprint("fixture")\n```');
    expect(result.results[0]).toMatchObject({ error: 'SANDBOX_UNAVAILABLE', executed: false,
        execution_hash: null, isolation: 'unavailable', runtime: 'static-analysis-only' });
    expect(JSON.stringify(result)).not.toContain('private runtime diagnostic');
});
