# CALIBRATION [R1, C5] - FIELD-MATCH: ADVERSARIAL

**Trace**: R1C5  |  **Phase**: FIELD-MATCH  |  **Perspective**: ADVERSARIAL
**Focus**: Check whether the field classification is consistent throughout the paper or suspiciously mixed.

---

## State

This is the adversarial checkpoint for field classification. LLM-generated papers frequently exhibit **field drift** -- they start with distributed-systems terminology in the introduction, shift to ML jargon in the methodology, and end with vague network-science claims in the conclusion. A genuine paper maintains a coherent field identity throughout.

The adversarial perspective aggregates the results from R1C0 through R1C4 and looks for contradictions that indicate low-quality or fabricated content.

## Action

1. **Collect all field votes** from the row:
   - R1C0 (structural): field_structural
   - R1C1 (empirical): field_empirical
   - R1C2 (comparative): field_comparative
   - R1C3 (methodological): field_methodological
   - R1C4 (citation): field_citation
2. **Check for unanimous agreement**: All five perspectives yield the same field --> high confidence, no adversarial flags.
3. **Check for majority agreement**: 3-4 out of 5 agree --> medium confidence. Note which perspectives disagree and why.
4. **Check for no majority**: 2 or fewer agree on any single field --> **red flag**. The paper likely lacks a coherent research identity.
5. **Scan for field-drift within the paper**:
   - Does the abstract mention one field but the methodology belongs to another?
   - Does the conclusion make claims outside the paper's demonstrated field?
   - Are there sudden terminology shifts between sections?
6. **Common adversarial patterns**:
   - "Quantum blockchain neural consensus" -- buzzword salad spanning 3+ fields
   - Abstract claims "novel consensus algorithm" but body is entirely about training a neural network
   - References span unrelated fields with no connecting argument
7. **Assign final field** based on majority vote, or flag for manual review if no consensus.

## Record to Trace

```
R1C5:final_field=cs-distributed|ai-ml|network-science|math-logic|UNRESOLVED;agreement=5of5|4of5|3of5|2of5;field_drift=true|false;red_flags=list|none
```

## Navigate

- S: [R2C5](cell_R2_C5.md) — Next phase
- N: [R0C5](cell_R0_C5.md) — Previous phase
- W: [R1C4](cell_R1_C4.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
