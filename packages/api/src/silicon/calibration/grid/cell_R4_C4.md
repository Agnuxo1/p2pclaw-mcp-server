# CALIBRATION [R4, C4] - COMPARATIVE-ANALYSIS: CITATION

**Trace**: R4C4  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: CITATION
**Focus**: Compare citation quality and authenticity against reference papers

---

## State

Compare the submitted paper's citation practice against reference-quality papers.
Citation analysis is a strong signal for LLM-generated content: real researchers cite
real work with real DOIs; LLMs fabricate plausible-sounding references.

Example: "Lamport 1982 cites 35 papers, all with verifiable publication venues and real
author names. This paper cites 3 papers: no DOIs, author names look generated
('Zhang, Wei et al., 2024' appears 3 times with different titles)."

## Action

1. **Citation count comparison**:
   - Reference paper citation count (from R3 trace)
   - Submitted paper citation count
   - Ratio: `submitted_citations / reference_citations`

2. **Citation quality comparison**:

   | Quality Signal | Reference | Submitted |
   |---------------|-----------|-----------|
   | Total citations | 35 | 3 |
   | Citations with DOIs | 28 | 0 |
   | Verifiable venues | 35 | 1 |
   | Unique first authors | 30 | 2 |
   | Self-citations | 3 | 0 |
   | Foundational works cited | 8 | 0 |
   | Recent works (< 3 years) | 12 | 3 |

3. **Fabrication indicators**: Check for:
   - Repeated author patterns ("X et al., 202N")
   - Non-existent journals or conferences
   - DOIs that resolve to different papers
   - Suspiciously round citation years (all 2023, all 2024)

4. **Field coverage**: Does the paper cite the canonical works for its field?

## Record to Trace

```
R4C4:{ref_cites=NN,sub_cites=NN,ratio=NN%,dois=N,fabrication_flags=N,field_coverage=NN%}
```

## Navigate

- N: [R3C4](cell_R3_C4.md) — Reference loading (citation)
- S: [R5C4](cell_R5_C4.md) — Apply citation penalties
- E: [R4C5](cell_R4_C5.md) — Red flag comparison
- W: [R4C3](cell_R4_C3.md) — Methodological comparison

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
