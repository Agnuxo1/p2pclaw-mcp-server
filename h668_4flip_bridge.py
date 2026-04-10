#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) 4-FLIP BRIDGE EXHAUSTIVE

For LLLL E=260, enumerate ALL 4-position flip combinations that
land on a valid Parseval-668 class. Goal: find E < 260.

Uses delta-vector grouping to drastically prune the O(n^4)/24 ≈ 32M
search space to only valid Δcs combinations.
"""
import sys, os, json, time, itertools
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_turyn_fast import compute_S_from_Ts

PATS = [(1, 1, 1, 1), (1, 1, -1, -1), (1, -1, 1, -1), (1, -1, -1, 1)]
VALID = {
    (1, 1, 15, 21), (3, 3, 5, 25), (3, 7, 13, 21), (5, 9, 11, 21),
    (7, 13, 15, 15), (1, 9, 15, 19), (3, 3, 11, 23), (3, 3, 17, 19),
    (3, 7, 9, 23), (3, 9, 17, 17),
}


def cs_of(types, signs, n):
    return [sum(PATS[types[i]][k] * signs[i] for i in range(n)) for k in range(4)]


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def main():
    fname = sys.argv[1] if len(sys.argv) > 1 else 'h668_LLLL_seed92001.json'
    max_per_combo = int(sys.argv[2]) if len(sys.argv) > 2 else 100000

    print(f"=== 4-FLIP BRIDGE from {fname} ===", flush=True)
    d = json.load(open(fname))
    types = list(d['types']); signs = list(d['signs'])
    n = len(types)
    cs_start = cs_of(types, signs, n)
    cls_start = class_of(cs_start)
    E_start = d['E']
    print(f"  E_start={E_start}  cs={cs_start}  cls={cls_start}", flush=True)

    T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
    for i in range(n):
        T[types[i]][i] = signs[i]
    S0 = compute_S_from_Ts(T, n)
    E_check = int(np.dot(S0[1:], S0[1:]))
    print(f"  E verified: {E_check}", flush=True)

    # Group positions by their delta vector
    delta_groups = {}
    for pos in range(n):
        t = types[pos]; s = signs[pos]
        dv = tuple(-2 * s * PATS[t][k] for k in range(4))
        if dv not in delta_groups:
            delta_groups[dv] = []
        delta_groups[dv].append(pos)
    print(f"  delta groups: {[(dv, len(g)) for dv, g in sorted(delta_groups.items())]}", flush=True)

    # Find 4-delta combos landing on VALID
    dkeys = sorted(delta_groups.keys())
    valid_combos = []
    for i in range(len(dkeys)):
        for j in range(i, len(dkeys)):
            for k_ in range(j, len(dkeys)):
                for l_ in range(k_, len(dkeys)):
                    dv1, dv2, dv3, dv4 = dkeys[i], dkeys[j], dkeys[k_], dkeys[l_]
                    new_cs = [cs_start[m] + dv1[m] + dv2[m] + dv3[m] + dv4[m] for m in range(4)]
                    if sum(x * x for x in new_cs) != 668:
                        continue
                    cls = class_of(new_cs)
                    if cls not in VALID:
                        continue
                    valid_combos.append((dv1, dv2, dv3, dv4, cls, new_cs))

    print(f"  4-delta combos: {len(valid_combos)}", flush=True)

    if not valid_combos:
        print("  no valid 4-combos")
        return

    # Compute total enumeration size
    total_size = 0
    for dv1, dv2, dv3, dv4, cls, new_cs in valid_combos:
        from collections import Counter
        cnt = Counter([dv1, dv2, dv3, dv4])
        size = 1
        for dv, c in cnt.items():
            n_g = len(delta_groups[dv])
            if n_g < c:
                size = 0; break
            from math import comb
            size *= comb(n_g, c)
        total_size += size
    print(f"  total combinations to test: {total_size}")

    t0 = time.time()
    bridges = []
    saved_count = 0
    best_per_class = {}
    tested_total = 0

    for combo_idx, (dv1, dv2, dv3, dv4, cls, new_cs) in enumerate(valid_combos):
        from collections import Counter
        cnt = Counter([dv1, dv2, dv3, dv4])
        cnt_list = sorted(cnt.items(), key=lambda x: -x[1])
        # Build iterator of all valid 4-position tuples
        if len(cnt_list) == 1:
            # All 4 same delta vector
            dv, c = cnt_list[0]
            iterator = itertools.combinations(delta_groups[dv], 4)
        elif len(cnt_list) == 2:
            (dv_a, c_a), (dv_b, c_b) = cnt_list
            iterator = (
                tuple(sorted(list(a) + list(b)))
                for a in itertools.combinations(delta_groups[dv_a], c_a)
                for b in itertools.combinations(delta_groups[dv_b], c_b)
            )
        elif len(cnt_list) == 3:
            (dv_a, c_a), (dv_b, c_b), (dv_c, c_c) = cnt_list
            iterator = (
                tuple(sorted(list(a) + list(b) + list(c)))
                for a in itertools.combinations(delta_groups[dv_a], c_a)
                for b in itertools.combinations(delta_groups[dv_b], c_b)
                for c in itertools.combinations(delta_groups[dv_c], c_c)
            )
        else:  # 4 different
            iterator = (
                tuple(sorted([a, b, c, d_]))
                for a in delta_groups[cnt_list[0][0]]
                for b in delta_groups[cnt_list[1][0]]
                for c in delta_groups[cnt_list[2][0]]
                for d_ in delta_groups[cnt_list[3][0]]
            )

        cnt_tested = 0
        best_e = 10**18
        best_pos = None
        for positions in iterator:
            if len(set(positions)) != 4:
                continue
            cnt_tested += 1
            tested_total += 1
            T_tmp = [tk.copy() for tk in T]
            for pos in positions:
                T_tmp[types[pos]][pos] = -T_tmp[types[pos]][pos]
            S_new = compute_S_from_Ts(T_tmp, n)
            E_new = int(np.dot(S_new[1:], S_new[1:]))
            if E_new < best_e:
                best_e = E_new
                best_pos = positions
            if E_new < E_start:
                bridges.append((E_new, positions, cls, new_cs))
                # Save immediately
                new_signs = list(signs)
                for p in positions:
                    new_signs[p] = -new_signs[p]
                out = {
                    'seed': d.get('seed', 0) + 400000 + saved_count,
                    'E': int(E_new),
                    'from_T': 1.0,
                    'types': list(types),
                    'signs': new_signs,
                    'source': f'4-flip bridge from {os.path.basename(fname)}',
                }
                src_tag = os.path.basename(fname).replace('h668_', '').replace('.json', '')
                out_name = f"h668_BR4_{cls[0]}_{cls[1]}_{cls[2]}_{cls[3]}_{src_tag}_{saved_count}.json"
                json.dump(out, open(out_name, 'w'))
                print(f"  ★ E={E_new} < {E_start}!  flips={positions}  saved {out_name}", flush=True)
                saved_count += 1
            if cnt_tested >= max_per_combo:
                break
        if cls not in best_per_class or best_e < best_per_class[cls][0]:
            best_per_class[cls] = (best_e, best_pos)
        elapsed = time.time() - t0
        rate = tested_total / elapsed if elapsed > 0 else 0
        print(f"  [{combo_idx+1}/{len(valid_combos)}] {cls}: tested {cnt_tested}/{max_per_combo}  best={best_e}  total_tested={tested_total}  rate={rate:.0f}/s", flush=True)

    print(f"\n  Total time: {time.time() - t0:.1f}s")
    print(f"  Total tested: {tested_total}")
    print(f"  Best per class:")
    for cls in sorted(best_per_class.keys(), key=lambda c: best_per_class[c][0]):
        E, pos = best_per_class[cls]
        marker = ' ★ BELOW ' + str(E_start) if E < E_start else ''
        print(f"    {cls}: E={E}  flips={pos}{marker}")
    print(f"  Bridges with E < {E_start}: {len(bridges)}")


if __name__ == '__main__':
    main()
