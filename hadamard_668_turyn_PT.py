#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn Parallel Tempering with fast delta.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, export_hadamard
from hadamard_668_turyn_fast import (compute_S_from_Ts,
                                       sign_flip_delta_turyn,
                                       type_change_delta_turyn)


def make_ladder(M=10, T_lo=5.0, T_hi=800.0):
    return [T_lo * (T_hi / T_lo) ** (i / (M - 1)) for i in range(M)]


def turyn_PT(seed=10001, M=10, T_lo=5.0, T_hi=800.0, swap_every=1000,
              max_time=10800, save_prefix='h668_tPT'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    Ts = make_ladder(M, T_lo, T_hi)
    betas = [1.0 / T for T in Ts]

    replicas = []
    for i in range(M):
        r_rng = np.random.default_rng(seed * 100 + i * 29)
        types = r_rng.integers(4, size=n)
        signs = r_rng.choice([-1, 1], size=n).astype(np.int8)
        T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
        for idx in range(n):
            T[int(types[idx])][idx] = signs[idx]
        S = compute_S_from_Ts(T, n)
        E = int(np.sum(S[1:] ** 2))
        replicas.append({'types': types, 'signs': signs, 'T': T, 'S': S,
                         'E': E, 'Temp': Ts[i]})

    best_E = min(r['E'] for r in replicas)
    bi = [r['E'] for r in replicas].index(best_E)
    best_types = replicas[bi]['types'].copy()
    best_signs = replicas[bi]['signs'].copy()

    t0 = time.time()
    total = 0
    swaps_tried = 0
    swaps_acc = 0
    last_log = t0

    print(f"TPT seed={seed} M={M} ladder={['%.0f' % t for t in Ts]}", flush=True)
    print(f"  init Es={[r['E'] for r in replicas]}  best={best_E}", flush=True)

    while time.time() - t0 < max_time:
        for r in replicas:
            Ttemp = r['Temp']
            if py_rng.random() < 0.5:
                # SIGN FLIP
                i = int(rng.integers(n))
                k = int(r['types'][i])
                dNAF, dE = sign_flip_delta_turyn(r['S'], r['T'][k], i, n)
                if dE <= 0 or py_rng.random() < math.exp(-dE / Ttemp):
                    r['T'][k][i] = -r['T'][k][i]
                    r['signs'][i] = -r['signs'][i]
                    r['S'] += dNAF
                    r['E'] += dE
            else:
                # TYPE CHANGE
                i = int(rng.integers(n))
                a = int(r['types'][i])
                b = int(rng.integers(4))
                while b == a:
                    b = int(rng.integers(4))
                sign_val = int(r['signs'][i])
                dNAF, dE = type_change_delta_turyn(r['S'], r['T'][a], r['T'][b], i, n, sign_val)
                if dE <= 0 or py_rng.random() < math.exp(-dE / Ttemp):
                    r['T'][a][i] = 0
                    r['T'][b][i] = sign_val
                    r['types'][i] = b
                    r['S'] += dNAF
                    r['E'] += dE

            if r['E'] < best_E:
                best_E = r['E']
                best_types = r['types'].copy()
                best_signs = r['signs'].copy()
                with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                    json.dump({'seed': seed, 'E': int(best_E), 'from_T': Ttemp,
                               'types': best_types.tolist(),
                               'signs': best_signs.tolist()}, f)
                if best_E == 0:
                    print(f"FOUND E=0! T={Ttemp}", flush=True)
                    T = r['T']
                    A = T[0]+T[1]+T[2]+T[3]
                    B = T[0]+T[1]-T[2]-T[3]
                    C = T[0]-T[1]+T[2]-T[3]
                    D = T[0]-T[1]-T[2]+T[3]
                    export_hadamard([A.astype(np.int8),B.astype(np.int8),C.astype(np.int8),D.astype(np.int8)], save_prefix)
                    return best_types, best_signs, 0
            total += 1

        # Swap
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

        now = time.time()
        if now - last_log > 12.0:
            Es = sorted([r['E'] for r in replicas])
            dt = now - t0
            acc = swaps_acc / max(1, swaps_tried) * 100
            print(f"  t={dt:.0f}s total={total} best={best_E} cold3={Es[:3]} hot={Es[-1]} swap={acc:.0f}%", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best_E} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best_E


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=10001)
    ap.add_argument('--M', type=int, default=10)
    ap.add_argument('--T_lo', type=float, default=5.0)
    ap.add_argument('--T_hi', type=float, default=800.0)
    ap.add_argument('--swap_every', type=int, default=1000)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--prefix', type=str, default='h668_tPT')
    args = ap.parse_args()
    turyn_PT(seed=args.seed, M=args.M, T_lo=args.T_lo, T_hi=args.T_hi,
              swap_every=args.swap_every, max_time=args.max_time, save_prefix=args.prefix)
