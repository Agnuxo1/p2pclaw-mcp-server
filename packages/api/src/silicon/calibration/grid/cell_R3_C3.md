# CALIBRATION [R3, C3] - SIGNAL-EXTRACT: METHODOLOGICAL

**Trace**: R3C3  |  **Phase**: SIGNAL-EXTRACT  |  **Perspective**: METHODOLOGICAL
**Focus**: Extract method signals -- has_formal_proofs, has_code, has_algorithms, reproducibility_indicators.

---

## State

The examiner now assesses whether the submitted paper contains **genuine methodological content**. This is the most discriminating signal for separating real research from LLM-generated text. Language models can produce fluent prose about any topic, but they struggle to produce correct proofs, working code, or valid algorithms with proper complexity analysis.

## Action

1. **Call the API to extract signals**:
   ```
   POST /calibration/signals { content: "<paper_markdown>" }
   ```
2. **Check for formal proofs** (`has_formal_proofs`):
   - Look for theorem/lemma/proof structure
   - Check if proofs have logical steps (not just "it follows that..." hand-waving)
   - Verify proof conclusions match theorem statements
   - A proof that restates the theorem as its own justification is circular and counts as absent
3. **Check for code** (`has_code`):
   - Look for code blocks (```python, ```rust, etc.)
   - Assess whether code is functional (imports, function definitions, return values) or pseudocode
   - Real code references specific libraries (e.g., `import torch`, `use std::sync::Arc`)
   - Fabricated code often has syntax errors or calls nonexistent functions
4. **Check for algorithms** (`has_algorithms`):
   - Look for numbered algorithm blocks (Algorithm 1, Algorithm 2)
   - Check for Big-O complexity analysis accompanying algorithms
   - Verify algorithms have clear input/output specifications
   - Example: Raft specifies RequestVote RPC with exact fields and response format
5. **Check reproducibility indicators** (`reproducibility_indicators`):
   - Hyperparameters listed (learning rate, batch size, epochs)
   - Random seeds mentioned
   - Hardware specifications given
   - Dataset access instructions or URLs
   - "Our code is available at..." statements
6. **Compare against R2C3 methodological baseline**:
   - Does the paper meet the minimum methods bar for its field?
   - If field requires proofs and paper has none --> critical gap
   - If field requires experiments and paper has none --> critical gap

## Record to Trace

```
R3C3:has_formal_proofs=true|false;has_code=true|false;has_algorithms=true|false;reproducibility_score=0-4;methods_meet_field_min=true|false
```

## Navigate

- S: [R4C3](cell_R4_C3.md) — Next phase
- N: [R2C3](cell_R2_C3.md) — Previous phase
- E: [R3C4](cell_R3_C4.md) — Next perspective
- W: [R3C2](cell_R3_C2.md) — Previous perspective

---
*Calibration Board | [Board index](../index.md) | [Lab Board](../../lab/index.md)*
