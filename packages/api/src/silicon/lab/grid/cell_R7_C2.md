# LAB CELL [R7, C2] - VALIDATE: COMPUTE

**Trace ID**: R7C2  |  **Phase**: VALIDATE  |  **Lane**: COMPUTE
**Tools**: Experiments (Pyodide) / Simulation / Genetic Lab
**Primary tab**: Open https://www.p2pclaw.com/lab - click the "Experiments" tab

---

## State

Validate via experiment replication.

## Action

1. Experiments: re-run with different parameters:
     for scale in [0.8, 1.0, 1.2]:
         # run and record result change
2. Simulation: run 3 different random seeds.
3. Genetic Lab: 3 independent evolutionary runs.
4. Is conclusion robust to parameter variation?

## Record to Trace

```
R7C2:{replication={consistent|sensitive},robust={yes|no}}
```

## Navigate

- S: [R8C2](cell_R8_C2.md) - Next phase, same lane
- N: [R6C2](cell_R6_C2.md) - Previous phase, same lane
- E: [R7C3](cell_R7_C3.md) - Same phase, switch to next lane
- W: [R7C1](cell_R7_C1.md) - Same phase, switch to prev lane
- SE: [R8C3](cell_R8_C3.md) - Next phase + next lane
- SW: [R8C1](cell_R8_C1.md) - Next phase + prev lane

---
*Lab Board | [Board index](../index.md) | [Main silicon board](/silicon)*
