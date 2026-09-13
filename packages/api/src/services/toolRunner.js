/**
 * Scientific Python execution through the Docker-only IsolateSandbox.
 * The wrapper formats output; it is not a security boundary. No host execution.
 */
import { sandbox, SANDBOX_LIMITS } from './IsolateSandbox.js';
import { generateExecutionHash, storeExecutionHash } from './executionHashService.js';

const DEFAULT_TIMEOUT = 60_000;
const MAX_PYTHON_CODE_BYTES = 128 * 1024; // Leave room for the base64 wrapper.
const MAX_STDOUT = 50_000;
const MAX_STDERR = 10_000;

// Package discovery catalog only, NOT an import whitelist or security boundary.
const ALLOWED_IMPORTS = {
    // Universal (all domains) — includes stdlib modules needed by scientific packages
    _universal: [
        'json', 'math', 'sys', 'os', 'io', 're', 'hashlib', 'decimal',
        'fractions', 'statistics', 'collections', 'itertools', 'functools',
        'numpy', 'scipy', 'pandas', 'matplotlib', 'csv', 'datetime',
        // Stdlib modules commonly imported by scientific packages
        'abc', 'array', 'ast', 'base64', 'binascii', 'bisect', 'builtins',
        'calendar', 'codecs', 'contextlib', 'copy', 'copyreg', 'ctypes',
        'dataclasses', 'difflib', 'dis', 'email', 'encodings', 'enum',
        'errno', 'fnmatch', 'gc', 'gettext', 'glob', 'gzip', 'heapq',
        'html', 'http', 'importlib', 'inspect', 'keyword', 'linecache',
        'locale', 'logging', 'lzma', 'mmap', 'numbers', 'operator',
        'pathlib', 'pickle', 'pkgutil', 'platform', 'pprint', 'posixpath',
        'queue', 'random', 'reprlib', 'select', 'selectors', 'shutil',
        'signal', 'site', 'socket', 'sre_compile', 'sre_constants', 'sre_parse',
        'string', 'struct', 'textwrap', 'threading', 'time', 'token', 'tokenize',
        'traceback', 'types', 'typing', 'unicodedata', 'unittest', 'urllib',
        'uuid', 'warnings', 'weakref', 'xml', 'zipfile', 'zipimport', 'zlib',
        // Commonly needed by numpy/scipy/pandas
        'concurrent', 'multiprocessing', 'tempfile', 'configparser',
        'ntpath', 'posixpath', 'genericpath', 'stat'
    ],
    physics: [
        'sympy', 'astropy', 'pyhf', 'qiskit', 'qutip', 'pennylane',
        'einsteinpy', 'dedalus', 'tenpy'
    ],
    chemistry: [
        'rdkit', 'Chem', 'pyscf', 'ase', 'openbabel', 'cclib', 'selfies', 'mordred',
        'pubchempy', 'thermo', 'CoolProp', 'cantera', 'chemprop',
        'deepchem', 'xtb'
    ],
    materials: [
        'pymatgen', 'ase', 'matminer', 'pycalphad'
    ],
    biology: [
        'Bio', 'biopython', 'biotite', 'prody', 'networkx', 'statsmodels',
        'rdkit', 'MDAnalysis', 'scanpy', 'sklearn', 'scikit_bio',
        'Chem'  // rdkit.Chem
    ],
    mathematics: [
        'sympy', 'z3', 'networkx', 'cvxpy', 'sage'
    ]
};

// The container limits memory, network, processes and runtime. This wrapper only
// captures bounded text and reports Python exceptions in the existing JSON shape.
export function buildPythonWrapper(code) {
    const encoded = Buffer.from(code, 'utf8').toString('base64');
    return [
        'import sys, io, json, traceback, base64',
        'class _BoundedCapture(io.TextIOBase):',
        '    def __init__(self, limit):',
        '        self.limit, self.size, self.parts = limit, 0, []',
        '    def write(self, text):',
        '        remaining = max(0, self.limit - self.size)',
        '        self.parts.append(text[:remaining])',
        '        self.size += len(text)',
        '        if self.size > self.limit:',
        '            raise RuntimeError("OUTPUT_LIMIT")',
        '        return len(text)',
        '    def flush(self): pass',
        '    def getvalue(self): return "".join(self.parts)',
        '_out, _err = _BoundedCapture(50000), _BoundedCapture(10000)',
        '_output = {"success": False, "stdout": "", "stderr": "", "result": None}',
        'sys.stdout, sys.stderr = _out, _err',
        'try:',
        '    _scope = {"__name__": "__main__"}',
        '    exec(compile(base64.b64decode("' + encoded + '"), "<paper>", "exec"), _scope)',
        '    _output["success"] = True',
        'except BaseException:',
        '    _output["stderr"] = traceback.format_exc()[:10000]',
        'finally:',
        '    sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__',
        '    _output["stdout"] = _out.getvalue()',
        '    _output["stderr"] = _output["stderr"] or _err.getvalue()',
        '    print(json.dumps(_output))',
        '',
    ].join('\n');
}

/**
 * Preserve the tool-runner response fields, but only hash successful Docker runs.
 * Domain selects the package discovery catalog; packages must exist in the image.
 */
export async function runPythonTool(code, opts = {}) {
    const { domain = 'mathematics', timeout = DEFAULT_TIMEOUT, tool = 'unknown' } = opts;
    const start = Date.now();
    let execution;
    const metadata = () => ({ elapsed_ms: Date.now() - start, tool, execution_hash: null });
    if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > MAX_PYTHON_CODE_BYTES) {
        return { success: false, executed: false, isolation: 'unavailable', error: 'INVALID_CODE',
            stdout: '', stderr: 'Python code must be a nonempty string of at most 128 KiB.', ...metadata() };
    }
    try {
        execution = await sandbox.execute(buildPythonWrapper(code), {
            language: 'python',
            timeout: Number.isFinite(timeout) && timeout > 0
                ? Math.min(timeout, SANDBOX_LIMITS.timeoutMs) : DEFAULT_TIMEOUT,
        });
        if (!execution.success) return { ...execution, result: null, ...metadata() };
        if (execution.isolation !== 'docker' || execution.executed !== true) {
            return { success: false, executed: false, error: 'SANDBOX_UNAVAILABLE', isolation: 'unavailable',
                stdout: '', stderr: 'Isolated execution was not confirmed.', ...metadata() };
        }
        let parsed;
        try {
            const lastLine = execution.stdout.trim().split('\n').pop();
            parsed = JSON.parse(lastLine);
            if (typeof parsed?.success !== 'boolean' || typeof parsed.stdout !== 'string'
                || typeof parsed.stderr !== 'string' || parsed.stdout.length > MAX_STDOUT
                || parsed.stderr.length > MAX_STDERR) throw new Error('invalid wrapper output');
        } catch {
            return { success: false, executed: true, isolation: 'docker', error: 'INVALID_EXECUTION_RESULT',
                stdout: '', stderr: 'The isolated Python wrapper did not return a valid result.', ...metadata() };
        }
        const result = { success: parsed.success, executed: true, isolation: 'docker',
            stdout: parsed.stdout, stderr: parsed.stderr, result: parsed.result ?? null, ...metadata() };
        if (!result.success) {
            result.error = 'EXECUTION_FAILED';
            return result;
        }
        const hash = generateExecutionHash(code, result.stdout);
        storeExecutionHash(hash, { code, stdout: result.stdout, tool, domain, success: true, elapsed_ms: result.elapsed_ms });
        result.execution_hash = hash;
        return result;
    } catch {
        return { success: false, executed: execution?.executed === true,
            isolation: execution?.isolation || 'unavailable', error: 'SANDBOX_UNAVAILABLE',
            stdout: '', stderr: 'Isolated tool execution is unavailable.', ...metadata() };
    }
}

export function extractCodeBlocks(content) {
    if (!content) return [];

    const blocks = [];
    const regex = /```(python|lean4|lean|sympy|sage)\s*\n([\s\S]*?)```/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const lang = match[1].toLowerCase();
        const code = match[2].trim();

        // Skip trivially short or placeholder code
        if (code.length < 20) continue;
        if (code.includes('# TODO') && code.split('\n').length < 3) continue;
        if (code.includes('...') && code.split('\n').length < 5) continue;

        // Estimate which line the block starts at
        const precedingContent = content.substring(0, match.index);
        const line = (precedingContent.match(/\n/g) || []).length + 1;

        blocks.push({
            language: lang === 'lean' ? 'lean4' : lang,
            code,
            line
        });
    }

    return blocks;
}

/**
 * Run all Python code blocks found in a paper and return verification results.
 *
 * @param {string} content - Full paper content
 * @param {string} domain - Domain ID
 * @returns {Promise<{blocks_found: number, blocks_verified: number, blocks_failed: number, results: Array}>}
 */
export async function verifyPaperCode(content, domain) {
    const blocks = extractCodeBlocks(content).filter(b => b.language === 'python' || b.language === 'sympy' || b.language === 'sage');

    if (blocks.length === 0) {
        return { blocks_found: 0, blocks_verified: 0, blocks_failed: 0, results: [], success: true, executed: false, isolation: 'not_requested' };
    }

    const results = [];
    let verified = 0;
    let failed = 0;

    // Run blocks sequentially (not parallel — memory safety)
    for (const block of blocks.slice(0, 5)) { // Max 5 blocks per paper
        const result = await runPythonTool(block.code, {
            domain,
            timeout: 30_000, // 30s per block
            tool: `code_block_line_${block.line}`
        });

        results.push({
            line: block.line,
            language: block.language,
            code_preview: block.code.substring(0, 200),
            ...result
        });

        if (result.success) verified++;
        else failed++;
        if (['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'SANDBOX_CLEANUP_FAILED'].includes(result.error)) break;
    }

    const admissionFailure = results.find(r => ['SANDBOX_UNAVAILABLE', 'SANDBOX_BUSY', 'SANDBOX_CLEANUP_FAILED'].includes(r.error));
    return {
        success: failed === 0,
        executed: results.some(r => r.executed === true),
        isolation: admissionFailure?.isolation || 'docker',
        ...(admissionFailure ? { error: admissionFailure.error } : {}),
        blocks_skipped: blocks.length - results.length,
        blocks_found: blocks.length,
        blocks_verified: verified,
        blocks_failed: failed,
        results
    };
}

// Checks the configured local image and Docker daemon, never a host interpreter.
export async function checkPythonAvailable() {
    try { return (await sandbox.checkAvailability('python')).available === true; }
    catch { return false; }
}

export async function checkInstalledTools(domain) {
    const hasPython = await checkPythonAvailable();
    if (!hasPython) return [];

    // Check both universal scientific packages and domain-specific ones
    // Exclude stdlib modules (only check pip-installed packages)
    const SCIENTIFIC_UNIVERSAL = ['numpy', 'scipy', 'pandas', 'matplotlib'];
    const domainSpecific = (ALLOWED_IMPORTS[domain] || []).filter(m =>
        !m.startsWith('_') && m.length > 1 && m !== 'Chem'
    );
    const allImports = [...new Set([...SCIENTIFIC_UNIVERSAL, ...domainSpecific])];

    // Discover packages inside the same network-disabled container used for execution.
    const checkCode = `import importlib\n` + allImports.map(mod =>
        `try:\n    importlib.import_module("${mod}")\n    print("OK:${mod}")\nexcept:\n    print("MISS:${mod}")`
    ).join('\n');

    const result = await runPythonTool(checkCode, { domain, timeout: 30_000, tool: 'import_check' });

    const installed = [];
    if (result.success && result.stdout) {
        for (const line of result.stdout.split('\n')) {
            if (line.startsWith('OK:')) installed.push(line.slice(3));
        }
    }

    return installed;
}

export default {
    runPythonTool,
    extractCodeBlocks,
    verifyPaperCode,
    checkPythonAvailable,
    checkInstalledTools
};
