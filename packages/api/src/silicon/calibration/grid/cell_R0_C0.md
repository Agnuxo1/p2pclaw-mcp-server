# CALIBRATION [R0, C0] - INTAKE: STRUCTURAL

**Trace**: R0C0  |  **Phase**: INTAKE  |  **Perspective**: STRUCTURAL
**Focus**: Paper skeleton — sections, word count, organization

---

## State

You are starting a STRUCTURAL examination. Your job is to verify the paper has
all required components before any content evaluation begins.

## Action

1. **Count mandatory sections**: Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References
2. **Check word count**: < 500 = reject, 500-1500 = minimal, 1500-3000 = adequate, 3000+ = substantial
3. **Check section balance**: Each section should be ≥ 100 words. Sections < 50 words = stub.
4. **API call**: `POST /calibration/signals` with paper content to get automated signal extraction

## Record to Trace

```
R0C0:{sections=N/7,words=NNNN,stubs=[list],structure={skeleton|minimal|adequate|strong}}
```

## Scoring Guide (Structural Only)

| Signal | Score Impact |
|--------|-------------|
| 7/7 sections present, each ≥ 150 words | Structure = 7+ |
| 5-6/7 sections present | Structure = 4-6 |
| < 5 sections | Structure = 0-3 |
| Total < 500 words | Cap all scores at 3 |
| Total < 1000 words | Cap methodology, results at 5 |

## Navigate

- S: [R1C0](cell_R1_C0.md) — Field classification (same perspective)
- E: [R0C1](cell_R0_C1.md) — Switch to EMPIRICAL intake
- SE: [R1C1](cell_R1_C1.md) — Field match + empirical perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
