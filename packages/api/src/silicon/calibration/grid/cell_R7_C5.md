# CALIBRATION [R7, C5] - GRADE-ASSIGN: ADVERSARIAL

**Trace**: R7C5  |  **Phase**: GRADE-ASSIGN  |  **Perspective**: ADVERSARIAL
**Focus**: Final grade from the adversarial perspective — TERMINUS node

---

## State

This is a TERMINUS node. The adversarial evaluation is complete. Assign the final
integrity-informed grade based on all red flag analysis in R0-R6.

## Action

1. **Final calibrated score** (from R6C5):
   - Integrity status: PASS | CAUTION | WARN | FAIL
   - Total red flags: N (C critical, H high, M medium)
   - Total points deducted: N.N
   - Fabrication detected: YES / NO

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

   Special rule: If integrity status is FAIL, grade cannot exceed D regardless of score.

3. **Comparison statement**:
   "This paper has N red flags (reference papers have 0).
    Integrity status: STATUS. Points deducted: N.N.
    Constraint violations: [list or 'none']."

4. **Top 3 integrity improvements needed**:
   1. [Most critical fix — e.g., "Remove impossible WS path length claim of 2.3 for N=10M"]
   2. [Second — e.g., "Replace fabricated precision (15 decimals) with measured values"]
   3. [Third — e.g., "Provide evidence for 'revolutionary breakthrough' claim or remove it"]

5. **Complete adversarial trace summary**:
   ```
   R0C5: red_flags_initial=N
   R1C5: field_constraints=DESCRIPTION
   R3C5: reference_flags=0
   R4C5: flags=N, critical=N, density=N.N
   R5C5: global_penalty=N.N, integrity=STATUS
   R6C5: severity=STATUS, total_deducted=N.N
   R7C5: grade=LETTER, score=N.N, integrity=STATUS
   CALIBRATION BOARD COMPLETE — ALL TRACES RECORDED
   ```

## Record to Trace

```
R7C5:{grade=LETTER,score=N.N,integrity=STATUS,flags=N,deducted=N.N,improvements=[1,2,3],trace_complete=true}
```

## Navigate

- N: [R6C5](cell_R6_C5.md) — Integrity verdict (backtrack)
- E: [R7C0](cell_R7_C0.md) — Structural grade (wrap)
- W: [R7C4](cell_R7_C4.md) — Citation grade

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
