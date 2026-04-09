#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — Hadamard Matrix of Order 668 (Williamson-type attack)
===================================================================

668 = 4 · 167, with 167 prime and 167 ≡ 3 (mod 4).

Approach A — Williamson-type: find 4 symmetric circulant matrices A, B, C, D
  of order n = 167 with entries in {±1} satisfying
    A² + B² + C² + D² = 4·167·I
  and pairwise commutation. Then H = [[A,B,C,D],[-B,A,-D,C],[-C,D,A,-B],[-D,-C,B,A]]
  is Hadamard of order 4n = 668.

Approach B — Turyn T-sequences: four ±1 sequences T₁..T₄ of length 167 with
  N_{T_i}(s) pairwise sum equal to 4·167·δ_{s,0}.

Approach C — Goethals–Seidel arrays with 4 suitable supplementary difference
  sets on Z_167.

All three reduce to autocorrelation-cancellation constraints on difference sets
inside Z_167. The primal attack is Williamson-SA.

Runtime: best-first simulated annealing with Parseval-guided moves.
"""
import sys
sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import numpy as np
import random, time

N = 167  # target block size
ORDER = 4 * N  # = 668


def williamson_energy(A, B, C, D):
    """||A² + B² + C² + D² − 4·167·I||_F² via periodic autocorrelation sums.

    For symmetric circulant matrices with first-row vectors a, b, c, d (all ∈ {±1}^n),
    the constraint A² + B² + C² + D² = 4n·I is equivalent to

        PAF_a(s) + PAF_b(s) + PAF_c(s) + PAF_d(s) = 0   ∀ s ≠ 0

    where PAF_v(s) = Σ_i v_i · v_{(i+s) mod n} is the periodic autocorrelation.

    We return the L2 energy of the residual.
    """
    n = len(A)
    # Use FFT for O(n log n) autocorrelation
    def paf(v):
        V = np.fft.fft(v.astype(np.float64))
        return np.round(np.real(np.fft.ifft(V * np.conj(V)))).astype(np.int64)

    s = paf(A) + paf(B) + paf(C) + paf(D)
    # s[0] = 4n should be exact (each PAF at 0 = n)
    # For s ≠ 0 all entries should be 0
    return int(np.sum(s[1:] ** 2))


def random_palindrome(n, rng):
    """Palindromic ±1 vector of odd length n: v[i] = v[n-i mod n].
    Free bits: v[0] and v[1..half], total 1 + (n-1)/2."""
    assert n % 2 == 1
    v = np.zeros(n, dtype=np.int8)
    v[0] = 1 if rng.random() < 0.5 else -1
    half = (n - 1) // 2
    for i in range(1, half + 1):
        val = 1 if rng.random() < 0.5 else -1
        v[i] = val
        v[n - i] = val
    return v


def palindrome_flip(v, rng):
    """Flip a random bit pair (i, n-i) to keep palindrome. i=0 is a single flip."""
    n = len(v)
    half = (n - 1) // 2
    i = rng.randrange(0, half + 1)
    v[i] *= -1
    if i != 0:
        v[n - i] *= -1
    return i  # return index so we can undo


def palindrome_unflip(v, i):
    n = len(v)
    v[i] *= -1
    if i != 0:
        v[n - i] *= -1


def williamson_sa(n, n_iter=1_000_000, T0=100.0, seed=0, log_interval=50_000):
    rng = random.Random(seed)
    vecs = [random_palindrome(n, rng) for _ in range(4)]

    E = williamson_energy(*vecs)
    best = E
    best_vecs = [v.copy() for v in vecs]

    T = T0
    alpha = (0.001 / T0) ** (1.0 / n_iter)

    t0 = time.time()
    stale = 0
    for it in range(n_iter):
        # Palindromic flip (keeps symmetric circulant structure)
        k = rng.randrange(4)
        i = palindrome_flip(vecs[k], rng)
        E_new = williamson_energy(*vecs)
        dE = E_new - E

        if dE <= 0 or rng.random() < np.exp(-dE / max(T, 1e-9)):
            E = E_new
            if E < best:
                best = E
                best_vecs = [v.copy() for v in vecs]
                stale = 0
                if E == 0:
                    return best_vecs, 0
            else:
                stale += 1
        else:
            palindrome_unflip(vecs[k], i)
            stale += 1

        T *= alpha

        # Restart temperature if stuck
        if stale > 100_000 and T < 1.0:
            T = T0 * 0.3
            stale = 0

        if (it + 1) % log_interval == 0:
            dt = time.time() - t0
            print(f"  it={it+1} E={E} best={best} T={T:.3f} ({dt:.1f}s)", flush=True)

    return best_vecs, best


def build_hadamard(A, B, C, D):
    """Build 4n x 4n Hadamard matrix from Williamson quadruple."""
    from scipy.linalg import circulant
    Am = circulant(A)
    Bm = circulant(B)
    Cm = circulant(C)
    Dm = circulant(D)
    top = np.hstack([Am, Bm, Cm, Dm])
    r2 = np.hstack([-Bm, Am, -Dm, Cm])
    r3 = np.hstack([-Cm, Dm, Am, -Bm])
    r4 = np.hstack([-Dm, -Cm, Bm, Am])
    return np.vstack([top, r2, r3, r4])


def verify_hadamard(H):
    n = H.shape[0]
    if H.shape != (n, n): return False
    if not np.all(np.abs(H) == 1): return False
    HtH = H @ H.T
    return np.allclose(HtH, n * np.eye(n))


def main():
    print(f"=== FrontierMath Hadamard Order 668 (Williamson-type, n={N}) ===", flush=True)
    print(f"Search space: 2^{4*N} = 2^{4*N} = {4*N}-bit configuration", flush=True)
    print(f"Target energy: 0 (via ΣPAF_k(s) = 0 for s ≠ 0)", flush=True)
    print()

    best_overall = float('inf')
    for seed in range(5):
        print(f"--- seed {seed} ---", flush=True)
        vecs, E = williamson_sa(N, n_iter=500_000, T0=50.0, seed=seed, log_interval=25_000)
        print(f"  seed {seed}: final E = {E}", flush=True)
        if E < best_overall:
            best_overall = E
        if E == 0:
            print("\n*** FOUND Williamson quadruple! ***")
            np.save(f"hadamard_668_vecs_s{seed}.npy", np.array(vecs))
            H = build_hadamard(*vecs)
            if verify_hadamard(H):
                print("*** VERIFIED Hadamard 668 ***")
                np.savetxt("hadamard_668.csv", H, fmt="%d", delimiter=",")
                return
            else:
                print("!!! Built matrix not Hadamard — bug in array construction")

    print(f"\n=== Best energy: {best_overall} (0 = success) ===")


if __name__ == "__main__":
    main()
