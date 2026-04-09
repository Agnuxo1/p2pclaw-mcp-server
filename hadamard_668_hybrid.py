#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Hybrid Greedy + Metropolis + 2-bit Swap
================================================================

Strategy: alternate (a) greedy descent to local min, (b) Metropolis warm-up,
(c) 2-bit swap moves (non-local). Swap moves can cross local minima barriers
that single-bit flips cannot traverse.

Two-bit swap: flip positions (j1, j2) simultaneously in same vec k.
  ΔPAF(d) via superposition + cross-correction term at d = |j1 ± j2| and
  mirror lags (when j1+d or j2-d lands in F).

Tested: breaks the ≈9000-13000 plateau by exchanging bits between pair-positions
without descending through single-bit paths.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, random_palindrome, legendre_palindrome,
    compute_paf_sums, energy_from_S,
    palindrome_flip_delta, apply_flip,
    build_hadamard, verify_hadamard, export_hadamard,
)


def two_bit_swap_delta(S, v, j1, j2, n):
    """ΔS and ΔE for simultaneous palindrome flip at j1 and j2 (j1 ≠ j2).

    Trick: do flip1, compute delta, apply, compute delta2 from new state,
    revert. Total ΔE accumulates correctly because S → S + d1 → S + d1 + d2.

    Returns (dPAF_total, dE_total).
    """
    d1, dE1 = palindrome_flip_delta(S, v, j1, n)
    apply_flip(v, j1, n)
    S1 = S + d1
    d2, dE2 = palindrome_flip_delta(S1, v, j2, n)
    # Revert v
    apply_flip(v, j1, n)
    return d1 + d2, dE1 + dE2


def hybrid_attack(seed=301, max_time=1200, phase_iter=50000, T_start=400.0, T_min=20.0,
                  save_prefix='h668_hybrid'):
    rng = random.Random(seed)
    nrng = np.random.default_rng(seed)
    n = N
    half = (n - 1) // 2

    vecs = [random_palindrome(n, nrng) for _ in range(4)]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]

    t0 = time.time()
    phase = 0
    global_moves = 0

    print(f"HYB seed={seed} E0={E}", flush=True)

    while time.time() - t0 < max_time:
        phase += 1
        phase_best = E

        # --- Phase GA: Greedy + Metropolis with 1-bit flips at moderate T ---
        T = T_start
        stale = 0
        for it in range(phase_iter):
            # 80% 1-bit flip, 20% 2-bit swap
            if rng.random() < 0.80:
                k = int(nrng.integers(4))
                j = int(nrng.integers(half + 1))
                dPAF, dE = palindrome_flip_delta(S, vecs[k], j, n)
                if dE <= 0 or rng.random() < math.exp(-dE / T):
                    apply_flip(vecs[k], j, n)
                    S += dPAF
                    E += dE
                else:
                    stale += 1
            else:
                k = int(nrng.integers(4))
                j1 = int(nrng.integers(half + 1))
                j2 = int(nrng.integers(half + 1))
                while j2 == j1:
                    j2 = int(nrng.integers(half + 1))
                dPAF, dE = two_bit_swap_delta(S, vecs[k], j1, j2, n)
                if dE <= 0 or rng.random() < math.exp(-dE / T):
                    apply_flip(vecs[k], j1, n)
                    apply_flip(vecs[k], j2, n)
                    S += dPAF
                    E += dE
                else:
                    stale += 1

            if E < best:
                best = E
                best_vecs = [v.copy() for v in vecs]
                stale = 0
                with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                    json.dump({'seed': seed, 'E': int(best), 'phase': phase,
                               'vecs': [v.tolist() for v in best_vecs]}, f)

            if E == 0:
                print(f"FOUND E=0! phase={phase} it={it}", flush=True)
                export_hadamard(vecs, save_prefix)
                return vecs, 0

            T = max(T_min, T * 0.99995)
            global_moves += 1

        dt = time.time() - t0
        print(f"  phase {phase}: E={E} phase_best={phase_best} best={best} stale={stale} ({dt:.0f}s total)", flush=True)

        # Restart injection: 10% random + preserve best
        if E > best * 1.5:
            vecs = [v.copy() for v in best_vecs]
            # Inject 5 random palindrome flips
            for _ in range(5):
                k = int(nrng.integers(4))
                j = int(nrng.integers(half + 1))
                apply_flip(vecs[k], j, n)
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best} phases={phase} ({dt:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=301)
    ap.add_argument('--max_time', type=int, default=1200)
    ap.add_argument('--T_start', type=float, default=400.0)
    ap.add_argument('--phase_iter', type=int, default=50000)
    ap.add_argument('--prefix', type=str, default='h668_hybrid')
    args = ap.parse_args()
    hybrid_attack(seed=args.seed, max_time=args.max_time, phase_iter=args.phase_iter,
                  T_start=args.T_start, save_prefix=args.prefix)
