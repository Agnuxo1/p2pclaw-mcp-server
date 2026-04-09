#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn Penalty SA — force Σs²=668 manifold.

For induced Williamson A,B,C,D from T-sequences:
  s_k = Σ_i v_k[i] = Σ_i (contribution from each Turyn position)

  From type a with sign s at position i:
    pattern_0 = (+s, +s, +s, +s)
    pattern_1 = (+s, +s, −s, −s)
    pattern_2 = (+s, −s, +s, −s)
    pattern_3 = (+s, −s, −s, +s)

  col_sums[k] = Σ_i (sign[i] * pattern[type[i]][k])
  sum_sq = Σ_k col_sums[k]²

  Required for E=0: sum_sq = 4*n = 668.

Augmented energy: E_aug = E_naf + λ*(sum_sq − 668)²

Both sign flip and type change have O(1) updates for col_sums (not O(n)),
so the augmented energy evaluation is as fast as base Turyn.

λ ramped up when NAF energy converges but sum_sq ≠ 668.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import (compute_S_from_Ts,
                                       sign_flip_delta_turyn,
                                       type_change_delta_turyn)

# Williamson pattern per type (row k = type)
PATTERNS = np.array([
    [1, 1, 1, 1],       # type 0: A=B=C=D (±s)
    [1, 1, -1, -1],     # type 1
    [1, -1, 1, -1],     # type 2
    [1, -1, -1, 1]      # type 3
], dtype=np.int64)


def compute_col_sums(types, signs, n):
    """Compute col_sums = [Σ A[i], Σ B[i], Σ C[i], Σ D[i]]."""
    col_sums = np.zeros(4, dtype=np.int64)
    for i in range(n):
        col_sums += signs[i] * PATTERNS[int(types[i])]
    return col_sums


def turyn_penalty_sa(seed=60001, chkpt=None, max_time=10800, T0=200.0,
                     alpha=0.9999996, lam0=0.5, lam_max=200.0, lam_ramp=1.5,
                     restart_stale=3000000, save_prefix='h668_tpen'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    target_ss = 4 * n  # = 668

    if chkpt:
        with open(chkpt) as f:
            state = json.load(f)
        types = np.array(state['types'], dtype=np.int64)
        signs = np.array(state['signs'], dtype=np.int8)
    else:
        types = rng.integers(4, size=n)
        signs = rng.choice([-1, 1], size=n).astype(np.int8)

    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E_naf = int(np.sum(S[1:] ** 2))
    col_sums = compute_col_sums(types, signs, n)
    sum_sq = int((col_sums ** 2).sum())

    lam = lam0
    def aug(e, ss):
        return e + lam * (ss - target_ss) ** 2

    E_aug = aug(E_naf, sum_sq)
    best_aug = E_aug
    best_naf = E_naf
    best_ss = sum_sq
    best_types = types.copy()
    best_signs = signs.copy()
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0
    last_ramp = t0

    print(f"TPEN seed={seed} init E_naf={E_naf} sum_sq={sum_sq} target={target_ss} lam={lam}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        if py_rng.random() < 0.5:
            # SIGN FLIP
            i = int(rng.integers(n))
            k = int(types[i])
            old_s = int(signs[i])
            dNAF, dE_naf = sign_flip_delta_turyn(S, T[k], i, n)
            # col_sum update: new pattern contribution is -old
            new_col = col_sums - 2 * old_s * PATTERNS[k]
            new_ss = int((new_col ** 2).sum())
            new_aug = (E_naf + dE_naf) + lam * (new_ss - target_ss) ** 2
            dA = new_aug - E_aug
            if dA <= 0 or py_rng.random() < math.exp(-dA / T_temp):
                T[k][i] = -T[k][i]
                signs[i] = -signs[i]
                S += dNAF
                E_naf += dE_naf
                col_sums = new_col
                sum_sq = new_ss
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
            # col_sum update: subtract old pattern, add new
            d_col = s_val * (PATTERNS[b] - PATTERNS[a])
            new_col = col_sums + d_col
            new_ss = int((new_col ** 2).sum())
            new_aug = (E_naf + dE_naf) + lam * (new_ss - target_ss) ** 2
            dA = new_aug - E_aug
            if dA <= 0 or py_rng.random() < math.exp(-dA / T_temp):
                T[a][i] = 0
                T[b][i] = s_val
                types[i] = b
                S += dNAF
                E_naf += dE_naf
                col_sums = new_col
                sum_sq = new_ss
                E_aug = new_aug

        if E_aug < best_aug:
            best_aug = E_aug
            best_naf = E_naf
            best_ss = sum_sq
            best_types = types.copy()
            best_signs = signs.copy()
            stale = 0
            # Only save if on manifold OR strictly better NAF
            if sum_sq == target_ss and E_naf < 3000:
                with open(f"{save_prefix}_manifold_seed{seed}.json", 'w') as f:
                    json.dump({'seed': seed, 'E': int(E_naf), 'sum_sq': int(sum_sq),
                               'types': types.tolist(), 'signs': signs.tolist()}, f)
            if E_naf == 0 and sum_sq == target_ss:
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

        # Lambda ramp if stuck
        now = time.time()
        if now - last_ramp > 90.0:
            if sum_sq != target_ss:
                lam = min(lam_max, lam * lam_ramp)
                E_aug = aug(E_naf, sum_sq)
                best_aug = E_aug  # reset reference
                print(f"  [RAMP] lam={lam:.2f} E_naf={E_naf} sum_sq={sum_sq}", flush=True)
            last_ramp = now

        # Drift check
        if it % 200000 == 199999:
            S_check = compute_S_from_Ts(T, n)
            E_check = int(np.sum(S_check[1:] ** 2))
            cs_check = compute_col_sums(types, signs, n)
            ss_check = int((cs_check ** 2).sum())
            if E_check != E_naf or ss_check != sum_sq:
                print(f"  drift detected: E {E_naf}→{E_check}, ss {sum_sq}→{ss_check}, reset", flush=True)
                S = S_check
                E_naf = E_check
                col_sums = cs_check
                sum_sq = ss_check
                E_aug = aug(E_naf, sum_sq)

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            # Stronger perturbation
            for _ in range(12 + restarts % 8):
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
            sum_sq = int((col_sums ** 2).sum())
            E_aug = aug(E_naf, sum_sq)
            best_aug = E_aug
            T_temp = T0 * (0.6 ** (restarts % 4))
            stale = 0
            lam = max(lam0, lam * 0.7)
            print(f"  [RESTART #{restarts}] E_naf={E_naf} sum_sq={sum_sq} T={T_temp:.1f} lam={lam:.2f}", flush=True)

        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E_naf={E_naf} ss={sum_sq} aug={E_aug:.0f} best_naf={best_naf} best_ss={best_ss} T={T_temp:.2f} lam={lam:.2f} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best_naf={best_naf} best_ss={best_ss} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best_naf


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=60001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=200.0)
    ap.add_argument('--alpha', type=float, default=0.9999996)
    ap.add_argument('--lam0', type=float, default=0.5)
    ap.add_argument('--lam_max', type=float, default=200.0)
    ap.add_argument('--prefix', type=str, default='h668_tpen')
    args = ap.parse_args()
    turyn_penalty_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time,
                      T0=args.T0, alpha=args.alpha, lam0=args.lam0,
                      lam_max=args.lam_max, save_prefix=args.prefix)
