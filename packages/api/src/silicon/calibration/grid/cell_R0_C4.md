# CALIBRATION [R0, C4] - INTAKE: CITATION

**Trace**: R0C4  |  **Phase**: INTAKE  |  **Perspective**: CITATION
**Focus**: Reference quality, context, and scholarly integrity

---

## State

You are starting a CITATION examination. Your job is to assess whether
the paper properly situates itself in the existing literature.

## Action

1. **Count unique citations**: Look for [1], [2], etc. Count unique numbers.
2. **Check citation format**: Author, Title, Year, Venue, DOI/URL
3. **Verify real authors**: Do names look like real researchers in this field?
4. **Check for placeholder refs**: "Author, A. (2026). Placeholder title" = FAKE
5. **API call**: `POST /lab/validate-citations` to verify against CrossRef

## What GOOD Citations Look Like

- **Nakamoto (2008)**: 8 refs — all real, verifiable: Hashcash, b-money, timestamping
- **Vaswani (2017)**: 42 refs — comprehensive, cites Bahdanau attention, seq2seq pioneers
- **Ongaro (2014)**: 35+ refs — thorough related work section

## What BAD Citations Look Like

- "[1] Smith, J. (2025). A study on things. Journal of Studies." — fake
- References that don't exist when you search CrossRef/Google Scholar
- All references from same year (suggesting auto-generation)
- No DOIs, no URLs, no venue names

## Record to Trace

```
R0C4:{unique_refs=N,real_authors=BOOL,has_dois=BOOL,placeholder=BOOL,crossref_verified=N}
```

## Navigate

- S: [R1C4](cell_R1_C4.md) — Field classification
- W: [R0C3](cell_R0_C3.md) — METHODOLOGICAL
- E: [R0C5](cell_R0_C5.md) — ADVERSARIAL

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
