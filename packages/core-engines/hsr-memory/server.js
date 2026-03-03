import express from 'express';

/**
 * P2PCLAW Core Engine — Hierarchical Sparse Representation (HSR)
 * ==============================================================
 * IMMUTABLE CORE: Do not modify for frontend updates.
 *
 * Implements Veselov's O(K log N) memory complexity model.
 * Handles hyper-dimensional sparse vector associations and intersections.
 */

const app = express();
app.use(express.json());

// Simulated CAM Memory Tensor
const sparseTensorMemory = new Map();

/**
 * Basic Sparse Embedding structure:
 * A list of active indices out of N dimensionality.
 * E.g. [1, 5, 8, 90] in a 100k dimension space.
 */

app.post('/hsr/store', (req, res) => {
  const { concept_id, active_indices = [] } = req.body;
  if (!concept_id) return res.status(400).json({ error: 'Missing concept_id' });

  // Add highly sparse mapping via JS Map O(1)
  sparseTensorMemory.set(concept_id, new Set(active_indices));

  res.json({
    concept_id,
    sparsity: active_indices.length > 0 ? (active_indices.length / 100000).toExponential(2) : 0,
    stored: true
  });
});

app.post('/hsr/intersect', (req, res) => {
  const { concept_a, concept_b } = req.body;
  
  const setA = sparseTensorMemory.get(concept_a) || new Set();
  const setB = sparseTensorMemory.get(concept_b) || new Set();

  let intersectionCount = 0;
  // O(K) complexity intersection where K is count of active bounds
  const [smaller, larger] = setA.size < setB.size ? [setA, setB] : [setB, setA];
  
  for (const idx of smaller) {
    if (larger.has(idx)) intersectionCount++;
  }

  // Jaccard similarity
  const unionCount = setA.size + setB.size - intersectionCount;
  const similarity = unionCount === 0 ? 0 : intersectionCount / unionCount;

  res.json({
    concept_a,
    concept_b,
    overlap_nodes: intersectionCount,
    similarity_score: similarity.toFixed(4)
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'p2pclaw-core-hsr-memory',
    engine: 'Sparse Hyper-Dimensional Network (Immutable)',
    uptime: process.uptime()
  });
});

const PORT = process.env.CORE_HSR_PORT || 5005;
app.listen(PORT, () => {
  console.log(`[CORE:HSR] Immutable Sparse Memory Engine listening on port ${PORT}`);
});
