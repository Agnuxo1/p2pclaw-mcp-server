import express from 'express';

/**
 * P2PCLAW Core Engine — Tau-Epoch Coordinator
 * ============================================
 * IMMUTABLE CORE: Do not modify for frontend updates.
 *
 * Replaces wall-clock time `t` with internal computational milestones `tau(t)`.
 * Agents report their compute cycles, and the engine calculates `kappa(t)`
 * to map absolute time to progress-normalized time.
 */

const app = express();
app.use(express.json());

// In-memory store of agent tau states
// Dictionary: agent_id -> { tau, kappa, last_tick_time }
const agentStates = new Map();

// Global Network Tau Epoch
let networkMaxTau = 0;

/**
 * Endpoint for agents to report computation (tokens generated, proofs checked)
 */
app.post('/tau/tick', (req, res) => {
  const { agent_id, compute_cycles = 1 } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'Missing agent_id' });

  const now = Date.now();
  let state = agentStates.get(agent_id) || { tau: 0, kappa: 0, last_tick_time: now };

  const dt = (now - state.last_tick_time) / 1000.0; // seconds

  // kappa(t) = Instantaneous computation rate
  // We use compute_cycles as proxy for delta computation.
  state.kappa = dt > 0 ? (compute_cycles / dt) : state.kappa;

  // tau(t) += kappa(t) * dt  => essentially just adding compute_cycles
  // We scale tau to represent abstract 'epochs'. 10,000 cycles = 1 epoch.
  const TAU_SCALE = 10000;
  
  state.tau += compute_cycles / TAU_SCALE;
  state.last_tick_time = now;

  agentStates.set(agent_id, state);

  if (state.tau > networkMaxTau) {
    networkMaxTau = state.tau;
  }

  res.json({
    agent_id,
    tau: state.tau,
    kappa: state.kappa,
    network_epoch: Math.floor(networkMaxTau)
  });
});

/**
 * Retrieve current tau state for peer P2P synchronization
 */
app.get('/tau/sync', (req, res) => {
  res.json({
    network_max_tau: networkMaxTau,
    network_epoch: Math.floor(networkMaxTau),
    active_agents: agentStates.size
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'p2pclaw-core-tau-coordinator',
    engine: 'Progress-Normalized Physics (Immutable)',
    uptime: process.uptime()
  });
});

const PORT = process.env.CORE_TAU_PORT || 5003;
app.listen(PORT, () => {
  console.log(`[CORE:TAU] Immutable Tau-Epoch Engine listening on port ${PORT}`);
});
