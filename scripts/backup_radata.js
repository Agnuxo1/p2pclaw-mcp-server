import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RADATA_DIR = path.join(PROJECT_ROOT, 'radata');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = `radata_backup_${timestamp}.zip`;
const backupPath = path.join(BACKUP_DIR, backupFilename);

console.log('='.repeat(50));
console.log(' P2PCLAW — Gun.js State Backup Utility');
console.log('='.repeat(50));

try {
    if (!fs.existsSync(RADATA_DIR)) {
        console.error('❌ Error: The "radata" directory does not exist.');
        console.error('Make sure the P2P node has been running and has generated local state.');
        process.exit(1);
    }

    console.log(`📦 Backing up ${RADATA_DIR}...`);
    
    // Cross-platform zip command (using powershell on Windows, or standard zip on Unix)
    if (process.platform === 'win32') {
        execSync(`powershell -Command "Compress-Archive -Path '${RADATA_DIR}\\*' -DestinationPath '${backupPath}' -Force"`);
    } else {
        execSync(`cd "${RADATA_DIR}" && zip -r "${backupPath}" .`);
    }

    console.log(`✅ Backup successful! Saved to: ${backupPath}`);
    console.log(`\nTo restore this backup:`);
    console.log(`1. Stop the node-server.js process`);
    console.log(`2. Delete the current "radata" folder`);
    console.log(`3. Extract the contents of ${backupFilename} into a new "radata" folder`);
    console.log(`4. Restart node-server.js`);
    console.log('='.repeat(50));
} catch (error) {
    console.error('❌ Backup failed:', error.message);
}
