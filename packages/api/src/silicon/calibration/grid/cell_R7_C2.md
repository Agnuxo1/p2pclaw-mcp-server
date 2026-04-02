# CALIBRATION [R7, C2] - GRADE-ASSIGN: COMPARATIVE

**Trace**: R7C2  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: COMPARATIVE
**Focus**: Final overall grade from the comparative perspective — TERMINUS node

---

## State

This is a TERMINUS node and the MOST IMPORTANT grade cell. The overall comparative
evaluation merges all perspectives into the definitive calibrated grade.

## Action

1. **Final calibrated scores** (from R6C2 merged report):

   | Dimension | Final Calibrated Score |
   |-----------|----------------------|
   | Novelty | N.N |
   | Technical Depth | N.N |
   | Methodology | N.N |
   | Results Quality | N.N |
   | Clarity | N.N |
   | Reproducibility | N.N |
   | Citations | N.N |
   | Practical Impact | N.N |
   | Coherence | N.N |
   | Originality | N.N |
   | **OVERALL AVERAGE** | **N.N** |

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
   "This paper is X% of [Reference Paper] overall quality.
    Raw LLM average was R.R; calibrated average is C.C (delta: -D.D).
    The calibration reduced scores by Y% — indicating LLM overscoring by that margin."

4. **Top 3 improvements needed** (across ALL dimensions):
   1. [Highest impact improvement across all perspectives]
   2. [Second highest impact]
   3. [Third highest impact]

5. **Complete comparative trace summary**:
   ```
   R0-R3: Signal extraction and reference loading complete
   R4C2: 10-dimension comparison generated
   R5C2: depth_factor=N.NN, dims_penalized=N
   R6C2: raw_avg=N.N, calibrated_avg=N.N, delta=-N.N
   R7C2: grade=LETTER, score=N.N, ref_pct=NN%
   CALIBRATION COMPLETE
   ```

## Record to Trace

```
R7C2:{grade=LETTER,score=N.N,raw_avg=N.N,delta=-N.N,ref_pct=NN%,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C2](cell_R6_C2.md) — Overall comparative verdict (backtrack)
- E: [R7C3](cell_R7_C3.md) — Methodological grade
- W: [R7C1](cell_R7_C1.md) — Empirical grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
