# CALIBRATION [R6, C3] - VERDICT-SYNTHESIS: METHODOLOGICAL

**Trace**: R6C3  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: METHODOLOGICAL
**Focus**: Synthesize rigor findings into a methodological verdict statement

---

## State

All methodological analysis is complete (R0-R5 methodological column). Synthesize
into a clear rigor verdict.

## Action

1. **Generate rigor verdict statement**:
   ```
   "Rigor level: N/5. Reference rigor level: M/5. Gap: M-N levels.
    Formal methods present: [list or 'none'].
    Statistical tests present: [list or 'none'].
    Experimental validation: [present/absent].
    Field expectation: Level K minimum."
   ```

2. **Rigor tier assessment**:
   - **Exceeds field standard**: Paper rigor >= reference rigor
   - **Meets field standard**: Paper rigor within 1 level of reference
   - **Below field standard**: Paper rigor 2-3 levels below reference
   - **Critically below**: Paper rigor 4+ levels below reference

3. **Compile methodological score adjustments**:
   ```
   methodology: raw=N → calibrated=N (rigor gap penalty)
   reproducibility: raw=N → calibrated=N (no formal spec)
   results: raw=N → calibrated=N (no statistical tests)
   ```

4. **Methodological recommendation**:
   - If exceeds/meets: "Methodology is sound for field standards"
   - If below: "Add [formal methods/statistical tests/experiments] to match field norms"
   - If critically below: "Methodology is insufficient — paper reads as opinion, not research"

5. **Rigor improvement roadmap**:
   - Current level → next level: specific actions needed
   - Example: "Level 1 → Level 2: Add experimental design section with named datasets"
   - Example: "Level 2 → Level 3: Run experiments and report quantitative results"

## Record to Trace

```
R6C3:{verdict="STATEMENT",rigor=N/5,ref_rigor=N/5,gap=N,tier=exceeds|meets|below|critical}
```

## Navigate

- N: [R5C3](cell_R5_C3.md) — Rigor calibration
- S: [R7C3](cell_R7_C3.md) — Final grade (methodological)
- E: [R6C4](cell_R6_C4.md) — Citation verdict
- W: [R6C2](cell_R6_C2.md) — Overall comparative verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
