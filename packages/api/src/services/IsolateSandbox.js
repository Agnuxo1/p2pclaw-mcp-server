import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

// These are ceilings, not request-controlled Docker options.
export const SANDBOX_LIMITS = Object.freeze({
    jobs: 2, codeBytes: 256 * 1024, outputBytes: 1024 * 1024,
    timeoutMs: 60_000, defaultTimeoutMs: 10_000, probeTimeoutMs: 5_000,
    memory: '512m', cpus: '0.5', pids: '64', tmpfs: '16m',
});
let activeJobs = 0;
let cleanupUncertain = false;

const unavailable = (language, message, error = 'SANDBOX_UNAVAILABLE') => ({
    success: false, executed: false, error, isolation: 'unavailable',
    language, stdout: '', stderr: message,
});

/**
 * Executes untrusted code only in an operator-provisioned Linux container.
 * Containers share the host kernel: this is a containment boundary, not a
 * guarantee against kernel/runtime vulnerabilities. Never fall back to host code.
 */
export class IsolateSandbox {
    // Keep the old workDir argument for callers; no directory or file is needed.
    constructor(_workDir, { spawnProcess = spawn, env = process.env } = {}) {
        this._spawn = spawnProcess;
        this._env = env;
        this._checks = new Map();
        this.dockerAvailable = null;
    }

    async init() {
        return this.checkAvailability('javascript');
    }

    _detectLanguage(code) {
        return /^(?:#!.*python|import |from |def |class |print\()/m.test(code.trim())
            ? 'python' : 'javascript';
    }

    async checkAvailability(language = 'javascript') {
        if (cleanupUncertain) return { available: false, reason: 'Container cleanup requires operator intervention.' };
        const variable = language === 'python' ? 'SANDBOX_PYTHON_IMAGE'
            : language === 'javascript' ? 'SANDBOX_JAVASCRIPT_IMAGE' : null;
        const image = variable && this._env[variable];
        if (!image || !/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,255}$/.test(image)) {
            return { available: false, reason: 'A valid operator-provisioned sandbox image is not configured.' };
        }
        const key = `${language}:${image}`;
        const cached = this._checks.get(key);
        if (cached && cached.expires > Date.now()) return cached.promise;
        const entry = { expires: Infinity, promise: null };
        entry.promise = this._probe(image).finally(() => { entry.expires = Date.now() + 5_000; });
        // Share in-flight checks, including unavailable results, to bound probing.
        this._checks.set(key, entry);
        return entry.promise;
    }

    async _probe(image) {
        const daemon = await this._capture(['info', '--format', '{{.OSType}}'], { probe: true });
        if (daemon.error || daemon.exitCode !== 0 || daemon.stdout.trim() !== 'linux') {
            this.dockerAvailable = false;
            return { available: false, reason: 'A reachable Linux Docker daemon is required.' };
        }
        const imageCheck = await this._capture([
            'image', 'inspect', '--format',
            '{"id":{{json .Id}},"os":{{json .Os}},"volumes":{{json .Config.Volumes}}}', image,
        ], { probe: true });
        try {
            const metadata = JSON.parse(imageCheck.stdout);
            if (imageCheck.error || imageCheck.exitCode !== 0 || metadata.os !== 'linux'
                || !/^sha256:[a-f0-9]{64}$/.test(metadata.id)
                || (metadata.volumes && Object.keys(metadata.volumes).length)) throw new Error('invalid image');
            this.dockerAvailable = true;
            // Run the inspected immutable local ID, not a mutable tag.
            return { available: true, imageId: metadata.id };
        } catch {
            this.dockerAvailable = false;
            return { available: false, reason: 'The configured Linux image must already exist locally and declare no volumes.' };
        }
    }

    async execute(code, options = {}) {
        const language = options.language || (typeof code === 'string' ? this._detectLanguage(code) : 'javascript');
        if (!['javascript', 'python'].includes(language)) return unavailable(language, 'Unsupported language.', 'UNSUPPORTED_LANGUAGE');
        if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > SANDBOX_LIMITS.codeBytes) {
            return unavailable(language, 'Code must be a nonempty string of at most 256 KiB.', 'INVALID_CODE');
        }
        if (cleanupUncertain) return unavailable(language, 'Container cleanup requires operator intervention.');
        if (activeJobs >= SANDBOX_LIMITS.jobs) return unavailable(language, 'Both sandbox slots are in use.', 'SANDBOX_BUSY');
        activeJobs++;
        try {
            const availability = await this.checkAvailability(language);
            if (!availability.available) return unavailable(language, availability.reason);
            return await this._executeDocker(code, language, availability.imageId, options.timeout);
        } catch {
            return unavailable(language, 'The isolated execution service is unavailable.');
        } finally {
            activeJobs--;
        }
    }

    async _executeDocker(code, language, imageId, requestedTimeout) {
        const name = `p2pclaw-sandbox-${crypto.randomUUID()}`;
        const timeout = Number.isFinite(requestedTimeout) && requestedTimeout > 0
            ? Math.max(1, Math.min(Math.floor(requestedTimeout), SANDBOX_LIMITS.timeoutMs))
            : SANDBOX_LIMITS.defaultTimeoutMs;
        const python = language === 'python';
        const args = [
            'run', '--rm', '--interactive', '--pull=never', '--name', name,
            '--network=none', '--read-only', '--user=65534:65534',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--ipc=none',
            '--pids-limit', SANDBOX_LIMITS.pids, '--memory', SANDBOX_LIMITS.memory,
            '--memory-swap', SANDBOX_LIMITS.memory, '--cpus', SANDBOX_LIMITS.cpus,
            '--ulimit', 'nofile=128:128', '--ulimit', 'core=0', '--log-driver=none',
            '--tmpfs', `/tmp:rw,noexec,nosuid,size=${SANDBOX_LIMITS.tmpfs},mode=1777`,
            '--workdir=/tmp', '--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp',
            '--env', 'MPLBACKEND=Agg', '--env', 'MPLCONFIGDIR=/tmp/matplotlib',
            '--env', 'OPENBLAS_NUM_THREADS=1', '--env', 'OMP_NUM_THREADS=1',
            '--env', 'MKL_NUM_THREADS=1', '--env', 'NUMEXPR_MAX_THREADS=1',
            '--entrypoint', python ? 'python3' : 'node', imageId,
            ...(python ? ['-I', '-B', '-'] : ['--max-old-space-size=128', '-']),
        ];
        let outcome;
        let clientAborted = false;
        try {
            const run = await this._capture(args, { input: code, timeout });
            clientAborted = Boolean(run.error);
            if (run.error === 'SPAWN_ERROR' || [125, 126, 127].includes(run.exitCode)) {
                outcome = unavailable(language, 'Docker could not start the configured runtime.');
            } else {
                outcome = {
                    success: !run.error && run.exitCode === 0,
                    // Conservatively avoid claiming execution for a silent timeout.
                    executed: Number.isInteger(run.exitCode) || run.observedOutput,
                    isolation: 'docker', language, exitCode: run.exitCode,
                    stdout: run.stdout, stderr: run.stderr,
                    ...(run.error ? { error: run.error } : run.exitCode !== 0 ? { error: 'EXECUTION_FAILED' } : {}),
                };
            }
        } finally {
            // Killing the Docker client is not enough: terminate the named container.
            // --rm is a second layer for normal exits. Wait for bounded cleanup before
            // releasing a concurrency slot; fail closed if cleanup cannot be confirmed.
            const cleanup = await this._capture(['rm', '--force', name], { probe: true });
            // An aborted client can race Docker's asynchronous create/start.
            // "No such container" alone does not confirm cleanup in that case:
            // the daemon may still complete an outstanding create after this rm.
            const removed = !cleanup.error && (cleanup.exitCode === 0
                || (!clientAborted && /No such container/i.test(cleanup.stderr)));
            if (!removed) {
                cleanupUncertain = true;
                outcome = {
                    ...(outcome || unavailable(language, 'Container status is unknown.')),
                    success: false, error: 'SANDBOX_CLEANUP_FAILED',
                    stderr: 'Container cleanup could not be confirmed; execution disabled until operator intervention.',
                };
            }
        }
        return outcome;
    }

    _capture(args, { input, timeout, probe = false } = {}) {
        return new Promise(resolve => {
            let child;
            let settled = false;
            let timer;
            let bytes = 0;
            let observedOutput = false;
            const stdout = [];
            const stderr = [];
            const limit = probe ? 16 * 1024 : SANDBOX_LIMITS.outputBytes;
            const finish = (exitCode, error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ exitCode, error, observedOutput,
                    stdout: Buffer.concat(stdout).toString('utf8'),
                    stderr: Buffer.concat(stderr).toString('utf8') });
            };
            const abort = error => {
                finish(null, error);
                try { child?.kill('SIGKILL'); } catch { /* cleanup still runs */ }
            };
            const append = (target, chunk) => {
                if (settled) return;
                observedOutput = true;
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                const remaining = Math.max(0, limit - bytes);
                if (remaining) target.push(buffer.subarray(0, remaining));
                bytes += buffer.length;
                if (bytes > limit) abort('OUTPUT_LIMIT');
            };
            try {
                child = this._spawn('docker', args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
                child.on('error', () => finish(null, 'SPAWN_ERROR'));
                child.on('close', code => finish(code));
                child.stdout.on('data', chunk => append(stdout, chunk));
                child.stderr.on('data', chunk => append(stderr, chunk));
                child.stdin.on('error', () => { /* closed stdin: Docker's exit status decides */ });
                timer = setTimeout(() => abort('TIMEOUT'), probe ? SANDBOX_LIMITS.probeTimeoutMs : timeout);
                child.stdin.end(input || '');
            } catch {
                abort('SPAWN_ERROR');
            }
        });
    }
}

// Importing this service never starts processes or creates directories.
export const sandbox = new IsolateSandbox();
