import numpy as np
import blade_model as bm
import objectives as ob

af = bm.load_airfoils()
ref = ob.make_reference(af)
print(f"NREL blade root flap moment (rated wind, pitch 0): {ref['M_root']/1e6:.1f} MN*m\n")

c0 = bm.fit_ctrl(bm.CHORD_REF, 6)
t0 = bm.fit_ctrl(bm.THETA_REF, 6)
print(f"{'chord scale':>11} {'AEP (GWh)':>10} {'mass':>6} {'root moment':>12} {'tip deflection':>15}")
for s in (0.7, 0.85, 1.0, 1.15, 1.3):
    r = ob.evaluate_blade(s * c0, t0, af, 8.0, 2.1, ref=ref)
    print(f"{s:11.2f} {r['aep_gwh']:10.3f} {r['mass']:6.2f} {r['moment']:12.2f} {r['defl']:15.2f}")