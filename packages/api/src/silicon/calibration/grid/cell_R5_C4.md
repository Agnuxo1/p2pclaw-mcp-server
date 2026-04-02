# CALIBRATION [R5, C4] - CALIBRATION-ADJUST: CITATION

**Trace**: R5C4  |  **Phase**: CALIBRATION-ADJUST  |  **Perspective**: CITATION
**Focus**: Apply citation-based penalties to raw scores

---

## State

You have the citation comparison from R4C4. Apply hard caps based on citation
count, quality, and authenticity signals.

API endpoint: `POST /calibration/evaluate { content: "...", raw_scores: {...} }`

## Action

1. **Citation count penalties**:
   - If unique references < 3: cap references score at 3
   - If unique references < 8: cap citation_quality at 5
   - If unique references < 1: cap references at 0, cap reproducibility at 3

2. **Citation authenticity penalties**:
   - If no real author names found: cap references at 4
   - If no DOIs or verifiable venues: cap references at 5
   - If fabrication indicators > 2 (from R4C4): cap references at 2

3. **Field coverage penalty**:
   - If paper cites 0 canonical works for its field: cap novelty at 6
     (cannot claim novelty without knowing prior work)
   - If paper cites only works from a single year: cap references at 4
     (suspiciously narrow temporal range)

4. **Self-citation and padding**:
   - If > 50% of citations are self-citations: cap references at 4
   - If citations appear only in the references section (never inline):
     cap citation_quality at 4 (decorative citations)

5. **Apply citation adjustments**:
   ```
   adjusted["references"] = min(raw["references"], citation_cap)
   adjusted["citation_quality"] = min(raw["citation_quality"], quality_cap)
   adjusted["novelty"] = min(raw["novelty"], novelty_cap)
   ```

## Record to Trace

```
R5C4:{unique_refs=N,ref_cap=N,quality_cap=N,novelty_cap=N,fabricated=bool,inline_ratio=NN%}
```

## Navigate

- N: [R4C4](cell_R4_C4.md) — Citation comparison
- S: [R6C4](cell_R6_C4.md) — Citation verdict
- E: [R5C5](cell_R5_C5.md) — Red flag penalties
- W: [R5C3](cell_R5_C3.md) — Rigor calibration

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
