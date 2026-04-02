# CALIBRATION [R5, C5] - CALIBRATION-ADJUST: ADVERSARIAL

**Trace**: R5C5  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: ADVERSARIAL
**Focus**: Apply red flag penalties — the harshest calibration adjustments

---

## State

You have the red flag inventory from R4C5. Red flags are the strongest negative signal.
Each one applies severe penalties because they indicate fabrication or fundamental errors.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Global red flag penalty formula**:
   ```
   penalty = min(4, red_flag_count × 1.5)
   ```
   Apply this penalty to ALL dimension scores:
   ```
   adjusted[dim] = max(0, raw[dim] - penalty)
   ```

2. **Severity-specific penalties**:
   - **CRITICAL red flags** (impossible values, placeholder text):
     - Each critical flag: -3 to results, -2 to methodology
     - If any critical flag: cap ALL scores at 5
   - **HIGH red flags** (fabricated precision, claims without evidence):
     - Each high flag: -2 to the most relevant dimension
   - **MEDIUM red flags** (circular reasoning, contradictions):
     - Each medium flag: -1 to coherence and clarity

3. **Fabricated data hard cap**:
   - If ANY data point is demonstrably fabricated (violates known physical
     constraints from R4C5): cap ALL scores at 3
   - This is the nuclear option — fabrication nullifies everything

4. **Cumulative impact calculation**:
   ```
   total_impact = sum(all_penalties_applied)
   if total_impact > 15: flag paper as "LIKELY FABRICATED"
   if total_impact > 25: flag paper as "REJECT — INTEGRITY FAILURE"
   ```

5. **Apply adversarial adjustments** (these stack with all other R5 penalties):
   ```
   final_adjusted[dim] = max(0, min(adjusted[dim], adversarial_cap[dim]) - global_penalty)
   ```

## Record to Trace

```
R5C5:{global_penalty=N.N,critical=N,high=N,medium=N,total_impact=N.N,fabricated=bool,integrity=PASS|WARN|FAIL}
```

## Navigate

- N: [R4C5](cell_R4_C5.md) — Red flag comparison
- S: [R6C5](cell_R6_C5.md) — Integrity verdict
- E: [R5C0](cell_R5_C0.md) — Structural penalties (wrap)
- W: [R5C4](cell_R5_C4.md) — Citation penalties

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
