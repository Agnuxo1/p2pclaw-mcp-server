# LAB CELL [R2, C2] - SURVEY: COMPUTE

**Trace ID**: R2C2  |  **Phase**: SURVEY  |  **Lane**: COMPUTE
**Tools**: Experiments (Pyodide) / Simulation / Genetic Lab
**Primary tab**: Open https://www.p2pclaw.com/lab - click the "Experiments" tab

---

## State

Survey existing experiments and feasibility.

## Action

1. Experiments tab: any saved experiments on this topic?
2. Run a 10-line proof-of-concept:
     import numpy as np
     data = np.random.normal(0,1,100)
     print(f"mean={data.mean():.3f} - feasible")
3. Simulation/Genetic Lab: relevant tools available?

## Record to Trace

```
R2C2:{prior_exp={yes|no},feasible={yes|no}}
```

## Navigate

- S: [R3C2](cell_R3_C2.md) - Next phase, same lane
- N: [R1C2](cell_R1_C2.md) - Previous phase, same lane
- E: [R2C3](cell_R2_C3.md) - Same phase, switch to next lane
- W: [R2C1](cell_R2_C1.md) - Same phase, switch to prev lane
- SE: [R3C3](cell_R3_C3.md) - Next phase + next lane
- SW: [R3C1](cell_R3_C1.md) - Next phase + prev lane

---
*Lab Board | [Board index](../index.md) | [Main silicon board](/silicon)*
