import time
import numpy as np
import matplotlib.pyplot as plt
from pymoo.core.problem import ElementwiseProblem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize

import blade_model as bm
import objectives as ob

# ---- the site and the size of this run ----
A, K_WEIBULL = 8.0, 2.1
POP, GEN = 40, 40
DEFL_MAX = 1.01     # tip deflection allowed, relative to NREL (1% tolerance, see note)

af = bm.load_airfoils()
ref = ob.make_reference(af)
c_ref = bm.fit_ctrl(bm.CHORD_REF, 6)
t_ref = bm.fit_ctrl(bm.THETA_REF, 6)
x_ref = np.r_[c_ref, t_ref]

# search range: chord 70%..130% of NREL, twist within +-3 degrees
xl = np.r_[0.7 * c_ref, t_ref - 3.0]
xu = np.r_[1.3 * c_ref, t_ref + 3.0]


class BladeProblem(ElementwiseProblem):
    def __init__(self):
        super().__init__(n_var=12, n_obj=2, n_ieq_constr=1, xl=xl, xu=xu)

    def _evaluate(self, x, out, *args, **kwargs):
        try:
            r = ob.evaluate_blade(x[:6], x[6:], af, A, K_WEIBULL, ref=ref)
            aep, mass, defl = r["aep_gwh"], r["mass"], r["defl"]
            if not (np.isfinite(aep) and np.isfinite(defl)):
                raise ValueError("bad result")
        except Exception:
            aep, mass, defl = 0.0, 10.0, 100.0   # penalise designs that fail
        out["F"] = [-aep, mass]                  # maximise AEP = minimise -AEP
        out["G"] = [defl - DEFL_MAX]             # feasible when <= 0


rng = np.random.default_rng(1)
X0 = xl + rng.random((POP, 12)) * (xu - xl)
X0[0] = x_ref                                    # include the NREL blade itself

t0 = time.time()
res = minimize(BladeProblem(), NSGA2(pop_size=POP, sampling=X0),
               ("n_gen", GEN), seed=1, verbose=False)
print(f"Run time: {time.time() - t0:.0f} s")

if res.F is None:
    raise SystemExit("No feasible design found.")

aep = -res.F[:, 0]
mass = res.F[:, 1]
X = res.X
base = ob.evaluate_blade(c_ref, t_ref, af, A, K_WEIBULL, ref=ref)
print(f"\nNREL blade:  AEP = {base['aep_gwh']:.3f} GWh, mass = {base['mass']:.3f}, "
      f"deflection = {base['defl']:.3f}")
print(f"Feasible Pareto designs: {len(aep)}")

i = np.argmax(aep)
print(f"Highest AEP:  {aep[i]:.3f} GWh ({100*(aep[i]/base['aep_gwh']-1):+.2f}%), mass = {mass[i]:.3f}")
ok = aep >= 0.995 * base["aep_gwh"]
if ok.any():
    j = np.where(ok)[0][np.argmin(mass[ok])]
    print(f"Lightest with AEP >= 99.5% of NREL: {aep[j]:.3f} GWh, "
          f"mass = {mass[j]:.3f} ({100*(mass[j]/base['mass']-1):+.1f}%)")

# how far are chords from the NREL values? (1.0 = same as NREL; 0.7 / 1.3 = search limits)
scale = X[:, :6] / c_ref
print(f"\nChord scale of the designs: min {scale.min():.2f}, max {scale.max():.2f}")
tw = X[:, 6:] - t_ref
print(f"Twist change of the designs (deg): min {tw.min():.2f}, max {tw.max():.2f}")

np.savetxt("pareto_constrained.csv", np.c_[aep, mass, X], delimiter=",",
           header="aep_gwh,mass," + ",".join(f"c{k}" for k in range(6))
                  + "," + ",".join(f"t{k}" for k in range(6)), comments="")

plt.scatter(mass, aep, label="NSGA-II designs (deflection <= NREL)")
plt.scatter([base["mass"]], [base["aep_gwh"]], c="red", marker="*", s=200, label="NREL 5 MW blade")
plt.xlabel("Blade mass index (NREL = 1.0)")
plt.ylabel(f"AEP (GWh), site A={A}, k={K_WEIBULL}")
plt.legend()
plt.grid()
plt.savefig("pareto_constrained.png", dpi=150)
plt.show()