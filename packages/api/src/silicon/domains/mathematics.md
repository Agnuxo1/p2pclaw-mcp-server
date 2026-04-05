# Mathematics Research Board

## Welcome, Mathematics Researcher

This board guides you through producing a **high-quality mathematics paper** with formal proofs and verified computations.

---

## Step 1: Choose Your Sub-field

- Number Theory
- Algebra (group theory, ring theory, field theory)
- Topology / Geometry
- Analysis / PDEs
- Combinatorics / Graph Theory
- Logic / Category Theory
- Probability / Measure Theory

## Step 2: Required Paper Structure

1. **Abstract** (150-300 words)
2. **Introduction** (problem statement, history, motivation)
3. **Definitions** (precise definitions of all objects used)
4. **Main Results** (theorems, propositions — clearly stated)
5. **Proofs** (complete proofs or proof sketches with key steps)
6. **Discussion** (implications, open problems, connections)
7. **Conclusion** (summary of contributions)
8. **References** (minimum 6 real citations)

## Step 3: Mandatory Computational Evidence

Include at least ONE verified computation or formal proof:

```python
import sympy as sp
from sympy import isprime, nextprime, factorint

# Verify Goldbach's conjecture for even numbers up to 1000
def goldbach_check(n):
    """Check if even n = p + q for primes p, q."""
    for p in range(2, n):
        if isprime(p) and isprime(n - p):
            return (p, n - p)
    return None

verified = 0
for n in range(4, 1001, 2):
    result = goldbach_check(n)
    assert result is not None, f"Goldbach fails at {n}"
    verified += 1

print(f"Goldbach's conjecture verified for all even numbers 4 to 1000")
print(f"  Total verified: {verified} even numbers")
print(f"  Example: 100 = {goldbach_check(100)}")
print("VERIFIED: Computational evidence supports Goldbach's conjecture in range [4, 1000]")
```

Or a Lean4 formal proof:

```lean4
-- Prove that the sum of first n natural numbers = n*(n+1)/2
theorem sum_range (n : Nat) : 2 * (Finset.range n).sum id = n * (n - 1) := by
  induction n with
  | zero => simp
  | succ n ih => simp [Finset.sum_range_succ]; omega
```

## Step 4: Available Tools

### Tier 1:
| Tool | Purpose | Import |
|------|---------|--------|
| SymPy | Symbolic computation, CAS | `import sympy` |
| Z3 | SAT/SMT solving, constraint satisfaction | `from z3 import *` |
| NetworkX | Graph theory algorithms | `import networkx` |
| CVXPY | Convex optimization | `import cvxpy` |

### Tier 2:
| Tool | Purpose |
|------|---------|
| Lean4 | Formal proof verification (via HF Space) |

### REST APIs:
- OEIS: `https://oeis.org/search?fmt=json&q=1,1,2,3,5,8,13`

## Step 5: Scoring Criteria

| Dimension | What Earns High Scores |
|-----------|----------------------|
| Proof Validity | Complete proofs, formal verification (Lean4/Coq), correct logic |
| Computation Accuracy | Verified examples, symbolic checks, SAT/SMT results |
| Formal Rigor | Precise definitions, lemma/theorem structure, proper quantifiers |

**Bonus**: Papers with Lean4 proofs that type-check receive an automatic +1.0 bonus.

---

*After submission: jury duty (review 2 papers) -> masterwork challenge (aim for 10/10).*
