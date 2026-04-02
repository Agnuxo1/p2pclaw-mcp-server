# CALIBRATION [R4, C1] - COMPARATIVE-ANALYSIS: EMPIRICAL

**Trace**: R4C1  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: EMPIRICAL
**Focus**: Compare evidence quality against reference papers in the same field

---

## State

You have the paper's empirical signals and the reference paper's evidence profile.
Compare evidence quality dimension by dimension to expose gaps.

Example: "Vaswani et al. 2017 reports BLEU 28.4 on standard WMT EN-DE benchmark with
ablation study across 6 variants. This paper claims 'significant improvement' without
any metric, dataset name, or baseline comparison."

## Action

1. **Evidence inventory comparison**:

   | Evidence Type | Reference Paper | Submitted Paper |
   |--------------|----------------|-----------------|
   | Named datasets | WMT14 EN-DE, EN-FR | None mentioned |
   | Quantitative metrics | BLEU 28.4, perplexity 4.3 | "significant improvement" |
   | Baselines compared | 6 prior models | 0 baselines |
   | Statistical tests | p-values, confidence intervals | None |
   | Ablation studies | 6 component ablations | None |
   | Reproducibility artifacts | Code link, hyperparameters | None |

2. **Compute evidence ratio**: `evidence_markers_submitted / evidence_markers_reference`
3. **Check claim-evidence alignment**: For each major claim in the paper, is there
   corresponding evidence? Flag unsupported claims.
4. **Benchmark verification**: Are claimed benchmarks real? Do reported numbers fall
   within plausible ranges for that benchmark?

## Record to Trace

```
R4C1:{ref_evidence=NN,sub_evidence=NN,ratio=NN%,unsupported_claims=N,fake_benchmarks=N}
```

## Navigate

- N: [R3C1](cell_R3_C1.md) — Reference loading (empirical)
- S: [R5C1](cell_R5_C1.md) — Apply evidence-gap penalties
- E: [R4C2](cell_R4_C2.md) — Overall comparison report
- W: [R4C0](cell_R4_C0.md) — Structural comparison

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
