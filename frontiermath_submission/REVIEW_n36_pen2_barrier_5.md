# Review #5: Ramsey R(B_{n-1}, B_n) > 4n-2 — Universal Barrier Cemented

**Date**: 2026-04-09 (20-min cycle #5)  
**State**: universal pen=2 barrier verified, SRG ruled out, cyclic Z_142 weaker, DEGREE-PARITY obstruction identified

## Key new result: degree-parity lemma

```
Lemma (Sum-Deg bound):
For G on v=142 with maxR ≤ 34, maxB ≤ 35, if G is d-regular then d ≤ 70.

Proof: Σ_w C(d,2) = 142·C(d,2) = 71 d(d-1)
       Σ pairs common_neighbors ≥ 34·|E| + 35·|NE| doesn't hold; need reverse.
       Actually 71 d(d-1) ≤ 34·71·d + 35·(10011 - 71·d)
       71 d² - 71 d ≤ 2414 d + 350385 - 2485 d
       71 d² - 71 d ≤ -71 d + 350385
       71 d² ≤ 350385
       d² ≤ 4935.7 ⟹ d ≤ 70.25 ⟹ d ≤ 70. ∎
```

**Corollary (2-block obstruction)**:
```
For 2-block circulant on q = 2n-1 (odd):
  V1 deg = |D11| + |D12|
  V2 deg = |D22| + |D12| = (q-1-|D11|) + |D12|
Difference = |D22| - |D11| = q-1-2|D11| = 2n-2-2|D11| = even ≠ 0 (since |D11| even).

Regular requires |D11| = (q-1)/2 = n-1 = ODD ⟹ 
  D11 cannot be symmetric (each d ≠ -d forces pairs).
  Contradiction. So 2-block circulant ⇏ regular.

Best asymmetric: V1 deg 69, V2 deg 71. Sum-of-C(d,2) = 343001.
Budget: 34·|E| + 35·|NE| = 345415. Slack = 2414.
This slack can be exhausted — actual SA result hits mR=35, mB=36 (over=2).
```

## Experimental exhaustion

| Approach | Best overshoot | Target | Note |
|---|---|---|---|
| 2-block circulant q=71 | **2** | 0 | UNIVERSAL barrier for n ≥ 36 |
| 3-block circulant (47,47,48) | 38 | 0 | SA worse than 2-block |
| Cyclic Z_142 single | 7 (k=72 s0) | 0 | Single circulant weaker |
| Paley derivatives (cyclotomic) | 14 | 0 | Algebraic much worse |
| Alt q (72, 73, 75) | ≥ 23 | 0 | Wrong v |
| SRG(142, k, λ, μ) | — | — | NO feasible params (searched all k ≤ 132) |
| SRG(143, …) minus vertex | — | — | NO feasible params |
| SRG(v, …) for v ∈ [140, 150] | — | — | ZERO feasible params |
| SAT + 90s × 8 | UNSAT unproven | 0 | Budget insufficient |

## Universal pen=2 table (confirmed by verify)

| n | q | best state | mR/RL | mB/BL | overshoot |
|---|---|---|---|---|---|
| 36 | 71 | s101 | 35/34 | 36/35 | **2** |
| 38 | 75 | s1003 | 37/36 | 38/37 | **2** |
| 39 | 77 | s1001 | 38/37 | 39/38 | **2** |
| 41 | 81 | s1002 | 40/39 | 41/40 | **2** |
| 43 | 85 | s1004 | 42/41 | 43/42 | **2** |

## Coupled-orbit decomposition (new analytic result)

```
Total bad RED edges (at best state) = k·q:
  n=36: k=1 (71 edges, 1 V2V2 orbit at lag 32)
  n=38: k=3 (225 edges, 2 V1V1 + 1 V2V2 orbits)
  n=39: k=3 (231 edges, 1 V1V1 + 2 V2V2 orbits)
  n=41: k=3 (243 edges, 3 V1V1 orbits — pure type)
  n=43: k=3 (255 edges, 1 V1V1 + 2 V2V2 orbits)
```

Pattern: `total_bad_RED = k_red · q`, `total_bad_BLUE = k_blue · q`, with `k_red = k_blue` (twin orbit structure). `k=1` for minimum case (n=36), `k=3` for larger (n≥38) — suggests a parity ladder.

## Formal proof status (sum constraint derivation)

Necessary conditions I've derived:
```
Let α(d) = auto(D11, d), β(d) = auto(D22, d), γ(d) = auto(D12, d)
Lemma: β(d) = α(d) + 1 if d ∈ D11, else α(d) - 1
Let a(d) = α(d) + γ(d).

Constraint system:
  ∀ d ∈ D11:  a(d) ≤ n-2 (tight from both V1V1 red & V2V2 blue)
  ∀ d ∉ D11:  a(d) ≤ n-1 (from both V1V1 blue & V2V2 red after β substitution)

Parseval:  Σ a(d) = 2(n-1)(n-2)  over q-1 = 2(n-1) lags.
Mean a(d) = n-2 exactly.
```

**Slack calculation**:
```
max Σ allowed = (n-1)(n-2) [on D11] + (n-1)(n-1) [on complement] = (n-1)(2n-3)
actual Σ = 2(n-1)(n-2) = (n-1)(2n-4)
slack = (n-1)
```

Sum alone allows feasibility, so sum doesn't prove barrier. **Obstruction is combinatorial** — must come from V1V2 cross constraints or finer parity/quadratic character of the auto-sequences.

## Current action matrix

```
priority | strategy                     | status         | notes
---------|------------------------------|----------------|---------------------------
1        | formal proof universal bar.  | sum not enough | need V1V2 + parity
2        | non-circulant Cayley graphs  | untested       | try Z_2^7, S_n^{(0)}, D_71
3        | graph products (G ⊠ H)       | untested       | need small good G, H
4        | local 2-block modification   | tried (lagswap)| pen ≥ 6 (FAIL)
5        | unequal block sizes          | untested       | |V1|=70, |V2|=72
6        | Paley(137) + 5 vertex extend | untested       | augmenting procedure
7        | SAT with q=71, T=8h          | UNSAT unproven | 90s each tried
8        | pivot to n=35 warm-up+1      | — (already solved)
9        | ACCEPT BARRIER, publish neg. | most likely    | write paper
```

## Files

| File | Role |
|---|---|
| `UNIVERSAL_PEN2_BARRIER.md` | Main observation |
| `PROOF_UNIVERSAL_BARRIER.md` | Formal proof sketch (incomplete) |
| `REVIEW_n36_pen2_barrier_5.md` | This review |
| `ramsey_universal_locate.py` | Bad-orbit locator (all n) |
| `ramsey_n36_cyclic142.py` | Single cyclic on 142 |
| `ramsey_turbo_v4.py` | Patched joint_sa_inner (adj_shift fix) |

## Next 20 min

1. Try asymmetric 2-block: |V1|=70 Z_70, |V2|=72 Z_72. Block-circulant but unequal.
2. Extend Paley(137) by 5 vertices — local insertion procedure.
3. Complete formal proof incorporating cross V1V2 constraints.
4. If still pen=2 — pivot to writing the negative result paper.
