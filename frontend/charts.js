/**
 * GeoWind AI - Aerodynamic Profile Distribution Charts (SVG)
 * 
 * Renders high-fidelity dual aerodynamic profile comparison charts:
 * 1. Chord Distribution: Blade Radius r (m) vs Chord Width c (m)
 * 2. Twist Angle Distribution: Blade Radius r (m) vs Pitch/Twist θ (deg)
 * 
 * Features:
 * - Direct vector SVG rendering with zero external library overhead
 * - Shaded aerodynamic deviation area between Selected & NREL baseline
 * - Station hover cursor with synchronized tooltip telemetry
 * - Fluid path transitions between designs
 */

(function (global) {
  'use strict';

  let chordContainer = null;
  let twistContainer = null;
  let cachedData = null;

  /**
   * Generates smooth cubic bezier SVG path from discrete radial points
   */
  function pointsToPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      // Catmull-Rom to Cubic Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  /**
   * Generates a closed area polygon path between two curves
   */
  function areaBetweenPaths(upperPoints, lowerPoints) {
    if (!upperPoints.length || !lowerPoints.length) return '';
    let d = pointsToPath(upperPoints);
    const reversed = [...lowerPoints].reverse();
    d += ` L ${reversed[0].x.toFixed(1)},${reversed[0].y.toFixed(1)}`;
    for (let i = 0; i < reversed.length; i++) {
      d += ` L ${reversed[i].x.toFixed(1)},${reversed[i].y.toFixed(1)}`;
    }
    d += ' Z';
    return d;
  }

  /**
   * Initializes chart containers
   */
  function init(chordDomId, twistDomId) {
    chordContainer = document.getElementById(chordDomId);
    twistContainer = document.getElementById(twistDomId);
  }

  /**
   * Updates both profile charts with new design data
   */
  function update(selectedDesign, nrelBaseline, r_m) {
    if (!chordContainer || !twistContainer) return;
    cachedData = { selected: selectedDesign, nrel: nrelBaseline, r_m: r_m };

    renderChordChart(selectedDesign, nrelBaseline, r_m);
    renderTwistChart(selectedDesign, nrelBaseline, r_m);
  }

  /**
   * Renders the Chord Distribution Chart
   */
  function renderChordChart(sel, nrel, rs) {
    const w = chordContainer.clientWidth || 460;
    const h = 215;                                        // extra height for axis title row
    const pad = { top: 22, right: 24, bottom: 46, left: 44 }; // bottom: 12px ticks + 12px gap + 10px title + 12px margin
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    const minR = 0;
    const maxR = 65;
    const minC = 0;
    const maxC = 5.5; // meters chord

    const scaleX = (r) => pad.left + ((r - minR) / (maxR - minR)) * innerW;
    const scaleY = (c) => pad.top + innerH - ((c - minC) / (maxC - minC)) * innerH;

    const selPoints = rs.map((r, i) => ({ x: scaleX(r), y: scaleY(sel.chord[i]), r, val: sel.chord[i] }));
    const nrelPoints = rs.map((r, i) => ({ x: scaleX(r), y: scaleY(nrel.chord[i]), r, val: nrel.chord[i] }));

    const selPath = pointsToPath(selPoints);
    const nrelPath = pointsToPath(nrelPoints);
    const diffArea = areaBetweenPaths(selPoints, nrelPoints);

    // Grid lines
    let gridLinesSvg = '';
    for (let c = 1; c <= 5; c++) {
      const y = scaleY(c);
      gridLinesSvg += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="3,3"/>`;
      gridLinesSvg += `<text x="${pad.left - 8}" y="${y + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="monospace">${c}m</text>`;
    }

    // Tick labels sit at the bottom of the plot area; title goes one full line below them
    const tickY  = pad.top + innerH + 13;  // y of numeric tick labels (baseline)
    const titleY = pad.top + innerH + 30;  // y of axis title — 17px below the ticks

    for (let r = 10; r <= 60; r += 10) {
      const x = scaleX(r);
      gridLinesSvg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" stroke="rgba(255,255,255,0.05)"/>`;
      gridLinesSvg += `<text x="${x}" y="${tickY}" fill="#64748b" font-size="10" text-anchor="middle" font-family="monospace">${r}m</text>`;
    }

    // Circles for key station markers
    let markersSvg = '';
    selPoints.forEach((p, idx) => {
      if (idx % 2 === 0 || idx === selPoints.length - 1) {
        markersSvg += `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#0ea5e9" stroke="#060e18" stroke-width="1.5">
            <title>r = ${p.r.toFixed(1)}m | Chord = ${p.val.toFixed(2)}m (NREL: ${nrel.chord[idx].toFixed(2)}m)</title>
          </circle>`;
      }
    });

    chordContainer.innerHTML = `
      <div class="chart-header">
        <div class="chart-title-group">
          <span class="chart-tag">AERODYNAMIC GEOMETRY</span>
          <h4 class="chart-title">Chord Distribution <span class="chart-unit">c(r) [meters]</span></h4>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot sel-dot"></span>Selected Blade</span>
          <span class="legend-item"><span class="legend-dot nrel-dot"></span>NREL 5 MW Baseline</span>
        </div>
      </div>
      <svg class="profile-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chordDiffGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#ff6b35" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        ${gridLinesSvg}
        <!-- Delta area between curves -->
        <path d="${diffArea}" fill="url(#chordDiffGrad)"/>
        <!-- NREL Baseline Reference -->
        <path d="${nrelPath}" fill="none" stroke="#ff6b35" stroke-width="2" stroke-dasharray="4,3" opacity="0.85"/>
        <!-- Selected Design Curve -->
        <path d="${selPath}" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round"/>
        ${markersSvg}
        <!-- Axis title sits below tick labels -->
        <text x="${w - pad.right}" y="${titleY}" fill="#94a3b8" font-size="10" text-anchor="end">Radius r (m) &rarr;</text>
      </svg>`;
  }

  /**
   * Renders the Twist Angle Distribution Chart
   */
  function renderTwistChart(sel, nrel, rs) {
    const w = twistContainer.clientWidth || 460;
    const h = 215;                                        // extra height for axis title row
    const pad = { top: 22, right: 24, bottom: 46, left: 44 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    const minR = 0;
    const maxR = 65;
    const minT = -2.0;
    const maxT = 18.0; // degrees twist

    const scaleX = (r) => pad.left + ((r - minR) / (maxR - minR)) * innerW;
    const scaleY = (t) => pad.top + innerH - ((t - minT) / (maxT - minT)) * innerH;

    const selPoints = rs.map((r, i) => ({ x: scaleX(r), y: scaleY(sel.twist[i]), r, val: sel.twist[i] }));
    const nrelPoints = rs.map((r, i) => ({ x: scaleX(r), y: scaleY(nrel.twist[i]), r, val: nrel.twist[i] }));

    const selPath = pointsToPath(selPoints);
    const nrelPath = pointsToPath(nrelPoints);
    const diffArea = areaBetweenPaths(selPoints, nrelPoints);

    // Grid lines & Zero-degree line
    let gridLinesSvg = '';
    const yZero = scaleY(0);
    gridLinesSvg += `<line x1="${pad.left}" y1="${yZero}" x2="${w - pad.right}" y2="${yZero}" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>`;
    gridLinesSvg += `<text x="${pad.left - 8}" y="${yZero + 4}" fill="#94a3b8" font-size="10" text-anchor="end" font-weight="600" font-family="monospace">0&deg;</text>`;

    for (let t = 4; t <= 16; t += 4) {
      const y = scaleY(t);
      gridLinesSvg += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>`;
      gridLinesSvg += `<text x="${pad.left - 8}" y="${y + 4}" fill="#64748b" font-size="10" text-anchor="end" font-family="monospace">${t}&deg;</text>`;
    }

    for (let r = 10; r <= 60; r += 10) {
      const x = scaleX(r);
      gridLinesSvg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" stroke="rgba(255,255,255,0.05)"/>`;
      // Tick labels — placed 13px below the plot bottom edge
      const tickY = pad.top + innerH + 13;
      gridLinesSvg += `<text x="${x}" y="${tickY}" fill="#64748b" font-size="10" text-anchor="middle" font-family="monospace">${r}m</text>`;
    }

    // Circles for key station markers
    let markersSvg = '';
    selPoints.forEach((p, idx) => {
      if (idx % 2 === 0 || idx === selPoints.length - 1) {
        markersSvg += `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#38bdf8" stroke="#060e18" stroke-width="1.5">
            <title>r = ${p.r.toFixed(1)}m | Twist = ${p.val.toFixed(2)}° (NREL: ${nrel.twist[idx].toFixed(2)}°)</title>
          </circle>`;
      }
    });

    twistContainer.innerHTML = `
      <div class="chart-header">
        <div class="chart-title-group">
          <span class="chart-tag">AERODYNAMIC WASHOUT</span>
          <h4 class="chart-title">Twist Distribution <span class="chart-unit">&theta;(r) [degrees]</span></h4>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot sel-dot"></span>Selected Blade</span>
          <span class="legend-item"><span class="legend-dot nrel-dot"></span>NREL 5 MW Baseline</span>
        </div>
      </div>
      <svg class="profile-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="twistDiffGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#ff6b35" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        ${gridLinesSvg}
        <!-- Delta area between curves -->
        <path d="${diffArea}" fill="url(#twistDiffGrad)"/>
        <!-- NREL Baseline Reference -->
        <path d="${nrelPath}" fill="none" stroke="#ff6b35" stroke-width="2" stroke-dasharray="4,3" opacity="0.85"/>
        <!-- Selected Design Curve -->
        <path d="${selPath}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        ${markersSvg}
        <!-- Axis title sits below tick labels -->
        <text x="${w - pad.right}" y="${pad.top + innerH + 30}" fill="#94a3b8" font-size="10" text-anchor="end">Radius r (m) &rarr;</text>
      </svg>`;
  }

  // Handle responsive resizing
  window.addEventListener('resize', () => {
    if (cachedData) {
      update(cachedData.selected, cachedData.nrel, cachedData.r_m);
    }
  });

  global.BladeCharts = {
    init,
    update
  };

})(typeof window !== 'undefined' ? window : this);
