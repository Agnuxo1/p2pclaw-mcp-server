# CALIBRATION [R7, C4] - GRADE-ASSIGN: CITATION

**Trace**: R7C4  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: CITATION
**Focus**: Final grade from the citation perspective — TERMINUS node

---

## State

This is a TERMINUS node. The citation evaluation is complete. Assign the final
grade based on all citation calibration performed in R0-R6.

## Action

1. **Final calibrated score** (from R6C4):
   - References calibrated score: N.N / 10
   - Citation quality calibrated score: N.N / 10
   - Citation authenticity: AUTHENTIC | MIXED | FABRICATED | ABSENT

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
   "This paper cites N references (M with DOIs).
    Reference average for field: X citations.
    Citation ratio: N/X = Y%. Authenticity: STATUS."

4. **Top 3 citation improvements needed**:
   1. [Most impactful — e.g., "Add DOIs for all 12 references"]
   2. [Second — e.g., "Cite Lamport 1982 and Ongaro 2014 as canonical works"]
   3. [Third — e.g., "Replace 3 suspect references with verifiable publications"]

5. **Complete citation trace summary**:
   ```
   R0C4: inline_refs=N, ref_section=bool
   R1C4: field_citation_norms=DESCRIPTION
   R3C4: reference_citations=N
   R4C4: ratio=NN%, fabrication_flags=N
   R5C4: ref_cap=N, quality_cap=N
   R6C4: tier=TIER, authentic=bool
   R7C4: grade=LETTER, score=N.N
   ```

## Record to Trace

```
R7C4:{grade=LETTER,score=N.N,refs=N,dois=N,authentic=STATUS,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C4](cell_R6_C4.md) — Citation verdict (backtrack)
- E: [R7C5](cell_R7_C5.md) — Adversarial grade
- W: [R7C3](cell_R7_C3.md) — Methodological grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
