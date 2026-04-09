#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Polisher — loads best-known state and continues SA.

Warm-start from checkpoint JSON. Applies low-T Metropolis + aggressive multi-bit
escapes when stuck. Use on any champion state to push E further.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, compute_paf_sums, energy_from_S, export_hadamard
from hadamard_668_nonpalindrome import single_flip_delta


def polish(chkpt, seed=2001, max_time=3600, T0=30.0, alpha=0.999998,
           restart_stale=2000000, save_prefix='h668_polish'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    with open(chkpt) as f:
        state = json.load(f)
    vecs = [np.array(v, dtype=np.int8) for v in state['vecs']]
    S = compute_paf_sums(vecs)
    E = energy_from_S(S)
    init_E = state.get('E', E)
    print(f"POLISH seed={seed} chkpt={chkpt} loaded_E={init_E} recomputed_E={E}", flush=True)
    best = E
    best_vecs = [v.copy() for v in vecs]
    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0
    while time.time() - t0 < max_time:
        it += 1
        k = int(rng.integers(4))
        j = int(rng.integers(n))
        dPAF, dE = single_flip_delta(S, vecs[k], j, n)
        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            vecs[k][j] = -vecs[k][j]
            S += dPAF
            E += dE
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
        T = max(2.0, T * alpha)
        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
        if stale >= restart_stale:
            restarts += 1
            vecs = [v.copy() for v in best_vecs]
            n_perturb = 10 + (restarts % 8) * 3
            for _ in range(n_perturb):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(n))
                vecs[k2][j2] = -vecs[k2][j2]
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T = T0 * (0.7 ** (restarts % 5))
            stale = 0
            print(f"  [RESTART #{restarts} it={it}] best={best} E={E} T={T:.1f} nperturb={n_perturb}", flush=True)
        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T:.2f} r={restarts}", flush=True)
            last_log = now
    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--chkpt', type=str, required=True)
    ap.add_argument('--seed', type=int, default=2001)
    ap.add_argument('--max_time', type=int, default=3600)
    ap.add_argument('--T0', type=float, default=30.0)
    ap.add_argument('--alpha', type=float, default=0.999998)
    ap.add_argument('--restart_stale', type=int, default=2000000)
    ap.add_argument('--prefix', type=str, default='h668_polish')
    args = ap.parse_args()
    polish(args.chkpt, seed=args.seed, max_time=args.max_time, T0=args.T0,
           alpha=args.alpha, restart_stale=args.restart_stale, save_prefix=args.prefix)
