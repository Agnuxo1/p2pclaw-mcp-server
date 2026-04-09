#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Non-palindromic Williamson SA
=====================================================

Observation: The palindromic Williamson SA plateaus at E ≈ 9000-10000.
This may indicate Williamson sequences don't exist for q=167 (same pattern
as known non-existence cases q=35,47,53,59,83,89,101,107 — Djokovic 2004+).

Alternative construction: drop the palindrome constraint on A,B,C,D.
They must be CIRCULANT (not symmetric), and still:
   AA^T + BB^T + CC^T + DD^T = 4qI_q
which for circulants is equivalent to:
   PAF_A(d) + PAF_B(d) + PAF_C(d) + PAF_D(d) = 0  ∀ d ≠ 0

PAF is automatically symmetric in the period: PAF(d) = PAF(n-d). So there
are only (n-1)/2 = 83 independent lag constraints.

Search space:
  palindromic:     4 × 84 = 336 bits, 83 constraints, 4.05 bits/constraint
  non-palindromic: 4 × 167 = 668 bits, 83 constraints, 8.04 bits/constraint

The Williamson array still holds because all circulants commute.

Fast single-bit-flip delta (non-palindromic):
  Flipping a_j changes PAF_a(d) by ΔPAF(d) = −2·a_j·(a_{(j+d) mod n} + a_{(j−d) mod n})
  (except d=0 which is unchanged)
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, compute_paf_sums, energy_from_S,
    build_hadamard, verify_hadamard, export_hadamard,
)


def random_vec(n, rng):
    """Random full ±1 vector (not necessarily symmetric)."""
    return rng.choice([-1, 1], size=n).astype(np.int8)


def single_flip_delta(S, v, j, n):
    """ΔPAF[0..n-1] and ΔE for flipping v[j] (non-palindromic).

    ΔPAF(d) = −2 v[j] · (v[(j+d) mod n] + v[(j−d) mod n])  for d=1..n−1
    ΔPAF(0) = 0
    ΔE = (2S + ΔPAF)·ΔPAF restricted to d ≥ 1.
    """
    d_arr = np.arange(1, n, dtype=np.int64)
    jp = (j + d_arr) % n
    jm = (j - d_arr) % n
    vj = int(v[j])
    dPAF_nonzero = (-2 * vj * (v[jp].astype(np.int64) + v[jm].astype(np.int64)))
    # Note: when d = n/2 and n even, j+d = j-d mod n but n=167 is odd so this
    # doesn't apply. Also when j+d = j−d mod n → 2d ≡ 0 mod n, d = 0 or n/2.
    dE = int(np.dot(2 * S[1:] + dPAF_nonzero, dPAF_nonzero))
    dPAF_full = np.empty(n, dtype=np.int64)
    dPAF_full[0] = 0
    dPAF_full[1:] = dPAF_nonzero
    return dPAF_full, dE


def nonpal_sa(seed=901, max_time=1800, T0=500.0, alpha=0.999995,
               restart_stale=800000, save_prefix='h668_nonpal'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N  # 167

    vecs = [random_vec(n, rng) for _ in range(4)]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]

    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    accepts = 0
    rejects = 0

    print(f"NONPAL seed={seed} init E={E} T0={T0}", flush=True)

    last_log = t0
    while time.time() - t0 < max_time:
        it += 1
        k = int(rng.integers(4))
        j = int(rng.integers(n))   # full range now, not just [0..half]
        dPAF, dE = single_flip_delta(S, vecs[k], j, n)

        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            vecs[k][j] = -vecs[k][j]
            S += dPAF
            E += dE
            accepts += 1
        else:
            rejects += 1
            stale += 1

        if E < best:
            best = E
            best_vecs = [v.copy() for v in vecs]
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'it': it,
                           'vecs': [v.tolist() for v in best_vecs]}, f)
            if best == 0:
                print(f"FOUND E=0! it={it}", flush=True)
                export_hadamard(vecs, save_prefix)
                return vecs, 0

        T *= alpha

        # Periodic drift correction
        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        if stale >= restart_stale:
            restarts += 1
            vecs = [v.copy() for v in best_vecs]
            for _ in range(30):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(n))
                vecs[k2][j2] = -vecs[k2][j2]
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T = T0 * (0.5 ** (restarts % 4))
            stale = 0
            print(f"  [RESTART #{restarts} it={it}] best={best} E={E} T={T:.1f}", flush=True)

        now = time.time()
        if now - last_log > 10.0:
            dt = now - t0
            acc = accepts / max(1, accepts + rejects) * 100
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T:.1f} acc={acc:.0f}% restarts={restarts}", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best} ({dt:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=901)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--T0', type=float, default=500.0)
    ap.add_argument('--alpha', type=float, default=0.999995)
    ap.add_argument('--restart_stale', type=int, default=800000)
    ap.add_argument('--prefix', type=str, default='h668_nonpal')
    args = ap.parse_args()
    nonpal_sa(seed=args.seed, max_time=args.max_time, T0=args.T0, alpha=args.alpha,
               restart_stale=args.restart_stale, save_prefix=args.prefix)
