/**
 * Patch @modelcontextprotocol/sdk to accept clients that only send
 * Accept: application/json (like Smithery) without requiring text/event-stream.
 *
 * Run automatically via package.json postinstall.
 * Safe to run multiple times (idempotent).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGETS = [
    'node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js',
    'node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.js',
];

const OLD = `if (!acceptHeader?.includes('application/json') || !acceptHeader.includes('text/event-stream')) {
                return this.createJsonErrorResponse(406, -32000, 'Not Acceptable: Client must accept both application/json and text/event-stream');
            }`;

const NEW = `// Patched: accept application/json-only clients (e.g. Smithery)
            if (!acceptHeader?.includes('application/json') && !acceptHeader?.includes('text/event-stream') && !acceptHeader?.includes('*/*')) {
                return this.createJsonErrorResponse(406, -32000, 'Not Acceptable: Client must accept application/json');
            }`;

let patched = 0;
for (const rel of TARGETS) {
    const file = path.join(__dirname, rel);
    if (!existsSync(file)) { console.log(`[patch] SKIP (not found): ${rel}`); continue; }
    let content = readFileSync(file, 'utf8');
    if (content.includes('Patched: accept application/json-only')) {
        console.log(`[patch] Already patched: ${rel}`);
        continue;
    }
    if (!content.includes(OLD)) {
        console.log(`[patch] Pattern not found (SDK version changed?): ${rel}`);
        continue;
    }
    writeFileSync(file, content.replace(OLD, NEW), 'utf8');
    console.log(`[patch] OK: ${rel}`);
    patched++;
}
console.log(`[patch] Done. ${patched} file(s) patched.`);
