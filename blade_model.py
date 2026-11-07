from math import pi, cos, radians
from pathlib import Path

import numpy as np
from scipy.interpolate import BSpline, make_lsq_spline
from scipy.optimize import brentq

from wisdem.inputs.validation import load_geometry_yaml
from wisdem.ccblade.ccblade import CCBlade, CCAirfoil

# ---------- NREL 5 MW reference blade ----------
YAML_PATH = Path(__file__).resolve().parent / "WISDEM-master" / "examples" / "02_reference_turbines" / "nrel5mw.yaml"
Rhub, Rtip = 1.5, 63.0
R = np.array([2.8667, 5.6000, 8.3333, 11.7500, 15.8500, 19.9500, 24.0500,
              28.1500, 32.2500, 36.3500, 40.4500, 44.5500, 48.6500, 52.7500,
              56.1667, 58.9000, 61.6333])
CHORD_REF = np.array([3.542, 3.854, 4.167, 4.557, 4.652, 4.458, 4.249, 4.007,
                      3.748, 3.502, 3.256, 3.010, 2.764, 2.518, 2.313, 2.086, 1.419])
THETA_REF = np.array([13.308, 13.308, 13.308, 13.308, 11.480, 10.162, 9.011, 7.795,
                      6.544, 5.361, 4.188, 3.125, 2.319, 1.526, 0.863, 0.370, 0.106])
S = (R - R[0]) / (R[-1] - R[0])          # span position, 0 = root, 1 = tip

B = 3
TILT, PRECONE, YAW = 5.0, 2.5, 0.0
N_SECTOR = 8
RHO, MU = 1.225, 1.81206e-5
SHEAR_EXP, HUB_HT = 0.2, 90.0

# ---------- controller settings ----------
TSR_OPT = 7.55
OMEGA_MIN, OMEGA_MAX = 6.9, 12.1         # rpm
GEN_EFF = 0.944
P_RATED_AERO = 5.0e6 / GEN_EFF           # W of rotor power
AREA = pi * (Rtip * cos(radians(PRECONE))) ** 2
K = 3                                    # cubic B-splines


# ---------- airfoils ----------
def load_airfoils():
    """Airfoil objects placed at each of the 17 blade stations."""
    data = load_geometry_yaml(str(YAML_PATH))
    af_data = data["airfoils"]
    names = ["Cylinder1", "Cylinder2", "DU40_A17", "DU35_A17",
             "DU30_A17", "DU25_A17", "DU21_A17", "NACA64_A17"]
    types = [0] * len(names)
    for i, nm in enumerate(names):
        for a in af_data:
            if a["name"] == nm:
                p = a["polars"][0]["re_sets"][0]
                polars = a["polars"][0]
                types[i] = CCAirfoil(p["cl"]["grid"], [p["re"]],
                                     p["cl"]["values"], p["cd"]["values"],
                                     p["cm"]["values"])
    idx = [0, 0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7]
    return [types[k] for k in idx]


# ---------- B-spline helpers ----------
def make_knots(n_ctrl):
    interior = np.linspace(0, 1, n_ctrl - K + 1)[1:-1]
    return np.r_[[0.0] * (K + 1), interior, [1.0] * (K + 1)]


def fit_ctrl(y, n_ctrl):
    """Control points of an n_ctrl-point spline fitted to the 17 station values."""
    return make_lsq_spline(S, y, make_knots(n_ctrl), k=K).c


def spline_values(c, s=S):
    """Spline value at span positions s, given control points c."""
    return BSpline(make_knots(len(c)), c, K)(s)


# ---------- CCBlade ----------
def build_rotor(chord, theta, af, n_sector=N_SECTOR):
    return CCBlade(R, chord, theta, af, Rhub, Rtip, B, RHO, MU,
                   PRECONE, TILT, YAW, SHEAR_EXP, HUB_HT, n_sector)


def _power(rotor, U, omega, pitch):
    out, _ = rotor.evaluate([U], [omega], [pitch])
    return float(out["P"][0])


def _omega_for(U):
    return float(np.clip(U * TSR_OPT / Rtip * 30.0 / pi, OMEGA_MIN, OMEGA_MAX))


def operate(rotor, U):
    """Rotor speed (rpm), pitch (deg), aerodynamic power (W) at wind speed U."""
    omega = _omega_for(U)
    p0 = _power(rotor, U, omega, 0.0)
    if p0 <= P_RATED_AERO:
        return omega, 0.0, p0
    f = lambda pit: _power(rotor, U, omega, pit) - P_RATED_AERO
    if f(40.0) > 0:
        return omega, np.nan, np.nan
    return omega, brentq(f, 0.0, 40.0, xtol=1e-3), P_RATED_AERO


def power_curve(rotor, U_all):
    """Returns electrical power (kW) and Cp at each wind speed."""
    rows = [operate(rotor, U) for U in U_all]
    P_aero = np.array([x[2] for x in rows])
    Cp = P_aero / (0.5 * RHO * np.asarray(U_all) ** 3 * AREA)
    return P_aero * GEN_EFF / 1e3, Cp