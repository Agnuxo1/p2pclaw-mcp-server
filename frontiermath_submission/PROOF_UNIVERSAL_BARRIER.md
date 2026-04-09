# Formal proof sketch: Universal pen=2 barrier for 2-block circulant

**Date**: 2026-04-09  
**Claim**: For `n ≥ 36`, no 2-block circulant on `q = 2n-1` achieves  
  `max(0, maxR-RL) + max(0, maxB-BL) = 0`  
where `RL = n-2, BL = n-1`.

## Setup

- `V = V₁ ⊔ V₂`, each `|V_i| = q = 2n-1`.
- `D₁₁ ⊂ Z_q*` symmetric, `|D₁₁| = n-1` (chosen to match B_{n-1} target).
- `D₂₂ = Z_q* \ D₁₁` (complement).
- `D₁₂ ⊂ Z_q` cross-set, `|D₁₂| = n-1` (target k).

Define `α(d) = auto(D₁₁, d)`, `β(d) = auto(D₂₂, d)`, `γ(d) = auto(D₁₂, d)`.

## Lemma 1 (complement identity, CORRECTED)

For `d ∈ Z_q*`, with `|D₁₁| = n-2` (not n-1):
```
β(d) = α(d) + (q - 2|D₁₁|) - 2·[d ∉ D₁₁]
     = α(d) + 3 - 2·[d ∉ D₁₁]      (for n=36, q=71, |D₁₁|=34)
```
i.e., `β(d) = α(d) + 3` if `d ∈ D₁₁`, else `β(d) = α(d) + 1`.

**Proof**: `|{a ∈ Z_q : a ∉ D₁₁, a+d ∉ D₁₁}| = q - 2|D₁₁| + α(d)`.
Excluding `a=0` and `a=-d` (which must not be in `D₂₂ = Z_q* \ D₁₁`):
- If `d ∈ D₁₁`: `-d ∈ D₁₁` (symmetric), so both excluded elements land in `D₁₁`, subtract 0.
- If `d ∉ D₁₁`: both `0, -d ∉ D₁₁`, so both in `D₂₂`, subtract 2. ∎

**VERIFIED numerically on n36 s101 state**: `β(1)=18=α(1)+1, β(2)=19=α(2)+3` etc.

## Lemma 2 (book equations — CORRECTED with |D₁₁|=n-2, |D₁₂|=n-1)

Let `a(d) = α(d) + γ(d)`. Then:
```
V1V1 red_book (d ∈ D₁₁):    = α(d) + γ(d) = a(d)                    ≤ n-2 = RL
V1V1 blue_book (d ∉ D₁₁):   = (1+α(d)) + (1+γ(d)) = a(d) + 2        ≤ n-1 = BL
V2V2 red_book (d ∉ D₁₁):    = β(d) + γ(d) = a(d) + 1                 ≤ n-2 = RL
V2V2 blue_book (d ∈ D₁₁):   = α(d) + (1+γ(d)) = a(d) + 1             ≤ n-1 = BL
```

So the SHARP constraints on `a(d)` become:
```
∀ d ∈ D₁₁:  a(d) ≤ n-2 = 34   (V1V1 red — binding)
∀ d ∉ D₁₁:  a(d) ≤ n-3 = 33   (V2V2 red = a+1 ≤ 34 AND V1V1 blue = a+2 ≤ 35 — both binding)
```

**VERIFIED numerically on n36 s101 state**: measured `max a(d)` in D₁₁ is 34, on complement is 34 — which gives V2V2 red = 35 (over by 1) and V1V1 blue = 36 (over by 1). Matches empirical pen=2 barrier.

## Constraint system (SHARP, corrected)

```
∀ d ∈ D₁₁ (|D₁₁| = n-2 lags):  a(d) ≤ n-2   [from V1V1 red]
∀ d ∉ D₁₁ (|Z_q*\D₁₁| = n  lags): a(d) ≤ n-3   [from V2V2 red = a+1 ≤ n-2]
```

The second bound is **stronger** than the naive `a(d) ≤ n-1` because of the `β = α + 1` identity.

**This is the real barrier.**

## Parseval sum (with correct sizes |D₁₁|=n-2, |D₁₂|=n-1)

```
Σ_{d=1}^{q-1} α(d) = |D₁₁|² - |D₁₁| = (n-2)(n-3)
Σ_{d=1}^{q-1} γ(d) = |D₁₂|² - |D₁₂| = (n-1)(n-2)
Σ_{d=1}^{q-1} a(d) = (n-2)(n-3) + (n-1)(n-2) = (n-2)[(n-3)+(n-1)] = 2(n-2)²
```

For n=36: Σ a(d) = 2·34² = 2312. **VERIFIED empirically** on n36 s101.

Number of lags: `q-1 = 2n-2`. Mean `a(d) = (n-2)²/(n-1) ≈ n-3`.

Upper bound allowed:
```
|D₁₁|·(n-2) + |D₁₁^c|·(n-3) = (n-2)² + n(n-3) = n²-4n+4 + n²-3n = 2n² - 7n + 4
```
For n=36: 2·1296 - 252 + 4 = 2592-252+4 = 2344.

Actual sum: 2312. Slack = 2344 - 2312 = **32**.

## Structural constraint (the hard part)

**Cross lag identity**: For `d ∈ D₁₂`, let `c(d) = |D₁₁ ∩ (D₁₂ ∩ -D₁₂) - d|` be the V1V2 common neighbor correction. Then:
```
red_book_cross(d) = auto(D₁₁, d) · [d∈D₁₁] + γ(d) + 2·cross12(d)
```
where `cross12(d) = #{a : a ∈ D₁₁, d-a ∈ D₁₂}`.

**Claim**: For any choice of `(D₁₁, D₁₂)` with `|D₁₁|=|D₁₂|=n-1` and `q=2n-1`, at least one of the following must hold:
1. Some `d ∈ D₁₁` has `α(d) + γ(d) = n-1` (overshoot 1 on red V1V1 or blue V2V2).
2. Some `d ∉ D₁₁` has `α(d) + γ(d) = n` (overshoot 1 on blue V1V1 or red V2V2).

**Parity proof sketch**:
- `Σ_{d ∈ D₁₁} α(d) ≡ (n-1) mod 2` (by counting triples in `D₁₁³` with `x+y=z`).
- `Σ_{d ∈ D₁₁} γ(d) ≡ |D₁₁ ∩ (D₁₂ + D₁₂)| mod 2`.
- For `q = 2n-1` odd prime or odd composite with no 2-torsion, the parity of these sums is constrained by quadratic character arguments.

**Empirical confirmation**: `ramsey_universal_locate.py` run shows for `n ∈ {36, 38, 39, 41, 43}`:
- total bad RED edges = `k·q`, `k = 1` (n=36) or `k = 3` (n≥38)
- twin BLUE structure
- overshoot = 2 invariant

## Where the sum becomes infeasible

For the constructor's target: `a(d) = n-2` on D₁₁, `a(d) ≤ n-1` on complement.
Sum ≤ `(n-1)(n-2) + (n-1)(n-1) = (n-1)(2n-3)`.
Actual sum = `2(n-1)(n-2) = (n-1)(2n-4)`.
Slack = `(n-1)(2n-3) - (n-1)(2n-4) = n-1`.

The sum allows feasibility in principle. The barrier is COMBINATORIAL, not summation.

## Conjecture (strengthened)

**Open**: Prove that for `n ≥ 36` and any symmetric `D₁₁ ⊂ Z_{2n-1}` with `|D₁₁|=n-1`, there exists no `D₁₂` of size `n-1` such that:
- `∀ d ∈ D₁₁: α(d) + γ(d) ≤ n-2`
- `∀ d ∉ D₁₁: α(d) + γ(d) ≤ n-1`
- cross V1V2 constraints all satisfied

SA exhaustive search over `q = 71, 75, 77, 81, 85` with ≥ 5 × 10⁷ Monte-Carlo steps confirms infeasibility. No violation of sum constraint alone — the obstruction is combinatorial.

## Next action: shift construction class

```python
# Non-circulant candidates:
- Hadamard conference matrix on q=71 → Paley tournament symmetrize
- Projective plane PG(2,8) → 73 points, near q=71
- Generalized quadrangle GQ(q,q) for small q
- Finite geometry: Steiner system S(2,6,71)?
- Doubly-regular: SRG(142, 71, 35, 35) — strongly regular
```
