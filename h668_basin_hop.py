#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) BASIN HOPPING

Strategy: Force LLLL out of its E=260 basin by accepting +12 moves
on the 2-swap manifold (the smallest barrier known), perform K such
uphill moves, then descend back. Repeat from many starting kicks.

Key idea: 2-swap min dE = +12 means there ARE moves climbing exactly
+12 from LLLL. By chaining several +12 moves, we walk to E=260+12K
on the manifold, then descend from there. If the descent finds
DIFFERENT minimum than LLLL, we've discovered a new basin.
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


def two_swap_dE(T, S, types, signs, i, j, n):
    """Compute dE for swapping signs at positions i and j (col-sum preserving if same delta_v)."""
    # 2-swap = flip i and flip j simultaneously
    # If different types: independent dNAFs
    # If same type: need exact recompute
    if types[i] == types[j]:
        T_tmp = [tk.copy() for tk in T]
        T_tmp[types[i]][i] *= -1
        T_tmp[types[j]][j] *= -1
        S_new = compute_S_from_Ts(T_tmp, n)
        return int(np.dot(S_new[1:], S_new[1:])) - int(np.dot(S[1:], S[1:])), S_new
    else:
        v_i = T[types[i]]
        sc_i = -2 * int(v_i[i])
        v_i64 = v_i.astype(np.int64)
        left_i = np.zeros(n, dtype=np.int64)
        right_i = np.zeros(n, dtype=np.int64)
        if i > 0: left_i[1:i+1] = v_i64[i-1::-1]
        if i < n-1: right_i[1:n-i] = v_i64[i+1:]
        dN_i = np.zeros(n, dtype=np.int64)
        dN_i[1:] = sc_i * (left_i[1:] + right_i[1:])
        v_j = T[types[j]]
        sc_j = -2 * int(v_j[j])
        v_j64 = v_j.astype(np.int64)
        left_j = np.zeros(n, dtype=np.int64)
        right_j = np.zeros(n, dtype=np.int64)
        if j > 0: left_j[1:j+1] = v_j64[j-1::-1]
        if j < n-1: right_j[1:n-j] = v_j64[j+1:]
        dN_j = np.zeros(n, dtype=np.int64)
        dN_j[1:] = sc_j * (left_j[1:] + right_j[1:])
        dN = dN_i + dN_j
        dE = int(np.dot(2 * S[1:] + dN[1:], dN[1:]))
        S_new = S + dN
        return dE, S_new


def descend_2swap(T, S, types, signs, n, max_steps=1000):
    """Greedy 2-swap descent. Returns (E_new, T_new, S_new, steps)."""
    E = int(np.dot(S[1:], S[1:]))
    steps = 0
    while steps < max_steps:
        best_dE = 0
        best_pair = None
        best_S_new = None
        for i in range(n):
            for j in range(i+1, n):
                # Only 2-swaps that preserve col_sums (i.e., signs[i]*p[t_i] + signs[j]*p[t_j] = 0)
                # Equivalently: -2*signs[i]*p[t_i] = +2*signs[j]*p[t_j]
                # Equivalently: signs[i]*p[t_i] = -signs[j]*p[t_j]
                same_pat = True
                for k in range(4):
                    if signs[i]*PATS[types[i]][k] != -signs[j]*PATS[types[j]][k]:
                        same_pat = False
                        break
                if not same_pat:
                    continue
                dE, S_new = two_swap_dE(T, S, types, signs, i, j, n)
                if dE < best_dE:
                    best_dE = dE
                    best_pair = (i, j)
                    best_S_new = S_new
        if best_pair is None:
            break
        i, j = best_pair
        T[types[i]][i] *= -1
        T[types[j]][j] *= -1
        signs[i] *= -1
        signs[j] *= -1
        S = best_S_new
        E += best_dE
        steps += 1
    return E, T, S, steps


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'h668_LLLL_seed92001.json'
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 60001
    n_climbs = int(sys.argv[3]) if len(sys.argv) > 3 else 3  # uphill steps to take
    max_trials = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    rng = random.Random(seed)

    print(f"=== BASIN HOP src={src}  seed={seed}  climbs={n_climbs} ===", flush=True)
    d = json.load(open(src))
    types_orig = list(d['types'])
    signs_orig = list(d['signs'])
    E_start = d['E']
    n = len(types_orig)
    cs_orig = cs_of(types_orig, signs_orig, n)
    cls_orig = class_of(cs_orig)
    print(f"  E_start={E_start}  cs={cs_orig}  cls={cls_orig}")

    saved = 0
    best = E_start
    t0 = time.time()

    for trial in range(max_trials):
        types = list(types_orig)
        signs = list(signs_orig)
        T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
        for i in range(n):
            T[types[i]][i] = signs[i]
        S = compute_S_from_Ts(T, n)
        E = int(np.dot(S[1:], S[1:]))

        # Phase 1: Climb 'n_climbs' uphill 2-swap moves (col-sum preserving)
        climb_history = []
        for climb in range(n_climbs):
            # Find ALL feasible 2-swap moves and their dEs
            candidates = []
            for i in range(n):
                for j in range(i+1, n):
                    same_pat = True
                    for k in range(4):
                        if signs[i]*PATS[types[i]][k] != -signs[j]*PATS[types[j]][k]:
                            same_pat = False
                            break
                    if not same_pat:
                        continue
                    dE, S_new = two_swap_dE(T, S, types, signs, i, j, n)
                    if dE > 0:  # uphill only (so we don't immediately descend)
                        candidates.append((dE, i, j, S_new))
            if not candidates:
                break
            # Pick a SMALL uphill move randomly from the lowest-dE ones
            candidates.sort()
            top_pool = [c for c in candidates if c[0] <= candidates[0][0] + 24]
            dE, i, j, S_new = rng.choice(top_pool)
            T[types[i]][i] *= -1
            T[types[j]][j] *= -1
            signs[i] *= -1
            signs[j] *= -1
            S = S_new
            E += dE
            climb_history.append((i, j, dE))

        # Phase 2: Descend back via 2-swap
        E_after_climb = E
        E_after_descend, T, S, steps = descend_2swap(T, S, types, signs, n, max_steps=200)
        cs = cs_of(types, signs, n)
        cls = class_of(cs)
        valid = cls in VALID and sum(x*x for x in cs) == 668

        marker = ''
        if E_after_descend < best:
            best = E_after_descend
            marker = ' ★ BEST'
            if E_after_descend < E_start:
                marker = ' ★★★ BELOW START!'
                # Save
                out = {
                    'seed': seed + 7000 + saved,
                    'E': int(E_after_descend),
                    'from_T': 1.0,
                    'types': list(types),
                    'signs': list(signs),
                    'source': f'basin hop from {os.path.basename(src)} climb={n_climbs} desc={steps}',
                }
                src_tag = os.path.basename(src).replace('h668_', '').replace('.json', '')
                out_name = f"h668_BHOP_{cls[0]}_{cls[1]}_{cls[2]}_{cls[3]}_{src_tag}_{saved}.json"
                json.dump(out, open(out_name, 'w'))
                print(f"  saved {out_name}", flush=True)
                saved += 1

        if trial % 5 == 0 or marker:
            print(f"  [{trial}] climb {n_climbs}→{E_after_climb} desc {steps}→{E_after_descend} cls={cls} valid={valid}{marker}", flush=True)
        if time.time() - t0 > 1200:
            break

    print(f"\n  Best E achieved: {best} (start was {E_start})  saved={saved}")


if __name__ == '__main__':
    main()
