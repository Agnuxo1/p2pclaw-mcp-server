#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Spectral-guided SA
==========================================

Spectral observation: PAF_v(d) is the inverse DFT of |DFT(v)|² at lag d.
Therefore:
    Σ_k PAF_k(d) = 0 ∀ d ≠ 0   ⟺   Σ_k |DFT(v_k)|² = 4n at every frequency
                                     (i.e., Σ_k |V_k[ω]|² = constant = 4n ∀ω)

This is a spectral flatness / Parseval condition. The 4 ±1 vectors must have
complementary power spectra. E = Σ_d S(d)² = Σ_ω (Σ_k |V_k[ω]|² − 4n)²/n
is equivalent by Parseval (up to the 1/n factor).

Strategy:
  1. Initialise 4 random ±1 vecs
  2. At each iter, identify the frequency ω* with maximum deviation from 4n
  3. Choose the (k, j) flip that maximally reduces |sum_k |V_k[ω*]|² − 4n|
  4. Combine with classical SA acceptance for global moves

Equivalent formulation works directly on S but with spectrally-aware proposals.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import (
    N, compute_paf_sums, energy_from_S,
    build_hadamard, verify_hadamard, export_hadamard,
)
from hadamard_668_nonpalindrome import random_vec, single_flip_delta


def spectral_energy(vecs):
    """Σ_ω (Σ_k |DFT(v_k)[ω]|² − 4n)² — should equal n · E up to correction."""
    n = len(vecs[0])
    spec = np.zeros(n)
    for v in vecs:
        V = np.fft.fft(v.astype(np.float64))
        spec += np.abs(V) ** 2
    # At ω = 0, Σ_k |V_k[0]|² = (Σ v_k)² summed, not 4n — exclude ω=0
    return float(np.sum((spec[1:] - 4 * n) ** 2))


def spectral_init(n, seed, max_tries=200):
    """Initialise 4 ±1 vectors with minimal spectral flatness deviation."""
    rng = np.random.default_rng(seed)
    best = None
    best_E = 10 ** 18
    for _ in range(max_tries):
        vecs = [rng.choice([-1, 1], size=n).astype(np.int8) for _ in range(4)]
        S = compute_paf_sums(vecs)
        E = energy_from_S(S)
        if E < best_E:
            best_E = E
            best = vecs
    return best, best_E


def spectral_sa(seed=1101, max_time=1800, T0=300.0, alpha=0.999995,
                 restart_stale=1000000, init_tries=500,
                 save_prefix='h668_spec'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    print(f"SPEC seed={seed} init_tries={init_tries}", flush=True)
    vecs, E = spectral_init(n, seed, max_tries=init_tries)
    S = compute_paf_sums(vecs)
    print(f"  spectral init E={E} (best of {init_tries} trials)", flush=True)

    best = E
    best_vecs = [v.copy() for v in vecs]

    T = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0

    last_log = t0
    while time.time() - t0 < max_time:
        it += 1
        k = int(rng.integers(4))
        j = int(rng.integers(n))
        dPAF, dE = single_flip_delta(S, vecs[k], j, n)
        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            vecs[k][j] = -vecs[k][j]
            S += dPAF
            E += dE

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
        T *= alpha

        if it % 500000 == 499999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        if stale >= restart_stale:
            restarts += 1
            # Restore from best, perturb
            vecs = [v.copy() for v in best_vecs]
            for _ in range(30):
                k2 = int(rng.integers(4))
                j2 = int(rng.integers(n))
                vecs[k2][j2] = -vecs[k2][j2]
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T = T0 * (0.5 ** (restarts % 4))
            stale = 0
            print(f"  [RESTART #{restarts} it={it}] best={best} E={E} T={T:.1f}", flush=True)

        now = time.time()
        if now - last_log > 10.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T:.2f} stale={stale} r={restarts}", flush=True)
            last_log = now

    dt = time.time() - t0
    print(f"TIMEOUT seed={seed} best={best} ({dt:.0f}s)", flush=True)
    return best_vecs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1101)
    ap.add_argument('--max_time', type=int, default=1800)
    ap.add_argument('--T0', type=float, default=300.0)
    ap.add_argument('--alpha', type=float, default=0.999995)
    ap.add_argument('--init_tries', type=int, default=500)
    ap.add_argument('--prefix', type=str, default='h668_spec')
    args = ap.parse_args()
    spectral_sa(seed=args.seed, max_time=args.max_time, T0=args.T0, alpha=args.alpha,
                 init_tries=args.init_tries, save_prefix=args.prefix)
