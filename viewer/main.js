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
    this.moveSpeed = 500; // Movement speed units per second

    // Timing for animation
    this.lastTime = performance.now();

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

    this.init();
  }

  async init() {
    this.updateStatus("Loading bright star catalog from Gaia DR3...");

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();

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
      this.updateStatus("Loading 9000 naked-eye visible stars...");
      console.log("🌟 Fetching full-sky bright star catalog (mag < 6.5)...");

      // Load all 20K stars from catalog
      const url = `${this.apiUrl}/api/stars/bright-catalog?mag_limit=7.0`;
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

      // Convert to our format and render on sphere
      this.brightStarCatalog = this.convertApiStarsToGalaxyData(data.stars, {
        ra: 0,
        dec: 0,
      });

      this.galaxyData = this.brightStarCatalog;
      this.loadedStarCount = data.count;
      this.catalogLoaded = true;

      // Render the full sky
      this.createGalaxyPoints();

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
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50000);
    // Start at origin looking along +X axis - we're inside the galaxy now!
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(100, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000011, 1);
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener("resize", () => this.onWindowResize());
  }

  setupControls() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("mousedown", (e) => {
      this.isMouseDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("mouseup", () => {
      this.isMouseDown = false;
      canvas.style.cursor = "grab";
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.mouseX;
      const deltaY = e.clientY - this.mouseY;

      // Free-look camera rotation (rotate the camera itself, not position)
      const rotateSpeed = 0.002;

      // Horizontal rotation (yaw) - rotate around world Y axis
      const yawAngle = -deltaX * rotateSpeed;
      const yawQuat = new THREE.Quaternion();
      yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
      this.camera.quaternion.multiplyQuaternions(
        yawQuat,
        this.camera.quaternion
      );

      // Vertical rotation (pitch) - rotate around camera's local X axis
      const pitchAngle = -deltaY * rotateSpeed;
      const pitchQuat = new THREE.Quaternion();
      const xAxis = new THREE.Vector3(1, 0, 0);
      pitchQuat.setFromAxisAngle(xAxis, pitchAngle);
      this.camera.quaternion.multiplyQuaternions(
        this.camera.quaternion,
        pitchQuat
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

  // Update keyboard movement (free-flight WASD controls)
  updateKeyboardControls(delta) {
    // Get camera direction vectors
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3()
      .crossVectors(forward, this.camera.up)
      .normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const velocity = this.moveSpeed * delta;
    const isSpacePressed = this.keyState["Space"];

    // WASD movement with spacebar modifiers
    if (this.keyState["KeyW"]) {
      if (isSpacePressed) {
        // Space + W = Move UP (vertical)
        this.camera.position.add(up.clone().multiplyScalar(velocity));
      } else {
        // W alone = Move FORWARD
        this.camera.position.add(forward.clone().multiplyScalar(velocity));
      }
    }

    if (this.keyState["KeyS"]) {
      if (isSpacePressed) {
        // Space + S = Move DOWN (vertical)
        this.camera.position.add(up.clone().multiplyScalar(-velocity));
      } else {
        // S alone = Move BACKWARD
        this.camera.position.add(forward.clone().multiplyScalar(-velocity));
      }
    }

    // A/D for strafing left/right (unchanged)
    if (this.keyState["KeyA"]) {
      this.camera.position.add(right.clone().multiplyScalar(-velocity));
    }
    if (this.keyState["KeyD"]) {
      this.camera.position.add(right.clone().multiplyScalar(velocity));
    }

    // Q/E also work for vertical movement
    if (this.keyState["KeyQ"]) {
      this.camera.position.add(up.clone().multiplyScalar(-velocity));
    }
    if (this.keyState["KeyE"]) {
      this.camera.position.add(up.clone().multiplyScalar(velocity));
    }
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

    // Color mapping from B-V color index
    const getColorFromBV = (bv) => {
      // B-V ranges from about -0.4 (blue) to +2.0 (red)
      // Default to white if no color data
      if (bv === undefined || bv === null) return [1.0, 1.0, 1.0];

      if (bv < 0) return [0.6, 0.7, 1.0]; // Blue stars (hot)
      if (bv < 0.3) return [0.8, 0.9, 1.0]; // Blue-white
      if (bv < 0.6) return [1.0, 1.0, 1.0]; // White (like Sun at 0.65)
      if (bv < 1.0) return [1.0, 0.95, 0.7]; // Yellow-white
      if (bv < 1.5) return [1.0, 0.8, 0.5]; // Orange
      return [1.0, 0.6, 0.4]; // Red (cool)
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

      // Get color from B-V index
      const color = getColorFromBV(star.color_bp_rp);

      stars.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        r: color[0],
        g: color[1],
        b: color[2],
        magnitude: star.magnitude || 10.0,
        distance: distance,
        // Store original data for future use
        sourceId: star.source_id,
        ra: star.ra,
        dec: star.dec,
        parallax: star.parallax,
        pmra: star.pm_ra,
        pmdec: star.pm_dec,
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

      // Size based on magnitude (brighter stars = MUCH bigger, faint stars = tiny)
      const mag = galaxy.magnitude || 15.0;
      // Bright stars: mag < 3 (very large)
      // Medium: mag 3-8 (moderate)
      // Faint: mag > 8 (tiny)
      let size;
      if (mag < 2) {
        size = 8.0 + (2 - mag) * 2.0; // Very bright: 8-14
      } else if (mag < 5) {
        size = 4.0 + (5 - mag) * 1.3; // Bright: 4-8
      } else if (mag < 10) {
        size = 1.5 + (10 - mag) * 0.5; // Medium: 1.5-4
      } else {
        size = 0.5 + Math.max(0, (15 - mag) * 0.2); // Faint: 0.5-1.5
      }
      sizes[i] = size;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Create circular star texture
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    // Draw circular gradient
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);

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
          gl_PointSize = size * (300.0 / -mvPosition.z); // Scale with distance
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);
  }

  animate() {
    // Calculate time delta
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update keyboard controls (free-flight movement)
    this.updateKeyboardControls(delta);

    // No longer reload stars on camera movement - we have the full sky loaded!

    // Render
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
}

// Initialize when page loads
window.addEventListener("DOMContentLoaded", () => {
  const viewer = new CosmicWebViewer();

  // Wire up constellation toggle button
  const constellationBtn = document.getElementById("toggleConstellations");
  if (constellationBtn) {
    constellationBtn.addEventListener("click", () =>
      viewer.toggleConstellations()
    );
  }
});
