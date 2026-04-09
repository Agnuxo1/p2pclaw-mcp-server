#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Parallel Tempering attack
=================================================

PT = M replicas at T_1 < T_2 < ... < T_M, each running Metropolis SA on the
same energy E. Every N steps, propose swap (i, i+1):
    P_accept = min(1, exp((β_i − β_{i+1})·(E_i − E_{i+1})))

Why PT breaks plateaus:
  - Hot replicas sample basin transitions that single-T SA cannot make
  - Cold replicas do fine refinement
  - Swaps transport good configs down the T ladder → escape funnels
  - Detailed balance preserved by Metropolis criterion on the swap

Temperature ladder: geometric, T_1 = 10, T_M = 500, M = 8.
Each replica uses the vectorised O(n) palindrome-flip delta.
Swap attempts every 1000 local moves.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, random_palindrome, legendre_palindrome,
    compute_paf_sums, energy_from_S,
    palindrome_flip_delta, apply_flip,
    build_hadamard, verify_hadamard, export_hadamard,
)


def make_ladder(M=8, T_lo=10.0, T_hi=500.0):
    """Geometric temperature ladder."""
    return [T_lo * (T_hi / T_lo) ** (i / (M - 1)) for i in range(M)]


def parallel_tempering(seed=601, M=8, T_lo=10.0, T_hi=500.0,
                        swap_every=1000, max_time=1800,
                        save_prefix='h668_PT'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N
    half = (n - 1) // 2

    Ts = make_ladder(M, T_lo, T_hi)
    betas = [1.0 / T for T in Ts]

    # Independent random init for each replica (diversified seeding)
    replicas = []
    for i in range(M):
        nrng_i = np.random.default_rng(seed * 1000 + i * 17)
        vecs = [random_palindrome(n, nrng_i) for _ in range(4)]
        S = compute_paf_sums(vecs)
        E = energy_from_S(S)
        replicas.append({'vecs': vecs, 'S': S, 'E': E, 'T': Ts[i], 'idx': i})

    best_E = min(r['E'] for r in replicas)
    best_vecs = [v.copy() for v in replicas[np.argmin([r['E'] for r in replicas])]['vecs']]

    t0 = time.time()
    swap_attempts = 0
    swap_accepts = 0
    total_moves = 0

    print(f"PT seed={seed} M={M} T_lo={T_lo} T_hi={T_hi}", flush=True)
    print(f"  ladder: {['%.1f' % t for t in Ts]}", flush=True)
    print(f"  init best={best_E}", flush=True)

    last_log = t0
    while time.time() - t0 < max_time:
        # Local Metropolis step for each replica
        for r in replicas:
            T = r['T']
            k = int(rng.integers(4))
            j = int(rng.integers(half + 1))
            dPAF, dE = palindrome_flip_delta(r['S'], r['vecs'][k], j, n)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T):
                apply_flip(r['vecs'][k], j, n)
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

        # Swap attempts every swap_every local moves (per replica)
        if total_moves % (swap_every * M) < M:
            # Try swap (i, i+1) for random i
            i = int(rng.integers(M - 1))
            swap_attempts += 1
            dE_swap = replicas[i]['E'] - replicas[i+1]['E']
            dB = betas[i] - betas[i+1]
            log_p = dB * dE_swap
            if log_p >= 0 or py_rng.random() < math.exp(log_p):
                # Accept swap: exchange configurations (but keep T assignments)
                r_i, r_j = replicas[i], replicas[i+1]
                r_i['vecs'], r_j['vecs'] = r_j['vecs'], r_i['vecs']
                r_i['S'], r_j['S'] = r_j['S'], r_i['S']
                r_i['E'], r_j['E'] = r_j['E'], r_i['E']
                swap_accepts += 1

        # Log every 5s
        now = time.time()
        if now - last_log > 5.0:
            Es = sorted([r['E'] for r in replicas])
            dt = now - t0
            acc = (swap_accepts / max(1, swap_attempts)) * 100
            print(f"  t={dt:.0f}s moves={total_moves} best={best_E} "
                  f"replicas={Es[:3]}...{Es[-1]} swap_acc={acc:.1f}%", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best_E} swap_acc={(swap_accepts/max(1,swap_attempts))*100:.1f}% ({dt:.0f}s)", flush=True)
    return best_vecs, best_E


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=601)
    ap.add_argument('--M', type=int, default=8)
    ap.add_argument('--T_lo', type=float, default=10.0)
    ap.add_argument('--T_hi', type=float, default=500.0)
    ap.add_argument('--swap_every', type=int, default=1000)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--prefix', type=str, default='h668_PT')
    args = ap.parse_args()
    parallel_tempering(seed=args.seed, M=args.M, T_lo=args.T_lo, T_hi=args.T_hi,
                        swap_every=args.swap_every, max_time=args.max_time,
                        save_prefix=args.prefix)
