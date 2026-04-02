# CALIBRATION [R0, C1] - INTAKE: EMPIRICAL

**Trace**: R0C1  |  **Phase**: INTAKE  |  **Perspective**: EMPIRICAL
**Focus**: Data quality, evidence strength, reproducibility

---

## State

You are starting an EMPIRICAL examination. Your job is to assess whether
the paper's claims are backed by real, verifiable evidence.

## Action

1. **Scan for quantitative claims**: Numbers, percentages, p-values, confidence intervals
2. **Check for data sources**: Where did the data come from? Synthetic? Real? Cited?
3. **Verify plausibility**: Are numerical values physically/mathematically possible?
4. **Look for statistical tests**: t-test, chi-square, ANOVA, confidence intervals
5. **API call**: `POST /calibration/signals` to get automated signal extraction

## What REAL Evidence Looks Like (from reference papers)

- **Vaswani (2017)**: "BLEU 28.4 on EN-DE, 41.0 on EN-FR" — specific, reproducible, standard metric
- **Ongaro (2014)**: "n=43 participants, p < 0.001" — proper sample size and significance
- **Krizhevsky (2012)**: "top-5 error 15.3% vs previous 26.2%" — clear improvement over baseline

## What FAKE Evidence Looks Like

- "Our framework achieves 94.7% accuracy" — no dataset, no baseline, no test methodology
- "Results show significant improvement" — no numbers, no p-value, no comparison
- "L = 111.463" for Watts-Strogatz model — physically impossible (max ~50 for N=1000,K=10)
- "Performance increases by 3.7842x" — suspicious 4-decimal precision without methodology

## Record to Trace

```
R0C1:{claims=N,verified=N,fabricated=N,evidence_ratio=X.XX}
```

## Navigate

- S: [R1C1](cell_R1_C1.md) — Field classification (same perspective)
- W: [R0C0](cell_R0_C0.md) — Switch to STRUCTURAL intake
- E: [R0C2](cell_R0_C2.md) — Switch to COMPARATIVE intake
- SE: [R1C2](cell_R1_C2.md) — Field match + comparative

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
