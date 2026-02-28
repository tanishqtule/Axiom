/* ════════════════════════════════════════════════════════
   AXIOM — graph.js
   Three.js 3D Knowledge Graph + Splash Animation
════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════
   SPLASH ANIMATION
════════════════════════════════════════════════════════ */
class SplashAnimation {
  constructor() {
    this.canvas = document.getElementById('splash-canvas');
    if (!this.canvas || typeof THREE === 'undefined') return;

    this.running = true;
    this._setup();
    this._createStars();
    this._createGraph();
    this._animate();
    window.addEventListener('resize', () => this._resize());
  }

  _setup() {
    const w = window.innerWidth, h = window.innerHeight;
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    this.camera.position.set(0, 0, 130);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Fog for depth
    this.scene.fog = new THREE.FogExp2(0x04040f, 0.006);
  }

  _createStars() {
    const count = 800;
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 200 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2] = r * Math.cos(phi);
      sizes[i] = Math.random() * 1.5 + 0.3;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0x8b9cc8,
      size: 0.8,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true
    });

    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _createGraph() {
    this.graphGroup = new THREE.Group();
    this.scene.add(this.graphGroup);

    // Node positions (knowledge constellation)
    const nodeDefs = [
      { pos: [0, 0, 0],       color: 0x7c3aed, size: 5 },   // central
      { pos: [-35, 15, -10],  color: 0x06b6d4, size: 3.5 },
      { pos: [38, 10, 5],     color: 0x2563eb, size: 3.5 },
      { pos: [10, -30, 8],    color: 0x7c3aed, size: 3 },
      { pos: [-20, -20, -5],  color: 0x06b6d4, size: 3 },
      { pos: [25, 30, -15],   color: 0xdb2777, size: 3 },
      { pos: [-50, -5, 15],   color: 0x2563eb, size: 2.5 },
      { pos: [50, -15, -8],   color: 0x7c3aed, size: 2.5 },
      { pos: [0, 45, 10],     color: 0x06b6d4, size: 2.5 },
      { pos: [-15, 10, 40],   color: 0xdb2777, size: 2 },
      { pos: [20, -5, -40],   color: 0x2563eb, size: 2 },
    ];

    this.nodes = nodeDefs.map(def => {
      const group = new THREE.Group();
      group.position.set(...def.pos);

      // Core sphere
      const geo  = new THREE.SphereGeometry(def.size, 20, 20);
      const mat  = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);

      // Outer glow shell
      const gGeo = new THREE.SphereGeometry(def.size * 2.2, 16, 16);
      const gMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide
      });
      group.add(new THREE.Mesh(gGeo, gMat));

      // Pulse ring
      const rGeo = new THREE.RingGeometry(def.size * 1.5, def.size * 1.7, 32);
      const rMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      group.userData.ring = ring;

      group.userData.phase = Math.random() * Math.PI * 2;
      group.userData.color = def.color;
      group.userData.baseSize = def.size;

      this.graphGroup.add(group);
      return group;
    });

    // Connections
    const connections = [[0,1],[0,2],[0,3],[0,4],[1,4],[1,6],[2,7],[2,5],[3,4],[3,7],[5,8],[6,9],[7,10],[8,5],[9,10]];

    connections.forEach(([a, b]) => {
      const posA = new THREE.Vector3(...nodeDefs[a].pos);
      const posB = new THREE.Vector3(...nodeDefs[b].pos);
      const mid  = posA.clone().lerp(posB, 0.5);

      // Create a curved tube-like line with a CatmullRomCurve
      const jitter = new THREE.Vector3(
        (Math.random()-0.5)*20,
        (Math.random()-0.5)*20,
        (Math.random()-0.5)*20
      );
      mid.add(jitter);

      const curve  = new THREE.QuadraticBezierCurve3(posA, mid, posB);
      const points = curve.getPoints(20);
      const geo    = new THREE.BufferGeometry().setFromPoints(points);
      const mat    = new THREE.LineBasicMaterial({
        color: 0x7c3aed,
        transparent: true,
        opacity: 0.2
      });
      this.graphGroup.add(new THREE.Line(geo, mat));
    });

    // Floating particles around the graph
    const pCount = 120;
    const pGeo   = new THREE.BufferGeometry();
    const pPos   = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i*3]   = (Math.random() - 0.5) * 160;
      pPos[i*3+1] = (Math.random() - 0.5) * 160;
      pPos[i*3+2] = (Math.random() - 0.5) * 160;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x7c3aed, size: 0.5, transparent: true, opacity: 0.5 }));
    this.graphGroup.add(this.particles);
  }

  _animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this._animate());

    const t = Date.now() * 0.001;

    // Slow scene rotation
    this.graphGroup.rotation.y = t * 0.06;
    this.graphGroup.rotation.x = Math.sin(t * 0.04) * 0.15;

    // Star slow drift
    if (this.stars) {
      this.stars.rotation.y = t * 0.008;
    }

    // Animate each node
    this.nodes.forEach(node => {
      const ph  = node.userData.phase;
      const s   = 1 + Math.sin(t * 1.5 + ph) * 0.08;
      node.scale.setScalar(s);
      if (node.userData.ring) {
        node.userData.ring.rotation.z = t * 0.5 + ph;
        node.userData.ring.material.opacity = 0.15 + Math.sin(t * 2 + ph) * 0.12;
      }
    });

    // Camera gentle drift
    this.camera.position.x = Math.sin(t * 0.05) * 8;
    this.camera.position.y = Math.cos(t * 0.04) * 4;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.running = false;
    this.renderer?.dispose();
  }
}

/* ════════════════════════════════════════════════════════
   3D KNOWLEDGE GRAPH
════════════════════════════════════════════════════════ */
class Graph3D {
  constructor() {
    this.nodes      = new Map();  // id → { group, data, vel, fixed }
    this.edges      = [];         // { sId, tId, line }
    this.activeId   = null;
    this.filterText = '';

    // Camera orbit state
    this.theta  = 0;
    this.phi    = Math.PI / 2.5;
    this.radius = 160;
    this.target = new THREE.Vector3(0, 0, 0);
    this.isMouseDown = false;
    this.lastMouse   = { x: 0, y: 0 };
    this.isMiniMode  = false;

    this.simulationSteps = 0;
    this.MAX_SIM_STEPS   = 300;
  }

  /* ─── Initialization ─── */
  init() {
    this._setupMain();
    this._setupMini();
    this._bindControls();
    this._loop();
  }

  _setupMain() {
    const canvas = document.getElementById('graph-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    this.mainScene    = new THREE.Scene();
    this.mainScene.background = new THREE.Color(0x04040f);
    this.mainScene.fog = new THREE.FogExp2(0x04040f, 0.004);

    const { clientWidth: w, clientHeight: h } = canvas;
    this.mainCamera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    this._updateCamera(this.mainCamera);

    this.mainRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.mainRenderer.setSize(w || 800, h || 600);
    this.mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this._addSceneLights(this.mainScene);
    this._addGridFloor(this.mainScene);
  }

  _setupMini() {
    const canvas = document.getElementById('mini-graph-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    this.miniScene    = new THREE.Scene();
    this.miniScene.background = new THREE.Color(0x04040f);

    const w = canvas.clientWidth  || 260;
    const h = canvas.clientHeight || 160;
    this.miniCamera   = new THREE.PerspectiveCamera(65, w / h, 0.1, 1000);
    this.miniCamera.position.set(0, 0, 100);
    this.miniCamera.lookAt(0, 0, 0);

    this.miniRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.miniRenderer.setSize(w, h);
    this.miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this._addSceneLights(this.miniScene);
  }

  _addSceneLights(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const l1 = new THREE.PointLight(0x7c3aed, 3, 300);
    l1.position.set(-60, 80, 60);
    scene.add(l1);

    const l2 = new THREE.PointLight(0x06b6d4, 3, 300);
    l2.position.set(80, -40, 60);
    scene.add(l2);

    const l3 = new THREE.PointLight(0x2563eb, 2, 200);
    l3.position.set(0, -80, -60);
    scene.add(l3);
  }

  _addGridFloor(scene) {
    const grid = new THREE.GridHelper(400, 40, 0x1e1e3f, 0x0d0d2a);
    grid.position.y = -60;
    scene.add(grid);
  }

  /* ─── Node / Edge creation ─── */
  _makeNodeGroup(id, title, color) {
    const group = new THREE.Group();
    group.userData = { id, title };

    const size = 4;

    // Core sphere
    const geo = new THREE.SphereGeometry(size, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.8
    });
    const sphere = new THREE.Mesh(geo, mat);
    group.add(sphere);
    group.userData.sphere = sphere;
    group.userData.baseMat = mat;

    // Glow shell
    const gGeo = new THREE.SphereGeometry(size * 2.5, 16, 16);
    const gMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.BackSide, depthWrite: false });
    group.add(new THREE.Mesh(gGeo, gMat));
    group.userData.glowMat = gMat;

    // Label (sprite)
    const sprite = this._makeLabel(title);
    sprite.position.y = size * 2 + 3;
    group.add(sprite);
    group.userData.label = sprite;

    // Random starting position
    group.position.set(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );

    return group;
  }

  _makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._roundRect(ctx, 4, 14, 248, 40, 8);
    ctx.fill();

    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = text.length > 18 ? text.slice(0, 17) + '…' : text;
    ctx.fillText(label, 128, 34);

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(18, 4.5, 1);
    return sprite;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _makeEdgeLine(posA, posB, color = 0x7c3aed) {
    const points = [posA.clone(), posB.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
    return new THREE.Line(geo, mat);
  }

  /* ─── Build graph from notes ─── */
  refreshFromNotes() {
    const nm = window.axiomApp?.noteManager;
    if (!nm || !this.mainScene) return;

    // Clear existing nodes/edges
    this._clearGraph();

    const notes = nm.getAll();
    const activeId = nm.activeId;

    const colors = {
      active:  0x7c3aed,
      linked:  0x06b6d4,
      default: 0x334155
    };

    // Build link map
    const linkMap = new Map(); // noteId → Set of linked noteIds
    notes.forEach(note => {
      const links = nm.extractWikiLinks(note.content);
      links.forEach(title => {
        const target = notes.find(n => n.title === title);
        if (target) {
          if (!linkMap.has(note.id)) linkMap.set(note.id, new Set());
          linkMap.get(note.id).add(target.id);
        }
      });
    });

    // Determine color for each node
    const linkedToActive = new Set();
    if (activeId) {
      (linkMap.get(activeId) || new Set()).forEach(id => linkedToActive.add(id));
      // backlinks
      notes.forEach(n => {
        if ((linkMap.get(n.id) || new Set()).has(activeId)) linkedToActive.add(n.id);
      });
    }

    // Add nodes
    notes.forEach(note => {
      let color = colors.default;
      if (note.id === activeId) color = colors.active;
      else if (linkedToActive.has(note.id)) color = colors.linked;

      const group = this._makeNodeGroup(note.id, note.title, color);
      group.userData.noteId = note.id;
      group.userData.color  = color;

      this.mainScene.add(group);
      if (this.miniScene) this.miniScene.add(group.clone());
      this.nodes.set(note.id, {
        group,
        vel: new THREE.Vector3(),
        data: note,
        color
      });
    });

    // Add edges
    notes.forEach(note => {
      const linked = linkMap.get(note.id) || new Set();
      linked.forEach(targetId => {
        if (!this.nodes.has(targetId)) return;
        const nA = this.nodes.get(note.id);
        const nB = this.nodes.get(targetId);
        const line = this._makeEdgeLine(nA.group.position, nB.group.position, 0x7c3aed);
        this.mainScene.add(line);
        this.edges.push({ sId: note.id, tId: targetId, line });
      });
    });

    // Reset simulation
    this.simulationSteps = 0;
    this.activeId = activeId;
  }

  _clearGraph() {
    this.nodes.forEach(n => {
      this.mainScene.remove(n.group);
      this.miniScene?.remove(n.group);
    });
    this.edges.forEach(e => this.mainScene.remove(e.line));
    this.nodes.clear();
    this.edges = [];
  }

  setActiveNode(id) {
    this.activeId = id;
    this.refreshFromNotes();
  }

  /* ─── Force simulation ─── */
  _simulate() {
    if (this.simulationSteps > this.MAX_SIM_STEPS) return;
    this.simulationSteps++;

    const nodeArr = Array.from(this.nodes.values());
    const REPEL   = 1200;
    const LINK_DIST = 45;
    const DAMP    = 0.82;
    const CENTER  = 0.003;

    // Repulsion
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const nA = nodeArr[i], nB = nodeArr[j];
        const diff = new THREE.Vector3().subVectors(nA.group.position, nB.group.position);
        const dist = Math.max(diff.length(), 1);
        const force = REPEL / (dist * dist);
        const dir   = diff.normalize();
        nA.vel.addScaledVector(dir,  force);
        nB.vel.addScaledVector(dir, -force);
      }
    }

    // Attraction (spring)
    this.edges.forEach(edge => {
      const nA = this.nodes.get(edge.sId);
      const nB = this.nodes.get(edge.tId);
      if (!nA || !nB) return;
      const diff  = new THREE.Vector3().subVectors(nB.group.position, nA.group.position);
      const dist  = diff.length();
      const force = (dist - LINK_DIST) * 0.04;
      const dir   = diff.clone().normalize();
      nA.vel.addScaledVector(dir,  force);
      nB.vel.addScaledVector(dir, -force);
    });

    // Center gravity
    nodeArr.forEach(n => {
      n.vel.addScaledVector(n.group.position, -CENTER);
      n.vel.multiplyScalar(DAMP);
      n.group.position.add(n.vel);
    });

    // Update edge geometry
    this.edges.forEach(edge => {
      const nA = this.nodes.get(edge.sId);
      const nB = this.nodes.get(edge.tId);
      if (!nA || !nB) return;
      const pos = edge.line.geometry.attributes.position;
      pos.setXYZ(0, nA.group.position.x, nA.group.position.y, nA.group.position.z);
      pos.setXYZ(1, nB.group.position.x, nB.group.position.y, nB.group.position.z);
      pos.needsUpdate = true;
    });
  }

  /* ─── Render loop ─── */
  _loop() {
    requestAnimationFrame(() => this._loop());
    const t = Date.now() * 0.001;

    // Run physics
    this._simulate();

    // Animate nodes
    this.nodes.forEach((n, id) => {
      const phase = (id.charCodeAt(0) || 0) * 0.3;
      const s = 1 + Math.sin(t * 1.8 + phase) * 0.04;
      n.group.scale.setScalar(s);

      // Active node bigger pulse
      if (id === this.activeId) {
        const ss = 1 + Math.sin(t * 3) * 0.12;
        n.group.scale.setScalar(ss);
        n.group.userData.glowMat && (n.group.userData.glowMat.opacity = 0.1 + Math.sin(t * 2) * 0.05);
      }
    });

    // Render main
    if (this.mainRenderer && this.mainScene && this.mainCamera) {
      this.mainRenderer.render(this.mainScene, this.mainCamera);
    }

    // Mini
    if (this.miniRenderer && this.miniScene && this.miniCamera) {
      // Slowly rotate mini scene
      if (this.miniScene) this.miniScene.rotation.y = t * 0.1;
      this.miniRenderer.render(this.miniScene, this.miniCamera);
    }
  }

  /* ─── Camera ─── */
  _updateCamera(cam) {
    cam.position.x = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    cam.position.y = this.radius * Math.cos(this.phi);
    cam.position.z = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    cam.lookAt(this.target);
  }

  _bindControls() {
    const canvas = document.getElementById('graph-canvas');
    if (!canvas) return;

    const onDown = e => {
      this.isMouseDown = true;
      this.lastMouse   = { x: e.clientX, y: e.clientY };
    };
    const onUp   = () => { this.isMouseDown = false; };
    const onMove = e => {
      if (!this.isMouseDown) {
        this._handleHover(e);
        return;
      }
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.theta -= dx * 0.008;
      this.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi - dy * 0.008));
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this._updateCamera(this.mainCamera);
    };
    const onWheel = e => {
      e.preventDefault();
      this.radius = Math.max(30, Math.min(500, this.radius + e.deltaY * 0.3));
      this._updateCamera(this.mainCamera);
    };
    const onClick = e => this._handleClick(e, canvas);

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    // Touch support
    let lastTouch = null;
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - lastTouch.x;
      const dy = t.clientY - lastTouch.y;
      this.theta -= dx * 0.008;
      this.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi - dy * 0.008));
      lastTouch = { x: t.clientX, y: t.clientY };
      this._updateCamera(this.mainCamera);
    }, { passive: false });

    // Resize
    window.addEventListener('resize', () => this._onResize(canvas));
  }

  _handleHover(e) {
    const canvas  = document.getElementById('graph-canvas');
    if (!canvas || !this.mainCamera || !this.mainScene) return;
    const tooltip = document.getElementById('graph-node-tooltip');
    if (!tooltip) return;

    const rect   = canvas.getBoundingClientRect();
    const mouse  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.mainCamera);

    const meshes = [];
    this.nodes.forEach(n => {
      const sp = n.group.userData.sphere;
      if (sp) meshes.push(sp);
    });

    const hits = ray.intersectObjects(meshes);
    if (hits.length) {
      const hit   = hits[0].object;
      let nodeData = null;
      this.nodes.forEach(n => {
        if (n.group.userData.sphere === hit) nodeData = n.data;
      });
      if (nodeData) {
        tooltip.classList.remove('hidden');
        tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
        tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px';
        tooltip.innerHTML  = `<strong>${nodeData.title}</strong><br>
          <small style="color:var(--text3)">${nodeData.tags.map(t=>'#'+t).join(' ') || 'No tags'}</small>`;
        canvas.style.cursor = 'pointer';
        return;
      }
    }
    tooltip.classList.add('hidden');
    canvas.style.cursor = 'default';
  }

  _handleClick(e, canvas) {
    const rect  = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.mainCamera);

    const meshes = [];
    this.nodes.forEach(n => {
      const sp = n.group.userData.sphere;
      if (sp) { sp._nodeId = n.data.id; meshes.push(sp); }
    });

    const hits = ray.intersectObjects(meshes);
    if (hits.length) {
      const nodeId = hits[0].object._nodeId;
      if (nodeId && window.axiomApp) {
        window.axiomApp.openNote(nodeId);
        // Close full screen graph
        window.axiomApp.closeGraph();
      }
    }
  }

  _onResize(canvas) {
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (this.mainCamera) {
      this.mainCamera.aspect = w / h;
      this.mainCamera.updateProjectionMatrix();
    }
    this.mainRenderer?.setSize(w, h);
  }

  /* ─── Public API ─── */
  openFullScreen() {
    this.refreshFromNotes();
    requestAnimationFrame(() => {
      const canvas = document.getElementById('graph-canvas');
      if (canvas) this._onResize(canvas);
    });
  }

  closeFullScreen() {
    document.getElementById('graph-node-tooltip')?.classList.add('hidden');
  }

  zoom(factor) {
    this.radius = Math.max(30, Math.min(500, this.radius * (1 / factor)));
    this._updateCamera(this.mainCamera);
  }

  resetCamera() {
    this.theta  = 0;
    this.phi    = Math.PI / 2.5;
    this.radius = 160;
    this.target.set(0, 0, 0);
    this._updateCamera(this.mainCamera);
  }

  filter(query) {
    this.filterText = query.toLowerCase();
    this.nodes.forEach((n, id) => {
      const visible = !this.filterText || n.data.title.toLowerCase().includes(this.filterText);
      n.group.visible = visible;
    });
  }
}

/* ════════════════════════════════════════════════════════
   GUIDE BACKGROUND ANIMATION
════════════════════════════════════════════════════════ */
class GuideAnimation {
  constructor() {
    this.canvas   = document.getElementById('guide-canvas');
    this.running  = false;
    this.chapter  = 0;
    this.time     = 0;

    // Chapter accent colours
    this.chapterColors = [
      [0x7c3aed, 0x06b6d4],  // 0 Welcome
      [0x2563eb, 0x7c3aed],  // 1 Notes
      [0x06b6d4, 0x2563eb],  // 2 Links
      [0x7c3aed, 0x2563eb],  // 3 Graph
      [0xdb2777, 0x7c3aed],  // 4 Tags
      [0x059669, 0x06b6d4],  // 5 Canvas
      [0x2563eb, 0x7c3aed],  // 6 Shortcuts
    ];

    if (typeof THREE === 'undefined' || !this.canvas) return;
    this._setup();
    this._buildScene();
  }

  _setup() {
    const w = window.innerWidth, h = window.innerHeight;
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 2000);
    this.camera.position.set(0, 0, 200);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  _buildScene() {
    // Large nebula particle cloud
    const count = 1200;
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Sphere distribution
      const r = 100 + Math.random() * 300;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i*3]   = r * Math.sin(p) * Math.cos(t);
      pos[i*3+1] = r * Math.sin(p) * Math.sin(t);
      pos[i*3+2] = r * Math.cos(p);

      // Purple-cyan gradient colour
      const mix = Math.random();
      col[i*3]   = 0.48 * (1 - mix) + 0.02 * mix;  // R
      col[i*3+1] = 0.23 * (1 - mix) + 0.71 * mix;  // G
      col[i*3+2] = 0.93 * (1 - mix) + 0.83 * mix;  // B
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.2,
      transparent: true,
      opacity: 0.45,
      vertexColors: true,
      sizeAttenuation: true
    }));
    this.scene.add(this.particles);

    // A few larger glowing orbs
    const orbColors = [0x7c3aed, 0x06b6d4, 0x2563eb, 0xdb2777];
    this.orbs = orbColors.map((c, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(4 + i, 16, 16),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7 })
      );
      mesh.position.set(
        Math.cos(i * Math.PI / 2) * 60,
        Math.sin(i * 1.3) * 40,
        Math.sin(i * Math.PI / 2) * 60
      );
      this.scene.add(mesh);
      return mesh;
    });
  }

  onChapter(idx) {
    this.chapter = idx;
    // Tint particles toward chapter colour
    const [c1] = this.chapterColors[idx] || [0x7c3aed, 0x06b6d4];
    if (this.particles) {
      const r = ((c1 >> 16) & 0xff) / 255;
      const g = ((c1 >>  8) & 0xff) / 255;
      const b = (c1        & 0xff) / 255;
      this.particles.material.color.setRGB(r, g, b);
    }
  }

  start() {
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    this.time += 0.005;

    // Slow rotation
    if (this.particles) {
      this.particles.rotation.y = this.time * 0.04;
      this.particles.rotation.x = Math.sin(this.time * 0.02) * 0.1;
    }

    // Orbs drift
    this.orbs?.forEach((orb, i) => {
      orb.position.x = Math.cos(this.time * 0.3 + i * Math.PI / 2) * 60;
      orb.position.y = Math.sin(this.time * 0.2 + i * 1.3) * 40;
      orb.position.z = Math.sin(this.time * 0.3 + i * Math.PI / 2) * 60;
      orb.material.opacity = 0.4 + Math.sin(this.time * 1.5 + i) * 0.25;
    });

    // Camera slow drift
    this.camera.position.x = Math.sin(this.time * 0.05) * 15;
    this.camera.position.y = Math.cos(this.time * 0.04) * 8;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }
}

/* ─── Typewriter for Ch1 note demo ─── */
function initGuideTypewriter() {
  const el = document.querySelector('.gvnd-typed');
  if (!el) return;
  const phrases = [
    'Connecting ideas creates...',
    'Every note is a neuron in...',
    'The best ideas emerge from...',
    'Knowledge grows when linked...',
  ];
  let pi = 0, ci = 0, deleting = false;

  const tick = () => {
    const phrase = phrases[pi];
    if (!deleting) {
      el.textContent = phrase.slice(0, ci + 1);
      ci++;
      if (ci === phrase.length) { deleting = true; setTimeout(tick, 1800); return; }
    } else {
      el.textContent = phrase.slice(0, ci - 1);
      ci--;
      if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; }
    }
    setTimeout(tick, deleting ? 40 : 70);
  };
  tick();
}

/* ════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE === 'undefined') {
    console.warn('Three.js not loaded — 3D features disabled');
    return;
  }

  // Start splash animation immediately
  window.splashAnim = new SplashAnimation();

  // Guide animation (lazy — only starts when guide opens)
  window.guideAnim = new GuideAnimation();

  // Graph manager (initialized after splash)
  window.graphManager = new Graph3D();

  // Proxy init to dispose splash and seed graph
  const originalInit = window.graphManager.init.bind(window.graphManager);
  window.graphManager.init = function () {
    originalInit();
    setTimeout(() => {
      window.splashAnim?.dispose();
      window.graphManager.refreshFromNotes();
    }, 900);
  };

  // Handle window resize
  window.addEventListener('resize', () => {
    const canvas = document.getElementById('graph-canvas');
    if (canvas) window.graphManager?._onResize(canvas);

    const miniCanvas = document.getElementById('mini-graph-canvas');
    if (miniCanvas && window.graphManager?.miniRenderer) {
      const w = miniCanvas.clientWidth || 260;
      const h = miniCanvas.clientHeight || 160;
      if (window.graphManager.miniCamera) {
        window.graphManager.miniCamera.aspect = w / h;
        window.graphManager.miniCamera.updateProjectionMatrix();
      }
      window.graphManager.miniRenderer.setSize(w, h);
    }

    window.splashAnim?._resize();
  });

  // Start typewriter when guide opens (observed by MutationObserver)
  const obs = new MutationObserver(() => {
    const modal = document.getElementById('guide-modal');
    if (modal && !modal.classList.contains('hidden')) {
      setTimeout(initGuideTypewriter, 400);
      obs.disconnect();
    }
  });
  const gm = document.getElementById('guide-modal');
  if (gm) obs.observe(gm, { attributes: true, attributeFilter: ['class'] });
});
