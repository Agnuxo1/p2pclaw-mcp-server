# CALIBRATION [R4, C3] - COMPARATIVE-ANALYSIS: METHODOLOGICAL

**Trace**: R4C3  |  **Phase**: COMPARATIVE-ANALYSIS  |  **Perspective**: METHODOLOGICAL
**Focus**: Compare methodological rigor against reference papers

---

## State

Compare the submitted paper's rigor level against the reference paper's rigor level
using the standardized rigor ladder.

Example: "Ongaro & Ousterhout (Raft) provide TLA+ formal specification, proof of safety
properties, and a user study with n=43 students. This paper provides no formal methods,
no proofs, and no user evaluation."

## Action

1. **Assign rigor levels** using the rigor ladder:

   | Level | Description | Example |
   |-------|------------|---------|
   | 5 | Formal proofs, verified specifications | TLA+, Coq, Isabelle proofs |
   | 4 | Statistical tests, controlled experiments | p-values, CI, n>30 |
   | 3 | Experiments with quantitative results | Benchmarks, metrics, tables |
   | 2 | Descriptions of approach only | "We propose X that does Y" |
   | 1 | Claims without methodology | "Our approach is superior" |
   | 0 | No methodological content | Empty or placeholder |

2. **Reference rigor level**: Identify what formal methods the reference uses
3. **Submitted rigor level**: Identify the highest rigor level present in the paper
4. **Rigor gap**: `reference_level - submitted_level`
5. **Method comparison table**:
   ```
   Method Element    | Reference      | Submitted     | Present?
   Formal spec       | TLA+ (42 pgs)  | None          | NO
   Proof of safety   | Theorem 3.1    | None          | NO
   User study        | n=43           | None          | NO
   Benchmarks        | 5 systems      | "fast"        | PARTIAL
   ```

## Record to Trace

```
R4C3:{ref_rigor=N/5,sub_rigor=N/5,gap=N,formal_methods=bool,stat_tests=bool,experiments=bool}
```

## Navigate

- N: [R3C3](cell_R3_C3.md) — Reference loading (methodological)
- S: [R5C3](cell_R5_C3.md) — Apply rigor calibration penalties
- E: [R4C4](cell_R4_C4.md) — Citation comparison
- W: [R4C2](cell_R4_C2.md) — Overall comparison report

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
