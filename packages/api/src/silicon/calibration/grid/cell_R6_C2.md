# CALIBRATION [R6, C2] - VERDICT-SYNTHESIS: COMPARATIVE

**Trace**: R6C2  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: COMPARATIVE
**Focus**: Overall comparative verdict — the most important verdict cell

---

## State

This is the culmination of the calibration board. Merge all calibrated scores from
every perspective (R5 C0-C5) into the final calibrated score set.

## Action

1. **Merge all calibration adjustments**:
   For each dimension, take the MINIMUM of all caps applied across perspectives:
   ```
   final[dim] = min(
     structural_adjusted[dim],   // from R5C0
     empirical_adjusted[dim],    // from R5C1
     comparative_adjusted[dim],  // from R5C2
     rigor_adjusted[dim],        // from R5C3
     citation_adjusted[dim],     // from R5C4
     adversarial_adjusted[dim]   // from R5C5
   )
   ```

2. **Generate full comparison report**:

   ```
   CALIBRATED SCORE REPORT
   =======================
   Dimension        | Raw | Structural | Empirical | Rigor | Citation | Adversarial | FINAL
   Novelty          | 7   | 7          | 5         | 5     | 6        | 4           | 4
   Technical Depth  | 6   | 4          | 6         | 3     | 6        | 4           | 3
   Methodology      | 5   | 4          | 3         | 4     | 5        | 4           | 3
   Results Quality  | 6   | 4          | 4         | 4     | 6        | 1           | 1
   Clarity          | 8   | 8          | 8         | 8     | 8        | 6           | 6
   Reproducibility  | 4   | 4          | 3         | 3     | 3        | 2           | 2
   Citations        | 5   | 5          | 5         | 5     | 2        | 3           | 2
   Practical Impact | 6   | 6          | 6         | 4     | 6        | 4           | 4
   Coherence        | 7   | 5          | 7         | 7     | 7        | 5           | 5
   Originality      | 6   | 6          | 6         | 6     | 5        | 4           | 4
   ─────────────────┼─────┼────────────┼───────────┼───────┼──────────┼─────────────┼──────
   AVERAGE          | 6.0 | 5.3        | 5.3       | 4.9   | 5.4      | 3.7         | 3.4
   ```

3. **Calibration delta**: `raw_average - final_average = calibration_adjustment`

4. **Comparative verdict statement**:
   ```
   "Raw LLM average: X.X. Calibrated average: Y.Y. Adjustment: -Z.Z points.
    Largest penalty source: [perspective]. Most impacted dimension: [dim].
    This paper is approximately N% of reference quality."
   ```

## Record to Trace

```
R6C2:{raw_avg=N.N,calibrated_avg=N.N,delta=-N.N,worst_perspective=NAME,worst_dim=NAME,ref_pct=NN%}
```

## Navigate

- N: [R5C2](cell_R5_C2.md) — Depth calibration
- S: [R7C2](cell_R7_C2.md) — Final grade (comparative)
- E: [R6C3](cell_R6_C3.md) — Rigor verdict
- W: [R6C1](cell_R6_C1.md) — Evidence verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
