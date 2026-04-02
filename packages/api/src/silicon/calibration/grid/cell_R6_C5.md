# CALIBRATION [R6, C5] - VERDICT-SYNTHESIS: ADVERSARIAL

**Trace**: R6C5  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: ADVERSARIAL
**Focus**: Synthesize red flag findings into an integrity verdict statement

---

## State

All adversarial analysis is complete (R0-R5 adversarial column). Synthesize into
a clear integrity verdict. This is the gate that can reject papers entirely.

## Action

1. **Generate integrity verdict statement**:
   ```
   "N red flags detected. Severity breakdown: C critical, H high, M medium.
    Total penalty impact: X.X points across all dimensions.
    Constraint violations: [list or 'none'].
    Integrity status: PASS | WARN | FAIL."
   ```

2. **Integrity tier**:
   - **PASS** (0 red flags): No integrity concerns detected
   - **CAUTION** (1-2 medium flags): Minor issues, proceed with adjusted scores
   - **WARN** (1 critical or 3+ medium flags): Significant concerns, scores heavily penalized
   - **FAIL** (2+ critical flags or fabricated data): Paper should be rejected

3. **Compile adversarial score adjustments**:
   ```
   global_penalty: -N.N applied to all dimensions
   critical_penalties: results=-3, methodology=-2
   fabrication_cap: all scores capped at 3 (if triggered)
   total_points_deducted: N.N
   ```

4. **Adversarial impact summary**:
   - Most impacted dimension and by how much
   - Whether fabrication cap was triggered
   - Whether integrity FAIL was triggered (paper rejection recommended)

5. **Integrity recommendation**:
   - PASS: "No integrity issues — proceed to grading"
   - CAUTION: "Minor flags noted — scores adjusted, paper acceptable"
   - WARN: "Significant integrity concerns — author should address [specific flags]"
   - FAIL: "Integrity failure — recommend rejection. Specific violations: [list]"

## Record to Trace

```
R6C5:{verdict="STATEMENT",flags=N,severity=PASS|CAUTION|WARN|FAIL,total_deducted=N.N,fabricated=bool}
```

## Navigate

- N: [R5C5](cell_R5_C5.md) — Red flag penalties
- S: [R7C5](cell_R7_C5.md) — Final grade (adversarial)
- E: [R6C0](cell_R6_C0.md) — Structural verdict (wrap)
- W: [R6C4](cell_R6_C4.md) — Citation verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
