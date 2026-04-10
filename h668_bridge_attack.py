#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) BRIDGE ATTACK

Strategy: Many invalid (Parseval ≠ 668) NAF-energy local minima exist
BELOW the current valid champion E=260. Attempt to bridge them to a
valid class via small (k=1..3) sign flips, accepting higher NAF cost
in exchange for landing on a valid Parseval-668 manifold class.

This explores whether the global H(668) basin is connected to one of
the cheap invalid basins by short flip paths.
"""
import sys, os, json, glob, time
import numpy as np

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


def types_signs_to_T(types, signs, n):
    T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
    for i in range(n):
        T[types[i]][i] = signs[i]
    return T


def compute_E(T, n):
    S = compute_S_from_Ts(T, n)
    return int(np.dot(S[1:], S[1:]))


def col_sums_from_ts(types, signs, n):
    cs = [0, 0, 0, 0]
    for i in range(n):
        p = PATS[types[i]]
        s = signs[i]
        for k in range(4):
            cs[k] += p[k] * s
    return cs


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def attempt_bridge(checkpoint_file, max_k=3, max_log=20):
    print(f"\n=== BRIDGE FROM {os.path.basename(checkpoint_file)} ===", flush=True)
    d = json.load(open(checkpoint_file))
    types = list(d['types'])
    signs = list(d['signs'])
    E_start = d['E']
    n = len(types)
    cs_start = col_sums_from_ts(types, signs, n)
    cls_start = class_of(cs_start)
    parseval = sum(x*x for x in cs_start)
    print(f"  E_start={E_start}  cs={cs_start}  parseval={parseval}  class={cls_start}  valid={cls_start in VALID}")

    T = types_signs_to_T(types, signs, n)
    S0 = compute_S_from_Ts(T, n)
    E_check = int(np.dot(S0[1:], S0[1:]))
    if E_check != E_start:
        print(f"  WARNING: stored E={E_start} but computed E={E_check}")
        E_start = E_check

    # Single sign-flip enumeration: for each position, compute new (cs, E)
    # Δcol = -2·s·pat[t]
    best_per_class = {}  # class -> (E, list_of_flips)
    found = []

    def class_check(new_cs):
        cls = class_of(new_cs)
        return cls in VALID

    # Pre-compute single-flip ΔE and Δcs (for re-use in 2/3-flip search)
    # Use the proper fast delta from manifold module
    def single_flip_dE(T_k_idx, pos, S):
        """ΔE for flipping the (single nonzero) value at position `pos` of T[T_k_idx]."""
        v = T[T_k_idx]
        old = int(v[pos])
        sc = -2 * old
        # naf_point_delta_vec
        v64 = v.astype(np.int64)
        left = np.zeros(n, dtype=np.int64)
        right = np.zeros(n, dtype=np.int64)
        if pos > 0:
            left[1:pos+1] = v64[pos-1::-1]
        if pos < n - 1:
            right[1:n-pos] = v64[pos+1:]
        dNAF = np.zeros(n, dtype=np.int64)
        dNAF[1:] = sc * (left[1:] + right[1:])
        dE = int(np.dot(2*S[1:] + dNAF[1:], dNAF[1:]))
        return dE, dNAF

    # Single-flip enumeration
    print("  --- 1-flip bridges ---", flush=True)
    one_flip = []
    for pos in range(n):
        t = types[pos]
        s = signs[pos]
        # New cs after this flip
        new_cs = list(cs_start)
        for k in range(4):
            new_cs[k] += -2 * s * PATS[t][k]
        dE, _ = single_flip_dE(t, pos, S0)
        one_flip.append((pos, t, s, new_cs, dE))
        if class_check(new_cs):
            found.append((1, [pos], new_cs, E_start + dE))

    found.sort(key=lambda x: x[-1])
    print(f"  1-flip valid bridges: {len(found)}")
    for k, p, c, e in found[:5]:
        print(f"    flips={p}  cs={c}  E={e}")

    if max_k >= 2:
        # 2-flip enumeration: O(n²) = 27889 — fast
        print("  --- 2-flip bridges ---", flush=True)
        # Apply first flip then compute second
        # For efficiency: precompute apply each flip individually then attempt second
        # This is O(n²) full E recomputation (~28k * 167 ops). Use S+dNAF tracking.
        cnt2 = 0
        # Precompute dNAF for each pos (so we don't recompute each pos from scratch)
        dNAF_by_pos = []
        for pos in range(n):
            v = T[types[pos]]
            old = int(v[pos])
            sc = -2 * old
            v64 = v.astype(np.int64)
            left = np.zeros(n, dtype=np.int64)
            right = np.zeros(n, dtype=np.int64)
            if pos > 0:
                left[1:pos+1] = v64[pos-1::-1]
            if pos < n - 1:
                right[1:n-pos] = v64[pos+1:]
            dN = np.zeros(n, dtype=np.int64)
            dN[1:] = sc * (left[1:] + right[1:])
            dNAF_by_pos.append(dN)

        bridges_2 = []
        for i in range(n):
            for j in range(i+1, n):
                # Compute combined Δcs
                new_cs = list(cs_start)
                for k in range(4):
                    new_cs[k] += -2*signs[i]*PATS[types[i]][k] - 2*signs[j]*PATS[types[j]][k]
                if not class_check(new_cs):
                    continue
                # Combined ΔE: must account for second flip seeing first flip's effect
                # If positions are different, dNAF_total = dN_i + dN_j
                # ΔE = ((S+dN_i+dN_j)·(S+dN_i+dN_j)) - S·S
                #    = 2·S·(dN_i+dN_j) + (dN_i+dN_j)·(dN_i+dN_j)
                # But this assumes BOTH dNAFs computed from ORIGINAL S (T's) — which is true if i,j are in different T_k OR same T_k but second computed on already-flipped state.
                # For SAME T_k, the dNAF for flip j depends on whether i was already flipped (changes pair (i,j) contribution).
                # SIMPLE CASE: types[i] != types[j] → dNAFs independent → can use dN_i + dN_j
                # SAME types and same column: need correction at lag |i-j|
                if types[i] != types[j]:
                    dN = dNAF_by_pos[i] + dNAF_by_pos[j]
                    dE = int(np.dot(2*S0[1:] + dN[1:], dN[1:]))
                else:
                    # Same T_k. Compute exact via temporary apply.
                    T_tmp = [tk.copy() for tk in T]
                    T_tmp[types[i]][i] = -T_tmp[types[i]][i]
                    T_tmp[types[j]][j] = -T_tmp[types[j]][j]
                    S_new = compute_S_from_Ts(T_tmp, n)
                    dE = int(np.dot(S_new[1:], S_new[1:])) - E_start
                E_new = E_start + dE
                bridges_2.append((E_new, [i, j], new_cs, class_of(new_cs)))
                cnt2 += 1
        bridges_2.sort()
        print(f"  2-flip valid bridges found: {cnt2}")
        for E_new, p, c, cls in bridges_2[:10]:
            print(f"    flips={p}  cs={c}  cls={cls}  E={E_new}")
        for b in bridges_2:
            found.append((2, b[1], b[2], b[0]))

    found.sort(key=lambda x: x[-1])
    print(f"\n  TOP {min(15, len(found))} bridges from this checkpoint:")
    for k, p, c, e in found[:15]:
        print(f"    k={k}  flips={p}  cs={c}  cls={class_of(c)}  E={e}")

    # Save the best 5 bridges per source as new SA starting points
    saved = 0
    seen_files = set()
    for k, flip_positions, c, e_new in found[:5]:
        new_types = list(types)
        new_signs = list(signs)
        for pos in flip_positions:
            new_signs[pos] = -new_signs[pos]
        cls = class_of(c)
        out = {
            'seed': d.get('seed', 0) + 100000 + saved,
            'E': int(e_new),
            'from_T': float(d.get('from_T', 1.0)),
            'types': new_types,
            'signs': new_signs,
            'source': f"bridge from {os.path.basename(checkpoint_file)} via {k} flips",
        }
        src_tag = os.path.basename(checkpoint_file).replace('h668_','').replace('.json','')
        out_name = f"h668_BR_{cls[0]}_{cls[1]}_{cls[2]}_{cls[3]}_{src_tag}_{saved}.json"
        if out_name in seen_files:
            continue
        seen_files.add(out_name)
        with open(out_name, 'w') as fh:
            json.dump(out, fh)
        print(f"  saved -> {out_name}")
        saved += 1
    return found[:5]


def main():
    # Find low-E invalid checkpoints
    files = glob.glob('h668_*.json')
    candidates = []
    for f in files:
        try:
            d = json.load(open(f))
            E = d.get('E')
            if not isinstance(E, int):
                continue
            if E < 0 or E > 5000:
                continue
            types = d.get('types')
            signs = d.get('signs')
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
    print(f"=== TOP 30 LOW-E CHECKPOINTS ===")
    for E, f, cls, v, ps in candidates[:30]:
        flag = "VALID" if v else f"P={ps}"
        print(f"  E={E}  {flag}  cls={cls}  {os.path.basename(f)}")

    # Try bridge from top 10 invalid (lowest E)
    print(f"\n=== ATTEMPTING BRIDGES (k≤2) ===")
    targets = [c for c in candidates if not c[3]][:10]
    all_bridges = []
    for E, f, cls, _, ps in targets:
        bridges = attempt_bridge(f, max_k=2)
        for b in bridges:
            all_bridges.append((b, f))

    # Final summary
    print(f"\n=== ALL BRIDGES TOP 20 ===")
    all_bridges.sort(key=lambda x: x[0][-1])
    for b, src in all_bridges[:20]:
        k, p, c, e = b
        print(f"  E={e}  k={k}  src={os.path.basename(src)}  cs={c}  cls={class_of(c)}")


if __name__ == '__main__':
    main()
