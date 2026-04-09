#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath - H(668): Turyn Manifold Parallel Tempering.

Operates strictly on the Sigma s^2 = 668 manifold using full-swap and 3-cycle
moves. Multiple replicas at a geometric temperature ladder swap periodically.

All moves preserve the column-sum constraint exactly, so every replica stays
on the manifold throughout its lifetime.

This is the most powerful attack: cold replicas exploit local minima while
hot replicas explore the wider manifold, and swaps transfer good states
downward while sending plateau states upward for reheating.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import compute_S_from_Ts
from hadamard_668_turyn_penalty import compute_col_sums
from hadamard_668_turyn_manifold import (compose_dNAF_full_swap,
                                          compose_dNAF_3cycle)


def make_ladder(M=8, T_lo=2.0, T_hi=200.0):
    return [T_lo * (T_hi / T_lo) ** (i / (M - 1)) for i in range(M)]


def load_replica(chkpt, n):
    with open(chkpt) as f:
        state = json.load(f)
    types = np.array(state['types'], dtype=np.int64)
    signs = np.array(state['signs'], dtype=np.int8)
    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E = int(np.sum(S[1:] ** 2))
    return {'types': types, 'signs': signs, 'T': T, 'S': S, 'E': E}


def mutate_manifold(r, T_temp, rng, py_rng, mix, n):
    """Try one manifold move on replica r."""
    types = r['types']; signs = r['signs']
    T = r['T']; S = r['S']

    if py_rng.random() < mix:
        # 2-SWAP
        i = int(rng.integers(n))
        j = int(rng.integers(n))
        if i == j:
            return
        a = int(types[i]); s_i = int(signs[i])
        b = int(types[j]); s_j = int(signs[j])
        if a == b and s_i == s_j:
            return
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
            r['S'] = S + dNAF
            r['E'] = r['E'] + dE
    else:
        # 3-CYCLE
        i = int(rng.integers(n))
        j = int(rng.integers(n))
        k = int(rng.integers(n))
        if len({i, j, k}) != 3:
            return
        a = int(types[i]); s_i = int(signs[i])
        b = int(types[j]); s_j = int(signs[j])
        c = int(types[k]); s_k = int(signs[k])
        if a == b == c and s_i == s_j == s_k:
            return
        dNAF = compose_dNAF_3cycle(T, i, j, k, n)
        dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
        if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
            T[a][i] = 0; T[b][j] = 0; T[c][k] = 0
            T[c][i] = s_k
            T[a][j] = s_i
            T[b][k] = s_j
            types[i] = c; types[j] = a; types[k] = b
            signs[i] = s_k; signs[j] = s_i; signs[k] = s_j
            r['S'] = S + dNAF
            r['E'] = r['E'] + dE


def manifold_PT(seed=85001, chkpts=None, M=8, T_lo=2.0, T_hi=200.0,
                 swap_every=500, mix=0.4, max_time=10800,
                 save_prefix='h668_tmPT'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    Ts = make_ladder(M, T_lo, T_hi)
    betas = [1.0 / t for t in Ts]

    assert chkpts, "manifold_PT requires checkpoints list"
    if len(chkpts) < M:
        chkpts = (chkpts * ((M // len(chkpts)) + 1))[:M]

    replicas = [load_replica(chkpts[i], n) for i in range(M)]
    for i, r in enumerate(replicas):
        r['Temp'] = Ts[i]
        cs = compute_col_sums(r['types'], r['signs'], n)
        ss = int((cs ** 2).sum())
        if ss != 4 * n:
            raise ValueError(f"Replica {i} chkpt ss={ss} != {4*n}")

    best_E = min(r['E'] for r in replicas)
    bi = [r['E'] for r in replicas].index(best_E)
    best_types = replicas[bi]['types'].copy()
    best_signs = replicas[bi]['signs'].copy()

    t0 = time.time()
    total = 0
    swaps_tried = 0
    swaps_acc = 0
    last_log = t0

    print(f"TMPT seed={seed} M={M} ladder={['%.1f' % x for x in Ts]}", flush=True)
    print(f"  init Es={[r['E'] for r in replicas]}  best={best_E}", flush=True)

    while time.time() - t0 < max_time:
        # Local moves on each replica
        for r in replicas:
            mutate_manifold(r, r['Temp'], rng, py_rng, mix, n)
            total += 1

            if r['E'] < best_E:
                best_E = r['E']
                best_types = r['types'].copy()
                best_signs = r['signs'].copy()
                with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                    json.dump({'seed': seed, 'E': int(best_E),
                               'from_T': r['Temp'],
                               'types': best_types.tolist(),
                               'signs': best_signs.tolist()}, f)
                if best_E == 0:
                    print(f"FOUND E=0! T={r['Temp']}", flush=True)
                    T = r['T']
                    A = T[0] + T[1] + T[2] + T[3]
                    B = T[0] + T[1] - T[2] - T[3]
                    C = T[0] - T[1] + T[2] - T[3]
                    D = T[0] - T[1] - T[2] + T[3]
                    export_hadamard([A.astype(np.int8), B.astype(np.int8),
                                      C.astype(np.int8), D.astype(np.int8)],
                                     save_prefix)
                    return best_types, best_signs, 0

        # Swap adjacent replicas
        if total % (swap_every * M) < M:
            i = int(rng.integers(M - 1))
            swaps_tried += 1
            dE_swap = replicas[i]['E'] - replicas[i+1]['E']
            dB = betas[i] - betas[i+1]
            log_p = dB * dE_swap
            if log_p >= 0 or py_rng.random() < math.exp(log_p):
                a, b = replicas[i], replicas[i+1]
                a['types'], b['types'] = b['types'], a['types']
                a['signs'], b['signs'] = b['signs'], a['signs']
                a['T'], b['T'] = b['T'], a['T']
                a['S'], b['S'] = b['S'], a['S']
                a['E'], b['E'] = b['E'], a['E']
                swaps_acc += 1

        # Drift check
        if total % (300000) < M:
            for idx, r in enumerate(replicas):
                cs = compute_col_sums(r['types'], r['signs'], n)
                ss = int((cs ** 2).sum())
                S_check = compute_S_from_Ts(r['T'], n)
                E_check = int(np.sum(S_check[1:] ** 2))
                if ss != 4 * n:
                    print(f"  CRITICAL replica {idx} ss={ss}!", flush=True)
                    return best_types, best_signs, best_E
                if E_check != r['E']:
                    r['S'] = S_check
                    r['E'] = E_check

        now = time.time()
        if now - last_log > 15.0:
            Es = sorted([r['E'] for r in replicas])
            dt = now - t0
            acc = swaps_acc / max(1, swaps_tried) * 100
            print(f"  t={dt:.0f}s total={total} best={best_E} cold3={Es[:3]} "
                  f"hot={Es[-1]} swap={acc:.0f}%", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best_E} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best_E


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=85001)
    ap.add_argument('--chkpts', type=str, required=True,
                    help='comma-separated list of manifold checkpoints')
    ap.add_argument('--M', type=int, default=8)
    ap.add_argument('--T_lo', type=float, default=2.0)
    ap.add_argument('--T_hi', type=float, default=200.0)
    ap.add_argument('--swap_every', type=int, default=500)
    ap.add_argument('--mix', type=float, default=0.4)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--prefix', type=str, default='h668_tmPT')
    args = ap.parse_args()
    chkpts = args.chkpts.split(',')
    manifold_PT(seed=args.seed, chkpts=chkpts, M=args.M, T_lo=args.T_lo,
                 T_hi=args.T_hi, swap_every=args.swap_every, mix=args.mix,
                 max_time=args.max_time, save_prefix=args.prefix)
