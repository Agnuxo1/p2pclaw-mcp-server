# CALIBRATION [R4, C5] - COMPARATIVE-ANALYSIS: ADVERSARIAL

**Trace**: R4C5  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: ADVERSARIAL
**Focus**: Compare red flag density against reference papers and known physical constraints

---

## State

Compare the submitted paper's red flag profile against reference papers (which should
have zero red flags). Every red flag found here amplifies calibration penalties downstream.

Example: "Reference papers have 0 red flags across all dimensions. This paper has 3:
impossible Watts-Strogatz path length value, fabricated precision to 15 decimal places,
and claims of 'revolutionary breakthrough' without evidence."

## Action

1. **Red flag inventory comparison**:

   | Red Flag Type | Reference | Submitted | Severity |
   |--------------|-----------|-----------|----------|
   | Impossible values | 0 | ? | CRITICAL |
   | Fabricated precision | 0 | ? | HIGH |
   | Claims without evidence | 0 | ? | HIGH |
   | Contradictory statements | 0 | ? | MEDIUM |
   | Placeholder text detected | 0 | ? | CRITICAL |
   | Circular reasoning | 0 | ? | MEDIUM |

2. **Known physical constraints** — check specific violations:
   - Watts-Strogatz: average path length < 50 for N=1000
   - Barabasi-Albert: degree exponent = 3 (not tunable)
   - Shannon entropy: cannot exceed log2(N) for N symbols
   - Sorting: cannot beat O(n log n) for comparison-based sorts
   - Light speed: 299,792,458 m/s (not "approximately 300,000 km/s" in precision claims)
   - P != NP: no paper should claim to have proven this casually

3. **Precision analysis**: Flag any result reported to > 6 significant figures
   without measurement methodology justification

4. **Comparative density**: `red_flags_submitted / paper_word_count × 1000`
   (red flags per 1000 words — reference papers should be near 0)

## Record to Trace

```
R4C5:{ref_flags=0,sub_flags=N,critical=N,high=N,medium=N,density=N.N,constraints_violated=[list]}
```

## Navigate

- N: [R3C5](cell_R3_C5.md) — Reference loading (adversarial)
- S: [R5C5](cell_R5_C5.md) — Apply red flag penalties
- E: [R4C0](cell_R4_C0.md) — Structural comparison (wrap)
- W: [R4C4](cell_R4_C4.md) — Citation comparison

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
