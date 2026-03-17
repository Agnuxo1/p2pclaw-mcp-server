/**
 * P2PCLAW Open-Tool Multiverse — Simulation Job Service
 * ======================================================
 * Distributed computation layer. Agents submit simulation jobs;
 * worker nodes (running locally on researchers' machines) pick them up,
 * execute the tool (RDKit, MuJoCo, Lean4, etc.), and return signed results.
 *
 * Architecture:
 *   Agent → POST /simulation/submit → jobQueue (in-memory)
 *   Worker → GET  /simulation/jobs?status=pending → picks job
 *   Worker → PUT  /simulation/:id/result → submits result
 *   Consensus: 2+ matching result hashes → status: "verified" → Tier-1 badge
 *
 * Memory: max MAX_JOBS entries, JOB_TTL_MS expiry, trimmed by API watchdog.
 */

import crypto from "crypto";

const MAX_JOBS    = 200;
const JOB_TTL_MS  = 2 * 60 * 60 * 1000; // 2 hours
const CONSENSUS_N = 2; // minimum matching results for verification

// In-memory job store — intentionally not persisted (API restarts cleanly)
export const jobQueue = new Map();

// Registered worker capabilities: workerId → { tools, lastSeen, agentId, pubkey }
export const workerRegistry = new Map();

export const SUPPORTED_TOOLS = [
  "rdkit_energy_minimize",    // SMILES → minimized energy (kcal/mol)
  "rdkit_smiles_validate",    // SMILES → valid bool + canonical SMILES
  "rdkit_fingerprint",        // SMILES → Morgan fingerprint
  "mujoco_kinematics",        // URDF + joint angles → end-effector pos
  "lean4_verify",             // Lean4 proof string → verified bool
  "generic_python",           // Sandboxed Python snippet → stdout
];

/** Hash a result object deterministically for consensus comparison */
function hashResult(result) {
  const canonical = JSON.stringify(result, Object.keys(result).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Evict expired jobs and keep queue under MAX_JOBS */
function evict() {
  const now = Date.now();
  for (const [id, job] of jobQueue.entries()) {
    if (now - job.timestamp > JOB_TTL_MS) jobQueue.delete(id);
  }
  if (jobQueue.size >= MAX_JOBS) {
    const oldest = [...jobQueue.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, Math.floor(MAX_JOBS * 0.2))
      .map(([id]) => id);
    oldest.forEach(id => jobQueue.delete(id));
  }
}

/** Submit a new simulation job */
export function submitJob({ tool, params, requesterAgentId, requesterName }) {
  if (!SUPPORTED_TOOLS.includes(tool)) {
    throw new Error(`Unknown tool: ${tool}. Supported: ${SUPPORTED_TOOLS.join(", ")}`);
  }
  evict();

  const jobId = `simjob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const job = {
    id:           jobId,
    tool,
    params:       params || {},
    status:       "pending",
    requester_id: requesterAgentId || "anonymous",
    requester:    requesterName    || "Anonymous Agent",
    timestamp:    Date.now(),
    results:      [],
    verified:     false,
    consensus_hash: null,
  };
  jobQueue.set(jobId, job);
  return job;
}

/** Worker claims a pending job (atomic-ish — first-come first-served) */
export function claimJob(jobId, workerId) {
  const job = jobQueue.get(jobId);
  if (!job) return null;
  // Allow re-claim if same worker or if claim expired (>5min without result)
  const now = Date.now();
  if (job.claimedBy && job.claimedBy !== workerId) {
    if (now - job.claimedAt < 5 * 60 * 1000) return null; // locked by other worker
  }
  job.status    = "claimed";
  job.claimedBy = workerId;
  job.claimedAt = now;
  return job;
}

/** Worker submits a result with optional Ed25519 pubkey signature */
export function submitResult(jobId, { workerId, workerPubkey, result, resultHash }) {
  const job = jobQueue.get(jobId);
  if (!job) return null;
  if (job.status === "verified") return job; // already done

  const hash = resultHash || hashResult(result);

  // Deduplicate: same worker can't submit twice
  if (job.results.some(r => r.workerId === workerId)) {
    throw new Error("Worker already submitted a result for this job");
  }

  job.results.push({
    workerId,
    pubkey:    workerPubkey || null,
    result,
    hash,
    ts:        Date.now(),
  });

  // Check consensus
  const hashCounts = {};
  for (const r of job.results) {
    hashCounts[r.hash] = (hashCounts[r.hash] || 0) + 1;
  }
  const topHash  = Object.entries(hashCounts).sort((a, b) => b[1] - a[1])[0];
  const topCount = topHash?.[1] || 0;

  if (topCount >= CONSENSUS_N) {
    job.status         = "verified";
    job.verified       = true;
    job.consensus_hash = topHash[0];
    job.verified_result = job.results.find(r => r.hash === topHash[0])?.result;
  } else if (job.results.length >= 1) {
    job.status = "completed";
  }

  return job;
}

/** Register or refresh a worker node */
export function registerWorker({ workerId, agentId, tools, pubkey, endpoint }) {
  workerRegistry.set(workerId, {
    workerId,
    agentId:  agentId  || workerId,
    tools:    tools    || [],
    pubkey:   pubkey   || null,
    endpoint: endpoint || null,
    lastSeen: Date.now(),
  });
  return workerRegistry.get(workerId);
}

/** List jobs with optional status filter and pagination */
export function listJobs({ status = null, tool = null, limit = 50, offset = 0 } = {}) {
  evict();
  let jobs = [...jobQueue.values()];
  if (status) jobs = jobs.filter(j => j.status === status);
  if (tool)   jobs = jobs.filter(j => j.tool   === tool);
  return jobs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(offset, offset + limit)
    .map(j => ({ ...j, results: j.results.map(r => ({ workerId: r.workerId, hash: r.hash, ts: r.ts })) }));
}

/** Get full job including results */
export function getJob(jobId) {
  return jobQueue.get(jobId) || null;
}

/** Stats for /swarm-status */
export function getSimStats() {
  evict();
  const jobs = [...jobQueue.values()];
  return {
    total:    jobs.length,
    pending:  jobs.filter(j => j.status === "pending").length,
    claimed:  jobs.filter(j => j.status === "claimed").length,
    completed:jobs.filter(j => j.status === "completed").length,
    verified: jobs.filter(j => j.status === "verified").length,
    workers:  workerRegistry.size,
  };
}

/** Trim for memory watchdog */
export function trimSimQueue(maxEntries = 100) {
  evict();
  if (jobQueue.size > maxEntries) {
    const toRemove = [...jobQueue.entries()]
      .filter(([, j]) => j.status !== "pending")
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, jobQueue.size - maxEntries);
    toRemove.forEach(([id]) => jobQueue.delete(id));
  }
}
