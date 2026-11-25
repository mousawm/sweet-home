// Sweet Home — the Three.js scene: the house in 3D (walls, rooms, furniture, lights, doors, labels, camera)
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toColor, lineOf, inPoly, polyArea } from './model.js';
import { t as tr } from './i18n.js';
import { Builder } from './build.js';
import { MODEL, E, ROOMS, ROOM, WALLS, DOORS, FURN, BADGES, CX, CZ, PLAN_W, PLAN_D, WALL_H, SPAN, tc, esc, ic, clamp, BAD, tempRGB, rgb, COARSE, plugCharger, plugIcon, domIcon, furnName, furnIcon, acMode, acIcon } from './core.js';

export class HouseScene {
  constructor(THREE, card) {
    this.T = THREE; this.card = card;
    const T = THREE;
    this.vp = card.$('viewport'); this.cv = card.$('cv'); this.lblLayer = card.$('labels');
    const r = this.renderer = new T.WebGLRenderer({ canvas: this.cv, antialias: true, alpha: true, powerPreference: 'high-performance', stencil: true }); // stencil: stairwells
    // battery: 1.5× resolution on touch devices (phones / tablets), 2× on a PC
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    // battery: the sun and the furniture never move, so shadows are drawn once and only redrawn while a door moves
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new T.Scene();
    this.cam = new T.PerspectiveCamera(38, 1, 0.1, 200);
    this.mode = 'lights'; this.sel = null; this.hover = null;
    this.rooms = {}; this.pick = []; this.doors = []; this.acs = []; this.stairDots = [];
    this.lv = {}; this.level = card._level ?? 0; this._cl = 0; // one group per floor; only the shown floor is visible
    // `house.style: dollhouse`: a sunny lot of grass around the house, wallpaper in every room, siding outside, and the
    // walls on the side you look from cut down so you see into the rooms (a life-sim / dollhouse view)
    this.doll = MODEL.style === 'dollhouse'; this.cuts = []; this.vp.classList.toggle('doll', this.doll);
    // default camera: angled 3D view on a PC (mouse), top-down floor plan on phones / tablets (touch)
    this.vmode = card._defView ? card._defView() : 'top'; // Look → default view (per device type, or this device's own)
    this.orbit = { theta: 0, phi: 0.08, radius: 27, target: new T.Vector3(0, 0, 0) };
    this.goal = { theta: 0, phi: 0.08, radius: 27, target: new T.Vector3(0, 0, 0) };
    this.spin = false; this.lastInput = performance.now();
    this.running = true;
    this.ready = this._build();
  }
  // Builds the house in small steps with a pause between them, and compiles the GPU shaders in the background,
  // so the page (tabs, buttons) keeps reacting to taps while "Building your home…" is shown.
  async _build() {
    const T = this.T;
    const breathe = () => new Promise(res => setTimeout(res, 0));
    const steps = MODEL.gltf ? ['_lights', '_ground', '_buildRooms', '_buildGltf', '_buildDoors', '_buildACs', '_labels', '_input'] : ['_lights', '_ground', '_buildRooms', '_buildWalls', '_buildRoofs', '_buildFurniture', '_buildDoors', '_buildACs', '_labels', '_input'];
    for (const step of steps) { await this[step](); await breathe(); }
    this._stack();
    this.ro = new ResizeObserver(() => this._resize()); this.ro.observe(this.vp);
    this._resize();
    try { await this.renderer.compileAsync(this.scene, this.cam); } catch (e) { /* compiled on the first frame instead */ }
    await breathe();
    this.clock = new T.Clock();
    this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this._wake?.(); }, { threshold: 0 }); this.io.observe(this.vp);
    this.visible = true;
    this._visW = () => { if (!document.hidden) this._wake?.(); }; document.addEventListener('visibilitychange', this._visW);
    // battery: full frame rate only while the camera / lights / doors are changing or the user is touching the view;
    // ~30 fps for small looping effects (AC airflow, motion rings, pulses); 2 fps when nothing at all moves
    // CPU: the loop no longer asks for a frame 60× a second just to skip most of them — between frames it
    // sleeps on a timer (66 ms for looping effects on phones, 500 ms when idle) and stops completely while the view is
    // off screen, on another tab or the app is in the background. Anything that needs a redraw wakes it: `_dirty = true`,
    // touch input (`lastInput`), coming back into view / to the foreground, resume().
    let acc = 0, timer = null;
    const animDt = matchMedia('(pointer: coarse)').matches ? 1 / 15 : 1 / 30; // looping effects: 15 fps on phones / tablets
    const isActive = () => this._dirty || this._busy || this.spin || performance.now() - this.lastInput < 1500;
    const schedule = ms => {
      if (this.raf) return;
      // PC: back to a frame request every display frame (it skips frames as before) — timer sleeps only on phones
      if (ms <= 4 || !COARSE) { if (timer) { clearTimeout(timer); timer = null; } this.raf = requestAnimationFrame(loop); return; }
      if (!timer) timer = setTimeout(() => { timer = null; if (!this.raf) this.raf = requestAnimationFrame(loop); }, ms);
    };
    this._wake = () => { if (this.running) schedule(0); };
    const loop = () => {
      this.raf = null;
      const dt = this.clock.getDelta();
      if (!this.running || !this.visible || document.hidden) { this.__dirty = true; return; } // asleep until woken
      acc += dt;
      const need = isActive() ? 0 : this._anim ? animDt : 0.5;
      if (acc >= need - (need ? 0.012 : 0)) { this.__dirty = false; this._frame(Math.min(acc, 0.1)); acc = 0; } // up to 12 ms early is fine
      schedule(isActive() ? 0 : Math.max(0, ((this._anim ? animDt : 0.5) - acc) * 1000 - 17)); // wake one display frame early: the rAF after the timer adds ~16 ms
    };
    this.__dirty = true; this._wake();
  }
  get _dirty() { return this.__dirty; }
  set _dirty(v) { this.__dirty = v; if (v) this._wake?.(); }
  get lastInput() { return this.__lastInput || 0; }
  set lastInput(v) { this.__lastInput = v; this._wake?.(); }
  // Build mode (src/build.js): the grid and the build tools on, or off
  setBuild(on) {
    if (!on) { this.builder?.dispose(); this.builder = null; return; }
    if (!this.builder && this.lbls) { this.builder = new Builder(this); this._dirty = true; }
  }
  pause() { this.running = false; }
  resume() { this.running = true; this._wake?.(); }

  w(x, z) { return [x - CX, z - CZ]; }
  // the group of the floor that is being built (`_cl`)
  _at() {
    const l = this._cl ?? 0; let g = this.lv[l];
    if (!g) { g = this.lv[l] = new this.T.Group(); g.userData.level = l; g.visible = l === this.level; this.scene.add(g); }
    return g;
  }
  setLevel(l) {
    this.level = l; this._stack();
    this.hover = null; this.hoverF = null; this.renderer.shadowMap.needsUpdate = true; this._dirty = true;
  }
  // The floors as they stand. The floor shown is always at height 0 (the camera, taps and Build mode work there).
  // Dollhouse style, like a life-sim game: an upper floor stands a storey above the ground, on the floors below it
  // (shown with their walls up to its floor), and the ground (lawn, street, building) is that far down. Classic style
  // and the floors under the ground (a basement): only the floor shown.
  get storey() { return Math.max(WALL_H, 2.4) + 0.3; } // a floor's height, its floor slab included
  _stack() {
    const l = this.level, ids = Object.keys(this.lv).map(Number), g0 = ids.includes(0) || !ids.length ? 0 : Math.min(...ids);
    const stack = this.doll && l > g0, SH = this.storey;
    for (const k of ids) {
      const G = this.lv[k], below = stack && k < l && k >= g0;
      G.visible = k === l || below; G.position.y = below ? -(l - k) * SH : 0;
      if (this.roofs?.[k]) this.roofs[k].visible = below; // a floor below has its roof on
    }
    this.renderer.shadowMap.needsUpdate = true;
    if (this.groundG) this.groundG.position.y = stack ? -(l - g0) * SH : 0;
    this._dirty = true;
  }
  // a hit counts only when everything above it is shown (the other floors are hidden, not removed)
  _shown(o) { for (let n = o; n; n = n.parent) if (!n.visible || (n.userData?.level != null && n.userData.level !== this.level)) return false; return true; }

  _lights() {
    const T = this.T;
    this.hemi = this.doll ? new T.HemisphereLight(0xdcefff, 0x6f8f4a, 1.2) : new T.HemisphereLight(0xbfd4ff, 0x1a1f2e, 0.9); this.scene.add(this.hemi);
    const d = this.sun = new T.DirectionalLight(0xffffff, 2.2);
    const S = SPAN * 0.72 + 3; // sun and its shadow box follow the size of the house
    d.position.set(-S, S * 1.55, -S * 0.7); d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048); d.shadow.camera.left = -S; d.shadow.camera.right = S; d.shadow.camera.top = S; d.shadow.camera.bottom = -S;
    d.shadow.camera.near = 1; d.shadow.camera.far = S * 5; d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.shadow.radius = 4;
    this.scene.add(d);
  }

  _tex(kind) {
    const T = this.T; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (kind === 'marble') {
      g.fillStyle = '#e8dfcf'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(160,140,115,${rnd(.05, .14)})`; g.lineWidth = rnd(.5, 2); g.beginPath(); g.moveTo(rnd(0, 256), rnd(0, 256)); g.bezierCurveTo(rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256)); g.stroke(); }
      g.strokeStyle = 'rgba(120,100,80,.18)'; g.lineWidth = 1.5;
      for (let i = 0; i <= 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    } else if (kind === 'carpet') {
      g.fillStyle = '#9097a1'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { const v = rnd(110, 175) | 0; g.fillStyle = `rgba(${v},${v + 4},${v + 10},.35)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.5, 1.5); }
    } else if (kind === 'wood') {
      g.fillStyle = '#b08a62'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) { g.fillStyle = `rgba(${rnd(90, 130) | 0},${rnd(60, 90) | 0},${rnd(30, 50) | 0},.25)`; g.fillRect(0, y, 256, 31); g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(0, y + 31, 256, 1); g.fillRect(rnd(0, 256), y, 1, 31); }
      for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(80,55,30,${rnd(.04, .1)})`; g.beginPath(); const yy = rnd(0, 256); g.moveTo(0, yy); g.lineTo(256, yy + rnd(-3, 3)); g.stroke(); }
    } else if (kind === 'grass') {
      g.fillStyle = '#4d7c3a'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${rnd(40, 110) | 0},${rnd(110, 170) | 0},${rnd(30, 70) | 0},.45)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.2, rnd(2, 5)); }
    } else if (kind === 'asphalt') {
      g.fillStyle = '#3a3f47'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { const v = rnd(40, 95) | 0; g.fillStyle = `rgba(${v},${v + 2},${v + 6},.5)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.4, 1.4); }
    } else if (kind === 'tile') {
      g.fillStyle = '#eef2f6'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(100,116,139,.25)'; g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    } else {
      g.fillStyle = '#b8b1a5'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) { const v = rnd(150, 200) | 0; g.fillStyle = `rgba(${v},${v - 5},${v - 12},.4)`; g.fillRect(rnd(0, 256), rnd(0, 256), 2, 2); }
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  _ground() {
    // everything on the ground goes in one group: with stacked floors it moves down under the floor shown
    const n0 = this.scene.children.length;
    if (MODEL.setting === 'apartment') this._groundApt();
    else if (this.doll) this._groundDoll();
    else this._groundClassic();
    const G = this.groundG = new this.T.Group();
    for (const o of this.scene.children.slice(n0)) G.add(o);
    this.scene.add(G);
  }
  // the classic ground: a night-blue grid fading out, the base slab, a shadow catcher; `y`: how far below the floor
  // (an apartment's street), `slab`: with the house's base slab
  _groundClassic(y = 0, slab = true) {
    const T = this.T;
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 256, 30, 256, 256, 256);
    grd.addColorStop(0, 'rgba(60,90,150,0.55)'); grd.addColorStop(0.6, 'rgba(30,45,90,0.25)'); grd.addColorStop(1, 'rgba(10,15,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(140,170,255,0.08)'; g.lineWidth = 1;
    for (let i = 0; i <= 512; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const mask = g.createRadialGradient(256, 256, 120, 256, 256, 256); mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask; g.fillRect(0, 0, 512, 512);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(Math.max(64, SPAN * 4), Math.max(64, SPAN * 4)), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = -0.25 + y; m.renderOrder = -3; this.scene.add(m);
    // base slab: drawn first and without depth, so a stairwell going down below the floor shows through it
    if (slab) {
      const sl = new T.Mesh(new T.BoxGeometry(PLAN_W + 0.6, 0.5, PLAN_D + 0.6), new T.MeshStandardMaterial({ color: 0x1b2337, roughness: 0.9, depthWrite: false }));
      sl.position.set(PLAN_W / 2 - CX, -0.27, PLAN_D / 2 - CZ); sl.receiveShadow = true; sl.renderOrder = -2; this.scene.add(sl);
    }
    // shadow catcher
    const sc = new T.Mesh(new T.PlaneGeometry(PLAN_W + 24, PLAN_D + 24), new T.ShadowMaterial({ opacity: 0.35 }));
    sc.material.depthWrite = false; sc.renderOrder = -1;
    sc.rotation.x = -Math.PI / 2; sc.position.y = -0.02 + y; sc.receiveShadow = true; this.scene.add(sc);
  }

  // dollhouse ground: a wide lawn that fades out at the edges, the lot (a lighter lawn with a faint 1 m build grid)
  // framed by a pavement, the house on a stone foundation, and round shrubs at the lot's corners
  _groundDoll() {
    const T = this.T, G = Math.max(90, SPAN * 7), M = 3; // M: lot margin around the house (m)
    const lc = document.createElement('canvas'); lc.width = lc.height = 256; const lg = lc.getContext('2d');
    lg.fillStyle = '#6e9b48'; lg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) { lg.fillStyle = `rgba(${70 + Math.random() * 60 | 0},${120 + Math.random() * 50 | 0},${40 + Math.random() * 30 | 0},.45)`; lg.fillRect(Math.random() * 256, Math.random() * 256, 1.2, 2 + Math.random() * 3); }
    const lawn = new T.CanvasTexture(lc); lawn.wrapS = lawn.wrapT = T.RepeatWrapping; lawn.colorSpace = T.SRGBColorSpace; lawn.anisotropy = 4; lawn.repeat.set(G / 3, G / 3);
    const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fg = fc.getContext('2d');
    const fade = fg.createRadialGradient(128, 128, 40, 128, 128, 128); fade.addColorStop(0, '#fff'); fade.addColorStop(0.75, '#fff'); fade.addColorStop(1, '#000');
    fg.fillStyle = fade; fg.fillRect(0, 0, 256, 256);
    // (its faded edge makes it transparent, so it is drawn after the house: it skips the stairwells' openings, marked in
    // the stencil, or it would cover the stairs going down)
    const grass = new T.Mesh(new T.PlaneGeometry(G, G), new T.MeshStandardMaterial({ map: lawn, alphaMap: new T.CanvasTexture(fc), transparent: true, depthWrite: false, roughness: 1,
      stencilWrite: true, stencilRef: 1, stencilFunc: T.NotEqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(PLAN_W / 2 - CX, -0.27, PLAN_D / 2 - CZ); grass.receiveShadow = true; grass.renderOrder = -4; this.scene.add(grass);
    // the lot: brighter grass, a faint grid every metre
    const LW = PLAN_W + 2 * M, LD = PLAN_D + 2 * M, px = 32;
    const c = document.createElement('canvas'); c.width = Math.min(2048, Math.ceil(LW * px)); c.height = Math.min(2048, Math.ceil(LD * px)); const g = c.getContext('2d');
    const sx = c.width / LW, sz = c.height / LD;
    g.fillStyle = '#8cbf5c'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < c.width * c.height / 18; i++) { g.fillStyle = `rgba(${100 + Math.random() * 60 | 0},${160 + Math.random() * 50 | 0},${60 + Math.random() * 40 | 0},.4)`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.2, 2 + Math.random() * 3); }
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
    for (let x = 0; x <= LW; x++) { g.beginPath(); g.moveTo(x * sx, 0); g.lineTo(x * sx, c.height); g.stroke(); }
    for (let z = 0; z <= LD; z++) { g.beginPath(); g.moveTo(0, z * sz); g.lineTo(c.width, z * sz); g.stroke(); }
    const lt = new T.CanvasTexture(c); lt.colorSpace = T.SRGBColorSpace; lt.anisotropy = 4;
    const lot = new T.Mesh(new T.PlaneGeometry(LW, LD), new T.MeshStandardMaterial({ map: lt, roughness: 1, depthWrite: false }));
    lot.rotation.x = -Math.PI / 2; lot.position.set(PLAN_W / 2 - CX, -0.26, PLAN_D / 2 - CZ); lot.receiveShadow = true; lot.renderOrder = -3; this.scene.add(lot);
    // the pavement around the lot
    const pave = new T.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9 }), kerb = new T.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.9 });
    const cx0 = PLAN_W / 2 - CX, cz0 = PLAN_D / 2 - CZ, P = 0.9;
    for (const [w, d, x, z] of [[LW + 2 * P, P, 0, -(LD + P) / 2], [LW + 2 * P, P, 0, (LD + P) / 2], [P, LD, -(LW + P) / 2, 0], [P, LD, (LW + P) / 2, 0]]) {
      const m = new T.Mesh(new T.BoxGeometry(w, 0.06, d), pave); m.position.set(cx0 + x, -0.24, cz0 + z); m.receiveShadow = true; this.scene.add(m);
      const k = new T.Mesh(new T.BoxGeometry(w > d ? w : 0.08, 0.09, w > d ? 0.08 : d), kerb);
      k.position.set(cx0 + x + (w > d ? 0 : Math.sign(x) * (P / 2 - 0.04)), -0.23, cz0 + z + (w > d ? Math.sign(z) * (P / 2 - 0.04) : 0)); this.scene.add(k);
    }
    // round shrubs in the lot's corners
    const leaf = new T.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9 }), leaf2 = new T.MeshStandardMaterial({ color: 0x67a046, roughness: 0.9 });
    for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const [dx, dz, r, m] of [[0, 0, 0.5, leaf], [0.55 * -sx2, 0.1, 0.36, leaf2], [0.1, 0.55 * -sz2, 0.32, leaf2]]) {
      const b = new T.Mesh(new T.SphereGeometry(r, 18, 12), m); b.scale.y = 0.8;
      b.position.set(cx0 + sx2 * (LW / 2 - 0.8) + dx, -0.26 + r * 0.7, cz0 + sz2 * (LD / 2 - 0.8) + dz); b.castShadow = true; b.receiveShadow = true; this.scene.add(b);
    }
    // the foundation the house stands on: drawn first and without depth, so a stairwell going down shows through it
    const slab = new T.Mesh(new T.BoxGeometry(PLAN_W + 0.5, 0.5, PLAN_D + 0.5), new T.MeshStandardMaterial({ color: 0xc8bba6, roughness: 0.95, depthWrite: false }));
    slab.position.set(cx0, -0.27, cz0); slab.receiveShadow = true; slab.renderOrder = -2; this.scene.add(slab);
  }
  // An apartment: the flat stands on top of its building. The building is a block under the flat's rooms (balconies,
  // outdoor rooms outside that block, stick out), one 3 m storey per floor below, with a facade of windows; at its foot
  // a pavement and a street. In the classic look the block is dark and the street is the night-blue grid.
  _groundApt() {
    const T = this.T, doll = this.doll, ST = 3, H = this.aptH = MODEL.aptFloor * ST;
    // the block: around the indoor rooms of every floor
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const r of ROOMS) if (!r.outdoor) for (const [a, b, c, d] of r.rects) { x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d); }
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = PLAN_W; z1 = PLAN_D; }
    x0 -= 0.12; z0 -= 0.12; x1 += 0.12; z1 += 0.12;
    const W = x1 - x0, D = z1 - z0, [cx, cz] = this.w((x0 + x1) / 2, (z0 + z1) / 2);
    // the slab the flat stands on (drawn first, without depth, so a stairwell going down shows through it)
    const slab = new T.Mesh(new T.BoxGeometry(W + 0.1, 0.32, D + 0.1), new T.MeshStandardMaterial({ color: doll ? 0xd9d2c5 : 0x1b2337, roughness: 0.9, depthWrite: false }));
    slab.position.set(cx, -0.18, cz); slab.receiveShadow = true; slab.renderOrder = -2; this.scene.add(slab);
    // balconies (outdoor rooms) out of the block: a concrete slab under each, so they hang off the building
    const bal = new T.MeshStandardMaterial({ color: doll ? 0xcfc8ba : 0x222b42, roughness: 0.9 });
    for (const r of ROOMS) if (r.outdoor) for (const [a, b, c, d] of r.rects) {
      if (a >= x0 && c <= x1 && b >= z0 && d <= z1) continue; // inside the block's outline: it has a floor under it
      const m = new T.Mesh(new T.BoxGeometry(c - a + 0.1, 0.3, d - b + 0.1), bal), [mx, mz] = this.w((a + c) / 2, (b + d) / 2);
      m.position.set(mx, -0.2, mz); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
    if (H > 0) {
      // the facade: plaster with a row of windows for each storey, a band at each floor
      const fac = (len, kind) => {
        const c = document.createElement('canvas'), px = 48; c.width = Math.max(64, Math.min(2048, Math.round(len * px))); c.height = Math.max(64, Math.min(2048, Math.round(H * px))); const g = c.getContext('2d');
        const sx = c.width / len, sy = c.height / H;
        g.fillStyle = doll ? (kind ? '#e9dcc6' : '#e2d3bb') : '#151c2e'; g.fillRect(0, 0, c.width, c.height);
        for (let f = 0; f < MODEL.aptFloor; f++) {
          const top = f * ST * sy;
          g.fillStyle = doll ? 'rgba(0,0,0,.08)' : 'rgba(140,170,255,.12)'; g.fillRect(0, top, c.width, 0.18 * sy); // the floor band
          const n = Math.max(1, Math.floor(len / 2.2)), gap = len / n;
          for (let i = 0; i < n; i++) {
            const wx = (i * gap + gap / 2 - 0.65) * sx, wy = top + 0.9 * sy, ww = 1.3 * sx, wh = 1.45 * sy;
            g.fillStyle = doll ? '#f7f2e8' : 'rgba(140,170,255,.25)'; g.fillRect(wx - 0.08 * sx, wy - 0.08 * sy, ww + 0.16 * sx, wh + 0.2 * sy); // frame
            const gl = g.createLinearGradient(0, wy, 0, wy + wh);
            if (doll) { gl.addColorStop(0, '#9cc7e8'); gl.addColorStop(1, '#5d86a8'); } else { const lit = Math.random() < 0.35; gl.addColorStop(0, lit ? 'rgba(255,190,110,.55)' : 'rgba(60,90,150,.5)'); gl.addColorStop(1, lit ? 'rgba(255,170,90,.35)' : 'rgba(30,45,90,.5)'); }
            g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
            g.fillStyle = doll ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.08)'; g.fillRect(wx + ww / 2 - 0.02 * sx, wy, 0.04 * sx, wh); // the frame's middle bar
          }
        }
        const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
        return new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
      };
      const fx = fac(W, 0), fz = fac(D, 1), top = new T.MeshStandardMaterial({ color: doll ? 0xd9d2c5 : 0x1b2337 });
      const block = new T.Mesh(new T.BoxGeometry(W, H, D), [fz, fz, top, top, fx, fx]); // faces: +x, -x, top, bottom, +z, -z
      block.position.set(cx, -0.34 - H / 2, cz); block.castShadow = true; block.receiveShadow = true; this.scene.add(block);
    }
    const y = -0.34 - H; // the street level
    if (!doll) return this._groundClassic(y + 0.25, false); // classic: the night-blue grid at the foot of the building
    // the street: a pavement round the building, a road along its front with a dashed line, a big ground fading away
    const G = Math.max(120, SPAN * 8 + H * 4), fc = document.createElement('canvas'); fc.width = fc.height = 256; const fg = fc.getContext('2d');
    const fade = fg.createRadialGradient(128, 128, 40, 128, 128, 128); fade.addColorStop(0, '#fff'); fade.addColorStop(0.7, '#fff'); fade.addColorStop(1, '#000'); fg.fillStyle = fade; fg.fillRect(0, 0, 256, 256);
    const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gg = gc.getContext('2d'); gg.fillStyle = '#cfcac0'; gg.fillRect(0, 0, 256, 256);
    gg.strokeStyle = 'rgba(0,0,0,.12)'; gg.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i, 256); gg.stroke(); gg.beginPath(); gg.moveTo(0, i); gg.lineTo(256, i); gg.stroke(); }
    const pv = new T.CanvasTexture(gc); pv.wrapS = pv.wrapT = T.RepeatWrapping; pv.colorSpace = T.SRGBColorSpace; pv.repeat.set(G / 2, G / 2);
    const ground = new T.Mesh(new T.PlaneGeometry(G, G), new T.MeshStandardMaterial({ map: pv, alphaMap: new T.CanvasTexture(fc), transparent: true, depthWrite: false, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, y, cz); ground.receiveShadow = true; ground.renderOrder = -4; this.scene.add(ground);
    const RW = 7, rz = cz + D / 2 + 3 + RW / 2; // the road, in front (+z), past a 3 m pavement
    const rc = document.createElement('canvas'); rc.width = 512; rc.height = 64; const rg = rc.getContext('2d'); rg.fillStyle = '#4a4f57'; rg.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 4000; i++) { const v = 60 + Math.random() * 40 | 0; rg.fillStyle = `rgba(${v},${v + 2},${v + 6},.5)`; rg.fillRect(Math.random() * 512, Math.random() * 64, 1.5, 1.5); }
    rg.fillStyle = '#f1f1ea'; for (let x = 0; x < 512; x += 64) rg.fillRect(x + 8, 30, 36, 4); rg.fillRect(0, 2, 512, 2); rg.fillRect(0, 60, 512, 2);
    const rt = new T.CanvasTexture(rc); rt.wrapS = T.RepeatWrapping; rt.colorSpace = T.SRGBColorSpace; rt.repeat.set(G / 16, 1);
    const road = new T.Mesh(new T.PlaneGeometry(G, RW), new T.MeshStandardMaterial({ map: rt, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(cx, y + 0.01, rz); road.receiveShadow = true; this.scene.add(road);
    const kerb = new T.MeshStandardMaterial({ color: 0xb4ada0, roughness: 0.9 });
    for (const s of [-1, 1]) { const k = new T.Mesh(new T.BoxGeometry(G, 0.12, 0.2), kerb); k.position.set(cx, y + 0.06, rz + s * (RW / 2 + 0.1)); this.scene.add(k); }
    // street trees along the pavement, a lawn strip round the building
    const lawn = new T.Mesh(new T.BoxGeometry(W + 1.6, 0.05, D + 1.6), new T.MeshStandardMaterial({ color: 0x7fb85a, roughness: 1 }));
    lawn.position.set(cx, y + 0.025, cz); lawn.receiveShadow = true; this.scene.add(lawn);
    const trunk = new T.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 }), leaf = new T.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9 });
    for (let x = -W / 2 - 4; x <= W / 2 + 4; x += 6) {
      const t = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 2.2, 10), trunk); t.position.set(cx + x, y + 1.1, rz - RW / 2 - 1.3); t.castShadow = true; this.scene.add(t);
      const c = new T.Mesh(new T.SphereGeometry(1.1, 16, 12), leaf); c.position.set(cx + x, y + 2.8, rz - RW / 2 - 1.3); c.castShadow = true; this.scene.add(c);
    }
  }
  // dollhouse wallpaper: a soft stripe with a darker skirting board at the bottom and a light cornice at the top
  // (white, so one texture serves every room colour); siding outside: horizontal boards over a stone plinth
  _wallTex(kind) {
    const T = this.T, k = this._wallT || (this._wallT = {}); if (k[kind]) return k[kind];
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    if (kind === 'paper') {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
      for (let x = 0; x < 128; x += 32) { g.fillStyle = 'rgba(0,0,0,.035)'; g.fillRect(x, 0, 14, 256); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 14, 0, 2, 256); }
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, 128, 8); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 8, 128, 2); // cornice
      g.fillStyle = '#8a7a66'; g.fillRect(0, 232, 128, 24); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 232, 128, 3); // skirting
    } else {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
      for (let y = 0; y < 220; y += 18) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, y + 15, 128, 3); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, y, 128, 2); }
      g.fillStyle = '#9b9283'; g.fillRect(0, 220, 128, 36); g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 220, 2, 36);
    }
    const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return (k[kind] = t);
  }
  // the wallpaper colour of a room: `wall_color`, else one picked from its name
  _paperOf(r) {
    if (r.wallColor != null) return toColor(r.wallColor, 0xeee6d8);
    const n = String(r.name || r.id).toLowerCase();
    const P = [[/kid|child|nursery|girl|boy/, 0xf2c4d2], [/bed|guest/, 0xb9cdee], [/kitchen|pantry/, 0xf5dc96], [/bath|toilet|wc|shower|powder/, 0xb5e0d6],
      [/living|lounge|family|salon|sitting/, 0xeccaa3], [/dining/, 0xe3bfa2], [/office|study|library|work/, 0xc6dbb2], [/laundry|utility|storage|closet/, 0xdde6ee],
      [/garage|workshop/, 0xd8d6cf], [/hall|corridor|entry|entrance|landing|stair|foyer/, 0xeee5d4]];
    for (const [re, c] of P) if (re.test(n)) return c;
    const pal = [0xf0dcc4, 0xd6e4c8, 0xcddcf0, 0xf6e7b4, 0xe6d5ec, 0xcde9e3]; let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
  }

  _buildRooms() {
    const T = this.T;
    const texCache = {};
    for (const r of ROOMS) {
      this._cl = r.level;
      const grp = new T.Group(); this._at().add(grp);
      const mats = [];
      let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9, area = 0, sx = 0, sz = 0;
      const rep = r.floor === 'marble' ? 1.6 : r.floor === 'tile' ? 1.2 : r.floor === 'wood' ? 2.2 : r.floor === 'asphalt' ? 4 : 2.5;
      const floorMat = map => new T.MeshStandardMaterial({ map, roughness: r.floor === 'marble' || r.floor === 'tile' ? 0.35 : r.floor === 'asphalt' ? 0.85 : 0.95, metalness: 0.0, emissive: 0x000000 });
      if (r.poly) { // an outline (slanted or bent edges): one floor slab cut to its shape, with a hole for each stairwell
        const P = r.poly.map(([x, z]) => this.w(x, z)), sh = new T.Shape(P.map(([x, z]) => new T.Vector2(x, -z)));
        for (const [x1, z1, x2, z2] of r.holes || []) { const [a, b] = this.w(x1, z1), [c, d] = this.w(x2, z2); sh.holes.push(new T.Path([new T.Vector2(a, -b), new T.Vector2(c, -b), new T.Vector2(c, -d), new T.Vector2(a, -d)])); }
        texCache[r.floor] = texCache[r.floor] || this._tex(r.floor);
        const map = texCache[r.floor].clone(); map.needsUpdate = true; map.repeat.set(1 / rep, 1 / rep);
        const mat = floorMat(map), m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }), mat);
        m.rotation.x = -Math.PI / 2; m.position.y = -0.1; m.receiveShadow = true; m.userData.room = r.id;
        grp.add(m); this.pick.push(m); mats.push(mat);
        let a2 = 0; // centroid of the outline
        r.poly.forEach(([x1, z1], i) => { const [x2, z2] = r.poly[(i + 1) % r.poly.length], c = x1 * z2 - x2 * z1; a2 += c; sx += (x1 + x2) * c; sz += (z1 + z2) * c; minx = Math.min(minx, x1); minz = Math.min(minz, z1); maxx = Math.max(maxx, x1); maxz = Math.max(maxz, z1); });
        area = 3 * a2;
      }
      for (const [x1, z1, x2, z2] of (r.poly ? [] : r.floorRects || r.rects)) {
        const w = x2 - x1, d = z2 - z1;
        texCache[r.floor] = texCache[r.floor] || this._tex(r.floor);
        const map = texCache[r.floor].clone(); map.needsUpdate = true;
        map.repeat.set(w / rep, d / rep);
        const mat = floorMat(map);
        const [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2);
        const yOff = r.id === 'stairs' ? 0 : 0;
        const m = new T.Mesh(new T.BoxGeometry(w - 0.02, 0.1, d - 0.02), mat);
        m.position.set(cx, -0.05 + yOff, cz); m.receiveShadow = true; m.userData.room = r.id;
        grp.add(m); this.pick.push(m); mats.push(mat);
        minx = Math.min(minx, x1); minz = Math.min(minz, z1); maxx = Math.max(maxx, x2); maxz = Math.max(maxz, z2);
        area += w * d; sx += (x1 + x2) / 2 * w * d; sz += (z1 + z2) / 2 * w * d;
      }
      const [ccx, ccz] = r.anchor ? this.w(...r.anchor) : this.w(sx / area, sz / area);
      // outline
      const pts = [];
      if (r.poly) r.poly.forEach(([x1, z1], i) => { const [x2, z2] = r.poly[(i + 1) % r.poly.length], a = this.w(x1, z1), b = this.w(x2, z2); pts.push(a[0], 0.02, a[1], b[0], 0.02, b[1]); });
      for (const [x1, z1, x2, z2] of r.poly ? [] : r.rects) {
        const a = this.w(x1 + 0.08, z1 + 0.08), b = this.w(x2 - 0.08, z2 - 0.08);
        pts.push(a[0], 0.02, a[1], b[0], 0.02, a[1], b[0], 0.02, a[1], b[0], 0.02, b[1], b[0], 0.02, b[1], a[0], 0.02, b[1], a[0], 0.02, b[1], a[0], 0.02, a[1]);
      }
      const og = new T.BufferGeometry(); og.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const outline = new T.LineSegments(og, new T.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0 }));
      grp.add(outline);
      // ceiling lamp + point light
      const lamp = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.05, 32), new T.MeshStandardMaterial({ color: this.doll ? 0xf1ece4 : 0x334155, emissive: 0xffc27a, emissiveIntensity: 0 })); // dollhouse: a white shade, not a dark hole
      lamp.position.set(ccx, 2.25, ccz); grp.add(lamp);
      const halo = new T.Mesh(new T.CircleGeometry(0.9, 32), new T.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(ccx, 2.22, ccz); grp.add(halo);
      const pl = new T.PointLight(0xffb86b, 0, Math.max(maxx - minx, maxz - minz) * 1.3 + 2, 1.4);
      pl.position.set(ccx, 1.9, ccz); grp.add(pl);
      // presence ring
      const ring = new T.Mesh(new T.RingGeometry(0.55, 0.7, 48), new T.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(ccx, 0.04, ccz); grp.add(ring);
      const [bx0, bz0] = this.w(minx, minz), [bx1, bz1] = this.w(maxx, maxz);
      this.rooms[r.id] = { r, mats, outline, lamp, halo, pl, ring, cx: ccx, cz: ccz, box: [bx0, bz0, bx1, bz1], lit: 0, litT: 0, motion: 0, temp: null, col: new T.Color(1, 1, 1), hl: 0 };
      if (r.lightFx) this._buildLightFx(this.rooms[r.id]);
    }
  }

  // Light effects for rooms with `lightFx`: LED strips (cove line at the wall tops + floor glow along those walls),
  // ceiling spot lights (ring in wide areas, single line in narrow corridors) and a TV backlight glow.
  // Works per rectangle so L-shaped rooms get the effect on every arm; `stripSides` is a string, or one string per rect.
  // soft gradient textures for light effects: 'v' = bright top → clear bottom (wall wash, top 65 %),
  // 'h' / 'w' = bright centre line → clear edges across the short side (halo ribbons, horizontal / vertical in plan)
  _grad(kind) {
    const T = this.T, k = this._gradTex || (this._gradTex = {}); if (k[kind]) return k[kind];
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    let gr;
    if (kind === 'v') { gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,.6)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); } // v1.21.12: shorter (was 65 %)
    else { gr = kind === 'h' ? g.createLinearGradient(0, 0, 0, 128) : g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return (k[kind] = t);
  }
  _buildLightFx(R) {
    const T = this.T; const r = R.r; const types = Object.values(r.lightFx);
    R.stripCol = new T.Color(0xffb86b); R.tvCol = new T.Color(0x7dd3fc);
    R.stripL = 0; R.tvL = 0; R.stripT = 0; R.tvT = 0; R.spotT = 0; R.spotL = 0;
    const span = Math.max(...r.rects.map(([a, b, c, d]) => Math.max(c - a, d - b)));
    if (types.includes('strip')) {
      const sidesOf = i => Array.isArray(r.stripSides) ? (r.stripSides[i] || '') : (r.stripSides || 'nesw');
      const lineMat = new T.MeshBasicMaterial({ color: R.stripCol, transparent: true, opacity: 0, toneMapped: false });
      const planes = [], washes = [], ribbons = [];
      if (r.poly) { // an outline: the strip follows every edge (slanted and bent ones too)
        const P = polyArea(r.poly) >= 0 ? r.poly : [...r.poly].reverse(), inset = 0.12;
        const glow = (len, wd, x, y, z, ang, tex) => { const m = new T.Mesh(new T.PlaneGeometry(len, wd), new T.MeshBasicMaterial({ map: this._grad(tex), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })); m.rotation.order = 'YXZ'; m.rotation.y = -ang; m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); this._at().add(m); return m; };
        P.forEach(([x1, z1], i) => {
          const [x2, z2] = P[(i + 1) % P.length], L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.05) return;
          const dx = (x2 - x1) / L, dz = (z2 - z1) / L, ix = -dz, iz = dx, ang = Math.atan2(dz, dx); // (ix, iz): into the room
          let runs = [[0, L]];
          if (r.stripMode === 'walls') { // only where a wall stands on this edge
            const me = lineOf(x1, z1, x2, z2), t0 = x1 * me.dx + z1 * me.dz, s = dx * me.dx + dz * me.dz;
            runs = WALLS.filter(q => (q[5] ?? 0) === r.level && q[4] !== 'rail').map(q => [q, lineOf(q[0], q[1], q[2], q[3])])
              .filter(([, l]) => l && Math.abs(l.ang - me.ang) < 2e-3 && Math.abs(l.c - me.c) < 0.03)
              .map(([, l]) => [(l.a - t0) * s, (l.b - t0) * s].sort((u, v) => u - v)).map(([a, b]) => [Math.max(0, a), Math.min(L, b)]).filter(([a, b]) => b - a > 0.05);
          }
          for (const [a, b] of runs) {
            const len = b - a, m = (a + b) / 2, cx = x1 + dx * m, cz = z1 + dz * m;
            const [fx, fz] = this.w(cx + ix * 0.3, cz + iz * 0.3); planes.push(glow(len, 0.6, fx, 0.025, fz, ang, 'v'));
            const [wx, wz] = this.w(cx + ix * inset, cz + iz * inset);
            const wash = new T.Mesh(new T.PlaneGeometry(len, WALL_H - 0.18), new T.MeshBasicMaterial({ map: this._grad('v'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
            wash.position.set(wx, (WALL_H - 0.18) / 2, wz); wash.rotation.y = -ang; this._at().add(wash); washes.push(wash);
            const [rx, rz] = this.w(cx + ix * 0.3, cz + iz * 0.3); ribbons.push(glow(len, 0.36, rx, WALL_H - 0.14, rz, ang, 'h'));
          }
        });
      }
      (r.poly ? [] : r.rects).forEach(([x1, z1, x2, z2], ri) => {
        const sides = sidesOf(ri); if (!sides) return;
        // floor glow: transparent in the middle, bright along the chosen edges (edge width kept ~0.9 m in world units)
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.globalCompositeOperation = 'lighter';
        const dx = Math.min(80, 256 * 0.6 / (x2 - x1)), dz = Math.min(80, 256 * 0.6 / (z2 - z1)); // v1.20.0: 0.6 m edge, was 0.9 m
        const edge = (ax, ay, bx, by, rx, ry, rw, rh) => { const gr = g.createLinearGradient(ax, ay, bx, by); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
        // where along each side the strip runs: the whole side, or (strip_mode: walls) only where there is a wall
        const runs = sd => {
          const horiz = sd === 'n' || sd === 's', lo = horiz ? x1 : z1, hi = horiz ? x2 : z2;
          if (r.stripMode !== 'walls') return [[lo, hi]];
          const line = { n: z1, s: z2, w: x1, e: x2 }[sd], on = v => Math.abs(v - line) < 0.03;
          const segs = WALLS.filter(q => (q[5] ?? 0) === r.level && q[4] !== 'rail' && (horiz ? on(q[1]) && on(q[3]) : on(q[0]) && on(q[2])))
            .map(q => (horiz ? [Math.min(q[0], q[2]), Math.max(q[0], q[2])] : [Math.min(q[1], q[3]), Math.max(q[1], q[3])]))
            .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b - a > 0.05).sort((u, v) => u[0] - v[0]);
          const out = []; for (const q of segs) { const l = out[out.length - 1]; if (l && q[0] <= l[1] + 0.02) l[1] = Math.max(l[1], q[1]); else out.push([...q]); }
          return out;
        };
        const px256 = (v, a, b) => (v - a) / (b - a) * 256;
        for (const [a, b] of sides.includes('n') ? runs('n') : []) { const u = px256(a, x1, x2), v = px256(b, x1, x2); edge(0, 0, 0, dz, u, 0, v - u, dz); }
        for (const [a, b] of sides.includes('s') ? runs('s') : []) { const u = px256(a, x1, x2), v = px256(b, x1, x2); edge(0, 256, 0, 256 - dz, u, 256 - dz, v - u, dz); }
        for (const [a, b] of sides.includes('w') ? runs('w') : []) { const u = px256(a, z1, z2), v = px256(b, z1, z2); edge(0, 0, dx, 0, 0, u, dx, v - u); }
        for (const [a, b] of sides.includes('e') ? runs('e') : []) { const u = px256(a, z1, z2), v = px256(b, z1, z2); edge(256, 0, 256 - dx, 0, 256 - dx, u, dx, v - u); }
        const plane = new T.Mesh(new T.PlaneGeometry(x2 - x1 - 0.1, z2 - z1 - 0.1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
        const [px, pz] = this.w((x1 + x2) / 2, (z1 + z2) / 2); plane.rotation.x = -Math.PI / 2; plane.position.set(px, 0.025, pz); this._at().add(plane); planes.push(plane);
        // the strip itself: thin glowing bars along the inside of the wall tops
        const bar = (ax, az, bx, bz) => {
          const len = Math.hypot(bx - ax, bz - az); const horiz = az === bz;
          const m = new T.Mesh(new T.BoxGeometry(horiz ? len : 0.04, 0.04, horiz ? 0.04 : len), lineMat);
          const [mx, mz] = this.w((ax + bx) / 2, (az + bz) / 2); m.position.set(mx, WALL_H - 0.12, mz); this._at().add(m); // v1.21.12: below the wall top (was -0.05)
        };
        const i = 0.1;
        // v1.21.13: the solid strip bars are no longer drawn  — the halo + wall glow show where the strip is.
        // `bar` is kept for reference; lineMat still carries the strip colour for the other parts.
        // v1.20.0 cove look: light washing down the inside of each wall (bright under the strip, fading towards the floor)
        // and a soft halo ribbon around the strip itself, so it reads as a glowing line from above as well
        for (const sd of sides) for (const [ra, rb] of 'nesw'.includes(sd) ? runs(sd) : []) {
          const horiz = sd === 'n' || sd === 's', lo = horiz ? x1 : z1, hi = horiz ? x2 : z2;
          const a = ra <= lo + 0.01 ? ra + i : ra, b = rb >= hi - 0.01 ? rb - i : rb, len = b - a; if (len < 0.08) continue;
          const mid = (a + b) / 2;
          const lx = sd === 'w' ? x1 + i + 0.02 : sd === 'e' ? x2 - i - 0.02 : mid, lz = sd === 'n' ? z1 + i + 0.02 : sd === 's' ? z2 - i - 0.02 : mid;
          const [wx, wz] = this.w(lx, lz), rotY = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[sd];
          const wash = new T.Mesh(new T.PlaneGeometry(len, WALL_H - 0.18), new T.MeshBasicMaterial({ map: this._grad('v'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
          wash.position.set(wx, (WALL_H - 0.18) / 2, wz); wash.rotation.y = rotY; this._at().add(wash); washes.push(wash);
          const ribbon = new T.Mesh(new T.PlaneGeometry(horiz ? len : 0.36, horiz ? 0.36 : len), new T.MeshBasicMaterial({ map: this._grad(horiz ? 'h' : 'w'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
          const [rx, rz] = this.w(sd === 'w' ? x1 + i + 0.2 : sd === 'e' ? x2 - i - 0.2 : lx, sd === 'n' ? z1 + i + 0.2 : sd === 's' ? z2 - i - 0.2 : lz);
          ribbon.rotation.x = -Math.PI / 2; ribbon.position.set(rx, WALL_H - 0.14, rz); this._at().add(ribbon); ribbons.push(ribbon);
        }
      });
      const spl = new T.PointLight(R.stripCol, 0, span * 1.1, 1.2); spl.position.set(R.cx, WALL_H - 0.3, R.cz); this._at().add(spl);
      R.strip = { planes, washes, ribbons, lineMat, pl: spl };
    }
    if (types.includes('spots')) {
      const pts = [];
      for (const [x1, z1, x2, z2] of r.poly && r.rects.length > 4 ? r.rects.slice(0, 1) : r.rects) {
        const w = x2 - x1, d = z2 - z1;
        if (Math.min(w, d) < 3) { // narrow corridor: one line down the middle
          const alongX = w >= d, len = alongX ? w : d, n = Math.max(2, Math.round((len - 1.2) / 1.6) + 1);
          for (let k = 0; k < n; k++) { const t = 0.6 + (len - 1.2) * k / (n - 1); pts.push(alongX ? [x1 + t, (z1 + z2) / 2] : [(x1 + x2) / 2, z1 + t]); }
        } else { // wide room: a ring about a metre in from the edges
          const inset = 0.9, nx = Math.max(2, Math.round((w - 2 * inset) / 2.2) + 1), nz = Math.max(2, Math.round((d - 2 * inset) / 2.2) + 1);
          for (let k = 0; k < nx; k++) { const x = x1 + inset + (w - 2 * inset) * k / (nx - 1); pts.push([x, z1 + inset], [x, z2 - inset]); }
          for (let k = 1; k < nz - 1; k++) { const z = z1 + inset + (d - 2 * inset) * k / (nz - 1); pts.push([x1 + inset, z], [x2 - inset, z]); }
        }
      }
      const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d');
      const prg = pg.createRadialGradient(64, 64, 2, 64, 64, 64); prg.addColorStop(0, 'rgba(255,255,255,1)'); prg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); prg.addColorStop(1, 'rgba(255,255,255,0)');
      pg.fillStyle = prg; pg.fillRect(0, 0, 128, 128);
      const discMat = new T.MeshStandardMaterial({ color: 0x334155, emissive: 0xffd9a8, emissiveIntensity: 0, roughness: 0.4 });
      const poolMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(pc), color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
      const beamMat = new T.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const discGeo = new T.CylinderGeometry(0.11, 0.11, 0.03, 20), poolGeo = new T.CircleGeometry(0.75, 28), beamGeo = new T.ConeGeometry(0.55, 2.2, 24, 1, true);
      for (const [x, z] of pts) {
        const [sx, sz] = this.w(x, z);
        const dsk = new T.Mesh(discGeo, discMat); dsk.position.set(sx, 2.25, sz); this._at().add(dsk);
        const pool = new T.Mesh(poolGeo, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(sx, 0.03, sz); this._at().add(pool);
        const beam = new T.Mesh(beamGeo, beamMat); beam.position.set(sx, 1.14, sz); this._at().add(beam); // apex at the spot, widening to the floor
      }
      const spotPl = new T.PointLight(0xffd2a0, 0, span * 1.2, 1.1); spotPl.position.set(R.cx, 2.0, R.cz); this._at().add(spotPl);
      R.spots = { discMat, poolMat, beamMat, pl: spotPl, n: pts.length };
    }
    // TV backlight: a glow on the wall behind the TV plus a little coloured light
    if (r.tvGlow) { // LED strip around the TV: a thin glowing frame on the TV's back edges + its wash on the wall
      const G = r.tvGlow, PW = G.w + 1.3, PH = G.h + 1.0;
      const tc = document.createElement('canvas'); tc.width = 512; tc.height = Math.round(512 * PH / PW); const tg = tc.getContext('2d');
      const rw = G.w / PW * tc.width, rh = G.h / PH * tc.height, rx = (tc.width - rw) / 2, ry = (tc.height - rh) / 2;
      tg.strokeStyle = '#fff'; tg.shadowColor = '#fff';
      for (const [blur, lw, a] of [[60, 18, 0.5], [30, 10, 0.7], [12, 5, 1]]) { tg.globalAlpha = a; tg.shadowBlur = blur; tg.lineWidth = lw; tg.strokeRect(rx, ry, rw, rh); }
      const tvPlane = new T.Mesh(new T.PlaneGeometry(PW, PH), new T.MeshBasicMaterial({ map: new T.CanvasTexture(tc), color: R.tvCol, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false }));
      const [tx, tz] = this.w(G.x, G.z), cy = G.y + G.h / 2;
      // facing (from the room's TV piece): the way the screen looks; the glow sits on its back, towards the wall.
      // A tv_glow written by hand has no facing and keeps its old placement (a TV along x, light on its -z side).
      const fc = G.facing, ew = fc === 'e' || fc === 'w', back = fc ? { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[fc] || [0, 1] : null;
      if (back) tvPlane.position.set(tx + back[0] * 0.04, cy, tz + back[1] * 0.04); else tvPlane.position.set(tx, cy, tz + 0.04);
      if (ew) tvPlane.rotation.y = Math.PI / 2;
      this._at().add(tvPlane);
      const sm = new T.MeshBasicMaterial({ color: R.tvCol, transparent: true, opacity: 0, toneMapped: false });
      const t = 0.03, strips = [[G.w + t, t, 0, G.h / 2], [G.w + t, t, 0, -G.h / 2], [t, G.h, -G.w / 2, 0], [t, G.h, G.w / 2, 0]].map(([w, h, ox, oy]) => {
        const m = new T.Mesh(ew ? new T.BoxGeometry(0.02, h, w) : new T.BoxGeometry(w, h, 0.02), sm);
        if (ew) m.position.set(tx, cy + oy, tz + ox); else m.position.set(tx + ox, cy + oy, tz); this._at().add(m); return m;
      });
      const tpl = new T.PointLight(R.tvCol, 0, 6, 1.2);
      if (back) tpl.position.set(tx + back[0] * 0.35, cy, tz + back[1] * 0.35); else tpl.position.set(tx, cy, tz - 0.35);
      this._at().add(tpl);
      R.tv = { plane: tvPlane, pl: tpl, sm };
    }
  }

  _buildWalls() {
    const T = this.T, doll = this.doll;
    const plainWall = new T.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.85 }); let wallMat = plainWall;
    const capMat = new T.MeshStandardMaterial({ color: doll ? 0x6f6458 : 0x1e293b, roughness: 0.6 });
    const glassMat = new T.MeshPhysicalMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, emissive: 0x1d4ed8, emissiveIntensity: 0.15 });
    const frameMat = new T.MeshStandardMaterial({ color: 0x5b6472, roughness: 0.5, metalness: 0.4 });
    // a wall piece in any direction (slanted and bent walls too: a bent one is many short pieces that overlap a little)
    let into = null; // dollhouse: the group of the wall being built (cut down as one piece)
    const add = (mat, x1, z1, x2, z2, y0, h, thick, cast = true, over = thick) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const geo = new T.BoxGeometry(len + over, h, thick);
      if (Array.isArray(mat)) { // wallpaper / siding faces: the pattern repeats every 0.5 m along the wall
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len + over) / 0.5);
      }
      const m = new T.Mesh(geo, mat);
      const [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2);
      m.position.set(cx, y0 + h / 2, cz); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); m.castShadow = cast; m.receiveShadow = true; (into || this._at()).add(m); return m;
    };
    // dollhouse: which room is on each side of a wall (outdoor rooms count as outside), and the wall's materials:
    // the room's wallpaper on its side, siding on the outside, the cap colour on the ends and the top
    const roomAt = (x, z, l) => ROOMS.find(r => r.level === l && (r.poly ? inPoly(x, z, r.poly) : r.rects.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)));
    const paper = {}, sideMat = r => {
      const key = r && !r.outdoor ? 'p' + this._paperOf(r) : 'out';
      return (paper[key] ||= key === 'out' ? new T.MeshStandardMaterial({ map: this._wallTex('siding'), color: 0xe9dcc2, roughness: 0.9 })
        : new T.MeshStandardMaterial({ map: this._wallTex('paper'), color: this._paperOf(r), roughness: 0.85 }));
    };
    const edgeMat = new T.MeshStandardMaterial({ color: 0xece5d9, roughness: 0.85 });
    // an outer wall has no room on one of its sides: it is drawn thicker
    const inside = (x, z, l) => ROOMS.some(r => r.level === l && (r.poly ? inPoly(x, z, r.poly) : r.rects.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)));
    const fenceMat = new T.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.85 }), boardMat = new T.MeshStandardMaterial({ color: 0x9a7552, roughness: 0.9 });
    const glassWall = new T.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, emissive: 0x1d4ed8, emissiveIntensity: 0.08, depthWrite: false });
    for (const [x1, z1, x2, z2, type, lvl, o] of WALLS) {
      this._cl = lvl ?? 0;
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, nx = -(z2 - z1) / len * 0.3, nz = (x2 - x1) / len * 0.3, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const outer = !o && (!inside(mx + nx, mz + nz, lvl ?? 0) || !inside(mx - nx, mz - nz, lvl ?? 0));
      const t = o ? 0.1 : outer ? 0.22 : 0.12, over = o?.bent ? t * 0.6 : t;
      into = null; wallMat = plainWall;
      if (!['glass', 'fence', 'rail'].includes(type)) {
        // BoxGeometry faces: +x, -x, top, bottom, +z, -z; the +z face looks towards (nx, nz)
        const l = lvl ?? 0, rp = roomAt(mx + nx, mz + nz, l), rn = roomAt(mx - nx, mz - nz, l);
        if (doll) wallMat = [edgeMat, edgeMat, edgeMat, edgeMat, sideMat(rp), sideMat(rn)];
        // every full wall can be lowered (Walls: Up / Cutaway / Down). An outer wall (the outside on one side) faces
        // away from the house: Cutaway lowers it while you look at it from that side.
        if (type !== 'half') {
          const outP = !rp || rp.outdoor, outN = !rn || rn.outdoor, outer = outP !== outN;
          into = new T.Group(); this._at().add(into);
          const s = outer && !outP ? -1 : 1, [ax, az] = this.w(x1, z1), [bx, bz] = this.w(x2, z2);
          this.cuts.push({ g: into, outer, nx: s * nx / 0.3, nz: s * nz / 0.3, h: o?.h ? Math.min(WALL_H, o.h) : WALL_H, k: 1, a: [ax, az], b: [bx, bz], l, doors: [] });
        }
      }
      if (type === 'half') { // a low wall (kitchen bar, stair rail): `height`, else about two thirds of the wall
        const h = Math.min(WALL_H, o?.h ?? Math.max(0.5, WALL_H * 0.62));
        add(wallMat, x1, z1, x2, z2, 0, h, t, true, over); add(capMat, x1, z1, x2, z2, h, 0.04, t + 0.01, false, over);
      } else if (type === 'glass') { // a glass partition: a thin frame at the floor and the top, glass between
        const h = Math.min(WALL_H, o?.h ?? WALL_H);
        add(frameMat, x1, z1, x2, z2, 0, 0.06, 0.07, false, over); add(glassWall, x1, z1, x2, z2, 0.06, h - 0.1, 0.03, false, over); add(frameMat, x1, z1, x2, z2, h - 0.04, 0.04, 0.07, false, over);
      } else if (type === 'fence') { // a garden fence: posts, two rails and upright boards with gaps (`height`, else 1.2 m)
        const h = Math.min(WALL_H, o?.h ?? 1.2), len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
        const at = (s, w) => [x1 + ux * s - ux * w / 2, z1 + uz * s - uz * w / 2, x1 + ux * s + ux * w / 2, z1 + uz * s + uz * w / 2];
        add(fenceMat, ...at(0, 0.09), 0, h + 0.05, 0.09); add(fenceMat, ...at(len, 0.09), 0, h + 0.05, 0.09); // the posts
        add(fenceMat, x1, z1, x2, z2, h * 0.22, 0.06, 0.05, false, 0); add(fenceMat, x1, z1, x2, z2, h * 0.78, 0.06, 0.05, false, 0); // the rails
        const n = Math.max(1, Math.round(len / 0.16)); // the boards, about 10 cm wide with a 6 cm gap
        for (let i = 0; i < n; i++) add(boardMat, ...at((i + 0.5) * len / n, 0.1), 0.04, h - 0.04, 0.025, false, 0);
      } else if (type === 'rail') {
        add(wallMat, x1, z1, x2, z2, 0, 0.18, 0.18);
        add(glassMat, x1, z1, x2, z2, 0.18, 0.72, 0.03, false);
        add(frameMat, x1, z1, x2, z2, 0.9, 0.05, 0.07, false);
      } else if (type === 'win') {
        add(wallMat, x1, z1, x2, z2, 0, 0.75, t);
        add(frameMat, x1, z1, x2, z2, 0.75, 0.04, t + 0.02);
        add(glassMat, x1, z1, x2, z2, 0.79, WALL_H - 0.79, 0.04, false);
        add(capMat, x1, z1, x2, z2, WALL_H, 0.04, t);
      } else {
        const h = o?.h ? Math.min(WALL_H, o.h) : WALL_H;
        add(wallMat, x1, z1, x2, z2, 0, h, t, true, over);
        add(capMat, x1, z1, x2, z2, h, 0.04, t + 0.005, false, over);
      }
    }
  }

  // Dollhouse, stacked floors: a flat roof on each room of a floor, shown while that floor stands below the one you
  // look at (where the floor above doesn't cover it, you see the roof, not into the room). Outdoor rooms and rooms with
  // stairs (the way up must stay open) have none.
  _buildRoofs() {
    if (!this.doll) return;
    const T = this.T, top = this.storey - 0.1, th = 0.2;
    // drawn after the stairwells' openings (render order) and not where they are (stencil): the way down stays open
    const hole = { stencilWrite: true, stencilRef: 1, stencilFunc: T.NotEqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp };
    const map = this._tex('stone'), mat = new T.MeshStandardMaterial({ map, color: 0xd3cdc2, roughness: 0.95, ...hole });
    map.repeat.set(0.5, 0.5);
    const edge = new T.MeshStandardMaterial({ color: 0x8f8679, roughness: 0.8, ...hole });
    this.roofs = {};
    for (const r of ROOMS) {
      if (r.outdoor || r.stairs || FURN.some(f => f.type === 'stairs' && f.room === r.id)) continue;
      this._cl = r.level;
      const g = (this.roofs[r.level] ||= (() => { const G = new T.Group(); G.visible = false; this._at().add(G); return G; })());
      if (r.poly) {
        const sh = new T.Shape(r.poly.map(([x, z]) => { const [a, b] = this.w(x, z); return new T.Vector2(a, -b); }));
        const m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }), mat);
        m.rotation.x = -Math.PI / 2; m.position.y = top - th; m.castShadow = true; m.receiveShadow = true; m.renderOrder = 3; g.add(m);
      } else for (const [x1, z1, x2, z2] of r.rects) {
        const [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2), m = new T.Mesh(new T.BoxGeometry(x2 - x1 + 0.1, th, z2 - z1 + 0.1), [edge, edge, mat, edge, edge, edge]);
        m.position.set(cx, top - th / 2, cz); m.castShadow = true; m.receiveShadow = true; m.renderOrder = 3; g.add(m);
      }
    }
  }
  _buildFurniture() {
    const T = this.T;
    const mats = {};
    const M = (c, o = {}) => (mats[c + JSON.stringify(o)] ||= new T.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0, transparent: !!o.op, opacity: o.op ?? 1 }));
    let cur = null; // the piece being built, when it has entities: its meshes can be tapped
    let curIdx = null; // the piece being built (any piece): arrange mode drags it
    const tag = m => { if (curIdx != null) m.userData.fi = curIdx; if (cur) { m.userData.furn = cur.idx; cur.meshes.push(m); } return m; };
    this.fmov = {};
    const add = (room, geo, mat, x, y, z, shadow = true) => {
      const m = new T.Mesh(geo, mat); const [cx, cz] = this.w(x, z); m.position.set(cx, y, cz);
      m.castShadow = shadow; m.receiveShadow = true; m.userData.room = room; this._at().add(m); this.pick.push(m); return tag(m);
    };
    // axis-aligned box by center
    const box = (room, x, z, w, d, h, color, y = 0, o) => add(room, new T.BoxGeometry(w, h, d), M(color, o), x, y + h / 2, z);
    // box by extents
    const ext = (room, x0, z0, x1, z1, h, color, y = 0, o) => box(room, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), h, color, y, o);
    const rug = (room, x, z, w, d, color) => box(room, x, z, w, d, 0.015, color, 0.002, { r: 1 });
    const cyl = (room, x, z, r, h, color, y = 0, o) => add(room, new T.CylinderGeometry(r, r, h, 28), M(color, o), x, y + h / 2, z);
    const ball = (room, x, z, r, color, y) => add(room, new T.SphereGeometry(r, 20, 16), M(color, { r: 0.9 }), x, y, z);
    // sofa: footprint extents, back side n/s/e/w, arms on the two ends
    const sofa = (room, x0, z0, x1, z1, back, color, cushion, pillow, arms = 'both', cornerBack = null) => {
      const seatH = 0.42, backT = 0.22, armT = 0.18;
      // cushions the same colour as the frame would melt into it: they are drawn a shade lighter, so the seats show
      const ch = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], [cr, cg, cb] = ch(cushion), [fr, fg, fb] = ch(color);
      if (Math.abs(cr - fr) + Math.abs(cg - fg) + Math.abs(cb - fb) < 60) cushion = (Math.round(cr + (255 - cr) * 0.28) << 16) | (Math.round(cg + (255 - cg) * 0.28) << 8) | Math.round(cb + (255 - cb) * 0.28);
      ext(room, x0, z0, x1, z1, 0.3, color);
      const horiz = back === 'n' || back === 's';
      // the corner of an L-shaped sofa: a back on its outer end too
      if (cornerBack && horiz) { if (cornerBack === 'start') ext(room, x0, z0, x0 + backT, z1, 0.86, color); else ext(room, x1 - backT, z0, x1, z1, 0.86, color); }
      if (back === 'n') ext(room, x0, z0, x1, z0 + backT, 0.86, color);
      if (back === 's') ext(room, x0, z1 - backT, x1, z1, 0.86, color);
      if (back === 'w') ext(room, x0, z0, x0 + backT, z1, 0.86, color);
      if (back === 'e') ext(room, x1 - backT, z0, x1, z1, 0.86, color);
      const a0 = arms === 'both' || arms === 'start', a1 = arms === 'both' || arms === 'end';
      if (horiz) { if (a0) ext(room, x0, z0, x0 + armT, z1, 0.62, color); if (a1) ext(room, x1 - armT, z0, x1, z1, 0.62, color); }
      else { if (a0) ext(room, x0, z0, x1, z0 + armT, 0.62, color); if (a1) ext(room, x0, z1 - armT, x1, z1, 0.62, color); }
      // seat cushions
      const len = horiz ? (x1 - x0) - (a0 ? armT : 0) - (a1 ? armT : 0) : (z1 - z0) - (a0 ? armT : 0) - (a1 ? armT : 0);
      const n = Math.max(1, Math.round(len / 0.85)); const seg = len / n;
      for (let i = 0; i < n; i++) {
        if (horiz) {
          const sx = x0 + (a0 ? armT : 0) + seg * i, zz0 = back === 'n' ? z0 + backT : z0, zz1 = back === 's' ? z1 - backT : z1;
          ext(room, sx + 0.02, zz0 + 0.02, sx + seg - 0.02, zz1 - 0.04, 0.13, cushion, 0.3, { r: 0.95 });
          if (pillow && i % 2 === 0) { const pz = back === 'n' ? zz0 + 0.1 : zz1 - 0.1; box(room, sx + seg / 2, pz, 0.42, 0.14, 0.38, pillow, 0.43, { r: 1 }); }
        } else {
          const sz = z0 + (a0 ? armT : 0) + seg * i, xx0 = back === 'w' ? x0 + backT : x0, xx1 = back === 'e' ? x1 - backT : x1;
          ext(room, xx0 + 0.02, sz + 0.02, xx1 - 0.04, sz + seg - 0.02, 0.13, cushion, 0.3, { r: 0.95 });
          if (pillow && i % 2 === 0) { const px = back === 'w' ? xx0 + 0.1 : xx1 - 0.1; box(room, px, sz + seg / 2, 0.14, 0.42, 0.38, pillow, 0.43, { r: 1 }); }
        }
      }
    };
    // bed: center, width (across), length, head side n/s/e/w
    const bed = (room, x, z, wd, ln, head, frame, duvet, headboard, opts = {}) => {
      const alongX = head === 'e' || head === 'w';
      const W = alongX ? ln : wd, D = alongX ? wd : ln;
      box(room, x, z, W, D, 0.3, frame, 0, { r: 0.6 });
      box(room, x, z, W - 0.06, D - 0.06, 0.2, 0xf8fafc, 0.3, { r: 1 });
      // duvet covers the foot 72%
      const f = 0.72; const dl = ln * f;
      const off = (ln - dl) / 2;
      const dx = head === 'w' ? off : head === 'e' ? -off : 0, dz = head === 'n' ? off : head === 's' ? -off : 0;
      box(room, x + dx, z + dz, alongX ? dl : wd + 0.04, alongX ? wd + 0.04 : dl, 0.1, duvet, 0.42, { r: 1 });
      // pillows
      const np = wd > 1.4 ? 2 : 1; const ph = (ln / 2) - 0.25;
      for (let i = 0; i < np; i++) {
        const t = np === 1 ? 0 : (i ? 0.25 : -0.25) * wd;
        const px = alongX ? x + (head === 'w' ? -ph : ph) : x + t, pz = alongX ? z + t : z + (head === 'n' ? -ph : ph);
        box(room, px, pz, alongX ? 0.32 : 0.55, alongX ? 0.55 : 0.32, 0.13, opts.pillow || 0xffffff, 0.5, { r: 1 });
      }
      // headboard
      const hx = alongX ? x + (head === 'w' ? -(ln / 2 + 0.06) : ln / 2 + 0.06) : x, hz = alongX ? z : z + (head === 'n' ? -(ln / 2 + 0.06) : ln / 2 + 0.06);
      const hb = box(room, hx, hz, alongX ? 0.12 : wd + 0.14, alongX ? wd + 0.14 : 0.12, opts.hbH || 1.0, headboard, 0, { r: 0.85 });
      if (opts.house) { // house-shaped headboard: a flat triangular gable sitting on top of the headboard
        const gw = wd + 0.14, gh = 0.42;
        const shape = new T.Shape(); shape.moveTo(-gw / 2, 0); shape.lineTo(gw / 2, 0); shape.lineTo(0, gh); shape.closePath();
        const geo = new T.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }); geo.translate(0, 0, -0.06);
        const roof = new T.Mesh(geo, M(0xf5f5f4, { r: 0.6 }));
        roof.position.set(hb.position.x, opts.hbH || 1.0, hb.position.z);
        if (alongX) roof.rotation.y = Math.PI / 2; // headboard runs along z for beds whose head is on an east/west wall
        roof.castShadow = true; roof.userData.room = room; this._at().add(roof); this.pick.push(roof); tag(roof);
        (this.roofs ||= []).push(roof);
      }
    };
    const chair = (room, x, z, face, color, seat) => { // face: direction the sitter looks (n/s/e/w)
      box(room, x, z, 0.46, 0.46, 0.46, seat || color, 0, { r: 0.9 });
      const bx = face === 'e' ? -0.21 : face === 'w' ? 0.21 : 0, bz = face === 's' ? -0.21 : face === 'n' ? 0.21 : 0;
      box(room, x + bx, z + bz, bx ? 0.05 : 0.46, bz ? 0.05 : 0.46, 0.52, color, 0.46, { r: 0.6 });
    };
    const table = (room, x, z, w, d, h, top, leg, o) => {
      box(room, x, z, w, d, 0.05, top, h - 0.05, o || { r: 0.35 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(room, x + sx * (w / 2 - 0.07), z + sz * (d / 2 - 0.07), 0.06, 0.06, h - 0.05, leg);
    };
    // a phone lying on its back on a charger: shown only while it charges (see _update); `ew` lays it east–west
    const phone = (room, x, z, y, ew, f) => {
      const [pw, pd] = ew ? [0.16, 0.08] : [0.08, 0.16];
      const body = box(room, x, z, pw, pd, 0.012, C(f.phone_color, 0x1f2937), y, { r: 0.35, m: 0.4 });
      const m = box(room, x, z, pw - 0.012, pd - 0.012, 0.002, 0x0b1020, y + 0.012, { r: 0.15, e: 0x34d399, ei: 0 }); m.material = m.material.clone();
      const glow = new T.Mesh(new T.CircleGeometry(0.28, 32), new T.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      const [gx, gz] = this.w(x, z); glow.rotation.x = -Math.PI / 2; glow.position.set(gx, y + 0.016, gz); this._at().add(glow);
      body.visible = m.visible = false;
      this.chargers.push({ m, glow, parts: [body, m], plug: f.plug || null, power: f.power || null, min: N(f.charging_w, 1.5), t: 0 });
    };
    const plant = (room, x, z, s = 1) => { cyl(room, x, z, 0.2 * s, 0.38 * s, 0xd6cfc4, 0, { r: 0.6 }); ball(room, x, z, 0.32 * s, 0x2f6b3a, 0.62 * s); ball(room, x + 0.12 * s, z - 0.08 * s, 0.22 * s, 0x3f8a4c, 0.85 * s); };

    // pieces from the config (house.furniture / room.furniture, or the automatic set for automatic rooms)
    this.tvs = []; this.chargers = []; this.lamps = []; this.fans = []; this.markers = []; this.fpieces = []; this.blinds = []; this.vacuums = []; this.cars = []; this.pools = []; this.sprinklers = []; this.washers = []; this.steams = [];
    const N = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));
    const C = (v, d) => toColor(v, d);
    const opt = f => ({ r: N(f.roughness, 0.75), m: N(f.metalness, 0), op: f.opacity != null ? N(f.opacity, 1) : undefined, e: f.emissive, ei: f.emissive ? N(f.emissive_intensity, 0.6) : 0 });
    const floorGlow = (x, z, r, color, y = 0.01) => {
      const g = new T.Mesh(new T.CircleGeometry(r, 32), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      const [gx, gz] = this.w(x, z); g.rotation.x = -Math.PI / 2; g.position.set(gx, y, gz); this._at().add(g); return g;
    };
    for (const f of FURN) {
      const rm = f.room || null;
      cur = f.entities?.length ? { idx: f.idx, f, meshes: [] } : null;
      this._cl = f.level ?? 0; curIdx = f.idx;
      const before = this._at().children.length;
      try {
        switch (f.type) {
          case 'box': box(rm, N(f.x, 0), N(f.z, 0), N(f.w, 0.5), N(f.d, 0.5), N(f.h, 0.5), C(f.color, 0x8b6b45), N(f.y, 0), opt(f)); break;
          case 'block': ext(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 1), N(f.z1, 1), N(f.h, 0.5), C(f.color, 0x8b6b45), N(f.y, 0), opt(f)); break;
          case 'rug': rug(rm, N(f.x, 0), N(f.z, 0), N(f.w, 2), N(f.d, 1.5), C(f.color, 0x9ca3af)); break;
          case 'cylinder': cyl(rm, N(f.x, 0), N(f.z, 0), N(f.radius, 0.2), N(f.h, 0.5), C(f.color, 0xd6cfc4), N(f.y, 0), opt(f)); break;
          case 'ball': ball(rm, N(f.x, 0), N(f.z, 0), N(f.radius, 0.2), C(f.color, 0xf9a8d4), N(f.y, 0.2)); break;
          case 'sofa': sofa(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 2), N(f.z1, 1), f.back || 'n', C(f.color, 0x475569), C(f.cushion, 0x64748b), f.pillow === false ? null : C(f.pillow, 0xe2e8f0), f.arms || 'both', f.cornerBack); break;
          case 'bed': bed(rm, N(f.x, 0), N(f.z, 0), N(f.width, 1.4), N(f.length, 2.0), f.head || 'n', C(f.frame, 0x7c5a3c), C(f.duvet, 0x93c5fd), C(f.headboard, 0xe8dcc8), { pillow: C(f.pillow, 0xffffff), house: !!f.house_headboard, hbH: f.headboard_height }); break;
          case 'chair': chair(rm, N(f.x, 0), N(f.z, 0), f.face || 'n', C(f.color, 0x334155), f.seat != null ? C(f.seat) : undefined); break;
          case 'table': table(rm, N(f.x, 0), N(f.z, 0), N(f.w, 1.2), N(f.d, 0.8), N(f.h, 0.76), C(f.top, 0xd8ccb2), C(f.leg, 0xb7a684), opt(f)); break;
          case 'plant': plant(rm, N(f.x, 0), N(f.z, 0), N(f.size, 1)); break;
          case 'tv': { // a screen that flickers while its media player plays; facing = the direction the screen looks
            const w = N(f.w, 1.6), hh = N(f.h, 0.9), y = N(f.y, 0.6), alongX = !['e', 'w'].includes(f.facing || 'n');
            const m = box(rm, N(f.x, 0), N(f.z, 0), alongX ? w : 0.05, alongX ? 0.05 : w, hh, 0x05070c, y, { r: 0.2, e: 0x3b82f6, ei: 0 });
            m.material = m.material.clone();
            // the picture on its screen while the TV is on: what's playing (its cover art) or a lit "on" screen
            const fcg = ['n', 's', 'e', 'w'].includes(f.facing) ? f.facing : 'n', dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[fcg];
            const scr = new T.MeshBasicMaterial({ map: this._tvIdlePic(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
            const sp = add(rm, new T.PlaneGeometry(w * 0.94, hh * 0.88), scr, N(f.x, 0) + dir[0] * 0.03, y + hh / 2, N(f.z, 0) + dir[1] * 0.03, false);
            sp.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[fcg]; sp.visible = false;
            this.tvs.push({ m, scr, sp, aspect: w / hh, vis: 0, pic: null, entity: f.entities?.find(e => e.startsWith('media_player.')) || f.entity || null }); break;
          }
          case 'charger': { // a charging pad; the phone on it shows while it charges
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 0.55);
            cyl(rm, x, z, 0.05, 0.008, C(f.color, 0xe5e7eb), y, { r: 0.4 });
            phone(rm, x, z, y + 0.008, false, f); break;
          }
          case 'stairs': this._stairs(f); break;
          case 'nightstand': { // bedside table: drawers on its front (`facing`), a table lamp on top that glows with its light
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ew = fc === 'e' || fc === 'w', W = N(f.w, 0.5), D = N(f.d, 0.4), H = Math.max(0.25, N(f.h, 0.55));
            const [fw, fd] = [W, D], wood = C(f.color, 0x7c5a3c), top = f.top != null ? C(f.top) : wood, hnd = C(f.handle, 0xd4b483);
            const sx = fc === 'e' ? 1 : fc === 'w' ? -1 : 0, sz = fc === 's' ? 1 : fc === 'n' ? -1 : 0, front = ew ? fw / 2 : fd / 2, across = ew ? fd : fw;
            box(rm, x, z, fw - 0.06, fd - 0.06, 0.05, 0x2a1f16, 0, { r: 0.9 }); // plinth, set back
            box(rm, x, z, fw, fd, H - 0.08, wood, 0.05, { r: 0.7 });
            box(rm, x, z, fw + 0.03, fd + 0.03, 0.03, top, H - 0.03, { r: 0.45 });
            const n = Math.max(1, Math.min(4, Math.round(N(f.drawers, 2)))), gap = 0.025, bodyH = H - 0.08 - gap, dh = (bodyH - gap * (n - 1)) / n - gap;
            const fr = (c => { const r = Math.min(255, ((c >> 16) & 255) + 22), g = Math.min(255, ((c >> 8) & 255) + 18), b = Math.min(255, (c & 255) + 14); return (r << 16) | (g << 8) | b; })(wood);
            for (let k = 0; k < n; k++) {
              const y = 0.05 + gap + k * (dh + gap * 2), dx = x + sx * (front + 0.006), dz = z + sz * (front + 0.006);
              box(rm, dx, dz, ew ? 0.012 : across - 0.05, ew ? across - 0.05 : 0.012, dh, fr, y, { r: 0.6 });
              box(rm, x + sx * (front + 0.02), z + sz * (front + 0.02), ew ? 0.02 : Math.min(0.14, across * 0.3), ew ? Math.min(0.14, across * 0.3) : 0.02, 0.02, hnd, y + dh / 2 - 0.01, { r: 0.3, m: 0.7 });
            }
            if (f.plug) phone(rm, x + sx * front * 0.35 + (ew ? 0 : across * 0.25), z + sz * front * 0.35 + (ew ? across * 0.25 : 0), H, ew, f); // the phone, on top, while it charges
            if (f.lamp !== false) { // a small table lamp at the back of the top
              const lx = x - sx * fw * 0.12, lz = z - sz * fd * 0.12, s = Math.min(1, Math.min(fw, fd) / 0.4), y0 = H;
              cyl(rm, lx, lz, 0.06 * s, 0.02, 0xd6cfc4, y0, { r: 0.4, m: 0.3 });
              cyl(rm, lx, lz, 0.012, 0.2 * s, 0xb08d57, y0 + 0.02, { r: 0.3, m: 0.6 });
              const mat = new T.MeshStandardMaterial({ color: C(f.shade, 0xf5e6c8), emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.8, side: T.DoubleSide });
              const m = add(rm, new T.CylinderGeometry(0.07 * s, 0.11 * s, 0.14 * s, 24, 1, true), mat, lx, y0 + 0.2 * s + 0.05 * s, lz);
              this.lamps.push({ m, glow: floorGlow(lx, lz, 0.6, 0xffc27a), entity: f.entities.find(e => e.startsWith('light.') || e.startsWith('switch.')) || null, t: 0, col: new T.Color(0xffc27a) });
            }
            break;
          }
          case 'toilet': case 'sink': case 'shower': case 'bathtub': case 'washer': case 'towel': {
            // bathroom / laundry pieces: w × d is the x × z size; `facing` is their front. u runs along the front, v from the back (-) to the front (+)
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ew = fc === 'e' || fc === 'w', sg = fc === 's' || fc === 'e' ? 1 : -1;
            const DF = { toilet: [0.4, 0.65], sink: [0.8, 0.5], shower: [0.9, 0.9], bathtub: [1.7, 0.75], washer: [0.6, 0.6], towel: [0.5, 0.08] }[f.type];
            const W = N(f.w, ew ? DF[1] : DF[0]), D = N(f.d, ew ? DF[0] : DF[1]), A = ew ? D : W, Dp = ew ? W : D;
            const at = (u, v) => ew ? [x + sg * v, z + u] : [x + u, z + sg * v];
            const lb = (u, v, a, dp, h, col, y = 0, o) => { const [px, pz] = at(u, v); return box(rm, px, pz, ew ? dp : a, ew ? a : dp, h, col, y, o); };
            const lc = (u, v, r, h, col, y = 0, o) => { const [px, pz] = at(u, v); return cyl(rm, px, pz, r, h, col, y, o); };
            const white = C(f.color, 0xf8fafc), chrome = { r: 0.25, m: 0.8 }, ent = f.entities[0] || null;
            if (f.type === 'toilet') {
              lb(0, -Dp / 2 + 0.1, A * 0.92, 0.2, 0.4, white, 0.38, { r: 0.3 }); // tank
              lb(0, -Dp / 2 + 0.11, A * 0.95, 0.22, 0.03, white, 0.78, { r: 0.3 }); // its lid
              lc(0, -Dp / 2 + 0.11, 0.018, 0.012, 0xcbd5e1, 0.81, chrome); // flush button
              lb(0, -Dp / 2 + 0.25, A * 0.45, 0.12, 0.38, white, 0, { r: 0.3 }); // foot
              lc(0, Dp / 2 - Math.min(A, Dp) * 0.48, Math.min(A, Dp) * 0.46, 0.3, white, 0.08, { r: 0.3 }); // bowl
              lc(0, Dp / 2 - Math.min(A, Dp) * 0.48, Math.min(A, Dp) * 0.48, 0.03, C(f.seat, 0xffffff), 0.38, { r: 0.35 }); // seat
            } else if (f.type === 'sink') {
              const H = N(f.h, 0.85), wood = C(f.color, 0x8b6b45), top = C(f.top, 0xf8fafc), r = Math.min(A * 0.3, Dp * 0.32);
              lb(0, -0.01, A, Dp - 0.02, 0.1, 0x2a1f16, 0, { r: 0.9 }); // plinth
              lb(0, 0, A, Dp, H - 0.14, wood, 0.1, { r: 0.7 });
              for (const s2 of A > 0.55 ? [-1, 1] : [0]) lb(s2 * A / 4, Dp / 2 + 0.006, (s2 ? A / 2 : A) - 0.03, 0.012, H - 0.22, wood, 0.13, { r: 0.55 }); // doors
              lb(0, 0, A + 0.02, Dp + 0.02, 0.04, top, H - 0.04, { r: 0.25 });
              lc(0, 0.03, r, 0.006, 0xdbe4ee, H, { r: 0.2 }); lc(0, 0.03, r * 0.15, 0.007, 0x64748b, H, chrome); // basin, drain
              lc(0, -Dp / 2 + 0.07, 0.015, 0.16, 0xcbd5e1, H, chrome); lb(0, -Dp / 2 + 0.11, 0.025, 0.09, 0.02, 0xcbd5e1, H + 0.14, chrome); // tap
              const mat = new T.MeshStandardMaterial({ color: 0xc7d7e6, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.08, metalness: 0.6 });
              const [mx, mz] = at(0, -Dp / 2 + 0.012), m = add(rm, new T.BoxGeometry(ew ? 0.015 : A * 0.8, Math.min(0.6, WALL_H - H - 0.1), ew ? A * 0.8 : 0.015), mat, mx, H + 0.12 + Math.min(0.6, WALL_H - H - 0.1) / 2, mz);
              if (f.entities.some(e => e.startsWith('light.') || e.startsWith('switch.'))) this.lamps.push({ m, glow: floorGlow(...at(0, Dp / 2 + 0.3), 0.7, 0xffc27a), entity: f.entities.find(e => e.startsWith('light.') || e.startsWith('switch.')), t: 0, col: new T.Color(0xffc27a) });
            } else if (f.type === 'shower') {
              const H = Math.min(1.95, WALL_H), glass = { r: 0.05, m: 0.1, op: 0.22 };
              lb(0, 0, A, Dp, 0.06, white, 0, { r: 0.35 }); lc(0, 0, 0.04, 0.062, 0x64748b, 0, chrome); // tray, drain
              lb(0, Dp / 2 - 0.01, A * 0.6, 0.012, H - 0.06, 0xcfe8ff, 0.06, glass); // the glass door, half open
              lb(-A / 2 + 0.006, 0, 0.012, Dp, H - 0.06, 0xcfe8ff, 0.06, glass); // a glass side
              lb(A / 2 - 0.02, -Dp / 2 + 0.03, 0.02, 0.02, H - 0.3, 0xcbd5e1, 0.06, chrome); // riser
              lb(A / 2 - 0.1, -Dp / 2 + 0.1, 0.14, 0.14, 0.02, 0xcbd5e1, H - 0.27, chrome); // head
              if (ent) { // steam: a few soft puffs that rise while the shower runs
                const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
                const puffs = [0, 1, 2, 3, 4].map(k => { const [px, pz] = at((k % 3 - 1) * A * 0.2, (k % 2 - 0.5) * Dp * 0.3); const m = new T.Mesh(new T.SphereGeometry(0.16 + 0.04 * (k % 3), 12, 10), mat); const [gx, gz] = this.w(px, pz); m.position.set(gx, 0.3, gz); this._at().add(m); return m; });
                this.steams.push({ puffs, mat, entity: ent, H, t: 0, a: 0 });
              }
            } else if (f.type === 'bathtub') {
              lb(0, 0, A, Dp, 0.55, white, 0, { r: 0.3 });
              lb(0, 0, A - 0.12, Dp - 0.12, 0.004, 0xdbe4ee, 0.55, { r: 0.2 });
              if (f.water !== false) lb(0, 0, A - 0.14, Dp - 0.14, 0.004, 0x7dd3fc, 0.556, { r: 0.05, m: 0.1, op: 0.7 });
              const [tx, tz] = at(-A / 2 + 0.03, 0); cyl(rm, tx, tz, 0.015, 0.14, 0xcbd5e1, 0.55, chrome); // tap at one end
            } else if (f.type === 'washer') {
              const H = N(f.h, 0.85), r = Math.min(A, H) * 0.3;
              lb(0, 0, A, Dp, H, white, 0, { r: 0.35 });
              lb(0, Dp / 2 + 0.004, A * 0.92, 0.008, 0.11, 0xe5e7eb, H - 0.15, { r: 0.4 }); // control panel
              lc(A * 0.3, Dp / 2 + 0.01, 0.03, 0.02, 0x94a3b8, H - 0.12, chrome); // dial (laid flat as a knob)
              // the door: a ring and a glass, facing out, and the drum behind it that turns while it runs
              const [dx2, dz2] = at(0, Dp / 2 + 0.012), dy = (H - 0.15) / 2 + 0.03;
              const g = new T.Group(); const [gx, gz] = this.w(dx2, dz2); g.position.set(gx, dy, gz); g.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[fc]; this._at().add(g);
              const disc = (rad, th, col, o, zz) => { const m = new T.Mesh(new T.CylinderGeometry(rad, rad, th, 32), M(col, o)); m.rotation.x = Math.PI / 2; m.position.z = zz; m.userData.room = rm; g.add(m); this.pick.push(m); return tag(m); };
              disc(r * 1.12, 0.02, 0xcbd5e1, chrome, 0); disc(r, 0.022, 0x1e293b, { r: 0.1, m: 0.3 }, 0.002);
              const drum = new T.Group(); drum.position.z = 0.013; g.add(drum);
              for (const [k, col] of [[0, 0x60a5fa], [2.1, 0xf472b6], [4.2, 0xfbbf24]]) { const b = new T.Mesh(new T.BoxGeometry(r * 0.55, r * 0.35, 0.004), M(col, { r: 0.9 })); b.position.set(Math.cos(k) * r * 0.42, Math.sin(k) * r * 0.42, 0); b.rotation.z = k; drum.add(b); }
              this.washers.push({ drum, entity: ent, sp: 0 });
            } else { // towel warmer: two posts and rails that glow warm while it is on
              const y0 = N(f.y, 0.4), H = Math.min(0.9, WALL_H - y0 - 0.05), mat = new T.MeshStandardMaterial({ color: C(f.color, 0xe5e7eb), roughness: 0.25, metalness: 0.7, emissive: 0xff8a3d, emissiveIntensity: 0 });
              for (const s2 of [-1, 1]) { const [px, pz] = at(s2 * (A / 2 - 0.015), 0); add(rm, new T.CylinderGeometry(0.014, 0.014, H, 12), mat, px, y0 + H / 2, pz); }
              let first = null; const n = Math.max(3, Math.round(H / 0.12));
              for (let k = 0; k < n; k++) { const [px, pz] = at(0, 0); const m = add(rm, new T.BoxGeometry(ew ? 0.018 : A - 0.03, 0.018, ew ? A - 0.03 : 0.018), mat, px, y0 + 0.05 + k * (H - 0.1) / (n - 1), pz); first ||= m; }
              if (ent) this.lamps.push({ m: first, glow: floorGlow(...at(0, 0.3), 0.5, 0xff8a3d), entity: ent, t: 0, col: new T.Color(0xff8a3d) });
            }
            break;
          }
          case 'ac': { // an AC unit: on a wall (`style: wall`), in the ceiling (`cassette`) or standing on the floor (`floor`); `facing` = where it blows
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', st = f.style || 'wall', col = C(f.color, 0xf8fafc);
            const dx = fc === 'e' ? 1 : fc === 'w' ? -1 : 0, dz = fc === 's' ? 1 : fc === 'n' ? -1 : 0, ew = !!dx;
            const mat = new T.MeshStandardMaterial({ color: col, roughness: 0.4, emissive: 0x60a5fa, emissiveIntensity: 0 });
            let unit, y;
            if (st === 'cassette') { y = WALL_H - 0.02; unit = add(rm, new T.BoxGeometry(0.6, 0.05, 0.6), mat, x, y - 0.025, z); box(rm, x, z, 0.36, 0.36, 0.006, 0x94a3b8, y - 0.056, { r: 0.6 }); }
            else if (st === 'floor') {
              const H = Math.min(1.2, WALL_H * 0.85); y = H * 0.82;
              unit = add(rm, new T.BoxGeometry(ew ? 0.3 : 0.45, H, ew ? 0.45 : 0.3), mat, x, H / 2, z);
              box(rm, x + dx * 0.152, z + dz * 0.152, ew ? 0.006 : 0.36, ew ? 0.36 : 0.006, H * 0.18, 0x334155, H * 0.72, { r: 0.5 }); // the outlet
            } else {
              y = N(f.y, WALL_H - 0.23);
              unit = add(rm, new T.BoxGeometry(ew ? 0.22 : 0.9, 0.28, ew ? 0.9 : 0.22), mat, x, y + 0.07, z);
              box(rm, x + dx * 0.111, z + dz * 0.111, ew ? 0.006 : 0.8, ew ? 0.8 : 0.006, 0.05, 0xcbd5e1, y - 0.03, { r: 0.5 }); // the flap
            }
            const n = 60, pos = new Float32Array(n * 3), life = new Float32Array(n); for (let i = 0; i < n; i++) life[i] = Math.random();
            const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
            const pts = new T.Points(g, new T.PointsMaterial({ color: 0x93c5fd, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
            this._at().add(pts);
            const [cx, cz] = this.w(x, z);
            this.acs.push({ ent: f.entities.find(e => e.startsWith('climate.')) || f.entities[0] || null, unit, pts, life, cx, cz, dx, dz, y, cas: st === 'cassette', on: 0, onT: 0 });
            break;
          }
          case 'lamp': { // floor lamp: the shade glows (in the light's colour) while its light is on
            const x = N(f.x, 0), z = N(f.z, 0), hh = N(f.h, 1.5), sc = N(f.size, 1), metal = C(f.color, 0x334155);
            cyl(rm, x, z, 0.16 * sc, 0.03, metal, 0, { r: 0.4, m: 0.5 });
            cyl(rm, x, z, 0.018, hh - 0.25 * sc, metal, 0.03, { r: 0.4, m: 0.5 });
            const mat = new T.MeshStandardMaterial({ color: C(f.shade, 0xf5e6c8), emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.8, side: T.DoubleSide });
            const m = add(rm, new T.CylinderGeometry(0.12 * sc, 0.2 * sc, 0.25 * sc, 24, 1, true), mat, x, hh - 0.125 * sc, z);
            this.lamps.push({ m, glow: floorGlow(x, z, 0.9 * sc, 0xffc27a), entity: f.entities[0] || null, t: 0, col: new T.Color(0xffc27a) });
            break;
          }
          case 'fan': { // ceiling fan: the blades turn while the fan is on
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 2.1), rad = N(f.radius, 0.6);
            cyl(rm, x, z, 0.07, 0.08, C(f.color, 0xe5e7eb), y, { r: 0.5 });
            const g = new T.Group(); const [gx, gz] = this.w(x, z); g.position.set(gx, y + 0.03, gz); this._at().add(g);
            const bm = M(C(f.blade, 0x8b6b45), { r: 0.6 });
            for (let i = 0; i < 4; i++) {
              const a = i * Math.PI / 2, b = new T.Mesh(new T.BoxGeometry(rad, 0.015, 0.12), bm);
              b.position.set(Math.cos(a) * rad / 2, 0, Math.sin(a) * rad / 2); b.rotation.y = -a; b.userData.room = rm;
              g.add(b); this.pick.push(b); tag(b);
            }
            this.fans.push({ g, entity: f.entities[0] || null, on: 0, sp: 0 });
            break;
          }
          case 'marker': { // a device with no furniture of its own (a sensor, a plug, a speaker): a dot that lights up while it is on
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 0.9), col = C(f.color, 0x2dd4bf);
            cyl(rm, x, z, 0.012, y, 0x64748b, 0, { r: 0.5 });
            const m = add(rm, new T.SphereGeometry(0.09, 20, 14), new T.MeshStandardMaterial({ color: 0x1f2937, emissive: col, emissiveIntensity: 0.15, roughness: 0.4 }), x, y, z);
            this.markers.push({ m, glow: floorGlow(x, z, 0.45, col), entity: f.entities[0] || null, t: 0 });
            break;
          }
          case 'blinds': { // a blind over a window: rolls down as the cover closes (follows its position)
            const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 1), z1 = N(f.z1, 0), alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
            const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), y0 = N(f.y, 0.75), hh = N(f.h, Math.max(0.3, WALL_H - y0 - 0.04));
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            box(rm, cx, cz, alongX ? len + 0.04 : 0.09, alongX ? 0.09 : len + 0.04, 0.06, C(f.color, 0x475569), y0 + hh, { r: 0.5 });
            const geo = new T.BoxGeometry(alongX ? len : 0.025, hh, alongX ? 0.025 : len); geo.translate(0, -hh / 2, 0);
            const m = add(rm, geo, M(C(f.shade, 0xe7e5e4), { r: 0.9 }), cx, y0 + hh, cz, false);
            m.scale.y = 0.04; this.blinds.push({ m, entity: f.entities[0] || null, t: 0.04, c: 0.04 });
            break;
          }
          case 'vacuum': { // a robot vacuum: drives around its room while it cleans, back to its dock after
            // `facing`: the side the robot leaves its dock to (s by default); the dock stands against the opposite side
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ns = fc === 'n' || fc === 's';
            const [ox, oz] = { s: [0, 0.24], n: [0, -0.24], e: [0.24, 0], w: [-0.24, 0] }[fc] || [0, 0.24];
            box(rm, x, z, ns ? 0.36 : 0.14, ns ? 0.14 : 0.36, 0.1, 0x1f2937, 0, { r: 0.4 }); // the dock
            const g = new T.Group(); const [gx, gz] = this.w(x + ox, z + oz); g.position.set(gx, 0, gz); this._at().add(g);
            const body = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.08, 28), M(C(f.color, 0xe5e7eb), { r: 0.35 })); body.position.y = 0.05; body.castShadow = true;
            const led = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.02, 16), new T.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x2dd4bf, emissiveIntensity: 0.2 })); led.position.y = 0.1;
            body.userData.room = rm; led.userData.room = rm; g.add(body, led); this.pick.push(body); tag(body);
            this.vacuums.push({ g, led, entity: f.entities[0] || null, dock: [gx, gz], room: rm, st: 'docked', goal: null });
            break;
          }
          case 'car': { // a parked car in its painted bay; with a sensor it is there only while the car is parked
            const x = N(f.x, 0), z = N(f.z, 0), L = N(f.length, 4.3), Wd = N(f.width, 1.8), face = f.facing || 'n';
            const ang = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 }[face] ?? 0;
            // the bay: painted lines on the floor, always there
            const bay = new T.Group(); const [bx, bz] = this.w(x, z); bay.position.set(bx, 0.012, bz); bay.rotation.y = ang; this._at().add(bay);
            const paint = M(0xe2e8f0, { r: 0.9 }), bw = Wd + 0.9, bl = L + 0.9;
            for (const [px, pz, sw, sd] of [[-bw / 2, 0, 0.08, bl], [bw / 2, 0, 0.08, bl], [0, bl / 2, bw + 0.08, 0.08]]) { const pm = new T.Mesh(new T.BoxGeometry(sw, 0.01, sd), paint); pm.position.set(px, 0, pz); pm.receiveShadow = true; bay.add(pm); }
            // the car, built facing -z (north) and turned
            const car = new T.Group(); car.position.set(bx, 0, bz); car.rotation.y = ang; this._at().add(car);
            const body = M(C(f.color, 0x2563eb), { r: 0.35, m: 0.45 }), glass = M(0x0f172a, { r: 0.1, m: 0.6 }), tyre = M(0x111827, { r: 0.9 });
            const part = (geo, mat, px, py, pz) => { const m = new T.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; m.userData.room = rm; car.add(m); this.pick.push(m); tag(m); return m; };
            part(new T.BoxGeometry(Wd, 0.5, L), body, 0, 0.5, 0);
            part(new T.BoxGeometry(Wd * 0.86, 0.42, L * 0.48), glass, 0, 0.96, L * 0.06);
            part(new T.BoxGeometry(Wd * 0.88, 0.05, L * 0.5), body, 0, 1.19, L * 0.06);
            for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) { const w = part(new T.CylinderGeometry(0.33, 0.33, 0.22, 20), tyre, sx2 * (Wd / 2 - 0.05), 0.33, sz2 * L * 0.32); w.rotation.z = Math.PI / 2; }
            const lamps = [];
            for (const sx2 of [-1, 1]) {
              lamps.push(part(new T.BoxGeometry(0.34, 0.1, 0.04), new T.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xfff7d6, emissiveIntensity: 0.4 }), sx2 * Wd * 0.32, 0.6, -L / 2 - 0.01));
              part(new T.BoxGeometry(0.34, 0.1, 0.04), new T.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xef4444, emissiveIntensity: 0.5 }), sx2 * Wd * 0.32, 0.6, L / 2 + 0.01);
            }
            this.cars.push({ g: car, entity: f.entities[0] || null, state: f.parked_state, t: 1, c: null, slide: 0, dir: [Math.sin(ang), Math.cos(ang)], base: [bx, bz] });
            break;
          }
          case 'tree': { // trunk and a round crown
            const x = N(f.x, 0), z = N(f.z, 0), sc = N(f.size, 1);
            cyl(rm, x, z, 0.1 * sc, 1.1 * sc, C(f.trunk, 0x6b4a2b), 0, { r: 0.9 });
            ball(rm, x, z, 0.75 * sc, C(f.color, 0x2f6b3a), 1.55 * sc);
            ball(rm, x + 0.35 * sc, z - 0.2 * sc, 0.5 * sc, 0x3f8a4c, 1.35 * sc);
            ball(rm, x - 0.3 * sc, z + 0.25 * sc, 0.45 * sc, 0x356f40, 1.25 * sc);
            break;
          }
          case 'hedge': ext(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 1), N(f.z1, 0.4), N(f.h, 0.9), C(f.color, 0x2f6b3a), 0, { r: 1 }); break;
          case 'pool': { // water with a white edge
            const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 3), z1 = N(f.z1, 2), e = 0.18;
            for (const [a, b, c, d] of [[x0, z0, x1, z0 + e], [x0, z1 - e, x1, z1], [x0, z0 + e, x0 + e, z1 - e], [x1 - e, z0 + e, x1, z1 - e]]) ext(rm, a, b, c, d, 0.08, 0xf1f5f9, 0, { r: 0.5 });
            const water = ext(rm, x0 + e, z0 + e, x1 - e, z1 - e, 0.05, C(f.color, 0x22d3ee), 0, { r: 0.08, m: 0.1, op: 0.85, e: 0x0e7490, ei: 0.35 });
            water.castShadow = false; this.pools.push(water);
            break;
          }
          case 'sprinkler': { // a garden sprinkler: sprays water while its valve / switch is on
            const x = N(f.x, 0), z = N(f.z, 0), rad = N(f.radius, 2);
            cyl(rm, x, z, 0.06, 0.18, 0x334155, 0, { r: 0.5, m: 0.4 });
            const NP = 140, pos = new Float32Array(NP * 3), life = new Float32Array(NP), ang2 = new Float32Array(NP);
            for (let i = 0; i < NP; i++) { life[i] = Math.random(); ang2[i] = Math.random() * Math.PI * 2; }
            const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
            const pts = new T.Points(geo, new T.PointsMaterial({ color: 0x7dd3fc, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
            this._at().add(pts);
            const [cx2, cz2] = this.w(x, z);
            this.sprinklers.push({ pts, life, ang: ang2, cx: cx2, cz: cz2, rad, entity: f.entities[0] || null, on: 0, onT: 0 });
            break;
          }
          default: console.warn('sweet-home: unknown furniture type', f.type);
        }
      } catch (err) { console.warn('sweet-home: furniture', f, err); }
      this.fmov[f.idx] = this._at().children.slice(before); curIdx = null;
      if (cur && cur.meshes.length) { // where its badge floats: above the middle of the piece
        const bb = new T.Box3(); for (const m of cur.meshes) { m.updateWorldMatrix(true, false); bb.expandByObject(m); }
        const c = bb.getCenter(new T.Vector3());
        this.fpieces.push({ ...cur, x: c.x, z: c.z, y: bb.max.y + 0.15, dyn: f.type === 'vacuum' ? this.vacuums[this.vacuums.length - 1]?.g : null });
      }
    }
    this._furnBadges();
  }

  // stairs inside x0..x1 × z0..z1; axis = direction the steps climb; mode: up | down | split (one flight up, one down)
  _stairs(f) {
    const T = this.T, N = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));
    const stone = new T.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.7 }), edge = new T.MeshStandardMaterial({ color: 0x8b7f6e, roughness: 0.6 });
    // Below the floor (a flight going down, its stairwell) is drawn only where you look into it through the hole in the
    // floor: the hole writes 1 into the stencil buffer, and those parts draw only where the stencil is 1. From the side
    // or from below nothing hangs out of the house.
    const inWell = m => Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: T.EqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp });
    const stoneDown = inWell(stone.clone()), edgeDown = inWell(edge.clone());
    const rail = new T.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 2), z1 = N(f.z1, 1), alongX = (f.axis || 'x') === 'x', mode = f.mode || 'up';
    const n = N(f.steps, 10), len = alongX ? x1 - x0 : z1 - z0, wid = alongX ? z1 - z0 : x1 - x0, run = len / n, rise = N(f.rise, 0.13);
    const room = f.room || null;
    const step = (along, a0, a1, y) => { // along: position along the climb; a0..a1: across
      const geo = alongX ? new T.BoxGeometry(run, 0.16, a1 - a0) : new T.BoxGeometry(a1 - a0, 0.16, run);
      const below = y < 0, s = new T.Mesh(geo, below ? stoneDown : stone); if (below) s.renderOrder = 2; const [cx, cz] = alongX ? this.w(along, (a0 + a1) / 2) : this.w((a0 + a1) / 2, along);
      s.position.set(cx, y, cz); s.castShadow = s.receiveShadow = true; s.userData.room = room; if (f.idx != null) s.userData.fi = f.idx; this._at().add(s); this.pick.push(s);
      const nose = new T.Mesh(alongX ? new T.BoxGeometry(0.03, 0.16, a1 - a0) : new T.BoxGeometry(a1 - a0, 0.16, 0.03), below ? edgeDown : edge); if (below) nose.renderOrder = 2;
      nose.position.set(cx - (alongX ? run / 2 : 0), y, cz - (alongX ? 0 : run / 2)); this._at().add(nose);
    };
    const a0 = alongX ? z0 : x0, a1 = alongX ? z1 : x1, mid = (a0 + a1) / 2, s0 = alongX ? x0 : z0;
    for (let i = 0; i < n; i++) {
      const p = s0 + run * (i + 0.5);
      if (mode === 'split') { step(p, a0 + 0.1, mid - 0.07, 0.08 + i * rise); step(p, mid + 0.07, a1 - 0.1, -0.08 - i * rise); }
      else step(p, a0 + 0.05, a1 - 0.05, mode === 'down' ? -0.08 - i * rise : 0.08 + i * rise);
    }
    if (mode === 'split') {
      const [hx, hz] = alongX ? this.w(s0 + len / 2, mid) : this.w(mid, s0 + len / 2);
      const hr = new T.Mesh(alongX ? new T.BoxGeometry(len, 0.05, 0.05) : new T.BoxGeometry(0.05, 0.05, len), rail); hr.position.set(hx, 0.95, hz); this._at().add(hr);
      for (let i = 0; i <= 4; i++) { const q = s0 + len * i / 4; const [px, pz] = alongX ? this.w(q, mid) : this.w(mid, q); const pst = new T.Mesh(new T.BoxGeometry(0.04, 0.95, 0.04), rail); pst.position.set(px, 0.475, pz); this._at().add(pst); }
    }
    // the stairwell of a flight going down: an open dark shaft under the hole in the floor
    if (f.well) {
      const [wx0, wz0, wx1, wz1] = f.well, depth = n * rise + 0.25;
      const shaft = new T.Mesh(new T.BoxGeometry(wx1 - wx0, depth, wz1 - wz0), inWell(new T.MeshStandardMaterial({ color: 0x0b1020, roughness: 1, side: T.BackSide })));
      const [sxw, szw] = this.w((wx0 + wx1) / 2, (wz0 + wz1) / 2); shaft.position.set(sxw, -depth / 2, szw); shaft.renderOrder = 2; shaft.userData.room = room; if (f.idx != null) shaft.userData.fi = f.idx;
      this._at().add(shaft);
      // the opening: invisible, it only marks the stencil where the hole in the floor is seen
      const hole = new T.Mesh(new T.PlaneGeometry(wx1 - wx0, wz1 - wz0), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: T.AlwaysStencilFunc, stencilZPass: T.ReplaceStencilOp }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(sxw, 0.001, szw); hole.renderOrder = 1; this._at().add(hole);
    }
    // arrows on the flights: teal going up, amber going down
    const arrow = (across, y, up) => {
      const sh = new T.Shape(); sh.moveTo(0, 0.22); sh.lineTo(0.16, -0.06); sh.lineTo(0.06, -0.06); sh.lineTo(0.06, -0.22); sh.lineTo(-0.06, -0.22); sh.lineTo(-0.06, -0.06); sh.lineTo(-0.16, -0.06); sh.closePath();
      const mat = new T.MeshBasicMaterial({ color: up ? 0x2dd4bf : 0xfbbf24, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
      const m = new T.Mesh(new T.ShapeGeometry(sh), up ? mat : inWell(mat));
      const along = s0 + len / 2, [ax, az] = alongX ? this.w(along, across) : this.w(across, along);
      m.rotation.x = -Math.PI / 2; // lying flat; the shape's +y points along -z
      // both point the way you walk: up the rising flight, down the sinking one (both run along +x / +z)
      m.rotation.z = alongX ? -Math.PI / 2 : Math.PI;
      m.position.set(ax, y + 0.1, az); m.renderOrder = up ? 2 : 3; this._at().add(m);
    };
    const midY = (n / 2) * rise;
    if (mode === 'split') { arrow((a0 + mid) / 2, 0.08 + midY, true); arrow((mid + a1) / 2, -0.08 - midY, false); }
    else arrow(mid, mode === 'down' ? -0.08 - midY : 0.08 + midY, mode !== 'down');
    // motion dots: one per motion sensor of the stairs, spread along the flight
    const motion = f.motion ? [].concat(f.motion) : (ROOM[room]?.motion || []);
    motion.forEach((id, i) => {
      const t = (i + 0.5) / motion.length, along = s0 + len * t, y = mode === 'down' ? -t * n * rise : t * n * rise * (mode === 'split' && i % 2 ? -1 : 1);
      const across = mode === 'split' ? (i % 2 ? (mid + a1) / 2 : (a0 + mid) / 2) : mid;
      const m = new T.Mesh(new T.SphereGeometry(0.1, 16, 16), new T.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.15 }));
      const [cx, cz] = alongX ? this.w(along, across) : this.w(across, along); m.position.set(cx, y + 0.3, cz); this._at().add(m);
      this.stairDots.push({ id, m });
    });
  }

  // a 3D file (.glb / .gltf) instead of the drawn walls and furniture; rooms (rectangles) still give the labels, lights and taps
  async _buildGltf() {
    const T = this.T, G = MODEL.gltf;
    try {
      const gltf = await new GLTFLoader().loadAsync(G.url);
      const root = gltf.scene; root.scale.setScalar(G.scale || 1); root.rotation.y = (G.rotation || 0) * Math.PI / 180;
      const off = G.offset || [0, 0, 0]; root.position.set((off[0] || 0) - CX, off[1] || 0, (off[2] || 0) - CZ);
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const rid = G.rooms[o.name] || G.rooms[o.parent?.name] || (ROOM[o.name] ? o.name : ROOM[o.parent?.name] ? o.parent.name : null); if (rid) { o.userData.room = rid; this.pick.push(o); } } });
      this.scene.add(root); this.renderer.shadowMap.needsUpdate = true; this._dirty = true;
    } catch (err) { console.warn('sweet-home: could not load the 3D file', G.url, err); this.card._toast?.('Could not load the 3D file', true); }
  }

  // the TV screen's "on" picture: a soft lit gradient with a horizon, drawn once
  _tvIdlePic() {
    if (this._tvIdle) return this._tvIdle;
    const T = this.T, cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 180); sky.addColorStop(0, '#1e3a8a'); sky.addColorStop(0.55, '#7c3aed'); sky.addColorStop(1, '#f472b6');
    g.fillStyle = sky; g.fillRect(0, 0, 320, 180);
    const sun = g.createRadialGradient(220, 110, 4, 220, 110, 70); sun.addColorStop(0, 'rgba(254,240,138,.95)'); sun.addColorStop(1, 'rgba(254,240,138,0)');
    g.fillStyle = sun; g.fillRect(0, 0, 320, 180);
    g.fillStyle = '#1e1b4b'; g.beginPath(); g.moveTo(0, 150); g.quadraticCurveTo(80, 112, 160, 140); g.quadraticCurveTo(240, 165, 320, 128); g.lineTo(320, 180); g.lineTo(0, 180); g.fill();
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return (this._tvIdle = t);
  }
  // the picture for a TV: its media player's cover art (entity_picture, from Home Assistant itself) or the "on" picture.
  // The art is cropped to the screen's shape; only Home Assistant's own URLs are loaded (same origin).
  _tvPicture(tv, url) {
    if (!tv.scr) return;
    const own = typeof url === 'string' && url.startsWith('/') ? url : null;
    if (own === tv.pic) return; tv.pic = own;
    if (!own) { tv.scr.map = this._tvIdlePic(); tv.scr.needsUpdate = true; this._dirty = true; return; }
    const img = new Image();
    img.onload = () => {
      if (tv.pic !== own) return; // the picture changed meanwhile
      const W = 320, H = Math.max(90, Math.round(W / (tv.aspect || 16 / 9))), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), s = Math.max(W / img.width, H / img.height), iw = img.width * s, ih = img.height * s;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      const t = new this.T.CanvasTexture(cv); t.colorSpace = this.T.SRGBColorSpace;
      if (tv.scr.map && tv.scr.map !== this._tvIdle) tv.scr.map.dispose();
      tv.scr.map = t; tv.scr.needsUpdate = true; this._dirty = true;
    };
    img.onerror = () => { if (tv.pic === own) { tv.scr.map = this._tvIdlePic(); tv.scr.needsUpdate = true; this._dirty = true; } };
    img.src = own;
  }
  _buildDoors() {
    const T = this.T;
    for (const d of DOORS) {
      this._cl = d.level ?? 0;
      const pivot = new T.Group(); const [px, pz] = this.w(d.x, d.z); pivot.position.set(px, 0, pz);
      if (d.axis === 'a') { // on a slanted wall: a base turned along the wall, the leaf swings inside it
        const base = new T.Group(); base.position.copy(pivot.position); base.rotation.y = -Math.atan2(d.vz, d.vx); pivot.position.set(0, 0, 0); base.add(pivot); this._at().add(base);
        const mat = new T.MeshStandardMaterial({ color: d.main ? 0x5b3a1e : 0x6b4423, roughness: 0.5, emissive: 0xff3355, emissiveIntensity: 0 });
        if (d.gate) { pivot.add(this._gateLeaf(d, mat)); this.doors.push({ d, pivot, mat, a: 0, ang: -1.35 * d.side }); continue; }
        const dh = Math.max(0.5, WALL_H - 0.08), panel = new T.Mesh(new T.BoxGeometry(d.w - 0.04, dh, 0.06), mat); panel.castShadow = true;
        panel.position.set(d.w / 2, dh / 2, 0); pivot.add(panel);
        this.doors.push({ d, pivot, mat, a: 0, ang: -1.35 * d.side }); continue;
      }
      const mat = new T.MeshStandardMaterial({ color: d.main ? 0x5b3a1e : 0x6b4423, roughness: 0.5, emissive: 0xff3355, emissiveIntensity: 0 });
      if (d.gate) { // a gate: its leaf turned along x / z, swinging on the same hinge as a door
        const g = this._gateLeaf(d, mat); if (d.axis === 'z') g.rotation.y = -Math.PI / 2 * d.dir; else if (d.dir < 0) g.rotation.y = Math.PI;
        pivot.add(g); this._at().add(pivot); this.doors.push({ d, pivot, mat, a: 0, ang: -1.35 * d.side }); continue;
      }
      const dh = Math.max(0.5, WALL_H - 0.08);
      const geo = d.axis === 'z' ? new T.BoxGeometry(0.06, dh, d.w - 0.04) : new T.BoxGeometry(d.w - 0.04, dh, 0.06);
      const panel = new T.Mesh(geo, mat); panel.castShadow = true;
      if (d.axis === 'z') panel.position.set(0, dh / 2, d.dir * d.w / 2); else panel.position.set(d.dir * d.w / 2, dh / 2, 0);
      pivot.add(panel); this._at().add(pivot);
      // open angle: the leaf (from → to) swings to the side the floor plan draws its arc on: (-vz, vx) for side 1, the other side for -1
      // (the same as on a slanted wall). A -y rotation turns (vx, vz) towards (-vz, vx), whichever way the door was drawn.
      const ang = -1.35 * d.side;
      this.doors.push({ d, pivot, mat, a: 0, ang });
    }
    // dollhouse: a door in a wall that gets cut down is cut down with it
    for (const D of this.doors) {
      const [px, pz] = this.w(D.d.x, D.d.z), l = D.d.level ?? 0;
      const C = this.cuts.find(C => {
        if (C.l !== l) return false;
        const [ax, az] = C.a, [bx, bz] = C.b, vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, u = clamp(((px - ax) * vx + (pz - az) * vz) / L2, 0, 1);
        return Math.hypot(ax + vx * u - px, az + vz * u - pz) < 0.15;
      });
      if (C && !D.d.gate) C.doors.push(D.pivot.parent?.isGroup && D.d.axis === 'a' ? D.pivot.parent : D.pivot);
    }
    // smart-lock badges (house.lock_badges): green while locked, pulsing red while unlocked
    this.badges = BADGES.map(b => {
      const m = new this.T.Mesh(b.axis === 'x' ? new this.T.BoxGeometry(0.13, 0.22, 0.05) : new this.T.BoxGeometry(0.05, 0.22, 0.13), new this.T.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.5, emissive: 0x34d399, emissiveIntensity: 0 }));
      const [bx, bz] = this.w(b.x, b.z); m.position.set(bx, b.y, bz); this._cl = b.level ?? 0; this._at().add(m);
      // its name above it: tap = the lock's details; while editing, a pencil renames the badge
      let el = null;
      if (b.label) { el = document.createElement('div'); el.className = 'blbl'; el.dataset.act = 'more'; el.dataset.id = b.lock; this.lblLayer.appendChild(el); }
      return { b, m, t: 0, el, x: bx, z: bz };
    });
    // (the floor glow under the badge was removed on request, v1.12.26: the badge alone shows the state)
  }

  // a gate's leaf, from its hinge (0) along +x to its width: a frame of two rails and two stiles, with bars between
  _gateLeaf(d, mat) {
    const T = this.T, g = new T.Group(), w = d.w - 0.04, h = Math.min(WALL_H - 0.08, d.gh ?? 1.25);
    const bar = (x, y, bw, bh, bd = 0.05) => { const m = new T.Mesh(new T.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); };
    bar(w / 2, 0.12, w, 0.06); bar(w / 2, h - 0.03, w, 0.06); bar(0.03, h / 2, 0.06, h); bar(w - 0.03, h / 2, 0.06, h);
    const n = Math.max(2, Math.round(w / 0.13));
    for (let i = 1; i < n; i++) bar(i * w / n, h / 2 + 0.04, 0.025, h - 0.14, 0.025);
    return g;
  }

  _buildACs() {
    const T = this.T;
    for (const r of ROOMS) {
      if (!r.ac) continue;
      this._cl = r.level;
      const { x, z, dx, dz } = r.ac;
      const unit = new T.Mesh(new T.BoxGeometry(dx ? 0.22 : 0.9, 0.28, dx ? 0.9 : 0.22), new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, emissive: 0x60a5fa, emissiveIntensity: 0 }));
      const [cx, cz] = this.w(x, z); unit.position.set(cx, 1.12, cz); unit.castShadow = true; this._at().add(unit);
      const N = 60; const pos = new Float32Array(N * 3); const life = new Float32Array(N);
      for (let i = 0; i < N; i++) life[i] = Math.random();
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const pts = new T.Points(g, new T.PointsMaterial({ color: 0x93c5fd, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      this._at().add(pts);
      this.acs.push({ ent: r.climate, unit, pts, life, cx, cz, dx, dz, y: 1.05, on: 0, onT: 0 });
    }
  }

  _labels() {
    this.lbls = {};
    for (const r of ROOMS) {
      const el = document.createElement('div'); el.className = 'lbl'; el.dataset.act = 'room'; el.dataset.room = r.id;
      this.lblLayer.appendChild(el); this.lbls[r.id] = el;
    }
  }

  // small badges over furniture that has entities: a dot, or the entity's icon while it is on / its room is open
  _furnBadges() {
    for (const P of this.fpieces) {
      if (P.f.badge === false) continue;
      const el = document.createElement('div'); el.className = 'fb'; el.dataset.act = 'furn'; el.dataset.idx = P.idx; el.dataset.id = P.f.entities[0];
      el.title = furnName(P.f); this.lblLayer.appendChild(el); P.el = el;
    }
  }

  _input() {
    const T = this.T; const el = this.cv; const ptrs = new Map(); let drag = null; let pinch = null;
    const ray = new T.Raycaster(); const v2 = new T.Vector2();
    const pickAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const hit = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object)); return hit?.object.userData.room || null;
    };
    // a furniture piece with entities under the pointer (its index), or null
    const furnAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const u = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object))?.object.userData; return u && u.furn != null ? u.furn : null;
    };
    // arrange mode: a piece under the finger is dragged across the floor instead of turning the view
    const fiAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const u = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object))?.object.userData; return u && u.fi != null ? u.fi : null;
    };
    const floorPt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    };
    let mv = null;
    el.addEventListener('pointerdown', e => {
      if (!this.arrange || !e.isPrimary || (this.builder && this.card._bPiece)) return; // Build mode with a piece picked: the tap places it
      const fi = fiAt(e.clientX, e.clientY), p0 = fi != null && floorPt(e.clientX, e.clientY); if (fi == null || !p0) return;
      const objs = this.fmov[fi] || [];
      mv = { fi, p0, objs, orig: objs.map(o => o.position.clone()), dx: 0, dz: 0 };
      e.stopImmediatePropagation(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      el.style.cursor = 'grabbing'; this.lastInput = performance.now();
    }, true);
    el.addEventListener('pointermove', e => {
      if (!mv) return; e.stopImmediatePropagation();
      const p = floorPt(e.clientX, e.clientY); if (!p) return;
      const snap = v => Math.round(v / 0.1) * 0.1; mv.dx = snap(p.x - mv.p0.x); mv.dz = snap(p.z - mv.p0.z);
      mv.objs.forEach((o, i) => { o.position.x = mv.orig[i].x + mv.dx; o.position.z = mv.orig[i].z + mv.dz; });
      this.renderer.shadowMap.needsUpdate = true; this.lastInput = performance.now(); this._dirty = true;
    }, true);
    const mvEnd = e => {
      if (!mv) return; e.stopImmediatePropagation(); const m = mv; mv = null; el.style.cursor = '';
      if (Math.abs(m.dx) < 0.05 && Math.abs(m.dz) < 0.05) { if (this.builder) this.card._bSelect(m.fi); return; } // Build mode: a tap picks the piece
      const undo = () => { m.objs.forEach((o, i) => o.position.copy(m.orig[i])); this.renderer.shadowMap.needsUpdate = true; this._dirty = true; };
      this.card._arrangeMove(FURN[m.fi], Math.round(m.dx * 100) / 100, Math.round(m.dz * 100) / 100, undo);
    };
    el.addEventListener('pointerup', mvEnd, true); el.addEventListener('pointercancel', e => { if (mv) { mv.dx = mv.dz = 0; mvEnd(e); } }, true);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      // a new first finger means no other pointer is really down: drop any that never sent pointerup
      // (otherwise a stale one turned every later tap into a "pinch" and taps on the canvas did nothing)
      if (e.isPrimary) { ptrs.clear(); pinch = null; drag = null; }
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastInput = performance.now();
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), pan: e.button === 2 || e.shiftKey, moving: false, far: 0 };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.goal.radius, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; }
    });
    el.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.goal.radius = clamp(pinch.r * pinch.d / d, SPAN * 0.5, SPAN * 4.5);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; this._pan(mx - pinch.mx, my - pinch.my); pinch.mx = mx; pinch.my = my;
        this.lastInput = performance.now(); return;
      }
      if (drag) {
        // a finger jitters a few px during a tap: ignore movement until it clearly becomes a drag
        drag.far = Math.max(drag.far, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
        if (!drag.moving) { if (drag.far < (e.pointerType === 'touch' ? 14 : 6)) return; drag.moving = true; }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) this._pan(dx, dy);
        else { this.goal.theta -= dx * 0.006; this.goal.phi = clamp(this.goal.phi - dy * 0.005, 0.12, 1.32); }
        this.lastInput = performance.now();
      } else if (e.pointerType === 'mouse') {
        const now = performance.now(); if (now - (this._lh || 0) < 50) return; this._lh = now;
        const r = pickAt(e.clientX, e.clientY), fi = furnAt(e.clientX, e.clientY);
        if (r !== this.hover || fi !== this.hoverF) { this.hover = r; this.hoverF = fi; el.style.cursor = r || fi != null ? 'pointer' : 'grab'; this.sync(); }
        if (this.arrange) el.style.cursor = fiAt(e.clientX, e.clientY) != null ? 'move' : 'grab';
      }
    });
    const up = e => {
      if (!ptrs.delete(e.pointerId)) return;
      if (drag && !drag.moving && e.type === 'pointerup' && performance.now() - drag.t < 800) {
        const fi = furnAt(drag.sx, drag.sy); this.card._cvTap = performance.now(); this.card.haptic('selection');
        if (fi != null) this.card._selectFurn(fi);
        else { const r = pickAt(drag.sx, drag.sy); this.card._select(r && r === this.sel ? null : r); }
      }
      if (ptrs.size < 2) pinch = null; drag = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('pointerleave', () => { this.hover = null; this.hoverF = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.goal.radius = clamp(this.goal.radius * (1 + Math.sign(e.deltaY) * 0.09), SPAN * 0.5, SPAN * 4.5); this.lastInput = performance.now(); }, { passive: false });
  }
  _pan(dx, dy) {
    const T = this.T; const k = this.orbit.radius * 0.0016;
    const fwd = new T.Vector3(Math.sin(this.orbit.theta), 0, Math.cos(this.orbit.theta));
    const right = new T.Vector3(fwd.z, 0, -fwd.x);
    this.goal.target.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k); // the house follows the fingers (was reversed until v1.12.13)
    this.goal.target.x = clamp(this.goal.target.x, -SPAN * 0.8, SPAN * 0.8); this.goal.target.z = clamp(this.goal.target.z, -SPAN * 0.8, SPAN * 0.8);
  }

  view(v) {
    this._dirty = true;
    this.vmode = v === 'top' ? 'top' : '3d';
    this.card._select(null);
    if (v === 'top') Object.assign(this.goal, { phi: 0.08, radius: this._topR(), theta: 0 });
    else Object.assign(this.goal, { phi: 0.92, radius: this.baseR || 27, theta: this.defTheta ?? -0.55 });
    this.goal.target.set(0, 0, 0);
    this._goFocus(false);
  }
  // Sweet Home 3D with `room`: its "home" view is that room, framed (3D or from above)
  _focusR() { const id = this.card?._focus; return id && this.rooms[id] ? this.rooms[id] : null; }
  _goFocus(snap) {
    const R = this._focusR(); if (!R) return false;
    const [x0, z0, x1, z1] = R.box, tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * this.cam.aspect;
    const hw = (x1 - x0) / 2 + 0.9, hd = (z1 - z0) / 2 + 0.9, top = this.vmode === 'top';
    this.goal.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.goal.radius = clamp(Math.max(hw / th, hd / tv) * (top ? 1 : 1.25), 4, SPAN * 3);
    if (top) Object.assign(this.goal, { phi: 0.08, theta: 0 });
    if (snap) { Object.assign(this.orbit, { theta: this.goal.theta, phi: this.goal.phi, radius: this.goal.radius }); this.orbit.target.copy(this.goal.target); }
    this._dirty = true; return true;
  }
  _topR() {
    const tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * this.cam.aspect;
    return clamp(Math.max((PLAN_D / 2 + 0.8) / tv, (PLAN_W / 2 + 0.8) / th), 8, SPAN * 5);
  }
  toggleSpin() { this.spin = !this.spin; this.lastInput = 0; return this.spin; }
  setMode(m) { this.mode = m; this._dirty = true; }
  select(id) {
    this._dirty = true;
    this.sel = id;
    if (id) { const R = this.rooms[id]; this.goal.target.set(R.cx, 0, R.cz); this.goal.radius = (this.baseR || 27) * (R.r.zoom || 0.62); this.goal.phi = Math.min(this.goal.phi, 0.95); }
    else if (this._goFocus(false)) { /* closed: back to the card's room */ }
    else if (this.vmode === 'top') { this.goal.target.set(0, 0, 0); this.goal.radius = this._topR(); }
    else { this.goal.target.set(0, 0, 0.5); this.goal.radius = this.baseR || 27; }
  }

  sync() {
    const c = this.card; const T = this.T;
    for (const id in this.rooms) {
      const R = this.rooms[id]; const r = R.r;
      R.motion = c.roomMotion(r) ? 1 : 0;
      if (r.lightFx) {
        const onOf = type => (r.lights || []).filter(l => (r.lightFx[l] || 'center') === type && c.v(l) === 'on');
        const level = id => { const b = c.s(id)?.attributes.brightness; return b ? 0.35 + 0.65 * b / 255 : 1; };
        const colOf = (id, dflt) => { const rc = c.s(id)?.attributes.rgb_color; return rc ? new T.Color(rc[0] / 255, rc[1] / 255, rc[2] / 255) : new T.Color(dflt); };
        const cen = onOf('center'), str = onOf('strip'), tv = onOf('tv'), spots = onOf('spots');
        R.spotT = spots.length ? level(spots[0]) : 0;
        R.litT = cen.length ? 1 : 0;
        R.stripT = str.length ? level(str[0]) : 0; if (str.length) R.stripCol.copy(colOf(str[0], 0xffb86b));
        R.tvT = tv.length ? level(tv[0]) : 0; if (tv.length) R.tvCol.copy(colOf(tv[0], 0x7dd3fc));
        R.anyLit = cen.length + str.length + tv.length + spots.length > 0 ? 1 : 0;
      } else { R.litT = c.roomLit(r) ? 1 : 0; R.anyLit = R.litT; }
      R.temp = r.temp ? c.n(r.temp) : null;
      const el = this.lbls[id]; const t = R.temp, h = r.hum ? c.n(r.hum) : null;
      const ac = r.climate && c.climOn(r.climate), acm = ac ? acMode(c.s(r.climate)) : '';
      // plugs in use: a charger drawing power → charging; any other plug that is on (and drawing power, when it has a sensor) → its own icon
      const plugOn = (r.plugs || []).filter(p => c.v(p.id) === 'on');
      const chg = plugOn.some(p => plugCharger(p) && (c.n(p.power) ?? 0) > 1.5);
      const pIcs = [...new Set(plugOn.filter(p => !plugCharger(p) && (!p.power || (c.n(p.power) ?? 0) > 1.5)).map(p => plugIcon(c, p)))].slice(0, 2).join(',');
      const lk = (r.locks || []).map(l => c.v(l)); const unl = lk.includes('unlocked'), lkd = lk.length && lk.every(s => s === 'locked');
      const dOpen = (r.doors || []).some(d => c.v(d) === 'on');
      const sig = [t, h, R.anyLit, R.motion, acm, chg, pIcs, unl, lkd, dOpen, this.mode, this.sel === id].join('|');
      if (el._sig !== sig) {
        el._sig = sig;
        el.className = `lbl ${R.anyLit ? 'lit' : ''} ${R.motion ? 'mo' : ''} ${this.sel === id ? 'sel' : ''} ${t == null ? 'nodata' : ''}`;
        el.innerHTML = `<b>${esc(r.name)}</b>${t != null ? `<span class="t" style="color:${rgb(tempRGB(t))}">${t.toFixed(1)}°</span>` : ''}${h != null ? `<span class="h">${Math.round(h)}%</span>` : ''}
          <span class="ics">${R.anyLit ? '<ha-icon icon="mdi:lightbulb-on"></ha-icon>' : ''}${ac ? acIcon(c.s(r.climate)) : ''}${R.motion ? '<ha-icon class="mo" icon="mdi:motion-sensor"></ha-icon>' : ''}${chg ? '<ha-icon class="chg" icon="mdi:battery-charging"></ha-icon>' : ''}${pIcs ? pIcs.split(',').map(i => `<ha-icon class="lplug" icon="${i}"></ha-icon>`).join('') : ''}${unl ? '<ha-icon class="unl" icon="mdi:lock-open-variant"></ha-icon>' : lkd ? '<ha-icon class="lkd" icon="mdi:lock"></ha-icon>' : ''}${dOpen ? '<ha-icon class="unl" icon="mdi:door-open"></ha-icon>' : ''}</span>`;
      }
    }
    for (const B of this.badges || []) {
      const v = c.v(B.b.lock); B.t = v === 'locked' ? 1 : v === 'unlocked' ? 2 : 0;
      if (B.el) {
        const nm = B.b.name || c.s(B.b.lock)?.attributes.friendly_name || B.b.lock, sig = `${nm}|${B.t}|${c._editing ? 1 : 0}`;
        if (B.el._sig !== sig) {
          B.el._sig = sig; B.el.className = `blbl ${B.t === 2 ? 'unl' : B.t === 1 ? 'lkd' : 'na'}`;
          B.el.innerHTML = `${ic(B.t === 2 ? 'mdi:lock-open-variant' : 'mdi:lock')}<span>${esc(nm)}</span>${c._editing && c._hass?.user?.is_admin ? `<button class="edit-only" data-act="rnbadge" data-i="${B.b.i}" title="${tr('Rename')}" aria-label="${tr('Rename')}">${ic('mdi:pencil-outline')}</button>` : ''}`;
        }
      }
    }
    // phones on chargers: 0 = plug off, 1 = plug on (idle), 2 = charging
    for (const P of this.chargers || []) P.t = !P.plug || c.v(P.plug) !== 'on' ? 0 : !P.power || !c.s(P.power) ? 2 : (c.n(P.power) ?? 0) > P.min ? 2 : 1; // no power reading: plug on = charging
    this.lockT = (this.badges || []).map(B => B.t).join(); this.phoneT = (this.chargers || []).map(P => P.t).join();
    for (const D of this.doors) D.openT = ['on', 'open', 'opening'].includes(c.v(D.d.id)) ? 1 : 0; // a contact sensor, or a gate's cover
    for (const A of this.acs) {
      const st = c.s(A.ent); A.onT = A.ent && c.climOn(A.ent) ? 1 : 0;
      const am = acMode(st), col = am === 'heat' ? 0xfb923c : am === 'dry' ? 0xfde68a : am === 'fan_only' ? 0xe0e7ff : am === 'auto' || am === 'heat_cool' ? 0x6ee7b7 : 0x93c5fd;
      A.pts.material.color.setHex(col); A.unit.material.emissive.setHex(col);
    }
    // washing machines turn their drum while they run (a plug that draws power, a status that is not idle); showers steam
    const runs = id => { const v = String(c.v(id) ?? '').toLowerCase(), n = c.n(id); return id.startsWith('sensor.') && n != null ? n > 5 : ['on', 'running', 'washing', 'wash', 'rinse', 'rinsing', 'spin', 'spinning', 'drying', 'heat', 'heating', 'active'].includes(v); };
    for (const W of this.washers || []) W.on = W.entity && runs(W.entity) ? 1 : 0;
    for (const S of this.steams || []) { const n = c.n(S.entity); S.t = S.entity.startsWith('sensor.') ? (n != null && n > 70 ? 1 : 0) : S.entity.startsWith('water_heater.') ? (['off', 'idle'].includes(c.v(S.entity)) || BAD.includes(c.v(S.entity) ?? '') ? 0 : 1) : runs(S.entity) ? 1 : 0; }
    for (const tv of this.tvs || []) {
      const st = c.s(tv.entity || E.media.tv);
      tv.on = st?.state === 'playing' ? 1 : 0;
      // the screen shows a picture while the TV is on (not off / standby / unavailable)
      tv.vis = st && !['off', 'standby', 'unavailable', 'unknown'].includes(st.state) ? 1 : 0;
      this._tvPicture(tv, tv.vis ? st.attributes.entity_picture : null);
    }
    // lamps glow in their light's colour and brightness, fans turn at their speed, device dots light up
    for (const L of this.lamps || []) {
      const st = c.s(L.entity), on = st?.state === 'on';
      L.t = on ? (st.attributes.brightness ? 0.35 + 0.65 * st.attributes.brightness / 255 : 1) : 0;
      const rc = st?.attributes.rgb_color; L.col.setRGB(...(rc ? rc.map(x => x / 255) : [1, 0.76, 0.48]));
    }
    // blinds: how far down (0 open … 1 closed); robot vacuums: what they are doing
    for (const B of this.blinds || []) { const st = c.s(B.entity); if (!st) continue; const p = st.attributes.current_position; B.t = Math.max(0.04, p != null ? 1 - p / 100 : st.state === 'closed' ? 1 : st.state === 'closing' ? 0.6 : 0.04); }
    for (const V of this.vacuums || []) V.st = c.v(V.entity) || 'docked';
    for (const K of this.cars || []) { K.t = c.carParked(K.entity, K.state) ? 1 : 0; if (K.c == null) { K.c = K.t; K.g.visible = !!K.t; } }
    for (const S of this.sprinklers || []) S.onT = S.entity && ['on', 'open', 'opening'].includes(c.v(S.entity)) ? 1 : 0;
    for (const F of this.fans || []) { const st = c.s(F.entity); F.on = st?.state === 'on' ? 1 : 0; F.sp = F.on ? 0.5 + 1.5 * ((st.attributes.percentage ?? 60) / 100) : 0; }
    for (const P of this.markers || []) { const v = c.v(P.entity); P.t = BAD.includes(v ?? '') ? -1 : c.on(P.entity) || (P.entity.startsWith('climate.') && c.climOn(P.entity)) ? 1 : 0; }
    const ids0 = P => P.f.entities[0];
    // furniture badges: a dot; the entity's icon while it is on, its room is open or the pointer is over it
    for (const P of this.fpieces || []) {
      if (!P.el) continue;
      const car = P.f.type === 'car', parked = car && c.carParked(ids0(P), P.f.parked_state);
      const ids = P.f.entities, act = car ? parked : ids.some(id => c.on(id) || (id.startsWith('climate.') && c.climOn(id))), na = ids.every(id => BAD.includes(c.v(id) ?? ''));
      const big = act || this.sel === P.f.room || this.hoverF === P.idx;
      const st = c.s(ids[0]), icon = P.f.icon || (car ? (parked ? 'mdi:car' : 'mdi:car-off') : st ? st.attributes.icon || domIcon(ids[0].split('.')[0], st.state, st.attributes) : furnIcon(P.f));
      const sig = [act, na, big, icon].join('|');
      if (P.el._sig !== sig) { P.el._sig = sig; P.el.className = `fb ${act ? 'on' : ''} ${na ? 'na' : ''} ${big ? 'big' : ''}`; P.el.innerHTML = big ? ic(icon) : ''; }
    }
    this.tvOn = (this.tvs || []).some(tv => tv.on) ? 1 : 0;
    for (const s of this.stairDots) s.on = c.v(s.id) === 'on';
    // day / night from sun
    const el = c.s(E.sun)?.attributes.elevation; const day = el == null ? 0.6 : clamp((el + 6) / 24, 0, 1);
    this.day = day;
    const dv = day.toFixed(2); if (this._dayV !== dv) { this._dayV = dv; this.vp.style.setProperty('--day', dv); }
    // battery: HA pushes state changes all the time; redraw only when something the scene shows changed
    const sg = [Object.values(this.rooms).map(R => [R.litT, R.stripT || 0, R.spotT || 0, R.tvT || 0, R.stripCol ? R.stripCol.getHex() : 0, R.tvCol ? R.tvCol.getHex() : 0, R.motion, R.anyLit, R.temp]),
      this.lockT, this.phoneT, this.doors.map(D => D.openT), (this.lamps || []).map(L => [L.t, L.col.getHex()]), (this.fans || []).map(F => F.sp), (this.markers || []).map(P => P.t), (this.blinds || []).map(B => B.t), (this.vacuums || []).map(V => V.st), (this.cars || []).map(K => K.t), (this.sprinklers || []).map(S => S.onT), (this.washers || []).map(W => W.on), (this.steams || []).map(S => S.t), this.hoverF, this.acs.map(A => [A.onT, A.pts.material.color.getHex()]), this.tvOn, (this.tvs || []).map(tv => [tv.vis, tv.pic]), this.stairDots.map(x => x.on), dv, this.mode, this.sel].join();
    if (sg !== this._syncSig) { this._syncSig = sg; this._dirty = true; }
  }

  _resize() {
    this._dirty = true; if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    const w = this.vp.clientWidth, h = this.vp.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h;
    const a = w / h;
    this.cam.fov = a < 0.75 ? 46 : 38; this.cam.updateProjectionMatrix();
    const tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * a;
    const portrait = a < 0.9;
    const hw = PLAN_W / 2 + 1.1, hd = PLAN_D / 2 + 1.6, big = Math.max(PLAN_W, PLAN_D);
    const nb = portrait ? clamp(Math.max(hw / th, hd / tv) * 0.95, 8, SPAN * 4) : clamp(Math.max(big * 0.73 / th, big * 0.6 / tv) * 0.88, 8, SPAN * 4);
    const nt = portrait ? -0.2 : -0.55;
    const first = this.defTheta === undefined, top = this.vmode === 'top';
    if (top) {
      // keep the floor plan framed while the user hasn't moved the camera away from it
      if (!this.sel && (first || (Math.abs(this.goal.phi - 0.08) < 0.01 && Math.abs(this.goal.theta) < 0.01))) Object.assign(this.goal, { phi: 0.08, theta: 0, radius: this._topR() });
    } else if (first) {
      Object.assign(this.goal, { phi: 0.92, theta: nt, radius: nb });
    } else {
      if (!this.sel && Math.abs(this.goal.theta - this.defTheta) < 0.01) this.goal.theta = nt;
      if (!this.sel && Math.abs(this.goal.radius - (this.baseR || 27)) < 0.5) this.goal.radius = nb;
    }
    if (first) Object.assign(this.orbit, { theta: this.goal.theta, phi: this.goal.phi, radius: this.goal.radius });
    this.defTheta = nt;
    this.baseR = nb;
    if (!this.sel) this._goFocus(first); // a card zoomed on one room keeps it framed when its size changes
  }

  _frame(dt) {
    const T = this.T; const now = performance.now(); const tt = now / 1000;
    const k = 1 - Math.exp(-dt * 6);
    if (this.spin && now - this.lastInput > 2500) this.goal.theta += dt * 0.12;
    const o = this.orbit, g = this.goal;
    let mv = Math.abs(g.theta - o.theta) + Math.abs(g.phi - o.phi) + Math.abs(g.radius - o.radius) * 0.05 + o.target.distanceTo(g.target) * 0.05;
    let anim = false;
    o.theta += (g.theta - o.theta) * k; o.phi += (g.phi - o.phi) * k; o.radius += (g.radius - o.radius) * k; o.target.lerp(g.target, k);
    const sp = Math.sin(o.phi);
    this.cam.position.set(o.target.x + o.radius * sp * Math.sin(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * sp * Math.cos(o.theta));
    this.cam.lookAt(o.target);

    const day = this.day ?? 0.6;
    if (this.doll) { // sunny by day (a warm sun, a blue sky over green grass), moonlit blue at night
      this.hemi.intensity = 0.55 + 0.9 * day;
      this.hemi.color.setRGB(0.55 + 0.32 * day, 0.62 + 0.3 * day, 0.85 + 0.15 * day);
      this.sun.intensity = 0.5 + 2.6 * day;
      this.sun.color.setRGB(0.6 + 0.4 * day, 0.68 + 0.27 * day, 0.95 - 0.12 * day);
      this.renderer.toneMappingExposure = 0.9 + 0.15 * day;
    } else {
      this.hemi.intensity = 1.05 + 0.5 * day;
      this.sun.intensity = 1.1 + 1.6 * day;
      this.sun.color.setRGB(0.65 + 0.35 * day, 0.72 + 0.26 * day, 1.0 - 0.12 * day);
      this.renderer.toneMappingExposure = 0.95 + 0.15 * day;
    }
    // walls (`card._wallMode()`): Up, every wall stands; Cutaway, the outer walls on the side the camera looks from sink
    // to a low stub (with their doors) and the far walls stay up, every wall standing from above (floor plan);
    // Down, every wall is a low stub
    if (this.cuts.length) {
      const ex = Math.sin(o.theta), ez = Math.cos(o.theta), top = this.vmode === 'top' || o.phi < 0.3, wm = this.card._wallMode?.() || 'up';
      let moved = 0;
      for (const C of this.cuts) {
        const low = wm === 'down' || (wm === 'cut' && !top && C.outer && C.nx * ex + C.nz * ez > 0.2);
        // a floor below the one shown (stacked floors): its walls go up to the floor above, like a real storey
        const goal = C.l < this.level ? (this.storey - 0.1) / WALL_H : low ? Math.min(1, 0.3 / C.h) : 1, d = goal - C.k;
        if (Math.abs(d) < 0.001) continue;
        C.k = Math.abs(d) < 0.004 ? goal : C.k + d * Math.min(1, dt * 7); moved += Math.abs(d);
        C.g.scale.y = C.k; for (const p of C.doors) p.scale.y = C.k;
      }
      if (moved) { mv += moved; this.renderer.shadowMap.needsUpdate = true; }
    }

    const warm = new T.Color(0xffb86b);
    for (const id in this.rooms) {
      const R = this.rooms[id];
      mv += Math.abs(R.litT - R.lit) + Math.abs((R.stripT || 0) - (R.stripL || 0)) + Math.abs((R.spotT || 0) - (R.spotL || 0)) + Math.abs((R.tvT || 0) - (R.tvL || 0));
      R.lit += (R.litT - R.lit) * Math.min(1, dt * 4);
      const sel = this.sel === id, hov = this.hover === id;
      mv += Math.abs((sel ? 1 : hov ? 0.5 : 0) - R.hl);
      if (R.hl > 0.01 || R.motion) anim = true; // pulsing outline / motion ring
      R.hl += ((sel ? 1 : hov ? 0.5 : 0) - R.hl) * Math.min(1, dt * 8);
      // floor tint by mode
      let target, emis, ei = 0;
      if (this.mode === 'climate') {
        const c = tempRGB(R.temp); target = R.temp == null ? new T.Color(0.45, 0.48, 0.55) : new T.Color(c[0] / 255, c[1] / 255, c[2] / 255);
        emis = target; ei = R.temp == null ? 0 : 0.35;
      } else if (this.mode === 'presence') {
        target = R.motion ? new T.Color(0.4, 0.95, 0.85) : new T.Color(0.5, 0.55, 0.62); emis = new T.Color(0x14b8a6); ei = R.motion ? 0.35 + 0.2 * Math.sin(tt * 4) : 0;
      } else {
        target = new T.Color(1, 1, 1); emis = warm; ei = R.lit * 0.22 + (R.stripL || 0) * 0.06;
      }
      mv += Math.abs(R.col.r - target.r) + Math.abs(R.col.g - target.g) + Math.abs(R.col.b - target.b);
      R.col.lerp(target, Math.min(1, dt * 5));
      for (const m of R.mats) { m.color.copy(R.col); m.emissive.copy(emis).multiplyScalar(ei + R.hl * 0.12); }
      const lightsMode = this.mode === 'lights' ? 1 : 0.55;
      R.pl.intensity = R.lit * 9 * lightsMode;
      R.lamp.material.emissiveIntensity = R.lit * 2.5;
      R.halo.material.opacity = R.lit * 0.35;
      if (R.strip) { // LED strip along the walls
        R.stripL += (R.stripT - R.stripL) * Math.min(1, dt * 4);
        R.strip.lineMat.color.lerp(R.stripCol, Math.min(1, dt * 5)); R.strip.pl.color.copy(R.strip.lineMat.color);
        for (const p of R.strip.planes) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.4 * lightsMode; }
        for (const p of R.strip.washes) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.5 * lightsMode; } // v1.21.12: was 0.75
        for (const p of R.strip.ribbons) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.65 * lightsMode; } // v1.21.12: was 0.9
        R.strip.lineMat.opacity = Math.min(1, R.stripL * 1.4);
        R.strip.pl.intensity = R.stripL * 1.2 * lightsMode; // v1.20.0: faint tint only (was 5 — it painted the whole room)
      }
      if (R.spots) { // side lights (ceiling spots)
        R.spotL += (R.spotT - R.spotL) * Math.min(1, dt * 4);
        R.spots.discMat.emissiveIntensity = R.spotL * 3;
        R.spots.poolMat.opacity = R.spotL * 0.55 * lightsMode;
        R.spots.beamMat.opacity = R.spotL * 0.07 * lightsMode;
        R.spots.pl.intensity = R.spotL * 7 * lightsMode;
      }
      if (R.tv) { // TV backlight
        R.tvL += (R.tvT - R.tvL) * Math.min(1, dt * 4);
        R.tv.plane.material.color.lerp(R.tvCol, Math.min(1, dt * 5)); R.tv.pl.color.copy(R.tv.plane.material.color);
        R.tv.plane.material.opacity = R.tvL; R.tv.sm.color.copy(R.tv.plane.material.color); R.tv.sm.opacity = Math.min(1, R.tvL * 1.4);
        R.tv.pl.intensity = R.tvL * 9 * lightsMode;
      }
      R.outline.material.opacity = R.hl * (0.6 + 0.4 * Math.sin(tt * 3));
      const showRing = R.motion && (this.mode !== 'lights' || true);
      const ph = (tt * 0.8) % 1;
      R.ring.material.opacity = showRing ? (1 - ph) * 0.8 : 0;
      R.ring.scale.setScalar(showRing ? 1 + ph * 2.5 : 1);
    }
    for (const D of this.doors) {
      const dd = Math.abs((D.openT || 0) - D.a); mv += dd; if (D.openT) anim = true;
      if (dd > 0.0005) this.renderer.shadowMap.needsUpdate = true; // a moving door changes its shadow
      D.a += ((D.openT || 0) - D.a) * Math.min(1, dt * 4);
      D.pivot.rotation.y = D.a * D.ang;
      D.mat.emissiveIntensity = D.a * (0.4 + 0.3 * Math.sin(tt * 5));
    }
    for (const A of this.acs) {
      mv += Math.abs(A.onT - A.on); if (A.on > 0.01) anim = true;
      A.on += (A.onT - A.on) * Math.min(1, dt * 3);
      A.unit.material.emissiveIntensity = A.on * 0.6;
      A.pts.material.opacity = A.on * 0.85;
      if (A.on > 0.01) {
        const p = A.pts.geometry.attributes.position.array;
        for (let i = 0; i < A.life.length; i++) {
          A.life[i] += dt * 0.45; if (A.life[i] > 1) A.life[i] -= 1;
          const l = A.life[i]; const spread = (((i * 7919) % 100) / 100 - 0.5) * 0.8;
          const dist = 0.2 + l * (A.cas ? 1.6 : 2.6);
          const [ddx, ddz] = A.cas ? [[1, 0], [-1, 0], [0, 1], [0, -1]][i % 4] : [A.dx, A.dz]; // a ceiling cassette blows out on its four sides
          p[i * 3] = A.cx + ddx * dist + (ddz ? spread * (1 + l) : 0);
          p[i * 3 + 1] = A.y - l * Math.min(0.9, A.y - 0.1) + Math.sin(l * 6 + i) * 0.05;
          p[i * 3 + 2] = A.cz + ddz * dist + (ddx ? spread * (1 + l) : 0);
        }
        A.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const B of this.badges || []) {
      const unl = B.t === 2; B.m.material.emissive.setHex(unl ? 0xfb7185 : 0x34d399);
      B.m.material.emissiveIntensity = (unl ? 0.7 + 0.5 * Math.sin(tt * 5) : B.t === 1 ? 0.8 : 0) * 1.6;
      if (unl) anim = true;
    }
    for (const P of this.chargers || []) {
      for (const q of P.parts) q.visible = P.t === 2; // the phone is there only while it is plugged in and charging
      const pt = P.t === 2 ? 1.1 + 0.6 * Math.sin(tt * 2.5) : 0;
      P.m.material.emissiveIntensity += (pt - P.m.material.emissiveIntensity) * Math.min(1, dt * 5);
      P.glow.material.opacity = Math.max(0, P.m.material.emissiveIntensity - 0.3) * 0.35;
      if (P.t === 2 || P.m.material.emissiveIntensity > 0.01) anim = true;
    }
    for (const tv of this.tvs || []) {
      const t = tv.on ? 0.9 + 0.25 * Math.sin(tt * 7) * Math.sin(tt * 2.3) : 0; tv.m.material.emissiveIntensity += (t - tv.m.material.emissiveIntensity) * Math.min(1, dt * 6);
      if (tv.on || tv.m.material.emissiveIntensity > 0.01) anim = true;
      if (tv.scr) { // the picture fades in / out with the TV
        const o = tv.scr.opacity, d = tv.vis - o;
        if (Math.abs(d) > 0.005) { tv.scr.opacity = o + d * Math.min(1, dt * 4); anim = true; } else tv.scr.opacity = tv.vis;
        tv.sp.visible = tv.scr.opacity > 0.01;
      }
    }
    for (const L of this.lamps || []) {
      const d = L.t - L.m.material.emissiveIntensity / 1.6; mv += Math.abs(d);
      L.m.material.emissiveIntensity += d * 1.6 * Math.min(1, dt * 5);
      L.m.material.emissive.lerp(L.col, Math.min(1, dt * 5)); L.glow.material.color.copy(L.m.material.emissive);
      L.glow.material.opacity = (L.m.material.emissiveIntensity / 1.6) * 0.32 * (this.mode === 'lights' ? 1 : 0.55);
    }
    for (const F of this.fans || []) { if (F.sp) { F.g.rotation.y -= dt * F.sp * 6; anim = true; } }
    for (const W of this.washers || []) { W.sp += ((W.on ? 5 : 0) - W.sp) * Math.min(1, dt * 1.5); if (W.sp > 0.01) { W.drum.rotation.z -= dt * W.sp; anim = true; } }
    for (const S of this.steams || []) {
      S.a += (S.t - S.a) * Math.min(1, dt * 1.2); S.mat.opacity = S.a * 0.22; if (S.a < 0.01 && !S.t) continue; anim = true;
      S.puffs.forEach((m, k) => { const l = (tt * 0.25 + k / S.puffs.length) % 1; m.position.y = 0.4 + l * (S.H - 0.3); m.scale.setScalar(0.6 + l * 0.9); });
    }
    for (const K of this.cars || []) { // a car arriving drives into its bay from behind; one leaving drives off forwards
      if (K.c == null) { K.c = K.t; K.g.visible = !!K.t; K.slide = 0; } // the first state: no animation
      else if (K.t !== K.c) { K.c = K.t; K.slide = K.t ? 3.5 : 0; K.g.visible = true; }
      if (K.c && K.slide > 0.002) { K.slide += -K.slide * Math.min(1, dt * 2.5); anim = true; mv += 0.05; }
      else if (!K.c && K.g.visible) { K.slide += dt * 4; anim = true; mv += 0.05; if (K.slide > 3.5) K.g.visible = false; }
      const off = K.c ? K.slide : -K.slide; // + behind the car, − in front of it
      K.g.position.x = K.base[0] + K.dir[0] * off; K.g.position.z = K.base[1] + K.dir[1] * off;
    }
    for (const S of this.sprinklers || []) {
      S.on += (S.onT - S.on) * Math.min(1, dt * 3); S.pts.material.opacity = S.on * 0.85;
      if (S.on > 0.01) {
        anim = true; const p = S.pts.geometry.attributes.position.array;
        for (let i = 0; i < S.life.length; i++) {
          S.life[i] += dt * 0.7; if (S.life[i] > 1) { S.life[i] -= 1; S.ang[i] = Math.random() * Math.PI * 2; }
          const l = S.life[i], r = l * S.rad;
          p[i * 3] = S.cx + Math.cos(S.ang[i]) * r; p[i * 3 + 1] = 0.2 + Math.sin(l * Math.PI) * 0.7; p[i * 3 + 2] = S.cz + Math.sin(S.ang[i]) * r;
        }
        S.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const B of this.blinds || []) { const d = B.t - B.c; if (Math.abs(d) > 0.002) { B.c += d * Math.min(1, dt * 3); B.m.scale.y = B.c; mv += Math.abs(d); } }
    for (const V of this.vacuums || []) {
      const p = V.g.position, cleaning = V.st === 'cleaning';
      if (cleaning) { // wander: a new random spot in the room each time it gets there
        if (!V.goal || Math.hypot(V.goal[0] - p.x, V.goal[1] - p.z) < 0.05) {
          const rs = ROOM[V.room]?.rects || [[0, 0, 1, 1]], q = rs[Math.floor(Math.random() * rs.length)];
          V.goal = this.w(q[0] + 0.3 + Math.random() * Math.max(0, q[2] - q[0] - 0.6), q[1] + 0.3 + Math.random() * Math.max(0, q[3] - q[1] - 0.6));
        }
      } else V.goal = V.st === 'returning' || Math.hypot(V.dock[0] - p.x, V.dock[1] - p.z) > 0.02 ? V.dock : null;
      if (V.goal) {
        const dx = V.goal[0] - p.x, dz = V.goal[1] - p.z, d = Math.hypot(dx, dz), step = Math.min(d, dt * 0.45);
        if (d > 0.001) { p.x += dx / d * step; p.z += dz / d * step; V.g.rotation.y = Math.atan2(dx, dz); anim = true; mv += step; }
      }
      V.led.material.emissive.setHex(cleaning ? 0x2dd4bf : V.st === 'error' ? 0xf43f5e : V.st === 'returning' ? 0xfbbf24 : 0x64748b);
      V.led.material.emissiveIntensity = cleaning ? 1 + 0.6 * Math.sin(tt * 4) : 0.5; if (cleaning) anim = true;
    }
    for (const P of this.markers || []) {
      const t = P.t === 1 ? 1.1 + 0.4 * Math.sin(tt * 3) : P.t === -1 ? 0 : 0.15;
      P.m.material.emissiveIntensity += (t - P.m.material.emissiveIntensity) * Math.min(1, dt * 5);
      P.glow.material.opacity = P.t === 1 ? 0.25 : 0; if (P.t === 1) anim = true;
    }
    if (this.tvOn || this.stairDots.some(s => s.on) || this.mode === 'presence') anim = true;
    this._busy = mv > 0.002; this._anim = anim;
    for (const s of this.stairDots) { s.m.material.opacity = s.on ? 0.6 + 0.4 * Math.sin(tt * 6) : 0.12; s.m.scale.setScalar(s.on ? 1.6 : 1); }

    this.renderer.render(this.scene, this.cam);
    // labels
    const W = this.vp.clientWidth, H = this.vp.clientHeight; const v = new T.Vector3();
    for (const id in this.rooms) {
      const R = this.rooms[id]; const el = this.lbls[id];
      v.set(R.cx, R.r.labelY ?? 1.75, R.cz).project(this.cam);
      if (v.z > 1 || R.r.level !== this.level) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
    for (const B of this.badges || []) { // lock badge names, just above the badge
      if (!B.el) continue;
      v.set(B.x, B.b.y + 0.2, B.z).project(this.cam);
      if (v.z > 1 || (B.b.level ?? 0) !== this.level) { B.el.style.display = 'none'; continue; }
      B.el.style.display = '';
      B.el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
    for (const P of this.fpieces || []) {
      if (!P.el) continue;
      if (P.dyn) v.set(P.dyn.position.x, P.y, P.dyn.position.z); else v.set(P.x, P.y, P.z);
      v.project(this.cam);
      if (v.z > 1 || (P.f.level ?? 0) !== this.level) { P.el.style.display = 'none'; continue; }
      P.el.style.display = '';
      P.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
  }
}
