import numpy as np
import matplotlib.pyplot as plt

import blade_model as bm
import turbine_model as tm

# replace A and k with your real site values if you did the Global Wind Atlas lookup
SITES = {"low wind (A=6.0, k=2.0)": (6.0, 2.0),
         "medium wind (A=8.0, k=2.1)": (8.0, 2.1),
         "high wind (A=10.5, k=2.2)": (10.5, 2.2)}
S_GRID = np.array([0.8, 0.9, 1.0, 1.1, 1.2, 1.3])        # radius scale (1.0 = 63 m)
P_GRID = np.array([2.0, 3.0, 4.0, 5.0, 6.0])             # rated power, MW
WEIGHTS = {"baseline, no fixed cost (0.20 / 0.35 / 0.45 / 0.00)": (0.20, 0.35, 0.45, 0.00),
           "with fixed costs A (0.15 / 0.30 / 0.25 / 0.30)": (0.15, 0.30, 0.25, 0.30),
           "with fixed costs B (0.10 / 0.25 / 0.15 / 0.50)": (0.10, 0.25, 0.15, 0.50)}

af = bm.load_airfoils()
radius = bm.Rtip * S_GRID

aep, aep_nrel = {}, {}
for name, (A, k) in SITES.items():
    M = np.zeros((len(S_GRID), len(P_GRID)))
    for i, s in enumerate(S_GRID):
        for j, p in enumerate(P_GRID):
            M[i, j] = tm.aep_scaled(bm.CHORD_REF, bm.THETA_REF, s, p, af, A, k)
    aep[name] = M
    aep_nrel[name] = tm.aep_scaled(bm.CHORD_REF, bm.THETA_REF, 1.0, 5.0, af, A, k)
    print("done:", name)

best = {}
for wname, w in WEIGHTS.items():
    print(f"\n=== Cost weights: {wname} ===")
    cost = tm.cost_index(S_GRID[:, None], P_GRID[None, :], w)
    for name in SITES:
        lcoe = cost / (aep[name] / aep_nrel[name])        # 1.0 = NREL 5 MW turbine
        i, j = np.unravel_index(np.argmin(lcoe), lcoe.shape)
        sp = P_GRID[j] * 1e6 / (np.pi * radius[i] ** 2)
        cf = 100 * aep[name][i, j] * 1e6 / (P_GRID[j] * 1e3 * 8760)
        print(f"{name:28s} best: radius {radius[i]:.0f} m, rating {P_GRID[j]:.0f} MW, "
              f"specific power {sp:.0f} W/m2, CF {cf:.0f}%, LCOE index {lcoe[i, j]:.3f}")
        if wname.startswith("with fixed costs A"):
            best[name] = (lcoe, i, j)

fig, ax = plt.subplots(1, 3, figsize=(15, 4))
for a, name in zip(ax, SITES):
    lcoe, i, j = best[name]
    pc = a.pcolormesh(radius, P_GRID, lcoe.T, shading="nearest")
    a.plot(radius[i], P_GRID[j], "w*", markersize=16, markeredgecolor="k")
    a.set_title(name, fontsize=10)
    a.set_xlabel("Rotor radius (m)")
    a.set_ylabel("Rated power (MW)")
    fig.colorbar(pc, ax=a, label="LCOE index (NREL 5 MW = 1.0)")
fig.suptitle("Cost-per-energy index (baseline cost weights); star = best")
fig.tight_layout()
fig.savefig("size_scan.png", dpi=150)
plt.show()