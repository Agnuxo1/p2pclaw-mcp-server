# CALIBRATION [R5, C3] - CALIBRATION-ADJUST: METHODOLOGICAL

**Trace**: R5C3  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: METHODOLOGICAL
**Focus**: Apply rigor calibration based on field expectations and rigor ladder gap

---

## State

You have the rigor comparison from R4C3 (rigor levels for reference and submitted).
Apply penalties when the paper falls short of the field's methodological expectations.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Rigor gap penalty**:
   - `rigor_gap = reference_rigor_level - submitted_rigor_level`
   - For each level of gap, apply cumulative penalties:
     - Gap 1: cap methodology at 7
     - Gap 2: cap methodology at 5, cap reproducibility at 6
     - Gap 3: cap methodology at 4, cap reproducibility at 4
     - Gap 4: cap methodology at 3, cap reproducibility at 3, cap results at 4
     - Gap 5: cap all content scores at 3

2. **Field-specific rigor expectations**:
   - **Math/Logic fields** (field has proofs): If paper has no proofs at all,
     cap methodology at 4, cap novelty at 5
   - **Empirical fields** (field has experiments): If paper has no experiments,
     cap results at 3, cap reproducibility at 3
   - **Systems fields** (field has implementations): If paper has no implementation,
     cap practical_impact at 4

3. **Formal methods bonus** (rare upward adjustment):
   - If paper provides formal methods AND reference does NOT:
     - Allow +1 to methodology (only case where calibration adjusts upward)

4. **Apply rigor adjustments**:
   ```
   adjusted[dim] = min(raw[dim], rigor_cap[dim])
   if formal_bonus: adjusted["methodology"] = min(10, adjusted["methodology"] + 1)
   ```

## Record to Trace

```
R5C3:{rigor_gap=N,field_type=TYPE,caps={dim:val,...},formal_bonus=bool,method_cap=N}
```

## Navigate

- N: [R4C3](cell_R4_C3.md) — Rigor comparison
- S: [R6C3](cell_R6_C3.md) — Rigor verdict
- E: [R5C4](cell_R5_C4.md) — Citation penalties
- W: [R5C2](cell_R5_C2.md) — Depth calibration

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
