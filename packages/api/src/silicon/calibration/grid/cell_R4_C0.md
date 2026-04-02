# CALIBRATION [R4, C0] - COMPARATIVE-ANALYSIS: STRUCTURAL

**Trace**: R4C0  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: STRUCTURAL
**Focus**: Compare paper structure against reference papers in the same field

---

## State

You have the paper's structural signals (from R0-R3) and the reference paper profile
for this field. Now compare them side-by-side to quantify the structural gap.

Example: "Lamport 1982 (Byzantine Generals) has 8500 words across 12 sections with
formal definitions section. This paper has 1200 words across 4 sections with no
formal definitions."

## Action

1. **Load reference profile**: Pull the field's reference paper structural data from R2 trace
2. **Section comparison**: For each of the 7 mandatory sections, compare word counts:
   - Reference section word count vs submitted paper section word count
   - Flag sections where submitted < 30% of reference average
3. **Organization comparison**: Does reference use numbered theorems, formal definitions,
   algorithm blocks? Does submitted paper match that level of organization?
4. **Balance comparison**: Reference section distribution (%) vs submitted distribution (%)
   - Identify sections that are disproportionately short or long
5. **Generate structural gap report**:
   ```
   Section        | Reference | Submitted | Gap
   Abstract       | 250 words | 80 words  | -68%
   Methodology    | 1800 words| 200 words | -89%
   ...
   ```

## Record to Trace

```
R4C0:{ref_words=NNNN,sub_words=NNNN,ratio=NN%,sections_below_30pct=[list],org_level=N/5}
```

## Navigate

- N: [R3C0](cell_R3_C0.md) — Reference loading (structural)
- S: [R5C0](cell_R5_C0.md) — Apply structural penalties
- E: [R4C1](cell_R4_C1.md) — Compare evidence quality
- W: [R4C5](cell_R4_C5.md) — Compare red flag density

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
