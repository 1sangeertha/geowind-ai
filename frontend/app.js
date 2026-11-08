/**
 * GeoWind AI - Main Application Controller
 * 
 * Orchestrates:
 * - Data retrieval through the isolated DataService
 * - TOPSIS multi-criteria Pareto re-ranking
 * - Leaflet interactive map with custom capacity factor markers
 * - 3D blade viewer with continuous vertex morphing
 * - Synchronized profile charts & live telemetry tiles
 * 
 * DEFENSIVE DOM GUARDS:
 * Every DOM manipulation is guarded via safe helper functions so that
 * no missing or null DOM element can ever halt script execution.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    sites: [],
    currentSiteIndex: 0,
    currentSiteData: null,
    priorityWeight: 0.60, // 0.0 (mass focus) to 1.0 (energy focus)
    rankedResults: [],
    selectedRankIndex: 0,
    leafletMap: null,
    mapMarkers: []
  };

  const $ = (id) => document.getElementById(id);

  // Safe DOM Mutation Helpers
  function safeSetText(id, text) {
    try {
      const el = typeof id === 'string' ? $(id) : id;
      if (el) el.textContent = (text !== undefined && text !== null) ? text : '';
    } catch (e) {
      console.warn('safeSetText warning on', id, e);
    }
  }

  function safeSetHTML(id, html) {
    try {
      const el = typeof id === 'string' ? $(id) : id;
      if (el) el.innerHTML = (html !== undefined && html !== null) ? html : '';
    } catch (e) {
      console.warn('safeSetHTML warning on', id, e);
    }
  }

  function safeSetClass(id, className, condition) {
    try {
      const el = typeof id === 'string' ? $(id) : id;
      if (el) {
        if (condition !== undefined) {
          el.classList.toggle(className, !!condition);
        } else {
          el.className = className;
        }
      }
    } catch (e) {
      console.warn('safeSetClass warning on', id, e);
    }
  }

  /**
   * TOPSIS Algorithm (Technique for Order of Preference by Similarity to Ideal Solution)
   * Evaluates designs balancing Annual Energy Production (AEP) vs Blade Structural Mass.
   */
  function topsis(designs, w) {
    if (!designs || designs.length === 0) return [];

    const normAep = Math.hypot(...designs.map(d => d.aep));
    const normMass = Math.hypot(...designs.map(d => d.mass));

    const weightedAep = designs.map(d => (w * d.aep) / (normAep || 1));
    const weightedMass = designs.map(d => ((1 - w) * d.mass) / (normMass || 1));

    // Ideal best & worst points: Maximize AEP, Minimize Mass
    const aepBest = Math.max(...weightedAep);
    const aepWorst = Math.min(...weightedAep);
    const massBest = Math.min(...weightedMass); // lower mass is better
    const massWorst = Math.max(...weightedMass); // higher mass is worse

    return designs.map((d, i) => {
      const distBest = Math.hypot(weightedAep[i] - aepBest, weightedMass[i] - massBest);
      const distWorst = Math.hypot(weightedAep[i] - aepWorst, weightedMass[i] - massWorst);
      const closeness = distWorst / ((distBest + distWorst) || 1);
      return {
        i,
        c: closeness,
        design: d
      };
    }).sort((x, y) => y.c - x.c);
  }

  /**
   * Generates a plain-language aerodynamic explanation conforming to physics metrics
   */
  function generateExplanation(d, s, nrel, r_m) {
    if (!d || !s || !nrel || !r_m) return 'Analyzing aerodynamic parameters...';

    const avg = (arr, indices) => indices.reduce((sum, idx) => sum + arr[idx], 0) / (indices.length || 1);
    const where = (fn) => r_m.map((r, idx) => (fn(r) ? idx : -1)).filter(idx => idx >= 0);

    const outerIndices = where(r => r > 40);
    const innerIndices = where(r => r < 30);

    const gain = 100 * (d.aep / s.nrel_aep - 1);
    const cr = 100 * (avg(d.chord, outerIndices) / avg(nrel.chord, outerIndices) - 1);
    const dt = avg(d.twist, innerIndices) - avg(nrel.twist, innerIndices);

    return `At ${s.name} this design yields ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}% annual energy against the NREL blade, with a ${Math.abs(100 * (d.mass - 1)).toFixed(0)}% ${d.mass < 1 ? 'lower' : 'higher'} mass index. Beyond 40 m radius its chord is ${Math.abs(cr).toFixed(0)}% ${cr < 0 ? 'narrower' : 'wider'}, and inner twist is ${Math.abs(dt).toFixed(1)} degrees ${dt < 0 ? 'lower' : 'higher'}. Tip deflection is held at or below the NREL blade's.`;
  }

  /**
   * Initializes the application once the DOM is ready
   */
  async function initApp() {
    try {
      if (!window.DataService || !window.DataService.isAvailable()) {
        showError('designs.js is not loaded. Please ensure designs.js is located in the root or frontend folder.');
        return;
      }

      // 1. Fetch sites through isolated DataService
      state.sites = await window.DataService.getSites();

      // 2. Setup Site Buttons
      renderSiteSelector();

      // 3. Initialize Leaflet Map
      initLeafletMap();

      // 4. Load initial site data
      await loadSite(state.currentSiteIndex, false);

      // 5. Initialize 3D Viewer & Charts
      const context = state.currentSiteData;
      if (window.BladeViewer3D && context) {
        window.BladeViewer3D.init('view3dStage', context);
      }
      if (window.BladeCharts) {
        window.BladeCharts.init('chordChartContainer', 'twistChartContainer');
      }

      // 6. Setup Event Listeners
      setupControls();

      // 7. Initial refresh
      refreshView(false);

    } catch (err) {
      console.error('Initialization error:', err);
      showError(err.message || 'Error initializing wind blade design studio.');
    }
  }

  /**
   * Loads site data and recalculates Pareto rankings
   */
  async function loadSite(siteIndex, preserveRankIndex) {
    try {
      state.currentSiteIndex = siteIndex;
      state.currentSiteData = await window.DataService.getDesigns(siteIndex);

      if (!preserveRankIndex) {
        state.selectedRankIndex = 0;
      }

      // Synchronize UI elements
      updateSiteButtons();
      updateMapMarkerSelection();

      // Re-rank designs for new site
      state.rankedResults = topsis(state.currentSiteData.designs, state.priorityWeight);

      // Update 3D wind speed default based on site Weibull A parameter
      const siteWeibullA = state.currentSiteData.site.A;
      const windSlider = $('windSlider');
      if (windSlider) {
        windSlider.value = siteWeibullA.toFixed(1);
      }
      safeSetText('windSpeedVal', `${siteWeibullA.toFixed(1)} m/s`);
      if (window.BladeViewer3D) {
        window.BladeViewer3D.setWindSpeed(siteWeibullA);
      }
    } catch (e) {
      console.error('loadSite error:', e);
    }
  }

  /**
   * Renders the 6 interactive site cards
   */
  function renderSiteSelector() {
    const list = $('siteCardList');
    if (!list) return;

    list.innerHTML = state.sites.map((s, idx) => {
      const cfClass = s.capacityFactor >= 30 ? 'high-cf' : (s.capacityFactor >= 15 ? 'med-cf' : 'low-cf');
      return `
        <button type="button" class="site-chip ${idx === state.currentSiteIndex ? 'active' : ''}" data-site-idx="${idx}" aria-label="Select ${s.name}">
          <div class="site-chip-header">
            <span class="site-chip-name">${s.name}</span>
            <span class="site-chip-cf ${cfClass}">${s.capacityFactor.toFixed(0)}% CF</span>
          </div>
          <div class="site-chip-stats">
            <span>A: <b>${s.A.toFixed(1)}</b> m/s</span>
            <span>k: <b>${s.k.toFixed(2)}</b></span>
          </div>
        </button>`;
    }).join('');

    list.querySelectorAll('.site-chip').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.siteIdx, 10);
        await loadSite(idx, false);
        refreshView(false);
      });
    });
  }

  function updateSiteButtons() {
    document.querySelectorAll('.site-chip').forEach(btn => {
      const idx = parseInt(btn.dataset.siteIdx, 10);
      btn.classList.toggle('active', idx === state.currentSiteIndex);
    });
  }

  /**
   * Initializes Leaflet Map with Esri World Street Map Tiles
   */
  function initLeafletMap() {
    if (typeof L === 'undefined') {
      safeSetHTML('mapView', '<div class="map-fallback">Leaflet map library could not be loaded. Use the site selector buttons above.</div>');
      return;
    }

    const mapEl = $('mapView');
    if (!mapEl) return;

    try {
      // Centered over India
      state.leafletMap = L.map('mapView', {
        zoomControl: true,
        scrollWheelZoom: false
      }).setView([19.5, 78.5], 4.5);

      // Hard constraint: Esri World Street Map tiles
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; World Street Map',
        maxZoom: 12,
        minZoom: 3
      }).addTo(state.leafletMap);

      // Add marker for each site
      state.mapMarkers = state.sites.map((s, idx) => {
        const isSelected = idx === state.currentSiteIndex;
        const marker = L.circleMarker([s.lat, s.lon], {
          radius: isSelected ? 11 : 8,
          color: isSelected ? '#00d2d3' : '#0284c7',
          fillColor: isSelected ? '#38bdf8' : '#0ea5e9',
          fillOpacity: 0.85,
          weight: isSelected ? 3 : 2
        }).addTo(state.leafletMap);

        const tooltipContent = `
          <div class="map-tooltip-card">
            <strong>${s.name}</strong><br/>
            <span>Capacity Factor: <b>${s.capacityFactor.toFixed(1)}%</b></span><br/>
            <span>Weibull A: <b>${s.A} m/s</b> (k=${s.k})</span>
          </div>`;
        marker.bindTooltip(tooltipContent, { direction: 'top', className: 'custom-map-tooltip' });

        marker.on('click', async () => {
          await loadSite(idx, false);
          refreshView(false);
        });

        return marker;
      });
    } catch (e) {
      console.warn('Map initialization error:', e);
    }
  }

  function updateMapMarkerSelection() {
    if (!state.mapMarkers.length) return;
    state.mapMarkers.forEach((marker, idx) => {
      const isSelected = idx === state.currentSiteIndex;
      marker.setStyle({
        radius: isSelected ? 11 : 8,
        color: isSelected ? '#00d2d3' : '#0284c7',
        fillColor: isSelected ? '#38bdf8' : '#0ea5e9',
        fillOpacity: isSelected ? 0.95 : 0.75,
        weight: isSelected ? 3.5 : 2
      });
    });

    const activeSite = state.sites[state.currentSiteIndex];
    if (state.leafletMap && activeSite) {
      state.leafletMap.panTo([activeSite.lat, activeSite.lon], { animate: true, duration: 0.6 });
    }
  }

  /**
   * Refreshes all UI views (table, telemetry tiles, 3D morphing, charts, explanation)
   */
  function refreshView(preserveSelection) {
    if (!state.currentSiteData) return;

    const s = state.currentSiteData.site;
    const designs = state.currentSiteData.designs;
    const nrel = state.currentSiteData.nrel;
    const r_m = state.currentSiteData.r_m;

    // 1. Re-rank with current weight
    state.rankedResults = topsis(designs, state.priorityWeight);

    if (!preserveSelection || state.selectedRankIndex >= state.rankedResults.length) {
      state.selectedRankIndex = 0;
    }

    const selectedRankItem = state.rankedResults[state.selectedRankIndex] || state.rankedResults[0];
    const selectedDesign = selectedRankItem ? selectedRankItem.design : designs[0];

    // 2. Site Climate Card Telemetry (Defensive)
    try {
      renderSiteClimateInfo(s);
    } catch (e) {
      console.warn('renderSiteClimateInfo error:', e);
    }

    // 3. Ranked Leaderboard Table (Defensive)
    try {
      renderLeaderboardTable(s);
    } catch (e) {
      console.warn('renderLeaderboardTable error:', e);
    }

    // 4. Live Metric Tiles (Defensive)
    try {
      renderMetricTiles(selectedDesign, s);
    } catch (e) {
      console.warn('renderMetricTiles error:', e);
    }

    // 5. Automated Engineering Explanation (Defensive)
    try {
      const explanationText = generateExplanation(selectedDesign, s, nrel, r_m);
      safeSetText('whyExplanation', explanationText);
    } catch (e) {
      console.warn('explanation generation error:', e);
    }

    // 6. Update 3D Viewer Morphing (Defensive)
    try {
      if (window.BladeViewer3D) {
        window.BladeViewer3D.morphToDesign(selectedDesign, state.currentSiteData);
      }
    } catch (e) {
      console.warn('BladeViewer3D morph error:', e);
    }

    // 7. Update Aerodynamic Profile Charts (Defensive)
    try {
      if (window.BladeCharts) {
        window.BladeCharts.update(selectedDesign, nrel, r_m);
      }
    } catch (e) {
      console.warn('BladeCharts update error:', e);
    }
  }

  /**
   * Renders the Site Climate & Viability telemetry banner
   */
  function renderSiteClimateInfo(s) {
    if (!s) return;
    const cf = s.capacityFactor;
    const isViable = s.isLowWindViable;

    safeSetText('climateSiteName', s.name);
    safeSetText('climateWeibullA', `${s.A.toFixed(2)} m/s`);
    safeSetText('climateWeibullK', s.k.toFixed(2));
    safeSetText('climateNrelCf', `${cf.toFixed(1)}%`);

    const alertBanner = $('climateViabilityBanner');
    if (alertBanner) {
      if (!isViable) {
        alertBanner.classList.remove('hidden');
        alertBanner.innerHTML = `
          <div class="climate-warning-badge">
            <span class="warning-icon">⚠️</span>
            <span><b>Marginal Wind Resource:</b> Capacity factor is under 10%. Site is economically unviable for this 5 MW turbine specification.</span>
          </div>`;
      } else {
        alertBanner.classList.add('hidden');
        alertBanner.innerHTML = '';
      }
    }
  }

  /**
   * Renders the Ranked Pareto Designs Leaderboard Table
   */
  function renderLeaderboardTable(site) {
    const tbody = $('leaderboardRows');
    if (!tbody || !state.rankedResults.length) return;

    const topList = state.rankedResults.slice(0, 7);

    tbody.innerHTML = topList.map((item, rankIdx) => {
      const d = item.design;
      const energyDelta = (d.aep / site.nrel_aep - 1) * 100;
      const massDelta = (d.mass - 1) * 100;
      const isSelected = rankIdx === state.selectedRankIndex;

      const deltaClass = energyDelta >= 0 ? 'pos-delta' : 'neg-delta';
      const massClass = massDelta <= 0 ? 'pos-mass' : 'neg-mass';

      return `
        <tr class="rank-row ${isSelected ? 'selected' : ''}" data-rank-idx="${rankIdx}" tabindex="0" role="button" aria-label="Select Rank ${rankIdx + 1} Blade Design">
          <td class="col-rank">
            <span class="rank-num ${rankIdx === 0 ? 'rank-gold' : ''}">#${rankIdx + 1}</span>
          </td>
          <td class="col-aep">
            <b>${d.aep.toFixed(3)}</b> <span class="unit">GWh</span>
          </td>
          <td class="col-delta">
            <span class="badge ${deltaClass}">${energyDelta >= 0 ? '+' : ''}${energyDelta.toFixed(2)}%</span>
          </td>
          <td class="col-mass">
            <span class="mass-val ${massClass}">${d.mass.toFixed(2)}</span>
            <span class="mass-delta">(${massDelta >= 0 ? '+' : ''}${massDelta.toFixed(0)}%)</span>
          </td>
          <td class="col-score">
            <div class="score-bar-wrap" title="TOPSIS Score: ${(item.c * 100).toFixed(1)}%">
              <div class="score-bar" style="width: ${(item.c * 100).toFixed(0)}%"></div>
            </div>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.rank-row').forEach(row => {
      const handleSelect = () => {
        state.selectedRankIndex = parseInt(row.dataset.rankIdx, 10);
        refreshView(true);
      };
      row.addEventListener('click', handleSelect);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      });
    });
  }

  /**
   * Renders the 4 Primary Metric Telemetry Tiles with full defensive guards
   */
  function renderMetricTiles(selectedDesign, site) {
    if (!selectedDesign || !site) return;

    const aep = selectedDesign.aep;
    const nrelAep = site.nrel_aep;
    const aepDelta = ((aep / nrelAep) - 1) * 100;
    const massIndex = selectedDesign.mass;
    const massDelta = (massIndex - 1) * 100;
    const cf = (aep * 1e6) / (5000 * 8760) * 100;

    // 1. Annual Energy Tile
    safeSetText('metricAepValue', aep.toFixed(3));
    safeSetText('metricAepBaseline', `vs ${nrelAep.toFixed(3)} GWh NREL`);

    // 2. Energy Gain %
    safeSetText('metricAepDeltaBadge', `${aepDelta >= 0 ? '+' : ''}${aepDelta.toFixed(2)}%`);
    safeSetClass('metricAepDeltaBadge', `metric-badge ${aepDelta >= 0 ? 'badge-gain' : 'badge-loss'}`);
    safeSetText('metricAepDeltaDesc', aepDelta >= 0 ? 'Energy yield surplus' : 'Tradeoff for lighter blade');

    // 3. Blade Mass Index
    safeSetText('metricMassValue', massIndex.toFixed(2));
    safeSetText('metricMassDeltaBadge', `${Math.abs(massDelta).toFixed(0)}% ${massDelta < 0 ? 'Lighter' : 'Heavier'}`);
    safeSetClass('metricMassDeltaBadge', `metric-badge ${massDelta <= 0 ? 'badge-light' : 'badge-heavy'}`);
    safeSetText('metricMassDesc', 'Baseline mass index = 1.00');

    // 4. Capacity Factor
    safeSetText('metricCfValue', `${cf.toFixed(1)}%`);
    safeSetText('metricCfDesc', cf >= 30 ? 'High resource site' : (cf >= 15 ? 'Moderate wind speed' : 'Sub-commercial screening'));
  }

  /**
   * Sets up interactive controls (sliders, preset buttons, 3D stage toggles)
   */
  function setupControls() {
    // Priority Weight Slider
    const weightSlider = $('prioritySlider');
    if (weightSlider) {
      weightSlider.value = Math.round(state.priorityWeight * 100);
      weightSlider.addEventListener('input', (e) => {
        state.priorityWeight = parseInt(e.target.value, 10) / 100;
        updateSliderLabels();
        refreshView(false);
      });
    }

    // Preset Buttons
    const presets = document.querySelectorAll('.priority-preset-btn');
    presets.forEach(btn => {
      btn.addEventListener('click', () => {
        presets.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = parseInt(btn.dataset.preset, 10);
        state.priorityWeight = val / 100;
        if (weightSlider) weightSlider.value = val;
        updateSliderLabels();
        refreshView(false);
      });
    });

    function updateSliderLabels() {
      const p = Math.round(state.priorityWeight * 100);
      safeSetText('priorityEnergyPct', `${p}% Energy`);
      safeSetText('priorityMassPct', `${100 - p}% Mass`);
    }
    updateSliderLabels();

    // Wind Speed Slider (Controls rotor rotation speed)
    const windSlider = $('windSlider');
    if (windSlider) {
      windSlider.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        safeSetText('windSpeedVal', `${speed.toFixed(1)} m/s`);
        if (window.BladeViewer3D) {
          window.BladeViewer3D.setWindSpeed(speed);
        }
      });
    }

    // Live Viewer RPM callback
    window.onViewerRpmUpdate = function (rpm) {
      safeSetText('rotorRpmDisplay', `${rpm.toFixed(1)} RPM`);
    };

    // Spin Rotor Toggle Button
    const spinToggle = $('spinToggleBtn');
    if (spinToggle) {
      spinToggle.addEventListener('click', () => {
        if (window.BladeViewer3D) {
          const isSpin = window.BladeViewer3D.toggleSpin();
          spinToggle.classList.toggle('active', isSpin);
          spinToggle.setAttribute('aria-pressed', isSpin ? 'true' : 'false');
          safeSetText('spinToggleText', isSpin ? 'Spinning' : 'Paused');
        }
      });
    }

    // Show NREL Orange Wireframe Toggle
    const ghostToggle = $('ghostToggle');
    if (ghostToggle) {
      ghostToggle.addEventListener('change', (e) => {
        if (window.BladeViewer3D) {
          window.BladeViewer3D.toggleGhost(e.target.checked);
        }
      });
    }

    // 3D Viewport Preset Buttons
    document.querySelectorAll('.view-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.view;
        if (window.BladeViewer3D) {
          window.BladeViewer3D.setViewPreset(preset);
        }
      });
    });

    // 3D Zoom & Reset Buttons
    const zin = $('zoomInBtn');
    if (zin) zin.addEventListener('click', () => window.BladeViewer3D && window.BladeViewer3D.zoomIn());

    const zout = $('zoomOutBtn');
    if (zout) zout.addEventListener('click', () => window.BladeViewer3D && window.BladeViewer3D.zoomOut());

    const rst = $('resetViewBtn');
    if (rst) rst.addEventListener('click', () => window.BladeViewer3D && window.BladeViewer3D.resetView());
  }

  function showError(msg) {
    const errorBox = $('appGlobalError');
    if (errorBox) {
      errorBox.classList.remove('hidden');
      errorBox.innerHTML = `<strong>Data Loading Notice:</strong> ${msg}`;
    }
  }

  // Launch on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
