# CALIBRATION [R2, C5] - REFERENCE-LOAD: ADVERSARIAL

**Trace**: R2C5  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: ADVERSARIAL
**Focus**: Note known constraints and hard limits from reference papers that submitted papers must respect.

---

## State

Reference papers establish **hard constraints** -- physical limits, impossibility results, and proven bounds that no subsequent paper can violate without extraordinary justification. The adversarial perspective at REFERENCE-LOAD identifies these constraints so that the submitted paper can be checked against them in later phases.

A paper that claims to beat a proven impossibility result without addressing it is almost certainly fabricated. These constraints are the most powerful red-flag detectors in the calibration pipeline.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
2. **Catalog hard constraints by field**:
   - **cs-distributed**:
     - FLP impossibility (Fischer-Lynch-Paterson 1985): No deterministic consensus in asynchronous systems with even one crash failure
     - Byzantine fault threshold: f < n/3 for Byzantine agreement (Lamport 1982)
     - CAP theorem (Brewer/Gilbert-Lynch 2002): Cannot have Consistency + Availability + Partition tolerance simultaneously
     - Any paper claiming deterministic async consensus or Byzantine tolerance with f >= n/3 is violating proven bounds
   - **ai-ml**:
     - No free lunch theorem: No single algorithm is best for all problems
     - Bias-variance tradeoff: Reducing one increases the other
     - Known SOTA benchmarks: Claims of beating SOTA by >10% on established benchmarks without novel architecture are suspect
     - Training compute scaling laws: Performance scales as power law with compute (Kaplan 2020)
   - **network-science**:
     - Watts-Strogatz path length: L ~ ln(N)/ln(k) for small-world networks -- claims of L < 1 are impossible
     - Barabasi-Albert degree exponent: gamma = 3 for pure preferential attachment -- other values need modified model
     - Clustering coefficient bounds: C <= 1.0 always, real networks typically C < 0.7
   - **math-logic**:
     - Halting problem undecidability (Turing 1936): No general algorithm can decide halting
     - Godel incompleteness: No consistent formal system can prove all truths about natural numbers
     - Shannon limit: Channel capacity = B * log2(1 + S/N) -- cannot exceed this
3. **Build the constraint checklist**: A list of bounds the submitted paper must not violate.
4. **Flag any reference paper constraints that the examiner should actively check** in R3C5.
5. **Note the penalty severity**: Violating a proven impossibility result is a critical failure (paper should be rejected), not a minor deduction.

## Record to Trace

```
R2C5:constraints_loaded=N;impossibility_results=list;hard_bounds=list;violation_severity=critical
```

## Navigate

- S: [R3C5](cell_R3_C5.md) — Next phase
- N: [R1C5](cell_R1_C5.md) — Previous phase
- W: [R2C4](cell_R2_C4.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
