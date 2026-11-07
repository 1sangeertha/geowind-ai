import time
import numpy as np
import blade_model as bm
import objectives as ob

af = bm.load_airfoils()
c_chord = bm.fit_ctrl(bm.CHORD_REF, 6)
c_twist = bm.fit_ctrl(bm.THETA_REF, 6)

# Check 1: fast power curve vs the full controller version we validated
rotor = bm.build_rotor(bm.spline_values(c_chord), bm.spline_values(c_twist), af)
p_fast = ob.fast_power_curve(rotor)
p_full, _ = bm.power_curve(rotor, ob.U_GRID)
print(f"Fast vs full power curve: max difference = {np.max(np.abs(p_fast - p_full)):.1f} kW")

# Check 2: AEP at three example sites
sites = {"low wind (A=6, k=2.0)": (6.0, 2.0),
         "medium wind (A=8, k=2.1)": (8.0, 2.1),
         "high wind (A=10.5, k=2.2)": (10.5, 2.2)}
for name, (A, k) in sites.items():
    r = ob.evaluate_blade(c_chord, c_twist, af, A, k)
    print(f"{name:28s} AEP = {r['aep_gwh']:6.2f} GWh   capacity factor = {100*r['cf']:5.1f}%   mass index = {r['mass']:.3f}")

# Check 3: how long does one evaluation take?
t0 = time.time()
for _ in range(5):
    ob.evaluate_blade(c_chord, c_twist, af, 8.0, 2.1)
print(f"\nTime per blade evaluation: {(time.time() - t0) / 5:.2f} s")