# CALIBRATION [R5, C0] - CALIBRATION-ADJUST: STRUCTURAL

**Trace**: R5C0  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: STRUCTURAL
**Focus**: Apply section-missing and word-count penalties to raw LLM scores

---

## State

You have raw LLM scores and the structural comparison from R4C0. Apply mathematical
calibration adjustments so that structural deficiencies are reflected in the final score.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Section-missing penalty**:
   - For each of the 7 mandatory sections (Abstract, Introduction, Methodology,
     Results, Discussion, Conclusion, References):
   - If section is MISSING entirely: set that dimension's score = 0
   - If section is a stub (< 50 words): cap that dimension at 3

2. **Word count penalty**:
   - If total words < 30% of reference average:
     - Cap methodology score at 4
     - Cap results score at 4
     - Cap technical_depth at 4
   - If total words < 15% of reference average:
     - Cap ALL content scores at 3

3. **Balance penalty**:
   - If any single section is > 60% of total content: cap coherence at 5
   - If methodology + results combined < 20% of total: cap reproducibility at 4

4. **Apply adjustments**:
   ```
   adjusted[dim] = min(raw[dim], cap[dim])
   ```
   Never adjust upward — calibration only penalizes.

## Record to Trace

```
R5C0:{penalties_applied=N,caps={dim:val,...},max_cap_impact=N.N,sections_zeroed=[list]}
```

## Navigate

- N: [R4C0](cell_R4_C0.md) — Structural comparison
- S: [R6C0](cell_R6_C0.md) — Structural verdict
- E: [R5C1](cell_R5_C1.md) — Evidence-gap penalties
- W: [R5C5](cell_R5_C5.md) — Red flag penalties

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
