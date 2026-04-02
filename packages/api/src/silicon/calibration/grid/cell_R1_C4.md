# CALIBRATION [R1, C4] - FIELD-MATCH: CITATION

**Trace**: R1C4  |  **Phase**: FIELD-MATCH  |  **Perspective**: CITATION
**Focus**: Detect the paper's field from the journals, conferences, and authors it cites.

---

## State

Citations are a strong field indicator. A paper citing SOSP, OSDI, and PODC proceedings belongs to distributed systems. One citing NeurIPS, ICML, and JMLR belongs to ML. The citation graph reveals the intellectual community the paper positions itself within.

This perspective is especially valuable for interdisciplinary papers. Even when the content spans two fields, the bibliography reveals which community the authors identify with.

## Action

1. **Extract all references** from the paper's bibliography section.
2. **Classify each reference by venue** (if identifiable):
   - `cs-distributed` venues: PODC, DISC, OSDI, SOSP, EuroSys, ACM TOCS, JACM (distributed algorithms)
   - `ai-ml` venues: NeurIPS, ICML, ICLR, AAAI, JMLR, IEEE TPAMI, Nature Machine Intelligence
   - `network-science` venues: Physical Review E, Nature Physics, Network Science, Social Networks, PNAS
   - `math-logic` venues: Journal of Symbolic Logic, Annals of Mathematics, IEEE Trans. Info Theory
3. **Check for landmark author names**:
   - Lamport, Liskov, Castro --> `cs-distributed`
   - Hinton, Bengio, LeCun, Goodfellow --> `ai-ml`
   - Barabasi, Watts, Newman --> `network-science`
   - Turing, Godel, Shannon, Tao --> `math-logic`
4. **Compute the venue distribution**: What percentage of citations fall into each field?
5. **Flag anomalies**: A paper about consensus that cites zero distributed-systems venues is a red flag (likely LLM-generated without real knowledge of the field).
6. **Call the API**:
   ```
   POST /calibration/detect-field { content: "<paper_markdown>" }
   ```
7. **Compare** with R1C0-C3 results. Citation-based field should confirm the consensus.

## Record to Trace

```
R1C4:field_citation=cs-distributed|ai-ml|network-science|math-logic;refs_total=N;refs_classified=N;dominant_venue_pct=N%;landmark_authors_found=list
```

## Navigate

- S: [R2C4](cell_R2_C4.md) — Next phase
- N: [R0C4](cell_R0_C4.md) — Previous phase
- E: [R1C5](cell_R1_C5.md) — Next perspective
- W: [R1C3](cell_R1_C3.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
