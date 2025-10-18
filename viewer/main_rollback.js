class CosmicWebViewer {
  constructor() {
    console.log("🌌 Starting Cosmic Web Viewer...");

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

    this.init();
  }

  async init() {
    this.updateStatus("Initializing...");

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();

    await this.loadGalaxyData();
    this.createGalaxyPoints();

    this.updateStatus("Ready! Drag to rotate, scroll to zoom.");
    this.animate();

    console.log("✅ Cosmic Web Viewer ready!");
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000011, 1000, 10000);
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50000);
    this.camera.position.set(500, 400, 500);
    this.camera.lookAt(0, 0, 0);
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

      this.rotationY += deltaX * 0.01;
      this.rotationX += deltaY * 0.01;

      // Limit vertical rotation
      this.rotationX = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.rotationX)
      );

      this.mouseX = e.clientX;
      this.mouseY = e.clientY;

      this.updateCameraPosition();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      // Get current distance from origin
      const currentDistance = this.camera.position.length();

      // Define zoom bounds (min = very close to stars, max = full galaxy overview)
      const minDistance = 1; // Can zoom very close to individual stars
      const maxDistance = 5000; // Can see entire galaxy structure

      // Adaptive zoom speed - slower when close, faster when far
      let zoomSpeed = 0.05 + (currentDistance / maxDistance) * 0.15; // 0.05 to 0.20
      zoomSpeed = Math.min(0.2, Math.max(0.05, zoomSpeed));

      const zoomFactor = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
      const newDistance = currentDistance * zoomFactor;

      // Apply zoom limits with smooth clamping
      if (newDistance >= minDistance && newDistance <= maxDistance) {
        this.camera.position.multiplyScalar(zoomFactor);
      } else if (newDistance < minDistance) {
        // Prevent going too close
        const scale = minDistance / currentDistance;
        this.camera.position.multiplyScalar(scale);
      } else if (newDistance > maxDistance) {
        // Prevent going too far
        const scale = maxDistance / currentDistance;
        this.camera.position.multiplyScalar(scale);
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

  // New method: update keyboard movement
  updateKeyboardControls(delta) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, this.camera.up)
      .normalize();
    const velocity = this.moveSpeed * delta;
    if (this.keyState["KeyW"])
      this.camera.position.add(forward.clone().multiplyScalar(velocity));
    if (this.keyState["KeyS"])
      this.camera.position.add(forward.clone().multiplyScalar(-velocity));
    if (this.keyState["KeyA"])
      this.camera.position.add(right.clone().multiplyScalar(-velocity));
    if (this.keyState["KeyD"])
      this.camera.position.add(right.clone().multiplyScalar(velocity));
  }

  updateCameraPosition() {
    const distance = this.camera.position.length();

    this.camera.position.x =
      distance * Math.sin(this.rotationY) * Math.cos(this.rotationX);
    this.camera.position.y = distance * Math.sin(this.rotationX);
    this.camera.position.z =
      distance * Math.cos(this.rotationY) * Math.cos(this.rotationX);

    this.camera.lookAt(0, 0, 0);
  }

  async loadGalaxyData() {
    try {
      const response = await fetch("/data/milky_way_stars.csv");
      const csvText = await response.text();
      this.galaxyData = this.parseCSV(csvText);
      console.log(`✅ Loaded ${this.galaxyData.length} stars`);
    } catch (error) {
      console.log("Using test data...");
      this.createTestData();
    }
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
    const count = this.galaxyData.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const galaxy = this.galaxyData[i];
      const i3 = i * 3;

      positions[i3] = galaxy.x;
      positions[i3 + 1] = galaxy.y;
      positions[i3 + 2] = galaxy.z;

      colors[i3] = galaxy.r;
      colors[i3 + 1] = galaxy.g;
      colors[i3 + 2] = galaxy.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 4.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);
  }

  animate() {
    // Calculate time delta
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update controls
    this.updateKeyboardControls(delta);
    this.updateCameraPosition();

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
}

// Initialize when page loads
window.addEventListener("DOMContentLoaded", () => {
  new CosmicWebViewer();
});
