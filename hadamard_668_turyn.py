#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn T-sequences
=========================================

Turyn T-sequences [Turyn 1974]: four sequences T_1, T_2, T_3, T_4 of length n
with entries in {0, ±1} such that:
  (i)  |T_1[i]| + |T_2[i]| + |T_3[i]| + |T_4[i]| = 1  ∀ i=0..n-1
  (ii) Σ_k NAF_{T_k}(d) = 0  ∀ d=1..n-1

where NAF (non-periodic / aperiodic auto-correlation):
  NAF_v(d) = Σ_{i=0}^{n-d-1} v[i] · v[i+d]

From T-sequences one builds 4 circulants using:
  A = T_1 + T_2 + T_3 + T_4
  B = T_1 + T_2 - T_3 - T_4
  C = T_1 - T_2 + T_3 - T_4
  D = T_1 - T_2 - T_3 + T_4

Each A,B,C,D ∈ {±1}^n, and by orthogonality of the Hadamard rows,
AA^T + BB^T + CC^T + DD^T = 4Σ_k NAF_{T_k}(d) = 0 at d≠0, = 4n at d=0.
So they are Williamson sequences!

For n=167, we need T-sequences of length 167. Search space:
  each position has 8 states: T_k[i] = ±1, k ∈ {1,2,3,4} (one of 4 × 2 = 8)
  → 8^{167} ≈ 10^{150} states (larger but structurally different)

Instead: store as "type[i] ∈ {0,1,2,3}" and "sign[i] ∈ {-1,+1}", so just
2 × 167 = 334 integers, 8^{167} ≈ 2^{501} states.

Energy: E = Σ_{d=1}^{n-1} (Σ_k NAF_{T_k}(d))^2

Fast delta: changing type[i] from a to b, or flipping sign[i], updates
NAF of at most 2 vecs by O(n) cost.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, build_hadamard, verify_hadamard, export_hadamard


def naf_vec(v, n):
    """NAF(d) for d=0..n-1. NAF(0) = Σ v²."""
    result = np.zeros(n, dtype=np.int64)
    for d in range(n):
        s = 0
        for i in range(n - d):
            s += int(v[i]) * int(v[i + d])
        result[d] = s
    return result


def build_T_vecs(types, signs, n):
    """Build 4 sequences from (type[i], sign[i]): T_k[i] = sign[i] if type[i]==k else 0."""
    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    return T


def compute_S_turyn(T, n):
    """S[d] = Σ_k NAF_{T_k}(d). S is length n."""
    S = np.zeros(n, dtype=np.int64)
    for t in T:
        # Fast NAF via correlation (numpy)
        S += naf_fast(t, n)
    return S


def naf_fast(v, n):
    """Fast NAF using numpy correlate."""
    v64 = v.astype(np.int64)
    # correlate(v, v) gives aperiodic correlation: length 2n-1
    # result[i] = Σ v[j]*v[j + (i - n + 1)], we want non-negative lags
    corr = np.correlate(v64, v64, mode='full')
    # result length 2n-1, index n-1 = lag 0
    return corr[n - 1:]  # lags 0..n-1


def energy_turyn(S):
    return int(np.sum(S[1:] ** 2))


def convert_to_williamson(T):
    """From T-sequences build 4 Williamson ±1 sequences A,B,C,D."""
    A = T[0] + T[1] + T[2] + T[3]
    B = T[0] + T[1] - T[2] - T[3]
    C = T[0] - T[1] + T[2] - T[3]
    D = T[0] - T[1] - T[2] + T[3]
    return A.astype(np.int8), B.astype(np.int8), C.astype(np.int8), D.astype(np.int8)


def turyn_sa(seed=7001, max_time=10800, T0=200.0, alpha=0.9999996,
              restart_stale=2000000, save_prefix='h668_turyn'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    # Random init: assign each position to a random type with random sign
    types = rng.integers(4, size=n)
    signs = rng.choice([-1, 1], size=n).astype(np.int8)

    T = build_T_vecs(types, signs, n)
    S = compute_S_turyn(T, n)
    E = energy_turyn(S)
    best = E
    best_types = types.copy()
    best_signs = signs.copy()

    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0

    print(f"TURYN seed={seed} init E={E}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        # Move: 50% type change, 50% sign flip
        if py_rng.random() < 0.5:
            # Type change at position i
            i = int(rng.integers(n))
            old_type = int(types[i])
            new_type = int(rng.integers(4))
            while new_type == old_type:
                new_type = int(rng.integers(4))
            # Temporarily apply
            T[old_type][i] = 0
            T[new_type][i] = signs[i]
            S_new = compute_S_turyn(T, n)
            E_new = energy_turyn(S_new)
            dE = E_new - E
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                types[i] = new_type
                S = S_new
                E = E_new
            else:
                # Revert
                T[old_type][i] = signs[i]
                T[new_type][i] = 0
        else:
            # Sign flip at position i
            i = int(rng.integers(n))
            t_idx = int(types[i])
            signs[i] = -signs[i]
            T[t_idx][i] = signs[i]
            S_new = compute_S_turyn(T, n)
            E_new = energy_turyn(S_new)
            dE = E_new - E
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                S = S_new
                E = E_new
            else:
                # Revert
                signs[i] = -signs[i]
                T[t_idx][i] = signs[i]

        if E < best:
            best = E
            best_types = types.copy()
            best_signs = signs.copy()
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'it': it,
                           'types': best_types.tolist(),
                           'signs': best_signs.tolist()}, f)
            if best == 0:
                print(f"FOUND E=0! it={it}", flush=True)
                T_best = build_T_vecs(best_types, best_signs, n)
                A, B, C, D = convert_to_williamson(T_best)
                export_hadamard([A, B, C, D], save_prefix)
                return best_types, best_signs, 0
        else:
            stale += 1
        T_temp = max(2.0, T_temp * alpha)

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            # Random perturbation
            for _ in range(15):
                i = int(rng.integers(n))
                if py_rng.random() < 0.5:
                    types[i] = int(rng.integers(4))
                else:
                    signs[i] = -signs[i]
            T = build_T_vecs(types, signs, n)
            S = compute_S_turyn(T, n)
            E = energy_turyn(S)
            T_temp = T0 * (0.6 ** (restarts % 5))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} T={T_temp:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T_temp:.2f} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7001)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=200.0)
    ap.add_argument('--alpha', type=float, default=0.9999996)
    ap.add_argument('--prefix', type=str, default='h668_turyn')
    args = ap.parse_args()
    turyn_sa(seed=args.seed, max_time=args.max_time, T0=args.T0, alpha=args.alpha,
              save_prefix=args.prefix)
