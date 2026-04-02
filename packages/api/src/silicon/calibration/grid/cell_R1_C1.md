# CALIBRATION [R1, C1] - FIELD-MATCH: EMPIRICAL

**Trace**: R1C1  |  **Phase**: FIELD-MATCH  |  **Perspective**: EMPIRICAL
**Focus**: Detect the paper's research field from the type of data, metrics, and evidence it presents.

---

## State

The examiner classifies the paper based on what kind of **empirical evidence** it contains. Every field has characteristic data types: ML papers report accuracy and loss curves, distributed-systems papers measure throughput and latency, network-science papers analyze degree distributions and clustering coefficients.

This perspective complements the structural view (R1C0) by looking at the paper's substance rather than its skeleton. A paper could have generic headers but reveal its true field through the metrics it reports.

## Action

1. **Scan for numerical data patterns**:
   - Tables with columns like "Precision", "Recall", "F1" --> `ai-ml`
   - Tables with "Latency (ms)", "Throughput (tx/s)", "Nodes" --> `cs-distributed`
   - Tables with "Degree", "Clustering", "Path length" --> `network-science`
   - Equations with proofs, QED markers, theorem numbering --> `math-logic`
2. **Identify metric vocabulary**:
   - `ai-ml`: BLEU, perplexity, AUC, loss, epoch, batch size, learning rate
   - `cs-distributed`: TPS, finality time, message complexity O(n^2), Byzantine threshold f < n/3
   - `network-science`: power-law exponent gamma, average path length L, clustering coefficient C
   - `math-logic`: complexity class, decidability, cardinality, entropy bits
3. **Check for experimental apparatus descriptions**: hardware specs (GPU type = ML), node counts (distributed), graph generators (network science).
4. **Call the API**:
   ```
   POST /calibration/detect-field { content: "<paper_markdown>" }
   ```
5. **Cross-reference** with R1C0 structural result. Flag any disagreement.

## Record to Trace

```
R1C1:field_empirical=cs-distributed|ai-ml|network-science|math-logic;metric_types=list;data_tables=N;agrees_with_R1C0=true|false
```

## Navigate

- S: [R2C1](cell_R2_C1.md) — Next phase
- N: [R0C1](cell_R0_C1.md) — Previous phase
- E: [R1C2](cell_R1_C2.md) — Next perspective
- W: [R1C0](cell_R1_C0.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
