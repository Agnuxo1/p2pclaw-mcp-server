#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn 2-move SA for escaping plateau at E~273.

Mix of single moves (sign flip, type change) + 2-moves:
  - 2-sign-flip: flip at two positions (both sign)
  - sign+type: one sign flip + one type change
  - swap: exchange (type,sign) between two positions
  - 2-type: change type at two positions

The composite dE is computed from individual deltas + cross-term correction
because each local NAF change affects S(d), and two moves interact when
they touch the same T vector at nearby positions.

Because NAF is ALREADY on the target T-sequence, the composite ΔE for two
moves on DIFFERENT T_k is the sum (independent). For moves on the SAME T_k,
the cross term must be computed explicitly.

Fast delta uses same O(n) routines as turyn_fast.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import (compute_S_from_Ts,
                                       sign_flip_delta_turyn,
                                       type_change_delta_turyn,
                                       naf_point_delta_vec)


def compose_dE(S, dNAF_total):
    """dE when adding full dNAF_total to S (no cross-term needed
    because dNAF_total already sums both changes)."""
    return int(np.dot(2 * S[1:] + dNAF_total[1:], dNAF_total[1:]))


def two_move_sa(seed=30001, chkpt=None, max_time=10800, T0=4.0, alpha=0.9999997,
                 p_single=0.6, p_swap=0.2, restart_stale=3000000,
                 save_prefix='h668_2mv'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

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
    E = int(np.sum(S[1:] ** 2))

    best = E
    best_types = types.copy()
    best_signs = signs.copy()
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    s1 = s2 = sw = 0
    last_log = t0

    print(f"T2MV seed={seed} init E={E} chkpt={chkpt}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        r = py_rng.random()

        if r < p_single:
            # SINGLE MOVE (sign flip or type change)
            if py_rng.random() < 0.5:
                i = int(rng.integers(n))
                k = int(types[i])
                dNAF, dE = sign_flip_delta_turyn(S, T[k], i, n)
                if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                    T[k][i] = -T[k][i]
                    signs[i] = -signs[i]
                    S += dNAF
                    E += dE
                    s1 += 1
            else:
                i = int(rng.integers(n))
                a = int(types[i])
                b = int(rng.integers(4))
                while b == a:
                    b = int(rng.integers(4))
                sign_val = int(signs[i])
                dNAF, dE = type_change_delta_turyn(S, T[a], T[b], i, n, sign_val)
                if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                    T[a][i] = 0
                    T[b][i] = sign_val
                    types[i] = b
                    S += dNAF
                    E += dE
                    s1 += 1

        elif r < p_single + p_swap:
            # SWAP (type,sign) between two positions
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            if i == j or types[i] == types[j]:
                continue
            a = int(types[i]); sa = int(signs[i])
            b = int(types[j]); sb = int(signs[j])
            # T_a: remove sa at i, add sa at j
            # T_b: remove sb at j, add sb at i
            # Compute total dNAF = ΔT_a + ΔT_b, where each is sum of two point changes
            # ΔT_a(at i) has sign_change = -sa, ΔT_a(at j) has sign_change = +sa
            # But these are sequential — second delta must see the updated T_a!
            # Apply T_a change at i first (seen by next delta on T_a? No, they're
            # separate positions, and naf_point_delta_vec computes based on CURRENT v).
            # The FINAL NAF_{T_a}^new can be computed by applying both deltas:
            #   new NAF = old NAF + δ(i)·(Σ_{other} T_a[other]·(pair terms))
            # But the term at position j is CURRENTLY 0 in T_a, so adding sa at j is
            # a fresh insertion. That insertion would see T_a[i]=sa too (before removal).
            # SOLUTION: apply the T_a change atomically by building dNAF for
            # both positions in sequence, updating T_a temp.
            dNAF_a1 = naf_point_delta_vec(T[a], i, n, -sa)
            # Apply removal to a temp copy
            T_a_mid = T[a].copy()
            T_a_mid[i] = 0
            dNAF_a2 = naf_point_delta_vec(T_a_mid, j, n, sa)
            dNAF_a = dNAF_a1 + dNAF_a2
            # Similarly for T_b
            dNAF_b1 = naf_point_delta_vec(T[b], j, n, -sb)
            T_b_mid = T[b].copy()
            T_b_mid[j] = 0
            dNAF_b2 = naf_point_delta_vec(T_b_mid, i, n, sb)
            dNAF_b = dNAF_b1 + dNAF_b2
            dNAF = dNAF_a + dNAF_b
            dE = compose_dE(S, dNAF)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                T[a][i] = 0; T[a][j] = sa
                T[b][j] = 0; T[b][i] = sb
                types[i], types[j] = b, a
                signs[i], signs[j] = sb, sa
                S += dNAF
                E += dE
                sw += 1
        else:
            # 2-MOVE: two independent moves (maybe same vec)
            # Do two sign flips at different positions
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            if i == j:
                continue
            k1 = int(types[i]); k2 = int(types[j])
            if k1 != k2:
                # Different vecs: independent
                dNAF1, dE1 = sign_flip_delta_turyn(S, T[k1], i, n)
                dNAF2, dE2 = sign_flip_delta_turyn(S, T[k2], j, n)
                dNAF = dNAF1 + dNAF2
                cross = 2 * int(np.dot(dNAF1[1:], dNAF2[1:]))
                dE = dE1 + dE2 + cross
                if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                    T[k1][i] = -T[k1][i]; signs[i] = -signs[i]
                    T[k2][j] = -T[k2][j]; signs[j] = -signs[j]
                    S += dNAF
                    E += dE
                    s2 += 1
            else:
                # Same vec: need careful composition
                # Flip at i first, then at j on the modified vec
                dNAF1, dE1 = sign_flip_delta_turyn(S, T[k1], i, n)
                T_new = T[k1].copy()
                T_new[i] = -T_new[i]
                S_mid = S + dNAF1
                dNAF2, dE2 = sign_flip_delta_turyn(S_mid, T_new, j, n)
                dNAF = dNAF1 + dNAF2
                dE = dE1 + dE2
                if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                    T[k1][i] = -T[k1][i]
                    T[k1][j] = -T[k1][j]
                    signs[i] = -signs[i]
                    signs[j] = -signs[j]
                    S += dNAF
                    E += dE
                    s2 += 1

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
                A = T[0] + T[1] + T[2] + T[3]
                B = T[0] + T[1] - T[2] - T[3]
                C = T[0] - T[1] + T[2] - T[3]
                D = T[0] - T[1] - T[2] + T[3]
                export_hadamard([A.astype(np.int8), B.astype(np.int8),
                                  C.astype(np.int8), D.astype(np.int8)], save_prefix)
                return types, signs, 0
        else:
            stale += 1
        T_temp = max(1.0, T_temp * alpha)

        if it % 200000 == 199999:
            S_check = compute_S_from_Ts(T, n)
            E_check = int(np.sum(S_check[1:] ** 2))
            if E_check != E:
                print(f"  drift E={E} → {E_check}, reset", flush=True)
                S = S_check
                E = E_check

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            # Perturb: bigger kick
            for _ in range(8 + restarts % 6):
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
            E = int(np.sum(S[1:] ** 2))
            T_temp = T0 * (0.7 ** (restarts % 4))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} T={T_temp:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T_temp:.2f} s1={s1} s2={s2} sw={sw} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=30001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=4.0)
    ap.add_argument('--alpha', type=float, default=0.9999997)
    ap.add_argument('--p_single', type=float, default=0.6)
    ap.add_argument('--p_swap', type=float, default=0.2)
    ap.add_argument('--prefix', type=str, default='h668_2mv')
    args = ap.parse_args()
    two_move_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time,
                 T0=args.T0, alpha=args.alpha, p_single=args.p_single,
                 p_swap=args.p_swap, save_prefix=args.prefix)
