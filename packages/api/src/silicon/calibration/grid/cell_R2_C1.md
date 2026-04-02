# CALIBRATION [R2, C1] - REFERENCE-LOAD: EMPIRICAL

**Trace**: R2C1  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: EMPIRICAL
**Focus**: Note what kind of evidence reference papers provide -- p-values, BLEU scores, error rates, benchmarks.

---

## State

Each field has characteristic forms of empirical evidence. The examiner now catalogs what **kinds of evidence** the reference papers in the detected field typically present. This creates an evidence checklist: if the submitted paper claims results in a field but lacks the expected evidence types, it will score poorly.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
2. **Catalog evidence types by field**:
   - **cs-distributed**:
     - Lamport (1982): No empirical data (pure theory paper). Evidence = formal proofs of safety and liveness.
     - Nakamoto (2008): Probabilistic argument (attacker success probability vs hash power). Evidence = mathematical model, no experiments.
     - Ongaro (2014) Raft: User study (time to learn), log replication benchmarks (ops/sec), leader election convergence time.
     - **Expected evidence**: throughput (tx/s), latency (ms), fault tolerance threshold, message complexity.
   - **ai-ml**:
     - Vaswani (2017): BLEU scores on WMT translation benchmarks, training cost in FLOPs, attention visualization.
     - Krizhevsky (2012): Top-1 and top-5 error rates on ImageNet, training time on 2x GTX 580 GPUs.
     - Silver (2016): Win rate vs professional players, Elo rating, search efficiency (positions evaluated/move).
     - **Expected evidence**: accuracy/F1/BLEU, training curves, ablation tables, comparison with SOTA.
   - **network-science**:
     - Watts-Strogatz (1998): Clustering coefficient C(p) and path length L(p) as functions of rewiring probability.
     - Barabasi-Albert (1999): Degree distribution P(k) ~ k^(-gamma), gamma values for WWW and actor networks.
     - **Expected evidence**: degree distributions, clustering coefficients, path lengths, power-law fits.
   - **math-logic**:
     - Turing (1936): No empirical data. Evidence = construction of universal machine, halting proof.
     - Shannon (1948): Channel capacity formula, entropy calculations for English text (~1.0 bit/character).
     - **Expected evidence**: theorems with proofs, complexity bounds, information-theoretic quantities.
3. **Build the evidence checklist** for the detected field: list the minimum evidence types a credible paper should contain.
4. **Note evidence quality markers**: Are confidence intervals reported? Are baselines compared? Are results reproducible?

## Record to Trace

```
R2C1:evidence_types=list;min_expected=N;quality_markers=ci|baselines|reproducible;ref_strongest=AuthorYear
```

## Navigate

- S: [R3C1](cell_R3_C1.md) — Next phase
- N: [R1C1](cell_R1_C1.md) — Previous phase
- E: [R2C2](cell_R2_C2.md) — Next perspective
- W: [R2C0](cell_R2_C0.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
