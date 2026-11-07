import numpy as np
from pymoo.core.problem import ElementwiseProblem
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.optimize import minimize

import blade_model as bm
import objectives as ob

DEFL_MAX = 1.01


def optimise(A, k, pop=40, gen=40, seed=1):
    """Run NSGA-II for one site and return the Pareto designs."""
    af = bm.load_airfoils()
    ref = ob.make_reference(af)
    c_ref = bm.fit_ctrl(bm.CHORD_REF, 6)
    t_ref = bm.fit_ctrl(bm.THETA_REF, 6)
    xl = np.r_[0.7 * c_ref, t_ref - 3.0]
    xu = np.r_[1.3 * c_ref, t_ref + 3.0]

    class BladeProblem(ElementwiseProblem):
        def __init__(self):
            super().__init__(n_var=12, n_obj=2, n_ieq_constr=1, xl=xl, xu=xu)

        def _evaluate(self, x, out, *args, **kwargs):
            try:
                r = ob.evaluate_blade(x[:6], x[6:], af, A, k, ref=ref)
                aep, mass, defl = r["aep_gwh"], r["mass"], r["defl"]
                if not (np.isfinite(aep) and np.isfinite(defl)):
                    raise ValueError("bad result")
            except Exception:
                aep, mass, defl = 0.0, 10.0, 100.0
            out["F"] = [-aep, mass]
            out["G"] = [defl - DEFL_MAX]

    rng = np.random.default_rng(seed)
    X0 = xl + rng.random((pop, 12)) * (xu - xl)
    X0[0] = np.r_[c_ref, t_ref]
    res = minimize(BladeProblem(), NSGA2(pop_size=pop, sampling=X0),
                   ("n_gen", gen), seed=seed, verbose=False)
    base = ob.evaluate_blade(c_ref, t_ref, af, A, k, ref=ref)
    return {"aep": -res.F[:, 0], "mass": res.F[:, 1], "X": res.X,
            "base_aep": base["aep_gwh"], "c_ref": c_ref, "t_ref": t_ref,
            "xl": xl, "xu": xu}