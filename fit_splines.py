import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import make_lsq_spline

# NREL 5 MW blade stations (same data as validate_5mw.py)
r = np.array([2.8667, 5.6000, 8.3333, 11.7500, 15.8500, 19.9500, 24.0500,
              28.1500, 32.2500, 36.3500, 40.4500, 44.5500, 48.6500, 52.7500,
              56.1667, 58.9000, 61.6333])
chord = np.array([3.542, 3.854, 4.167, 4.557, 4.652, 4.458, 4.249, 4.007,
                  3.748, 3.502, 3.256, 3.010, 2.764, 2.518, 2.313, 2.086, 1.419])
theta = np.array([13.308, 13.308, 13.308, 13.308, 11.480, 10.162, 9.011, 7.795,
                  6.544, 5.361, 4.188, 3.125, 2.319, 1.526, 0.863, 0.370, 0.106])

# position along the blade, scaled to 0 (root) ... 1 (tip)
s = (r - r[0]) / (r[-1] - r[0])


def fit(y, n_ctrl, k=3):
    """Cubic B-spline with n_ctrl control points, fitted to the data y."""
    interior = np.linspace(0, 1, n_ctrl - k + 1)[1:-1]
    knots = np.r_[[0.0] * (k + 1), interior, [1.0] * (k + 1)]
    return make_lsq_spline(s, y, knots, k=k)


ss = np.linspace(0, 1, 200)
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
for name, y, a in (("Chord (m)", chord, ax[0]), ("Twist (deg)", theta, ax[1])):
    a.plot(s, y, "ko", label="NREL 5 MW data")
    for n in (4, 5, 6, 8):
        spl = fit(y, n)
        err = np.max(np.abs(spl(s) - y))
        print(f"{name:12s} {n} control points: max error = {err:.3f}")
        a.plot(ss, spl(ss), label=f"{n} control points")
    a.set_xlabel("Blade span (0 = root, 1 = tip)")
    a.set_ylabel(name)
    a.legend()
    a.grid()
fig.tight_layout()
fig.savefig("spline_fit.png", dpi=150)
plt.show()