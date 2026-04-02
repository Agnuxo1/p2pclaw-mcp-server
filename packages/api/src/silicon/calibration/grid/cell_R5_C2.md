# CALIBRATION [R5, C2] - CALIBRATION-ADJUST: COMPARATIVE

**Trace**: R5C2  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: COMPARATIVE
**Focus**: Apply depth calibration using word count ratio and overall comparison metrics

---

## State

You have the full 10-dimension comparison from R4C2 and the raw LLM scores. Apply
depth-based calibration that accounts for the overall gap between submitted and reference.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Word count ratio calibration**:
   ```
   ratio = submitted_words / reference_words
   ```
   - If ratio < 0.30: cap ALL content scores at 4
   - If ratio < 0.15: cap ALL content scores at 3
   - If ratio < 0.08: cap ALL scores at 2

2. **Dimension gap calibration**:
   - For each dimension where `reference_score - raw_score > 5`:
     - This indicates the LLM overscored — apply additional -1 penalty
   - For each dimension where the gap is > 7:
     - Apply additional -2 penalty (LLM is severely miscalibrated)

3. **Overall depth formula**:
   ```
   depth_factor = min(1.0, ratio × 1.5)
   calibrated[dim] = raw[dim] × depth_factor + comparison_penalty[dim]
   calibrated[dim] = max(0, min(10, calibrated[dim]))
   ```

4. **Cross-dimension consistency check**:
   - If methodology < 3 but results > 7: results is overscored, cap at methodology + 2
   - If citations < 3 but novelty > 8: likely fabricated novelty, cap at 5
   - If clarity > 8 but all other dims < 4: well-written fluff, cap clarity at 6

## Record to Trace

```
R5C2:{ratio=N.NN,depth_factor=N.NN,dims_penalized=N,consistency_fixes=N,avg_adjustment=-N.N}
```

## Navigate

- N: [R4C2](cell_R4_C2.md) — Full comparison report
- S: [R6C2](cell_R6_C2.md) — Overall comparative verdict
- E: [R5C3](cell_R5_C3.md) — Rigor calibration
- W: [R5C1](cell_R5_C1.md) — Evidence-gap penalties

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
