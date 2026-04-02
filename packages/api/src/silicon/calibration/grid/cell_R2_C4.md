# CALIBRATION [R2, C4] - REFERENCE-LOAD: CITATION

**Trace**: R2C4  |  **Phase**: REFERENCE-LOAD  |  **Perspective**: CITATION
**Focus**: Note how many citations reference papers have and what they cite -- establishing the citation norms for the field.

---

## State

The examiner now establishes **citation baselines** for the detected field. How many references does a typical paper in this field include? What are the must-cite foundational works? Citation count and quality are strong indicators of whether a paper engages genuinely with its field's literature.

## Action

1. **Call the API to load benchmarks**:
   ```
   GET /calibration/benchmarks/:field
   ```
2. **Record citation counts from reference papers**:
   - **cs-distributed**:
     - Lamport (1982): 14 references (small, but 1982 norms were different)
     - Nakamoto (2008): 8 references (unconventionally low, self-published)
     - Ongaro (2014) Raft: 38 references (modern conference standard)
     - Modern field norm: 25-50 references for a full conference paper
   - **ai-ml**:
     - Vaswani (2017): 40 references
     - Krizhevsky (2012): 26 references
     - Silver (2016): 55 references
     - Modern field norm: 30-60 references
   - **network-science**:
     - Watts-Strogatz (1998): 27 references (Nature letter)
     - Barabasi-Albert (1999): 21 references (Science letter)
     - Modern field norm: 20-40 references
   - **math-logic**:
     - Turing (1936): 5 references (founding paper, little prior work)
     - Shannon (1948): 23 references
     - Modern field norm: 15-35 references
3. **Identify must-cite works** for each field (papers that any serious work in the field should reference):
   - `cs-distributed`: Lamport (1978) clocks, Fischer-Lynch-Paterson (1985) impossibility, Paxos or Raft
   - `ai-ml`: backpropagation (Rumelhart 1986), at least one foundational architecture paper
   - `network-science`: Erdos-Renyi (1959), Watts-Strogatz or Barabasi-Albert
   - `math-logic`: relevant foundational result (Turing, Godel, Church, Shannon depending on subtopic)
4. **Set the citation quality bar**: Real papers cite specific results from specific papers. Fabricated papers cite vaguely ("as shown in [1]") or list references that do not exist.
5. **Store citation norms** for use in R3C4.

## Record to Trace

```
R2C4:ref_norm_min=N;ref_norm_max=N;must_cites=list;modern_avg=N;quality_bar=specific_results|vague_mentions
```

## Navigate

- S: [R3C4](cell_R3_C4.md) — Next phase
- N: [R1C4](cell_R1_C4.md) — Previous phase
- E: [R2C5](cell_R2_C5.md) — Next perspective
- W: [R2C3](cell_R2_C3.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
