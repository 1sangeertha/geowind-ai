import numpy as np
import openmdao.api as om
from wisdem.nrelcsm.nrel_csm_mass_2015 import nrel_csm_2015


def build():
    prob = om.Problem(reports=False)
    prob.model = nrel_csm_2015()
    prob.setup()
    prob["blade_number"] = 3
    prob["blade_has_carbon"] = False
    prob["max_tip_speed"] = 80.0
    prob["turbine_class"] = 2
    prob["max_efficiency"] = 0.9
    return prob


def run(prob, rating_kw, diameter_m):
    prob["machine_rating"] = rating_kw
    prob["rotor_diameter"] = diameter_m
    prob["tower_length"] = 0.714 * diameter_m     # NREL 5 MW: 90 m tower for a 126 m rotor
    prob.run_model()
    return float(np.ravel(prob["turbine_cost_kW"])[0])


prob = build()

# 1. the NREL 5 MW reference case, and every cost and mass output the model offers
c = run(prob, 5000.0, 126.0)
print(f"NREL 5 MW: turbine cost = {c:.1f} USD/kW  ({c * 5000 / 1e6:.2f} million USD)\n")
for _, meta in prob.model.list_outputs(prom_name=True, val=True, out_stream=None):
    n = meta["prom_name"]
    if "cost" in n or "mass" in n:
        print(f"  {n:28s} {np.round(np.ravel(meta['val'])[0], 1)}")

# 2. cost relative to the NREL 5 MW for different rotor sizes and ratings
print("\nRelative turbine cost (NREL 5 MW = 1.00)")
print(f"{'diameter (m)':>13} " + " ".join(f"{p / 1000:>6.0f}MW" for p in (2000, 3000, 4000, 5000, 6000)))
for D in (100, 126, 150, 165):
    row = [run(prob, p, D) * p / (c * 5000) for p in (2000, 3000, 4000, 5000, 6000)]
    print(f"{D:13d} " + " ".join(f"{v:8.2f}" for v in row))
print("\nMy assumed proxy (baseline weights) minus CSM, same grid")
worst = 0.0
for D in (100, 126, 150, 165):
    s = D / 126.0
    row = []
    for p in (2000, 3000, 4000, 5000, 6000):
        csm = run(prob, p, D) * p / (c * 5000)
        proxy = 0.20 * s**3 + 0.35 * (p / 5000.0) + 0.45 * s**2
        row.append(proxy - csm)
        worst = max(worst, abs(proxy - csm) / csm)
    print(f"{D:13d} " + " ".join(f"{v:8.3f}" for v in row))
print(f"Largest relative difference: {100 * worst:.1f}%")