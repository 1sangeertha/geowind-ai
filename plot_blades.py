import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import blade_model as bm

d = pd.read_csv("pareto_constrained.csv")
aep_ref = 14.918                      # NREL AEP at the medium-wind site (from the run)
ok = d[d["aep_gwh"] >= 0.995 * aep_ref]
pick = ok.loc[ok["mass"].idxmin()]
c_new = pick[[f"c{i}" for i in range(6)]].to_numpy(float)
t_new = pick[[f"t{i}" for i in range(6)]].to_numpy(float)
c_old = bm.fit_ctrl(bm.CHORD_REF, 6)
t_old = bm.fit_ctrl(bm.THETA_REF, 6)

s = np.linspace(0, 1, 200)
r = bm.R[0] + s * (bm.R[-1] - bm.R[0])

fig, ax = plt.subplots(1, 3, figsize=(15, 4))
for c, col, lab in ((bm.spline_values(c_old, s), "k", "NREL 5 MW"),
                    (bm.spline_values(c_new, s), "tab:blue", "Optimised (lighter)")):
    ax[0].fill_between(r, -c / 2, c / 2, alpha=0.35, color=col, label=lab)
    ax[0].plot(r, c / 2, color=col)
    ax[0].plot(r, -c / 2, color=col)
    ax[1].plot(r, c, color=col, label=lab)
ax[2].plot(r, bm.spline_values(t_old, s), "k", label="NREL 5 MW")
ax[2].plot(r, bm.spline_values(t_new, s), "tab:blue", label="Optimised (lighter)")
ax[0].set_title("Blade planform (top view)")
ax[0].set_xlabel("Radius (m)"); ax[0].set_aspect("equal")
ax[1].set_title("Chord"); ax[1].set_xlabel("Radius (m)"); ax[1].set_ylabel("m")
ax[2].set_title("Twist"); ax[2].set_xlabel("Radius (m)"); ax[2].set_ylabel("deg")
for a in ax:
    a.grid(); a.legend()
fig.tight_layout()
fig.savefig("blade_comparison.png", dpi=150)
plt.show()
print(f"Chosen design: AEP {pick['aep_gwh']:.3f} GWh, mass index {pick['mass']:.3f}")