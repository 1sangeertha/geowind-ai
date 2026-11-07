# GeoWind AI

Site-based wind turbine blade design: from a wind climate (Weibull A and k) to ranked, optimised blade shapes, viewed in 3D.

**Status: Phase 1 prototype.** Validated aerodynamic model, optimiser, and a demo page that reads precomputed results. The generative model, recommender, explainability and live backend are planned (Phase 2).

## Setup (Windows)

1. Install Miniconda, then in a terminal:

```
conda create -n geowind2 -c conda-forge wisdem
conda activate geowind2
pip install neuralfoil matplotlib pymoo pandas
```

2. Download the WISDEM repository as a ZIP from https://github.com/WISDEM/WISDEM (Code, Download ZIP), extract it, and place the folder here so you have `WISDEM-master` next to the scripts. It supplies the NREL 5 MW blade data (`WISDEM-master/examples/02_reference_turbines/nrel5mw.yaml`). It is git-ignored.
3. In VS Code, select the `geowind2` interpreter (Ctrl+Shift+P, "Python: Select Interpreter").
4. Reference power curve: `data/NREL_Reference_5MW_126.csv` (from the NREL turbine-models archive, generator power curve).

Run scripts from the project folder, for example `python validate_5mw.py`.

## What each file does

**Core modules (imported by other scripts, not run directly)**
- `blade_model.py`: NREL 5 MW blade, 12-number spline blade description, CCBlade setup, controller, power curve.
- `objectives.py`: AEP from a Weibull site, mass index, root flap moment, tip-deflection index. Fast settings: 4 azimuth sectors, 1 m/s wind step.
- `nsga_site.py`: NSGA-II for one site (2 objectives, 1 deflection constraint).
- `turbine_model.py`: geometric scaling of rotor radius and rating, plus an ASSUMED cost proxy.

**Scripts you run**
- `validate_5mw.py`: power curve against the NREL reference.
- `fit_splines.py`, `spline_check.py`: how many control points are needed; power check of the 12-number blade.
- `test_objectives.py`, `test_speed.py`, `test_loads.py`: checks and timing of the objectives.
- `run_nsga.py`: one constrained NSGA-II run (medium-wind site).
- `compare_sites.py`: three wind classes in parallel.
- `scan_size.py`: rotor size and rating scan with cost-weight sensitivity.
- `plot_blades.py`: planform, chord and twist of NREL vs an optimised blade.
- `weibull_from_gwa.py`: Weibull A and k from Global Wind Atlas mean speed and power density.
- `sites.csv`, `precompute_sites.py`: six sites, optimiser run for each, writes `designs.json`.
- `test.py`: NeuralFoil sanity check only.

**Demo**
- `demo.html` + `designs.js`: map, ranking slider (TOPSIS) and 3D blade. Open `demo.html` in a browser (needs internet for the map and 3D library). Rebuild the data file after a new run:

```
python -c "import json; open('designs.js','w').write('const DATA=' + open('designs.json').read() + ';')"
```

## Results so far (all within our model)

| Check | Result |
|---|---|
| NREL 5 MW power curve vs reference | mean error 0.6%, largest 6.9% at 4 m/s (13 kW) |
| Rated wind speed | 11.38 m/s (published 11.4) |
| Peak Cp | 0.476 (published 0.482) |
| 12-number blade vs original 34 numbers | power difference at most 0.13% |
| Chord and twist reshaping, AEP gain | about +0.4 to +1.4% (site dependent) |
| Speed of one evaluation | 0.29 s (fast settings) |

## Known limitations

- BEM with a rigid blade; lower fidelity than CFD or aeroelastic codes.
- Airfoils are the fixed NREL ones. NeuralFoil is installed but not yet used in the pipeline.
- Mass index (integral of chord squared) and tip-deflection index (stiffness scaling with chord to the fourth) are screening-level proxies, not structural design.
- Cost proxy in `turbine_model.py` uses ASSUMED weights. Results depend on them, so do not quote rotor-size findings until it is replaced by the NREL Cost and Scaling Model.
- Wind data are long-term atlas averages (Global Wind Atlas, 100 m) and Weibull values are derived, not measured.
- Fatigue and unsteady aeroelastic effects are not modelled.

## Next (Phase 2)

1. Calibrated cost model; design variables = rotor radius and specific power.
2. Dataset of NSGA-II fronts at a few hundred synthetic sites.
3. Conditional generative model (normalizing flow) with baselines: random, direct NSGA-II, CVAE, cWGAN-GP.
4. Web backend (FastAPI), wind-data lookup, and explanations.
