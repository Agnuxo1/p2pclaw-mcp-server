# CALIBRATION [R2, C2] - REFERENCE-LOAD: COMPARATIVE

**Trace**: R2C2  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: COMPARATIVE
**Focus**: Build a side-by-side comparison matrix between the submitted paper and reference papers across every dimension.

---

## State

The examiner now constructs the **comparison matrix** that will be used throughout the remaining calibration phases. This matrix has one row per dimension (structure, evidence, methods, citations, rigor) and one column per reference paper plus the submitted paper. It is the central artifact of the calibration process.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
2. **Initialize the comparison matrix** with these dimensions:
   | Dimension | Submitted | Ref 1 | Ref 2 | Ref 3 |
   |-----------|-----------|-------|-------|-------|
   | Word count | ? | from R2C0 | from R2C0 | from R2C0 |
   | Section count | ? | from R2C0 | from R2C0 | from R2C0 |
   | Evidence types | ? | from R2C1 | from R2C1 | from R2C1 |
   | Method type | ? | from R2C1 | from R2C1 | from R2C1 |
   | Citation count | ? | known | known | known |
   | Formal rigor | ? | known | known | known |
3. **Fill in reference columns** with known data:
   - **cs-distributed**: Lamport=4500w/proof, Nakamoto=3400w/probability, Raft=12000w/proof+experiment
   - **ai-ml**: Vaswani=6000w/experiment, AlexNet=4800w/experiment, AlphaGo=5500w/experiment+game
   - **network-science**: WS=2800w/simulation, BA=2200w/analytical+empirical
   - **math-logic**: Turing=17000w/proof, Shannon=25000w/proof+examples
4. **Mark the submitted column as pending** -- these values will be extracted in R3.
5. **Identify the "most comparable" reference**: the one closest in scope and ambition to the submitted paper. This will be the primary benchmark.
6. **Store the matrix** for use in R3C2 (where the submitted paper's column gets filled).

## Record to Trace

```
R2C2:matrix_dims=N;refs_loaded=N;primary_benchmark=AuthorYear;matrix_status=initialized
```

## Navigate

- S: [R3C2](cell_R3_C2.md) — Next phase
- N: [R1C2](cell_R1_C2.md) — Previous phase
- E: [R2C3](cell_R2_C3.md) — Next perspective
- W: [R2C1](cell_R2_C1.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
