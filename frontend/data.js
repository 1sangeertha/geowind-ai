/**
 * GeoWind AI - Data Access Layer
 * 
 * ISOLATION CONTRACT:
 * All access to the underlying dataset is isolated within this file.
 * The rest of the application interacts strictly through `getSites()` and `getDesigns()`.
 * To migrate to a live backend (e.g. FastAPI / Flask / Express), replace the internals
 * of these functions with asynchronous `fetch('/api/sites')` and `fetch('/api/designs/${siteId}')`.
 */

(function (global) {
  'use strict';

  /**
   * Safe getter to retrieve the raw DATA object.
   * Throws a descriptive error if designs.js has not been loaded.
   */
  function _raw() {
    if (typeof DATA === 'undefined' || !DATA) {
      throw new Error(
        'designs.js is not loaded or does not define global const DATA. ' +
        'Ensure designs.js is present in the parent directory or next to index.html.'
      );
    }
    return DATA;
  }

  /**
   * Retrieves all available wind turbine installation sites with precomputed metadata.
   * @returns {Promise<Array<{id: number, name: string, lat: number, lon: number, A: number, k: number, nrel_aep: number, capacityFactor: number, designCount: number}>>}
   */
  async function getSites() {
    const raw = _raw();
    return raw.sites.map((s, idx) => {
      // Turbine rating: 5000 kW (5 MW), 8760 hours/year -> 43,800,000 kWh = 43.8 GWh theoretical maximum
      const capacityFactor = (s.nrel_aep * 1e6) / (5000 * 8760) * 100;
      return {
        id: idx,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        A: s.A, // Weibull scale parameter (m/s)
        k: s.k, // Weibull shape parameter
        nrel_aep: s.nrel_aep, // Baseline AEP in GWh
        capacityFactor: capacityFactor,
        isLowWindViable: capacityFactor >= 10.0,
        designCount: s.designs ? s.designs.length : 0
      };
    });
  }

  /**
   * Retrieves all Pareto blade designs and geometric context for a given site.
   * @param {number} siteId - Index of the site in DATA.sites
   * @returns {Promise<{
   *   site: {id: number, name: string, lat: number, lon: number, A: number, k: number, nrel_aep: number, capacityFactor: number},
   *   designs: Array<{id: number, aep: number, mass: number, chord: number[], twist: number[]}>,
   *   nrel: {chord: number[], twist: number[]},
   *   r_m: number[],
   *   rhub: number,
   *   rtip: number
   * }>}
   */
  async function getDesigns(siteId) {
    const raw = _raw();
    const siteIndex = Math.max(0, Math.min(siteId, raw.sites.length - 1));
    const siteRaw = raw.sites[siteIndex];

    const capacityFactor = (siteRaw.nrel_aep * 1e6) / (5000 * 8760) * 100;

    return {
      site: {
        id: siteIndex,
        name: siteRaw.name,
        lat: siteRaw.lat,
        lon: siteRaw.lon,
        A: siteRaw.A,
        k: siteRaw.k,
        nrel_aep: siteRaw.nrel_aep,
        capacityFactor: capacityFactor,
        isLowWindViable: capacityFactor >= 10.0
      },
      // Deep copy designs array to avoid accidental mutation
      designs: siteRaw.designs.map((d, dIdx) => ({
        id: dIdx,
        aep: d.aep,
        mass: d.mass,
        chord: [...d.chord],
        twist: [...d.twist]
      })),
      nrel: {
        chord: [...raw.nrel.chord],
        twist: [...raw.nrel.twist]
      },
      r_m: [...raw.r_m],
      rhub: raw.rhub,
      rtip: raw.rtip
    };
  }

  // Export to global scope
  global.DataService = {
    getSites,
    getDesigns,
    isAvailable: function () {
      return typeof DATA !== 'undefined' && !!DATA;
    }
  };

})(typeof window !== 'undefined' ? window : this);
