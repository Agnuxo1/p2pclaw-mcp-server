#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) GREEDY BRIDGE

For each low-E invalid checkpoint:
  1. Compute col_sums distance from each valid class
  2. Greedy: at each step, pick the SINGLE flip that minimizes
     (lambda * cs_distance² + E_naf), where lambda is large
  3. Continue until cs lands on a valid class
  4. Save the resulting valid state

This is essentially a controlled descent toward the valid manifold,
trading minimal NAF energy increase for col_sums correction.
"""
import sys, os, json, glob
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N
from hadamard_668_turyn_fast import compute_S_from_Ts

PATS = [(1,1,1,1),(1,1,-1,-1),(1,-1,1,-1),(1,-1,-1,1)]
VALID = {(1,1,15,21),(3,3,5,25),(3,7,13,21),(5,9,11,21),(7,13,15,15),
         (1,9,15,19),(3,3,11,23),(3,3,17,19),(3,7,9,23),(3,9,17,17)}


def cs_of(types, signs, n):
    return [sum(PATS[types[i]][k]*signs[i] for i in range(n)) for k in range(4)]


def class_of(cs):
    return tuple(sorted(abs(x) for x in cs))


def parseval(cs):
    return sum(x*x for x in cs)


def best_target_class(cs):
    """Find the closest valid class to current cs (sorted abs)."""
    abs_cs = sorted(abs(x) for x in cs)
    best = None
    best_d = 10**9
    for v in VALID:
        # Match each element to closest in target
        d = sum((abs_cs[i] - v[i])**2 for i in range(4))
        if d < best_d:
            best_d = d
            best = v
    return best, best_d


def signed_target(cs, abs_target):
    """Given current cs and abs target sorted, find permutation+signs that minimizes ||cs-target||²."""
    # Try all 4! * 2^4 = 384 combinations
    from itertools import permutations
    best = None
    best_d = 10**9
    for perm in permutations(range(4)):
        for s_mask in range(16):
            target = [0]*4
            for k in range(4):
                v = abs_target[perm[k]]
                if (s_mask >> k) & 1:
                    target[k] = -v
                else:
                    target[k] = v
            d = sum((cs[k] - target[k])**2 for k in range(4))
            if d < best_d:
                best_d = d
                best = target
    return best, best_d


def greedy_bridge(checkpoint_file, lam=100.0, max_steps=20):
    print(f"\n=== GREEDY BRIDGE {os.path.basename(checkpoint_file)} ===", flush=True)
    d = json.load(open(checkpoint_file))
    types = list(d['types'])
    signs = list(d['signs'])
    E_start = d['E']
    n = len(types)
    cs = cs_of(types, signs, n)
    cls = class_of(cs)
    if cls in VALID:
        print(f"  already valid: cls={cls}")
        return None

    # Pick best target class
    target_cls, _ = best_target_class(cs)
    target_signed, init_d = signed_target(cs, target_cls)
    print(f"  E_start={E_start}  cs={cs}  cls={cls}")
    print(f"  target cls={target_cls}  signed={target_signed}  dist²={init_d}")

    # Build T
    T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
    for i in range(n):
        T[types[i]][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E = int(np.dot(S[1:], S[1:]))

    def dist_to_target(cur_cs):
        return sum((cur_cs[k] - target_signed[k])**2 for k in range(4))

    cur_dist = dist_to_target(cs)
    flip_history = []

    for step in range(max_steps):
        # Find best flip: minimizes E + lam * dist²
        best_score = 10**18
        best_pos = -1
        best_dE = 0
        best_new_cs = None
        for pos in range(n):
            t = types[pos]; s = signs[pos]
            new_cs = list(cs)
            for k in range(4):
                new_cs[k] += -2*s*PATS[t][k]
            new_d = dist_to_target(new_cs)
            # Compute dE for sign flip
            v = T[t]
            old = int(v[pos])
            sc = -2 * old
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
            score = (E + dE) + lam * new_d
            if score < best_score:
                best_score = score
                best_pos = pos
                best_dE = dE
                best_new_cs = new_cs
                best_dNAF = dNAF

        if best_pos < 0:
            print("  no flip found")
            break

        # Apply
        T[types[best_pos]][best_pos] *= -1
        signs[best_pos] *= -1
        S = S + best_dNAF
        E += best_dE
        cs = best_new_cs
        cur_dist = dist_to_target(cs)
        cls = class_of(cs)
        on_manifold = (cls in VALID and parseval(cs) == 668)
        flip_history.append(best_pos)
        print(f"  step {step+1}: pos={best_pos}  dE={best_dE}  E={E}  dist²={cur_dist}  cls={cls}  valid={on_manifold}")

        if on_manifold:
            print(f"  ★ REACHED MANIFOLD: E={E}  cls={cls}  cs={cs}")
            return (E, types, signs, cls, cs)

    print(f"  giving up after {max_steps} steps, final E={E}")
    return None


def main():
    files = sorted(glob.glob('h668_*.json'))
    invalid_low = []
    for f in files:
        if 'BR' in os.path.basename(f) or 'TUN' in os.path.basename(f):
            continue
        try:
            d = json.load(open(f))
            E = d.get('E')
            if not isinstance(E, int) or E < 0 or E > 5000:
                continue
            t = d.get('types'); s = d.get('signs')
            if not t or not s: continue
            n = len(t)
            cs = cs_of(t, s, n)
            ps = parseval(cs)
            cls = class_of(cs)
            if ps == 668: continue
            invalid_low.append((E, f, cs, cls))
        except: pass
    invalid_low.sort()
    print(f"=== Greedy bridge from top 20 low-E invalid ===")

    saved = 0
    for E, f, cs, cls in invalid_low[:20]:
        result = greedy_bridge(f, lam=200.0, max_steps=15)
        if result:
            E_new, types_new, signs_new, cls_new, cs_new = result
            out = {
                'seed': 800000 + saved,
                'E': int(E_new),
                'from_T': 1.0,
                'types': list(types_new),
                'signs': list(signs_new),
                'source': f'greedy bridge from {os.path.basename(f)}',
            }
            src_tag = os.path.basename(f).replace('h668_','').replace('.json','')
            out_name = f"h668_GBR_{cls_new[0]}_{cls_new[1]}_{cls_new[2]}_{cls_new[3]}_{src_tag}.json"
            json.dump(out, open(out_name, 'w'))
            print(f"  saved -> {out_name}")
            saved += 1


if __name__ == '__main__':
    main()
