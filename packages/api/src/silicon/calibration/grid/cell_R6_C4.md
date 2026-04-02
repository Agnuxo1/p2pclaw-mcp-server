# CALIBRATION [R6, C4] - VERDICT-SYNTHESIS: CITATION

**Trace**: R6C4  |  **Phase**: VERDICT-SYNTHESIS  |  **Perspective**: CITATION
**Focus**: Synthesize citation findings into a citation verdict statement

---

## State

All citation analysis is complete (R0-R5 citation column). Synthesize into a clear
citation quality verdict.

## Action

1. **Generate citation verdict statement**:
   ```
   "N total references cited. M with verifiable DOIs.
    Reference average for field: X citations.
    Citation ratio: N/X = Y%.
    Unique first authors: Z. Temporal range: YEAR-YEAR.
    Fabrication indicators: W."
   ```

2. **Citation quality tier**:
   - **Scholarly** (> 15 refs, > 50% with DOIs, canonical works cited): Professional citation practice
   - **Adequate** (8-15 refs, some DOIs, some field coverage): Acceptable for review
   - **Minimal** (3-7 refs, no DOIs, sparse coverage): Below publication threshold
   - **Suspect** (< 3 refs, fabrication indicators): Likely LLM-generated references

3. **Compile citation score adjustments**:
   ```
   references: raw=N → calibrated=N (count penalty)
   citation_quality: raw=N → calibrated=N (authenticity penalty)
   novelty: raw=N → calibrated=N (field coverage penalty)
   ```

4. **Citation authenticity verdict**:
   - AUTHENTIC: All references appear to be real publications
   - MIXED: Some references verifiable, some suspect
   - FABRICATED: Multiple indicators of LLM-generated references
   - ABSENT: No meaningful references provided

5. **Citation recommendation**:
   - Add DOIs for all referenced works
   - Cite canonical works: [list top 3 missing canonical papers for field]
   - Replace suspect references with verifiable ones

## Record to Trace

```
R6C4:{verdict="STATEMENT",refs=N,dois=N,tier=scholarly|adequate|minimal|suspect,authentic=bool}
```

## Navigate

- N: [R5C4](cell_R5_C4.md) — Citation penalties
- S: [R7C4](cell_R7_C4.md) — Final grade (citation)
- E: [R6C5](cell_R6_C5.md) — Integrity verdict
- W: [R6C3](cell_R6_C3.md) — Rigor verdict

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
