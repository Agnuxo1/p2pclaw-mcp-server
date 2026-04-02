# CALIBRATION [R3, C5] - SIGNAL-EXTRACT: ADVERSARIAL

**Trace**: R3C5  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: ADVERSARIAL
**Focus**: Extract red flags -- impossible_values, fabricated_precision, extraordinary_claims_without_evidence.

---

## State

This is the adversarial checkpoint for signal extraction. The examiner aggregates all signals from R3C0-R3C4 and actively searches for **red flags** that indicate fabrication, hallucination, or fundamental errors. This cell applies the hard constraints loaded in R2C5 against the actual claims in the paper.

A single critical red flag (e.g., violating a proven impossibility result) can override all other positive signals.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Check for impossible values**:
   - Accuracy > 100% or < 0%
   - Negative latency or throughput
   - Clustering coefficient > 1.0 or < 0.0
   - Byzantine tolerance f >= n/3 without explicitly addressing FLP/Lamport bounds
   - Path length < 1.0 in a connected graph
   - Entropy exceeding Shannon limit for the stated channel
3. **Check for fabricated precision**:
   - Reporting accuracy to 6+ decimal places (e.g., "99.999847%") without justification
   - Suspiciously round numbers in experimental results (e.g., exactly 90.0%, 95.0%, 99.0% across all metrics)
   - Results that are too good: beating every SOTA baseline on every metric simultaneously
   - Confidence intervals of zero or near-zero
4. **Check for extraordinary claims without evidence**:
   - "Our system achieves consensus in O(1) messages" (violates known lower bounds)
   - "100% fault tolerance" (impossible in any distributed system)
   - "Solves the halting problem" (proven undecidable)
   - "Lossless compression below entropy" (violates Shannon)
   - Claims of exponential speedup without quantum computing justification
5. **Cross-reference against R2C5 constraint list**: For each hard constraint loaded, check whether the paper's claims violate it.
6. **Check for internal contradictions**:
   - Abstract claims X, but results section shows Y
   - Method describes algorithm A, but evaluation tests algorithm B
   - Paper claims N nodes tested, but table shows results for M != N nodes
7. **Compile the red_flags list**: Each flag gets a severity (critical/major/minor) and a location (section where found).

## Record to Trace

```
R3C5:red_flags_critical=N;red_flags_major=N;red_flags_minor=N;impossible_values=list|none;fabricated_precision=true|false;constraint_violations=list|none;internal_contradictions=N
```

## Navigate

- S: [R4C5](cell_R4_C5.md) — Next phase
- N: [R2C5](cell_R2_C5.md) — Previous phase
- W: [R3C4](cell_R3_C4.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
