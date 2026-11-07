from math import pi, cos, radians
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.optimize import brentq

from wisdem.inputs.validation import load_geometry_yaml
from wisdem.ccblade.ccblade import CCBlade, CCAirfoil

# ---------------- NREL 5 MW rotor (same as the WISDEM example) ----------------
Rhub, Rtip = 1.5, 63.0
r = np.array([2.8667, 5.6000, 8.3333, 11.7500, 15.8500, 19.9500, 24.0500,
              28.1500, 32.2500, 36.3500, 40.4500, 44.5500, 48.6500, 52.7500,
              56.1667, 58.9000, 61.6333])
chord = np.array([3.542, 3.854, 4.167, 4.557, 4.652, 4.458, 4.249, 4.007,
                  3.748, 3.502, 3.256, 3.010, 2.764, 2.518, 2.313, 2.086, 1.419])
theta = np.array([13.308, 13.308, 13.308, 13.308, 11.480, 10.162, 9.011, 7.795,
                  6.544, 5.361, 4.188, 3.125, 2.319, 1.526, 0.863, 0.370, 0.106])
B = 3
tilt, precone, yaw = 5.0, 2.5, 0.0
nSector = 8
rho, mu = 1.225, 1.81206e-5
shearExp, hubHt = 0.2, 90.0

# ---------------- Airfoil data from the original WISDEM yaml ----------------
yaml_path = Path(__file__).resolve().parent / "WISDEM-master" / "examples" / "02_reference_turbines" / "nrel5mw.yaml"
print("Loading:", yaml_path)
data = load_geometry_yaml(str(yaml_path))
af_data = data["airfoils"]
af_names = ["Cylinder1", "Cylinder2", "DU40_A17", "DU35_A17",
            "DU30_A17", "DU25_A17", "DU21_A17", "NACA64_A17"]
airfoil_types = [0] * len(af_names)
for i in range(len(af_names)):
    for j in range(len(af_data)):
        if af_data[j]["name"] == af_names[i]:
            polars = af_data[j]["polars"][0]
            airfoil_types[i] = CCAirfoil(
                polars["re_sets"][0]["cl"]["grid"],
                [polars["re_sets"][0]["re"]],
                polars["re_sets"][0]["cl"]["values"],
                polars["re_sets"][0]["cd"]["values"],
                polars["re_sets"][0]["cm"]["values"],
            )
af_idx = [0, 0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7]
af = [airfoil_types[k] for k in af_idx]

rotor = CCBlade(r, chord, theta, af, Rhub, Rtip, B, rho, mu,
                precone, tilt, yaw, shearExp, hubHt, nSector)

# ---------------- Turbine control settings (NREL 5 MW) ----------------
TSR_OPT = 7.55
OMEGA_MIN, OMEGA_MAX = 6.9, 12.1          # rpm
GEN_EFF = 0.944
P_RATED_AERO = 5.0e6 / GEN_EFF            # W of rotor power
R_EFF = Rtip * cos(radians(precone))
AREA = pi * R_EFF**2


def power(U, omega, pitch):
    out, _ = rotor.evaluate([U], [omega], [pitch])
    return float(out["P"][0])


def omega_for(U):
    return float(np.clip(U * TSR_OPT / Rtip * 30.0 / pi, OMEGA_MIN, OMEGA_MAX))


def operate(U):
    """Rotor speed (rpm), pitch (deg), aerodynamic power (W) at wind speed U."""
    omega = omega_for(U)
    p0 = power(U, omega, 0.0)
    if p0 <= P_RATED_AERO:
        return omega, 0.0, p0
    f = lambda pit: power(U, omega, pit) - P_RATED_AERO
    if f(40.0) > 0:
        return omega, np.nan, np.nan
    pitch = brentq(f, 0.0, 40.0, xtol=1e-3)
    return omega, pitch, P_RATED_AERO


# ---------------- Sweep ----------------
U_all = np.arange(3.0, 25.01, 0.5)
rows = [operate(U) for U in U_all]
omega_all = np.array([x[0] for x in rows])
pitch_all = np.array([x[1] for x in rows])
P_aero = np.array([x[2] for x in rows])
P_elec = P_aero * GEN_EFF
Cp = P_aero / (0.5 * rho * U_all**3 * AREA)

print(f"\n{'U (m/s)':>8} {'rpm':>6} {'pitch':>7} {'P_elec (kW)':>12} {'Cp':>7}")
for U, w, p, pe, c in zip(U_all, omega_all, pitch_all, P_elec, Cp):
    print(f"{U:8.1f} {w:6.2f} {p:7.2f} {pe/1e3:12.0f} {c:7.3f}")

# ---------------- Key numbers ----------------
U_rated = brentq(lambda U: power(U, omega_for(U), 0.0) - P_RATED_AERO, 8.0, 14.0, xtol=1e-3)
print(f"\nRated wind speed (this model): {U_rated:.2f} m/s   (published: 11.4)")
print(f"Max Cp (this model): {np.nanmax(Cp):.3f}   (published: 0.482)")

# ---------------- Plot 1: our power curve and Cp ----------------
fig1, ax = plt.subplots(1, 2, figsize=(11, 4))
ax[0].plot(U_all, P_elec / 1e3, "o-")
ax[0].set_xlabel("Wind speed (m/s)")
ax[0].set_ylabel("Electrical power (kW)")
ax[0].set_title("NREL 5 MW power curve (CCBlade)")
ax[0].grid()
ax[1].plot(U_all, Cp, "o-")
ax[1].set_xlabel("Wind speed (m/s)")
ax[1].set_ylabel("Cp")
ax[1].grid()
fig1.tight_layout()
fig1.savefig(Path(__file__).parent / "power_curve_5mw.png", dpi=150)

# ---------------- Comparison with the NREL reference file ----------------
ref_path = Path(__file__).parent / "data" / "NREL_Reference_5MW_126.csv"
if ref_path.exists():
    ref_df = pd.read_csv(ref_path)
    print("\nReference columns:", list(ref_df.columns))
    ws_col = [c for c in ref_df.columns if "wind" in c.lower()][0]
    p_col = [c for c in ref_df.columns
             if "power" in c.lower() and "coef" not in c.lower()][0]
    ref_ws = ref_df[ws_col].to_numpy(float)
    ref_p = ref_df[p_col].to_numpy(float)
    if ref_p.max() > 1e5:          # values were in W, convert to kW
        ref_p = ref_p / 1e3
    print(f"Reference max power: {ref_p.max():.0f} kW")

    mine = np.interp(ref_ws, U_all, P_elec / 1e3)
    mask = ref_p > 100
    err = 100 * (mine[mask] - ref_p[mask]) / ref_p[mask]
    print(f"Vs reference: mean |error| = {np.mean(np.abs(err)):.1f}%, "f"max |error| = {np.max(np.abs(err)):.1f}%")
    k = np.argmax(np.abs(err))
    print(f"Max error at {ref_ws[mask][k]:.1f} m/s: ours {mine[mask][k]:.0f} kW vs reference {ref_p[mask][k]:.0f} kW")    

    fig2 = plt.figure()
    plt.plot(ref_ws, ref_p, "k-", label="NREL reference")
    plt.plot(U_all, P_elec / 1e3, "o", label="CCBlade (ours)")
    plt.xlabel("Wind speed (m/s)")
    plt.ylabel("Electrical power (kW)")
    plt.legend()
    plt.grid()
    fig2.savefig(Path(__file__).parent / "power_curve_comparison.png", dpi=150)
else:
    print("\nReference file not found:", ref_path)

plt.show()