# CALIBRATION [R3, C2] - SIGNAL-EXTRACT: COMPARATIVE

**Trace**: R3C2  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: COMPARATIVE
**Focus**: Compute depth_score, rigor_gap, and evidence_gap by comparing the submitted paper against loaded references.

---

## State

The comparison matrix from R2C2 has its reference columns filled. The examiner now fills in the **submitted paper's column** and computes the gap between the submitted paper and the reference baselines. These gap scores are the core calibration signals -- they tell us exactly how far the paper falls short of (or exceeds) the field standard.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Fill the submitted column** in the comparison matrix using data from R3C0 and R3C1:
   - Word count (from R3C0)
   - Section count (from R3C0)
   - Evidence types present (from R3C1)
   - Equation count (from R3C1)
   - Method type (from R1C3)
3. **Compute depth_score** (0.0 to 1.0):
   - Compare the submitted paper's word count, section count, and evidence density against the primary benchmark (from R2C2).
   - Formula: `depth_score = (submitted_metric / reference_metric)` averaged across dimensions, capped at 1.0.
   - Example: Submitted=800 words, Reference (Raft)=12,000 words --> word depth = 0.07. Submitted=3 sections, Reference=12 sections --> section depth = 0.25. Average depth_score = 0.16.
4. **Compute rigor_gap** (0.0 to 1.0, where 0 = no gap):
   - Does the submitted paper have proofs where the reference has proofs?
   - Does it have experiments where the reference has experiments?
   - Each missing rigor element adds to the gap.
   - Example: Reference has formal proof + simulation + user study (3 rigor elements). Submitted has none --> rigor_gap = 1.0.
5. **Compute evidence_gap** (0.0 to 1.0):
   - How many of the reference's evidence types does the submitted paper match?
   - Example: Reference has BLEU scores, ablation tables, training curves (3 types). Submitted has 1 table --> evidence_gap = 0.67.
6. **Update the comparison matrix** with all computed values.

## Record to Trace

```
R3C2:depth_score=0.XX;rigor_gap=0.XX;evidence_gap=0.XX;primary_benchmark=AuthorYear;matrix_complete=true|false
```

## Navigate

- S: [R4C2](cell_R4_C2.md) — Next phase
- N: [R2C2](cell_R2_C2.md) — Previous phase
- E: [R3C3](cell_R3_C3.md) — Next perspective
- W: [R3C1](cell_R3_C1.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
