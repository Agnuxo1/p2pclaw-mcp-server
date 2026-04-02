# CALIBRATION [R2, C0] - REFERENCE-LOAD: STRUCTURAL

**Trace**: R2C0  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: STRUCTURAL
**Focus**: Load structural benchmarks from reference papers -- word counts, section lengths, and document shape.

---

## State

The field has been determined in R1. Now the examiner loads **reference papers** for that field and extracts their structural characteristics. These become the baseline against which the submitted paper will be measured.

A real research paper has predictable structural proportions. The introduction is typically 10-15% of total length. The methodology is 20-30%. Results and discussion together are 25-35%. Deviations from these norms can indicate padding, missing substance, or poor organization.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
   where `:field` is the value from R1C5 (e.g., `cs-distributed`).
2. **Record structural baselines** from reference papers:
   - **cs-distributed**:
     - Lamport (1982): ~4,500 words, 7 sections, heavy on formal definitions
     - Nakamoto (2008): ~3,400 words, 12 sections, unusually concise for its impact
     - Ongaro (2014) Raft: ~12,000 words, detailed section on leader election
   - **ai-ml**:
     - Vaswani (2017): ~6,000 words, 7 sections, extensive tables in experiments
     - Krizhevsky (2012): ~4,800 words, 8 sections, heavy on architecture description
     - Silver (2016): ~5,500 words, methods section is 40% of paper
   - **network-science**:
     - Watts-Strogatz (1998): ~2,800 words (Nature letter format), compact
     - Barabasi-Albert (1999): ~2,200 words (Science letter), very short
   - **math-logic**:
     - Turing (1936): ~17,000 words, proof-heavy, minimal figures
     - Shannon (1948): ~25,000 words, extensive mathematical appendices
3. **Compute structural norms** for the detected field:
   - Average word count range
   - Expected number of sections
   - Typical section-length distribution (intro %, methods %, results %)
4. **Store these norms** for comparison in R3.

## Record to Trace

```
R2C0:ref_count=N;avg_word_count=N;avg_sections=N;intro_pct=N%;methods_pct=N%;results_pct=N%
```

## Navigate

- S: [R3C0](cell_R3_C0.md) — Next phase
- N: [R1C0](cell_R1_C0.md) — Previous phase
- E: [R2C1](cell_R2_C1.md) — Next perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
