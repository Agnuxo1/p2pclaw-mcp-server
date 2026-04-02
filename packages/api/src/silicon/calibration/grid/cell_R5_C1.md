# CALIBRATION [R5, C1] - CALIBRATION-ADJUST: EMPIRICAL

**Trace**: R5C1  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: EMPIRICAL
**Focus**: Apply evidence-gap penalties to raw LLM scores

---

## State

You have raw LLM scores and the evidence comparison from R4C1. Apply penalties
when claims outpace evidence.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Extraordinary claims penalty**:
   - Count extraordinary claims (superlatives: "revolutionary", "first-ever", "solves")
   - Count evidence markers (tables, figures, p-values, named benchmarks)
   - If `extraordinary_claims > 2 AND evidence_markers < 3`:
     - Penalize novelty by -2
     - Penalize methodology by -2

2. **Placeholder reference penalty**:
   - If references contain placeholder text ("[Author, Year]", "TODO", "ibid" without
     prior reference): cap references score at 1

3. **Missing baseline penalty**:
   - If paper reports results but compares to zero baselines:
     - Cap results_quality at 4
   - If paper compares to baselines but doesn't name them:
     - Cap results_quality at 5

4. **Vague metric penalty**:
   - Count vague metric phrases ("significant improvement", "better performance",
     "state-of-the-art results" without numbers)
   - Each vague metric: -0.5 from results_quality (floor 0)

5. **Apply all empirical adjustments**:
   ```
   adjusted[dim] = max(0, min(raw[dim], cap[dim]) + penalty[dim])
   ```

## Record to Trace

```
R5C1:{claims=N,evidence=N,claim_evidence_ratio=N.N,penalties={dim:val,...},vague_metrics=N}
```

## Navigate

- N: [R4C1](cell_R4_C1.md) — Evidence comparison
- S: [R6C1](cell_R6_C1.md) — Evidence verdict
- E: [R5C2](cell_R5_C2.md) — Depth calibration
- W: [R5C0](cell_R5_C0.md) — Structural penalties

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
