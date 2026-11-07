from math import pi
import numpy as np
from wisdem.ccblade.ccblade import CCBlade

import blade_model as bm
import objectives as ob

# tip speed limits taken from the NREL 5 MW controller settings
V_TIP_MAX = bm.OMEGA_MAX * pi / 30.0 * bm.Rtip      # m/s at rated rotor speed
V_TIP_MIN = bm.OMEGA_MIN * pi / 30.0 * bm.Rtip


def aep_scaled(chord_shape, twist, s, p_mw, af, A, k, n_sector=ob.N_SECTOR_FAST):
    """AEP (GWh) of the NREL-shaped blade scaled by s (radius) with rating p_mw (MW)."""
    Rtip = bm.Rtip * s
    rotor = CCBlade(bm.R * s, chord_shape * s, twist, af, bm.Rhub * s, Rtip,
                    bm.B, bm.RHO, bm.MU, bm.PRECONE, bm.TILT, bm.YAW,
                    bm.SHEAR_EXP, bm.HUB_HT * s, n_sector)
    omega_max = V_TIP_MAX / Rtip * 30.0 / pi
    omega_min = V_TIP_MIN / Rtip * 30.0 / pi
    omega = np.clip(ob.U_GRID * bm.TSR_OPT / Rtip * 30.0 / pi, omega_min, omega_max)
    out, _ = rotor.evaluate(ob.U_GRID, omega, np.zeros_like(ob.U_GRID))
    p = np.array(out["P"], dtype=float)
    p_rated = p_mw * 1e6 / bm.GEN_EFF
    hit = np.where(p >= p_rated)[0]
    if len(hit) > 0:
        p[hit[0]:] = p_rated          # controller pitches to hold rated power
    return ob.aep_gwh(p * bm.GEN_EFF / 1e3, A, k)


def cost_index(s, p_mw, weights):
    """Relative turbine cost (NREL 5 MW at s=1, 5 MW = 1.0). Weights are ASSUMED."""
    w_blade, w_drive, w_other, w_fixed = weights
    return w_blade * s**3 + w_drive * (p_mw / 5.0) + w_other * s**2 + w_fixed