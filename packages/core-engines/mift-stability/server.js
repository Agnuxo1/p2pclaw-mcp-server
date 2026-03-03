import express from 'express';

/**
 * P2PCLAW Core Engine — MIFT Invariant & Stability Control
 * ========================================================
 * IMMUTABLE CORE: Do not modify for frontend updates.
 *
 * Implements the Morrison Identity Field Transform.
 * Calculates Hamiltonian energy and Lyapunov bounds to detect
 * when an agent starts hallucinating or experiencing entropy breakdown.
 */

const app = express();
app.use(express.json());

// Threshold before an agent is considered 'hallucinating' out of bounds
const HORIZON_THRESHOLD = 0.85;

/**
 * Calculates Hamiltonian H(p,q) = K(p) + V(q)
 * where K = kinetic energy (computation speed, kappa)
 * and V = potential energy (semantic divergence from truth)
 */
function calculateMIFT(kappa, diversityScore, paradoxCount) {
  // Normalize kinetic energy based on expected high-speed compute
  const kinetic = Math.min(1.0, kappa / 500.0);
  
  // Potential energy rises if semantic divergence (paradoxes) increases
  // High diversity is good, but paradoxes introduce massive potential instability
  const potential = (paradoxCount * 0.3) + (1.0 - diversityScore) * 0.1;
  
  const hamiltonian = kinetic + potential;
  
  // Lyapunov stability: drift rate
  const lyapunovDrift = potential * Math.exp(kinetic);
  
  return {
    hamiltonian,
    lyapunovDrift,
    isStable: lyapunovDrift < HORIZON_THRESHOLD
  };
}

app.post('/mift/analyze', (req, res) => {
  const { agent_id, tau, kappa, lexical_diversity, paradox_count = 0 } = req.body;
  
  if (!agent_id) return res.status(400).json({ error: 'Missing agent_id' });

  const metrics = calculateMIFT(
    kappa || 10, 
    lexical_diversity || 0.5, 
    paradox_count
  );

  console.log(`[CORE:MIFT] Agent ${agent_id} | H=${metrics.hamiltonian.toFixed(3)} | Drift=${metrics.lyapunovDrift.toFixed(3)} | Stable? ${metrics.isStable}`);

  res.json({
    agent_id,
    tau_epoch: tau,
    mift_metrics: metrics,
    horizon_breached: !metrics.isStable,
    action_required: !metrics.isStable ? 'TERMINATE_OR_RESET' : 'NONE'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'p2pclaw-core-mift-stability',
    engine: 'Morrison Identity Field Transform (Immutable)',
    uptime: process.uptime()
  });
});

const PORT = process.env.CORE_MIFT_PORT || 5004;
app.listen(PORT, () => {
  console.log(`[CORE:MIFT] Immutable MIFT Stability Engine listening on port ${PORT}`);
});
