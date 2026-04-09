#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath - H(668): Big-Kick Manifold Escape.

When the manifold SA gets stuck in a local minimum (currently E=260),
we need a move much more disruptive than 2-swap/3-cycle/small-W block
permute. This file implements a basin-hopping style attack:

  Phase A (HOT): do a BIG block permute W in [W_big_min, W_big_max]
                 to scramble a large portion of the sequence.
  Phase B (COOL): run a polishing SA with 2-swap + 3-cycle + small-W
                  block permute for N_polish iterations at low T,
                  using the FAST O(n) deltas.

The kick is ALWAYS accepted (no Metropolis), but the polished state
is compared to the incumbent best. Only replace the incumbent if the
polished E < best.

This is essentially basin-hopping, a classic technique for breaking
strict local minima in high-dimensional discrete optimization.
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
from hadamard_668_turyn_manifold_block import (compose_dNAF_block_permute,
                                                 apply_block_permute)


def polish_sa(T, types, signs, S, E, n, T0, alpha, iters, py_rng, rng,
              W_small=6):
    """Quick local SA polish pass."""
    T_temp = T0
    best_E = E
    best_types = types.copy()
    best_signs = signs.copy()
    best_T = [t.copy() for t in T]
    best_S = S.copy()

    for it in range(iters):
        r = py_rng.random()
        if r < 0.4:
            # 2-swap
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            if i == j: continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            if a == b and s_i == s_j: continue
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
        elif r < 0.75:
            # 3-cycle
            i = int(rng.integers(n))
            j = int(rng.integers(n))
            k = int(rng.integers(n))
            if len({i, j, k}) != 3: continue
            a = int(types[i]); s_i = int(signs[i])
            b = int(types[j]); s_j = int(signs[j])
            c = int(types[k]); s_k = int(signs[k])
            if a == b == c and s_i == s_j == s_k: continue
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
        else:
            # small-W block permute
            W = int(rng.integers(4, W_small + 1))
            positions = py_rng.sample(range(n), W)
            perm = list(range(W))
            py_rng.shuffle(perm)
            if perm == list(range(W)): continue
            dNAF, orig = compose_dNAF_block_permute(T, positions, perm, n)
            dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                apply_block_permute(T, types, signs, positions, perm, orig)
                S += dNAF
                E += dE

        if E < best_E:
            best_E = E
            best_types = types.copy()
            best_signs = signs.copy()
            best_T = [t.copy() for t in T]
            best_S = S.copy()

        T_temp = max(1.0, T_temp * alpha)

    # Rollback to best-in-polish
    for k in range(4):
        T[k][:] = best_T[k]
    types[:] = best_types
    signs[:] = best_signs
    S[:] = best_S
    return best_E


def bigkick_sa(seed, chkpt, max_time=10800, W_big_min=20, W_big_max=50,
                polish_iters=200000, polish_T0=3.0, polish_alpha=0.99998,
                save_prefix='h668_bk'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    with open(chkpt) as f:
        state = json.load(f)
    types = np.array(state['types'], dtype=np.int64)
    signs = np.array(state['signs'], dtype=np.int8)
    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E = int(np.sum(S[1:] ** 2))
    cs = compute_col_sums(types, signs, n)
    ss = int((cs ** 2).sum())
    assert ss == 4 * n, f"chkpt ss={ss} != {4*n}"

    global_best = E
    global_best_types = types.copy()
    global_best_signs = signs.copy()
    global_best_T = [t.copy() for t in T]
    global_best_S = S.copy()

    t0 = time.time()
    kicks = 0
    accepts = 0
    last_log = t0
    no_improve_kicks = 0

    print(f"BIGKICK seed={seed} init E={E} W=[{W_big_min},{W_big_max}]", flush=True)

    while time.time() - t0 < max_time:
        # Phase A: BIG KICK — always accept
        W = int(rng.integers(W_big_min, W_big_max + 1))
        positions = py_rng.sample(range(n), W)
        perm = list(range(W))
        py_rng.shuffle(perm)
        while perm == list(range(W)):
            py_rng.shuffle(perm)
        dNAF_kick, orig_kick = compose_dNAF_block_permute(T, positions, perm, n)
        apply_block_permute(T, types, signs, positions, perm, orig_kick)
        S += dNAF_kick
        E_kick = int(np.sum(S[1:] ** 2))
        # Sanity: recompute to avoid drift
        S_exact = compute_S_from_Ts(T, n)
        if not np.array_equal(S, S_exact):
            S = S_exact
            E_kick = int(np.sum(S[1:] ** 2))
        kicks += 1

        # Phase B: POLISH
        E = E_kick
        pre = E
        E_polished = polish_sa(T, types, signs, S, E, n,
                                 polish_T0, polish_alpha, polish_iters,
                                 py_rng, rng)

        if E_polished < global_best:
            global_best = E_polished
            global_best_types = types.copy()
            global_best_signs = signs.copy()
            global_best_T = [t.copy() for t in T]
            global_best_S = S.copy()
            accepts += 1
            no_improve_kicks = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(global_best),
                            'kicks': kicks,
                            'types': global_best_types.tolist(),
                            'signs': global_best_signs.tolist()}, f)
            print(f"  *** IMPROVE kick={kicks} pre={pre} post={E_polished} new_best={global_best}", flush=True)
            if global_best == 0:
                print(f"FOUND E=0!", flush=True)
                A = T[0] + T[1] + T[2] + T[3]
                B = T[0] + T[1] - T[2] - T[3]
                C = T[0] - T[1] + T[2] - T[3]
                D = T[0] - T[1] - T[2] + T[3]
                export_hadamard([A.astype(np.int8), B.astype(np.int8),
                                  C.astype(np.int8), D.astype(np.int8)], save_prefix)
                return types, signs, 0
        else:
            no_improve_kicks += 1
            # Rollback to the global best state if polish worsened
            for k in range(4):
                T[k][:] = global_best_T[k]
            types[:] = global_best_types
            signs[:] = global_best_signs
            S[:] = global_best_S
            E = global_best

        # After 10 failed kicks, grow the kick size
        if no_improve_kicks >= 10:
            W_big_min = min(W_big_min + 2, n // 4)
            W_big_max = min(W_big_max + 4, n // 2)
            no_improve_kicks = 0
            print(f"  [grow W] now [{W_big_min},{W_big_max}]", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s kicks={kicks} best={global_best} "
                    f"last_post={E_polished} W=[{W_big_min},{W_big_max}]", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={global_best} kicks={kicks}", flush=True)
    return global_best_types, global_best_signs, global_best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=97001)
    ap.add_argument('--chkpt', type=str, required=True)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--W_big_min', type=int, default=20)
    ap.add_argument('--W_big_max', type=int, default=50)
    ap.add_argument('--polish_iters', type=int, default=200000)
    ap.add_argument('--polish_T0', type=float, default=3.0)
    ap.add_argument('--polish_alpha', type=float, default=0.99998)
    ap.add_argument('--prefix', type=str, default='h668_bk')
    args = ap.parse_args()
    bigkick_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time,
                W_big_min=args.W_big_min, W_big_max=args.W_big_max,
                polish_iters=args.polish_iters,
                polish_T0=args.polish_T0, polish_alpha=args.polish_alpha,
                save_prefix=args.prefix)
