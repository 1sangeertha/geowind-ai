/**
 * GeoWind AI - 3D Aerodynamic Blade Stage (Three.js r128)
 * 
 * Features:
 * - Real-time continuous geometric morphing between Pareto designs
 * - High-visibility orange wireframe for NREL 5 MW reference baseline
 * - Dark-sky atmospheric stage with ambient wind particle streamlines
 * - Rotor sized and camera tuned so the blade fills the stage (85-90% viewport fill)
 * - Dynamic rotor spin driven by wind speed slider with RPM computation
 * - Interactive orbit / pan / zoom with inertia and perspective presets
 */

(function (global) {
  'use strict';

  // NACA 4-digit airfoil thickness-to-chord ratio along blade stations
  const TC = [1.0, 1.0, 1.0, 0.40, 0.35, 0.35, 0.30, 0.25, 0.25, 0.21, 0.21, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18];
  const NS = 48; // Spanwise discretization stations
  const NC = 20; // Chordwise cosine discretization points
  
  // Tuned scale factor so 63m blade spans 4.28 units, filling the stage comfortably
  const SCALE = 0.068;

  let container = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let rotorGroup = null;
  let hubMesh = null;
  let ghostRotor = null;
  let windParticles = null;

  // Blade shared geometry & morphing buffers
  let bladeGeometry = null;
  let currentPositions = null;
  let targetPositions = null;
  let isMorphing = false;

  // NREL reference geometry
  let nrelGeometry = null;

  // State & Camera distance tuned to fill the stage
  let isSpinning = true;
  let windSpeed = 8.5; // m/s
  let baseRpm = 9.8;
  let rotorRotationZ = 0;
  let isDragging = false;
  let previousPointer = { x: 0, y: 0 };
  let targetRotation = { x: 0.16, y: -0.32 };
  let currentRotation = { x: 0.16, y: -0.32 };
  
  // Camera distance tuned close to make rotor fill the viewport
  let cameraDistance = 6.8;
  let targetCameraDistance = 6.8;
  let initialContext = null;

  /**
   * Linear interpolation helper along radial stations
   */
  function interpolateAt(rArray, valArray, r) {
    if (r <= rArray[0]) return valArray[0];
    if (r >= rArray[rArray.length - 1]) return valArray[valArray.length - 1];
    let i = 1;
    while (rArray[i] < r) i++;
    const t = (r - rArray[i - 1]) / (rArray[i] - rArray[i - 1]);
    return valArray[i - 1] * (1 - t) + valArray[i] * t;
  }

  /**
   * Generates vertex buffer positions for an airfoil blade given chord and twist distributions
   */
  function computeBladeVertices(r_m, rhub, rtip, chordArr, twistArr) {
    const xs = Array.from({ length: NC }, (_, i) => (1 - Math.cos((Math.PI * i) / (NC - 1))) / 2);
    // NACA 4-digit half-thickness distribution
    const yt = (x, t) => 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * Math.pow(x, 3) - 0.1036 * Math.pow(x, 4));

    const positions = [];
    let ringVertexCount = 0;

    for (let k = 0; k <= NS; k++) {
      const r = rhub + ((rtip - rhub) * k) / NS;
      const c = interpolateAt(r_m, chordArr, r);
      const th = (interpolateAt(r_m, twistArr, r) * Math.PI) / 180;
      const tc = interpolateAt(r_m, TC, r);

      const ring = [];
      // Upper surface
      for (let i = 0; i < NC; i++) {
        ring.push([xs[i], yt(xs[i], tc)]);
      }
      // Lower surface (avoiding duplicate leading & trailing edge vertices)
      for (let i = NC - 2; i >= 1; i--) {
        ring.push([xs[i], -yt(xs[i], tc)]);
      }

      if (k === 0) {
        ringVertexCount = ring.length;
      }

      for (const [x, y] of ring) {
        // Quarter-chord pitch center offset
        const u = (x - 0.3) * c;
        const v = y * c;
        // Apply aerodynamic twist rotation and scale
        const posX = (u * Math.cos(th) - v * Math.sin(th)) * SCALE;
        const posY = r * SCALE;
        const posZ = (u * Math.sin(th) + v * Math.cos(th)) * SCALE;
        positions.push(posX, posY, posZ);
      }
    }

    return {
      positions: new Float32Array(positions),
      ringVertexCount
    };
  }

  /**
   * Builds triangle face index buffer for the spanwise airfoil tube
   */
  function buildBladeIndices(ringVertexCount) {
    const indices = [];
    const M = ringVertexCount;
    for (let k = 0; k < NS; k++) {
      for (let j = 0; j < M; j++) {
        const a = k * M + j;
        const b = k * M + ((j + 1) % M);
        const c = (k + 1) * M + j;
        const d = (k + 1) * M + ((j + 1) % M);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    return indices;
  }

  /**
   * Initializes wind streamline particle system
   */
  function createWindParticles() {
    const particleCount = 240;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 14; // X
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14; // Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16; // Z
      speeds[i] = 0.08 + Math.random() * 0.12;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData = { speeds };

    const material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.06,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending
    });

    return new THREE.Points(geometry, material);
  }

  /**
   * Initializes the Three.js 3D Viewport
   */
  function init(domContainerId, contextData) {
    container = document.getElementById(domContainerId);
    if (!container) return false;

    if (typeof THREE === 'undefined') {
      container.innerHTML = `
        <div class="stage-fallback-msg">
          <div class="fallback-icon">⚠️</div>
          <h4>3D Aero Viewer Offline</h4>
          <p>WebGL / Three.js could not be loaded from cdnjs. Telemetry metrics, maps, and Pareto charts remain fully operational.</p>
        </div>`;
      return false;
    }

    initialContext = contextData;
    container.innerHTML = '';

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 520;

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060e18, 0.022);

    // Camera (tuned to 44° FOV and closer distance so rotor fills 85-90% of frame)
    camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 0, cameraDistance);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x060e18, 0.96);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Lighting (Aerodynamic key, fill, and rim illumination)
    const ambientLight = new THREE.AmbientLight(0xdff2ff, 0.65);
    scene.add(ambientLight);

    const sunKeyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    sunKeyLight.position.set(6, 8, 10);
    scene.add(sunKeyLight);

    const aeroRimLight = new THREE.DirectionalLight(0x00d2d3, 0.85);
    aeroRimLight.position.set(-6, -4, -6);
    scene.add(aeroRimLight);

    const underGlow = new THREE.DirectionalLight(0x1e3a8a, 0.4);
    underGlow.position.set(0, -10, 2);
    scene.add(underGlow);

    // Rotor group
    rotorGroup = new THREE.Group();
    scene.add(rotorGroup);

    // Aerodynamic Nacelle & Spinner Hub
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25
    });
    const hubGeo = new THREE.SphereGeometry(0.26, 32, 24);
    hubGeo.scale(1, 1, 1.4);
    hubMesh = new THREE.Mesh(hubGeo, hubMat);
    hubMesh.position.z = 0.06;
    rotorGroup.add(hubMesh);

    // Wind particles
    windParticles = createWindParticles();
    scene.add(windParticles);

    // Base NREL Blade Geometry
    const nrelRes = computeBladeVertices(
      contextData.r_m,
      contextData.rhub,
      contextData.rtip,
      contextData.nrel.chord,
      contextData.nrel.twist
    );

    const indices = buildBladeIndices(nrelRes.ringVertexCount);

    // NREL Reference wireframe mesh
    nrelGeometry = new THREE.BufferGeometry();
    nrelGeometry.setAttribute('position', new THREE.BufferAttribute(nrelRes.positions, 3));
    nrelGeometry.setIndex(indices);
    nrelGeometry.computeVertexNormals();

    const nrelWireMat = new THREE.MeshBasicMaterial({
      color: 0xff6b35, // High-visibility safety aero orange
      wireframe: true,
      transparent: true,
      opacity: 0.48
    });

    ghostRotor = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const gMesh = new THREE.Mesh(nrelGeometry, nrelWireMat);
      gMesh.rotation.z = (b * 2 * Math.PI) / 3;
      ghostRotor.add(gMesh);
    }
    rotorGroup.add(ghostRotor);

    // Morphable Main Blade Geometry
    currentPositions = new Float32Array(nrelRes.positions);
    targetPositions = new Float32Array(nrelRes.positions);

    bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
    bladeGeometry.setIndex(indices);
    bladeGeometry.computeVertexNormals();

    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9, // Electric cyan/teal
      metalness: 0.4,
      roughness: 0.32,
      side: THREE.DoubleSide
    });

    for (let b = 0; b < 3; b++) {
      const bMesh = new THREE.Mesh(bladeGeometry, bladeMaterial);
      bMesh.rotation.z = (b * 2 * Math.PI) / 3;
      rotorGroup.add(bMesh);
    }

    // Attach interaction events
    setupInteractions();

    // Responsive sizing
    onWindowResize();

    // Start render loop
    requestAnimationFrame(renderLoop);

    return true;
  }

  /**
   * Sets up mouse drag, wheel zoom, touch gestures and resize handlers
   */
  function setupInteractions() {
    if (!renderer || !renderer.domElement) return;
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      previousPointer = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('pointerup', () => {
      isDragging = false;
      if (canvas) canvas.style.cursor = 'grab';
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - previousPointer.x;
      const dy = e.clientY - previousPointer.y;
      targetRotation.y += dx * 0.007;
      targetRotation.x += dy * 0.007;
      targetRotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotation.x));
      previousPointer = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      zoom(zoomFactor);
    }, { passive: false });

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 500;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function zoom(factor) {
    targetCameraDistance = Math.min(18.0, Math.max(2.5, targetCameraDistance * factor));
  }

  /**
   * Smoothly morphs blade geometry to a new target design
   */
  function morphToDesign(design, contextData) {
    if (!bladeGeometry || !contextData) return;

    const res = computeBladeVertices(
      contextData.r_m,
      contextData.rhub,
      contextData.rtip,
      design.chord,
      design.twist
    );

    targetPositions = res.positions;
    isMorphing = true;
  }

  /**
   * Main animation and render loop
   */
  function renderLoop() {
    requestAnimationFrame(renderLoop);

    // Smooth camera inertia
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
    cameraDistance += (targetCameraDistance - cameraDistance) * 0.1;

    if (camera) {
      camera.position.z = cameraDistance;
    }
    if (scene) {
      scene.rotation.x = currentRotation.x;
      scene.rotation.y = currentRotation.y;
    }

    // Smooth geometric vertex morphing between designs
    if (isMorphing && targetPositions && bladeGeometry) {
      const posAttr = bladeGeometry.attributes.position;
      const arr = posAttr.array;
      let maxDelta = 0;

      const lerpSpeed = 0.14;
      for (let i = 0; i < arr.length; i++) {
        const delta = targetPositions[i] - arr[i];
        arr[i] += delta * lerpSpeed;
        const absD = Math.abs(delta);
        if (absD > maxDelta) maxDelta = absD;
      }

      posAttr.needsUpdate = true;
      bladeGeometry.computeVertexNormals();

      if (maxDelta < 0.0004) {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = targetPositions[i];
        }
        posAttr.needsUpdate = true;
        bladeGeometry.computeVertexNormals();
        isMorphing = false;
      }
    }

    // Dynamic rotor rotation driven by wind speed slider
    if (isSpinning && rotorGroup) {
      const currentRpm = (windSpeed / 9.0) * baseRpm;
      const deltaRad = (currentRpm * 2 * Math.PI) / (60 * 60);
      rotorRotationZ -= deltaRad;
      rotorGroup.rotation.z = rotorRotationZ;

      if (global.onViewerRpmUpdate) {
        global.onViewerRpmUpdate(currentRpm);
      }
    }

    // Wind particle animation
    if (windParticles) {
      const pos = windParticles.geometry.attributes.position.array;
      const speeds = windParticles.geometry.userData.speeds;
      const speedScale = Math.max(0.2, windSpeed / 8.0);

      for (let i = 0; i < speeds.length; i++) {
        pos[i * 3 + 2] -= speeds[i] * speedScale;
        if (pos[i * 3 + 2] < -8.0) {
          pos[i * 3 + 2] = 8.0;
          pos[i * 3 + 0] = (Math.random() - 0.5) * 14;
          pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
        }
      }
      windParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // Camera presets tuned to fill the stage view
  function setViewPreset(preset) {
    switch (preset) {
      case 'front':
        targetRotation = { x: 0, y: 0 };
        targetCameraDistance = 6.2;
        break;
      case 'pitch':
        targetRotation = { x: 0, y: Math.PI / 2 };
        targetCameraDistance = 5.6;
        break;
      case 'tip':
        // Down-the-blade view from blade tip looking toward hub to inspect twist
        targetRotation = { x: -Math.PI / 2.25, y: 0.08 };
        targetCameraDistance = 4.8;
        break;
      case 'iso':
      default:
        targetRotation = { x: 0.16, y: -0.32 };
        targetCameraDistance = 6.8;
        break;
    }
  }

  function resetView() {
    setViewPreset('iso');
  }

  function toggleSpin(enabled) {
    if (typeof enabled === 'boolean') {
      isSpinning = enabled;
    } else {
      isSpinning = !isSpinning;
    }
    return isSpinning;
  }

  function setWindSpeed(mps) {
    windSpeed = Math.max(0, Math.min(30, Number(mps) || 0));
    return windSpeed;
  }

  function toggleGhost(show) {
    if (ghostRotor) {
      ghostRotor.visible = !!show;
    }
  }

  // Export public API
  global.BladeViewer3D = {
    init,
    morphToDesign,
    setWindSpeed,
    toggleSpin,
    toggleGhost,
    zoomIn: () => zoom(0.82),
    zoomOut: () => zoom(1.22),
    resetView,
    setViewPreset,
    getWindSpeed: () => windSpeed,
    isSpinning: () => isSpinning
  };

})(typeof window !== 'undefined' ? window : this);
