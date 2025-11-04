// ========== API Base & Status UI Helpers ==========
const API_BASE = (() => {
  const url = new URL(window.location.href);
  const qp = url.searchParams.get('api');
  if (qp) return qp.replace(/\/$/, '');
  const ls = localStorage.getItem('apiBase');
  if (ls) return ls.replace(/\/$/, '');
  return 'http://localhost:5000';
})();

const StatusUI = (() => {
  const el = document.getElementById('connection-status');
  const txt = document.getElementById('connection-status-text');
  const btn = document.getElementById('connection-status-retry');
  
  function show(message, kind = 'info') {
    if (!el) return;
    txt.textContent = message;
    el.style.display = 'block';
    el.style.borderColor = kind === 'error' ? '#ff6666' : (kind === 'warn' ? '#ffcc66' : '#4a9eff');
    btn.style.display = kind === 'error' ? 'inline-block' : 'none';
  }
  
  function hide() {
    if (el) el.style.display = 'none';
  }
  
  function onRetry(cb) {
    if (btn) btn.onclick = cb;
  }
  
  return { show, hide, onRetry };
})();

async function fetchJSONWithTimeout(url, { timeoutMs = 8000, retry = 1 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (retry > 0 && err.name !== 'AbortError') {
      return fetchJSONWithTimeout(url, { timeoutMs, retry: retry - 1 });
    }
    throw err;
  }
}

async function fetchBrightCatalogWithFallback(magLimit = 7.0) {
  try {
    StatusUI.show(`🌟 Fetching bright catalog (mag < ${magLimit})…`);
    const data = await fetchJSONWithTimeout(
      `${API_BASE}/api/stars/bright-catalog?mag_limit=${magLimit}`,
      { timeoutMs: 8000, retry: 1 }
    );
    console.log(`✅ Loaded ${data.count || data.length} stars from backend`);
    StatusUI.show(`✅ Loaded ${(data.count || data.length).toLocaleString()} bright stars from server`);
    setTimeout(() => StatusUI.hide(), 2000);
    return data;
  } catch (e) {
    console.warn('⚠️ Backend unavailable, loading offline catalog:', e.message);
    StatusUI.show('⚠️ Backend unavailable. Loading offline catalog…', 'warn');
    
    try {
      const res = await fetch('../data/bright_catalog.json');
      if (!res.ok) throw new Error('Offline catalog not found');
      const data = await res.json();
      console.log(`📦 Loaded ${data.length} stars from offline catalog`);
      StatusUI.show(`📦 Offline mode: ${data.length.toLocaleString()} stars loaded`, 'warn');
      setTimeout(() => StatusUI.hide(), 2500);
      return { stars: data, count: data.length, cached: false, offline: true };
    } catch (fallbackErr) {
      console.error('❌ Failed to load offline catalog:', fallbackErr);
      StatusUI.show('❌ Failed to load star catalog. Check backend or offline data.', 'error');
      throw fallbackErr;
    }
  }
}

// Bind retry button
StatusUI.onRetry(() => {
  console.log('🔄 Retrying...');
  window.location.reload();
});

// ========== Main Viewer Class ==========
class CosmicWebViewer {
  constructor() {
    console.log("🌌 Starting Cosmic Web Viewer with Live Gaia DR3...");

    // Basic properties
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.galaxyData = [];
    this.points = null;

    // Control state
    this.isMouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.keyState = {}; // Track keys for free-flight movement
    // Base speeds and settings
    this.baseMoveSpeed = 250;
    this.baseNavigationSpeed = 80;
    this.settings = {
      fov: 50,
      starSizeScale: 1.0,
      intensity: 1.0,
      speedMultiplier: 1.0,
    };
    this.moveSpeed = this.baseMoveSpeed * this.settings.speedMultiplier; // Movement speed units per second (reduced from 500)

    // Smooth motion controls
    this.currentVelocity = new THREE.Vector3(0, 0, 0); // Current movement velocity
    this.targetVelocity = new THREE.Vector3(0, 0, 0); // Target velocity based on input
    this.acceleration = 750; // How fast we accelerate (units/s²) - also halved
    this.deceleration = 1250; // How fast we slow down (units/s²) - also halved
    this.rotationSmoothing = 0.15; // Lower = smoother but slower (0.1-0.3)
    this.targetRotationX = 0;
    this.targetRotationY = 0;

    // Timing for animation
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsTime = performance.now();

    // HUD tracking
    this.velocity = 0;
    this.lastCameraPosition = new THREE.Vector3();

    // Star labels
    this.labels = [];
    this.labelContainer = null;
    this.famousStars = null;
    this.approachDistance = 50; // Show labels within 50 parsecs
    this.showStarLabels = true; // Toggle for star labels

    // Solar system
    this.solarSystemData = null;
    this.showSolarSystemLabels = false; // Toggle for solar system LABELS only
    this.solarSystemPoints = null;

    // Live API integration
    this.apiUrl = "http://localhost:5000";
    this.isLoadingData = false;
    this.lastLoadPosition = new THREE.Vector3();
    this.loadRadius = 1000; // Load new data when camera moves this far
    this.starCache = new Map(); // Cache loaded stars by region

    // Data streaming
    this.currentRegion = null;
    this.loadedStarCount = 0;

    // Reload thresholds
    this.lastLoadDirection = new THREE.Vector3();
    this.loadAngleThresholdDeg = 10; // Reload when view direction changes this much

    // Constellation and label data
    this.constellations = [];
    this.brightStars = [];
    this.constellationLines = null;
    this.starLabels = [];
    this.showConstellations = true;

    // Bright star catalog (base sky layer)
    this.brightStarCatalog = [];
    this.catalogLoaded = false;

    // CLEAN navigation system (video game style)
    this.navigationTarget = null; // {position: Vector3, lookAt: Vector3}
  this.navigationSpeed = this.baseNavigationSpeed * this.settings.speedMultiplier; // parsecs per second
    this.isNavigating = false;

  // Frame/overlay
  this.currentFrame = 'EQ'; // 'EQ' | 'EP' | 'GAL'
  this.planeOverlay = null; // THREE.Object3D

    // Cinematic Tour System
    this.tourActive = false;
    this.tourCurrentStop = 0;
    this.tourWaypoints = [
      {
        name: "Sirius - The Brightest Star",
        description: "The brightest star in Earth's night sky, 8.6 light-years away. A brilliant blue-white beacon.",
        targetStar: "Sirius"
      },
      {
        name: "Betelgeuse - Red Supergiant",
        description: "A massive red supergiant in Orion, hundreds of times larger than our Sun. Near the end of its life.",
        targetStar: "Betelgeuse"
      },
      {
        name: "Rigil Kentaurus - Nearest Star",
        description: "Alpha Centauri, our closest stellar neighbor at just 4.3 light-years. A Sun-like star system.",
        targetStar: "Rigil"
      },
      {
        name: "Vega - Summer Triangle",
        description: "A brilliant blue star 25 light-years away, one of the brightest stars visible from Earth.",
        targetStar: "Vega"
      }
    ];

    this.init();
  }

  async init() {
    this.updateStatus("Loading bright star catalog from Gaia DR3...");

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLabelContainer();

    // Load famous star names
    await this.loadFamousStars();

    // Load solar system data
    await this.loadSolarSystem();

    // Load 20K star catalog with real 3D positions
    await this.loadBrightCatalog();

    this.updateStatus(
      "Ready! Exploring 20K stars in TRUE 3D. WASD to move, drag to look."
    );
    this.animate();

    console.log("✅ 3D Space Explorer ready with 20K Gaia stars!");
  }

  // Load full-sky bright star catalog
  async loadBrightCatalog() {
    try {
      this.updateStatus("Loading ALL Gaia DR3 stars...");
      console.log("🌟 Fetching ALL star catalog (mag < 7.0)...");

      // Use fallback-enabled fetch
      const data = await fetchBrightCatalogWithFallback(7.0);

      console.log(
        `✅ Loaded ${
          data.count || data.stars?.length || 0
        } stars from Gaia DR3 (${data.query_time_ms ? data.query_time_ms.toFixed(0) + 'ms' : 'offline'}, cached: ${
          data.cached || false
        })`
      );

      // Convert to our format and render on sphere
      this.brightStarCatalog = this.convertApiStarsToGalaxyData(data.stars, {
        ra: 0,
        dec: 0,
      });

      this.galaxyData = this.brightStarCatalog;
      this.loadedStarCount = data.count || data.stars?.length || 0;
      this.catalogLoaded = true;

      // Render the full sky
      this.createGalaxyPoints();

      // Create solar system objects
      this.createSolarSystemPoints();

      this.updateStatus(
        `Viewing ${this.loadedStarCount} stars from Gaia DR3 (TRUE 3D with real distances)`
      );
    } catch (error) {
      console.error("❌ Failed to load star catalog:", error);
      this.updateStatus(`ERROR: ${error.message}. Check backend is running.`);
    }
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // No fog - we want to see deep space!
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.1, 50000);
    // Start at origin looking along +X axis - we're inside the galaxy now!
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(100, 0, 0);

    // Initialize rotation values from camera's initial orientation
    this.rotationX = this.camera.rotation.x;
    this.rotationY = this.camera.rotation.y;
    this.targetRotationX = this.rotationX;
    this.targetRotationY = this.rotationY;
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000005, 1); // Darker background for better contrast
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener("resize", () => this.onWindowResize());
    console.log("✨ Enhanced star rendering with vivid colors enabled!");
  }

  setupControls() {
    const canvas = this.renderer.domElement;

    // Track mouse state for click detection
    let mouseDownTime = 0;
    let mouseDownPos = { x: 0, y: 0 };
    let isDragging = false; // Track if user is actually dragging

    canvas.addEventListener("mousedown", (e) => {
      this.isMouseDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      mouseDownTime = Date.now();
      mouseDownPos = { x: e.clientX, y: e.clientY };
      isDragging = false; // Reset drag flag
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("mouseup", (e) => {
      const clickDuration = Date.now() - mouseDownTime;
      const mouseMoved =
        Math.abs(e.clientX - mouseDownPos.x) > 3 ||
        Math.abs(e.clientY - mouseDownPos.y) > 3;

      // If mouse didn't move much and click was quick, it's a click (not a drag)
      if (clickDuration < 300 && !isDragging && !mouseMoved) {
        this.handleStarClick(e);
      }

      this.isMouseDown = false;
      isDragging = false;
      canvas.style.cursor = "grab";
    });
    
    // Also handle mouse leave to reset cursor
    canvas.addEventListener("mouseleave", () => {
      this.isMouseDown = false;
      isDragging = false;
      canvas.style.cursor = "grab";
    });

    // Global safety: if mouseup happens outside the canvas/window, ensure state resets
    const resetMouseState = () => {
      this.isMouseDown = false;
      isDragging = false;
      if (canvas && canvas.style) canvas.style.cursor = "grab";
    };
    window.addEventListener("mouseup", resetMouseState);
    window.addEventListener("pointerup", resetMouseState);
    window.addEventListener("blur", resetMouseState);
    window.addEventListener("mouseleave", resetMouseState);

    canvas.addEventListener("mousemove", (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.mouseX;
      const deltaY = e.clientY - this.mouseY;
      
      // Only start dragging if mouse moved more than threshold
      const totalMovement = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
      if (totalMovement > 3) {
        isDragging = true;
      }
      
      // Only rotate camera if we're actually dragging
      if (!isDragging) return;

      // Accumulate target rotation (smooth)
      const rotateSpeed = 0.002;
      this.targetRotationX += -deltaY * rotateSpeed;
      this.targetRotationY += -deltaX * rotateSpeed;

      // Clamp pitch to prevent camera flipping
      this.targetRotationX = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.targetRotationX)
      );

      // Normalize to prevent drift
      this.camera.quaternion.normalize();

      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      // Smooth zoom by moving camera along its look direction
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);

      // Adaptive zoom speed based on distance
      const currentDistance = this.camera.position.length();
      const zoomSpeed = Math.max(0.5, currentDistance * 0.05); // Faster when far, slower when close

      // Zoom in or out
      const zoomAmount = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      this.camera.position.add(forward.multiplyScalar(zoomAmount));

      // Soft limit - prevent getting too close to origin (but allow very close)
      const minDistance = 0.1;
      if (this.camera.position.length() < minDistance) {
        this.camera.position.normalize().multiplyScalar(minDistance);
      }
    });

    canvas.style.cursor = "grab";

    // Keyboard listeners for free-flight movement
    window.addEventListener("keydown", (e) => {
      this.keyState[e.code] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keyState[e.code] = false;
    });
  }

  // Smooth camera rotation with lerp
  updateSmoothRotation() {
    // Smoothly interpolate current rotation toward target
    this.rotationX +=
      (this.targetRotationX - this.rotationX) * this.rotationSmoothing;
    this.rotationY +=
      (this.targetRotationY - this.rotationY) * this.rotationSmoothing;

    // Apply rotation to camera using Euler angles
    this.camera.rotation.order = "YXZ"; // Yaw-Pitch-Roll order
    this.camera.rotation.y = this.rotationY;
    this.camera.rotation.x = this.rotationX;
  }

  // Update keyboard movement (free-flight WASD controls with smooth acceleration)
  updateKeyboardControls(delta) {
    // Don't apply keyboard controls during navigation
    if (this.isNavigating) {
      this.currentVelocity.set(0, 0, 0);
      this.targetVelocity.set(0, 0, 0);
      return;
    }

    // Get camera direction vectors
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3()
      .crossVectors(forward, this.camera.up)
      .normalize();
    const up = new THREE.Vector3(0, 1, 0);

    // Calculate target velocity based on key inputs
    this.targetVelocity.set(0, 0, 0);
    const isSpacePressed = this.keyState["Space"];

    // Speed boost with Shift key (3x faster)
    const speedMultiplier =
      this.keyState["ShiftLeft"] || this.keyState["ShiftRight"] ? 3.0 : 1.0;
    const currentMoveSpeed = this.moveSpeed * speedMultiplier;

    // WASD movement with spacebar modifiers
    if (this.keyState["KeyW"]) {
      if (isSpacePressed) {
        // Space + W = Move UP (vertical)
        this.targetVelocity.add(up.clone().multiplyScalar(currentMoveSpeed));
      } else {
        // W alone = Move FORWARD
        this.targetVelocity.add(
          forward.clone().multiplyScalar(currentMoveSpeed)
        );
      }
    }

    if (this.keyState["KeyS"]) {
      if (isSpacePressed) {
        // Space + S = Move DOWN (vertical)
        this.targetVelocity.add(up.clone().multiplyScalar(-currentMoveSpeed));
      } else {
        // S alone = Move BACKWARD
        this.targetVelocity.add(
          forward.clone().multiplyScalar(-currentMoveSpeed)
        );
      }
    }

    // A/D for strafing left/right
    if (this.keyState["KeyA"]) {
      this.targetVelocity.add(right.clone().multiplyScalar(-currentMoveSpeed));
    }
    if (this.keyState["KeyD"]) {
      this.targetVelocity.add(right.clone().multiplyScalar(currentMoveSpeed));
    }

    // Q/E also work for vertical movement
    if (this.keyState["KeyQ"]) {
      this.targetVelocity.add(up.clone().multiplyScalar(-currentMoveSpeed));
    }
    if (this.keyState["KeyE"]) {
      this.targetVelocity.add(up.clone().multiplyScalar(currentMoveSpeed));
    }

    // Smooth acceleration/deceleration toward target velocity
    const targetSpeed = this.targetVelocity.length();
    const currentSpeed = this.currentVelocity.length();

    if (targetSpeed > 0) {
      // Accelerating - smoothly increase speed toward target
      const accelRate = this.acceleration * delta;
      this.currentVelocity.lerp(
        this.targetVelocity,
        Math.min(accelRate / this.moveSpeed, 1.0)
      );
    } else {
      // Decelerating - smoothly slow down with inertia
      const decelRate = this.deceleration * delta;
      const speedReduction = Math.min(decelRate, currentSpeed);
      if (currentSpeed > 0.01) {
        this.currentVelocity.multiplyScalar(
          (currentSpeed - speedReduction) / currentSpeed
        );
      } else {
        this.currentVelocity.set(0, 0, 0);
      }
    }

    // Apply velocity to camera position
    this.camera.position.add(
      this.currentVelocity.clone().multiplyScalar(delta)
    );
  }

  // Convert 3D position to celestial coordinates (RA/Dec)
  positionToEquatorial(position) {
    // Simplified conversion - treats XYZ as galactic-like coords
    // X = distance * cos(dec) * cos(ra)
    // Y = distance * sin(dec)
    // Z = distance * cos(dec) * sin(ra)

    const x = position.x;
    const y = position.y;
    const z = position.z;

    const distance = Math.sqrt(x * x + y * y + z * z);

    // Convert to RA/Dec (in degrees)
    let dec = (Math.asin(y / distance) * 180) / Math.PI;
    let ra = (Math.atan2(z, x) * 180) / Math.PI;

    // Normalize RA to 0-360
    if (ra < 0) ra += 360;

    // Keep dec in -90 to 90
    dec = Math.max(-90, Math.min(90, dec));

    return { ra, dec, distance };
  }

  // Convert a direction vector to celestial coordinates (RA/Dec)
  vectorToEquatorialDir(vector) {
    const dir = vector.clone().normalize();
    // Interpret dir.x, dir.y, dir.z like unit-sphere coordinates
    // dec = asin(y), ra = atan2(z, x)
    let dec = (Math.asin(dir.y) * 180) / Math.PI;
    let ra = (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
    if (ra < 0) ra += 360;
    dec = Math.max(-90, Math.min(90, dec));
    return { ra, dec };
  }

  // Convert celestial coordinates back to 3D position
  equatorialToPosition(ra, dec, distance) {
    // Convert degrees to radians
    const raRad = (ra * Math.PI) / 180;
    const decRad = (dec * Math.PI) / 180;

    // Convert to Cartesian
    const x = distance * Math.cos(decRad) * Math.cos(raRad);
    const y = distance * Math.sin(decRad);
    const z = distance * Math.cos(decRad) * Math.sin(raRad);

    return new THREE.Vector3(x, y, z);
  }

  // Load constellation data
  async loadConstellations() {
    try {
      const response = await fetch("/data/constellations.json");
      const data = await response.json();
      this.constellations = data.constellations;
      this.brightStars = data.brightStars;

      // Create constellation line geometry
      this.createConstellationLines();

      console.log(
        `✅ Loaded ${this.constellations.length} constellations and ${this.brightStars.length} bright stars`
      );
    } catch (error) {
      console.warn("⚠️ Could not load constellation data:", error);
    }
  }

  // Create constellation line overlays
  createConstellationLines() {
    // Remove old lines if any
    if (this.constellationLines) {
      this.scene.remove(this.constellationLines);
      this.constellationLines.geometry.dispose();
      this.constellationLines.material.dispose();
    }

    const linePositions = [];
    const sphereRadius = 1000; // Render on a sphere at this radius

    for (const constellation of this.constellations) {
      for (let i = 0; i < constellation.lines.length; i += 4) {
        const ra1 = constellation.lines[i];
        const dec1 = constellation.lines[i + 1];
        const ra2 = constellation.lines[i + 2];
        const dec2 = constellation.lines[i + 3];

        const pos1 = this.equatorialToPosition(ra1, dec1, sphereRadius);
        const pos2 = this.equatorialToPosition(ra2, dec2, sphereRadius);

        linePositions.push(pos1.x, pos1.y, pos1.z);
        linePositions.push(pos2.x, pos2.y, pos2.z);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    const material = new THREE.LineBasicMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
      depthTest: false, // Always render on top
    });

    this.constellationLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.constellationLines);
    this.constellationLines.visible = this.showConstellations;
  }

  // Load stars visible in current view
  async loadStarsInView() {
    if (this.isLoadingData) {
      console.log("⏳ Already loading data...");
      return;
    }

    // Check if we need to reload based on camera movement
    const currentPos = this.camera.position;
    const distMoved = currentPos.distanceTo(this.lastLoadPosition);

    if (distMoved < this.loadRadius && this.galaxyData.length > 0) {
      // console.log(`📍 Camera moved ${distMoved.toFixed(0)} units (threshold: ${this.loadRadius})`);
      return; // Don't reload if camera hasn't moved far
    }

    this.isLoadingData = true;
    this.updateStatus("Loading stars from Gaia DR3...");

    try {
      // Use camera look direction to select sky region
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      const { ra, dec } = this.vectorToEquatorialDir(forward);

      // Calculate viewing radius (larger radius = more stars)
      const radius = 15.0; // degrees of sky to query
      const limit = 5000; // max stars per query

      console.log(
        `🌍 Querying Gaia DR3: RA=${ra.toFixed(2)}°, Dec=${dec.toFixed(
          2
        )}°, radius=${radius}°`
      );

      // Query backend API
      const url = `${this.apiUrl}/api/stars/region?ra=${ra}&dec=${dec}&radius=${radius}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      console.log(
        `✅ Loaded ${
          data.count
        } stars from Gaia DR3 (${data.query_time_ms.toFixed(0)}ms, cached: ${
          data.cached
        })`
      );

      // Convert API data to our format
      this.galaxyData = this.convertApiStarsToGalaxyData(data.stars, {
        ra,
        dec,
      });
      this.loadedStarCount = data.count;
      this.currentRegion = { ra, dec, radius };
      this.lastLoadPosition.copy(this.camera.position);
      this.lastLoadDirection.copy(forward);

      // Update the visualization
      this.createGalaxyPoints();

      this.updateStatus(
        `Viewing ${this.loadedStarCount} stars from Gaia DR3 (planetarium mode)`
      );
    } catch (error) {
      console.error("❌ Failed to load live data:", error);
      this.updateStatus("Failed to load live data - using fallback");

      // Fallback to test data if API fails
      await this.loadFallbackData();
    } finally {
      this.isLoadingData = false;
    }
  }

  // Convert API star data to internal format
  convertApiStarsToGalaxyData(apiStars, centerCoords) {
    const stars = [];

    // More accurate color mapping:
    // 1) Use famous star temperature if known
    // 2) Use API-provided RGB if present
    // 3) Use API temperature if present
    // 4) Derive temperature from BP-RP then convert to sRGB
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const kelvinToRgb = (kelvin) => {
      // Tanner Helland approximation (Kelvin -> sRGB)
      const t = kelvin / 100.0;
      let r, g, b;
      if (t <= 66) r = 255; else r = 329.698727446 * Math.pow(t - 60.0, -0.1332047592);
      if (t <= 66) g = 99.4708025861 * Math.log(Math.max(1.0, t)) - 161.1195681661; else g = 288.1221695283 * Math.pow(t - 60.0, -0.0755148492);
      if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10.0) - 305.0447927307;
      return [clamp01(Math.round(Math.max(0, Math.min(255, r))) / 255),
              clamp01(Math.round(Math.max(0, Math.min(255, g))) / 255),
              clamp01(Math.round(Math.max(0, Math.min(255, b))) / 255)];
    };
    const bpToKelvin = (bp) => {
      // Piecewise interpolation through spectral anchors (approximate)
      const x = Math.max(-0.3, Math.min(3.0, bp ?? 0.0));
      const lerp = (a,b,t)=>a+(b-a)*t; const itp=(x,x0,x1,y0,y1)=>x<=x0?y0:x>=x1?y1:lerp(y0,y1,(x-x0)/(x1-x0));
      if (x < -0.1) return itp(x,-0.3,-0.1,25000,15000);
      if (x < 0.0)  return itp(x,-0.1, 0.0,15000, 9600);
      if (x < 0.3)  return itp(x, 0.0, 0.3, 9600, 7400);
      if (x < 0.65) return itp(x, 0.3, 0.65,7400, 5778);
      if (x < 1.0)  return itp(x,0.65, 1.0,5778, 5000);
      if (x < 1.5)  return itp(x, 1.0, 1.5,5000, 4000);
      if (x < 2.0)  return itp(x, 1.5, 2.0,4000, 3500);
      return itp(x, 2.0, 3.0,3500, 3000);
    };

    for (const star of apiStars) {
      // TRUE 3D MODE: Use REAL distances from parallax
      // parallax in milliarcseconds -> distance in parsecs = 1000 / parallax
      let distance;
      if (star.parallax && star.parallax > 0) {
        distance = 1000.0 / star.parallax; // Convert parallax to parsecs
        // Cap extreme distances for rendering
        distance = Math.min(distance, 10000); // Max 10,000 parsecs
      } else {
        // No parallax data - use magnitude-based estimate
        // Rough estimate: distance increases exponentially with magnitude
        const mag = star.magnitude || 10.0;
        distance = Math.pow(10, (mag - 5) / 5 + 1); // Distance modulus approximation
        distance = Math.min(distance, 10000);
      }

      const pos = this.equatorialToPosition(star.ra, star.dec, distance);

      // Determine color with priority overrides
      let color;
      // Famous star override by source_id (tempK)
      const fs = this.famousStars && star.source_id ? this.famousStars[star.source_id] : null;
      if (fs && fs.tempK) {
        color = kelvinToRgb(fs.tempK);
      } else if (star.r != null && star.g != null && star.b != null) {
        // Backend-provided RGB
        color = [clamp01(star.r), clamp01(star.g), clamp01(star.b)];
      } else if (star.temperature != null && !isNaN(star.temperature)) {
        color = kelvinToRgb(star.temperature);
      } else if (star.color_bp_rp != null) {
        const k = bpToKelvin(star.color_bp_rp);
        color = kelvinToRgb(k);
      } else {
        // Neutral fallback (slight blue-white like Vega)
        color = kelvinToRgb(9600);
      }

      stars.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        pos: pos.clone(), // Store Vector3 for distance calculations
        r: color[0],
        g: color[1],
        b: color[2],
        magnitude: star.magnitude || 10.0,
        distance: distance,
        distance_ly: distance * 3.26156,
        // Store ALL original data for search/info panel
        source_id: star.source_id,
        ra: star.ra,
        dec: star.dec,
        parallax_mas: star.parallax,
        pmra_mas_yr: star.pm_ra,
        pmdec_mas_yr: star.pm_dec,
        phot_g_mean_mag: star.magnitude,
        bp_rp: star.color_bp_rp,
      });
    }

    return stars;
  }

  // Fallback data if API is unavailable
  async loadFallbackData() {
    try {
      const response = await fetch("/data/milky_way_stars.csv");
      const csvText = await response.text();
      this.galaxyData = this.parseCSV(csvText);
      console.log(
        `✅ Loaded ${this.galaxyData.length} stars from CSV fallback`
      );
      this.createGalaxyPoints();
    } catch (error) {
      console.log("Using generated test data...");
      this.createTestData();
      this.createGalaxyPoints();
    }
  }

  async loadGalaxyData() {
    // Legacy function - now handled by loadStarsInView
    await this.loadStarsInView();
  }

  parseCSV(csvText) {
    const lines = csvText.split("\n");
    const galaxies = [];

    const spectralColors = {
      O: [0.2, 0.4, 1.0],
      B: [0.4, 0.7, 1.0],
      A: [1.0, 1.0, 1.0],
      F: [1.0, 1.0, 0.8],
      G: [1.0, 1.0, 0.6],
      K: [1.0, 0.8, 0.4],
      M: [1.0, 0.6, 0.3],
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",");
      if (values.length >= 5) {
        const spectralType = values[4].trim().toUpperCase();
        const color = spectralColors[spectralType] || [1.0, 1.0, 1.0];
        const scaleFactor = 0.5;

        galaxies.push({
          x: parseFloat(values[0]) * scaleFactor,
          y: parseFloat(values[1]) * scaleFactor,
          z: parseFloat(values[2]) * scaleFactor,
          r: color[0],
          g: color[1],
          b: color[2],
          magnitude: parseFloat(values[3]) || 15.0,
        });
      }
    }
    return galaxies;
  }

  createTestData() {
    this.galaxyData = [];
    for (let i = 0; i < 5000; i++) {
      this.galaxyData.push({
        x: (Math.random() - 0.5) * 1000,
        y: (Math.random() - 0.5) * 1000,
        z: (Math.random() - 0.5) * 1000,
        r: Math.random(),
        g: Math.random(),
        b: Math.random(),
        magnitude: 10 + Math.random() * 10,
      });
    }
  }

  createGalaxyPoints() {
    // Remove previous points to avoid accumulating cones
    if (this.points) {
      this.scene.remove(this.points);
      if (this.points.geometry) this.points.geometry.dispose();
      if (this.points.material) this.points.material.dispose();
      this.points = null;
    }

    const count = this.galaxyData.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const galaxy = this.galaxyData[i];
      const i3 = i * 3;

      positions[i3] = galaxy.x;
      positions[i3 + 1] = galaxy.y;
      positions[i3 + 2] = galaxy.z;

      colors[i3] = galaxy.r;
      colors[i3 + 1] = galaxy.g;
      colors[i3 + 2] = galaxy.b;

      // Size based on magnitude - Base size for distance scaling
      const mag = galaxy.magnitude || 15.0;
      let baseSize;
      if (mag < 2) {
        // Super bright stars (Sirius, Canopus, etc.) - HUGE with dramatic glow
        baseSize = 15.0 + (2 - mag) * 5.0; // 15-25 size
      } else if (mag < 3) {
        // Very bright stars - large and prominent
        baseSize = 10.0 + (3 - mag) * 5.0; // 10-15 size
      } else if (mag < 4) {
        // Bright stars - clearly visible
        baseSize = 6.0 + (4 - mag) * 4.0; // 6-10 size
      } else if (mag < 5) {
        // Medium-bright stars
        baseSize = 3.0 + (5 - mag) * 3.0; // 3-6 size
      } else if (mag < 6) {
        // Faint but visible stars
        baseSize = 1.5 + (6 - mag) * 1.5; // 1.5-3 size
      } else {
        // Very faint background stars
        baseSize = 0.5 + Math.max(0, (7 - mag) * 1.0); // 0.5-1.5 size
      }

      // Apply distance-based scaling (natural perspective culling)
      const distance = Math.sqrt(
        galaxy.x * galaxy.x + galaxy.y * galaxy.y + galaxy.z * galaxy.z
      );
      const distanceScale = Math.max(0.1, 1.0 - distance / 1000.0); // Fade with distance
      sizes[i] = baseSize * distanceScale;
    }

    // Generate random twinkle phases for each star
    const twinkles = new Float32Array(this.galaxyData.length);
    for (let i = 0; i < this.galaxyData.length; i++) {
      twinkles[i] = Math.random(); // Random phase 0-1
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("twinkle", new THREE.BufferAttribute(twinkles, 1));

    // Create circular star texture
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Draw glow-like circular gradient with softer falloff
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1.0)");
    gradient.addColorStop(0.1, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.6)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gradient.addColorStop(0.75, "rgba(255,255,255,0.1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: texture },
        time: { value: 0.0 },
        starSizeScale: { value: this.settings.starSizeScale },
        intensity: { value: this.settings.intensity },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float twinkle;
        varying vec3 vColor;
        varying float vBrightness;
        varying float vDistance;
        uniform float time;
        uniform float starSizeScale;
        
        void main() {
          vColor = color;
          vBrightness = size / 20.0;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDistance = length(position); // Distance from camera for fog
          
          // INCREASED twinkling (30% size variation - much more visible!)
          float twinkleAmount = 0.30;
          float pulse = sin(time * 1.5 + twinkle * 6.28) * 0.5 + 0.5;
          float sizeMultiplier = 1.0 + (pulse * twinkleAmount);
          
          gl_PointSize = size * sizeMultiplier * starSizeScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        uniform float intensity;
        varying vec3 vColor;
        varying float vBrightness;
        varying float vDistance;
        
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          
          // Distance fog for better depth perception (200-600pc range)
          float fogStart = 200.0;
          float fogEnd = 600.0;
          float fogFactor = clamp((fogEnd - vDistance) / (fogEnd - fogStart), 0.0, 1.0);
          
          // Fine-tuned color saturation (richer colors)
          vec3 luminance = vec3(0.299, 0.587, 0.114);
          float lum = dot(vColor, luminance);
          vec3 saturatedColor = mix(vec3(lum), vColor, 1.5);
          
          // Gentler brightness boost
          vec3 boostedColor = saturatedColor * (1.3 + vBrightness * 0.4) * intensity;
          
          // Apply distance fog with dark blue tint
          vec3 fogColor = vec3(0.0, 0.0, 0.02);
          vec3 finalColor = mix(fogColor, boostedColor, fogFactor);
          
          gl_FragColor = vec4(finalColor, fogFactor) * tex;
          
          // Extra brightness for very bright stars
          if (vBrightness > 0.8) {
            gl_FragColor.rgb *= 1.3 * intensity;
          }
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    // Store material reference for animation
    this.starMaterial = material;

    // Ensure plane overlay matches the current frame
    this.updatePlaneOverlay();
  }

  animate() {
    // Calculate time delta
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update twinkling animation
    if (this.starMaterial && this.starMaterial.uniforms) {
      if (this.starMaterial.uniforms.time) {
        this.starMaterial.uniforms.time.value = now / 1000.0; // Time in seconds
      }
      if (this.starMaterial.uniforms.starSizeScale) {
        this.starMaterial.uniforms.starSizeScale.value = this.settings.starSizeScale;
      }
      if (this.starMaterial.uniforms.intensity) {
        this.starMaterial.uniforms.intensity.value = this.settings.intensity;
      }
    }

    // VIDEO GAME STYLE: Update navigation FIRST
    this.updateNavigation(delta);

    // Update smooth camera rotation
    this.updateSmoothRotation();

    // Update keyboard controls ONLY if not navigating
    if (!this.isNavigating) {
      this.updateKeyboardControls(delta);
    }

    // Update HUD data
    this.updateHUD(delta);

    // Update star labels (every frame for smooth tracking)
    this.updateStarLabels();

    // Render
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  updateHUD(delta) {
    // Calculate FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // Calculate velocity (parsecs per second)
    const currentPos = this.camera.position.clone();
    const distance = currentPos.distanceTo(this.lastCameraPosition);
    this.velocity = distance / delta;
    this.lastCameraPosition.copy(currentPos);

    // Find nearest star
    let nearestStar = null;
    let nearestDistance = Infinity;

    for (const star of this.galaxyData) {
      if (star.pos) {
        const dist = currentPos.distanceTo(star.pos);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestStar = star;
        }
      }
    }

    // Update HUD elements
    const positionEl = document.getElementById("redshift");
    if (positionEl) {
      positionEl.textContent = `${currentPos.x.toFixed(
        1
      )}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}`;
    }

    const fpsEl = document.getElementById("magnitude");
    if (fpsEl) {
      fpsEl.textContent = `${this.fps} • ${this.velocity.toFixed(0)} pc/s`;
    }

    const countEl = document.getElementById("galaxyCount");
    if (countEl) {
      if (nearestStar && nearestDistance < 1000) {
        // Check if it's a famous star
        let starName;
        const starInfo = this.famousStars
          ? this.famousStars[nearestStar.source_id]
          : null;
        if (starInfo) {
          starName = `✨ ${starInfo.name}`;
        } else {
          starName = nearestStar.source_id
            ? `Gaia ${nearestStar.source_id.toString().slice(-6)}`
            : "Unknown";
        }
        const mag = nearestStar.magnitude
          ? nearestStar.magnitude.toFixed(1)
          : "?";
        countEl.textContent = `${
          this.loadedStarCount
        } • Nearest: ${starName} (${nearestDistance.toFixed(1)}pc, mag ${mag})`;
      } else {
        countEl.textContent = this.loadedStarCount.toString();
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ======== Frame switching & plane overlay ========
  setFrame(frame) {
    const valid = ['EQ','EP','GAL'];
    if (!valid.includes(frame)) return;
    this.currentFrame = frame;
    this.updatePlaneOverlay();
    this.alignCameraToCurrentFrame();
  }

  updatePlaneOverlay() {
    if (!this.scene) return;
    if (this.planeOverlay) {
      this.scene.remove(this.planeOverlay);
      this.planeOverlay.geometry?.dispose?.();
      this.planeOverlay.material?.dispose?.();
      this.planeOverlay = null;
    }

    const radius = 1000; // match constellation sphere
    const segments = 256;
    const positions = new Float32Array((segments) * 3);
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      positions[i*3+0] = Math.cos(t) * radius;
      positions[i*3+1] = 0;
      positions[i*3+2] = Math.sin(t) * radius;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = this.currentFrame === 'EQ' ? 0x64b5f6 : (this.currentFrame === 'EP' ? 0xffd54f : 0xba68c8);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
    const ring = new THREE.LineLoop(geom, mat);

    // Rotate ring so its normal aligns with the frame normal
    const normal = this.getFrameNormal(this.currentFrame);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
    ring.quaternion.copy(q);

    this.planeOverlay = ring;
    this.scene.add(this.planeOverlay);
  }

  getFrameNormal(frame) {
    if (frame === 'EQ') {
      return new THREE.Vector3(0,1,0); // Equatorial plane: y=0
    }
    if (frame === 'EP') {
      const ob = THREE.MathUtils.degToRad(23.439281); // obliquity
      const n = new THREE.Vector3(0,1,0);
      // rotate equatorial normal around X axis by -obliquity to get ecliptic normal
      return n.applyAxisAngle(new THREE.Vector3(1,0,0), -ob);
    }
    // GALACTIC: North galactic pole (ICRS) RA=192.85948°, Dec=27.12825°
    const ra = THREE.MathUtils.degToRad(192.85948);
    const dec = THREE.MathUtils.degToRad(27.12825);
    const x = Math.cos(dec) * Math.cos(ra);
    const y = Math.sin(dec);
    const z = Math.cos(dec) * Math.sin(ra);
    return new THREE.Vector3(x,y,z).normalize();
  }

  alignCameraToCurrentFrame() {
    // Keep position; only reorient to have the plane as the reference "level"
    const up = this.getFrameNormal(this.currentFrame);
    const baseForward = new THREE.Vector3(1,0,0);
    // Project base forward onto plane
    const forward = baseForward.clone().sub(up.clone().multiplyScalar(baseForward.dot(up)));
    if (forward.lengthSq() < 1e-6) {
      forward.set(0,0,1).sub(up.clone().multiplyScalar(up.z));
    }
    forward.normalize();

    this.camera.up.copy(up);
    const target = this.camera.position.clone().add(forward);
    this.camera.lookAt(target);

    // Sync smoothed rotation targets
    this.targetRotationX = this.camera.rotation.x;
    this.targetRotationY = this.camera.rotation.y;
  }

  updateStatus(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
    console.log(message);
  }

  toggleConstellations() {
    this.showConstellations = !this.showConstellations;
    if (this.constellationLines) {
      this.constellationLines.visible = this.showConstellations;
    }
    const btn = document.getElementById("toggleConstellations");
    if (btn) {
      btn.textContent = this.showConstellations
        ? "⭐ Hide Constellations"
        : "⭐ Show Constellations";
    }
    console.log(
      `Constellations ${this.showConstellations ? "visible" : "hidden"}`
    );
  }

  toggleStarLabels() {
    this.showStarLabels = !this.showStarLabels;
    const btn = document.getElementById("toggleStarLabels");
    if (btn) {
      btn.textContent = this.showStarLabels
        ? "⭐ Hide Legendary Stars"
        : "⭐ Show Legendary Stars";
    }

    // Only clear labels if BOTH star labels AND solar system labels are disabled
    if (
      !this.showStarLabels &&
      !this.showSolarSystemLabels &&
      this.labelContainer
    ) {
      this.labelContainer.innerHTML = "";
    }

    console.log(`Star labels ${this.showStarLabels ? "visible" : "hidden"}`);
  }

  // Search stars by name or Gaia ID
  searchStars(query) {
    if (!query || query.length < 2) return [];
    
    const queryLower = query.toLowerCase();
    const matches = [];
    
    console.log(`🔍 Searching for: "${query}"`);
    
    // Search through galaxy data
    for (let i = 0; i < this.galaxyData.length; i++) {
      const star = this.galaxyData[i];
      
      // Check famous star names
      let starName = null;
      let score = 0;
      
      if (this.famousStars && star.source_id && this.famousStars[star.source_id]) {
        starName = this.famousStars[star.source_id].name;
        const nameLower = starName.toLowerCase();
        
        // Exact match
        if (nameLower === queryLower) {
          score = 100;
        }
        // Starts with
        else if (nameLower.startsWith(queryLower)) {
          score = 90;
        }
        // Contains
        else if (nameLower.includes(queryLower)) {
          score = 80;
        }
      }
      
      // Also check Gaia ID
      if (star.source_id) {
        const gaiaID = star.source_id.toString();
        if (gaiaID.includes(query)) {
          score = Math.max(score, 70);
          if (!starName) {
            starName = `Gaia ${gaiaID.slice(-6)}`;
          }
        }
      }
      
      if (score > 0) {
        matches.push({ star, name: starName, score });
      }
      
      // Limit results
      if (matches.length >= 50) break;
    }
    
    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);
    
    console.log(`  Found ${matches.length} matches`);
    return matches.slice(0, 10); // Return top 10
  }

  async loadSolarSystem() {
    try {
      const module = await import("./solar-system.js");
      this.solarSystemData = module.SOLAR_SYSTEM;
      this.solarSystemLabelColors = module.SOLAR_SYSTEM_LABEL_COLORS;
      this.solarSystemScale = module.SOLAR_SYSTEM_SCALE;
      console.log(
        `🌍 Loaded Solar System with ${
          Object.keys(this.solarSystemData).length
        } objects`
      );
    } catch (error) {
      console.warn("Could not load solar system:", error);
      this.solarSystemData = {};
    }
  }

  toggleSolarSystem() {
    this.showSolarSystemLabels = !this.showSolarSystemLabels;
    const btn = document.getElementById("toggleSolarSystem");
    if (btn) {
      btn.textContent = this.showSolarSystemLabels
        ? "🌍 Hide Solar System Labels"
        : "🌍 Show Solar System Labels";
    }

    console.log(
      `Solar System labels ${this.showSolarSystemLabels ? "visible" : "hidden"}`
    );
  }

  // Click-to-navigate: find and fly to clicked star/planet
  handleStarClick(event) {
    // Left-click only
    if (event.button !== 0) return;

    // Simple, robust CPU pick in screen space (works with ShaderMaterial points)
    const px = event.clientX;
    const py = event.clientY;
    const dpr = window.devicePixelRatio || 1;
    const pickRadius = 18 * dpr; // pixels
    const pickRadius2 = pickRadius * pickRadius;

    let best = null; // { type: 'star'|'solar', index, position: Vector3 }
    let bestD2 = pickRadius2;

    // Check galaxy stars
    for (let i = 0; i < this.galaxyData.length; i++) {
      const s = this.galaxyData[i];
      const p = s.pos || new THREE.Vector3(s.x, s.y, s.z);
      const sp = p.clone().project(this.camera);
      if (sp.z > 1.0) continue; // behind camera
      const sx = (sp.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-sp.y * 0.5 + 0.5) * window.innerHeight;
      if (sx < 0 || sx > window.innerWidth || sy < 0 || sy > window.innerHeight) continue;
      const dx = sx - px;
      const dy = sy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { type: 'star', index: i, position: p };
      }
    }

    // Also consider solar system points (optional)
    if (this.solarSystemData && Object.keys(this.solarSystemData).length) {
      const objs = Object.values(this.solarSystemData);
      for (let j = 0; j < objs.length; j++) {
        const o = objs[j];
        const p = new THREE.Vector3(
          o.x * this.solarSystemScale,
          o.y * this.solarSystemScale,
          o.z * this.solarSystemScale
        );
        const sp = p.clone().project(this.camera);
        if (sp.z > 1.0) continue;
        const sx = (sp.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-sp.y * 0.5 + 0.5) * window.innerHeight;
        if (sx < 0 || sx > window.innerWidth || sy < 0 || sy > window.innerHeight) continue;
        const dx = sx - px;
        const dy = sy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { type: 'solar', index: j, position: p };
        }
      }
    }

    if (!best) return; // nothing close enough

    if (best.type === 'solar') {
      const solarObjects = Object.values(this.solarSystemData);
      const solarObj = solarObjects[best.index];
      if (solarObj) {
        const starData = { x: best.position.x, y: best.position.y, z: best.position.z };
        console.log(`🎯 Clicked on ${solarObj.name}`);
        this.navigateToStar(starData);
      }
      return;
    }

    // Regular star
    const star = this.galaxyData[best.index];
    if (!star) return;
    const starInfo = this.famousStars ? this.famousStars[star.source_id] : null;
    const starName = starInfo ? starInfo.name : (star.source_id ? `Gaia ${star.source_id.toString().slice(-6)}` : 'Star');
    console.log(`🎯 Clicked on ${starName}`);
    this.navigateToStar(star);
    if (typeof selectStar === 'function') {
      selectStar(star, starName);
    }
  }

  // VIDEO GAME STYLE: Navigate to star (clean, simple, works)
  navigateToStar(star) {
    console.log(`� Navigate to star:`, star);
    
    // Calculate target position (5 parsecs away from star)
    const starPos = new THREE.Vector3(star.x, star.y, star.z);
    const viewDistance = 5;
    
    // Reset cursor to prevent stuck "grabbing" state
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.cursor = "grab";
    }
    
    // Calculate approach direction: from camera toward star
    const currentPos = this.camera.position.clone();
    const directionToStar = starPos.clone().sub(currentPos).normalize();
    
    // Target position: stop 5 parsecs BEFORE the star (along approach direction)
    // IMPORTANT: Clone direction before scaling to avoid mutation!
    const offset = directionToStar.clone().multiplyScalar(viewDistance);
    const cameraTarget = starPos.clone().sub(offset);
    
    console.log(`🎯 Target: camera at (${cameraTarget.x.toFixed(1)}, ${cameraTarget.y.toFixed(1)}, ${cameraTarget.z.toFixed(1)}), looking at star (${starPos.x.toFixed(1)}, ${starPos.y.toFixed(1)}, ${starPos.z.toFixed(1)})`);
    console.log(`📍 Current: (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)})`);
    console.log(`📏 Distance: ${currentPos.distanceTo(cameraTarget).toFixed(1)} parsecs`);
    
    // Set navigation target
    this.navigationTarget = {
      position: cameraTarget,
      lookAt: starPos
    };
    this.isNavigating = true;
    
    // STOP all keyboard movement
    this.currentVelocity.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);
  }
  
  // VIDEO GAME STYLE: Update navigation (constant velocity with deceleration)
  updateNavigation(delta) {
    if (!this.navigationTarget || !this.isNavigating) return;
    
    const target = this.navigationTarget.position;
    const lookAt = this.navigationTarget.lookAt;
    const distanceToTarget = this.camera.position.distanceTo(target);
    
    // Complete when very close - clean snap
    if (distanceToTarget < 0.1) {
      this.camera.position.copy(target);
      this.camera.lookAt(lookAt);
      
      // Update rotation targets
      this.targetRotationX = this.camera.rotation.x;
      this.targetRotationY = this.camera.rotation.y;
      this.rotationX = this.targetRotationX;
      this.rotationY = this.targetRotationY;
      
      console.log(`✅ Navigation complete! Camera at (${this.camera.position.x.toFixed(1)}, ${this.camera.position.y.toFixed(1)}, ${this.camera.position.z.toFixed(1)})`);
      
      this.navigationTarget = null;
      this.isNavigating = false;
      this.currentVelocity.set(0, 0, 0);
      this.targetVelocity.set(0, 0, 0);
      return;
    }
    
    // Calculate direction (camera to target)
    const direction = target.clone().sub(this.camera.position).normalize();
    
    // Calculate speed with simple deceleration
    let speed = this.navigationSpeed; // Base: 80 pc/s
    
    // Deceleration zone: smooth slowdown at < 20 parsecs
    if (distanceToTarget < 20) {
      // Square root curve for natural deceleration
      const slowdownFactor = Math.pow(distanceToTarget / 20, 0.5);
      speed = this.navigationSpeed * Math.max(0.15, slowdownFactor); // Min 15% speed
    }
    
    // Move toward target at calculated speed
    const moveDistance = speed * delta;
    const actualMove = Math.min(moveDistance, distanceToTarget);
    const moveVector = direction.clone().multiplyScalar(actualMove);
    this.camera.position.add(moveVector);
    
    // Direct lookAt for smooth rotation
    this.camera.lookAt(lookAt);
    
    // Update rotation tracking for orbit controls
    this.targetRotationX = this.camera.rotation.x;
    this.targetRotationY = this.camera.rotation.y;
  }

  // Cinematic Tour System
  startTour() {
    console.log("🎬 Starting cinematic tour...");
    this.tourActive = true;
    this.tourCurrentStop = 0;
    this.showTourStop();
  }

  showTourStop() {
    if (this.tourCurrentStop >= this.tourWaypoints.length) {
      this.endTour();
      return;
    }

    const stop = this.tourWaypoints[this.tourCurrentStop];
    console.log(`📍 Tour stop ${this.tourCurrentStop + 1}: ${stop.name}`);

    // Find the star and navigate with SMOOTH SPACESHIP WARP effect
    const star = this.findStarByName(stop.targetStar);
    if (star) {
      const startPos = this.camera.position.clone();
      const targetPos = new THREE.Vector3(star.x, star.y, star.z);
      
      // Calculate EXACT direction from camera TO star (the travel vector)
      const travelDirection = new THREE.Vector3();
      travelDirection.subVectors(targetPos, startPos); // target - start = direction
      travelDirection.normalize(); // Make it unit length
      
      // PULL BACK: Move camera in OPPOSITE direction (away from star)
      // Like a spaceship building tension before the jump
      const pullBackDistance = 5; // Bigger pullback (5 parsecs)
      const pullBackVector = travelDirection.clone().multiplyScalar(-pullBackDistance);
      const pullBackPos = startPos.clone().add(pullBackVector);
      
      console.log('🚀 Pull-back vector:', pullBackVector);
      
      // Phase 1: SLOW pull-back animation (1.2 seconds - much more noticeable)
      const pullBackDuration = 1200;
      const pullBackStart = performance.now();
      
      const pullBackAnimation = () => {
        const elapsed = performance.now() - pullBackStart;
        const progress = Math.min(elapsed / pullBackDuration, 1);
        
        // Smooth ease-out for natural deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        
        this.camera.position.lerpVectors(startPos, pullBackPos, eased);
        this.camera.lookAt(targetPos); // Keep looking at destination
        
        if (progress < 1) {
          requestAnimationFrame(pullBackAnimation);
        } else {
          // Phase 2: Brief pause (0.3s) - like charging up
          setTimeout(() => {
            // Phase 3: LAUNCH forward at reduced speed
            const originalSpeed = this.navigationSpeed;
            this.navigationSpeed = 25; // Even slower for smooth feel
            
            this.navigateToStar(star);
            
            setTimeout(() => {
              this.navigationSpeed = originalSpeed;
            }, 100);
            
            // Phase 4: Show overlay during travel
            setTimeout(() => {
              const overlay = document.getElementById('tourOverlay');
              document.getElementById('tourTitle').textContent = stop.name;
              document.getElementById('tourDescription').textContent = stop.description;
              overlay.style.display = 'block';
              overlay.style.opacity = '0';
              setTimeout(() => { overlay.style.opacity = '1'; }, 20);
            }, 2000);
          }, 300); // Pause before launch
        }
      };
      
      pullBackAnimation();
    } else {
      console.warn(`⚠️ Star not found: ${stop.targetStar}`);
    }
  }

  nextTourStop() {
    const overlay = document.getElementById('tourOverlay');
    
    // Instant fade out
    overlay.style.opacity = '0';
    
    setTimeout(() => {
      overlay.style.display = 'none';
      
      // Advance to next stop
      this.tourCurrentStop++;
      
      // NO DELAY - Next button instantly triggers travel
      if (this.tourActive) {
        this.showTourStop();
      }
    }, 150); // Just fade time, no pause
  }

  endTour() {
    console.log("✅ Tour complete!");
    this.tourActive = false;
    this.tourCurrentStop = 0;
    
    const overlay = document.getElementById('tourOverlay');
    overlay.style.opacity = '0';
    
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 150); // Reduced from 400ms to 150ms (62% faster)
  }

  findStarByName(name) {
    // Search through galaxy data (same as searchStars)
    const nameLower = name.toLowerCase();
    
    for (const star of this.galaxyData) {
      // Check if this star has a famous name
      if (this.famousStars && star.source_id && this.famousStars[star.source_id]) {
        const starName = this.famousStars[star.source_id].name;
        if (starName.toLowerCase().includes(nameLower)) {
          console.log(`✅ Found star: ${starName} at (${star.x.toFixed(1)}, ${star.y.toFixed(1)}, ${star.z.toFixed(1)})`);
          return star; // Return the star with x, y, z coordinates
        }
      }
    }
    
    console.warn(`❌ Star not found in galaxyData: ${name}`);
    return null;
  }

  createSolarSystemPoints() {
    if (!this.solarSystemData || Object.keys(this.solarSystemData).length === 0)
      return;

    const objects = Object.values(this.solarSystemData);
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(objects.length * 3);
    const colors = new Float32Array(objects.length * 3);
    const sizes = new Float32Array(objects.length);

    objects.forEach((obj, i) => {
      const i3 = i * 3;
      // Scale up positions so they're visible (planets are TINY compared to stellar distances)
      positions[i3] = obj.x * this.solarSystemScale;
      positions[i3 + 1] = obj.y * this.solarSystemScale;
      positions[i3 + 2] = obj.z * this.solarSystemScale;

      colors[i3] = obj.color[0];
      colors[i3 + 1] = obj.color[1];
      colors[i3 + 2] = obj.color[2];

      sizes[i] = obj.size;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Use the SAME star texture - works perfectly!
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Same glow as stars
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1.0)");
    gradient.addColorStop(0.1, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.6)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gradient.addColorStop(0.75, "rgba(255,255,255,0.1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);

    // SIMPLE shader - just like stars but no twinkling
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: texture },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Same scale as stars
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.solarSystemPoints = new THREE.Points(geometry, material);
    this.solarSystemPoints.visible = true; // ALWAYS visible
    this.scene.add(this.solarSystemPoints);

    console.log(
      `Solar System created with ${objects.length} objects at scale ${this.solarSystemScale}x`
    );
    console.log(
      `Earth position: (${objects[3].x * this.solarSystemScale}, ${
        objects[3].y * this.solarSystemScale
      }, ${objects[3].z * this.solarSystemScale}) parsecs`
    );
  }

  // === STAR LABEL SYSTEM ===

  setupLabelContainer() {
    this.labelContainer = document.createElement("div");
    this.labelContainer.id = "star-labels";
    this.labelContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    `;
    document.body.appendChild(this.labelContainer);
  }

  async loadFamousStars() {
    try {
      const module = await import("./star-names.js");
      this.famousStars = module.FAMOUS_STARS;
      this.labelColors = module.LABEL_COLORS;
      console.log(
        `✨ Loaded ${Object.keys(this.famousStars).length} famous star names`
      );
    } catch (error) {
      console.warn("Could not load star names:", error);
      this.famousStars = {};
      this.labelColors = {};
    }
  }

  updateStarLabels() {
    if (!this.labelContainer || !this.famousStars) return;

    // Clear old labels
    this.labelContainer.innerHTML = "";

    const cameraPos = this.camera.position;
    const visibleLabels = [];

    // Add STAR labels if star labels are enabled
    if (this.showStarLabels) {
      // Check each star for labeling
      for (const star of this.galaxyData) {
        const starInfo = this.famousStars[star.source_id];
        if (!starInfo) continue;

        const starPos = star.pos || new THREE.Vector3(star.x, star.y, star.z);
        const distance = cameraPos.distanceTo(starPos);

        // Show label if: always show flag OR within approach distance
        const shouldShow =
          starInfo.alwaysShow || distance < this.approachDistance;

        if (shouldShow) {
          // Project 3D position to 2D screen
          const screenPos = starPos.clone();
          screenPos.project(this.camera);

          // Convert to screen coordinates (round to prevent jitter)
          const x = Math.round((screenPos.x * 0.5 + 0.5) * window.innerWidth);
          const y = Math.round((-screenPos.y * 0.5 + 0.5) * window.innerHeight);

          // Check if in front of camera and on screen
          if (
            screenPos.z < 1 &&
            x > 0 &&
            x < window.innerWidth &&
            y > 0 &&
            y < window.innerHeight
          ) {
            visibleLabels.push({
              name: starInfo.name,
              type: starInfo.type,
              x,
              y,
              distance: distance.toFixed(1),
              magnitude: star.magnitude.toFixed(1),
              alwaysShow: starInfo.alwaysShow,
              position: starPos, // Store position for click navigation
            });
          }
        }
      }
    }

    // Add SOLAR SYSTEM labels if solar system labels are enabled (INDEPENDENT!)
    if (this.showSolarSystemLabels && this.solarSystemData) {
      Object.values(this.solarSystemData).forEach((obj) => {
        const solarPos = new THREE.Vector3(
          obj.x * this.solarSystemScale,
          obj.y * this.solarSystemScale,
          obj.z * this.solarSystemScale
        );
        const distance = cameraPos.distanceTo(solarPos);

        // Project to screen
        const screenPos = solarPos.clone();
        screenPos.project(this.camera);

        const x = Math.round((screenPos.x * 0.5 + 0.5) * window.innerWidth);
        const y = Math.round((-screenPos.y * 0.5 + 0.5) * window.innerHeight);

        if (
          screenPos.z < 1 &&
          x > 0 &&
          x < window.innerWidth &&
          y > 0 &&
          y < window.innerHeight
        ) {
          visibleLabels.push({
            name: obj.name,
            type: "solar-system",
            x,
            y,
            distance: `${((distance / this.solarSystemScale) * 206265).toFixed(
              0
            )} AU`, // Convert to AU
            magnitude: obj.magnitude.toFixed(1),
            alwaysShow: true,
            position: solarPos, // Store position for click navigation
          });
        }
      });
    }

    // Create label elements
    for (const label of visibleLabels) {
      const labelEl = document.createElement("div");
      let color;
      if (label.type === "solar-system") {
        // Use specific color for solar system object type
        const solarObj = Object.values(this.solarSystemData).find(
          (o) => o.name === label.name
        );
        color = solarObj
          ? this.solarSystemLabelColors[solarObj.type]
          : "#00d4ff";
      } else {
        color = this.labelColors[label.type] || "#ffffff";
      }
      const fontSize = label.alwaysShow ? "14px" : "12px";
      const fontWeight = label.alwaysShow ? "bold" : "normal";

      labelEl.style.cssText = `
        position: absolute;
        left: ${label.x}px;
        top: ${label.y}px;
        transform: translate(-50%, -100%);
        color: ${color};
        font-size: ${fontSize};
        font-weight: ${fontWeight};
        font-family: 'Segoe UI', sans-serif;
        text-shadow: 
          0 0 3px rgba(0,0,0,0.9),
          0 0 6px rgba(0,0,0,0.7),
          0 0 10px ${color}44;
        white-space: nowrap;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        border: 1px solid ${color}66;
        backdrop-filter: blur(4px);
        cursor: pointer;
        transition: all 0.2s;
      `;

      // Add hover effect
      labelEl.addEventListener("mouseenter", () => {
        labelEl.style.background = "rgba(0, 0, 0, 0.8)";
        labelEl.style.borderColor = color;
        labelEl.style.transform = "translate(-50%, -100%) scale(1.05)";
      });

      labelEl.addEventListener("mouseleave", () => {
        labelEl.style.background = "rgba(0, 0, 0, 0.5)";
        labelEl.style.borderColor = `${color}66`;
        labelEl.style.transform = "translate(-50%, -100%) scale(1)";
      });

      // Make label clickable - navigate to star/planet
      labelEl.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent click from falling through to canvas
        
        if (label.position) {
          // Find the actual star data for this label
          let starData = null;
          
          if (label.type === "solar-system") {
            // Solar system object
            starData = {
              x: label.position.x,
              y: label.position.y,
              z: label.position.z
            };
          } else {
            // Regular star - find in galaxy data by position
            const labelPos = label.position;
            starData = this.galaxyData.find(star => {
              const dist = Math.sqrt(
                Math.pow(star.x - labelPos.x, 2) +
                Math.pow(star.y - labelPos.y, 2) +
                Math.pow(star.z - labelPos.z, 2)
              );
              return dist < 0.1; // Close enough match
            });
            
            if (!starData) {
              // Fallback to position-based navigation
              starData = {
                x: labelPos.x,
                y: labelPos.y,
                z: labelPos.z
              };
            }
          }
          
          console.log(`🏷️ Clicked label: ${label.name}`);
          this.navigateToStar(starData);
          
          // Open info panel if it's a regular star (selectStar is global function)
          if (label.type !== "solar-system" && starData.source_id && typeof selectStar === 'function') {
            selectStar(starData, label.name);
          }
        }
      });

      labelEl.innerHTML = `
        <div style="line-height: 1.3;">
          <div style="font-size: ${fontSize};">${label.name}</div>
          <div style="font-size: 10px; opacity: 0.8;">${label.distance} ${
        label.type === "solar-system" ? "" : "• mag " + label.magnitude
      }</div>
        </div>
      `;

      this.labelContainer.appendChild(labelEl);
    }
  }
}

// Initialize when page loads
window.addEventListener("DOMContentLoaded", () => {
  const viewer = new CosmicWebViewer();

  // ========== Search Bar & Info Panel ==========
  const searchInput = document.getElementById("star-search");
  const searchResults = document.getElementById("search-results");
  const infoPanel = document.getElementById("info-panel");
  const infoStarName = document.getElementById("info-star-name");
  const infoContent = document.getElementById("info-content");
  const infoClose = document.getElementById("info-close");

  console.log("🔍 Search components:", { searchInput, searchResults, infoPanel, infoStarName, infoContent, infoClose });

  let searchTimeout = null;
  let selectedStar = null;

  // Search functionality
  if (searchInput && searchResults) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim().toLowerCase();
      
      if (query.length < 2) {
        searchResults.style.display = "none";
        return;
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const matches = viewer.searchStars(query);
        displaySearchResults(matches);
      }, 200);
    });

    // Clear search on escape
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        searchResults.style.display = "none";
      }
    });
  }

  function displaySearchResults(matches) {
    console.log(`📊 Displaying ${matches.length} search results`);
    
    if (!matches || matches.length === 0) {
      searchResults.innerHTML = '<div style="padding:12px;color:#90a4ae;text-align:center;">No stars found</div>';
      searchResults.style.display = "block";
      return;
    }

    const html = matches.slice(0, 10).map(match => {
      const distLy = match.star.distance_ly || (match.star.parallax_mas > 0 ? (3.26156 * 1000 / match.star.parallax_mas) : 0);
      const distStr = distLy < 100 ? distLy.toFixed(1) : distLy.toFixed(0);
      const magStr = match.star.phot_g_mean_mag?.toFixed(2) || match.star.magnitude?.toFixed(2) || "—";
      
      console.log(`  ⭐ ${match.name}: ${distStr} ly, mag ${magStr}`);
      
      return `
        <div class="search-result-item" data-star-id="${match.star.source_id}" 
             style="padding:10px 12px;border-bottom:1px solid rgba(100,181,246,0.1);cursor:pointer;transition:all 0.2s;"
             onmouseover="this.style.background='rgba(100,181,246,0.15)'"
             onmouseout="this.style.background='transparent'">
          <div style="color:#64b5f6;font-weight:600;margin-bottom:3px;">${match.name}</div>
          <div style="color:#90a4ae;font-size:11px;">
            ${distStr} ly • mag ${magStr}
          </div>
        </div>
      `;
    }).join('');

    searchResults.innerHTML = html;
    searchResults.style.display = "block";

    // Bind click events
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const sourceId = item.dataset.starId;
        const match = matches.find(m => m.star.source_id.toString() === sourceId);
        if (match) {
          console.log(`🔍 Search selected: ${match.name}`);
          
          // Navigate to the star immediately
          viewer.navigateToStar(match.star);
          
          // Also open info panel
          selectStar(match.star, match.name);
          
          // Clear search
          searchInput.value = "";
          searchResults.style.display = "none";
        }
      });
    });
  }

  function selectStar(star, name) {
    selectedStar = { star, name };
    
    console.log(`📋 Opening info panel for: ${name}`, star);
    
    // Show info panel
    if (infoPanel && infoStarName && infoContent) {
      infoStarName.textContent = name;
      
      const distPc = star.parallax_mas > 0 ? (1000 / star.parallax_mas) : (star.distance || 0);
      const distLy = distPc * 3.26156;
      const distStr = distLy < 100 ? `${distLy.toFixed(2)} ly (${distPc.toFixed(2)} pc)` : 
                                     `${distLy.toFixed(0)} ly (${distPc.toFixed(0)} pc)`;
      
      const appMag = star.phot_g_mean_mag?.toFixed(2) || star.magnitude?.toFixed(2) || "—";
      const absMag = (star.phot_g_mean_mag || star.magnitude) ? 
        ((star.phot_g_mean_mag || star.magnitude) - 5 * Math.log10(distPc / 10)).toFixed(2) : "—";
      
      const colorIndex = star.bp_rp?.toFixed(2) || "—";
      let spectralClass = "Unknown";
      let spectralColor = "#999";
      if (star.bp_rp !== undefined) {
        if (star.bp_rp < 0.0) { 
          spectralClass = "O-B (Blue)"; 
          spectralColor = "#88bbff";
        } else if (star.bp_rp < 0.5) { 
          spectralClass = "A-F (White)"; 
          spectralColor = "#cce5ff";
        } else if (star.bp_rp < 1.0) { 
          spectralClass = "F-G (Yellow-White)"; 
          spectralColor = "#fff3b0";
        } else if (star.bp_rp < 1.5) { 
          spectralClass = "G-K (Yellow-Orange)"; 
          spectralColor = "#ffd494";
        } else { 
          spectralClass = "K-M (Orange-Red)"; 
          spectralColor = "#ffaa66";
        }
      }
      
      const pmra = star.pmra_mas_yr?.toFixed(2) || "—";
      const pmdec = star.pmdec_mas_yr?.toFixed(2) || "—";
      
      infoContent.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;font-size:13px;">
          <span style="color:#64b5f6;">📍</span>
          <div>
            <div style="color:#90caf9;font-size:11px;opacity:0.7;">Distance</div>
            <div style="color:#fff;font-weight:500;">${distStr}</div>
          </div>
          
          <span style="color:#ffa726;">✨</span>
          <div>
            <div style="color:#ffb74d;font-size:11px;opacity:0.7;">Apparent Mag</div>
            <div style="color:#fff;font-weight:500;">${appMag}</div>
          </div>
          
          <span style="color:#ab47bc;">💫</span>
          <div>
            <div style="color:#ba68c8;font-size:11px;opacity:0.7;">Absolute Mag</div>
            <div style="color:#fff;font-weight:500;">${absMag}</div>
          </div>
          
          <span style="color:#26c6da;">🌟</span>
          <div>
            <div style="color:#4dd0e1;font-size:11px;opacity:0.7;">Spectral Type</div>
            <div style="color:${spectralColor};font-weight:600;">${spectralClass}</div>
          </div>
          
          <span style="color:#66bb6a;">🚀</span>
          <div>
            <div style="color:#81c784;font-size:11px;opacity:0.7;">Proper Motion</div>
            <div style="color:#fff;font-size:11px;">RA: ${pmra} • Dec: ${pmdec} mas/yr</div>
          </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);
                    font-size:10px;color:#546e7a;text-align:center;">
          ${star.source_id}
        </div>
      `;
      
      infoPanel.style.display = "block";
      console.log(`✅ Info panel displayed successfully`);
    } else {
      console.error(`❌ Info panel elements not found:`, { infoPanel, infoStarName, infoContent });
    }

    // Additionally show center-bottom overlay like the tour popup
    const starOverlay = document.getElementById('starOverlay');
    const starOverlayTitle = document.getElementById('starOverlayTitle');
    const starOverlayBody = document.getElementById('starOverlayBody');
    const starOverlayClose = document.getElementById('starOverlayClose');
    if (starOverlay && starOverlayTitle && starOverlayBody) {
      starOverlayTitle.textContent = name;
      starOverlayBody.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;">
          <span style="color:#64b5f6;">📍</span>
          <div>
            <div style="color:#90caf9;font-size:11px;opacity:0.8;">Distance</div>
            <div style="color:#e8f4ff;font-weight:600;">${distStr}</div>
          </div>
          <span style="color:#ffa726;">✨</span>
          <div>
            <div style="color:#ffcc80;font-size:11px;opacity:0.8;">Apparent Mag</div>
            <div style="color:#fff;font-weight:600;">${appMag}</div>
          </div>
          <span style="color:#ab47bc;">💫</span>
          <div>
            <div style="color:#ce93d8;font-size:11px;opacity:0.8;">Absolute Mag</div>
            <div style="color:#fff;font-weight:600;">${absMag}</div>
          </div>
          <span style="color:#26c6da;">🌟</span>
          <div>
            <div style="color:#4dd0e1;font-size:11px;opacity:0.8;">Spectral Type</div>
            <div style="color:${spectralColor};font-weight:700;">${spectralClass}</div>
          </div>
        </div>
        <div style="margin-top:10px;color:#78909c;font-size:10px;text-align:center;">${star.source_id || ''}</div>
      `;
      starOverlay.style.display = 'block';
      starOverlay.style.opacity = '0';
      setTimeout(()=>{ starOverlay.style.opacity = '1'; }, 20);

      if (starOverlayClose) {
        starOverlayClose.onclick = () => {
          starOverlay.style.opacity = '0';
          setTimeout(()=>{ starOverlay.style.display = 'none'; }, 150);
        };
      }
    }
  }

  // Expose to global so canvas click handler inside CosmicWebViewer can call it
  window.selectStar = selectStar;

  // Close info panel
  if (infoClose) {
    infoClose.addEventListener("click", () => {
      if (infoPanel) infoPanel.style.display = "none";
      selectedStar = null;
    });
  }

  // Wire up reset camera button
  const resetBtn = document.getElementById("resetCamera");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      viewer.camera.position.set(0, 0, 0);
      viewer.camera.rotation.set(0, 0, 0);
      viewer.rotationX = 0;
      viewer.rotationY = 0;
      viewer.targetRotationX = 0;
      viewer.targetRotationY = 0;
      viewer.currentVelocity.set(0, 0, 0);
      viewer.camera.lookAt(100, 0, 0);
      console.log("🏠 Camera reset to origin");
    });
  }

  // Wire up constellation toggle button
  const constellationBtn = document.getElementById("toggleConstellations");
  if (constellationBtn) {
    constellationBtn.addEventListener("click", () =>
      viewer.toggleConstellations()
    );
  }

  // Wire up star labels toggle button
  const starLabelsBtn = document.getElementById("toggleStarLabels");
  if (starLabelsBtn) {
    starLabelsBtn.addEventListener("click", () => viewer.toggleStarLabels());
  }

  // Wire up solar system toggle button
  const solarSystemBtn = document.getElementById("toggleSolarSystem");
  if (solarSystemBtn) {
    solarSystemBtn.addEventListener("click", () => viewer.toggleSolarSystem());
  }

  // Wire up HUD minimize button
  const minimizeBtn = document.getElementById("minimizeBtn");
  const hud = document.getElementById("hud");
  if (minimizeBtn && hud) {
    minimizeBtn.addEventListener("click", () => {
      hud.classList.toggle("minimized");
      minimizeBtn.textContent = hud.classList.contains("minimized") ? "+" : "−";
      minimizeBtn.title = hud.classList.contains("minimized")
        ? "Maximize HUD"
        : "Minimize HUD";
    });
  }

  // Wire up Tour buttons
  const startTourBtn = document.getElementById("startTour");
  if (startTourBtn) {
    startTourBtn.addEventListener("click", () => viewer.startTour());
  }

  const tourNextBtn = document.getElementById("tourNext");
  if (tourNextBtn) {
    tourNextBtn.addEventListener("click", () => viewer.nextTourStop());
  }

  const tourSkipBtn = document.getElementById("tourSkip");
  if (tourSkipBtn) {
    tourSkipBtn.addEventListener("click", () => viewer.endTour());
  }

  // ========== Tuning Controls ==========
  const fovControl = document.getElementById('fovControl');
  const fovValue = document.getElementById('fovValue');
  const starSizeControl = document.getElementById('starSizeControl');
  const starSizeValue = document.getElementById('starSizeValue');
  const intensityControl = document.getElementById('intensityControl');
  const intensityValue = document.getElementById('intensityValue');
  const navSpeedControl = document.getElementById('navSpeedControl');
  const navSpeedValue = document.getElementById('navSpeedValue');

  // Initialize UI from viewer settings
  if (fovControl && fovValue) {
    fovControl.value = viewer.settings.fov.toString();
    fovValue.textContent = `${viewer.settings.fov}°`;
    fovControl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      viewer.settings.fov = val;
      viewer.camera.fov = val;
      viewer.camera.updateProjectionMatrix();
      fovValue.textContent = `${val}°`;
    });
  }

  if (starSizeControl && starSizeValue) {
    starSizeControl.value = viewer.settings.starSizeScale.toString();
    starSizeValue.textContent = `${parseFloat(starSizeControl.value).toFixed(1)}×`;
    starSizeControl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      viewer.settings.starSizeScale = val;
      starSizeValue.textContent = `${val.toFixed(1)}×`;
    });
  }

  if (intensityControl && intensityValue) {
    intensityControl.value = viewer.settings.intensity.toString();
    intensityValue.textContent = `${parseFloat(intensityControl.value).toFixed(2)}×`;
    intensityControl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      viewer.settings.intensity = val;
      intensityValue.textContent = `${val.toFixed(2)}×`;
    });
  }

  if (navSpeedControl && navSpeedValue) {
    navSpeedControl.value = viewer.settings.speedMultiplier.toString();
    navSpeedValue.textContent = `${parseFloat(navSpeedControl.value).toFixed(1)}×`;
    navSpeedControl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      viewer.settings.speedMultiplier = val;
      viewer.moveSpeed = viewer.baseMoveSpeed * val;
      viewer.navigationSpeed = viewer.baseNavigationSpeed * val;
      navSpeedValue.textContent = `${val.toFixed(1)}×`;
    });
  }

  // ========== Frame Preset Buttons ==========
  const viewEq = document.getElementById('viewEq');
  const viewEp = document.getElementById('viewEp');
  const viewGal = document.getElementById('viewGal');
  if (viewEq) viewEq.addEventListener('click', () => viewer.setFrame('EQ'));
  if (viewEp) viewEp.addEventListener('click', () => viewer.setFrame('EP'));
  if (viewGal) viewGal.addEventListener('click', () => viewer.setFrame('GAL'));
});
