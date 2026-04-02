# CALIBRATION [R3, C4] - SIGNAL-EXTRACT: CITATION

**Trace**: R3C4  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: CITATION
**Focus**: Extract citation signals -- unique_refs, has_dois, has_real_authors, has_placeholder_refs.

---

## State

The examiner now inspects the submitted paper's **bibliography quality**. Citations are one of the easiest things to fabricate and one of the easiest to verify. A paper with invented references, missing DOIs, or placeholder citations (e.g., "[Author, Year]" with no corresponding entry) reveals low quality or outright fabrication.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Count unique references** (`unique_refs`):
   - Parse the References/Bibliography section
   - Count distinct entries
   - Compare against field norms from R2C4 (e.g., cs-distributed modern norm: 25-50)
   - A paper with 0-3 references in a field that expects 25+ is critically under-cited
3. **Check for DOIs** (`has_dois`):
   - Scan references for DOI patterns (10.XXXX/...)
   - Real papers increasingly include DOIs; their presence signals genuine references
   - Record the count and percentage of references with DOIs
4. **Check for real authors** (`has_real_authors`):
   - Do the cited authors actually exist in the field?
   - Known red flag: citing "Smith et al. (2023)" with no first name, no title, no venue
   - Cross-reference: do any cited authors match the landmark names from R2C4? (e.g., citing Lamport in a distributed systems paper is expected)
   - Record how many must-cite works from R2C4 are actually cited
5. **Check for placeholder references** (`has_placeholder_refs`):
   - Look for patterns like "[1]", "[2]" in text with no corresponding bibliography entry
   - Look for "Author (Year)" citations that do not resolve to the reference list
   - Look for suspiciously generic titles: "A Survey of Machine Learning" with no venue or year
   - Look for self-referential or circular citations (paper cites itself before publication)
6. **Assess citation integration**:
   - Are citations used to support specific claims? ("Lamport proved that f < n/3 is necessary [12]")
   - Or are they decorative? ("Many researchers have studied this topic [1-15]")
   - Decorative citations suggest the author has not read the cited works

## Record to Trace

```
R3C4:unique_refs=N;has_dois=true|false;doi_pct=N%;real_authors=N;placeholder_refs=N;must_cites_found=N_of_M;citation_quality=integrated|decorative|absent
```

## Navigate

- S: [R4C4](cell_R4_C4.md) — Next phase
- N: [R2C4](cell_R2_C4.md) — Previous phase
- E: [R3C5](cell_R3_C5.md) — Next perspective
- W: [R3C3](cell_R3_C3.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
