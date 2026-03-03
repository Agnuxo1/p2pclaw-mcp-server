import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINES = [
  'tier1-lean-verifier',
  'crypto-ed25519',
  'tau-sync',
  'mift-stability',
  'hsr-memory',
  'neuromorphic-bio'
];

console.log("==================================================");
console.log("🚀 STARTING P2PCLAW IMMUTABLE CORE ENGINES...");
console.log("==================================================");

for (const engine of ENGINES) {
  // Path assumes this script is run from p2pclaw-mcp-server root
  const dir = path.resolve(__dirname, '..', 'packages', 'core-engines', engine);
  
  // Start the engine
  const p = spawn('npm', ['start'], { cwd: dir, shell: true });
  
  p.stdout.on('data', data => {
    process.stdout.write(`[${engine.toUpperCase()}] ${data}`);
  });
  
  p.stderr.on('data', data => {
    process.stderr.write(`[${engine.toUpperCase()} ERROR] ${data}`);
  });
  
  p.on('close', code => {
    console.log(`[${engine.toUpperCase()}] Process exited with code ${code}`);
  });
}
