#!/usr/bin/env python3
"""n=36 via SINGLE circulant on Z_142 (not 2-block). v=142, D symmetric."""
import sys
sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import json, time, random
import numpy as np
import numba as nb


@nb.njit(cache=True, fastmath=True)
def fft_auto_np(d_arr, q):
    # direct O(q^2) autocorrelation
    out = np.zeros(q, dtype=np.int32)
    for i in range(q):
        if d_arr[i] == 0: continue
        for j in range(q):
            if d_arr[j]:
                delta = (j - i) % q
                out[delta] += 1
    return out


@nb.njit(cache=True)
def book_books(d_arr, q):
    """Return red_book[d] for d in D, blue_book[d] for d not in D."""
    auto = fft_auto_np(d_arr, q)
    s = 0
    for i in range(q):
        if d_arr[i]: s += 1
    mR = 0; mB = 0
    for d in range(1, q):
        if d_arr[d]:
            if auto[d] > mR: mR = auto[d]
        else:
            bb = q - 2 - 2*s + auto[d] + 2  # +2 since w=0 and w=d cases: careful
            # For cyclic G on q vertices with symmetric D, blue book of non-edge {0,d}:
            # #{w: w-0 notin D or w=0, w-d notin D or w=d}
            # = q - 2 - |{w: w in D} u {w: w-d in D}|
            # = q - 2 - 2|D| + auto(D,d)
            bb2 = q - 2 - 2*s + auto[d]
            if bb2 > mB: mB = bb2
    return mR, mB, auto


def sa_cyclic(q, rng, k_target, n_steps=200000, T0=50.0, Tmin=0.1, RL=34, BL=35):
    """Symmetric D sub Z_q with |D|=k, minimize overshoot."""
    d_arr = np.zeros(q, dtype=np.int32)
    # seed symmetric: pick pairs (d, q-d)
    seen = set([0])
    pairs = []
    for d in range(1, q):
        if d in seen: continue
        dn = (q - d) % q
        seen.add(d); seen.add(dn)
        pairs.append((d, dn) if d != dn else (d,))
    rng.shuffle(pairs)
    ones = 0
    idx = 0
    while ones < k_target and idx < len(pairs):
        p = pairs[idx]
        if ones + len(p) <= k_target:
            for x in p: d_arr[x] = 1
            ones += len(p)
        idx += 1

    mR, mB, auto = book_books(d_arr, q)
    over = max(0, mR-RL) + max(0, mB-BL)
    best_over = over; best = d_arr.copy(); best_stats = (mR, mB)

    T = T0
    alpha = (Tmin / T0) ** (1.0 / max(n_steps, 1))
    ones_list = [d for d in range(1, q) if d_arr[d]]
    zeros_list = [d for d in range(1, q) if not d_arr[d]]

    for step in range(n_steps):
        if not ones_list or not zeros_list: break
        do = rng.choice(ones_list); di = rng.choice(zeros_list)
        do_n = (q - do) % q; di_n = (q - di) % q
        if do == do_n or di == di_n: continue  # self-inverse, skip

        d_arr[do] = 0; d_arr[do_n] = 0
        d_arr[di] = 1; d_arr[di_n] = 1

        new_mR, new_mB, _ = book_books(d_arr, q)
        new_over = max(0, new_mR-RL) + max(0, new_mB-BL)
        dp = new_over - over

        if dp <= 0 or (T > 1e-9 and rng.random() < np.exp(-dp / T)):
            over = new_over
            mR, mB = new_mR, new_mB
            # update lists
            ones_list.remove(do); ones_list.remove(do_n)
            ones_list.extend([di, di_n])
            zeros_list.remove(di); zeros_list.remove(di_n)
            zeros_list.extend([do, do_n])
            if over < best_over:
                best_over = over
                best = d_arr.copy()
                best_stats = (mR, mB)
                if over == 0:
                    return best, best_over, best_stats
        else:
            d_arr[do] = 1; d_arr[do_n] = 1
            d_arr[di] = 0; d_arr[di_n] = 0

        T *= alpha
        if step % 5000 == 0:
            print(f"    step {step}: over={over} best={best_over} mR={mR} mB={mB} T={T:.2f}", flush=True)

    return best, best_over, best_stats


def verify(q, D_set, RL, BL):
    adj = np.zeros((q, q), dtype=np.int8)
    for i in range(q):
        for j in range(i+1, q):
            if (j-i) % q in D_set or (i-j) % q in D_set:
                adj[i,j] = adj[j,i] = 1
    mR = mB = 0
    for i in range(q):
        for j in range(i+1, q):
            cr = cb = 0
            for w in range(q):
                if w==i or w==j: continue
                if adj[i,w] and adj[j,w]: cr += 1
                elif not adj[i,w] and not adj[j,w]: cb += 1
            if adj[i,j]:
                if cr > mR: mR = cr
            else:
                if cb > mB: mB = cb
    return mR <= RL and mB <= BL, mR, mB


def main():
    q = 142
    RL, BL = 34, 35  # for n=36
    print(f"=== Cyclic Z_{q} | RL={RL} BL={BL} ===", flush=True)
    rng = random.Random(2026)

    for k in [68, 69, 70, 71, 72]:
        print(f"\n--- k={k} ---", flush=True)
        for seed in range(3):
            rng2 = random.Random(10000 + seed + k*17)
            t0 = time.time()
            d_best, over, stats = sa_cyclic(q, rng2, k, n_steps=50000, T0=40.0, Tmin=0.1, RL=RL, BL=BL)
            t = time.time() - t0
            mR, mB = stats
            print(f"  k={k} s{seed}: over={over} mR={mR} mB={mB} ({t:.1f}s)", flush=True)
            if over == 0:
                D = [int(x) for x in np.where(d_best)[0]]
                D_set = set(D)
                ok, vmR, vmB = verify(q, D_set, RL, BL)
                print(f"  verify: ok={ok} mR={vmR} mB={vmB}", flush=True)
                if ok:
                    with open("n36_cyclic142_solution.json", "w") as f:
                        json.dump({"v": q, "D": D, "mR": vmR, "mB": vmB,
                                   "method": f"cyclic_Z{q}_k{k}_s{seed}"}, f, indent=2)
                    print("*** SOLVED n=36 via Z_142 ***")
                    return


if __name__ == "__main__":
    main()
