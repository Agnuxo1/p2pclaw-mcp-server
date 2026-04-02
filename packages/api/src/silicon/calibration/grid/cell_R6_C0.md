# CALIBRATION [R6, C0] - VERDICT-SYNTHESIS: STRUCTURAL

**Trace**: R6C0  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: STRUCTURAL
**Focus**: Synthesize structural findings into a structural verdict statement

---

## State

All structural analysis is complete (R0-R5 structural column). Synthesize everything
into a clear structural verdict with calibrated scores.

## Action

1. **Generate structural verdict statement**:
   ```
   "Paper has N/7 mandatory sections, M total words.
    Compared to reference average of X words, this is Y%.
    Stub sections: [list]. Missing sections: [list].
    Organization level: N/5 vs reference N/5."
   ```

2. **Compile structural score adjustments**:
   - Original raw score for structure dimension
   - Penalties applied at R5C0 (section-missing, word count, balance)
   - Final calibrated structure score

3. **Structural impact on other dimensions**:
   List which non-structural dimensions were capped due to structural deficiencies:
   ```
   methodology: capped at 4 (word count < 30% of reference)
   results: capped at 4 (word count < 30% of reference)
   coherence: capped at 5 (section imbalance > 60%)
   ```

4. **Structural recommendation**:
   - If structure score >= 7: "Structure is adequate for evaluation"
   - If structure score 4-6: "Structure needs improvement: [specific sections]"
   - If structure score < 4: "Structural deficiencies undermine entire evaluation"

## Record to Trace

```
R6C0:{verdict="STATEMENT",structure_score=N.N,raw=N.N,caps_applied=N,recommendation=adequate|improve|deficient}
```

## Navigate

- N: [R5C0](cell_R5_C0.md) — Structural penalties
- S: [R7C0](cell_R7_C0.md) — Final grade (structural)
- E: [R6C1](cell_R6_C1.md) — Evidence verdict
- W: [R6C5](cell_R6_C5.md) — Integrity verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
