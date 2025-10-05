/**
 * Cosmic-Web Visualization
 * Professional Three.js-based galaxy viewer with Jarvis UX
 */

class CosmicWebViewer {
  constructor() {
    // Check if Three.js is available
    if (typeof THREE === "undefined") {
      console.error("❌ THREE is not defined - Three.js did not load properly");
      document.getElementById("status").textContent =
        "ERROR: Three.js not loaded";
      return;
    }

    console.log("✅ Three.js available, version:", THREE.REVISION);

    // Core Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Data and rendering
    this.galaxyData = [];
    this.points = null;
    this.currentLOD = 0;
    this.pointSize = 3.0;
    this.isQualityMode = true;

    // Interaction system
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedGalaxy = null;
    this.isAnimating = false;

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = 0;
    this.fps = 0;

    // Bookmarks
    this.bookmarks = [null, null];

    this.init();
  }

  async init() {
    console.log("🌌 Initializing Cosmic-Web Viewer...");
    console.log(
      "🔇 Note: Browser extension errors are unrelated to our visualization"
    );
    this.updateStatus("Initializing Three.js...");

    // Setup Three.js
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();

    // Load galaxy data
    this.updateStatus("Loading galaxy data...");
    await this.loadGalaxyData();

    // Create visualization
    this.updateStatus("Creating visualization...");
    this.createGalaxyPoints();

    // Setup UI
    this.setupUI();

    // Start render loop
    this.updateStatus(
      `Ready! ${this.galaxyData.length.toLocaleString()} galaxies loaded - Click any galaxy to focus!`
    );
    this.animate();

    console.log("✅ Cosmic-Web Viewer initialized successfully!");
    console.log(`📊 Galaxy data loaded: ${this.galaxyData.length} galaxies`);
    console.log(`🎨 Points object created:`, this.points);
    console.log(
      "🎯 Click-to-focus system ready! Click any galaxy point to fly to it."
    );
  }

  setupScene() {
    this.scene = new THREE.Scene();

    // Add subtle fog for depth
    this.scene.fog = new THREE.Fog(0x000011, 100, 2000);

    // Add background stars
    this.createStarField();
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 3000);
    this.camera.position.set(0, 0, 50); // Start closer for small coordinates
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000011, 1);

    document.body.appendChild(this.renderer.domElement);

    // Handle window resize
    window.addEventListener("resize", () => this.onWindowResize());
  }

  setupControls() {
    // Manual orbit controls
    this.controls = {
      enabled: true,
      rotateSpeed: 0.5,
      zoomSpeed: 1.2,
      panSpeed: 0.3,
      autoRotate: false,
      enableDamping: true,
      dampingFactor: 0.05,
    };

    this.setupMouseControls();
    this.setupKeyboardControls();
  }

  setupMouseControls() {
    let isMouseDown = false;
    let mouseX = 0,
      mouseY = 0;
    let lon = 0,
      lat = 0;
    let phi = 0,
      theta = 0;

    const onMouseDown = (event) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onMouseUp = () => {
      isMouseDown = false;
    };

    const onMouseMove = (event) => {
      if (!isMouseDown) return;

      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;

      lon += deltaX * this.controls.rotateSpeed;
      lat -= deltaY * this.controls.rotateSpeed;

      lat = Math.max(-85, Math.min(85, lat));

      phi = THREE.MathUtils.degToRad(90 - lat);
      theta = THREE.MathUtils.degToRad(lon);

      const radius = this.camera.position.length();

      this.camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
      this.camera.position.y = radius * Math.cos(phi);
      this.camera.position.z = radius * Math.sin(phi) * Math.sin(theta);

      this.camera.lookAt(this.scene.position);

      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onWheel = (event) => {
      event.preventDefault();

      const zoomScale =
        event.deltaY > 0
          ? this.controls.zoomSpeed
          : 1 / this.controls.zoomSpeed;
      const newRadius = Math.max(
        5,
        Math.min(1000, this.camera.position.length() * zoomScale)
      );

      this.camera.position.multiplyScalar(
        newRadius / this.camera.position.length()
      );
    };

    this.renderer.domElement.addEventListener("mousedown", onMouseDown);
    this.renderer.domElement.addEventListener("mouseup", onMouseUp);
    this.renderer.domElement.addEventListener("mousemove", onMouseMove);
    this.renderer.domElement.addEventListener("wheel", onWheel);

    // Add click-to-focus functionality
    this.setupClickDetection();
  }

  setupClickDetection() {
    let mouseDownTime = 0;
    let mouseDownPos = { x: 0, y: 0 };

    this.renderer.domElement.addEventListener("mousedown", (event) => {
      mouseDownTime = Date.now();
      mouseDownPos.x = event.clientX;
      mouseDownPos.y = event.clientY;
    });

    this.renderer.domElement.addEventListener("mouseup", (event) => {
      const clickDuration = Date.now() - mouseDownTime;
      const mouseMoved =
        Math.abs(event.clientX - mouseDownPos.x) +
        Math.abs(event.clientY - mouseDownPos.y);

      // Only trigger click if it was a short click without much movement (not a drag)
      if (clickDuration < 300 && mouseMoved < 10) {
        this.onCanvasClick(event);
      }
    });
  }

  onCanvasClick(event) {
    if (this.isAnimating) return;

    console.log("🖱️ Canvas clicked, detecting galaxies...");

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Use raycaster to find intersected objects
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.points) {
      // Set raycaster parameters for points - make it more sensitive
      this.raycaster.params.Points.threshold = 5; // Increased sensitivity

      const intersects = this.raycaster.intersectObject(this.points);
      console.log(`🎯 Found ${intersects.length} intersections`);

      if (intersects.length > 0) {
        const intersection = intersects[0];
        const galaxyIndex = intersection.index;

        if (galaxyIndex < this.galaxyData.length) {
          const galaxy = this.galaxyData[galaxyIndex];
          console.log(`✨ Focusing on galaxy #${galaxyIndex}`);
          this.focusOnGalaxy(galaxy, galaxyIndex);
        }
      } else {
        // Clicked on empty space, clear selection
        console.log("🌌 Clicked empty space, clearing selection");
        this.clearSelection();
      }
    }
  }

  focusOnGalaxy(galaxy, index) {
    console.log(`🎯 Focusing on galaxy ${index}:`, galaxy);

    this.selectedGalaxy = { ...galaxy, index };
    this.updateGalaxyInfo(galaxy, index);

    // Calculate target position (camera position relative to galaxy)
    const targetPosition = new THREE.Vector3(galaxy.x, galaxy.y, galaxy.z);
    const offset = new THREE.Vector3(15, 10, 15); // Camera offset from galaxy
    const cameraTarget = targetPosition.clone().add(offset);

    // Smooth animation to galaxy
    this.animateCameraTo(cameraTarget, targetPosition);
  }

  animateCameraTo(targetPosition, lookAtTarget) {
    this.isAnimating = true;

    const startPosition = this.camera.position.clone();
    const startLookAt = new THREE.Vector3(0, 0, 0); // Current look-at point

    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use easeInOutCubic for smooth animation
      const easeProgress =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Interpolate camera position
      this.camera.position.lerpVectors(
        startPosition,
        targetPosition,
        easeProgress
      );

      // Interpolate look-at target
      const currentLookAt = startLookAt
        .clone()
        .lerp(lookAtTarget, easeProgress);
      this.camera.lookAt(currentLookAt);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
      }
    };

    animate();
  }

  clearSelection() {
    this.selectedGalaxy = null;
    this.clearGalaxyInfo();
  }

  updateGalaxyInfo(galaxy, index) {
    // Update HUD with galaxy information
    const redshiftElement = document.getElementById("redshift");
    const magnitudeElement = document.getElementById("magnitude");

    if (redshiftElement) {
      redshiftElement.textContent = galaxy.redshift?.toFixed(4) || "N/A";
    }

    if (magnitudeElement) {
      magnitudeElement.textContent = galaxy.magnitude?.toFixed(2) || "N/A";
    }

    // Add galaxy info to status
    this.updateStatus(
      `Selected Galaxy #${index}: ${
        galaxy.type || "unknown"
      } | z=${galaxy.redshift?.toFixed(4)} | mag=${galaxy.magnitude?.toFixed(
        2
      )}`
    );
  }

  clearGalaxyInfo() {
    const redshiftElement = document.getElementById("redshift");
    const magnitudeElement = document.getElementById("magnitude");

    if (redshiftElement) {
      redshiftElement.textContent = "-";
    }

    if (magnitudeElement) {
      magnitudeElement.textContent = "-";
    }

    this.updateStatus(
      `Ready! ${this.galaxyData.length.toLocaleString()} galaxies loaded`
    );
  }

  setupKeyboardControls() {
    window.addEventListener("keydown", (event) => {
      switch (event.code) {
        case "KeyR":
          this.resetCamera();
          break;
        case "Digit1":
          this.loadBookmark(0);
          break;
        case "Digit2":
          this.loadBookmark(1);
          break;
        case "KeyQ":
          this.toggleQuality();
          break;
        case "Escape":
          this.clearSelection();
          this.resetCamera();
          break;
      }
    });
  }

  createStarField() {
    const starCount = 1000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 2000;
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3)
    );

    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      transparent: true,
      opacity: 0.3,
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(stars);
  }

  async loadGalaxyData() {
    try {
      console.log("📂 Loading galaxy data...");

      // Load galaxy data from main data directory
      const response = await fetch("../data/galaxies_final.csv");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const csvText = await response.text();
      console.log("✅ Loaded data from ../data/galaxies_final.csv");

      this.galaxyData = this.parseCSV(csvText);
      console.log(
        "✅ Loaded " + this.galaxyData.length.toLocaleString() + " galaxies"
      );
    } catch (error) {
      console.error("❌ Error loading galaxy data:", error);
      this.createTestData();
    }
  }

  parseCSV(csvText) {
    const lines = csvText.split("\n");
    const galaxies = [];

    console.log(`📄 CSV parsing: ${lines.length} lines found`);

    // Find header line
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#") && lines[i].trim()) {
        headerIndex = i;
        break;
      }
    }

    console.log(
      `📋 Header found at line ${headerIndex}: ${lines[headerIndex]}`
    );

    // Parse data (x,y,z,g_mag,red,green,blue,galaxy_type)
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",");
      if (values.length >= 7) {
        const galaxy = {
          x: parseFloat(values[0]) * 5, // Scale up coordinates for visibility
          y: parseFloat(values[1]) * 5,
          z: parseFloat(values[2]) * 5,
          size: Math.random() * 2 + 1,
          r: Math.max(0, Math.min(1, parseFloat(values[4]))),
          g: Math.max(0, Math.min(1, parseFloat(values[5]))),
          b: Math.max(0, Math.min(1, parseFloat(values[6]))),
          magnitude: parseFloat(values[3]) || 18.0,
          type: values[7] || "unknown",
          redshift: Math.random() * 0.15,
        };

        if (!isNaN(galaxy.x) && !isNaN(galaxy.y) && !isNaN(galaxy.z)) {
          galaxies.push(galaxy);
        }
      }
    }

    console.log(`🌟 Parsed ${galaxies.length} valid galaxies`);
    if (galaxies.length > 0) {
      console.log(`🔍 Sample galaxy:`, galaxies[0]);
    }

    return galaxies;
  }

  createTestData() {
    console.log("🧪 Creating test galaxy data...");
    this.galaxyData = [];

    for (let i = 0; i < 5000; i++) {
      this.galaxyData.push({
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        z: (Math.random() - 0.5) * 200,
        size: 1 + Math.random() * 3,
        r: Math.random(),
        g: Math.random(),
        b: Math.random(),
        redshift: Math.random() * 0.15,
        magnitude: 16 + Math.random() * 6,
        type: "test",
      });
    }

    console.log("✅ Created " + this.galaxyData.length + " test galaxies");
  }

  createGalaxyPoints() {
    if (this.points) {
      this.scene.remove(this.points);
    }

    console.log(`🔧 Creating points for ${this.galaxyData.length} galaxies`);

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

      sizes[i] = galaxy.size;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: false, // Keep consistent size
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    console.log(`✅ Added ${count} points to scene`);
    this.updateGalaxyCount();
  }

  setupUI() {
    // Point size control
    const pointSizeSlider = document.getElementById("pointSize");
    const pointSizeValue = document.getElementById("pointSizeValue");

    if (pointSizeSlider && pointSizeValue) {
      pointSizeSlider.addEventListener("input", (e) => {
        this.pointSize = parseFloat(e.target.value);
        pointSizeValue.textContent = this.pointSize;
        if (this.points) {
          this.points.material.size = this.pointSize;
        }
      });
    }

    // Reset camera
    const resetButton = document.getElementById("resetCamera");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        this.resetCamera();
      });
    }

    // Quality toggle
    const qualityButton = document.getElementById("qualityToggle");
    if (qualityButton) {
      qualityButton.addEventListener("click", () => {
        this.toggleQuality();
      });
    }

    // Bookmarks
    const bookmark1 = document.getElementById("bookmark1");
    const bookmark2 = document.getElementById("bookmark2");

    if (bookmark1) {
      bookmark1.addEventListener("click", (event) => {
        if (event.shiftKey) {
          this.saveBookmark(0);
        } else {
          this.loadBookmark(0);
        }
      });
    }

    if (bookmark2) {
      bookmark2.addEventListener("click", (event) => {
        if (event.shiftKey) {
          this.saveBookmark(1);
        } else {
          this.loadBookmark(1);
        }
      });
    }
  }

  updateStatus(message) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
    console.log("Status:", message);
  }

  updateGalaxyCount() {
    const countElement = document.getElementById("galaxyCount");
    const visibleElement = document.getElementById("visibleCount");

    if (countElement) {
      countElement.textContent = this.galaxyData.length.toLocaleString();
    }

    if (visibleElement) {
      visibleElement.textContent = this.galaxyData.length.toLocaleString();
    }
  }

  resetCamera() {
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, 0);
  }

  toggleQuality() {
    this.isQualityMode = !this.isQualityMode;
    const button = document.getElementById("qualityToggle");

    if (button) {
      if (this.isQualityMode) {
        button.textContent = "🎨 Quality Mode";
        button.classList.remove("performance-mode");
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        if (this.points) {
          this.points.material.opacity = 0.9;
        }
      } else {
        button.textContent = "⚡ Performance Mode";
        button.classList.add("performance-mode");
        this.renderer.setPixelRatio(1);
        if (this.points) {
          this.points.material.opacity = 0.6;
        }
      }
    }
  }

  saveBookmark(index) {
    this.bookmarks[index] = {
      position: this.camera.position.clone(),
      target: new THREE.Vector3(0, 0, 0),
    };
    console.log("📌 Saved bookmark " + (index + 1));
  }

  loadBookmark(index) {
    if (this.bookmarks[index]) {
      this.camera.position.copy(this.bookmarks[index].position);
      this.camera.lookAt(this.bookmarks[index].target);
      console.log("🔖 Loaded bookmark " + (index + 1));
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Calculate FPS
    this.frameCount++;
    const time = performance.now();
    if (time >= this.lastTime + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (time - this.lastTime));
      this.frameCount = 0;
      this.lastTime = time;

      // Update performance display
      const fpsElement = document.getElementById("fps");
      const pointCountElement = document.getElementById("pointCount");

      if (fpsElement) {
        fpsElement.textContent = this.fps;
      }

      if (pointCountElement) {
        pointCountElement.textContent = this.galaxyData.length.toLocaleString();
      }
    }

    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize when page loads
window.addEventListener("DOMContentLoaded", () => {
  new CosmicWebViewer();
});
