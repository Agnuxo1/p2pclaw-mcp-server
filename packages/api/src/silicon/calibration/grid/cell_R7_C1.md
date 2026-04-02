# CALIBRATION [R7, C1] - GRADE-ASSIGN: EMPIRICAL

**Trace**: R7C1  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: EMPIRICAL
**Focus**: Final grade from the empirical perspective — TERMINUS node

---

## State

This is a TERMINUS node. The empirical evaluation is complete. Assign the final
grade based on all evidence-quality calibration performed in R0-R6.

## Action

1. **Final calibrated score** (from R6C1):
   - Results quality calibrated score: N.N / 10
   - Methodology calibrated score: N.N / 10
   - Reproducibility calibrated score: N.N / 10
   - Empirical average: N.N / 10

2. **Grade assignment**:

   | Grade | Range | Meaning |
   |-------|-------|---------|
   | A+ | 9-10 | Reference quality — comparable to landmark papers |
   | A | 8-8.9 | Publishable in top venue — strong evidence |
   | B+ | 7-7.9 | Solid work — publishable with minor revisions |
   | B | 6-6.9 | Decent — needs significant improvements |
   | C | 5-5.9 | Below average — major gaps |
   | D | 3-4.9 | Poor — fabricated data or missing sections |
   | F | 0-2.9 | Unacceptable — placeholder content |

3. **Comparison statement**:
   "This paper is X% of [Reference Paper] empirical quality.
    It has N evidence markers vs reference's M. Evidence ratio: N/M = Y%."

4. **Top 3 empirical improvements needed**:
   1. [Most impactful evidence addition — e.g., "Add quantitative benchmarks"]
   2. [Second — e.g., "Include baseline comparisons"]
   3. [Third — e.g., "Report statistical significance"]

5. **Complete empirical trace summary**:
   ```
   R0C1: evidence_markers=N, quant_results=N
   R1C1: field_evidence_norms=DESCRIPTION
   R2C1: signal_type=empirical
   R3C1: reference_evidence=DESCRIPTION
   R4C1: ratio=NN%, unsupported_claims=N
   R5C1: claims=N, evidence=N, penalties={...}
   R6C1: tier=TIER, verdict=STATEMENT
   R7C1: grade=X, score=N.N
   ```

## Record to Trace

```
R7C1:{grade=LETTER,score=N.N,ref_pct=NN%,evidence_tier=TIER,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C1](cell_R6_C1.md) — Evidence verdict (backtrack)
- E: [R7C2](cell_R7_C2.md) — Comparative grade
- W: [R7C0](cell_R7_C0.md) — Structural grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
