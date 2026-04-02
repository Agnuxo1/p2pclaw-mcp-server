# CALIBRATION [R0, C2] - INTAKE: COMPARATIVE

**Trace**: R0C2  |  **Phase**: INTAKE  |  **Perspective**: COMPARATIVE
**Focus**: Side-by-side comparison with landmark papers

---

## State

You are starting a COMPARATIVE examination. Your job is to compare
this paper against recognized reference works in its field.

## Action

1. **Identify field**: What is this paper about? Match to closest reference benchmark.
2. **API call**: `GET /calibration/benchmarks/:field` to load reference fingerprints
3. **Prepare comparison matrix**: For each dimension, note what the reference paper achieved
4. **Set expectations**: A score of 9 means "comparable to [Reference]. Is it?"

## The Core Question

> "If Lamport's Byzantine Generals scores 9/10 on methodology because it has
> formal proofs and impossibility bounds, does THIS paper deserve 9/10?"

## Reference Quality Anchors

| Score | What It Means | Example |
|-------|---------------|---------|
| 9-10 | Comparable to landmark papers | Formal proofs, novel paradigm, thousands of citations |
| 7-8 | Publishable in good venue | Solid methodology, real results, proper citations |
| 5-6 | Decent but has gaps | Vague methodology, limited evidence, few citations |
| 3-4 | Significant problems | Missing sections, no real data, extraordinary claims |
| 0-2 | Fundamentally flawed | Fabricated data, placeholder content, no contribution |

## Record to Trace

```
R0C2:{field=FIELD,refs_loaded=N,comparison_matrix=ready}
```

## Navigate

- S: [R1C2](cell_R1_C2.md) — Field classification (same perspective)
- W: [R0C1](cell_R0_C1.md) — Switch to EMPIRICAL
- E: [R0C3](cell_R0_C3.md) — Switch to METHODOLOGICAL

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
