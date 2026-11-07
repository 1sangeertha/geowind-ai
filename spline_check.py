import numpy as np
import matplotlib.pyplot as plt
import blade_model as bm

af = bm.load_airfoils()
N = 6

c_chord = bm.fit_ctrl(bm.CHORD_REF, N)
c_twist = bm.fit_ctrl(bm.THETA_REF, N)
print("Chord control points:", np.round(c_chord, 3))
print("Twist control points:", np.round(c_twist, 3))

ref_rotor = bm.build_rotor(bm.CHORD_REF, bm.THETA_REF, af)
new_rotor = bm.build_rotor(bm.spline_values(c_chord), bm.spline_values(c_twist), af)

U = np.arange(3.0, 25.01, 1.0)
P_ref, Cp_ref = bm.power_curve(ref_rotor, U)
P_new, Cp_new = bm.power_curve(new_rotor, U)

mask = P_ref > 100
err = 100 * (P_new[mask] - P_ref[mask]) / P_ref[mask]
print(f"\nMax Cp:  original {Cp_ref.max():.3f}   12-number blade {Cp_new.max():.3f}")
print(f"Power difference: mean |{np.mean(np.abs(err)):.2f}|%, max |{np.max(np.abs(err)):.2f}|%")

plt.plot(U, P_ref, "k-", label="Original (34 numbers)")
plt.plot(U, P_new, "o", label="6+6 control points (12 numbers)")
plt.xlabel("Wind speed (m/s)")
plt.ylabel("Electrical power (kW)")
plt.legend()
plt.grid()
plt.savefig("spline_power_check.png", dpi=150)
plt.show()