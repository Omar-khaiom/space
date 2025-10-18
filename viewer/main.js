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

      // Size based on magnitude (brighter stars = bigger, but limited range)
      const mag = galaxy.magnitude || 15.0;
      // Magnitude range: 6 (bright) to 20 (faint)
      // Invert so brighter = larger: size = 20 - mag
      const normalizedSize = Math.max(0, Math.min(1, (20 - mag) / 14));
      sizes[i] = 2.0 + normalizedSize * 3.0; // Range: 2.0 to 5.0
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

    const material = new THREE.PointsMaterial({
      size: 3.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      map: texture, // Use circular texture
      blending: THREE.AdditiveBlending, // Makes stars glow
      depthWrite: false,
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

    // Don't call updateCameraPosition() here - it's only called during mouse drag
    // This allows WASD to move freely without being overridden

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
