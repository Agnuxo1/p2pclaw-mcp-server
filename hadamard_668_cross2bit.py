#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Cross-vec 2-bit SA
==========================================

Mix of:
  - 70% single flips (fast exploration)
  - 30% 2-bit moves across two DIFFERENT vecs (escape 1-bit local min)

For moves (k1,j1,k2,j2) with k1≠k2:
  ΔS = single_flip_delta(k1,j1) + single_flip_delta(k2,j2)  [independent]

For moves (k,j1,j2) same vec:
  Needs sequential apply+delta (correlated).

Warm-start from champion file.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, compute_paf_sums, energy_from_S, export_hadamard
from hadamard_668_nonpalindrome import random_vec, single_flip_delta


def cross2(seed=6001, max_time=10800, T0=30.0, alpha=0.9999997,
            p_single=0.7, restart_stale=3000000, chkpt=None,
            save_prefix='h668_cross2'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    if chkpt:
        with open(chkpt) as f:
            state = json.load(f)
        vecs = [np.array(v, dtype=np.int8) for v in state['vecs']]
    else:
        vecs = [random_vec(n, rng) for _ in range(4)]

    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    best = E
    best_vecs = [v.copy() for v in vecs]
    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    single_accepts = 0
    two_accepts = 0
    last_log = t0

    print(f"CROSS2 seed={seed} init E={E} p_single={p_single}", flush=True)

    while time.time() - t0 < max_time:
        it += 1

        if py_rng.random() < p_single:
            # Single flip
            k = int(rng.integers(4))
            j = int(rng.integers(n))
            dPAF, dE = single_flip_delta(S, vecs[k], j, n)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T):
                vecs[k][j] = -vecs[k][j]
                S += dPAF
                E += dE
                single_accepts += 1
        else:
            # Cross-vec 2-bit move: k1 ≠ k2
            # COMPOSITION: E(v+dv1+dv2) - E(v) = dE1 + dE2 + 2·<dPAF1, dPAF2>
            # (The cross-term is non-zero when dPAF1 and dPAF2 overlap.)
            k1 = int(rng.integers(4))
            j1 = int(rng.integers(n))
            k2 = int(rng.integers(4))
            while k2 == k1:
                k2 = int(rng.integers(4))
            j2 = int(rng.integers(n))
            d1, dE1 = single_flip_delta(S, vecs[k1], j1, n)
            d2, dE2 = single_flip_delta(S, vecs[k2], j2, n)
            dPAF = d1 + d2
            # Correct composite ΔE: dE1 + dE2 + 2·dPAF1·dPAF2
            cross_term = 2 * int(np.dot(d1[1:], d2[1:]))
            dE = dE1 + dE2 + cross_term
            if dE <= 0 or py_rng.random() < math.exp(-dE / T):
                vecs[k1][j1] = -vecs[k1][j1]
                vecs[k2][j2] = -vecs[k2][j2]
                S += dPAF
                E += dE
                two_accepts += 1

        if E < best:
            best = E
            best_vecs = [v.copy() for v in vecs]
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'it': it,
                           'vecs': [v.tolist() for v in best_vecs]}, f)
            if best == 0:
                print(f"FOUND E=0! it={it}", flush=True)
                export_hadamard(vecs, save_prefix)
                return vecs, 0
        else:
            stale += 1

        T = max(1.0, T * alpha)

        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        if stale >= restart_stale:
            restarts += 1
            vecs = [v.copy() for v in best_vecs]
            for _ in range(15 + restarts % 10):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(n))
                vecs[k2][j2] = -vecs[k2][j2]
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T = T0 * (0.7 ** (restarts % 5))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} T={T:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T:.2f} 1bit_acc={single_accepts} 2bit_acc={two_accepts} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=6001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=30.0)
    ap.add_argument('--alpha', type=float, default=0.9999997)
    ap.add_argument('--p_single', type=float, default=0.7)
    ap.add_argument('--prefix', type=str, default='h668_cross2')
    args = ap.parse_args()
    cross2(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time, T0=args.T0,
            alpha=args.alpha, p_single=args.p_single, save_prefix=args.prefix)
