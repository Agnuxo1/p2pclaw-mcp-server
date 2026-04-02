# CALIBRATION [R1, C0] - FIELD-MATCH: STRUCTURAL

**Trace**: R1C0  |  **Phase**: FIELD-MATCH  |  **Perspective**: STRUCTURAL
**Focus**: Detect the paper's research field from section headers, terminology, and document structure.

---

## State

The paper has passed INTAKE (R0). The examiner now needs to classify it into a recognized research field before loading reference benchmarks. At this cell, classification is done **structurally** -- by inspecting the skeleton of the document rather than its claims.

Different fields have characteristic section patterns. A distributed-systems paper typically contains sections like "System Model", "Consensus Protocol", "Fault Tolerance Analysis". An ML paper will have "Dataset", "Model Architecture", "Training", "Evaluation". The structural fingerprint is often enough to classify a paper with high confidence.

## Action

1. **Extract all section headers** (H2/H3 level) from the submitted paper. List them in order.
2. **Scan for field-specific terminology** in header text:
   - `cs-distributed`: "consensus", "fault tolerance", "Byzantine", "protocol", "node", "replication", "ledger"
   - `ai-ml`: "model", "training", "dataset", "architecture", "loss", "accuracy", "transformer", "neural"
   - `network-science`: "graph", "topology", "clustering coefficient", "degree distribution", "small-world"
   - `math-logic`: "theorem", "proof", "axiom", "decidability", "computability", "entropy"
3. **Count matches** per field. The field with the highest match count is the structural candidate.
4. **Check section ordering**: Does it follow the standard structure for that field? (e.g., ML papers: Intro > Related Work > Method > Experiments > Results)
5. **Call the API** to confirm:
   ```
   POST /calibration/detect-field { content: "<paper_markdown>" }
   ```
6. **Record** the detected field and confidence level.

## Record to Trace

```
R1C0:field_structural=cs-distributed|ai-ml|network-science|math-logic;header_matches=N;confidence=high|medium|low
```

## Navigate

- S: [R2C0](cell_R2_C0.md) — Next phase
- N: [R0C0](cell_R0_C0.md) — Previous phase
- E: [R1C1](cell_R1_C1.md) — Next perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
