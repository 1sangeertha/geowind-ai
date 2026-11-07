import time
import numpy as np
import matplotlib.pyplot as plt
from pymoo.core.problem import ElementwiseProblem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize

import blade_model as bm
import objectives as ob

# ---- the site and the size of this test run ----
A, K_WEIBULL = 8.0, 2.1
POP, GEN = 24, 15

af = bm.load_airfoils()
c_ref = bm.fit_ctrl(bm.CHORD_REF, 6)      # NREL blade as 6 chord numbers
t_ref = bm.fit_ctrl(bm.THETA_REF, 6)      # ... and 6 twist numbers
x_ref = np.r_[c_ref, t_ref]

# search range: chord from 70% to 130% of NREL, twist within +-3 degrees
xl = np.r_[0.7 * c_ref, t_ref - 3.0]
xu = np.r_[1.3 * c_ref, t_ref + 3.0]


class BladeProblem(ElementwiseProblem):
    def __init__(self):
        super().__init__(n_var=12, n_obj=2, xl=xl, xu=xu)

    def _evaluate(self, x, out, *args, **kwargs):
        try:
            r = ob.evaluate_blade(x[:6], x[6:], af, A, K_WEIBULL)
            aep, mass = r["aep_gwh"], r["mass"]
            if not np.isfinite(aep):
                raise ValueError("bad result")
        except Exception:
            aep, mass = 0.0, 10.0           # penalise designs that fail
        out["F"] = [-aep, mass]              # pymoo minimises: maximise AEP = minimise -AEP


# starting designs: random ones, plus the NREL blade itself
rng = np.random.default_rng(1)
X0 = xl + rng.random((POP, 12)) * (xu - xl)
X0[0] = x_ref

t0 = time.time()
res = minimize(BladeProblem(), NSGA2(pop_size=POP, sampling=X0),
               ("n_gen", GEN), seed=1, verbose=True)
print(f"\nRun time: {time.time() - t0:.0f} s")

aep = -res.F[:, 0]
mass = res.F[:, 1]
ref = ob.evaluate_blade(c_ref, t_ref, af, A, K_WEIBULL)

print(f"\nNREL blade:        AEP = {ref['aep_gwh']:.3f} GWh, mass index = {ref['mass']:.3f}")
print(f"Pareto designs found: {len(aep)}")
i = np.argmax(aep)
print(f"Highest AEP design: AEP = {aep[i]:.3f} GWh ({100*(aep[i]/ref['aep_gwh']-1):+.2f}%), "
      f"mass index = {mass[i]:.3f}")
ok = aep >= 0.99 * ref["aep_gwh"]
if ok.any():
    j = np.where(ok)[0][np.argmin(mass[ok])]
    print(f"Lightest design with AEP >= 99% of NREL: AEP = {aep[j]:.3f} GWh, "
          f"mass index = {mass[j]:.3f} ({100*(mass[j]/ref['mass']-1):+.1f}% mass)")

np.savetxt("pareto_test.csv", np.c_[aep, mass, res.X], delimiter=",",
           header="aep_gwh,mass," + ",".join(f"c{i}" for i in range(6))
                  + "," + ",".join(f"t{i}" for i in range(6)), comments="")

plt.scatter(mass, aep, label="NSGA-II designs")
plt.scatter([ref["mass"]], [ref["aep_gwh"]], c="red", marker="*", s=200, label="NREL 5 MW blade")
plt.xlabel("Blade mass index (NREL = 1.0)")
plt.ylabel(f"AEP (GWh), site A={A}, k={K_WEIBULL}")
plt.legend()
plt.grid()
plt.savefig("pareto_test.png", dpi=150)
plt.show()