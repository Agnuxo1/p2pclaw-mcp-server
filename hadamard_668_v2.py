#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — Hadamard Matrix H(668): v2 Attack
=================================================

668 = 4 × 167,  167 prime, 167 ≡ 3 mod 4.

METHOD: Williamson SA with O(n) fast-delta + adaptive restart.

Williamson condition (symmetric circulants A,B,C,D of order n=167):
  Σ_k PAF_k(d) = 0  ∀ d ≠ 0    [Williamson, 1944]

  PAF_v(d) = Σ_{i=0}^{n-1}  v[i] × v[(i+d) mod n]

Energy: E = Σ_{d=1}^{n-1} S(d)²,  S(d) = Σ_k PAF_k(d)
  E = 0  ⟺  H(668) found.

Key upgrade vs v1:
  - O(n) fast ΔE per palindrome flip (vs O(n log n) FFT each step)
  - Temperature calibrated to initial E distribution
  - Adaptive restart when stale > threshold
  - Saves best state to JSON on improvement
  - CSV export when E=0 found

Leader rotation: 4 seeds run in parallel via subprocess launch
  seed A: standard cooling (α = 0.99999)
  seed B: faster cooling (α = 0.999985) + frequent restart
  seed C: Legendre-initialized A,B (hot start from QR pattern)
  seed D: cross-vec coupled moves
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')

N   = 167   # Williamson block size
ORD = 4*N   # = 668

# ── FFT-based initial PAF sum ─────────────────────────────────────────────────
def compute_paf_sums(vecs):
    """S[d] = Σ_k PAF_k(d) for d=0..n-1, via FFT. S[0]=4n if all vecs ±1."""
    n = len(vecs[0])
    S = np.zeros(n, dtype=np.int64)
    for v in vecs:
        V = np.fft.fft(v.astype(np.float64))
        paf = np.round(np.real(np.fft.ifft(V * V.conj()))).astype(np.int64)
        S += paf
    return S   # S[d] for d=1..n-1 should be 0 at solution


def energy_from_S(S):
    return int(np.sum(S[1:] ** 2))


# ── O(n) fast delta for palindrome flip at position j in vec k ───────────────
def palindrome_flip_delta(S, v, j, n):
    """Vectorised O(n) ΔS and ΔE for palindrome flip at position j.

    For j > 0: flip set F = {j, n−j}.
      ΔPAF(d) = −4 v[j] · (v[(j+d)%n] + v[(j−d)%n])
      except at d ≡ n−2j and d ≡ 2j (mod n) where ΔPAF = 0 (both targets in F).

    For j = 0: flip set F = {0}.
      ΔPAF(d) = −2 v[0] · (v[d] + v[n−d])

    Returns (dPAF[1..n−1], dE) — dPAF is indexed 0-based for d = 1..n−1.
    """
    d_arr = np.arange(1, n, dtype=np.int64)
    jp = (j + d_arr) % n
    jm = (j - d_arr) % n

    vj  = int(v[j])
    vjp = v[jp].astype(np.int64)
    vjm = v[jm].astype(np.int64)

    if j == 0:
        dPAF = (-2 * vj * (vjp + vjm)).astype(np.int64)
    else:
        dPAF = (-4 * vj * (vjp + vjm)).astype(np.int64)
        # At d=2j and d=n-2j, one pair of terms (i,i+d) has BOTH endpoints in F,
        # so those pairs contribute 0 (not −4vj·v[...]).  My formula double-counts
        # by including a −4vj·vj = −4 term.  Correct by adding +4 at those lags.
        for d_corr in ((2 * j) % n, (n - 2 * j) % n):
            if 1 <= d_corr <= n - 1:
                dPAF[d_corr - 1] += 4   # cancel over-count

    # ΔE = Σ_d [2S(d)·ΔP(d) + ΔP(d)²] = (2S + ΔP) · ΔP
    # dPAF is length n-1 (d=1..n-1); S[1:] is same length
    dE = int(np.dot(2 * S[1:] + dPAF, dPAF))
    # Return full-length dPAF (prepend 0 for d=0) for S += dPAF compatibility
    dPAF_full = np.empty(n, dtype=np.int64)
    dPAF_full[0] = 0
    dPAF_full[1:] = dPAF
    return dPAF_full, dE


def apply_flip(v, j, n):
    """Flip v[j] and v[n-j] in-place (palindrome preserving)."""
    v[j] = -v[j]
    if j != 0:
        v[n-j] = -v[n-j]


# ── Initialisation ─────────────────────────────────────────────────────────────
def random_palindrome(n, rng):
    """Random symmetric ±1 vector of odd length n."""
    v = np.empty(n, dtype=np.int8)
    v[0] = rng.choice([-1, 1])
    for i in range(1, (n-1)//2 + 1):
        val = rng.choice([-1, 1])
        v[i] = val
        v[n-i] = val
    return v


def legendre_palindrome(n, scale=1.0, rng=None):
    """Hot start: Legendre sequence for prime n ≡ 3 mod 4.
    L[0]=1, L[i] = Legendre(i, n). For n=167 this gives a good PAF start."""
    v = np.empty(n, dtype=np.int8)
    v[0] = 1
    for i in range(1, n):
        ls = pow(i, (n-1)//2, n)   # 1 if QR, n-1 if NR
        v[i] = 1 if ls == 1 else -1
    # Optionally perturb
    if rng and scale > 0:
        for i in range(1, (n-1)//2 + 1):
            if rng.random() < scale:
                v[i] = -v[i]
                v[n-i] = -v[n-i]
    return v


# ── Main SA ───────────────────────────────────────────────────────────────────
def williamson_sa(seed=0, alpha=0.99999, T0=None, max_iter=50_000_000,
                  log_interval=100_000, init='random', restart_stale=500_000,
                  save_prefix="h668"):

    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)

    n = N
    half = (n-1)//2

    # Initialise 4 vectors
    if init == 'legendre':
        vecs = [legendre_palindrome(n, scale=0.2, rng=py_rng) for _ in range(4)]
    else:
        vecs = [random_palindrome(n, rng) for _ in range(4)]

    S = compute_paf_sums(vecs)
    E = energy_from_S(S)

    # Auto-calibrate T0 if not given: T0 ≈ 0.3 × E / (n-1) so typical ΔE ≈ 3T0
    if T0 is None:
        T0 = max(100, 0.3 * E / (n-1))

    T    = T0
    best = E
    best_vecs = [v.copy() for v in vecs]
    t0   = time.time()
    stale = 0
    restarts = 0

    # Save initial best
    def save_state():
        state = {
            'seed': seed, 'iter': 0, 'E': int(best), 'T': T,
            'vecs': [v.tolist() for v in best_vecs]
        }
        with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
            json.dump(state, f)

    save_state()
    last_save = E

    for it in range(max_iter):
        # Pick random palindrome flip in random vector
        k = int(rng.integers(4))
        j = int(rng.integers(half + 1))   # 0..half

        dPAF, dE = palindrome_flip_delta(S, vecs[k], j, n)

        if dE <= 0 or py_rng.random() < math.exp(-dE / T):
            # Accept
            apply_flip(vecs[k], j, n)
            S += dPAF
            E += dE
            if E < best:
                best = E
                best_vecs = [v.copy() for v in vecs]
                stale = 0
                if E < last_save * 0.98:   # save on 2% improvement
                    save_state()
                    last_save = E
                if E == 0:
                    break
            else:
                stale += 1
        else:
            stale += 1

        T *= alpha

        # Adaptive restart
        if stale >= restart_stale:
            restarts += 1
            # Keep best, reinit 2 random vectors
            vecs = [best_vecs[k2].copy() for k2 in range(4)]
            # Randomly re-init 1-2 vecs
            n_reinit = 2
            for ki in rng.choice(4, n_reinit, replace=False):
                vecs[ki] = random_palindrome(n, rng)
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)
            T  = T0 * (0.5 ** (restarts % 4))   # geometric decay over restart cycles
            stale = 0
            print(f"  [restart #{restarts} it={it}] E={E} best={best} T={T:.1f}", flush=True)

        # Periodic recompute to fix int drift
        if it % 1_000_000 == 999_999:
            S = compute_paf_sums(vecs)
            E = energy_from_S(S)

        if (it+1) % log_interval == 0:
            dt = time.time() - t0
            print(f"  it={it+1:,} E={E} best={best} T={T:.4f} restarts={restarts} ({dt:.0f}s)", flush=True)

    dt = time.time() - t0
    print(f"DONE seed={seed} best={best} ({dt:.0f}s)", flush=True)

    if best == 0:
        export_hadamard(best_vecs, save_prefix)

    return best_vecs, best


# ── Build & export H(668) from Williamson sequences ──────────────────────────
def build_hadamard(A, B, C, D):
    """Williamson array: block matrix of 4 circulants → 668×668 Hadamard."""
    n = len(A)
    N = 4*n

    def circ(v):
        v = v.astype(np.int8)
        rows = [np.roll(v, i) for i in range(n)]
        return np.stack(rows)

    cA = circ(A)
    cB = circ(B)
    cC = circ(C)
    cD = circ(D)

    # Williamson arrangement:
    # [  A   B   C   D ]
    # [ -B   A  -D   C ]
    # [ -C   D   A  -B ]
    # [ -D  -C   B   A ]
    H = np.block([
        [ cA,  cB,  cC,  cD],
        [-cB,  cA, -cD,  cC],
        [-cC,  cD,  cA, -cB],
        [-cD, -cC,  cB,  cA],
    ]).astype(np.int8)
    return H


def verify_hadamard(H):
    n = H.shape[0]
    HHt = H.astype(np.int32) @ H.astype(np.int32).T
    return np.allclose(HHt, n * np.eye(n))


def export_hadamard(vecs, prefix):
    A, B, C, D = [v.astype(np.int8) for v in vecs]
    H = build_hadamard(A, B, C, D)
    if not verify_hadamard(H):
        print("WARNING: verification failed — energy reported 0 but H is not Hadamard?", flush=True)
        return
    fname = f"{prefix}_H668.csv"
    np.savetxt(fname, H, delimiter=',', fmt='%d')
    print(f"H(668) verified and saved to {fname}", flush=True)


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--alpha', type=float, default=0.99999)
    ap.add_argument('--T0', type=float, default=None)
    ap.add_argument('--max_iter', type=int, default=50_000_000)
    ap.add_argument('--init', choices=['random','legendre'], default='random')
    ap.add_argument('--restart_stale', type=int, default=500_000)
    ap.add_argument('--log_interval', type=int, default=100_000)
    ap.add_argument('--prefix', type=str, default='h668')
    args = ap.parse_args()

    print(f"H(668) SA attack: seed={args.seed} alpha={args.alpha} T0={args.T0} init={args.init}", flush=True)
    williamson_sa(
        seed=args.seed,
        alpha=args.alpha,
        T0=args.T0,
        max_iter=args.max_iter,
        init=args.init,
        restart_stale=args.restart_stale,
        log_interval=args.log_interval,
        save_prefix=args.prefix,
    )
