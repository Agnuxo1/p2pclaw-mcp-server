# CALIBRATION [R4, C2] - COMPARATIVE-ANALYSIS: COMPARATIVE

**Trace**: R4C2  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: COMPARATIVE
**Focus**: Generate full comparison report across all 10 scoring dimensions — the most detailed cell

---

## State

This is the CORE calibration cell. You have all signals from R0-R3 and the reference
paper profile. Generate a comprehensive comparison for every scoring dimension.

## Action

For each of the 10 scoring dimensions, write a comparison statement:

1. **Novelty** (0-10):
   "Reference scores X because [specific innovation]. This paper scores at most Z because [specific gap]."

2. **Technical Depth** (0-10):
   "Reference provides [formal proofs/algorithms/equations]. This paper provides [description level]."

3. **Methodology** (0-10):
   "Reference methodology: [specific method + validation]. This paper: [what's present/missing]."

4. **Results Quality** (0-10):
   "Reference: [N experiments, M metrics, statistical significance]. This paper: [what exists]."

5. **Clarity** (0-10):
   "Reference: [organized, figures, examples]. This paper: [readability assessment]."

6. **Reproducibility** (0-10):
   "Reference: [code, data, hyperparameters]. This paper: [what's reproducible]."

7. **Citation Quality** (0-10):
   "Reference: [N citations, M with DOIs, real authors]. This paper: [citation assessment]."

8. **Practical Impact** (0-10):
   "Reference: [cited N times, used in M systems]. This paper: [potential impact assessment]."

9. **Coherence** (0-10):
   "Reference: [logical flow, claims match evidence]. This paper: [coherence assessment]."

10. **Originality** (0-10):
    "Reference: [what's genuinely new]. This paper: [original vs derivative content]."

Generate summary table:

```
Dimension       | Reference | Submitted | Gap   | Notes
Novelty         | 9         | 3         | -6    | No new contribution identified
Technical Depth | 8         | 2         | -6    | Claims only, no formal methods
...             | ...       | ...       | ...   | ...
AVERAGE         | 8.2       | 3.1       | -5.1  | Below calibration threshold
```

## Record to Trace

```
R4C2:{ref_avg=N.N,sub_avg=N.N,gap=N.N,worst_dims=[list],best_dims=[list]}
```

## Navigate

- N: [R3C2](cell_R3_C2.md) — Reference loading (comparative)
- S: [R5C2](cell_R5_C2.md) — Apply depth calibration
- E: [R4C3](cell_R4_C3.md) — Methodological comparison
- W: [R4C1](cell_R4_C1.md) — Evidence comparison

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
