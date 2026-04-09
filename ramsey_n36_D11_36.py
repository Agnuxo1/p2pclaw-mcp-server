#!/usr/bin/env python3
"""n=36 with |D11|=36 (not 34) — analysis suggests much looser constraints."""
import sys
sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import json, time, random
import numpy as np

from ramsey_turbo_v4 import (
    fft_auto, penalty_from_auto12_nb,
    sa_inner_loop, joint_sa_inner,
)


def compute_lag_bounds_k(n, d11, k):
    q = 2 * n - 1; hq = (q - 1) // 2
    RL, BL = n - 2, n - 1
    s11 = int(np.sum(d11))
    d22 = np.zeros(q, dtype=np.int32)
    d22[1:] = 1 - d11[1:]
    auto11 = fft_auto(d11, q)
    auto22 = fft_auto(d22, q)
    bv1 = np.zeros(hq, dtype=np.int32)
    bv2 = np.zeros(hq, dtype=np.int32)
    adj = 2 * (k - (n - 1))
    for i in range(hq):
        d = i + 1
        if d11[d]:
            bv1[i] = RL - auto11[d]
            bv2[i] = BL - (2 * s11 - 2 * n + 2) - auto22[d] + adj
        else:
            bv1[i] = BL - (2 * n - 2 - 2 * s11) - auto11[d] + adj
            bv2[i] = RL - auto22[d]
    return bv1, bv2


def verify(n, D11, D12):
    q = 2 * n - 1; N = 2 * q
    RL, BL = n - 2, n - 1
    D11s = set(D11); D12s = set(D12)
    D22s = set(d for d in range(1, q) if d not in D11s)
    adj = [[0] * N for _ in range(N)]
    for i in range(q):
        for j in range(i + 1, q):
            if (j - i) in D11s: adj[i][j] = adj[j][i] = 1
    for i in range(q):
        for j in range(q):
            if (j - i) % q in D12s: adj[i][j+q] = adj[j+q][i] = 1
    for i in range(q, N):
        for j in range(i + 1, N):
            if (j - i) in D22s: adj[i][j] = adj[j][i] = 1
    mR = mB = 0
    for i in range(N):
        for j in range(i + 1, N):
            cr = cb = 0
            for w in range(N):
                if w == i or w == j: continue
                if adj[i][w] and adj[j][w]: cr += 1
                elif not adj[i][w] and not adj[j][w]: cb += 1
            if adj[i][j]:
                if cr > mR: mR = cr
            else:
                if cb > mB: mB = cb
    return mR <= RL and mB <= BL, mR, mB


def make_sym_d11(rng, q, size):
    """Symmetric D11 in Z_q of given size (must be even for q odd prime)."""
    d11 = np.zeros(q, dtype=np.int32)
    hq = (q - 1) // 2
    pairs = list(range(1, hq + 1))
    rng.shuffle(pairs)
    cnt = 0
    for p in pairs:
        if cnt + 2 > size: break
        d11[p] = 1; d11[q - p] = 1
        cnt += 2
    return d11


def main():
    n = 36; q = 2 * n - 1; hq = (q - 1) // 2
    print(f"=== n={n} with |D11|=36 (asymmetric approach) ===", flush=True)

    best_overall = 10**9
    for seed in range(20):
        rng = random.Random(7777 + seed)
        d11 = make_sym_d11(rng, q, 36)
        k = 35  # |D12| = n-1
        d12 = np.zeros(q, dtype=np.int32)
        idxs = rng.sample(range(q), k)
        for i in idxs: d12[i] = 1

        bv1, bv2 = compute_lag_bounds_k(n, d11, k)
        auto12 = fft_auto(d12, q)
        pen0 = int(penalty_from_auto12_nb(auto12, bv1, bv2, hq))

        adj_shift = 2 * (k - (n - 1))
        seed_int = rng.randint(0, 2**31 - 1)
        pen_j, d11_j, d12_j, _ = joint_sa_inner(
            d11.copy(), d12.copy(), auto12.copy(),
            bv1.copy(), bv2.copy(),
            np.int32(q), np.int32(hq), np.int32(k),
            40.0, 0.00002, 50_000_000, np.uint32(seed_int),
            0.06, adj_shift)
        pen_j = int(pen_j)

        # Follow-up D12-only
        bv1_j, bv2_j = compute_lag_bounds_k(n, d11_j, k)
        auto12_j = fft_auto(d12_j, q)
        pen_s, d12_s, _ = sa_inner_loop(
            d12_j.copy(), auto12_j.copy(), bv1_j.copy(), bv2_j.copy(),
            np.int32(q), np.int32(hq), np.int32(k),
            max(2.0, pen_j * 0.5), 0.00001, 25_000_000, np.uint32(seed_int * 2 + 1))
        pen_s = int(pen_s)

        final = min(pen_s, pen_j)
        d12_final = d12_s if pen_s <= pen_j else d12_j

        D11o = sorted(int(x) for x in np.where(d11_j)[0])
        D12o = sorted(int(x) for x in np.where(d12_final)[0])

        msg = f"  s{seed}: |D11|={len(D11o)} |D12|={len(D12o)} p0={pen0} j={pen_j} s={pen_s} final={final}"
        if final <= 4:
            ok, mR, mB = verify(n, D11o, D12o)
            msg += f" VERIFY: ok={ok} mR={mR}/{n-2} mB={mB}/{n-1}"
            print(msg, flush=True)
            if ok:
                print(f"\n*** SOLVED n={n} |D11|={len(D11o)} ***")
                out = {"n": n, "q": q, "D11": D11o, "D12": D12o,
                       "method": f"n36_D11_{len(D11o)}_s{seed}"}
                with open(f"n{n}_solution.json", "w") as f:
                    json.dump(out, f, indent=2)
                return
        else:
            print(msg, flush=True)

        if final < best_overall:
            best_overall = final

    print(f"\n=== Best: pen={best_overall} ===")


if __name__ == "__main__":
    main()
