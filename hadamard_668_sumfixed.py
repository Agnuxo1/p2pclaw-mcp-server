#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Sum-fixed pair-swap SA
==============================================

KEY INSIGHT: For E = 0 (Williamson condition), the column sums must satisfy
    Σ_k (Σ_i v_k[i])² = 4n = 668
because Σ_{d=1}^{n-1} S(d) = Σ_k (Σ v_k)² − 4n must = 0.

Since v_k ∈ {±1}^167, Σ v_k is odd, so (Σ v_k)² is odd. Four odd squares
summing to 668 admits (at least) the following quadruples:
    {3, 7, 13, 21},  {5, 9, 11, 21},  {7, 13, 15, 15}

Strategy:
  1. Initialise v_k with fixed row sums matching one of these quadruples
  2. Use PAIR-SWAP moves inside each vec: flip v_k[i] (+1→-1) AND v_k[j] (-1→+1)
     ⟹ sum of v_k preserved exactly
  3. Standard Metropolis on full energy E

This restricts the search to a constraint-satisfying manifold, which is
10^{96}-dimensional but much smaller than 2^{668} and guaranteed to contain
solutions (if Williamson non-palindromic exists for q=167).
"""
import sys, os, json, time, math, random, argparse
import numpy as np
from itertools import product

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, compute_paf_sums, energy_from_S,
    build_hadamard, verify_hadamard, export_hadamard,
)
from hadamard_668_nonpalindrome import single_flip_delta


def find_sum_quadruples(target=668, max_val=167):
    """All (a,b,c,d) with a≤b≤c≤d odd positive, a²+b²+c²+d² = target."""
    sols = []
    for a in range(1, max_val + 1, 2):
        if a * a > target: break
        for b in range(a, max_val + 1, 2):
            if a*a + b*b > target: break
            for c in range(b, max_val + 1, 2):
                if a*a + b*b + c*c > target: break
                rem = target - a*a - b*b - c*c
                d = int(math.isqrt(rem))
                if d*d == rem and d >= c and d <= max_val and d % 2 == 1:
                    sols.append((a, b, c, d))
    return sols


def init_with_sum(n, target_sum, rng):
    """Build a ±1 vector of length n with Σ v[i] = target_sum (signed)."""
    # #+1 = p, #-1 = n-p, sum = 2p - n. So p = (n + target_sum) / 2
    p = (n + target_sum) // 2
    assert 0 <= p <= n, f"target_sum {target_sum} not achievable for n={n}"
    v = np.array([1] * p + [-1] * (n - p), dtype=np.int8)
    rng.shuffle(v)
    return v


def pair_swap_delta(S, v, i, j, n):
    """ΔPAF and ΔE for flipping v[i] and v[j] simultaneously (assumes v[i] != v[j])."""
    d1, dE1 = single_flip_delta(S, v, i, n)
    v[i] = -v[i]
    S1 = S + d1
    d2, dE2 = single_flip_delta(S1, v, j, n)
    v[i] = -v[i]  # revert
    return d1 + d2, dE1 + dE2


def sumfixed_sa(seed=1201, max_time=1800, T0=200.0, alpha=0.9999995,
                 quadruple=None, signs=None, restart_stale=1500000,
                 save_prefix='h668_sumfix'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    quads = find_sum_quadruples(4 * n, n)
    print(f"SUMFIX seed={seed} available quadruples: {quads}", flush=True)

    if quadruple is None:
        quadruple = quads[seed % len(quads)]
    if signs is None:
        # Random signs (16 combinations)
        signs = [1 if (seed >> i) & 1 == 0 else -1 for i in range(4)]

    sums = [s * q for s, q in zip(signs, quadruple)]
    print(f"  using quadruple {quadruple} × signs {signs} → sums {sums}", flush=True)

    vecs = [init_with_sum(n, s, rng) for s in sums]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]

    # Verify sums at start
    for k, (v, s) in enumerate(zip(vecs, sums)):
        assert int(v.sum()) == s, f"vec {k} sum {v.sum()} != {s}"

    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    attempts_pos = 0
    attempts_swap_valid = 0

    print(f"  init E={E}", flush=True)

    last_log = t0
    while time.time() - t0 < max_time:
        it += 1
        # Pick random vec, then two positions with opposite signs
        k = int(rng.integers(4))
        v = vecs[k]
        # Pick i with v[i]=+1, j with v[j]=-1 (or vice versa randomly)
        pos_idx = np.nonzero(v > 0)[0]
        neg_idx = np.nonzero(v < 0)[0]
        if len(pos_idx) == 0 or len(neg_idx) == 0:
            continue
        i = int(pos_idx[int(rng.integers(len(pos_idx)))])
        j = int(neg_idx[int(rng.integers(len(neg_idx)))])

        dPAF, dE = pair_swap_delta(S, v, i, j, n)

        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            v[i] = -v[i]
            v[j] = -v[j]
            S += dPAF
            E += dE
            attempts_pos += 1
            assert int(v.sum()) == sums[k], f"vec sum drifted! {v.sum()} != {sums[k]}"

        if E < best:
            best = E
            best_vecs = [v.copy() for v in vecs]
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'it': it,
                           'quadruple': list(quadruple), 'signs': list(signs),
                           'vecs': [v.tolist() for v in best_vecs]}, f)
            if best == 0:
                print(f"FOUND E=0!! quadruple={quadruple}", flush=True)
                export_hadamard(vecs, save_prefix)
                return vecs, 0
        else:
            stale += 1

        T *= alpha

        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        if stale >= restart_stale:
            restarts += 1
            vecs = [v.copy() for v in best_vecs]
            # 20 pair-swaps perturbation
            for _ in range(20):
                k2 = int(rng.integers(4))
                v2 = vecs[k2]
                pi = np.nonzero(v2 > 0)[0]
                ni = np.nonzero(v2 < 0)[0]
                if len(pi) and len(ni):
                    i2 = int(pi[int(rng.integers(len(pi)))])
                    j2 = int(ni[int(rng.integers(len(ni)))])
                    v2[i2] = -v2[i2]
                    v2[j2] = -v2[j2]
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T = T0 * (0.5 ** (restarts % 4))
            stale = 0
            print(f"  [RESTART #{restarts} it={it}] best={best} E={E} T={T:.1f}", flush=True)

        now = time.time()
        if now - last_log > 10.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T:.2f} stale={stale} r={restarts}", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} quadruple={quadruple} best={best} ({dt:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1201)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--T0', type=float, default=200.0)
    ap.add_argument('--alpha', type=float, default=0.9999995)
    ap.add_argument('--quadruple', type=str, default=None, help='comma-separated e.g. 7,13,15,15')
    ap.add_argument('--signs', type=str, default=None, help='comma-separated +1/-1 e.g. 1,1,1,-1')
    ap.add_argument('--prefix', type=str, default='h668_sumfix')
    args = ap.parse_args()
    q = tuple(int(x) for x in args.quadruple.split(',')) if args.quadruple else None
    s = [int(x) for x in args.signs.split(',')] if args.signs else None
    sumfixed_sa(seed=args.seed, max_time=args.max_time, T0=args.T0, alpha=args.alpha,
                 quadruple=q, signs=s, save_prefix=args.prefix)
