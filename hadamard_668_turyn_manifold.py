#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn Manifold-preserving SA.

Restricts moves to those that preserve Σs²=668, so warm-starting from
a valid manifold point keeps the state on the manifold throughout.

Manifold-preserving moves:
1. SIGN-PAIR-SWAP: at positions i, j with types[i]==types[j] and
   signs[i] == -signs[j], flip both signs. Net col_sums change = 0.

2. TYPE-PAIR-SWAP: at positions i, j with types[i]=a, types[j]=b,
   signs[i]*sign_i_mask = -signs[j]*sign_j_mask where the col_sum
   contributions cancel. Simplest: swap types a<->b at two positions
   with signs that satisfy:
     signs[i]*pat[b] + signs[j]*pat[a] = signs[i]*pat[a] + signs[j]*pat[b]
   → (signs[i]-signs[j])*(pat[b]-pat[a]) = 0
   → signs[i] = signs[j]  (same sign)

   So: at positions i,j with types[i]=a, types[j]=b, and signs[i]=signs[j],
   swap their types. col_sum change:
     Δ = (signs[j]*pat[a] + signs[i]*pat[b]) - (signs[i]*pat[a] + signs[j]*pat[b])
       = (signs[j]-signs[i])*pat[a] + (signs[i]-signs[j])*pat[b]
       = 0 (since signs[i]=signs[j])  ✓

3. SIGN-FLIP-PAIR-CROSS: at positions i,j with types[i]≠types[j].
   col change = -2*s_i*pat[k_i] - 2*s_j*pat[k_j]
   For preservation: s_i*pat[k_i] = -s_j*pat[k_j]
   Since patterns have pat[k][0]=1 for all k, need s_i = -s_j AND
   pat[k_i] = pat[k_j]. But patterns are pairwise distinct for k_i ≠ k_j.
   So the only cross-type cancellation requires 3+ positions.

For now use moves 1 and 2 + occasional penalty relaxation.

Energy: E_naf = Σ S(d)² (d≥1).
Goal: E_naf = 0 on the manifold → H(668).
"""
import sys, os, json, time, math, random, argparse
import numpy as np
from collections import defaultdict

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import (compute_S_from_Ts,
                                       sign_flip_delta_turyn,
                                       type_change_delta_turyn,
                                       naf_point_delta_vec)
from hadamard_668_turyn_penalty import PATTERNS, compute_col_sums


def compose_dNAF_pair_same_type(T, k, i, j, n):
    """Compose the dNAF for flipping signs at both positions i,j of T_k.
    Requires T_k[i] and T_k[j] both nonzero (i.e., types[i]=types[j]=k)."""
    # First flip at i:
    old_i = int(T[k][i])
    old_j = int(T[k][j])
    sign_change_i = -2 * old_i
    dNAF1 = naf_point_delta_vec(T[k], i, n, sign_change_i)
    # Apply temporarily in copy:
    T_mid = T[k].copy()
    T_mid[i] = -T_mid[i]
    # Then flip at j:
    sign_change_j = -2 * old_j
    dNAF2 = naf_point_delta_vec(T_mid, j, n, sign_change_j)
    return dNAF1 + dNAF2


def compose_dNAF_full_swap(T, i, j, n):
    """Compose dNAF for a FULL position swap between i and j.
    The (type, sign) at i and j are exchanged atomically.
    This includes:
      - Same type, same sign: no-op (ignored by caller)
      - Same type, opposite sign: equivalent to sign-pair-swap
      - Diff type, same sign: equivalent to type-pair-swap
      - Diff type, opposite sign: NEW manifold-preserving move
    Col_sums always preserved because contributions are permuted.
    """
    a = None; b = None
    s_i = 0; s_j = 0
    for k in range(4):
        if T[k][i] != 0: a = k; s_i = int(T[k][i]); break
    for k in range(4):
        if T[k][j] != 0: b = k; s_j = int(T[k][j]); break
    assert a is not None and b is not None
    if a == b and s_i == s_j:
        return np.zeros(n, dtype=np.int64)

    # Desired final state:
    # position i: type b, sign s_j → T[b][i] = s_j
    # position j: type a, sign s_i → T[a][j] = s_i
    # Current: T[a][i] = s_i, T[b][j] = s_j (and others 0 if a≠b)

    if a == b:
        # Only signs change: same-type sign-pair-swap
        # (both flip if s_i ≠ s_j, else noop)
        dNAF_1 = naf_point_delta_vec(T[a], i, n, -2 * s_i)
        T_mid = T[a].copy()
        T_mid[i] = -T_mid[i]
        dNAF_2 = naf_point_delta_vec(T_mid, j, n, -2 * s_j)
        return dNAF_1 + dNAF_2

    # a ≠ b. Need to clear T[a][i] and set T[a][j]=s_i, clear T[b][j] and set T[b][i]=s_j.
    # Do 4 point changes, accumulating deltas with intermediate states:

    # Step 1: remove s_i from T[a] at i (T_a: s_i→0)
    dNAF_a1 = naf_point_delta_vec(T[a], i, n, -s_i)
    T_a_mid = T[a].copy()
    T_a_mid[i] = 0

    # Step 2: add s_i to T[a] at j (T_a_mid: 0→s_i)
    dNAF_a2 = naf_point_delta_vec(T_a_mid, j, n, s_i)

    # Step 3: remove s_j from T[b] at j (T_b: s_j→0)
    dNAF_b1 = naf_point_delta_vec(T[b], j, n, -s_j)
    T_b_mid = T[b].copy()
    T_b_mid[j] = 0

    # Step 4: add s_j to T[b] at i (T_b_mid: 0→s_j)
    dNAF_b2 = naf_point_delta_vec(T_b_mid, i, n, s_j)

    return dNAF_a1 + dNAF_a2 + dNAF_b1 + dNAF_b2


# Backwards-compatible alias
compose_dNAF_type_swap = compose_dNAF_full_swap


def compose_dNAF_3cycle(T, i, j, k, n):
    """Compose dNAF for a 3-cycle: position i → j → k → i.
    (type, sign) at i goes to j, j's goes to k, k's goes to i.
    Since this is a permutation of contributions, col_sums preserved.
    """
    # Current assignments (read from T)
    a = None; b = None; c = None
    s_i = s_j = s_k = 0
    for t in range(4):
        if T[t][i] != 0: a = t; s_i = int(T[t][i]); break
    for t in range(4):
        if T[t][j] != 0: b = t; s_j = int(T[t][j]); break
    for t in range(4):
        if T[t][k] != 0: c = t; s_k = int(T[t][k]); break

    # Desired final state:
    # i has (c, s_k), j has (a, s_i), k has (b, s_j)

    # We apply sequential point changes on COPIES of T to keep T[t] intact
    # and accumulate the deltas.

    # Plan: 6 point changes total (clear 3, add 3)
    # Each point change affects one specific T[t] vector independently, so
    # we can compute each delta on a temp-state copy of the affected vec.

    # Build working copies of affected T vectors
    work = {t: T[t].copy() for t in {a, b, c}}

    dNAF_total = np.zeros(n, dtype=np.int64)

    # Step 1: remove s_i from T[a] at i
    dNAF_total += naf_point_delta_vec(work[a], i, n, -s_i)
    work[a][i] = 0

    # Step 2: remove s_j from T[b] at j
    dNAF_total += naf_point_delta_vec(work[b], j, n, -s_j)
    work[b][j] = 0

    # Step 3: remove s_k from T[c] at k
    dNAF_total += naf_point_delta_vec(work[c], k, n, -s_k)
    work[c][k] = 0

    # Now insert at new positions:
    # i ← c, s_k → T[c][i] = s_k
    if c in work:
        dNAF_total += naf_point_delta_vec(work[c], i, n, s_k)
        work[c][i] = s_k
    # j ← a, s_i → T[a][j] = s_i
    if a in work:
        dNAF_total += naf_point_delta_vec(work[a], j, n, s_i)
        work[a][j] = s_i
    # k ← b, s_j → T[b][k] = s_j
    if b in work:
        dNAF_total += naf_point_delta_vec(work[b], k, n, s_j)
        work[b][k] = s_j

    return dNAF_total


def manifold_sa(seed=80001, chkpt=None, max_time=10800, T0=5.0,
                alpha=0.9999998, mix=0.5, restart_stale=4000000,
                save_prefix='h668_tman', allow_drift=False):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    if not chkpt:
        raise ValueError("manifold_sa requires --chkpt on the Σs²=668 manifold")

    with open(chkpt) as f:
        state = json.load(f)
    types = np.array(state['types'], dtype=np.int64)
    signs = np.array(state['signs'], dtype=np.int8)

    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E = int(np.sum(S[1:] ** 2))
    col_sums = compute_col_sums(types, signs, n)
    sum_sq = int((col_sums ** 2).sum())

    if sum_sq != 4 * n and not allow_drift:
        raise ValueError(f"checkpoint sum_sq={sum_sq} ≠ {4*n}, not on manifold")

    best = E
    best_types = types.copy()
    best_signs = signs.copy()
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0

    # Build position indices by type for fast pair sampling
    def build_type_idx():
        idx = [[] for _ in range(4)]
        for i in range(n):
            idx[int(types[i])].append(i)
        return idx
    type_idx = build_type_idx()

    def build_type_sign_idx():
        """positions grouped by (type, sign)."""
        d = defaultdict(list)
        for i in range(n):
            d[(int(types[i]), int(signs[i]))].append(i)
        return d
    type_sign_idx = build_type_sign_idx()

    print(f"TMAN seed={seed} init E={E} ss={sum_sq}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        r = py_rng.random()

        if py_rng.random() < mix:
            # 2-SWAP
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            if i == j:
                continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            if a == b and s_i == s_j:
                continue  # noop
            dNAF = compose_dNAF_full_swap(T, i, j, n)
            dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                if a != b:
                    T[a][i] = 0; T[b][i] = s_j
                    T[b][j] = 0; T[a][j] = s_i
                else:
                    T[a][i] = s_j
                    T[a][j] = s_i
                types[i], types[j] = b, a
                signs[i], signs[j] = s_j, s_i
                type_sign_idx[(a, s_i)].remove(i)
                type_sign_idx[(b, s_j)].remove(j)
                type_sign_idx[(b, s_j)].append(i)
                type_sign_idx[(a, s_i)].append(j)
                S += dNAF
                E += dE
        else:
            # 3-CYCLE
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            k = int(rng.integers(n))
            if len({i, j, k}) != 3:
                continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            c = int(types[k]); s_k = int(signs[k])
            # Skip if all same → noop
            if a == b == c and s_i == s_j == s_k:
                continue
            dNAF = compose_dNAF_3cycle(T, i, j, k, n)
            dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                # Apply: i gets (c, s_k), j gets (a, s_i), k gets (b, s_j)
                # Clear old first
                T[a][i] = 0; T[b][j] = 0; T[c][k] = 0
                # Set new
                T[c][i] = s_k
                T[a][j] = s_i
                T[b][k] = s_j
                types[i] = c; types[j] = a; types[k] = b
                signs[i] = s_k; signs[j] = s_i; signs[k] = s_j
                # Update idx
                type_sign_idx[(a, s_i)].remove(i)
                type_sign_idx[(b, s_j)].remove(j)
                type_sign_idx[(c, s_k)].remove(k)
                type_sign_idx[(c, s_k)].append(i)
                type_sign_idx[(a, s_i)].append(j)
                type_sign_idx[(b, s_j)].append(k)
                S += dNAF
                E += dE

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

        # Drift check
        if it % 150000 == 149999:
            S_check = compute_S_from_Ts(T, n)
            E_check = int(np.sum(S_check[1:] ** 2))
            cs_check = compute_col_sums(types, signs, n)
            ss_check = int((cs_check ** 2).sum())
            if E_check != E or ss_check != 4 * n:
                print(f"  drift: E {E}->{E_check}, ss->{ss_check}, reset", flush=True)
                S = S_check
                E = E_check
                if ss_check != 4 * n:
                    print(f"  CRITICAL: manifold violated!", flush=True)
                    return best_types, best_signs, best

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            # Perturb with manifold-preserving sign-pair swaps
            for _ in range(6 + restarts % 5):
                k = int(rng.integers(4))
                pos_plus = [i for i in range(n) if types[i]==k and signs[i]==1]
                pos_minus = [i for i in range(n) if types[i]==k and signs[i]==-1]
                if pos_plus and pos_minus:
                    i = pos_plus[int(rng.integers(len(pos_plus)))]
                    j = pos_minus[int(rng.integers(len(pos_minus)))]
                    T[k][i] = -T[k][i]; T[k][j] = -T[k][j]
                    signs[i] = -signs[i]; signs[j] = -signs[j]
            type_sign_idx = build_type_sign_idx()
            S = compute_S_from_Ts(T, n)
            E = int(np.sum(S[1:] ** 2))
            T_temp = T0 * (0.7 ** (restarts % 3))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} T={T_temp:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            cs = compute_col_sums(types, signs, n)
            ss_now = int((cs**2).sum())
            print(f"  t={dt:.0f}s it={it} E={E} best={best} ss={ss_now} T={T_temp:.2f} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=80001)
    ap.add_argument('--chkpt', type=str, required=True)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=5.0)
    ap.add_argument('--alpha', type=float, default=0.9999998)
    ap.add_argument('--mix', type=float, default=0.5,
                    help='prob of sign-pair vs type-swap')
    ap.add_argument('--prefix', type=str, default='h668_tman')
    args = ap.parse_args()
    manifold_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time,
                 T0=args.T0, alpha=args.alpha, mix=args.mix,
                 save_prefix=args.prefix)
