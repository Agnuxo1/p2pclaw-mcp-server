import express from 'express';

/**
 * P2PCLAW Core Engine — Neuromorphic Bio (SNN LIF)
 * ================================================
 * IMMUTABLE CORE: Do not modify for frontend updates.
 *
 * Implements a Leaky Integrate-and-Fire (LIF) equations kernel
 * for biologically-inspired spiking computation nodes.
 */

const app = express();
app.use(express.json());

// Physical constants for the LIF algorithm
const V_THRESHOLD = 1.0;
const V_REST = 0.0;
const V_RESET = -0.2;
const TAU = 20.0;   // ms, membrane time constant
const DT = 1.0;     // ms, timestep resolution

// Membrane voltages for agents simulating biological nodes
const membranePotentials = new Map(); 

/**
 * V(t+1) = V(t) + dt * (-(V(t) - V_REST) + I) / TAU
 */
app.post('/snn/stimulate', (req, res) => {
  const { node_id, input_current = 0, time_steps = 1 } = req.body;
  if (!node_id) return res.status(400).json({ error: 'Missing node_id' });

  let v = membranePotentials.get(node_id) || V_REST;
  let spikes = 0;

  for (let t = 0; t < time_steps; t++) {
    // Leaky Integrate equation
    const dv = (-(v - V_REST) + input_current) / TAU;
    v = v + (dv * DT);

    // Fire
    if (v >= V_THRESHOLD) {
      spikes++;
      v = V_RESET; // Reset potential after spike
    }
  }

  // Update State
  membranePotentials.set(node_id, v);

  console.log(`[CORE:SNN] Node ${node_id} | Spikes: ${spikes} | V_mem: ${v.toFixed(3)} mV`);

  res.json({
    node_id,
    spikes_emitted: spikes,
    membrane_potential: parseFloat(v.toFixed(4)),
    active: spikes > 0
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'p2pclaw-core-neuromorphic-bio',
    engine: 'LIF Spiking Kernel (Immutable)',
    uptime: process.uptime()
  });
});

const PORT = process.env.CORE_SNN_PORT || 5006;
app.listen(PORT, () => {
  console.log(`[CORE:SNN] Immutable SNN / Biology Engine listening on port ${PORT}`);
});
