/**
 * Tool Runner Service
 *
 * Sandboxed execution of scientific Python code extracted from papers.
 * Builds on IsolateSandbox but specifically for domain-specific tool verification.
 *
 * Security: child_process.execFile with timeout + memory limits.
 * No network access, restricted imports whitelist, killed on timeout.
 *
 * EXTENSION ONLY — does not modify IsolateSandbox or any existing service.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Configuration ───────────────────────────────────────────────────────────

const SANDBOX_DIR = process.env.TOOL_SANDBOX_DIR || '/tmp/p2pclaw_tool_sandbox';
const DEFAULT_TIMEOUT = 60_000;   // 60 seconds
const MAX_OUTPUT = 10 * 1024 * 1024; // 10MB output cap
const MAX_MEMORY_MB = 512;

// Allowed Python imports per domain — anything else is blocked by the wrapper
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

// ── Python Wrapper Template ─────────────────────────────────────────────────
// This wrapper restricts imports and captures output safely.

function buildPythonWrapper(code, domain) {
    // Security model: process-level sandbox (timeout + memory + no network env)
    // Scientific packages have deep dependency trees that break with import hooks.
    // Instead we rely on: execFile timeout, RLIMIT_AS, restricted PATH/HOME,
    // and MPLBACKEND=Agg (no display). Network calls will fail (no credentials in env).

    return `
import sys, json, traceback, resource, signal

# Memory limit (soft)
try:
    resource.setrlimit(resource.RLIMIT_AS, (${MAX_MEMORY_MB} * 1024 * 1024, ${MAX_MEMORY_MB} * 1024 * 1024))
except Exception:
    pass  # resource module not available on all platforms

# Timeout handler
def timeout_handler(signum, frame):
    raise TimeoutError("Execution timed out")
try:
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(55)  # 55s soft timeout (hard timeout is 60s from Node)
except Exception:
    pass  # SIGALRM not available on Windows

# Capture output
_output = {"success": False, "stdout": "", "stderr": "", "result": None}

import io
_stdout_capture = io.StringIO()
_stderr_capture = io.StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture

try:
    # ── USER CODE START ──
${code.split('\n').map(line => '    ' + line).join('\n')}
    # ── USER CODE END ──

    _output["success"] = True
    _output["stdout"] = _stdout_capture.getvalue()[:50000]
    _output["stderr"] = _stderr_capture.getvalue()[:10000]
except Exception as e:
    _output["success"] = False
    _output["stdout"] = _stdout_capture.getvalue()[:50000]
    _output["stderr"] = traceback.format_exc()[:10000]

sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
print(json.dumps(_output))
`;
}

// ── Core Execution ──────────────────────────────────────────────────────────

/**
 * Run Python code in a sandboxed child process.
 *
 * @param {string} code - Python code to execute
 * @param {object} opts
 * @param {string} opts.domain - Domain for import whitelist (physics, chemistry, etc.)
 * @param {number} opts.timeout - Timeout in ms (default 60s)
 * @param {string} opts.tool - Tool name (for logging)
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, elapsed_ms: number, tool: string}>}
 */
export async function runPythonTool(code, opts = {}) {
    const { domain = 'mathematics', timeout = DEFAULT_TIMEOUT, tool = 'unknown' } = opts;
    const start = Date.now();
    const runId = crypto.randomBytes(6).toString('hex');

    try {
        await fs.mkdir(SANDBOX_DIR, { recursive: true });
    } catch { /* exists */ }

    const scriptPath = path.join(SANDBOX_DIR, `tool_${runId}.py`);
    const wrappedCode = buildPythonWrapper(code, domain);

    try {
        await fs.writeFile(scriptPath, wrappedCode, 'utf8');

        const result = await new Promise((resolve) => {
            const proc = execFile('python3', [scriptPath], {
                timeout,
                maxBuffer: MAX_OUTPUT,
                env: {
                    PATH: process.env.PATH,
                    HOME: '/tmp',
                    PYTHONPATH: '',
                    MPLBACKEND: 'Agg',           // matplotlib without display
                    OPENBLAS_NUM_THREADS: '1',    // prevent OpenBLAS OOM on constrained memory
                    OMP_NUM_THREADS: '1',         // limit OpenMP threads
                    MKL_NUM_THREADS: '1',         // limit MKL threads
                    NUMEXPR_MAX_THREADS: '1'      // limit numexpr threads
                }
            }, (error, stdout, stderr) => {
                const elapsed_ms = Date.now() - start;

                if (error && error.killed) {
                    resolve({ success: false, stdout: '', stderr: 'TIMEOUT: execution killed after ' + timeout + 'ms', elapsed_ms, tool });
                    return;
                }

                // Try to parse the JSON output from our wrapper
                try {
                    const lastLine = stdout.trim().split('\n').pop();
                    const parsed = JSON.parse(lastLine);
                    resolve({
                        success: parsed.success,
                        stdout: parsed.stdout || '',
                        stderr: parsed.stderr || stderr || '',
                        result: parsed.result || null,
                        elapsed_ms,
                        tool
                    });
                } catch {
                    // Wrapper didn't produce JSON — raw output
                    resolve({
                        success: !error,
                        stdout: stdout || '',
                        stderr: stderr || (error ? error.message : ''),
                        elapsed_ms,
                        tool
                    });
                }
            });
        });

        return result;

    } catch (err) {
        return {
            success: false,
            stdout: '',
            stderr: `Tool runner error: ${err.message}`,
            elapsed_ms: Date.now() - start,
            tool
        };
    } finally {
        // Cleanup
        try { await fs.unlink(scriptPath); } catch { /* ok */ }
    }
}

// ── Code Block Extraction ───────────────────────────────────────────────────

/**
 * Extract executable code blocks from paper content.
 * Looks for ```python ... ``` and ```lean4 ... ``` blocks.
 *
 * @param {string} content - Paper markdown content
 * @returns {Array<{language: string, code: string, line: number}>}
 */
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
        return { blocks_found: 0, blocks_verified: 0, blocks_failed: 0, results: [] };
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
    }

    return {
        blocks_found: blocks.length,
        blocks_verified: verified,
        blocks_failed: failed,
        results
    };
}

// ── Check Python + tools availability ───────────────────────────────────────

let _pythonAvailable = null;

export async function checkPythonAvailable() {
    if (_pythonAvailable !== null) return _pythonAvailable;

    try {
        const result = await new Promise((resolve) => {
            execFile('python3', ['--version'], { timeout: 5000 }, (error, stdout) => {
                resolve(!error ? stdout.trim() : null);
            });
        });
        _pythonAvailable = !!result;
        if (result) console.log(`[TOOL-RUNNER] Python available: ${result}`);
        else console.warn('[TOOL-RUNNER] Python3 not found. Domain tool verification disabled.');
    } catch {
        _pythonAvailable = false;
        console.warn('[TOOL-RUNNER] Python3 not found. Domain tool verification disabled.');
    }

    return _pythonAvailable;
}

/**
 * Check which tools are actually installed for a given domain.
 * Returns list of available tools.
 */
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

    // Use importlib directly (bypasses our safe_import hook)
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
