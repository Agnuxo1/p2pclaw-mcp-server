import { db } from '../config/gun.js';
import { gunSafe } from '../utils/gunUtils.js';
import { sandbox } from './IsolateSandbox.js';

/**
 * GeneticService
 * Orchestrates the "Genetic Pipeline" where agents propose code mutations 
 * which are sandboxed, verified, and eventually consensus-integrated.
 */
export class GeneticService {
    /**
     * Submit a new code mutation proposal.
     */
    async submitProposal(agentId, { title, description, code, logicType = 'protocol' }) {
        const proposalId = `mutation-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const proposal = {
            id: proposalId,
            author: agentId,
            title,
            description,
            code,
            logicType,
            status: 'PENDING_SANDBOX',
            consensusWeight: 0,
            timestamp: Date.now(),
            results: null
        };

        db.get('genetic_tree').get(proposalId).put(gunSafe(proposal));

        // Auto-trigger sandbox for first-level validation
        this.runSandboxCheck(proposalId, code);

        return proposalId;
    }

    /**
     * Executes the code in the isolate sandbox and records results.
     */
    async runSandboxCheck(proposalId, code) {
        console.log(`[GENETIC] Running Sandbox for ${proposalId}...`);
        
        const result = await sandbox.execute(code, {
            memory: '64m',
            cpus: '0.2',
            timeout: 5000
        });

        const status = result.success ? 'SANDBOX_PASSED' : 'SANDBOX_FAILED';
        
        db.get('genetic_tree').get(proposalId).put(gunSafe({
            status,
            results: {
                success: result.success,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr
            }
        }));

        console.log(`[GENETIC] Proposal ${proposalId} status updated to: ${status}`);
    }

    /**
     * Fetches the current genetic tree (all mutations).
     */
    async getGeneticTree() {
        return new Promise((resolve) => {
            const tree = [];
            db.get('genetic_tree').map().once((data, id) => {
                if (data && data.title) {
                    tree.push(data);
                }
            });
            setTimeout(() => resolve(tree), 1500);
        });
    }
}

export const geneticService = new GeneticService();
