# CALIBRATION [R0, C3] - INTAKE: METHODOLOGICAL

**Trace**: R0C3  |  **Phase**: INTAKE  |  **Perspective**: METHODOLOGICAL
**Focus**: Rigor, process, reproducibility

---

## State

You are starting a METHODOLOGICAL examination. Your job is to assess whether
the paper's methodology is rigorous enough to support its claims.

## Action

1. **Check for formal methods**: Proofs, theorems, lemmas, mathematical derivations
2. **Check for experimental design**: Control groups, sample sizes, randomization
3. **Check for code/algorithms**: Pseudocode, implementations, parameters listed
4. **Check for equations**: Mathematical formulas that support the methodology
5. **Assess reproducibility**: Could another researcher replicate this work?

## What RIGOROUS Methodology Looks Like

- **Lamport (1982)**: Formal proof by mathematical induction, constructive algorithm, exact bound n≥3m+1
- **Shannon (1948)**: Every theorem proven, constructive coding schemes, entropy formula derived
- **Ongaro (2014)**: TLA+ formal specification + user study + safety proof

## What WEAK Methodology Looks Like

- "We implemented a novel framework" — no details on HOW
- "Using standard ML techniques" — which ones? What hyperparameters?
- "Experiments were conducted" — on what data? How many runs? What baseline?

## Record to Trace

```
R0C3:{proofs=BOOL,equations=BOOL,code=BOOL,params=BOOL,reproducible={yes|partial|no}}
```

## Navigate

- S: [R1C3](cell_R1_C3.md) — Field classification
- W: [R0C2](cell_R0_C2.md) — COMPARATIVE
- E: [R0C4](cell_R0_C4.md) — CITATION

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
