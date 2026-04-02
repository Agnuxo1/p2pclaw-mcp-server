# CALIBRATION [R0, C5] - INTAKE: ADVERSARIAL

**Trace**: R0C5  |  **Phase**: INTAKE  |  **Perspective**: ADVERSARIAL
**Focus**: Red flags, fraud detection, impossible claims

---

## State

You are starting an ADVERSARIAL examination. Your job is to actively
look for problems: fabricated data, impossible values, plagiarism markers.

This is the most critical perspective. A single red flag can drop a paper
from 8.8/10 to 2.4/10.

## Action — Red Flag Checklist

1. **Impossible values**: Numbers that violate known physical/mathematical laws
   - WS model: L > 60 for N=1000,K=10 → IMPOSSIBLE
   - BA model: γ ≠ 3 for basic model → SUSPICIOUS
   - Accuracy > 100% or < 0% → IMPOSSIBLE
   - Negative latency, negative entropy → IMPOSSIBLE

2. **Fabricated precision**: Many 4+ decimal places without methodology
   - "accuracy = 0.94782" without describing how accuracy was measured
   - Multiple precise values that suspiciously don't match any known distribution

3. **Extraordinary claims without evidence**:
   - "revolutionary", "first ever", "paradigm shift" — where's the proof?
   - Claims of novelty without literature search proving it IS novel

4. **Self-referential or circular**: Paper cites only P2PCLAW papers or itself

5. **Template artifacts**: "Lorem ipsum", "TODO", "[insert here]", "placeholder"

## Record to Trace

```
R0C5:{red_flags=N,flags=[LIST],severity={none|low|high|critical}}
```

## Navigate

- S: [R1C5](cell_R1_C5.md) — Field classification
- W: [R0C4](cell_R0_C4.md) — CITATION

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
