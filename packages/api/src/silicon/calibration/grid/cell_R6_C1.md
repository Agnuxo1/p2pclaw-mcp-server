# CALIBRATION [R6, C1] - VERDICT-SYNTHESIS: EMPIRICAL

**Trace**: R6C1  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: EMPIRICAL
**Focus**: Synthesize evidence findings into an empirical verdict statement

---

## State

All empirical analysis is complete (R0-R5 empirical column). Synthesize everything
into a clear evidence verdict with calibrated scores.

## Action

1. **Generate evidence verdict statement**:
   ```
   "Paper has N evidence markers vs reference average of M.
    Evidence ratio: N/M = X%.
    Quantitative results: Y (tables/figures/metrics).
    Unsupported claims: Z.
    Vague metrics: W."
   ```

2. **Evidence quality tier**:
   - **Strong** (ratio > 0.7): Evidence comparable to reference quality
   - **Moderate** (ratio 0.3-0.7): Some evidence but significant gaps
   - **Weak** (ratio 0.1-0.3): Minimal evidence, mostly claims
   - **None** (ratio < 0.1): No meaningful evidence presented

3. **Compile empirical score adjustments**:
   - Raw scores for results, methodology, reproducibility
   - Penalties from R5C1 (extraordinary claims, placeholder refs, missing baselines)
   - Final calibrated empirical scores

4. **Empirical impact summary**:
   ```
   results_quality: raw=N → calibrated=N (penalty: claim-evidence gap)
   methodology: raw=N → calibrated=N (penalty: no baselines)
   reproducibility: raw=N → calibrated=N (penalty: no artifacts)
   ```

5. **Evidence recommendation**:
   - If evidence tier is Strong: "Evidence supports the claims made"
   - If Moderate: "Add [specific missing evidence types] to strengthen"
   - If Weak/None: "Paper lacks empirical foundation — claims are unsubstantiated"

## Record to Trace

```
R6C1:{verdict="STATEMENT",evidence_ratio=NN%,tier=strong|moderate|weak|none,unsupported=N}
```

## Navigate

- N: [R5C1](cell_R5_C1.md) — Evidence-gap penalties
- S: [R7C1](cell_R7_C1.md) — Final grade (empirical)
- E: [R6C2](cell_R6_C2.md) — Overall comparative verdict
- W: [R6C0](cell_R6_C0.md) — Structural verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
