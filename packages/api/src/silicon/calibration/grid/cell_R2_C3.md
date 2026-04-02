# CALIBRATION [R2, C3] - REFERENCE-LOAD: METHODOLOGICAL

**Trace**: R2C3  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: METHODOLOGICAL
**Focus**: Note what formal methods reference papers use -- proofs, TLA+, user studies, ablations, simulations.

---

## State

The examiner catalogs the **methodological toolkit** characteristic of the detected field's best papers. This creates a methods baseline: a paper that claims to advance a field but uses none of that field's standard methods is likely superficial.

Methods are the hardest thing to fake. An LLM can generate plausible-sounding text about consensus, but it cannot produce a valid TLA+ specification or a correct convergence proof. This cell loads the methodological bar that the submitted paper must clear.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
2. **Catalog methods by reference paper**:
   - **cs-distributed**:
     - Lamport (1982): Oral messages algorithm, formal proof of impossibility with f >= n/3 traitors, inductive proof structure
     - Nakamoto (2008): Probabilistic analysis (Poisson process for block times), random walk model for attacker success
     - Ongaro (2014) Raft: TLA+ formal specification, proof of safety invariant, controlled user study (N=43 students), log replication benchmark
   - **ai-ml**:
     - Vaswani (2017): Ablation study (removing components one at a time), scaling experiments, attention weight visualization
     - Krizhevsky (2012): Dropout regularization experiment, data augmentation analysis, multi-GPU training methodology
     - Silver (2016): Self-play training, Monte Carlo tree search integration, evaluation against calibrated opponents
   - **network-science**:
     - Watts-Strogatz (1998): Rewiring algorithm, numerical simulation over parameter sweep p in [0,1], analytical approximation for C(p)
     - Barabasi-Albert (1999): Preferential attachment simulation, mean-field analytical solution, fit to three real networks
   - **math-logic**:
     - Turing (1936): Constructive proof (builds universal machine), diagonalization argument
     - Shannon (1948): Channel coding theorem proof, entropy definition from axioms, redundancy analysis of English
3. **Extract the methodological minimum** for the field:
   - `cs-distributed`: at least one formal argument (proof sketch or model) + at least one quantitative evaluation
   - `ai-ml`: controlled experiment with baselines + ablation or sensitivity analysis
   - `network-science`: model definition + analytical or simulation results + fit to real data
   - `math-logic`: formal definitions + at least one proof + complexity or impossibility result
4. **Store the methods baseline** for comparison in R3C3.

## Record to Trace

```
R2C3:methods_cataloged=N;min_methods=list;strongest_ref_method=description;field_requires_proof=true|false
```

## Navigate

- S: [R3C3](cell_R3_C3.md) — Next phase
- N: [R1C3](cell_R1_C3.md) — Previous phase
- E: [R2C4](cell_R2_C4.md) — Next perspective
- W: [R2C2](cell_R2_C2.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
