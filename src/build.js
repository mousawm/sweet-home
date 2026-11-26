// Sweet Home — Build mode in the 3D view (a life-sim style builder): a grid on the floor, and tools that work right in
// the 3D house: draw rooms and walls, put doors and windows on walls, paint wallpaper and floors, place, turn and link
// furniture, and knock things down. The scene side: the grid, the cursor, the ghost previews and the pointer. Every
// change is handed to the card (`card._bOp`), which writes it into the card's config; the house is then built again.
import { MODEL, ROOMS, WALLS, DOORS, FURN, CX, CZ, PLAN_W, PLAN_D, WALL_H } from './core.js';
import { inPoly, extraWalls } from './model.js';
import { NEW_PIECE, footprint, fpBox } from './pieces.js';

const GHOST = 0x2dd4bf, BAD_C = 0xfb7185;

export class Builder {
  constructor(S) {
    this.S = S; this.T = S.T; const T = this.T;
    // the builder works in the config's own coordinates (the grid lines up with what is written); the model's rooms,
    // walls and doors are in plan coordinates, which start at the house's corner: plan = config - (ox, oz)
    this.ox = MODEL.plan?.ox || 0; this.oz = MODEL.plan?.oz || 0;
    this.g = new T.Group(); this.g.renderOrder = 5; S.scene.add(this.g);
    this.mat = new T.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.45, depthWrite: false });
    this.lineMat = new T.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.9, depthWrite: false });
    this.setGrid();
    // the cursor: a ring on the grid point under the pointer
    this.cur = new T.Mesh(new T.RingGeometry(0.09, 0.14, 24), this.lineMat); this.cur.rotation.x = -Math.PI / 2; this.cur.position.y = 0.03; this.cur.visible = false; this.g.add(this.cur);
    this.ghost = new T.Group(); this.g.add(this.ghost);
    this.tool = S.card._bTool || 'room';
    this._listen();
  }
  // the build grid: a line every grid step (50 cm, 25 cm or 1 m), around the house with room to grow
  setGrid() {
    const T = this.T, st = this.step, size = 2 * Math.ceil((Math.max(PLAN_W, PLAN_D) + 12) / 2); // even: lines fall on whole steps
    if (this.grid) { this.g.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); }
    const grid = this.grid = new T.GridHelper(size, Math.round(size / st), 0xffffff, 0xffffff);
    grid.material.transparent = true; grid.material.opacity = st < 0.5 ? 0.18 : 0.28; grid.material.depthWrite = false;
    const [gx, gz] = this.w(Math.round((PLAN_W / 2 + this.ox) / st) * st, Math.round((PLAN_D / 2 + this.oz) / st) * st);
    grid.position.set(gx, 0.012, gz); this.g.add(grid); this.S._dirty = true;
  }
  dispose() { this.off?.(); this.S.scene.remove(this.g); this.S._dirty = true; }
  setTool(t) { this.tool = t; this.op = null; this._clear(); this.S._dirty = true; }

  // ---------- coordinates ----------
  get step() { return this.S.card._bGrid || 0.5; }
  snap(v, s = this.step) { return Math.round(v / s) * s; }
  w(x, z) { return [x - this.ox - CX, z - this.oz - CZ]; } // config → world
  P(p) { return [p[0] - this.ox, p[1] - this.oz]; } // config → plan
  C(x, z) { return [Math.round((x + this.ox) * 100) / 100, Math.round((z + this.oz) * 100) / 100]; } // plan → config
  // the floor point under the pointer, in config coordinates (metres), or null
  _plan(e) {
    const T = this.T, el = this.S.cv, b = el.getBoundingClientRect();
    const v = new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    (this.ray ||= new T.Raycaster()).setFromCamera(v, this.S.cam);
    const p = this.ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    return p ? [p.x + CX + this.ox, p.z + CZ + this.oz] : null;
  }
  // what the pointer is over: { room, fi } (a furniture piece's index)
  _hit(e) {
    const el = this.S.cv, b = el.getBoundingClientRect(), T = this.T;
    this.ray.setFromCamera(new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), this.S.cam);
    const u = this.ray.intersectObjects(this.S.pick, false).find(h => this.S._shown(h.object))?.object.userData || {};
    return { room: u.room || null, fi: u.fi ?? null };
  }
  roomAt(x, z, l = this.S.level, indoor = false) {
    x -= this.ox; z -= this.oz;
    return ROOMS.find(r => r.level === l && (!indoor || !r.outdoor) && (r.poly ? inPoly(x, z, r.poly) : r.rects.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)));
  }
  // the wall nearest to a point (within `max` metres) on this floor: { seg, t (0…1 along it), d, len }
  nearWall(p0, max = 0.6, pred = () => true) {
    let best = null; const p = this.P(p0);
    for (const s of WALLS) {
      const [x1, z1, x2, z2, type, lvl] = s; if ((lvl ?? 0) !== this.S.level || !pred(s)) continue;
      const vx = x2 - x1, vz = z2 - z1, L2 = vx * vx + vz * vz; if (L2 < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - x1) * vx + (p[1] - z1) * vz) / L2)), d = Math.hypot(x1 + vx * t - p[0], z1 + vz * t - p[1]);
      if (d < max && (!best || d < best.d)) best = { seg: s, t, d, len: Math.sqrt(L2), type };
    }
    return best;
  }
  // a door / window of width `wd` centred where the pointer is along the wall, kept inside it
  _onWall(p, wd, window) {
    const nw = this.nearWall(p, 0.6, s => (window ? ['w', 'win', undefined].includes(s[4]) : !['glass', 'rail'].includes(s[4])));
    if (!nw || nw.len < wd + 0.1) return null;
    const [x1, z1, x2, z2] = nw.seg, ux = (x2 - x1) / nw.len, uz = (z2 - z1) / nw.len;
    const c = Math.max(wd / 2 + 0.05, Math.min(nw.len - wd / 2 - 0.05, Math.round(nw.t * nw.len / 0.1) * 0.1));
    const seg = [...this.C(x1 + ux * (c - wd / 2), z1 + uz * (c - wd / 2)), ...this.C(x1 + ux * (c + wd / 2), z1 + uz * (c + wd / 2))];
    // a window goes in an outer wall: a room on one side only
    const nx = -uz * 0.3, nz = ux * 0.3, mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
    const outer = !this.roomAt(mx + nx, mz + nz, this.S.level, true) !== !this.roomAt(mx - nx, mz - nz, this.S.level, true);
    return { seg, ok: !window || outer, fence: nw.type === 'fence' };
  }

  // ---------- ghosts ----------
  _clear() { for (const c of [...this.ghost.children]) { this.ghost.remove(c); c.geometry?.dispose(); } }
  _wall(x1, z1, x2, z2, h = WALL_H, t = 0.12, mat = this.mat) {
    const T = this.T, len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.01) return;
    const m = new T.Mesh(new T.BoxGeometry(len + t, h, t), mat), [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2);
    m.position.set(cx, h / 2, cz); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); this.ghost.add(m);
  }
  _slab(a, b, c, d, y = 0.02, mat = this.mat) {
    const T = this.T, m = new T.Mesh(new T.BoxGeometry(Math.max(0.04, c - a), 0.03, Math.max(0.04, d - b)), mat), [cx, cz] = this.w((a + c) / 2, (b + d) / 2);
    m.position.set(cx, y, cz); this.ghost.add(m);
  }
  _roomSlab(r) { for (const [a, b, c, d] of r.rects) this._slab(a + this.ox, b + this.oz, c + this.ox, d + this.oz, 0.03); }
  _paint(bad) { this.mat.color.setHex(bad ? BAD_C : GHOST); this.lineMat.color.setHex(bad ? BAD_C : GHOST); }
  // a wall from a to the pointer: straight along the grid, or at 45°
  _wallEnd(a, p) {
    let dx = p[0] - a[0], dz = p[1] - a[1];
    if (Math.abs(dx) > 2 * Math.abs(dz)) dz = 0; else if (Math.abs(dz) > 2 * Math.abs(dx)) dx = 0;
    else { const m = this.snap((Math.abs(dx) + Math.abs(dz)) / 2); dx = Math.sign(dx) * m; dz = Math.sign(dz) * m; }
    return [a[0] + this.snap(dx), a[1] + this.snap(dz)];
  }

  // the preview for the pointer at plan point p (and the drag that started at a)
  _preview(p, e) {
    if (this.hold) return; // a step was just sent: its ghost stays until the house is built again
    this._clear(); this._paint(false);
    const tool = this.tool, sp = [this.snap(p[0]), this.snap(p[1])], [wx, wz] = this.w(...sp);
    this.cur.visible = ['room', 'wall'].includes(tool); this.cur.position.set(wx, 0.03, wz);
    const op = this.op;
    if (tool === 'room' && op) {
      const [a, b] = [op.a, sp], x1 = Math.min(a[0], b[0]), z1 = Math.min(a[1], b[1]), x2 = Math.max(a[0], b[0]), z2 = Math.max(a[1], b[1]);
      this._paint(x2 - x1 < this.step || z2 - z1 < this.step);
      this._slab(x1, z1, x2, z2); this._wall(x1, z1, x2, z1); this._wall(x2, z1, x2, z2); this._wall(x2, z2, x1, z2); this._wall(x1, z2, x1, z1);
      this.S.card._bInfo(`${(x2 - x1).toFixed(2)} × ${(z2 - z1).toFixed(2)} m`);
    } else if (tool === 'wall' && op) {
      const b = this._wallEnd(op.a, p); this._wall(op.a[0], op.a[1], b[0], b[1]);
      this.S.card._bInfo(`${Math.hypot(b[0] - op.a[0], b[1] - op.a[1]).toFixed(2)} m`);
    } else if (tool === 'door' || tool === 'window') {
      const W = this._onWall(p, this.S.card._bWidth(tool), tool === 'window');
      if (W) { this._paint(!W.ok); const [x1, z1, x2, z2] = W.seg; if (tool === 'door') this._wall(x1, z1, x2, z2, Math.max(0.5, WALL_H - 0.08), 0.16); else { this._wall(x1, z1, x2, z2, WALL_H - 0.8, 0.16); this.ghost.children.at(-1).position.y += 0.79; } }
    } else if (tool === 'furniture' && this.S.card._bPiece) {
      const f = { type: this.S.card._bPiece, x: this.snap(p[0], 0.1), z: this.snap(p[1], 0.1), ...NEW_PIECE[this.S.card._bPiece] };
      if (f._span) { f.from = [f.x - f._span[0], f.z - f._span[1]]; f.to = [f.x + f._span[0], f.z + f._span[1]]; }
      const [a, b, c, d] = fpBox(footprint(f)); this._slab(a, b, c, d, 0.05);
    } else if (tool === 'paint' || tool === 'delete') {
      const h = this._hit(e), r = h.room && ROOMS.find(x => x.id === h.room);
      if (tool === 'delete') {
        const what = this._target(p, h);
        this._paint(true);
        if (what?.k === 'wall' || what?.k === 'door') { const [x1, z1, x2, z2] = what.seg; this._wall(x1, z1, x2, z2, WALL_H + 0.05, 0.2); }
        else if (what?.k === 'piece') { const P = FURN[what.fi]; if (P) { try { const [a, b, c, d] = fpBox(footprint(P)); this._slab(a + this.ox, b + this.oz, c + this.ox, d + this.oz, 0.06); } catch (err) { /* odd piece */ } } }
        else if (what?.k === 'room' && r) this._roomSlab(r);
      } else if (r) this._roomSlab(r);
    }
    this.S._dirty = true;
  }
  // what a tap with the hammer would knock down: a piece, a door, a separate wall, or the room
  _target(p0, h) {
    if (h.fi != null && FURN[h.fi]?.src) return { k: 'piece', fi: h.fi };
    const p = this.P(p0);
    for (const [i, d] of DOORS.entries()) {
      if ((d.level ?? 0) !== this.S.level || !d.seg) continue;
      const s = d.seg, vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vz) / L2));
      if (Math.hypot(s[0] + vx * t - p[0], s[1] + vz * t - p[1]) < 0.35) return { k: 'door', i: d.ci ?? i, seg: [...this.C(s[0], s[1]), ...this.C(s[2], s[3])] };
    }
    const ex = this.S.card._config?.house?.extra_walls || [], ox = this.ox, oz = this.oz;
    for (let i = 0; i < ex.length; i++) for (const s0 of extraWalls([ex[i]])) {
      if ((Number(s0[5]) || 0) !== this.S.level) continue;
      const s = [s0[0] - ox, s0[1] - oz, s0[2] - ox, s0[3] - oz];
      const vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vz) / L2));
      if (Math.hypot(s[0] + vx * t - p[0], s[1] + vz * t - p[1]) < 0.3) return { k: 'wall', i, seg: s0 };
    }
    if (h.room) return { k: 'room', id: h.room };
    return null;
  }

  // ---------- pointer ----------
  _listen() {
    const el = this.S.cv, card = this.S.card;
    let down = null; this.multi = false;
    // a second finger on the screen means the view is being turned or zoomed: whatever the first finger started
    // drawing is dropped (counted with touch events: a second finger's pointer can come late or not at all)
    const stop = () => { if (down || this.op) { down = null; this.op = null; this._clear(); card._bInfo(''); this.S._dirty = true; } };
    const ts = e => { this.touches = e.touches.length; if (e.touches.length > 1) { this.multi = true; stop(); } };
    const te = e => { this.touches = e.touches.length; if (!e.touches.length) this.multi = false; };
    const pd = e => {
      if (e.isPrimary) this.multi = false; // a first finger: a new gesture (whatever the last one left behind)
      if (this.multi) return; // still part of a two-finger gesture
      if (!e.isPrimary || e.button !== 0) { stop(); return; } // a second finger / the right button: the camera
      const p = this._plan(e); if (!p) return;
      if (this.tool === 'furniture' && !this.S.card._bPiece && this._hit(e).fi != null) return; // a piece: moved by the arrange drag
      // a finger also goes to the camera, so that if a second one comes, the two turn and zoom the view (moves and
      // the lift are kept from it while this finger draws); the mouse stays with the tool
      if (e.pointerType !== 'touch') e.stopImmediatePropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      down = { x: e.clientX, y: e.clientY };
      if (this.tool === 'room' || this.tool === 'wall') this.op = { a: [this.snap(p[0]), this.snap(p[1])] };
      this.S.lastInput = performance.now(); this._preview(p, e);
    };
    const pm = e => {
      if (!e.isPrimary) return;
      const p = this._plan(e); if (!p) return;
      if (down) e.stopImmediatePropagation();
      if (down || e.pointerType === 'mouse') this._preview(p, e);
    };
    const pu = e => {
      if (!down || !e.isPrimary) return; e.stopImmediatePropagation();
      const p = this._plan(e), op = this.op; down = null; this.op = null; card._bInfo('');
      if (!p) { this._clear(); return; }
      const sp = [this.snap(p[0]), this.snap(p[1])], lv = this.S.level, h = this._hit(e), n0 = card._bUndo?.length || 0;
      if (this.tool === 'room' && op) {
        const x1 = Math.min(op.a[0], sp[0]), z1 = Math.min(op.a[1], sp[1]), x2 = Math.max(op.a[0], sp[0]), z2 = Math.max(op.a[1], sp[1]);
        if (x2 - x1 >= this.step && z2 - z1 >= this.step) card._bOp('room', { rect: [x1, z1, x2, z2], level: lv });
      } else if (this.tool === 'wall' && op) {
        const b = this._wallEnd(op.a, p); if (Math.hypot(b[0] - op.a[0], b[1] - op.a[1]) >= this.step) card._bOp('wall', { from: op.a, to: b, level: lv });
      } else if (this.tool === 'door' || this.tool === 'window') {
        const W = this._onWall(p, card._bWidth(this.tool), this.tool === 'window');
        if (!W) card._toast(card._bT('Point at a wall'), true);
        else if (!W.ok) card._toast(card._bT('Windows go in outer walls'), true);
        else card._bOp(this.tool, { seg: W.seg, level: lv, gate: W.fence });
      } else if (this.tool === 'paint') { if (h.room) card._bOp('paint', { room: h.room }); }
      else if (this.tool === 'furniture') {
        if (card._bPiece) card._bOp('piece', { type: card._bPiece, x: this.snap(p[0], 0.1), z: this.snap(p[1], 0.1), room: this.roomAt(p[0], p[1])?.id || null, level: lv });
        else card._bSelect(null);
      } else if (this.tool === 'delete') { const what = this._target(p, h); if (what) card._bOp('delete', what); }
      // a step that changes the house: its ghost stays (in the picture kept while the house is built again) until then
      if ((card._bUndo?.length || 0) > n0 && ['room', 'wall', 'door', 'window'].includes(this.tool)) { this.hold = true; setTimeout(() => { this.hold = false; this._clear(); this.S._dirty = true; }, 1500); }
      else this._clear();
      this.S._dirty = true;
    };
    const leave = () => { if (!down) { this._clear(); this.cur.visible = false; this.S._dirty = true; } };
    el.addEventListener('pointerdown', pd, true); el.addEventListener('pointermove', pm, true); el.addEventListener('pointerup', pu, true);
    el.addEventListener('pointercancel', pu, true); el.addEventListener('pointerleave', leave);
    const tOpt = { passive: true, capture: true };
    el.addEventListener('touchstart', ts, tOpt); el.addEventListener('touchmove', ts, tOpt); el.addEventListener('touchend', te, tOpt); el.addEventListener('touchcancel', te, tOpt);
    this.off = () => {
      el.removeEventListener('pointerdown', pd, true); el.removeEventListener('pointermove', pm, true); el.removeEventListener('pointerup', pu, true); el.removeEventListener('pointercancel', pu, true); el.removeEventListener('pointerleave', leave);
      el.removeEventListener('touchstart', ts, tOpt); el.removeEventListener('touchmove', ts, tOpt); el.removeEventListener('touchend', te, tOpt); el.removeEventListener('touchcancel', te, tOpt);
    };
  }
}
