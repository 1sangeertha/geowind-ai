import numpy as np
import blade_model as bm

# Fast settings for the search: 1 m/s wind-speed step, 4 azimuth sectors
DU = 1.0
N_SECTOR_FAST = 4
U_GRID = np.arange(3.0, 25.01, DU)
OMEGA_GRID = np.clip(U_GRID * bm.TSR_OPT / bm.Rtip * 30.0 / np.pi,
                     bm.OMEGA_MIN, bm.OMEGA_MAX)


def fast_power_curve(rotor):
    """Electrical power (kW) at every wind speed in U_GRID (pitch = 0 below rated,
    rated power held above it, as the real controller would do)."""
    out, _ = rotor.evaluate(U_GRID, OMEGA_GRID, np.zeros_like(U_GRID))
    p = np.array(out["P"], dtype=float)
    hit = np.where(p >= bm.P_RATED_AERO)[0]
    if len(hit) > 0:
        p[hit[0]:] = bm.P_RATED_AERO
    return p * bm.GEN_EFF / 1e3


def weibull_bin_probs(A, k):
    """Fraction of the year spent in each wind-speed bin."""
    F = lambda u: 1.0 - np.exp(-(u / A) ** k)
    return F(U_GRID + DU / 2) - F(U_GRID - DU / 2)


def aep_gwh(power_kw, A, k):
    """Annual energy production in GWh for a Weibull site."""
    return 8760.0 * np.sum(power_kw * weibull_bin_probs(A, k)) / 1e6


def capacity_factor(aep, rated_kw=5000.0):
    return aep * 1e6 / (rated_kw * 8760.0)


def mass_index(chord_stations):
    """Blade mass proxy: integral of chord^2 along the blade, relative to NREL 5 MW (=1.0)."""
    def integral(c):
        return np.sum(0.5 * (c[1:] ** 2 + c[:-1] ** 2) * np.diff(bm.R))
    return integral(chord_stations) / integral(bm.CHORD_REF)


# ---------- loads and stiffness (all relative to the NREL 5 MW blade) ----------
U_LOAD, OMEGA_LOAD, PITCH_LOAD = 11.4, 12.1, 0.0     # design load case: rated wind


def flap_moments(rotor):
    """Flapwise bending moment (N*m) at the root and at the 17 blade stations."""
    loads, _ = rotor.distributedAeroLoads(U_LOAD, OMEGA_LOAD, PITCH_LOAD, 0.0)
    Np = np.asarray(loads["Np"], dtype=float)
    r = np.r_[bm.Rhub, bm.R, bm.Rtip]
    f = np.r_[0.0, Np, 0.0]
    M = np.zeros(len(r))
    for i in range(len(r) - 1):
        x = r[i:]
        g = f[i:] * (x - r[i])
        M[i] = np.sum(0.5 * (g[1:] + g[:-1]) * np.diff(x))
    return M[0], M[1:-1]                 # root moment, moments at the 17 stations


def raw_deflection(M_st, ei_rel):
    """Tip deflection of a cantilever blade, in arbitrary units (EI relative)."""
    x = bm.R - bm.Rhub
    L = bm.Rtip - bm.Rhub
    g = (L - x) * M_st / ei_rel
    return np.sum(0.5 * (g[1:] + g[:-1]) * np.diff(x))


def make_reference(af):
    """Root moment and raw deflection of the NREL 5 MW blade, used for normalising."""
    rotor = bm.build_rotor(bm.CHORD_REF, bm.THETA_REF, af, n_sector=N_SECTOR_FAST)
    M_root, M_st = flap_moments(rotor)
    return {"M_root": M_root, "defl": raw_deflection(M_st, np.ones(len(bm.R)))}


def evaluate_blade(c_chord, c_twist, af, A, k, ref=None, n_sector=N_SECTOR_FAST):
    """The 'judge': 12 control-point numbers + site -> AEP, mass, loads, deflection."""
    chord = bm.spline_values(np.asarray(c_chord))
    twist = bm.spline_values(np.asarray(c_twist))
    rotor = bm.build_rotor(chord, twist, af, n_sector=n_sector)
    p = fast_power_curve(rotor)
    aep = aep_gwh(p, A, k)
    out = {"aep_gwh": aep, "cf": capacity_factor(aep), "mass": mass_index(chord)}
    if ref is not None:
        M_root, M_st = flap_moments(rotor)
        ei_rel = (chord / bm.CHORD_REF) ** 4
        out["moment"] = M_root / ref["M_root"]
        out["defl"] = raw_deflection(M_st, ei_rel) / ref["defl"]
    return out