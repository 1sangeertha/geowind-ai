from math import gamma
from scipy.optimize import brentq

RHO = 1.2   # assumed air density (kg/m3), close enough for this purpose


def weibull_from_mean_and_power(U, pd):
    """Weibull A and k from mean wind speed (m/s) and power density (W/m2)."""
    target = pd / (0.5 * RHO * U**3)
    f = lambda k: gamma(1 + 3 / k) / gamma(1 + 1 / k) ** 3 - target
    k = brentq(f, 1.2, 5.0)
    return U / gamma(1 + 1 / k), k


# put your readings here: (site name, mean speed in m/s, power density in W/m2) at 100 m
readings = [("muppandal ",9.99,837)]

for name, U, pd in readings:
    try:
        A, k = weibull_from_mean_and_power(U, pd)
        print(f"{name:28s} A = {A:.2f}, k = {k:.2f}")
    except ValueError:
        print(f"{name:28s} numbers don't fit a Weibull curve; use k = 2.0, A = {U / 0.886:.2f}")