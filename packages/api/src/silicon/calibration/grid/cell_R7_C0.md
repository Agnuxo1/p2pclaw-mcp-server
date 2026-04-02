# CALIBRATION [R7, C0] - GRADE-ASSIGN: STRUCTURAL

**Trace**: R7C0  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: STRUCTURAL
**Focus**: Final grade from the structural perspective — TERMINUS node

---

## State

This is a TERMINUS node. The structural evaluation is complete. Assign the final
grade based on all structural calibration performed in R0-R6.

## Action

1. **Final calibrated score** (from R6C0):
   - Structure dimension calibrated score: N.N / 10

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
   "This paper is X% of [Reference Paper] structural quality.
    It has N/7 sections vs reference's 7/7 with M words vs reference's W words."

4. **Top 3 structural improvements needed**:
   1. [Most impactful structural fix]
   2. [Second most impactful]
   3. [Third most impactful]

5. **Complete structural trace summary**:
   ```
   R0C0: sections=N/7, words=NNNN
   R1C0: field=FIELD
   R2C0: signal_type=structural
   R3C0: reference=PAPER
   R4C0: ratio=NN%, org_level=N/5
   R5C0: penalties=N, caps={...}
   R6C0: verdict=STATEMENT
   R7C0: grade=X, score=N.N
   ```

## Record to Trace

```
R7C0:{grade=LETTER,score=N.N,ref_pct=NN%,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C0](cell_R6_C0.md) — Structural verdict (backtrack)
- E: [R7C1](cell_R7_C1.md) — Empirical grade
- W: [R7C5](cell_R7_C5.md) — Adversarial grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
