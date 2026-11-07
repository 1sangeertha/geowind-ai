import time
import numpy as np
import blade_model as bm
from wisdem.ccblade.ccblade import CCBlade

af = bm.load_airfoils()
chord = bm.spline_values(bm.fit_ctrl(bm.CHORD_REF, 6))
twist = bm.spline_values(bm.fit_ctrl(bm.THETA_REF, 6))
A, k = 8.0, 2.1


def run(nsec, du):
    U = np.arange(3.0, 25.01, du)
    om = np.clip(U * bm.TSR_OPT / bm.Rtip * 30.0 / np.pi, bm.OMEGA_MIN, bm.OMEGA_MAX)
    t0 = time.time()
    rotor = CCBlade(bm.R, chord, twist, af, bm.Rhub, bm.Rtip, bm.B, bm.RHO, bm.MU,
                    bm.PRECONE, bm.TILT, bm.YAW, bm.SHEAR_EXP, bm.HUB_HT, nsec)
    t_build = time.time() - t0
    t0 = time.time()
    out, _ = rotor.evaluate(U, om, np.zeros_like(U))
    t_eval = time.time() - t0
    p = np.array(out["P"], dtype=float)
    hit = np.where(p >= bm.P_RATED_AERO)[0]
    if len(hit) > 0:
        p[hit[0]:] = bm.P_RATED_AERO
    p = p * bm.GEN_EFF / 1e3
    F = lambda u: 1.0 - np.exp(-(u / A) ** k)
    aep = 8760.0 * np.sum(p * (F(U + du / 2) - F(U - du / 2))) / 1e6
    return aep, t_build, t_eval


run(8, 0.5)  # warm-up call, not timed or printed

ref_aep, _, _ = run(8, 0.5)
print(f"{'nSector':>8} {'step (m/s)':>11} {'AEP (GWh)':>10} {'error':>8} {'build (s)':>10} {'eval (s)':>9}")
for nsec in (8, 4):
    for du in (0.5, 1.0):
        aep, tb, te = run(nsec, du)
        err = 100 * (aep - ref_aep) / ref_aep
        print(f"{nsec:8d} {du:11.1f} {aep:10.3f} {err:7.2f}% {tb:10.3f} {te:9.3f}")