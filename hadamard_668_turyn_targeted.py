#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath - H(668): Targeted Turyn Penalty SA.

Forces col_sums to reach a SPECIFIC target vector (not just sum_sq=668).
This lets us explore specific |col_sums| classes like (3,3,17,19), (3,7,13,21),
(1,9,15,19) that are missing from our current manifold checkpoint collection.

E_aug = E_naf + lambda * sum_k (col_sums[k] - target[k])^2

Once col_sums == target, the SA continues minimizing E_naf while the penalty
keeps it locked on the target col_sums vector exactly. When a low-E state
is reached with col_sums == target, it's saved as a manifold checkpoint for
that specific class.

Usage:
  python hadamard_668_turyn_targeted.py --target 3,3,17,19 --seed 90001
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import (compute_S_from_Ts,
                                       sign_flip_delta_turyn,
                                       type_change_delta_turyn)
from hadamard_668_turyn_penalty import PATTERNS, compute_col_sums


def signed_perms(quad):
    """All signed permutations of |quad| — each element can be + or -."""
    from itertools import product, permutations
    seen = set()
    out = []
    for p in permutations(quad):
        for signs in product([1, -1], repeat=len(quad)):
            v = tuple(s * x for s, x in zip(signs, p))
            if v not in seen:
                seen.add(v)
                out.append(v)
    return out


def targeted_sa(target, seed=90001, max_time=10800, T0=500.0, alpha=0.9999996,
                 lam0=1.0, lam_max=500.0, lam_ramp=1.3,
                 restart_stale=2500000, save_prefix='h668_tgt'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    target_v = np.array(target, dtype=np.int64)
    target_ss = int((target_v ** 2).sum())
    assert target_ss == 4 * n, f"Target |col_sums|^2={target_ss} != {4*n}"

    # Initial random state
    types = rng.integers(4, size=n)
    signs = rng.choice([-1, 1], size=n).astype(np.int8)

    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E_naf = int(np.sum(S[1:] ** 2))
    col_sums = compute_col_sums(types, signs, n)

    def cs_dist_sq(cs):
        return int(((cs - target_v) ** 2).sum())

    d_ss = cs_dist_sq(col_sums)

    lam = lam0
    def aug(e, d):
        return e + lam * d

    E_aug = aug(E_naf, d_ss)
    best_aug = E_aug
    best_naf = E_naf
    best_dss = d_ss
    best_types = types.copy()
    best_signs = signs.copy()
    saved = 0
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0
    last_ramp = t0

    print(f"TGT target={target} seed={seed} init E_naf={E_naf} "
          f"cs={col_sums.tolist()} d_ss={d_ss} lam={lam}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        if py_rng.random() < 0.5:
            # SIGN FLIP
            i = int(rng.integers(n))
            k = int(types[i])
            old_s = int(signs[i])
            dNAF, dE_naf = sign_flip_delta_turyn(S, T[k], i, n)
            new_col = col_sums - 2 * old_s * PATTERNS[k]
            new_dss = int(((new_col - target_v) ** 2).sum())
            new_aug = (E_naf + dE_naf) + lam * new_dss
            dA = new_aug - E_aug
            if dA <= 0 or py_rng.random() < math.exp(-dA / T_temp):
                T[k][i] = -T[k][i]
                signs[i] = -signs[i]
                S += dNAF
                E_naf += dE_naf
                col_sums = new_col
                d_ss = new_dss
                E_aug = new_aug
        else:
            # TYPE CHANGE
            i = int(rng.integers(n))
            a = int(types[i])
            b = int(rng.integers(4))
            while b == a:
                b = int(rng.integers(4))
            s_val = int(signs[i])
            dNAF, dE_naf = type_change_delta_turyn(S, T[a], T[b], i, n, s_val)
            d_col = s_val * (PATTERNS[b] - PATTERNS[a])
            new_col = col_sums + d_col
            new_dss = int(((new_col - target_v) ** 2).sum())
            new_aug = (E_naf + dE_naf) + lam * new_dss
            dA = new_aug - E_aug
            if dA <= 0 or py_rng.random() < math.exp(-dA / T_temp):
                T[a][i] = 0
                T[b][i] = s_val
                types[i] = b
                S += dNAF
                E_naf += dE_naf
                col_sums = new_col
                d_ss = new_dss
                E_aug = new_aug

        if E_aug < best_aug:
            best_aug = E_aug
            best_naf = E_naf
            best_dss = d_ss
            best_types = types.copy()
            best_signs = signs.copy()
            stale = 0
            # Save on target AND low NAF
            if d_ss == 0 and E_naf < 2500:
                saved += 1
                fname = f"{save_prefix}_seed{seed}.json"
                with open(fname, 'w') as f:
                    json.dump({'seed': seed, 'E': int(E_naf),
                               'target': list(target),
                               'cs': col_sums.tolist(),
                               'types': types.tolist(),
                               'signs': signs.tolist()}, f)
                print(f"  SAVED {fname} E_naf={E_naf}", flush=True)
            if E_naf == 0 and d_ss == 0:
                print(f"FOUND E=0! it={it}", flush=True)
                A = T[0] + T[1] + T[2] + T[3]
                B = T[0] + T[1] - T[2] - T[3]
                C = T[0] - T[1] + T[2] - T[3]
                D = T[0] - T[1] - T[2] + T[3]
                export_hadamard([A.astype(np.int8), B.astype(np.int8),
                                  C.astype(np.int8), D.astype(np.int8)], save_prefix)
                return types, signs, 0
        else:
            stale += 1
        T_temp = max(2.0, T_temp * alpha)

        now = time.time()
        if now - last_ramp > 60.0:
            if d_ss != 0:
                lam = min(lam_max, lam * lam_ramp)
                E_aug = aug(E_naf, d_ss)
                best_aug = E_aug
            last_ramp = now

        if it % 200000 == 199999:
            S_check = compute_S_from_Ts(T, n)
            E_check = int(np.sum(S_check[1:] ** 2))
            cs_check = compute_col_sums(types, signs, n)
            d_check = int(((cs_check - target_v) ** 2).sum())
            if E_check != E_naf or d_check != d_ss:
                S = S_check
                E_naf = E_check
                col_sums = cs_check
                d_ss = d_check
                E_aug = aug(E_naf, d_ss)

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            for _ in range(10 + restarts % 7):
                i = int(rng.integers(n))
                if py_rng.random() < 0.5:
                    signs[i] = -signs[i]
                    T[int(types[i])][i] = signs[i]
                else:
                    a = int(types[i])
                    b = int(rng.integers(4))
                    while b == a:
                        b = int(rng.integers(4))
                    T[a][i] = 0
                    T[b][i] = signs[i]
                    types[i] = b
            S = compute_S_from_Ts(T, n)
            E_naf = int(np.sum(S[1:] ** 2))
            col_sums = compute_col_sums(types, signs, n)
            d_ss = int(((col_sums - target_v) ** 2).sum())
            E_aug = aug(E_naf, d_ss)
            best_aug = E_aug
            T_temp = T0 * (0.6 ** (restarts % 4))
            stale = 0
            lam = max(lam0, lam * 0.7)
            print(f"  [RESTART #{restarts}] E_naf={E_naf} d_ss={d_ss} T={T_temp:.0f} lam={lam:.1f}", flush=True)

        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E_naf={E_naf} dss={d_ss} "
                  f"aug={E_aug:.0f} lam={lam:.1f} T={T_temp:.0f} saved={saved}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best_naf={best_naf} best_dss={best_dss} saved={saved}", flush=True)
    return best_types, best_signs, best_naf


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', type=str, required=True,
                    help='comma-separated col_sums vector, e.g. 3,3,17,19')
    ap.add_argument('--seed', type=int, default=90001)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=500.0)
    ap.add_argument('--alpha', type=float, default=0.9999996)
    ap.add_argument('--lam0', type=float, default=1.0)
    ap.add_argument('--lam_max', type=float, default=500.0)
    ap.add_argument('--prefix', type=str, default='h668_tgt')
    args = ap.parse_args()
    target = tuple(int(x) for x in args.target.split(','))
    targeted_sa(target, seed=args.seed, max_time=args.max_time, T0=args.T0,
                 alpha=args.alpha, lam0=args.lam0, lam_max=args.lam_max,
                 save_prefix=args.prefix)
