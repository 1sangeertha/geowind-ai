import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import matplotlib.pyplot as plt

from nsga_site import optimise

SITES = {"low wind (A=6.0, k=2.0)": (6.0, 2.0),
         "medium wind (A=8.0, k=2.1)": (8.0, 2.1),
         "high wind (A=10.5, k=2.2)": (10.5, 2.2)}

if __name__ == "__main__":
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=3) as ex:
        futs = {n: ex.submit(optimise, A, k) for n, (A, k) in SITES.items()}
        res = {n: f.result() for n, f in futs.items()}
    print(f"Total time: {time.time() - t0:.0f} s\n")

    fig, ax = plt.subplots(1, 3, figsize=(15, 4))
    for n, d in res.items():
        i = np.argmax(d["aep"])
        scale = d["X"][i, :6] / d["c_ref"]
        dtw = d["X"][i, 6:] - d["t_ref"]
        span = d["xu"] - d["xl"]
        at_bound = np.mean((d["X"] - d["xl"] < 0.01 * span) | (d["xu"] - d["X"] < 0.01 * span))
        print(f"{n}")
        print(f"  NREL AEP {d['base_aep']:.3f} GWh | best AEP {d['aep'][i]:.3f} GWh "
              f"({100 * (d['aep'][i] / d['base_aep'] - 1):+.2f}%), mass {d['mass'][i]:.2f}")
        print(f"  best-AEP chord scale (6 pts): {np.round(scale, 2)}")
        print(f"  best-AEP twist change (deg):  {np.round(dtw, 2)}")
        print(f"  share of design variables at a search limit: {100 * at_bound:.0f}%\n")
        ax[0].plot(d["mass"], 100 * (d["aep"] / d["base_aep"] - 1), "o", label=n)
        ax[1].plot(scale, "o-", label=n)
        ax[2].plot(dtw, "o-", label=n)
    ax[0].set_xlabel("Mass index"); ax[0].set_ylabel("AEP vs NREL blade (%)")
    ax[1].set_xlabel("Chord control point (root to tip)"); ax[1].set_ylabel("Chord scale, best-AEP design")
    ax[2].set_xlabel("Twist control point (root to tip)"); ax[2].set_ylabel("Twist change (deg), best-AEP design")
    for a in ax:
        a.grid(); a.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig("compare_sites.png", dpi=150)
    plt.show()