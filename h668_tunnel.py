#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) TUNNELING ATTACK

LLLL E=260 is a strict 2-swap AND 3-cycle local minimum (min dE = +12).
Strategy:
  1. Kick out via random k-flip (k=4..8) — leaves col_sums = invalid
  2. Polish in invalid space briefly (looking for low NAF point)
  3. Bridge BACK to (3,7,9,23) via 2-flip enumeration
  4. Polish on manifold
  5. Compare with E=260 — if better, save

This explores OTHER (3,7,9,23) basins distinct from LLLL.
"""
import sys, os, json, time, random
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N
from hadamard_668_turyn_fast import compute_S_from_Ts

PATS = [(1,1,1,1),(1,1,-1,-1),(1,-1,1,-1),(1,-1,-1,1)]
TARGET = (3, 7, 9, 23)


def cs_of(types, signs, n):
    return [sum(PATS[types[i]][k]*signs[i] for i in range(n)) for k in range(4)]


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def E_of(T, n):
    S = compute_S_from_Ts(T, n)
    return int(np.dot(S[1:], S[1:]))


def find_2flip_back_to_target(T, types, signs, n, cs_now):
    """Find all 2-flip pairs that land back in TARGET class. Return best (E_new, i, j)."""
    bridges = []
    for i in range(n):
        for j in range(i+1, n):
            new_cs = list(cs_now)
            for k in range(4):
                new_cs[k] += -2*signs[i]*PATS[types[i]][k] - 2*signs[j]*PATS[types[j]][k]
            if class_of(new_cs) != TARGET:
                continue
            T_tmp = [tk.copy() for tk in T]
            T_tmp[types[i]][i] = -T_tmp[types[i]][i]
            T_tmp[types[j]][j] = -T_tmp[types[j]][j]
            E_new = E_of(T_tmp, n)
            bridges.append((E_new, i, j))
    bridges.sort()
    return bridges


def random_kick(types, signs, n, k, rng):
    """Apply k random sign flips. Return list of flipped positions."""
    positions = rng.sample(range(n), k)
    for p in positions:
        signs[p] = -signs[p]
    return positions


def main():
    chkpt = sys.argv[1] if len(sys.argv) > 1 else 'h668_LLLL_seed92001.json'
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 70001
    max_kicks = int(sys.argv[3]) if len(sys.argv) > 3 else 100
    rng = random.Random(seed)

    print(f"=== TUNNEL ATTACK from {chkpt} seed={seed} ===", flush=True)
    d = json.load(open(chkpt))
    types_orig = list(d['types'])
    signs_orig = list(d['signs'])
    E_start = d['E']
    n = len(types_orig)
    cs_orig = cs_of(types_orig, signs_orig, n)
    print(f"  E_start={E_start}  cs={cs_orig}  cls={class_of(cs_orig)}")

    if class_of(cs_orig) != TARGET:
        print(f"  ERROR: not in target class")
        return

    best_global = E_start
    best_state = (types_orig, signs_orig)
    saved_count = 0

    t0 = time.time()
    for trial in range(max_kicks):
        # Reset to start
        types = list(types_orig)
        signs = list(signs_orig)

        # KICK: apply k random sign flips (k=4..10)
        k = rng.choice([4, 4, 4, 6, 6, 8])
        random_kick(types, signs, n, k, rng)

        # Build T
        T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
        for i in range(n):
            T[types[i]][i] = signs[i]
        cs_kicked = cs_of(types, signs, n)
        cls_kicked = class_of(cs_kicked)
        if cls_kicked == TARGET:
            continue  # didn't actually leave target class — try again

        # Find 2-flip bridges back to TARGET
        bridges = find_2flip_back_to_target(T, types, signs, n, cs_kicked)
        if not bridges:
            continue

        E_min, i_b, j_b = bridges[0]

        # Apply the bridge flip and check
        new_signs = list(signs)
        new_signs[i_b] = -new_signs[i_b]
        new_signs[j_b] = -new_signs[j_b]

        if E_min < best_global:
            print(f"  trial {trial}: KICK k={k} → kicked cls={cls_kicked} → bridged E={E_min} ★ NEW BEST", flush=True)
            best_global = E_min
            best_state = (list(types), new_signs)
            # Save
            out = {
                'seed': seed + 1000 + saved_count,
                'E': int(E_min),
                'from_T': 1.0,
                'types': list(types),
                'signs': new_signs,
                'source': f'tunnel from {os.path.basename(chkpt)} kick k={k} bridge ({i_b},{j_b})',
            }
            out_name = f"h668_TUN_E{E_min}_{saved_count}.json"
            json.dump(out, open(out_name, 'w'))
            print(f"    saved -> {out_name}")
            saved_count += 1
        elif trial % 10 == 0:
            print(f"  trial {trial}: kick k={k} → cls={cls_kicked} → best bridge E={E_min} (vs {best_global})", flush=True)

        if time.time() - t0 > 600:
            break

    print(f"\nTunneling done. Best found: E={best_global} (start was {E_start})")


if __name__ == '__main__':
    main()
