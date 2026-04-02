# CALIBRATION [R3, C0] - SIGNAL-EXTRACT: STRUCTURAL

**Trace**: R3C0  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: STRUCTURAL
**Focus**: Extract measurable structural signals -- sections_present, word_count, avg_section_words, sections_missing.

---

## State

The reference baselines are loaded (R2). The examiner now **measures the submitted paper** and extracts concrete, quantifiable structural signals. These are objective measurements, not subjective judgments. Every value recorded here must be a number, a boolean, or a list.

This cell fills in the "Submitted" column of the structural dimensions in the comparison matrix from R2C2.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Count total words** in the paper body (excluding references). Compare against the field baseline from R2C0.
   - Example: field baseline for cs-distributed is 3,400-12,000 words. A 600-word paper is far below threshold.
3. **List all sections present** (H2-level headers). Record the count.
4. **Check for mandatory sections** expected in the field:
   - Universal: Abstract, Introduction, Conclusion, References
   - `cs-distributed`: System Model, Protocol/Algorithm, Analysis/Proof
   - `ai-ml`: Related Work, Method/Architecture, Experiments, Results
   - `network-science`: Model, Simulation/Analysis, Results
   - `math-logic`: Definitions, Theorems, Proofs
5. **List missing mandatory sections** -- each missing section is a structural penalty.
6. **Calculate avg_section_words** = total_words / section_count. Compare against baseline.
   - Too low (<150 words/section): sections are stubs, paper lacks depth
   - Too high (>2,000 words/section): paper may lack proper organization
7. **Check structural proportions**:
   - Introduction should be 10-15% of total
   - Methodology/core should be 25-35%
   - If introduction is >40% of the paper, the paper is mostly preamble
8. **Record all measurements** as exact numbers.

## Record to Trace

```
R3C0:word_count=N;sections_present=N;sections_missing=list;avg_section_words=N;intro_pct=N%;methods_pct=N%;below_field_min=true|false
```

## Navigate

- S: [R4C0](cell_R4_C0.md) — Next phase
- N: [R2C0](cell_R2_C0.md) — Previous phase
- E: [R3C1](cell_R3_C1.md) — Next perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
