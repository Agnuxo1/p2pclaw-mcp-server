#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath - H(668): Turyn Manifold SA with Block Permutation.

Block permute move: pick W positions, apply a random permutation to the
(type, sign) pairs at those positions. Col_sums preserved exactly since
we're just moving contributions between positions.

This gives much more manifold connectivity than fixed-size cycles:
- 3-cycle: W=3, specific cyclic permutation
- Block permute: W variable, ANY permutation of W positions

Mix of moves:
- 2-swap (prob = p_swap)
- 3-cycle (prob = p_3cyc)
- Block permute W=5..12 (prob = 1 - p_swap - p_3cyc)

All preserve col_sums vector exactly.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import compute_S_from_Ts, naf_point_delta_vec
from hadamard_668_turyn_penalty import compute_col_sums
from hadamard_668_turyn_manifold import (compose_dNAF_full_swap,
                                          compose_dNAF_3cycle)


def compose_dNAF_block_permute(T, positions, perm, n):
    """Apply permutation perm to positions.
    The (type, sign) at positions[i] is moved to positions[perm[i]].

    Returns dNAF (int64 of length n) total NAF change.
    """
    W = len(positions)
    # Read original (type, sign)
    orig = []
    for p in positions:
        found = False
        for k in range(4):
            if T[k][p] != 0:
                orig.append((k, int(T[k][p])))
                found = True
                break
        if not found:
            raise ValueError(f"Position {p} has no nonzero T entry")

    # Build work copies of all affected T vectors
    vecs = set(k for k, _ in orig)
    work = {k: T[k].copy() for k in vecs}

    dNAF = np.zeros(n, dtype=np.int64)

    # Step 1: clear all positions (remove contributions from their types)
    for idx in range(W):
        p = positions[idx]
        k, s = orig[idx]
        dNAF += naf_point_delta_vec(work[k], p, n, -s)
        work[k][p] = 0

    # Step 2: insert at new positions according to perm
    # positions[perm[i]] receives the value from positions[i]
    for idx in range(W):
        src_pos_idx = idx  # original index
        new_pos = positions[perm[idx]]  # destination
        k_new, s_new = orig[src_pos_idx]
        if k_new in work:
            dNAF += naf_point_delta_vec(work[k_new], new_pos, n, s_new)
            work[k_new][new_pos] = s_new

    return dNAF, orig


def apply_block_permute(T, types, signs, positions, perm, orig):
    """Apply the block permute to actual T, types, signs arrays."""
    W = len(positions)
    # Clear
    for idx in range(W):
        p = positions[idx]
        k, s = orig[idx]
        T[k][p] = 0
    # Set new
    for idx in range(W):
        src_idx = idx
        new_pos = positions[perm[idx]]
        k_new, s_new = orig[src_idx]
        T[k_new][new_pos] = s_new
        types[new_pos] = k_new
        signs[new_pos] = s_new


def manifold_block_sa(seed=93001, chkpt=None, max_time=10800, T0=10.0,
                       alpha=0.9999998, p_swap=0.4, p_3cyc=0.35,
                       W_min=4, W_max=10, restart_stale=4000000,
                       save_prefix='h668_tmb'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    assert chkpt, "require manifold checkpoint"
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
    assert sum_sq == 4 * n, f"chkpt ss={sum_sq} != {4*n}"

    best = E
    best_types = types.copy()
    best_signs = signs.copy()
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0
    counts = {'swap': 0, '3cyc': 0, 'block': 0}
    accepts = {'swap': 0, '3cyc': 0, 'block': 0}

    print(f"TMBLK seed={seed} init E={E} ss={sum_sq} W=[{W_min},{W_max}]", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        r = py_rng.random()

        if r < p_swap:
            # 2-SWAP
            counts['swap'] += 1
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            if i == j:
                continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            if a == b and s_i == s_j:
                continue
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
                S += dNAF
                E += dE
                accepts['swap'] += 1

        elif r < p_swap + p_3cyc:
            # 3-CYCLE
            counts['3cyc'] += 1
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            k = int(rng.integers(n))
            if len({i, j, k}) != 3:
                continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            c = int(types[k]); s_k = int(signs[k])
            if a == b == c and s_i == s_j == s_k:
                continue
            dNAF = compose_dNAF_3cycle(T, i, j, k, n)
            dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                T[a][i] = 0; T[b][j] = 0; T[c][k] = 0
                T[c][i] = s_k
                T[a][j] = s_i
                T[b][k] = s_j
                types[i] = c; types[j] = a; types[k] = b
                signs[i] = s_k; signs[j] = s_i; signs[k] = s_j
                S += dNAF
                E += dE
                accepts['3cyc'] += 1

        else:
            # BLOCK PERMUTE
            counts['block'] += 1
            W = int(rng.integers(W_min, W_max + 1))
            positions = py_rng.sample(range(n), W)
            perm = list(range(W))
            py_rng.shuffle(perm)
            # Check it's not identity
            if perm == list(range(W)):
                continue
            dNAF, orig = compose_dNAF_block_permute(T, positions, perm, n)
            dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                apply_block_permute(T, types, signs, positions, perm, orig)
                S += dNAF
                E += dE
                accepts['block'] += 1

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
            if ss_check != 4 * n:
                print(f"  CRITICAL manifold violated ss={ss_check}", flush=True)
                return best_types, best_signs, best
            if E_check != E:
                S = S_check
                E = E_check

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            # Perturb with a big block permute
            W_big = 15 + restarts % 10
            positions = py_rng.sample(range(n), W_big)
            perm = list(range(W_big))
            py_rng.shuffle(perm)
            dNAF_perturb, orig_perturb = compose_dNAF_block_permute(T, positions, perm, n)
            apply_block_permute(T, types, signs, positions, perm, orig_perturb)
            S = compute_S_from_Ts(T, n)
            E = int(np.sum(S[1:] ** 2))
            T_temp = T0 * (0.7 ** (restarts % 4))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} W={W_big} T={T_temp:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            acc_pct = {k: (accepts[k] * 100 // max(1, counts[k])) for k in counts}
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T_temp:.2f} "
                  f"acc={acc_pct} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=93001)
    ap.add_argument('--chkpt', type=str, required=True)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=10.0)
    ap.add_argument('--alpha', type=float, default=0.9999998)
    ap.add_argument('--p_swap', type=float, default=0.4)
    ap.add_argument('--p_3cyc', type=float, default=0.35)
    ap.add_argument('--W_min', type=int, default=4)
    ap.add_argument('--W_max', type=int, default=10)
    ap.add_argument('--prefix', type=str, default='h668_tmb')
    args = ap.parse_args()
    manifold_block_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time,
                       T0=args.T0, alpha=args.alpha, p_swap=args.p_swap,
                       p_3cyc=args.p_3cyc, W_min=args.W_min, W_max=args.W_max,
                       save_prefix=args.prefix)
