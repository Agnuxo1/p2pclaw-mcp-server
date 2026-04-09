#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Non-palindromic + Parallel Tempering
============================================================

Combines two advances:
  1. Non-palindromic Williamson: 668 bits, 83 constraints (was 336 bits, plateau E ≈ 9000)
  2. Parallel Tempering: M replicas at T_1 < ... < T_M, swap on Metropolis criterion

Non-palindromic reaches E ≈ 2300 easily (4× better than palindromic). PT should
push further by escaping the new plateau via replica swaps.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, compute_paf_sums, energy_from_S,
    build_hadamard, verify_hadamard, export_hadamard,
)
from hadamard_668_nonpalindrome import random_vec, single_flip_delta


def make_ladder(M=8, T_lo=2.0, T_hi=400.0):
    return [T_lo * (T_hi / T_lo) ** (i / (M - 1)) for i in range(M)]


def nonpal_PT(seed=1001, M=10, T_lo=2.0, T_hi=400.0, swap_every=2000,
               max_time=1800, save_prefix='h668_npPT'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    Ts = make_ladder(M, T_lo, T_hi)
    betas = [1.0 / T for T in Ts]

    replicas = []
    for i in range(M):
        r_rng = np.random.default_rng(seed * 100 + i * 31)
        vecs = [random_vec(n, r_rng) for _ in range(4)]
        S = compute_paf_sums(vecs)
        E = energy_from_S(S)
        replicas.append({'vecs': vecs, 'S': S, 'E': E, 'T': Ts[i]})

    Es0 = [r['E'] for r in replicas]
    best_E = min(Es0)
    bi = Es0.index(best_E)
    best_vecs = [v.copy() for v in replicas[bi]['vecs']]

    t0 = time.time()
    total_moves = 0
    swap_attempts = 0
    swap_accepts = 0

    print(f"NPPT seed={seed} M={M} T_lo={T_lo} T_hi={T_hi}", flush=True)
    print(f"  ladder: {['%.1f' % t for t in Ts]}", flush=True)
    print(f"  init Es={Es0}  best={best_E}", flush=True)

    last_log = t0
    while time.time() - t0 < max_time:
        # Local Metropolis step per replica
        for r in replicas:
            T = r['T']
            k = int(rng.integers(4))
            j = int(rng.integers(n))
            dPAF, dE = single_flip_delta(r['S'], r['vecs'][k], j, n)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T):
                r['vecs'][k][j] = -r['vecs'][k][j]
                r['S'] += dPAF
                r['E'] += dE
                if r['E'] < best_E:
                    best_E = r['E']
                    best_vecs = [v.copy() for v in r['vecs']]
                    with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                        json.dump({'seed': seed, 'E': int(best_E), 'from_T': T,
                                   'vecs': [v.tolist() for v in best_vecs]}, f)
                    if best_E == 0:
                        print(f"FOUND E=0! replica T={T}", flush=True)
                        export_hadamard(best_vecs, save_prefix)
                        return best_vecs, 0
            total_moves += 1

        # Swap attempt every swap_every moves (global count)
        if total_moves % (swap_every * M) < M:
            i = int(rng.integers(M - 1))
            swap_attempts += 1
            dE_swap = replicas[i]['E'] - replicas[i+1]['E']
            dB = betas[i] - betas[i+1]
            log_p = dB * dE_swap
            if log_p >= 0 or py_rng.random() < math.exp(log_p):
                r_i, r_j = replicas[i], replicas[i+1]
                r_i['vecs'], r_j['vecs'] = r_j['vecs'], r_i['vecs']
                r_i['S'], r_j['S'] = r_j['S'], r_i['S']
                r_i['E'], r_j['E'] = r_j['E'], r_i['E']
                swap_accepts += 1

        now = time.time()
        if now - last_log > 10.0:
            Es = sorted([r['E'] for r in replicas])
            dt = now - t0
            acc = (swap_accepts / max(1, swap_attempts)) * 100
            print(f"  t={dt:.0f}s moves={total_moves} best={best_E} "
                  f"cold3={Es[:3]} hot={Es[-1]} swap={acc:.0f}%", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best_E} ({dt:.0f}s)", flush=True)
    return best_vecs, best_E


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1001)
    ap.add_argument('--M', type=int, default=10)
    ap.add_argument('--T_lo', type=float, default=2.0)
    ap.add_argument('--T_hi', type=float, default=400.0)
    ap.add_argument('--swap_every', type=int, default=2000)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--prefix', type=str, default='h668_npPT')
    args = ap.parse_args()
    nonpal_PT(seed=args.seed, M=args.M, T_lo=args.T_lo, T_hi=args.T_hi,
               swap_every=args.swap_every, max_time=args.max_time,
               save_prefix=args.prefix)
