import json
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

import blade_model as bm
from nsga_site import optimise


def run_site(args):
    name, A, k = args
    d = optimise(A, k)
    designs = []
    for aep, mass, x in zip(d["aep"], d["mass"], d["X"]):
        designs.append({
            "aep": round(float(aep), 4),
            "mass": round(float(mass), 4),
            "chord": [round(float(v), 4) for v in bm.spline_values(x[:6])],
            "twist": [round(float(v), 4) for v in bm.spline_values(x[6:])],
        })
    return {"nrel_aep": round(float(d["base_aep"]), 4), "designs": designs}


if __name__ == "__main__":
    sites = pd.read_csv("sites.csv")
    if sites[["A", "k"]].isna().any().any():
        raise SystemExit("Fill in A and k for every site in sites.csv first.")

    jobs = [(row["name"], float(row["A"]), float(row["k"])) for _, row in sites.iterrows()]
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=min(6, len(jobs))) as ex:
        results = list(ex.map(run_site, jobs))
    print(f"Total time: {time.time() - t0:.0f} s\n")

    out = {
        "r_m": [round(float(v), 4) for v in bm.R],
        "rhub": bm.Rhub,
        "rtip": bm.Rtip,
        "nrel": {"chord": bm.CHORD_REF.tolist(), "twist": bm.THETA_REF.tolist()},
        "sites": [],
    }
    for (_, row), res in zip(sites.iterrows(), results):
        cf = 100 * res["nrel_aep"] * 1e6 / (5000 * 8760)
        best = max(d["aep"] for d in res["designs"])
        print(f"{row['name']:28s} NREL AEP {res['nrel_aep']:.2f} GWh (CF {cf:.0f}%), "
              f"best {best:.2f} GWh ({100 * (best / res['nrel_aep'] - 1):+.2f}%), "
              f"{len(res['designs'])} designs")
        out["sites"].append({
            "name": row["name"], "lat": float(row["lat"]), "lon": float(row["lon"]),
            "A": float(row["A"]), "k": float(row["k"]),
            "nrel_aep": res["nrel_aep"], "designs": res["designs"],
        })

    with open("designs.json", "w") as f:
        json.dump(out, f)
    print("\nSaved designs.json")