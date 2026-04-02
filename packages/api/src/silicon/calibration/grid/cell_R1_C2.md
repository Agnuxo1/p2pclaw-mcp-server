# CALIBRATION [R1, C2] - FIELD-MATCH: COMPARATIVE

**Trace**: R1C2  |  **Phase**: FIELD-MATCH  |  **Perspective**: COMPARATIVE
**Focus**: Detect the paper's field by matching its topic profile against known reference papers.

---

## State

Rather than analyzing the paper in isolation, this cell classifies it by **comparing its topic footprint** against the reference corpus. The calibration system maintains topic vectors for landmark papers in each field. The submitted paper is matched against these vectors to find the closest field cluster.

This is the most robust classification method when the paper uses unconventional structure or novel terminology, because it relies on semantic similarity rather than keyword matching.

## Action

1. **Extract the paper's topic keywords**: Pull the top 10-15 distinctive terms from title, abstract, and introduction.
2. **Compare against reference paper topic clusters**:
   - `cs-distributed` cluster: Lamport (1982) Byzantine Generals, Nakamoto (2008) Bitcoin, Ongaro (2014) Raft -- topics: consensus, fault tolerance, state machines, distributed ledger
   - `ai-ml` cluster: Vaswani (2017) Attention, Krizhevsky (2012) AlexNet, Silver (2016) AlphaGo -- topics: neural networks, optimization, generalization, representation learning
   - `network-science` cluster: Watts-Strogatz (1998), Barabasi-Albert (1999) -- topics: graph topology, scale-free networks, small-world property, preferential attachment
   - `math-logic` cluster: Turing (1936), Shannon (1948) -- topics: computability, information theory, formal systems, entropy
3. **Compute overlap score** for each cluster: count how many of the paper's keywords appear in the cluster's topic set.
4. **Rank clusters** by overlap. The highest-scoring cluster is the comparative field match.
5. **Call the API**:
   ```
   POST /calibration/detect-field { content: "<paper_markdown>" }
   ```
6. **Produce consensus** with R1C0 and R1C1. If all three agree, confidence is high. Two-of-three agreement is medium. Full disagreement requires manual review.

## Record to Trace

```
R1C2:field_comparative=cs-distributed|ai-ml|network-science|math-logic;closest_ref=AuthorYear;overlap_score=N;consensus=high|medium|low
```

## Navigate

- S: [R2C2](cell_R2_C2.md) — Next phase
- N: [R0C2](cell_R0_C2.md) — Previous phase
- E: [R1C3](cell_R1_C3.md) — Next perspective
- W: [R1C1](cell_R1_C1.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
