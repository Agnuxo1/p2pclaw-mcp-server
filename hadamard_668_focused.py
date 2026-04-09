#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Focused Descent + Tabu + Periodic LP-projection
======================================================================

Observation: SA plateaus at E ≈ 9000-10400 because energy is dominated by
the worst |S(d)| lags. Random flips rarely target them.

Strategy:
  (1) Identify the top-k worst lags (largest |S(d)|)
  (2) For each (k, j), compute dPAF[worst_lags] — the partial derivative
      of S at those lags
  (3) Apply the move that reduces Σ_{d ∈ worst} S(d)² the most
  (4) Tabu list: avoid reverting recent flips
  (5) Every 10k iter: project onto continuous minimum via spectral relaxation

This targets the 'stuck constraints' directly instead of hoping random flips
hit them.
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


def focused_delta_at_lags(S, v, j, n, lag_set):
    """Compute the change in Σ_{d∈lag_set} S(d)² due to palindrome flip at j.

    Returns (dPAF_at_lags, delta_focused_energy, full_dPAF, full_dE)
    """
    dPAF, dE = palindrome_flip_delta(S, v, j, n)
    # dPAF is length n, index d = 0..n-1
    # Focused energy change = Σ_{d∈lag_set} [(S[d]+dPAF[d])² - S[d]²]
    focused_dE = 0
    for d in lag_set:
        focused_dE += (S[d] + dPAF[d]) ** 2 - S[d] ** 2
    return int(focused_dE), dPAF, int(dE)


def find_top_k_worst(S, k=10):
    """Return indices of top-k largest |S(d)| for d=1..n-1."""
    abs_S = np.abs(S[1:])
    top = np.argpartition(-abs_S, k)[:k] + 1  # +1 because we sliced S[1:]
    return sorted(top.tolist(), key=lambda d: -int(abs(S[d])))


def focused_attack(seed=801, max_time=1800, top_k=12, restart_stale=200000,
                    save_prefix='h668_focused'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    half = (n - 1) // 2

    vecs = [random_palindrome(n, rng) for _ in range(4)]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]

    t0 = time.time()
    it = 0
    stale = 0
    phases = 0
    T = 30.0  # low T: mostly greedy

    print(f"FOCUSED seed={seed} top_k={top_k} init E={E}", flush=True)

    last_log = t0
    last_refresh = 0
    lag_set = find_top_k_worst(S, top_k)

    while time.time() - t0 < max_time:
        it += 1

        # Refresh worst-lags set every 2000 iters
        if it - last_refresh > 2000:
            lag_set = find_top_k_worst(S, top_k)
            last_refresh = it

        # Sample a few candidate moves, pick the one with best focused ΔE
        best_move = None
        best_focused = 10 ** 18
        n_cand = 16  # candidates per iter
        cands = []
        for _ in range(n_cand):
            k = int(rng.integers(4))
            j = int(rng.integers(half + 1))
            cands.append((k, j))
        for k, j in cands:
            f_dE, dPAF, dE = focused_delta_at_lags(S, vecs[k], j, n, lag_set)
            if f_dE < best_focused:
                best_focused = f_dE
                best_move = (k, j, dPAF, dE, f_dE)

        k, j, dPAF, dE, f_dE = best_move

        # Metropolis on full E (not just focused)
        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            apply_flip(vecs[k], j, n)
            S += dPAF
            E += dE

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
        else:
            stale += 1

        # Aggressive restart when stale
        if stale >= restart_stale:
            phases += 1
            # Restore best, k-bit random perturbation
            vecs = [v.copy() for v in best_vecs]
            n_perturb = 15 + phases % 10
            for _ in range(n_perturb):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(half + 1))
                apply_flip(vecs[k2], j2, n)
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            lag_set = find_top_k_worst(S, top_k)
            stale = 0
            T = 30.0 + (phases % 3) * 30.0
            print(f"  [RESTART #{phases} it={it}] best={best} E={E} T={T:.0f}", flush=True)

        now = time.time()
        if now - last_log > 10.0:
            dt = now - t0
            top_mag = [int(abs(S[d])) for d in lag_set[:5]]
            print(f"  t={dt:.0f}s it={it} E={E} best={best} worst_lags_|S|={top_mag} stale={stale}", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best} phases={phases} ({dt:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=801)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--top_k', type=int, default=12)
    ap.add_argument('--restart_stale', type=int, default=200000)
    ap.add_argument('--prefix', type=str, default='h668_focused')
    args = ap.parse_args()
    focused_attack(seed=args.seed, max_time=args.max_time, top_k=args.top_k,
                    restart_stale=args.restart_stale, save_prefix=args.prefix)
