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


def evaluate_blade(c_chord, c_twist, af, A, k, n_sector=N_SECTOR_FAST):
    """The 'judge': 12 control-point numbers + site -> AEP and mass index."""
    chord = bm.spline_values(np.asarray(c_chord))
    twist = bm.spline_values(np.asarray(c_twist))
    rotor = bm.build_rotor(chord, twist, af, n_sector=n_sector)
    p = fast_power_curve(rotor)
    aep = aep_gwh(p, A, k)
    return {"aep_gwh": aep, "cf": capacity_factor(aep), "mass": mass_index(chord)}