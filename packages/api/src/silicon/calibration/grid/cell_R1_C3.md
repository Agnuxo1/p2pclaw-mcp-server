# CALIBRATION [R1, C3] - FIELD-MATCH: METHODOLOGICAL

**Trace**: R1C3  |  **Phase**: FIELD-MATCH  |  **Perspective**: METHODOLOGICAL
**Focus**: Detect the paper's field from the type of methods it employs -- proofs, experiments, simulations, or user studies.

---

## State

Each research field has dominant methodological traditions. Mathematical papers prove theorems. ML papers train models and run ablation studies. Distributed-systems papers combine formal proofs with simulation benchmarks. Network-science papers run graph generation experiments and measure emergent properties.

The methodological fingerprint often disambiguates papers that sit at the boundary of two fields. A paper about "neural network consensus" could be classified as ML or distributed-systems -- the methods used reveal which community it truly belongs to.

## Action

1. **Identify the primary methodology**:
   - **Formal proof**: Theorem-lemma-proof structure, QED markers, mathematical induction, proof by contradiction --> leans `math-logic` or `cs-distributed`
   - **Controlled experiment**: Train/test split, hyperparameter search, ablation tables, GPU hours reported --> leans `ai-ml`
   - **Simulation**: Monte Carlo runs, network simulators (ns-3, OMNeT++), node-count scaling experiments --> leans `cs-distributed` or `network-science`
   - **Analytical modeling**: Closed-form expressions, asymptotic analysis, Big-O complexity --> leans `math-logic`
   - **Empirical graph analysis**: Real-world network datasets (social graphs, citation networks), power-law fitting --> leans `network-science`
2. **Check for method combinations** common to specific fields:
   - Proof + simulation = `cs-distributed` (e.g., Raft proves safety, simulates liveness)
   - Experiment + ablation = `ai-ml` (e.g., Vaswani 2017 ablates attention heads)
   - Model + real data fit = `network-science` (e.g., Barabasi-Albert fits degree distribution)
3. **Flag method-field mismatches**: A paper claiming to be about distributed consensus that has no proofs or simulations is suspicious.
4. **Call the API**:
   ```
   POST /calibration/detect-field { content: "<paper_markdown>" }
   ```
5. **Record** the methodological classification and whether it aligns with prior cells.

## Record to Trace

```
R1C3:field_methodological=cs-distributed|ai-ml|network-science|math-logic;primary_method=proof|experiment|simulation|analytical;method_count=N;aligns_with_consensus=true|false
```

## Navigate

- S: [R2C3](cell_R2_C3.md) — Next phase
- N: [R0C3](cell_R0_C3.md) — Previous phase
- E: [R1C4](cell_R1_C4.md) — Next perspective
- W: [R1C2](cell_R1_C2.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
