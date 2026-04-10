#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

H(668) CYCLOTOMIC ALGEBRAIC SEED

For q=167 (prime), generate Williamson-Turyn candidate sequences from
cyclotomic classes (quadratic residues, fourth-power residues, etc.).

These algebraic seeds are starting points for SA — they represent
structurally different basins than random seeds.

Constructions tried:
  1. Quadratic residue indicator pattern
  2. Legendre symbol (-/167) per position
  3. Difference set seeds (Singer, Paley)
  4. Random combinations of QR / NR with different signs
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


def quadratic_residues(p):
    """Set of quadratic residues mod p."""
    return set((x * x) % p for x in range(1, p))


def legendre(a, p):
    """Legendre symbol (a/p)."""
    if a % p == 0:
        return 0
    return 1 if a in quadratic_residues(p) else -1


def make_paley_seed(n, variant=0):
    """Generate Williamson-Turyn types and signs from Paley-like construction."""
    QR = quadratic_residues(n)
    types = [0] * n
    signs = [1] * n
    if variant == 0:
        # All positions, types alternate by Legendre symbol
        for i in range(n):
            if i == 0:
                types[i] = 0
                signs[i] = 1
            elif i in QR:
                types[i] = 0
                signs[i] = 1
            else:
                types[i] = 0
                signs[i] = -1
    elif variant == 1:
        # Type by parity, sign by Legendre
        for i in range(n):
            types[i] = i % 4
            signs[i] = 1 if (i == 0 or i in QR) else -1
    elif variant == 2:
        # Type by Legendre, sign random-like
        for i in range(n):
            if i == 0:
                types[i] = 0; signs[i] = 1
            elif i in QR:
                types[i] = 1; signs[i] = 1
            else:
                types[i] = 2; signs[i] = -1
    elif variant == 3:
        # Type by index mod 4, sign by Jacobi
        for i in range(n):
            types[i] = (i + 1) % 4
            signs[i] = legendre(i + 1, n) if i > 0 else 1
            if signs[i] == 0:
                signs[i] = 1
    elif variant == 4:
        # All type 0 (Williamson direct), sign by QR pattern with alternation
        for i in range(n):
            types[i] = 0
            if i == 0:
                signs[i] = 1
            elif i in QR:
                signs[i] = (-1) ** (i % 3)
            else:
                signs[i] = (-1) ** ((i + 1) % 3)
    return types, signs


def main():
    n = 167
    print(f"=== CYCLOTOMIC SEED for q={n} ===", flush=True)
    QR = quadratic_residues(n)
    print(f"  |QR| = {len(QR)} (expect {(n-1)//2})")

    seeds = []
    for variant in range(5):
        types, signs = make_paley_seed(n, variant)
        T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
        for i in range(n):
            T[types[i]][i] = signs[i]
        S = compute_S_from_Ts(T, n)
        E = int(np.dot(S[1:], S[1:]))
        cs = cs_of(types, signs, n)
        cls = class_of(cs)
        ps = sum(x*x for x in cs)
        valid = cls in VALID and ps == 668
        print(f"  variant {variant}: E={E}  cs={cs}  cls={cls}  P={ps}  valid={valid}")
        seeds.append((variant, types, signs, E, cls))

    # Generate randomized variants on top of best seed
    seeds_all = list(seeds)
    rng = random.Random(98765)
    for k in range(20):
        variant = rng.randrange(5)
        types, signs = make_paley_seed(n, variant)
        # Random perturbation: flip K random signs and K random types
        K = rng.randint(5, 20)
        for _ in range(K):
            i = rng.randrange(n)
            signs[i] = -signs[i]
        for _ in range(K):
            i = rng.randrange(n)
            types[i] = rng.randrange(4)
        T = [np.zeros(n, dtype=np.int64) for _ in range(4)]
        for i in range(n):
            T[types[i]][i] = signs[i]
        S = compute_S_from_Ts(T, n)
        E = int(np.dot(S[1:], S[1:]))
        cs = cs_of(types, signs, n)
        cls = class_of(cs)
        ps = sum(x*x for x in cs)
        valid = cls in VALID and ps == 668
        if E < 5000:
            seeds_all.append((100 + k, types, signs, E, cls))
            tag = ' VALID' if valid else ''
            print(f"  rand {k} (var={variant} K={K}): E={E}  cls={cls}  P={ps}{tag}")

    # Save the lowest-E seeds for SA bootstrap
    seeds_all.sort(key=lambda x: x[3])
    for idx, (vid, types, signs, E, cls) in enumerate(seeds_all[:5]):
        out = {
            'seed': 95000 + vid,
            'E': int(E),
            'from_T': 1.0,
            'types': list(types),
            'signs': list(signs),
            'source': f'cyclotomic seed variant {vid}',
        }
        json.dump(out, open(f'h668_CYCLO_var{vid}_E{E}.json', 'w'))
        print(f"  saved h668_CYCLO_var{vid}_E{E}.json")


if __name__ == '__main__':
    main()
