#!/usr/bin/env python3
"""
Independent reference for the Rahman et al. (WSC 2023) T-shirt line.

    Rahman, S M A., Rahman, M F., Kamal, T., Tseng, T-L. (2023).
    "A Simulation-Based Approach for Line Balancing Under Demand Uncertainty
    in Production Environment". Proc. Winter Simulation Conference, 2020-2030.

Why this file exists
--------------------
Stitchworks is being checked against this paper. The paper's own numbers
cannot all be reproduced from what it publishes, so a disagreement between
Stitchworks and the paper does not say which of the two is wrong. This script
is the third opinion: the SAME assumptions Stitchworks is given, computed by
code that shares nothing with it -- another language, another random number
generator, and a plain "who is free, who is waiting" loop instead of
Stitchworks' block-and-port engine. It also prints the closed-form bottleneck
arithmetic, which needs no simulation at all.

    Stitchworks  vs  this file   -> a gap is a Stitchworks error
    this file    vs  the paper   -> a gap is the paper's ambiguity

Run:  python3 rahman2023_reference.py              (table, 200 runs a row)
      python3 rahman2023_reference.py --reps 20    (quick look)
      python3 rahman2023_reference.py --json       (machine-readable)

Assumptions (identical to the Stitchworks model; see the replication notes)
---------------------------------------------------------------------------
* Station order follows the paper's Figure 2 (its AnyLogic model), not
  Figure 1 or Table 1, which each give a different order.
* Table 1's Min / Max / Mode are output RATES in pieces per minute
  (Mode x 60 = the Capacity column). A piece takes 1 / X minutes,
  X ~ Triangular(min, mode, max).
* Each of the three sources releases a lot of 2,000 at 6,000 an hour, so the
  line is never starved. Labels are therefore always in stock and the two
  label joins never hold a garment up.
* Buffers are unlimited.
* An operator who covers two stations serves on demand: lowest priority
  number first, then the piece that has waited longest. Non-pre-emptive.
"""

import heapq
import json
import math
import random
import statistics
import sys
import zlib
from collections import deque

SMV = 5.39          # the paper's stated standard minute value for the garment
TARGET = 1600       # pieces a day the paper's manager needs
LOT = 2000          # pieces each source releases (the "2,000" on Figure 2)
FEED_GAP = 60 / 6000  # minutes between releases

# (key, name, capacity pcs/hr, rate min, rate mode, rate max)
# Figure 2 order. "CareLJ" on the figure sits where Table 1 lists Sleeve joint,
# so it takes that row's timing.
STATIONS = [
    ("shoulder",    "Shoulder joint",   300, 3, 5, 6),
    ("neckJoint",   "Neck joint",       120, 2, 2, 3),
    ("ribTack",     "Rib tack",         180, 2, 3, 5),
    ("neckTape",    "Neck tape joint",  120, 1, 2, 3),
    ("mainLabel",   "Main label joint", 250, 2, 4, 5),   # joins the Label stream
    ("neckTopSeam", "Neck top seam",    130, 2, 2, 4),   # "NecktapeSim" on Figure 2
    ("sleeveHem",   "Sleeve hem",        90, 1, 2, 4),
    ("sleeveJoint", "Sleeve joint",     120, 2, 2, 3),   # joins the CareLabel stream
    ("careLabel",   "Care label joint", 300, 3, 5, 6),
    ("sideSeam",    "Side seam",        130, 1, 2, 4),
    ("sleeveTack",  "Sleeve tack",      350, 4, 6, 7),
    ("soapTack",    "Sleeve soap tack", 300, 2, 3, 3),   # printed as 2 / 3 / mode 5
    ("bodyHem",     "Body hem",         110, 2, 2, 3),
]
INDEX = {s[0]: i for i, s in enumerate(STATIONS)}
LABEL_JOINS = ("mainLabel", "sleeveJoint")

# Sleeve soap tack is printed with its mode (5) outside its range (2-3).
SOAP_TACK = {
    "asPrinted":  (2, 3, 3),      # keep the printed range, pull the mode into it
    "symmetric":  (2, 2.5, 3),    # keep the printed range, ignore the mode
    "byCapacity": (3, 5, 6),      # what the other two 300 pcs/hr rows use
}


def mean_time(lo, mode, hi):
    """E[1/X] for X ~ Triangular(lo, mode, hi), closed form."""
    if hi - lo < 1e-12:
        return 1 / lo
    m = 0.0
    if mode - lo > 1e-12:
        m += 2 / ((hi - lo) * (mode - lo)) * ((mode - lo) - lo * math.log(mode / lo))
    if hi - mode > 1e-12:
        m += 2 / ((hi - lo) * (hi - mode)) * (hi * math.log(hi / mode) - (hi - mode))
    return m


def crews(reading, config, pairing="seam", priority="primaryFirst"):
    """
    Who covers what. Returns a list of operators, each a list of
    (station key, priority). A station that appears in no list is unmanned:
    it still takes its time, one piece at a time, but uses no operator.
    """
    keys = [s[0] for s in STATIONS]
    if reading == "A":
        manned = [k for k in keys if k not in LABEL_JOINS]
        ops = {k: [(k, 1)] for k in manned}
    else:  # reading B: every station manned, two operators double up
        ops = {k: [(k, 1)] for k in keys}
        ops["shoulder"] = [("shoulder", 1), ("neckJoint", 1)]
        del ops["neckJoint"]
        ops["soapTack"] = [("soapTack", 1), ("bodyHem", 1)]
        del ops["bodyHem"]

    def owner(key):
        for name, rows in ops.items():
            if any(k == key for k, _ in rows):
                return name
        raise KeyError(key)

    if config == "shared34":
        # Scenarios 3 and 4: Sleeve tack's operator leaves; the operator of the
        # paired station covers both, own station first.
        primary = "neckTopSeam" if pairing == "seam" else "neckTape"
        ops[owner("sleeveTack")] = [r for r in ops[owner("sleeveTack")] if r[0] != "sleeveTack"]
        ops = {n: r for n, r in ops.items() if r}
        second = 2 if priority == "primaryFirst" else 1
        ops[owner(primary)].append(("sleeveTack", second))
    elif config == "shared5":
        # Scenario 5: Sleeve tack and Sleeve soap tack under one operator.
        ops[owner("sleeveTack")] = [r for r in ops[owner("sleeveTack")] if r[0] != "sleeveTack"]
        ops = {n: r for n, r in ops.items() if r}
        ops[owner("soapTack")].append(("sleeveTack", 1))
    return list(ops.values())


def simulate(rng, crew, soap="asPrinted", horizon=None, target=None):
    """
    One run. Stops at `horizon` minutes or when `target` pieces are finished,
    whichever is given. Returns (minutes simulated, pieces out,
    busy minutes per station, busy minutes per operator).
    """
    n = len(STATIONS)
    params = [(s[3], s[4], s[5]) for s in STATIONS]
    params[INDEX["soapTack"]] = SOAP_TACK[soap]

    op_of = [None] * n          # operator index covering each station
    prio = [1] * n
    for o, rows in enumerate(crew):
        for key, p in rows:
            op_of[INDEX[key]] = o
            prio[INDEX[key]] = p
    op_free = [True] * len(crew)

    waiting = [deque() for _ in range(n)]   # arrival times, oldest first
    working = [False] * n
    began = [0.0] * n
    busy = [0.0] * n

    events = []      # (time, tie-break, kind, station)
    seq = 0
    for k in range(LOT):
        heapq.heappush(events, (k * FEED_GAP, seq, "arrive", 0))
        seq += 1

    out = 0
    now = 0.0

    def start(i):
        nonlocal seq
        waiting[i].popleft()
        working[i] = True
        began[i] = now
        if op_of[i] is not None:
            op_free[op_of[i]] = False
        lo, mode, hi = params[i]
        # random.triangular takes (low, high, mode)
        heapq.heappush(events, (now + 1 / rng.triangular(lo, hi, mode), seq, "done", i))
        seq += 1

    def offer(o):
        """Operator o is free: give them the best waiting station, if any."""
        best = None
        for key, _ in crew[o]:
            i = INDEX[key]
            if working[i] or not waiting[i]:
                continue
            rank = (prio[i], waiting[i][0])
            if best is None or rank < best[0]:
                best = (rank, i)
        if best is not None:
            start(best[1])

    def kick(i):
        """Something changed at station i: start work there if it can."""
        if working[i] or not waiting[i]:
            return
        o = op_of[i]
        if o is None:
            start(i)
        elif op_free[o]:
            offer(o)

    while events:
        t, _, kind, i = events[0]
        if horizon is not None and t > horizon:
            break
        heapq.heappop(events)
        now = t
        if kind == "arrive":
            waiting[i].append(now)
            kick(i)
            continue
        # a piece finished at station i
        working[i] = False
        busy[i] += now - began[i]
        if i + 1 < n:
            waiting[i + 1].append(now)
        else:
            out += 1
        o = op_of[i]
        if o is not None:
            op_free[o] = True
            offer(o)
        else:
            kick(i)
        if i + 1 < n:
            kick(i + 1)
        if target is not None and out >= target:
            break

    end = now if (target is not None and out >= target) else (horizon if horizon is not None else now)
    # credit work still in progress at the bell
    for i in range(n):
        if working[i]:
            busy[i] += end - began[i]
    op_busy = [sum(busy[INDEX[k]] for k, _ in rows) for rows in crew]
    return end, out, busy, op_busy


def replicate(reps, seed, **kw):
    ends, outs = [], []
    util = None
    for r in range(reps):
        rng = random.Random(seed * 100003 + r)
        end, out, busy, op_busy = simulate(rng, **kw)
        ends.append(end)
        outs.append(out)
        u = [b / end for b in op_busy]
        util = u if util is None else [a + b for a, b in zip(util, u)]
    return {
        "minutes_mean": statistics.fmean(ends),
        "minutes_sd": statistics.pstdev(ends),
        "output_mean": statistics.fmean(outs),
        "output_sd": statistics.pstdev(outs),
        "operator_utilisation": [u / reps for u in util],
    }


def scenarios(reading, soap="asPrinted", pairing="seam", priority="primaryFirst", reps=200):
    base = crews(reading, "base")
    s34 = crews(reading, "shared34", pairing, priority)
    s5 = crews(reading, "shared5")
    rows = {}

    def record(name, crew, **kw):
        # crc32, not hash(): Python salts str hashes per process, and a seed
        # that changes every run would make the table unrepeatable.
        seed = zlib.crc32(f"{reading}/{name}".encode()) % 9973 + 1
        r = replicate(reps, seed=seed, crew=crew, soap=soap, **kw)
        operators = len(crew)
        operating = operators * r["minutes_mean"]
        r.update({
            "operators": operators,
            "operating_minutes": operating,
            "efficiency_pct": 100 * r["output_mean"] * SMV / operating,
        })
        rows[name] = r

    record("S1", base, horizon=480)
    record("S2", base, target=TARGET)
    record("S3@480", s34, horizon=480)
    record("S3@910", s34, horizon=910)
    record("S4", s34, target=TARGET)
    record("S5", s5, target=TARGET)
    return rows


PAPER = {
    "S1": (11, 5280, 919, 93.81),
    "S2": (11, 9126, 1600, 94.50),
    "S3": (10, 9100, 1031, 61.07),
    "S4": (10, 13100, 1600, 65.83),
    "S5": (10, 9146, 1600, 94.29),
}


def closed_form():
    times = {s[0]: mean_time(s[3], s[4], s[5]) for s in STATIONS}
    return times


def main():
    as_json = "--json" in sys.argv
    reps = int(sys.argv[sys.argv.index("--reps") + 1]) if "--reps" in sys.argv else 200
    result = {"reps": reps, "mean_minutes_per_piece": closed_form(), "readings": {}, "sensitivity": {}}
    for reading in ("A", "B"):
        result["readings"][reading] = scenarios(reading, reps=reps)
    # Sensitivities, reading A only.
    result["sensitivity"]["A / pair with Neck tape joint"] = scenarios("A", pairing="joint", reps=reps)
    result["sensitivity"]["A / longest-wait-first, no priority"] = scenarios("A", priority="equal", reps=reps)
    result["sensitivity"]["A / soap tack symmetric (2, 2.5, 3)"] = scenarios("A", soap="symmetric", reps=reps)
    result["sensitivity"]["A / soap tack by capacity (3, 5, 6)"] = scenarios("A", soap="byCapacity", reps=reps)

    if as_json:
        json.dump(result, sys.stdout, indent=1)
        return

    print("Mean minutes per piece, closed form  E[1/X]:")
    for key, t in result["mean_minutes_per_piece"].items():
        print(f"  {key:12s} {t:.4f} min   {60 / t:6.1f} pcs/hr")
    slow = max(result["mean_minutes_per_piece"].items(), key=lambda kv: kv[1])
    print(f"  slowest single station: {slow[0]} -> {480 / slow[1]:.0f} pcs in 480 min, "
          f"{TARGET * slow[1]:.0f} min for {TARGET}")

    def show(title, rows):
        print(f"\n{title}")
        print(f"  {'':8s}{'ops':>4s}{'minutes':>10s}{'output':>9s}{'op-min':>9s}{'eff %':>8s}")
        for name, r in rows.items():
            print(f"  {name:8s}{r['operators']:4d}{r['minutes_mean']:10.1f}{r['output_mean']:9.1f}"
                  f"{r['operating_minutes']:9.0f}{r['efficiency_pct']:8.2f}"
                  f"   (sd {r['minutes_sd']:.1f} min, {r['output_sd']:.1f} pcs)")

    for reading in ("A", "B"):
        show(f"Reading {reading}", result["readings"][reading])
    for name, rows in result["sensitivity"].items():
        show(f"Sensitivity: {name}", rows)
    print("\nPaper, Table 2 (operators, operating minutes, output, efficiency %):")
    for name, row in PAPER.items():
        print(f"  {name}: {row}")


if __name__ == "__main__":
    main()
