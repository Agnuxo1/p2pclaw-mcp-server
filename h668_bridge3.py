#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) 3-FLIP BRIDGE ATTACK

Many low-E invalid checkpoints have NO 2-flip path to any valid Parseval-668
class. Try 3-flip bridges instead. Use smart enumeration: pre-filter by
ΔParseval feasibility before computing E.
"""
import sys, os, json, glob
import numpy as np
from itertools import combinations

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N
from hadamard_668_turyn_fast import compute_S_from_Ts

PATS = [(1, 1, 1, 1), (1, 1, -1, -1), (1, -1, 1, -1), (1, -1, -1, 1)]
VALID = {
    (1, 1, 15, 21), (3, 3, 5, 25), (3, 7, 13, 21), (5, 9, 11, 21),
    (7, 13, 15, 15), (1, 9, 15, 19), (3, 3, 11, 23), (3, 3, 17, 19),
    (3, 7, 9, 23), (3, 9, 17, 17),
}


def col_sums_from_ts(types, signs, n):
    cs = [0]*4
    for i in range(n):
        p = PATS[types[i]]; s = signs[i]
        for k in range(4):
            cs[k] += p[k]*s
    return cs


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def attempt_3bridge(checkpoint_file, max_attempts_per_target=300):
    print(f"\n=== 3-BRIDGE FROM {os.path.basename(checkpoint_file)} ===", flush=True)
    d = json.load(open(checkpoint_file))
    types = list(d['types'])
    signs = list(d['signs'])
    E_start = d['E']
    n = len(types)
    cs_start = col_sums_from_ts(types, signs, n)
    cls_start = class_of(cs_start)
    print(f"  E_start={E_start}  cs={cs_start}  cls={cls_start}")

    # Build T
    T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
    for i in range(n):
        T[types[i]][i] = signs[i]
    S0 = compute_S_from_Ts(T, n)

    # For 3-flip enumeration: O(n^3) = 4.6M combinations is too slow.
    # Smart strategy: enumerate by Δcs categories.
    # Each flip has Δcs = -2*s*pat[t] which is one of 8 vectors (4 patterns * 2 signs)
    # Group positions by their Δcs vector (one of 8 types)
    delta_groups = {}
    delta_vec = {}
    for pos in range(n):
        t = types[pos]; s = signs[pos]
        dv = tuple(-2*s*PATS[t][k] for k in range(4))
        if dv not in delta_groups:
            delta_groups[dv] = []
            delta_vec[dv] = dv
        delta_groups[dv].append(pos)
    print(f"  delta groups: {len(delta_groups)}")
    for dv, pos_list in sorted(delta_groups.items()):
        print(f"    {dv}: {len(pos_list)} positions")

    # For each combination of 3 delta vectors (with repetition), check if total Δcs makes valid class
    delta_keys = list(delta_groups.keys())
    valid_combos = []
    # Choose 3 types of delta (allowing repeats), check sum
    for i in range(len(delta_keys)):
        for j in range(i, len(delta_keys)):
            for k in range(j, len(delta_keys)):
                dv1 = delta_keys[i]
                dv2 = delta_keys[j]
                dv3 = delta_keys[k]
                new_cs = [cs_start[m] + dv1[m] + dv2[m] + dv3[m] for m in range(4)]
                if sum(x*x for x in new_cs) != 668:
                    continue
                cls = class_of(new_cs)
                if cls not in VALID:
                    continue
                valid_combos.append((dv1, dv2, dv3, cls, new_cs))

    print(f"  valid 3-delta combos: {len(valid_combos)}")
    if not valid_combos:
        return []

    # For each combo, sample positions (limited count) and compute E
    best_per_class = {}
    for dv1, dv2, dv3, cls, new_cs in valid_combos:
        # If all 3 vectors are different: |G1| * |G2| * |G3|
        # If 2 same, 1 different: C(|G_same|,2) * |G_diff|
        # If all same: C(|G|,3)
        groups = [delta_groups[dv1], delta_groups[dv2], delta_groups[dv3]]
        # Sample at most max_attempts_per_target combinations
        # Use uniform random sampling
        import random
        rng = random.Random(42)
        attempts = 0
        max_a = max_attempts_per_target
        while attempts < max_a:
            attempts += 1
            if dv1 == dv2 == dv3:
                if len(groups[0]) < 3: break
                p1, p2, p3 = rng.sample(groups[0], 3)
            elif dv1 == dv2:
                if len(groups[0]) < 2: break
                a, b = rng.sample(groups[0], 2)
                c = rng.choice(groups[2])
                p1, p2, p3 = a, b, c
            elif dv2 == dv3:
                a = rng.choice(groups[0])
                if len(groups[1]) < 2: break
                b, c = rng.sample(groups[1], 2)
                p1, p2, p3 = a, b, c
            else:
                p1 = rng.choice(groups[0])
                p2 = rng.choice(groups[1])
                p3 = rng.choice(groups[2])
            positions = sorted(set([p1, p2, p3]))
            if len(positions) != 3:
                continue

            # Apply flips temporarily, compute E
            T_tmp = [tk.copy() for tk in T]
            for pos in positions:
                T_tmp[types[pos]][pos] = -T_tmp[types[pos]][pos]
            S_new = compute_S_from_Ts(T_tmp, n)
            E_new = int(np.dot(S_new[1:], S_new[1:]))

            if cls not in best_per_class or E_new < best_per_class[cls][0]:
                best_per_class[cls] = (E_new, positions, new_cs)

    print(f"  Best per class:")
    results = []
    for cls in sorted(best_per_class.keys(), key=lambda c: best_per_class[c][0]):
        E_new, pos, cs_new = best_per_class[cls]
        print(f"    {cls}: E={E_new}  cs={cs_new}  flips={pos}")
        results.append((cls, E_new, pos, cs_new))

    # Save best 5
    saved_count = 0
    for cls, E_new, pos, cs_new in results[:5]:
        new_signs = list(signs)
        for p in pos:
            new_signs[p] = -new_signs[p]
        out = {
            'seed': d.get('seed', 0) + 200000 + saved_count,
            'E': int(E_new),
            'from_T': 1.0,
            'types': list(types),
            'signs': new_signs,
            'source': f'3-bridge from {os.path.basename(checkpoint_file)}',
        }
        src_tag = os.path.basename(checkpoint_file).replace('h668_','').replace('.json','')
        out_name = f"h668_BR3_{cls[0]}_{cls[1]}_{cls[2]}_{cls[3]}_{src_tag}_{saved_count}.json"
        with open(out_name, 'w') as fh:
            json.dump(out, fh)
        print(f"  saved -> {out_name}")
        saved_count += 1

    return results


def main():
    # Top low-E invalid checkpoints
    files = glob.glob('h668_*.json')
    candidates = []
    for f in files:
        if f.startswith('h668_BR'):
            continue
        try:
            d = json.load(open(f))
            E = d.get('E')
            if not isinstance(E, int) or E < 0 or E > 5000:
                continue
            types = d.get('types'); signs = d.get('signs')
            if not types or not signs:
                continue
            n = len(types)
            cs = col_sums_from_ts(types, signs, n)
            ps = sum(x*x for x in cs)
            cls = class_of(cs)
            valid = cls in VALID
            candidates.append((E, f, cls, valid, ps))
        except:
            pass

    candidates.sort()
    invalids = [c for c in candidates if not c[3]][:12]
    print(f"=== TOP 12 LOW-E INVALID CHECKPOINTS ===")
    for E, f, cls, _, ps in invalids:
        print(f"  E={E}  P={ps}  cls={cls}  {os.path.basename(f)}")

    for E, f, cls, _, _ in invalids:
        attempt_3bridge(f, max_attempts_per_target=200)


if __name__ == '__main__':
    main()
