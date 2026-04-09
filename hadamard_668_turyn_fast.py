#!/usr/bin/env python3
"""
Silicon: Claude Opus 4.6
Carbon: Francisco Angulo de Lafuente
Plataforma: p2pclaw.com

FrontierMath — H(668): Turyn T-sequences with FAST O(n) delta
==============================================================

Fast deltas for Turyn SA:

1. SIGN FLIP at position i in type-k vector T_k:
   Let v = T_k (which has v[i] = ±1, others 0 or ±1).
   Flipping v[i]: sign change at i only.
   ΔNAF_v(d) = -2·v[i]·(v[i+d] + v[i-d])     [only lags where i+d<n or i-d≥0]
   Boundary: for d > i: only v[i+d] contributes.
             for d > n-1-i: only v[i-d] contributes.
   ΔE = Σ_d [2·S(d)·ΔNAF(d) + ΔNAF(d)²]

2. TYPE CHANGE at position i from a → b (sign preserved):
   Two events: T_a[i] goes ±1 → 0, T_b[i] goes 0 → ±1.
   ΔNAF_{T_a}(d) for removal: -v[i]·(T_a[i+d] + T_a[i-d])  [but T_a[i]=v[i] was removed]
   Actually the formula for removing v[i] from T_a:
     new NAF_{T_a}(d) = Σ_{j,j+d<n, j≠i, j+d≠i} T_a[j]·T_a[j+d]
     Old NAF_{T_a}(d) = old sum
     Difference includes all terms involving position i in the pair.
     For d>0: terms (i, i+d) and (i-d, i) → contributions T_a[i]·T_a[i+d] and T_a[i-d]·T_a[i].
     But after removal T_a[i]=0, so those contributions vanish.
     ΔNAF_{T_a}(d) = -v[i]·(T_a[i+d] + T_a[i-d])  for valid lag ranges.

   For T_b getting +v[i] at i:
     ΔNAF_{T_b}(d) = +v[i]·(T_b[i+d] + T_b[i-d])  for valid lag ranges.

   The CORRECTION: after inserting, the new T_b[i] = v[i], and the other positions
   might also contribute. Specifically, if T_b had T_b[i]=0 before and now has v[i],
   any pair (i, i+d) where T_b[i+d] ≠ 0 yields new contribution v[i]·T_b[i+d].
   This is exactly the formula above.

   Note: if T_b[i+d] or T_a[i+d] etc. is 0, those terms are already 0 in old NAF.
   The formula is exact.

  Σ of ΔNAFs gives ΔS at each lag. ΔE via the (2S+ΔS)·ΔS identity.

Because S = Σ_k NAF_{T_k}, a sign flip at position i only affects NAF_{T_type[i]}.
So dS(d) = ΔNAF_{T_k}(d) for the affected k.

A type change a→b affects BOTH NAF_{T_a} (remove) and NAF_{T_b} (add).

This gives O(n) per move, same as nonpal SA → ~30k moves/s.
"""
import sys, os, json, time, math, random, argparse
import numpy as np

sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hadamard_668_v2 import N, build_hadamard, verify_hadamard, export_hadamard


def naf_fast(v, n):
    """Full NAF(d) for d=0..n-1 via numpy correlate."""
    v64 = v.astype(np.int64)
    corr = np.correlate(v64, v64, mode='full')
    return corr[n - 1:]  # lags 0..n-1


def compute_S_from_Ts(T, n):
    """S[d] = Σ_k NAF(T_k)(d)."""
    S = np.zeros(n, dtype=np.int64)
    for t in T:
        S += naf_fast(t, n)
    return S


def naf_point_delta(v, i, n, sign_change):
    """ΔNAF(d) for d=0..n-1 when v[i] changes by sign_change (v[i] becomes v[i]*(1+sign_change)·...
    Actually this expects v[i] changes from val to val+sign_change, where sign_change is
    -2*val (for sign flip) or +val_b (for insertion, old was 0) or -val_a (for removal, old was val_a).

    Let δ = new value - old value.
    new NAF(d) = Σ pairs = old NAF(d) + δ·(contribution of pairs involving i)
    At lag d, pairs involving position i (for d>0):
        (i, i+d) if i+d < n: contributes v[i+d]·v[i] → δ·v_other[i+d]
        (i-d, i) if i-d >= 0: contributes v[i-d]·v[i] → δ·v_other[i-d]
    where v_other means using OTHER position's CURRENT value.
    Note: if d=0, only term (i,i) with contribution v[i]² → δ·(2·v[i]+δ) so quadratic
      but NAF(0) doesn't matter for E.

    Returns ΔNAF as array of length n. ΔNAF[0] handled separately.
    """
    dNAF = np.zeros(n, dtype=np.int64)
    # For d > 0:
    v64 = v.astype(np.int64)
    n_arr = np.arange(1, n, dtype=np.int64)
    # (i, i+d): valid for i+d < n → d < n-i
    # (i-d, i): valid for i-d >= 0 → d <= i
    # Build contribution arrays
    # Left contrib: v[i-d] for d=1..i (valid), 0 otherwise
    left = np.zeros(n, dtype=np.int64)
    right = np.zeros(n, dtype=np.int64)
    for d in range(1, n):
        if d <= i:
            left[d] = v64[i - d]
        if i + d < n:
            right[d] = v64[i + d]
    dNAF[1:] = sign_change * (left[1:] + right[1:])
    return dNAF


def naf_point_delta_vec(v, i, n, sign_change):
    """Vectorised version using slicing."""
    v64 = v.astype(np.int64)
    # d=1..n-1
    # left[d] = v[i-d] if d<=i else 0
    # right[d] = v[i+d] if d < n-i else 0
    left = np.zeros(n, dtype=np.int64)
    right = np.zeros(n, dtype=np.int64)
    if i > 0:
        left[1:i+1] = v64[i-1::-1]  # v[i-1], v[i-2], ..., v[0]
    if i < n - 1:
        right[1:n-i] = v64[i+1:]
    dNAF = np.zeros(n, dtype=np.int64)
    dNAF[1:] = sign_change * (left[1:] + right[1:])
    return dNAF


def sign_flip_delta_turyn(S, T_k, i, n):
    """Fast delta for sign flip at position i in T_k (T_k[i] was v → -v)."""
    old_val = int(T_k[i])
    if old_val == 0:
        return np.zeros(n, dtype=np.int64), 0
    # Sign change: new = -old, δ = -2·old
    sign_change = -2 * old_val
    dNAF = naf_point_delta_vec(T_k, i, n, sign_change)
    dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
    return dNAF, dE


def type_change_delta_turyn(S, T_a, T_b, i, n, sign_val):
    """Fast delta for type change at i: T_a[i] was sign_val, becomes 0;
    T_b[i] was 0, becomes sign_val."""
    # ΔNAF_{T_a}: position i changes by -sign_val
    dNAF_a = naf_point_delta_vec(T_a, i, n, -sign_val)
    # For T_b, we apply the change BEFORE v is modified; T_b[i] was 0, will be sign_val
    # Delta for T_b: position i changes by +sign_val
    # But the "v" seen by naf_point_delta_vec must be T_b, with T_b[i]=0 currently
    dNAF_b = naf_point_delta_vec(T_b, i, n, sign_val)
    dNAF = dNAF_a + dNAF_b
    dE = int(np.dot(2 * S[1:] + dNAF[1:], dNAF[1:]))
    return dNAF, dE


def turyn_fast_sa(seed=8001, max_time=10800, T0=200.0, alpha=0.9999997,
                   restart_stale=2500000, chkpt=None, save_prefix='h668_tfast'):
    rng = np.random.default_rng(seed)
    py_rng = random.Random(seed)
    n = N

    if chkpt:
        with open(chkpt) as f:
            state = json.load(f)
        types = np.array(state['types'], dtype=np.int64)
        signs = np.array(state['signs'], dtype=np.int8)
    else:
        types = rng.integers(4, size=n)
        signs = rng.choice([-1, 1], size=n).astype(np.int8)

    # Build T sequences
    T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
    for i in range(n):
        T[int(types[i])][i] = signs[i]
    S = compute_S_from_Ts(T, n)
    E = int(np.sum(S[1:] ** 2))

    best = E
    best_types = types.copy()
    best_signs = signs.copy()
    T_temp = T0
    t0 = time.time()
    it = 0
    stale = 0
    restarts = 0
    last_log = t0

    print(f"TFAST seed={seed} init E={E} chkpt={chkpt}", flush=True)

    while time.time() - t0 < max_time:
        it += 1
        if py_rng.random() < 0.5:
            # SIGN FLIP
            i = int(rng.integers(n))
            k = int(types[i])
            dNAF, dE = sign_flip_delta_turyn(S, T[k], i, n)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                T[k][i] = -T[k][i]
                signs[i] = -signs[i]
                S += dNAF
                E += dE
        else:
            # TYPE CHANGE
            i = int(rng.integers(n))
            a = int(types[i])
            b = int(rng.integers(4))
            while b == a:
                b = int(rng.integers(4))
            sign_val = int(signs[i])
            dNAF, dE = type_change_delta_turyn(S, T[a], T[b], i, n, sign_val)
            if dE <= 0 or py_rng.random() < math.exp(-dE / T_temp):
                T[a][i] = 0
                T[b][i] = sign_val
                types[i] = b
                S += dNAF
                E += dE

        if E < best:
            best = E
            best_types = types.copy()
            best_signs = signs.copy()
            stale = 0
            with open(f"{save_prefix}_seed{seed}.json", 'w') as f:
                json.dump({'seed': seed, 'E': int(best), 'it': it,
                           'types': best_types.tolist(),
                           'signs': best_signs.tolist()}, f)
            if best == 0:
                print(f"FOUND E=0! it={it}", flush=True)
                # Build Williamson
                A = T[0] + T[1] + T[2] + T[3]
                B = T[0] + T[1] - T[2] - T[3]
                C = T[0] - T[1] + T[2] - T[3]
                D = T[0] - T[1] - T[2] + T[3]
                export_hadamard([A.astype(np.int8), B.astype(np.int8), C.astype(np.int8), D.astype(np.int8)], save_prefix)
                return types, signs, 0
        else:
            stale += 1
        T_temp = max(2.0, T_temp * alpha)

        # Drift check
        if it % 200000 == 199999:
            S_check = compute_S_from_Ts(T, n)
            E_check = int(np.sum(S_check[1:] ** 2))
            if E_check != E:
                print(f"  drift detected: E={E} → recomputed={E_check}, resetting", flush=True)
                S = S_check
                E = E_check

        if stale >= restart_stale:
            restarts += 1
            types = best_types.copy()
            signs = best_signs.copy()
            T = [np.zeros(n, dtype=np.int8) for _ in range(4)]
            for i in range(n):
                T[int(types[i])][i] = signs[i]
            # Perturbation
            for _ in range(15 + restarts % 10):
                i = int(rng.integers(n))
                if py_rng.random() < 0.5:
                    signs[i] = -signs[i]
                    T[int(types[i])][i] = signs[i]
                else:
                    a = int(types[i])
                    b = int(rng.integers(4))
                    while b == a:
                        b = int(rng.integers(4))
                    T[a][i] = 0
                    T[b][i] = signs[i]
                    types[i] = b
            S = compute_S_from_Ts(T, n)
            E = int(np.sum(S[1:] ** 2))
            T_temp = T0 * (0.6 ** (restarts % 5))
            stale = 0
            print(f"  [RESTART #{restarts}] best={best} E={E} T={T_temp:.1f}", flush=True)

        now = time.time()
        if now - last_log > 15.0:
            dt = now - t0
            print(f"  t={dt:.0f}s it={it} E={E} best={best} T={T_temp:.2f} r={restarts}", flush=True)
            last_log = now

    print(f"TIMEOUT seed={seed} best={best} ({time.time()-t0:.0f}s)", flush=True)
    return best_types, best_signs, best


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=8001)
    ap.add_argument('--chkpt', type=str, default=None)
    ap.add_argument('--max_time', type=int, default=10800)
    ap.add_argument('--T0', type=float, default=200.0)
    ap.add_argument('--alpha', type=float, default=0.9999997)
    ap.add_argument('--prefix', type=str, default='h668_tfast')
    args = ap.parse_args()
    turyn_fast_sa(seed=args.seed, chkpt=args.chkpt, max_time=args.max_time, T0=args.T0,
                   alpha=args.alpha, save_prefix=args.prefix)
