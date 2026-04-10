#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) KICK + DESCEND + RETURN

Strategy to break out of LLLL E=260 local minimum:
  1. Apply ONE sign flip from LLLL → invalid state (parseval ≠ 668)
  2. In invalid space, do greedy single-flip descent (LOOSER constraints)
  3. From new (potentially much lower E) invalid state, find ONE flip
     that returns to a valid Parseval-668 class
  4. If returned E < 260, save

Key insight: invalid space might have many lower-E states reachable from
LLLL by simple paths. The bridges may exist but require visiting invalid.
"""
import sys, os, json, time, random
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


def single_flip_dNAF(T, types, pos, n):
    t = types[pos]
    v = T[t]
    sc = -2 * int(v[pos])
    v64 = v.astype(np.int64)
    left = np.zeros(n, dtype=np.int64)
    right = np.zeros(n, dtype=np.int64)
    if pos > 0:
        left[1:pos+1] = v64[pos-1::-1]
    if pos < n - 1:
        right[1:n-pos] = v64[pos+1:]
    dNAF = np.zeros(n, dtype=np.int64)
    dNAF[1:] = sc * (left[1:] + right[1:])
    return dNAF


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'h668_LLLL_seed92001.json'
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 30001
    max_kicks = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    max_descend_steps = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    rng = random.Random(seed)

    print(f"=== KICK+DESCEND+RETURN  src={src}  seed={seed} ===", flush=True)
    d = json.load(open(src))
    types_orig = list(d['types'])
    signs_orig = list(d['signs'])
    E_start = d['E']
    n = len(types_orig)
    cs_orig = cs_of(types_orig, signs_orig, n)
    cls_orig = class_of(cs_orig)
    print(f"  E_start={E_start}  cs={cs_orig}  cls={cls_orig}")

    saved = 0
    best_returned = E_start
    t0 = time.time()

    for trial in range(max_kicks):
        types = list(types_orig)
        signs = list(signs_orig)
        T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
        for i in range(n):
            T[types[i]][i] = signs[i]
        S = compute_S_from_Ts(T, n)
        E = int(np.dot(S[1:], S[1:]))
        cs = list(cs_orig)

        # KICK: pick a random position to flip
        kick_pos = rng.randrange(n)
        dNAF = single_flip_dNAF(T, types, kick_pos, n)
        dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
        T[types[kick_pos]][kick_pos] *= -1
        signs[kick_pos] *= -1
        S = S + dNAF
        E = E + dE
        for k in range(4):
            cs[k] += -2 * signs[kick_pos] * (-1) * PATS[types[kick_pos]][k]  # signs already flipped, so -1*-1
        # Recompute cs cleanly
        cs = cs_of(types, signs, n)

        # DESCEND in invalid space (we know cls is now invalid)
        descent_history = []
        for step in range(max_descend_steps):
            # Find best single flip that decreases E
            best_dE = 0
            best_pos = -1
            best_dNAF = None
            for pos in range(n):
                t = types[pos]
                v = T[t]
                sc = -2 * int(v[pos])
                v64 = v.astype(np.int64)
                left = np.zeros(n, dtype=np.int64)
                right = np.zeros(n, dtype=np.int64)
                if pos > 0:
                    left[1:pos+1] = v64[pos-1::-1]
                if pos < n - 1:
                    right[1:n-pos] = v64[pos+1:]
                dN = np.zeros(n, dtype=np.int64)
                dN[1:] = sc * (left[1:] + right[1:])
                dE = int(np.dot(2 * S[1:] + dN[1:], dN[1:]))
                if dE < best_dE:
                    best_dE = dE
                    best_pos = pos
                    best_dNAF = dN
            if best_pos < 0:
                break  # local minimum in invalid space
            # Apply best flip
            T[types[best_pos]][best_pos] *= -1
            signs[best_pos] *= -1
            S = S + best_dNAF
            E += best_dE
            cs = cs_of(types, signs, n)
            descent_history.append(best_pos)

        # RETURN: find single flip that lands on valid Parseval-668 class with E < target
        return_candidates = []
        for pos in range(n):
            t = types[pos]
            new_cs = list(cs)
            for k in range(4):
                new_cs[k] += -2 * signs[pos] * PATS[t][k]
            if class_of(new_cs) not in VALID or sum(x*x for x in new_cs) != 668:
                continue
            # Compute dE for this flip
            v = T[t]
            sc = -2 * int(v[pos])
            v64 = v.astype(np.int64)
            left = np.zeros(n, dtype=np.int64)
            right = np.zeros(n, dtype=np.int64)
            if pos > 0:
                left[1:pos+1] = v64[pos-1::-1]
            if pos < n - 1:
                right[1:n-pos] = v64[pos+1:]
            dN = np.zeros(n, dtype=np.int64)
            dN[1:] = sc * (left[1:] + right[1:])
            dE = int(np.dot(2 * S[1:] + dN[1:], dN[1:]))
            E_new = E + dE
            return_candidates.append((E_new, pos, new_cs, class_of(new_cs)))
        return_candidates.sort()

        if return_candidates:
            E_best, pos_best, cs_best, cls_best = return_candidates[0]
            if E_best < best_returned:
                best_returned = E_best
                tag = ' ★ NEW BEST'
                if E_best < E_start:
                    tag = ' ★★ BELOW START!'
                    # Save
                    new_signs = list(signs)
                    new_signs[pos_best] *= -1
                    out = {
                        'seed': seed + 5000 + saved,
                        'E': int(E_best),
                        'from_T': 1.0,
                        'types': list(types),
                        'signs': new_signs,
                        'source': f'kick+descend+return from {os.path.basename(src)} kick={kick_pos} descent_steps={len(descent_history)}',
                    }
                    src_tag = os.path.basename(src).replace('h668_', '').replace('.json', '')
                    out_name = f"h668_KDR_{cls_best[0]}_{cls_best[1]}_{cls_best[2]}_{cls_best[3]}_{src_tag}_{saved}.json"
                    json.dump(out, open(out_name, 'w'))
                    print(f"  [{trial}] kick={kick_pos} desc={len(descent_history)} → invE={E} → ret E={E_best}{tag}  saved {out_name}", flush=True)
                    saved += 1
                else:
                    print(f"  [{trial}] kick={kick_pos} desc={len(descent_history)} → invE={E} → ret E={E_best}{tag}", flush=True)
            elif trial % 10 == 0:
                print(f"  [{trial}] kick={kick_pos} desc={len(descent_history)} → invE={E} → ret E={E_best} (best={best_returned})", flush=True)

        if time.time() - t0 > 900:
            break

    print(f"\n  Done. Best returned E: {best_returned} (start was {E_start})  saved={saved}")


if __name__ == '__main__':
    main()
