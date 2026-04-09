#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Tabu Search with Focused Intensification
================================================================

Tabu Search differs from SA:
  - Always take the BEST allowed move (even if uphill)
  - Forbid reverting moves for tabu_tenure iterations
  - Aspiration: allow tabu if it improves global best
  - Diversify by jumping to less-visited regions periodically

For H(668): at each step sample K candidate flips, pick best non-tabu ΔE.
Tabu list: set of (k, j) bit positions, each with expiration iter.

Intensification: when best improves, focus on neighborhood of current state.
Diversification: after stale, reset tabu + apply multi-bit perturbation
toward UNDEREXPLORED bit positions (low frequency in history).
"""
import sys, os, json, time, math, random, argparse
import numpy as np
from collections import defaultdict

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, compute_paf_sums, energy_from_S, export_hadamard
from hadamard_668_nonpalindrome import random_vec, single_flip_delta


def tabu_search(seed=5001, max_time=10800, tabu_tenure=50, cands_per_step=40,
                 diversify_stale=500000, chkpt=None, save_prefix='h668_tabu'):
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

    tabu = {}         # (k, j) -> expire_iter
    hist = defaultdict(int)  # flip frequency for diversification
    it = 0
    stale = 0
    diversifications = 0
    t0 = time.time()
    last_log = t0

    print(f"TABU seed={seed} tenure={tabu_tenure} cands={cands_per_step} init E={E}", flush=True)

    while time.time() - t0 < max_time:
        it += 1

        # Generate candidates
        cands = []
        for _ in range(cands_per_step):
            k = int(rng.integers(4))
            j = int(rng.integers(n))
            cands.append((k, j))

        # Pick best non-tabu move (with aspiration)
        best_move = None
        best_dE = 10 ** 18
        for k, j in cands:
            dPAF, dE = single_flip_delta(S, vecs[k], j, n)
            is_tabu = tabu.get((k, j), 0) > it
            new_E = E + dE
            if is_tabu and new_E >= best:
                continue   # tabu & no aspiration
            if dE < best_dE:
                best_dE = dE
                best_move = (k, j, dPAF)

        if best_move is None:
            # All candidates tabu, pick any
            k, j = cands[0]
            dPAF, best_dE = single_flip_delta(S, vecs[k], j, n)
            best_move = (k, j, dPAF)

        k, j, dPAF = best_move
        vecs[k][j] = -vecs[k][j]
        S += dPAF
        E += best_dE
        tabu[(k, j)] = it + tabu_tenure
        hist[(k, j)] += 1

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

        # Purge expired tabus every 1000 iters
        if it % 1000 == 0:
            tabu = {kj: exp for kj, exp in tabu.items() if exp > it}

        # Drift correction
        if it % 200000 == 199999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        # Diversification: jump to less-explored region
        if stale >= diversify_stale:
            diversifications += 1
            # Pick 20 positions with lowest flip frequency
            all_positions = [(k, j) for k in range(4) for j in range(n)]
            all_positions.sort(key=lambda kj: (hist[kj], rng.random()))
            under_explored = all_positions[:25]
            for k2, j2 in under_explored:
                vecs[k2][j2] = -vecs[k2][j2]
                hist[(k2, j2)] += 1
            # Also restore some from best
            vecs = [0.3 * v + 0.7 * bv for v, bv in zip(vecs, best_vecs)]
            vecs = [np.sign(v).astype(np.int8) for v in vecs]
            # Fix any 0s
            for v in vecs:
                v[v == 0] = 1
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            tabu.clear()
            stale = 0
            print(f"  [DIVERSIFY #{diversifications} it={it}] best={best} E={E}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} |tabu|={len(tabu)} stale={stale} divs={diversifications}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} divs={diversifications} ({time.time()-t0:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=5001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--tabu_tenure', type=int, default=50)
    ap.add_argument('--cands_per_step', type=int, default=40)
    ap.add_argument('--prefix', type=str, default='h668_tabu')
    args = ap.parse_args()
    tabu_search(seed=args.seed, max_time=args.max_time, tabu_tenure=args.tabu_tenure,
                 cands_per_step=args.cands_per_step, chkpt=args.chkpt,
                 save_prefix=args.prefix)
