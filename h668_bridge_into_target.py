#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) TARGETED BRIDGE: find ALL checkpoints that can 2-flip-bridge
INTO the (3,7,9,23) target class. This finds completely new starting
configurations for the champion class from a different basin.
"""
import sys, os, json, glob
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N
from hadamard_668_turyn_fast import compute_S_from_Ts

PATS = [(1,1,1,1), (1,1,-1,-1), (1,-1,1,-1), (1,-1,-1,1)]
TARGET = (3, 7, 9, 23)


def col_sums_from_ts(types, signs, n):
    cs = [0]*4
    for i in range(n):
        p = PATS[types[i]]; s = signs[i]
        for k in range(4):
            cs[k] += p[k]*s
    return cs


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def find_bridges_to_target(checkpoint_file):
    d = json.load(open(checkpoint_file))
    types = list(d['types'])
    signs = list(d['signs'])
    E_start = d.get('E', -1)
    if not isinstance(E_start, int) or E_start < 0 or E_start > 5000:
        return []
    n = len(types)
    cs_start = col_sums_from_ts(types, signs, n)
    if class_of(cs_start) == TARGET:
        return []  # already in target
    # Quick filter: 2-flip Δ in {-4,0,4}^4. Check if (cs_start + Δ) sorted abs == TARGET
    found_combos = False
    target_set = sorted(TARGET)
    for da in (-4, 0, 4):
        for db in (-4, 0, 4):
            for dc in (-4, 0, 4):
                for dd in (-4, 0, 4):
                    new = [cs_start[0]+da, cs_start[1]+db, cs_start[2]+dc, cs_start[3]+dd]
                    if sorted(abs(x) for x in new) == target_set:
                        found_combos = True
                        break
                if found_combos: break
            if found_combos: break
        if found_combos: break
    if not found_combos:
        return []

    # Now actually enumerate ALL 2-flip pairs (i,j) and check
    T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
    for i in range(n):
        T[types[i]][i] = signs[i]
    S0 = compute_S_from_Ts(T, n)

    bridges = []
    for i in range(n):
        for j in range(i+1, n):
            new_cs = list(cs_start)
            for k in range(4):
                new_cs[k] += -2*signs[i]*PATS[types[i]][k] - 2*signs[j]*PATS[types[j]][k]
            if class_of(new_cs) != TARGET:
                continue
            # Compute new E (always exact via temp T copy)
            T_tmp = [tk.copy() for tk in T]
            T_tmp[types[i]][i] = -T_tmp[types[i]][i]
            T_tmp[types[j]][j] = -T_tmp[types[j]][j]
            S_new = compute_S_from_Ts(T_tmp, n)
            E_new = int(np.dot(S_new[1:], S_new[1:]))
            bridges.append((E_new, i, j, new_cs))
    bridges.sort()
    return bridges


def main():
    files = sorted(glob.glob('h668_*.json'))
    target_bridges = []
    invalid_low = []
    for f in files:
        if 'BR' in os.path.basename(f):
            continue
        try:
            d = json.load(open(f))
            E = d.get('E')
            if not isinstance(E, int) or E < 0 or E > 5000:
                continue
            types = d.get('types'); signs = d.get('signs')
            if not types or not signs: continue
            n = len(types)
            cs = col_sums_from_ts(types, signs, n)
            ps = sum(x*x for x in cs)
            cls = class_of(cs)
            if cls == TARGET:
                continue  # already there
            if ps == 668:
                continue  # other valid class — not interesting
            invalid_low.append((E, f, cs, cls))
        except:
            pass

    invalid_low.sort()
    print(f"Total invalid checkpoints: {len(invalid_low)}")
    print(f"Searching first 30 for bridges INTO (3,7,9,23)...")
    print()

    for idx, (E, f, cs, cls) in enumerate(invalid_low[:30]):
        bridges = find_bridges_to_target(f)
        if not bridges:
            continue
        best = bridges[0]
        print(f"  src E={E}  cls={cls}  cs={cs}  -> {len(bridges)} bridges, best E_new={best[0]}  flips=({best[1]},{best[2]})  {os.path.basename(f)}")
        target_bridges.extend([(b[0], f, b[1], b[2], b[3]) for b in bridges[:3]])

    target_bridges.sort()
    print(f"\n=== TOP 20 BRIDGES INTO (3,7,9,23) ===")
    for E_new, f, i, j, cs_new in target_bridges[:20]:
        print(f"  E={E_new}  flips=({i},{j})  cs={cs_new}  src={os.path.basename(f)}")

    # Save best 10
    saved_count = 0
    for E_new, f, i, j, cs_new in target_bridges[:10]:
        d = json.load(open(f))
        new_types = list(d['types'])
        new_signs = list(d['signs'])
        new_signs[i] = -new_signs[i]
        new_signs[j] = -new_signs[j]
        out = {
            'seed': d.get('seed', 0) + 300000 + saved_count,
            'E': int(E_new),
            'from_T': 1.0,
            'types': new_types,
            'signs': new_signs,
            'source': f'2-flip bridge to (3,7,9,23) from {os.path.basename(f)}',
        }
        src_tag = os.path.basename(f).replace('h668_','').replace('.json','')
        out_name = f"h668_BRT_{src_tag}_E{E_new}_{saved_count}.json"
        with open(out_name, 'w') as fh:
            json.dump(out, fh)
        print(f"  saved -> {out_name}")
        saved_count += 1


if __name__ == '__main__':
    main()
