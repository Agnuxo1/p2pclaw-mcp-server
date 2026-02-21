import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

/**
 * IsolateSandbox
 * Provides a secure, containerized environment for executing untrusted agent code.
 * Primary: Docker containers.
 * Fallback: Node.js `vm` module (lightweight isolation).
 */
export class IsolateSandbox {
    constructor(workDir = './temp_sandbox') {
        this.workDir = path.resolve(workDir);
        this.dockerAvailable = null; // null = unchecked
    }

    async init() {
        await fs.mkdir(this.workDir, { recursive: true });
        // Pre-check Docker availability
        try {
            await new Promise((resolve, reject) => {
                const p = spawn('docker', ['version'], { stdio: 'ignore' });
                p.on('close', code => code === 0 ? resolve() : reject());
                p.on('error', reject);
            });
            this.dockerAvailable = true;
            console.log('[SANDBOX] Docker available. Using containerized execution.');
        } catch {
            this.dockerAvailable = false;
            console.warn('[SANDBOX] Docker unavailable. Using vm fallback (lower isolation).');
        }
    }

    /**
     * Executes arbitrary code in a Docker container (or vm fallback).
     */
    async execute(code, options = {}) {
        if (this.dockerAvailable) {
            return this._executeDocker(code, options);
        }
        return this._executeVm(code, options);
    }

    /**
     * Docker-based execution (high isolation).
     */
    async _executeDocker(code, options = {}) {
        const runId = crypto.randomBytes(8).toString('hex');
        const runFolder = path.join(this.workDir, runId);
        await fs.mkdir(runFolder);

        const scriptPath = path.join(runFolder, 'index.js');
        await fs.writeFile(scriptPath, code);

        const memoryLimit = options.memory || '128m';
        const cpuLimit = options.cpus || '0.5';
        const timeout = options.timeout || 10000;

        return new Promise((resolve) => {
            const dockerArgs = [
                'run', '--rm',
                '--name', `p2pclaw-sandbox-${runId}`,
                '--memory', memoryLimit,
                '--cpus', cpuLimit,
                '-v', `${path.resolve(runFolder)}:/app`,
                '-w', '/app',
                'node:18-slim', 'node', 'index.js'
            ];

            const proc = spawn('docker', dockerArgs);
            let stdout = '';
            let stderr = '';

            const timer = setTimeout(() => {
                spawn('docker', ['stop', `p2pclaw-sandbox-${runId}`]);
                resolve({ success: false, error: 'TIMEOUT', stdout, stderr: stderr + '\nExecution timed out.' });
            }, timeout);

            proc.stdout.on('data', d => stdout += d.toString());
            proc.stderr.on('data', d => stderr += d.toString());

            proc.on('close', async (code) => {
                clearTimeout(timer);
                try { await fs.rm(runFolder, { recursive: true, force: true }); } catch {}
                resolve({ success: code === 0, exitCode: code, stdout, stderr });
            });
        });
    }

    /**
     * vm module-based execution (processes fallback for local dev).
     */
    async _executeVm(code, options = {}) {
        const timeout = options.timeout || 5000;
        const logs = [];
        
        try {
            const sandbox = {
                console: { 
                    log: (...args) => logs.push(args.join(' ')), 
                    error: (...args) => logs.push('[ERR] ' + args.join(' '))
                },
                Math, Date, JSON, Array, Object, Number, String, Boolean
            };
            
            vm.createContext(sandbox);
            vm.runInContext(code, sandbox, { timeout });

            return {
                success: true,
                exitCode: 0,
                stdout: logs.join('\n'),
                stderr: ''
            };
        } catch (err) {
            return {
                success: false,
                exitCode: 1,
                stdout: logs.join('\n'),
                stderr: err.message
            };
        }
    }
}

export const sandbox = new IsolateSandbox();
await sandbox.init();
