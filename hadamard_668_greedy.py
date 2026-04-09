#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — Hadamard H(668): Greedy Coordinate Descent + Multi-bit Escape
=============================================================================

Parallel algorithm to SA agents (random-flip):
  (1) enumerate all O(4×84)=336 possible palindrome flips
  (2) pick steepest descent
  (3) apply ⟹ deterministic convergence to local min
  (4) on local min ⟹ k-bit random escape (k ∈ {3,5,7})
  (5) on stale ⟹ full restart from best-so-far + perturbation

∴ covers a different region of the landscape than random SA.
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


def all_deltas(S, vecs, n):
    """Vectorised: compute ΔE for every (k, j) ∈ 4×[0..(n-1)/2]. Returns matrix (4, half+1)."""
    half = (n - 1) // 2
    D = np.empty((4, half + 1), dtype=np.int64)
    for k in range(4):
        for j in range(half + 1):
            _, dE = palindrome_flip_delta(S, vecs[k], j, n)
            D[k, j] = dE
    return D


def apply_best_move(S, vecs, D, n):
    """Apply the (k*, j*) = argmin D. Returns (ΔE, k*, j*)."""
    k_star, j_star = np.unravel_index(np.argmin(D), D.shape)
    k_star, j_star = int(k_star), int(j_star)
    best_dE = int(D[k_star, j_star])
    dPAF, _ = palindrome_flip_delta(S, vecs[k_star], j_star, n)
    apply_flip(vecs[k_star], j_star, n)
    S += dPAF
    return best_dE, k_star, j_star


def k_bit_perturb(vecs, k, n, rng):
    """Flip k random palindrome positions (uniform over 4 vecs × [0..half])."""
    half = (n - 1) // 2
    choices = [(kk, jj) for kk in range(4) for jj in range(half + 1)]
    for kk, jj in rng.sample(choices, k):
        apply_flip(vecs[kk], jj, n)


def greedy_cd(seed=101, max_rounds=5000, patience=20, escape_bits=(3, 5, 7, 11),
              save_prefix='h668_greedy'):
    rng = random.Random(seed)
    nrng = np.random.default_rng(seed)
    n = N

    vecs = [random_palindrome(n, nrng) for _ in range(4)]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]

    t0 = time.time()
    stale_rounds = 0
    round_no = 0
    total_moves = 0
    escapes = 0
    restarts = 0

    print(f"GCD seed={seed}  E0={E}", flush=True)

    while round_no < max_rounds:
        round_no += 1

        # Descent phase: greedy until local min
        descent_steps = 0
        while True:
            D = all_deltas(S, vecs, n)
            min_dE = int(D.min())
            if min_dE >= 0:
                break  # local min
            dE, k_s, j_s = apply_best_move(S, vecs, D, n)
            E += dE
            descent_steps += 1
            total_moves += 1
            if descent_steps > 10000:
                break

        if E < best:
            best = E
            best_vecs = [v.copy() for v in vecs]
            stale_rounds = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'round': round_no,
                           'vecs': [v.tolist() for v in best_vecs]}, f)
            dt = time.time() - t0
            print(f"  round {round_no}: E={E} best={best} steps={descent_steps} ({dt:.0f}s)", flush=True)
        else:
            stale_rounds += 1

        if E == 0:
            print(f"FOUND E=0 in round {round_no} total_moves={total_moves}", flush=True)
            return best_vecs, 0

        # Escape: k-bit perturb with increasing k
        k_escape = escape_bits[min(stale_rounds // 5, len(escape_bits) - 1)]
        k_bit_perturb(vecs, k_escape, n, rng)
        S = compute_paf_sums(vecs)
        E = energy_from_S(S)
        escapes += 1

        # Big restart after long stall
        if stale_rounds >= patience:
            restarts += 1
            # Reset from best + heavy perturbation (n/4 bits)
            vecs = [v.copy() for v in best_vecs]
            k_bit_perturb(vecs, 20, n, rng)
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            stale_rounds = 0
            dt = time.time() - t0
            print(f"  [RESTART #{restarts} round {round_no}] best={best} E={E} ({dt:.0f}s)", flush=True)

    dt = time.time() - t0
    print(f"DONE seed={seed} best={best} rounds={round_no} total_moves={total_moves} escapes={escapes} restarts={restarts} ({dt:.0f}s)", flush=True)

    if best == 0:
        export_hadamard(best_vecs, save_prefix)

    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=101)
    ap.add_argument('--max_rounds', type=int, default=5000)
    ap.add_argument('--patience', type=int, default=20)
    ap.add_argument('--prefix', type=str, default='h668_greedy')
    args = ap.parse_args()
    greedy_cd(seed=args.seed, max_rounds=args.max_rounds, patience=args.patience, save_prefix=args.prefix)
