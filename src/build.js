// Sweet Home — Build mode in the 3D view (a life-sim style builder): a grid on the floor, and tools that work right in
// the 3D house: draw rooms and walls, put doors and windows on walls, paint wallpaper and floors, place, turn and link
// furniture, and knock things down. The scene side: the grid, the cursor, the ghost previews and the pointer. Every
// change is handed to the card (`card._bOp`), which writes it into the card's config; the house is then built again.
import { MODEL, ROOMS, WALLS, DOORS, FURN, CX, CZ, PLAN_W, PLAN_D, WALL_H } from './core.js';
import { inPoly, extraWalls, roomOutline } from './model.js';
import { NEW_PIECE, ROUND, footprint, fpBox } from './pieces.js';

const GHOST = 0x2dd4bf, BAD_C = 0xfb7185;
const r2 = v => Math.round(v * 100) / 100;
// a room's shape change (config coordinates): { corner: i, to } · { rect: i, c (0..3: corner), to } · { bend: i, bow } ·
// { addCorner: i } (in the middle of edge i) · { move: true, dx, dz }. Rectangles stay rectangles; a moved corner of an
// outline keeps its bend.
export function applyShape(rc, ch) {
  if (ch.move) {
    if (Array.isArray(rc.points)) rc.points = rc.points.map(q => [r2(Number(q[0]) + ch.dx), r2(Number(q[1]) + ch.dz), ...q.slice(2)]);
    if (Array.isArray(rc.rects)) rc.rects = rc.rects.map(q => [r2(Number(q[0]) + ch.dx), r2(Number(q[1]) + ch.dz), r2(Number(q[2]) + ch.dx), r2(Number(q[3]) + ch.dz)]);
  } else if (ch.corner != null && rc.points?.[ch.corner]) rc.points[ch.corner] = [r2(ch.to[0]), r2(ch.to[1]), ...rc.points[ch.corner].slice(2)];
  else if (ch.rect != null && rc.rects?.[ch.rect]) {
    const q = rc.rects[ch.rect].map(Number), [x, z] = ch.to, o = [[q[2], q[3]], [q[0], q[3]], [q[0], q[1]], [q[2], q[1]]][ch.c]; // the opposite corner stays
    if (Math.abs(x - o[0]) >= 0.25 && Math.abs(z - o[1]) >= 0.25) rc.rects[ch.rect] = [r2(Math.min(x, o[0])), r2(Math.min(z, o[1])), r2(Math.max(x, o[0])), r2(Math.max(z, o[1]))];
  } else if (ch.bend != null && rc.points?.[ch.bend]) { const q = rc.points[ch.bend]; rc.points[ch.bend] = ch.bow ? [q[0], q[1], ch.bow] : [q[0], q[1]]; }
  else if (ch.addCorner != null && rc.points?.[ch.addCorner]) {
    const P = rc.points, a = P[ch.addCorner], b = P[(ch.addCorner + 1) % P.length];
    P[ch.addCorner] = [a[0], a[1]]; P.splice(ch.addCorner + 1, 0, [r2((Number(a[0]) + Number(b[0])) / 2), r2((Number(a[1]) + Number(b[1])) / 2)]);
  }
  return rc;
}

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
    // what the Select tool picked: outlined in amber while its settings are open
    this.selMat = new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45, depthWrite: false });
    this.selG = new T.Group(); this.g.add(this.selG);
    this._listen();
    this.setSel(S.card._bInsSel);
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
  // ---------- a selected room's shape, edited in 3D ----------
  // Its handles: a dot on each corner (drag: move the corner; a rectangle's corner resizes it), and on a room drawn
  // with corners, a square in the middle of each edge (drag across: bend the wall into a curve; tap: a new corner).
  // Dragging the room's floor moves the whole room, with what is in it.
  _handles(sel) {
    const T = this.T, H = this.S.card._config?.house || {}; this.handles = [];
    const mat = (c) => new T.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
    const dot = (x, z, h, y = 0.18) => { const m = new T.Mesh(new T.SphereGeometry(0.16, 16, 12), this._hMat ||= mat(0xfbbf24)); const [wx, wz] = this.w(x, z); m.position.set(wx, y, wz); m.renderOrder = 9; this.selG.add(m); this.handles.push({ ...h, m, x, z }); };
    if (sel?.k === 'piece') { // a piece: its corners resize it (round pieces keep their size)
      const f = (sel.room == null ? H.furniture : (H.rooms || [])[sel.room]?.furniture || [])?.[sel.i]; if (!f || ROUND.includes(String(f.type))) return;
      try { const [a, b, c, d] = fpBox(footprint(f)); [[a, b], [c, b], [c, d], [a, d]].forEach(([x, z], c2) => dot(x, z, { k: 'pcorner', c: c2, box: [a, b, c, d] }, 0.25)); } catch (e) { /* odd piece */ }
      return;
    }
    if (sel?.k === 'wall') { // a separate wall: its two ends
      const w = (H.extra_walls || [])[sel.i]; if (!w || Array.isArray(w) || !w.from || !w.to) return;
      dot(Number(w.from[0]), Number(w.from[1]), { k: 'wend', end: 0 }, 0.3); dot(Number(w.to[0]), Number(w.to[1]), { k: 'wend', end: 1 }, 0.3);
      return;
    }
    const rc = sel?.k === 'room' && (H.rooms || [])[sel.i]; if (!rc) return;
    const sq = (x, z, h) => { const m = new T.Mesh(new T.BoxGeometry(0.22, 0.08, 0.22), this._hMat2 ||= mat(0x2dd4bf)); const [wx, wz] = this.w(x, z); m.position.set(wx, 0.18, wz); m.renderOrder = 9; this.selG.add(m); this.handles.push({ ...h, m, x, z }); };
    if (Array.isArray(rc.points) && rc.points.length >= 2) {
      const P = rc.points.map(q => q.map(Number));
      P.forEach((q, i) => dot(q[0], q[1], { k: 'corner', i }));
      if (P.length >= 3) P.forEach((q, i) => {
        const n = P[(i + 1) % P.length], L = Math.hypot(n[0] - q[0], n[1] - q[1]); if (L < 0.4) return;
        const o = this._outward(P, i), b = q[2] || 0; sq((q[0] + n[0]) / 2 + o[0] * b, (q[1] + n[1]) / 2 + o[1] * b, { k: 'mid', i, o });
      });
    } else (rc.rects || []).forEach((q, ri2) => { const [a, b, c, d] = q.map(Number); [[a, b], [c, b], [c, d], [a, d]].forEach(([x, z], c2) => dot(x, z, { k: 'rect', r: ri2, c: c2 })); });
  }
  // the unit vector out of the room, across its edge i (from corner i to the next)
  _outward(P, i) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const m = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
    return inPoly(m[0], m[1], P) ? [-n[0], -n[1]] : n;
  }
  _handleAt(e) {
    if (!this.handles?.length) return null;
    this._plan(e); const hit = this.ray.intersectObjects(this.handles.map(h => h.m), false)[0];
    return hit ? this.handles.find(h => h.m === hit.object) : null;
  }
  // the room's new corners while a handle (or the room) is dragged to p
  _shapeDrag(op, p) {
    const sp = [this.snap(p[0]), this.snap(p[1])], H = op.h;
    if (H?.k === 'pcorner') { const o = [[H.box[2], H.box[3]], [H.box[0], H.box[3]], [H.box[0], H.box[1]], [H.box[2], H.box[1]]][H.c], q = [this.snap(p[0], 0.05), this.snap(p[1], 0.05)]; return { piece: [Math.min(q[0], o[0]), Math.min(q[1], o[1]), Math.max(q[0], o[0]), Math.max(q[1], o[1])] }; }
    if (H?.k === 'wend') return { wend: H.end, to: sp };
    if (op.wallMove || H?.k === 'wmove') return { wallMove: true, dx: this.snap(p[0] - op.p0[0]), dz: this.snap(p[1] - op.p0[1]) };
    const rc = (this.S.card._config?.house?.rooms || [])[this.sel?.i]; if (!rc) return null;
    if (op.move) { const dx = this.snap(p[0] - op.p0[0]), dz = this.snap(p[1] - op.p0[1]); return { move: true, dx, dz }; }
    if (H.k === 'corner') return { corner: H.i, to: sp };
    if (H.k === 'rect') return { rect: H.r, c: H.c, to: sp };
    if (H.k === 'mid') {
      const P = rc.points.map(q => q.map(Number)), a = P[H.i], b = P[(H.i + 1) % P.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const bow = Math.round(((p[0] - m[0]) * H.o[0] + (p[1] - m[1]) * H.o[1]) / 0.1) * 0.1;
      return { bend: H.i, bow: Math.abs(bow) < 0.1 ? 0 : Math.round(bow * 100) / 100 };
    }
    return null;
  }
  // a dragged shape, drawn as low walls along its new outline
  _shapeGhost(rc, ch) {
    const M = this.selMat, H = this.S.card._config?.house || {};
    if (ch.piece) { const [a, b, c, d] = ch.piece; this._slab(a, b, c, d, 0.08, M); return; }
    if (ch.wend != null || ch.wallMove) { const w = (H.extra_walls || [])[this.sel?.i]; if (!w?.from) return; let A = w.from.map(Number), B = w.to.map(Number); if (ch.wallMove) { A = [A[0] + ch.dx, A[1] + ch.dz]; B = [B[0] + ch.dx, B[1] + ch.dz]; } else if (ch.wend) B = ch.to; else A = ch.to; this._wall(A[0], A[1], B[0], B[1], WALL_H, 0.14, M); return; }
    const c = JSON.parse(JSON.stringify(rc)); applyShape(c, ch);
    const poly = roomOutline(c) || null;
    if (poly) poly.forEach(([x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; this._wall(x, z, x2, z2, 0.25, 0.1, M); });
    else for (const [a, b, cc, d] of c.rects || []) { this._wall(a, b, cc, b, 0.25, 0.1, M); this._wall(cc, b, cc, d, 0.25, 0.1, M); this._wall(cc, d, a, d, 0.25, 0.1, M); this._wall(a, d, a, b, 0.25, 0.1, M); }
  }
  setSel(sel) {
    this.handles = [];
    for (const c of [...this.selG.children]) { this.selG.remove(c); c.geometry?.dispose(); }
    this.sel = sel || null; if (!sel) { this.S._dirty = true; return; }
    const H = this.S.card._config?.house || {}, M = this.selMat, add = (fn, ...a) => { const n = this.ghost.children.length; fn.call(this, ...a); for (const c of this.ghost.children.slice(n)) this.selG.add(c); };
    if (sel.k === 'room') { const r = ROOMS.find(x => x.ci === sel.i) || ROOMS[sel.i]; if (r) add(() => { for (const [a, b, c, d] of r.rects) this._slab(a + this.ox, b + this.oz, c + this.ox, d + this.oz, 0.035, M); }); }
    else if (sel.k === 'piece') {
      const P = FURN.find(f => f.src && (sel.room == null ? f.src.house === sel.i : f.src.room === sel.room && f.src.i === sel.i));
      if (P) { try { const [a, b, c, d] = fpBox(footprint(P)); add(() => this._slab(a + this.ox, b + this.oz, c + this.ox, d + this.oz, 0.06, M)); } catch (e) { /* odd piece */ } }
    } else {
      let seg = null;
      if (sel.k === 'door') { const d = DOORS.find(x => x.ci === sel.i); if (d?.seg) seg = [...this.C(d.seg[0], d.seg[1]), ...this.C(d.seg[2], d.seg[3])]; }
      else if (sel.k === 'window' || sel.k === 'opening') { const w = (H[sel.k === 'window' ? 'windows' : 'openings'] || [])[sel.i]; if (Array.isArray(w)) seg = w.slice(0, 4).map(Number); }
      else if (sel.k === 'badge') { const b = (H.lock_badges || [])[sel.i]; if (b) seg = [Number(b.x) - 0.15, Number(b.z), Number(b.x) + 0.15, Number(b.z)]; }
      else if (sel.k === 'wall') { const w = (H.extra_walls || [])[sel.i]; const s0 = w && extraWalls([w]); if (s0?.length) for (const q of s0) add(() => this._wall(q[0], q[1], q[2], q[3], WALL_H + 0.06, 0.22, M)); }
      if (seg) add(() => this._wall(seg[0], seg[1], seg[2], seg[3], WALL_H + 0.06, 0.22, M));
    }
    this._handles(sel); // dots to drag: a room's corners and edges, a piece's corners, a wall's ends
    this.S._dirty = true;
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
    // a window: walls (and window walls); a door: not glass or railings; an open passage: any wall, railings too
    const nw = this.nearWall(p, 0.6, s => (window === 'opening' ? true : window ? ['w', 'win', undefined].includes(s[4]) : !['glass', 'rail'].includes(s[4])));
    if (!nw) return null;
    // the wall the piece belongs to, as a line of points: one straight piece, or the many short pieces of a curved wall
    const P = this._chain(nw.seg), cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = cum.at(-1); if (total < wd + 0.1) return null;
    const at = s0 => { let i = 1; while (i < P.length - 1 && cum[i] < s0) i++; const L = cum[i] - cum[i - 1] || 1, f = (s0 - cum[i - 1]) / L; return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; };
    // where the pointer is along it
    const q = this.P(p); let best = Infinity, sp = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((q[0] - ax) * vx + (q[1] - az) * vz) / L2)), d = Math.hypot(ax + vx * t - q[0], az + vz * t - q[1]);
      if (d < best) { best = d; sp = cum[i - 1] + t * Math.sqrt(L2); }
    }
    const c = Math.max(wd / 2 + 0.05, Math.min(total - wd / 2 - 0.05, Math.round(sp / 0.1) * 0.1)), A = at(c - wd / 2), B = at(c + wd / 2);
    const seg = [...this.C(A[0], A[1]), ...this.C(B[0], B[1])];
    // a window goes in an outer wall: a room on one side only
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
    const nx = -uz * 0.3, nz = ux * 0.3, mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2;
    const outer = !this.roomAt(mx + nx, mz + nz, this.S.level, true) !== !this.roomAt(mx - nx, mz - nz, this.S.level, true);
    return { seg, ok: window !== true || outer, fence: nw.type === 'fence' };
  }
  // the pieces that carry on from wall piece `seg` (same floor and kind, joined end to end, turning less than 25° at
  // each joint: a curved wall), as one line of points (plan coordinates)
  _chain(seg) {
    const [sx1, sz1, sx2, sz2, type, lvl] = seg, k = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
    const same = WALLS.filter(w => (w[5] ?? 0) === (lvl ?? 0) && w[4] === type), used = new Set([seg]);
    const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    const grow = (pts, back) => {
      for (let n = 0; n < 400; n++) {
        const end = back ? pts[0] : pts.at(-1), prev = back ? pts[1] : pts.at(-2), d0 = back ? dir(end, prev) : dir(prev, end);
        const nx = same.find(w => !used.has(w) && (k(w[0], w[1]) === k(...end) || k(w[2], w[3]) === k(...end)) && (() => { const o = k(w[0], w[1]) === k(...end) ? [w[2], w[3]] : [w[0], w[1]], d1 = back ? dir(o, end) : dir(end, o); let a = Math.abs(d1 - d0) % (2 * Math.PI); if (a > Math.PI) a = 2 * Math.PI - a; return a < 0.44; })());
        if (!nx) return; used.add(nx);
        const o = k(nx[0], nx[1]) === k(...end) ? [nx[2], nx[3]] : [nx[0], nx[1]];
        if (back) pts.unshift(o); else pts.push(o);
      }
    };
    const pts = [[sx1, sz1], [sx2, sz2]]; grow(pts, false); grow(pts, true);
    return pts;
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
      const b = this._wallEnd(op.a, p), wk = this.S.card._bWallKind || 'wall';
      this._wall(op.a[0], op.a[1], b[0], b[1], wk === 'half' ? Math.max(0.5, WALL_H * 0.62) : wk === 'fence' ? Math.min(WALL_H, 1.2) : WALL_H, wk === 'wall' ? 0.12 : 0.06);
      this.S.card._bInfo(`${Math.hypot(b[0] - op.a[0], b[1] - op.a[1]).toFixed(2)} m`);
    } else if (tool === 'door' && this.S.card._bDoorKind === 'badge') {
      const [x, z] = [this.snap(p[0], 0.1), this.snap(p[1], 0.1)]; this._slab(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 1.1); this._slab(x - 0.12, z - 0.12, x + 0.12, z + 0.12, 0.03);
    } else if (tool === 'door' && this.S.card._bDoorKind === 'opening') {
      const W = this._onWall(p, this.S.card._bWidth('door'), 'opening');
      if (W) { const [x1, z1, x2, z2] = W.seg; this._wall(x1, z1, x2, z2, WALL_H + 0.1, 0.3); }
    } else if (tool === 'door' || tool === 'window') {
      const W = this._onWall(p, this.S.card._bWidth(tool), tool === 'window');
      if (W) { this._paint(!W.ok); const [x1, z1, x2, z2] = W.seg; if (tool === 'door') this._wall(x1, z1, x2, z2, Math.max(0.5, WALL_H - 0.08), 0.16); else { this._wall(x1, z1, x2, z2, WALL_H - 0.8, 0.16); this.ghost.children.at(-1).position.y += 0.79; } }
    } else if (tool === 'furniture' && this.S.card._bPiece) {
      const f = { type: this.S.card._bPiece, x: this.snap(p[0], 0.1), z: this.snap(p[1], 0.1), ...NEW_PIECE[this.S.card._bPiece] };
      if (f._span) { f.from = [f.x - f._span[0], f.z - f._span[1]]; f.to = [f.x + f._span[0], f.z + f._span[1]]; }
      const [a, b, c, d] = fpBox(footprint(f)); this._slab(a, b, c, d, 0.05);
    } else if (tool === 'paint' || tool === 'delete' || tool === 'select') {
      const h = this._hit(e), r = h.room && ROOMS.find(x => x.id === h.room);
      if (tool === 'delete' || tool === 'select') {
        const what = this._target(p, h, tool === 'select');
        this._paint(tool === 'delete');
        if (['wall', 'door', 'window', 'opening', 'badge'].includes(what?.k)) { const [x1, z1, x2, z2] = what.seg; this._wall(x1, z1, x2, z2, WALL_H + 0.05, 0.2); }
        else if (what?.k === 'piece') { const P = FURN[what.fi]; if (P) { try { const [a, b, c, d] = fpBox(footprint(P)); this._slab(a + this.ox, b + this.oz, c + this.ox, d + this.oz, 0.06); } catch (err) { /* odd piece */ } } }
        else if (what?.k === 'room' && r) this._roomSlab(r);
      } else if (r) this._roomSlab(r);
    }
    this.S._dirty = true;
  }
  // what a tap with the hammer would knock down: a piece, a door, a separate wall, or the room
  // what the pointer points at, for Select and Knock down: a piece, a lock badge, a door, a window, an open passage,
  // a separate wall, or the room. (Knock down skips pieces of a room's automatic set and the stairs.)
  _target(p0, h, any = false) {
    const card = this.S.card;
    if (h.fi != null && (FURN[h.fi]?.src || (any && card._bCanEdit?.(h.fi)))) return { k: 'piece', fi: h.fi };
    const p = this.P(p0), H = card._config?.house || {}, lv = this.S.level, lvOf = o => Number(Array.isArray(o) ? o[4] : o?.level) || 0;
    const near = (s, d) => { const vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((p0[0] - s[0]) * vx + (p0[1] - s[1]) * vz) / L2)); return Math.hypot(s[0] + vx * t - p0[0], s[1] + vz * t - p0[1]) < d; };
    for (const [i, b] of (Array.isArray(H.lock_badges) ? H.lock_badges : []).entries()) if (lvOf(b) === lv && Math.hypot(Number(b.x) - p0[0], Number(b.z) - p0[1]) < 0.4) return { k: 'badge', i, seg: [Number(b.x) - 0.1, Number(b.z), Number(b.x) + 0.1, Number(b.z)] };
    for (const [i, d] of DOORS.entries()) {
      if ((d.level ?? 0) !== this.S.level || !d.seg) continue;
      const s = d.seg, vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vz) / L2));
      if (Math.hypot(s[0] + vx * t - p[0], s[1] + vz * t - p[1]) < 0.35) return { k: 'door', i: d.ci ?? i, seg: [...this.C(s[0], s[1]), ...this.C(s[2], s[3])] };
    }
    for (const k of ['windows', 'openings']) for (const [i, w] of (Array.isArray(H[k]) ? H[k] : []).entries()) {
      if (!Array.isArray(w) || lvOf(w) !== lv) continue;
      const s = w.slice(0, 4).map(Number); if (near(s, 0.35)) return { k: k === 'windows' ? 'window' : 'opening', i, seg: s };
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
      const hd = this.tool === 'select' && this._handleAt(e);
      if (!hd && (this.tool === 'furniture' && !this.S.card._bPiece || this.tool === 'select') && this._hit(e).fi != null) return; // a piece: moved by the arrange drag (a tap picks it)
      // a finger also goes to the camera, so that if a second one comes, the two turn and zoom the view (moves and
      // the lift are kept from it while this finger draws); the mouse stays with the tool
      if (e.pointerType !== 'touch') e.stopImmediatePropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      down = { x: e.clientX, y: e.clientY };
      if (this.tool === 'room' || this.tool === 'wall') this.op = { a: [this.snap(p[0]), this.snap(p[1])] };
      if (this.tool === 'select') { // a handle of the selected room, or (once it moves) the selected room itself
        const sr = this.sel?.k === 'room' && (ROOMS.find(x => x.ci === this.sel.i) || null), h0 = this._hit(e);
        const it = this.sel && ['door', 'window', 'opening', 'badge'].includes(this.sel.k) && this._target(p, h0, true);
        const wl = this.sel?.k === 'wall' && !hd && this._target(p, h0, true);
        if (wl && wl.k === 'wall' && wl.i === this.sel.i) { this.op = { maybeMove: true, wallMove: true, p0: p }; this.S.lastInput = performance.now(); this._preview(p, e); return; }
        this.op = hd ? { h: hd, p0: p } : it && it.k === this.sel.k && it.i === this.sel.i ? { item: this.sel, len: it.seg ? Math.hypot(it.seg[2] - it.seg[0], it.seg[3] - it.seg[1]) : 0, p0: p } : sr && h0.room === sr.id ? { maybeMove: true, p0: p } : null;
      }
      this.S.lastInput = performance.now(); this._preview(p, e);
    };
    const pm = e => {
      if (!e.isPrimary) return;
      const p = this._plan(e); if (!p) return;
      if (down) e.stopImmediatePropagation();
      if (down && this.op?.maybeMove && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { if (this.op.wallMove) this.op.h = { k: 'wmove' }; else this.op.move = true; this.op.maybeMove = false; }
      if (down && this.op?.item && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { // dragging the selected door, window, passage or badge
        this._clear(); const I = this.op.item;
        if (I.k === 'badge') { const x = this.snap(p[0], 0.1), z = this.snap(p[1], 0.1); this.op.to = { x, z }; this._slab(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 1.1, this.selMat); }
        else { const W = this._onWall(p, Math.max(0.3, this.op.len), I.k === 'window' || (I.k === 'opening' ? 'opening' : false)); this.op.to = W && W.ok ? { seg: W.seg } : null; if (W) { this._paint(!W.ok); const [x1, z1, x2, z2] = W.seg; this._wall(x1, z1, x2, z2, WALL_H + 0.06, 0.22, this.selMat); } }
        this.S._dirty = true; return;
      }
      if (down && (this.op?.h || this.op?.move)) { // dragging a handle or the room: its new outline
        this._clear(); const ch = this._shapeDrag(this.op, p), rc = (card._config?.house?.rooms || [])[this.sel?.i];
        if (ch && (rc || this.sel?.k !== 'room')) { this.op.ch = ch; this._shapeGhost(rc, ch); if (ch.move) card._bInfo(`${ch.dx >= 0 ? '+' : ''}${ch.dx} m, ${ch.dz >= 0 ? '+' : ''}${ch.dz} m`); else if (ch.bend != null) card._bInfo(`${ch.bow} m`); }
        this.S._dirty = true; return;
      }
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
      } else if (this.tool === 'door' && card._bDoorKind === 'badge') card._bOp('badge', { x: this.snap(p[0], 0.1), z: this.snap(p[1], 0.1), level: lv });
      else if (this.tool === 'door' && card._bDoorKind === 'opening') {
        const W = this._onWall(p, card._bWidth('door'), 'opening');
        if (!W) card._toast(card._bT('Point at a wall'), true); else card._bOp('opening', { seg: W.seg, level: lv });
      } else if (this.tool === 'door' || this.tool === 'window') {
        const W = this._onWall(p, card._bWidth(this.tool), this.tool === 'window');
        if (!W) card._toast(card._bT('Point at a wall'), true);
        else if (!W.ok) card._toast(card._bT('Windows go in outer walls'), true);
        else card._bOp(this.tool, { seg: W.seg, level: lv, gate: W.fence || card._bDoorKind === 'gate' });
      } else if (this.tool === 'paint') { if (h.room) card._bOp('paint', { room: h.room }); }
      else if (this.tool === 'furniture') {
        if (card._bPiece) card._bOp('piece', { type: card._bPiece, x: this.snap(p[0], 0.1), z: this.snap(p[1], 0.1), room: this.roomAt(p[0], p[1])?.id || null, level: lv });
        else card._bSelect(null);
      } else if (this.tool === 'delete') { const what = this._target(p, h); if (what) card._bOp('delete', what); }
      else if (this.tool === 'select') {
        if (op?.item && op.to) card._bOp('moveitem', { k: op.item.k, i: op.item.i, ...op.to });
        else if (op?.h || op?.move) {
          const ch = op.ch;
          if (ch?.piece) card._bOp('piecesize', { sel: this.sel, box: ch.piece });
          else if (ch?.wend != null || ch?.wallMove) { if (!ch.wallMove || ch.dx || ch.dz) card._bOp('wallshape', { i: this.sel.i, ch }); }
          else if (op.h?.k === 'pcorner' || op.h?.k === 'wend' || op.h?.k === 'wmove') { /* a tap on a handle: nothing */ }
          else if (op.h?.k === 'mid' && (!ch || Math.hypot(p[0] - op.p0[0], p[1] - op.p0[1]) < 0.15)) card._bOp('shape', { room: this.sel.i, ch: { addCorner: op.h.i } }); // a tap on an edge: a new corner there
          else if (ch && !(ch.move && !ch.dx && !ch.dz)) card._bOp('shape', { room: this.sel.i, ch });
        } else card._bPick(this._target(p, h, true));
      }
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
