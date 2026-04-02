# CALIBRATION [R7, C3] - GRADE-ASSIGN: METHODOLOGICAL

**Trace**: R7C3  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: METHODOLOGICAL
**Focus**: Final grade from the methodological perspective — TERMINUS node

---

## State

This is a TERMINUS node. The methodological evaluation is complete. Assign the final
grade based on all rigor calibration performed in R0-R6.

## Action

1. **Final calibrated score** (from R6C3):
   - Methodology calibrated score: N.N / 10
   - Reproducibility calibrated score: N.N / 10
   - Results calibrated score: N.N / 10
   - Rigor level achieved: N / 5

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
   "This paper achieves rigor level N/5 vs reference level M/5.
    Gap of G levels. Methodology score: N.N vs reference benchmark of M.M."

4. **Top 3 methodological improvements needed**:
   1. [Specific rigor improvement — e.g., "Add TLA+ or formal specification"]
   2. [Second — e.g., "Run controlled experiment with n>30 participants"]
   3. [Third — e.g., "Include ablation study removing each component"]

5. **Rigor roadmap** (path from current level to next):
   ```
   Current: Level N (DESCRIPTION)
   Next:    Level N+1 (DESCRIPTION)
   Action:  SPECIFIC STEPS to reach next level
   ```

6. **Complete methodological trace summary**:
   ```
   R0C3: methodology_present=bool
   R1C3: field_rigor_expectation=LEVEL
   R3C3: reference_rigor=LEVEL
   R4C3: rigor_gap=N, formal_methods=bool
   R5C3: rigor_cap=N, field_type=TYPE
   R6C3: tier=TIER, verdict=STATEMENT
   R7C3: grade=LETTER, score=N.N, rigor=N/5
   ```

## Record to Trace

```
R7C3:{grade=LETTER,score=N.N,rigor=N/5,ref_rigor=N/5,gap=N,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C3](cell_R6_C3.md) — Rigor verdict (backtrack)
- E: [R7C4](cell_R7_C4.md) — Citation grade
- W: [R7C2](cell_R7_C2.md) — Comparative grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
