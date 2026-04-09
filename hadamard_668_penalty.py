#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Augmented-energy SA with column-sum penalty
===================================================================

Root cause of nonpal plateau at E ≈ 1728: champion has col_sums [15,13,-1,15],
Σ s_k² = 620, but target = 4n = 668. Gap = 48 units.

A valid solution requires Σ s_k² = 668 (Parseval identity for S(0) = 4n).
Plain SA doesn't see this: E measures only d≥1 lags.

Augmented energy:
    E_aug = E_PAF + λ · (Σ s_k² − 668)²

During flips: Δ(Σ s_k²) = ((s_k ± 2)² − s_k²) = ±4 s_k + 4
So penalty delta is tractable in O(1) per flip.

Schedule λ:
  - Start λ = 0.1 (weak pressure)
  - Ramp to λ = 10 if stuck
  - Release to λ = 0 once Σs² = 668 (manifold reached)
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, compute_paf_sums, energy_from_S, export_hadamard
from hadamard_668_nonpalindrome import random_vec, single_flip_delta


def penalty_sa(seed=4001, max_time=10800, T0=300.0, alpha=0.9999997,
                lam_init=0.2, lam_max=50.0, ramp_every=500000,
                restart_stale=3000000, chkpt=None,
                save_prefix='h668_pen'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    target_sum_sq = 4 * n  # 668

    if chkpt:
        with open(chkpt) as f:
            state = json.load(f)
        vecs = [np.array(v, dtype=np.int8) for v in state['vecs']]
    else:
        vecs = [random_vec(n, rng) for _ in range(4)]

    col_sums = [int(v.sum()) for v in vecs]
    sum_sq = sum(s * s for s in col_sums)

    S = compute_paf_sums(vecs)
    E_paf = energy_from_S(S)
    lam = lam_init
    sum_dev = sum_sq - target_sum_sq
    E_pen = lam * sum_dev * sum_dev
    E_aug = E_paf + E_pen

    best_paf = E_paf
    best_aug = E_aug
    best_vecs = [v.copy() for v in vecs]
    best_col_sums = list(col_sums)

    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0
    last_ramp = 0

    print(f"PENALTY seed={seed} init E_paf={E_paf} col_sums={col_sums} Σs²={sum_sq} dev={sum_dev} λ={lam}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        k = int(rng.integers(4))
        j = int(rng.integers(n))

        # Single-flip delta on PAF
        dPAF, dE_paf = single_flip_delta(S, vecs[k], j, n)

        # Delta on col_sums[k]: flipping v[j]=±1 → ∓1 shifts sum by −2·v[j]
        vj = int(vecs[k][j])
        new_col_k = col_sums[k] - 2 * vj
        new_sum_sq = sum_sq - col_sums[k] ** 2 + new_col_k ** 2
        new_dev = new_sum_sq - target_sum_sq
        new_E_pen = lam * new_dev * new_dev
        dE_pen = new_E_pen - E_pen
        dE_aug = dE_paf + dE_pen

        if dE_aug <= 0 or py_rng.random() < math.exp(-dE_aug / T):
            vecs[k][j] = -vecs[k][j]
            S += dPAF
            E_paf += dE_paf
            col_sums[k] = new_col_k
            sum_sq = new_sum_sq
            E_pen = new_E_pen
            E_aug = E_paf + E_pen

        # Track champion by PAF energy only (the real objective)
        # but require Σs² near target (tol ≤ 50 units above target-zero)
        if E_paf < best_paf and abs(sum_sq - target_sum_sq) <= 100:
            best_paf = E_paf
            best_vecs = [v.copy() for v in vecs]
            best_col_sums = list(col_sums)
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best_paf),
                           'col_sums': best_col_sums,
                           'sum_sq': int(sum(c*c for c in best_col_sums)),
                           'it': it, 'lam': lam,
                           'vecs': [v.tolist() for v in best_vecs]}, f)
            if best_paf == 0 and sum_sq == target_sum_sq:
                print(f"FOUND E=0 and Σs²={target_sum_sq}! it={it}", flush=True)
                export_hadamard(vecs, save_prefix)
                return vecs, 0
        else:
            stale += 1

        T *= alpha

        # Ramp λ when stale
        if it - last_ramp > ramp_every:
            if abs(sum_sq - target_sum_sq) > 10:
                lam = min(lam_max, lam * 1.5)
            else:
                lam = max(lam_init, lam * 0.7)
            # Recompute penalty
            E_pen = lam * (sum_sq - target_sum_sq) ** 2
            E_aug = E_paf + E_pen
            last_ramp = it

        # Periodic drift correction
        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E_paf = energy_from_S(S)
            col_sums = [int(v.sum()) for v in vecs]
            sum_sq = sum(c * c for c in col_sums)
            E_pen = lam * (sum_sq - target_sum_sq) ** 2
            E_aug = E_paf + E_pen

        if stale >= restart_stale:
            restarts += 1
            vecs = [v.copy() for v in best_vecs]
            for _ in range(20 + restarts % 10):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(n))
                vecs[k2][j2] = -vecs[k2][j2]
            S = compute_paf_sums(vecs)
            E_paf = energy_from_S(S)
            col_sums = [int(v.sum()) for v in vecs]
            sum_sq = sum(c * c for c in col_sums)
            E_pen = lam * (sum_sq - target_sum_sq) ** 2
            E_aug = E_paf + E_pen
            T = T0 * (0.6 ** (restarts % 5))
            stale = 0
            print(f"  [RESTART #{restarts}] best_paf={best_paf} E_paf={E_paf} Σs²={sum_sq} λ={lam:.2f} T={T:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            dev = sum_sq - target_sum_sq
            print(f"  t={dt:.0f}s it={it} E_paf={E_paf} best={best_paf} Σs²={sum_sq}(dev={dev}) λ={lam:.2f} T={T:.1f} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best_paf={best_paf} col_sums={best_col_sums} ({time.time()-t0:.0f}s)", flush=True)
    return best_vecs, best_paf


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=4001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=300.0)
    ap.add_argument('--alpha', type=float, default=0.9999997)
    ap.add_argument('--lam_init', type=float, default=0.2)
    ap.add_argument('--lam_max', type=float, default=50.0)
    ap.add_argument('--prefix', type=str, default='h668_pen')
    args = ap.parse_args()
    penalty_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time, T0=args.T0,
                alpha=args.alpha, lam_init=args.lam_init, lam_max=args.lam_max,
                save_prefix=args.prefix)
