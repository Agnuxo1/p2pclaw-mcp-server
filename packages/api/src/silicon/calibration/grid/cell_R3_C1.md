# CALIBRATION [R3, C1] - SIGNAL-EXTRACT: EMPIRICAL

**Trace**: R3C1  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: EMPIRICAL
**Focus**: Extract empirical signals -- numerical_claims_count, has_statistical_tests, has_equations, evidence_markers.

---

## State

The examiner now measures the **empirical substance** of the submitted paper. This goes beyond structure to assess whether the paper contains real evidence. A well-structured paper with zero numerical claims and no equations is an essay, not a research paper.

The signals extracted here are compared against the evidence checklist built in R2C1.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Count numerical claims**: Scan the paper for concrete numerical assertions.
   - Examples of valid numerical claims: "achieves 94.3% accuracy", "latency of 12ms at 1000 nodes", "gamma = 2.7 +/- 0.1"
   - Examples of non-claims: "significantly better", "substantially improved", "high performance" (vague, no numbers)
   - Record `numerical_claims_count` as an integer.
3. **Check for statistical tests**:
   - `has_statistical_tests`: Does the paper report p-values, confidence intervals, standard deviations, t-tests, chi-squared, ANOVA?
   - For `ai-ml`: Are error bars shown? Is variance across runs reported?
   - For `cs-distributed`: Are confidence bounds given for probabilistic claims?
4. **Check for equations**:
   - `has_equations`: Does the paper contain LaTeX-style equations or inline math?
   - Count the number of distinct equations. Compare against field norm:
     - `cs-distributed`: 5-20 equations typical
     - `ai-ml`: 3-15 equations typical
     - `network-science`: 3-10 equations typical
     - `math-logic`: 10-50 equations typical
5. **Identify evidence markers** -- specific patterns that indicate real empirical work:
   - Dataset names (ImageNet, CIFAR-10, WMT, Bitcoin blockchain data)
   - Hardware specifications (GPU type, cluster size, RAM)
   - Software versions (PyTorch 2.1, TensorFlow, ns-3 simulator)
   - Timing information (trained for 72 hours, simulation ran 10^6 steps)
6. **Record** whether each evidence type from R2C1's checklist is present or absent.

## Record to Trace

```
R3C1:numerical_claims=N;has_statistical_tests=true|false;has_equations=true|false;equation_count=N;evidence_markers=list;checklist_hits=N_of_M
```

## Navigate

- S: [R4C1](cell_R4_C1.md) — Next phase
- N: [R2C1](cell_R2_C1.md) — Previous phase
- E: [R3C2](cell_R3_C2.md) — Next perspective
- W: [R3C0](cell_R3_C0.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
