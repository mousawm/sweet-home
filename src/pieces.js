// Sweet Home — furniture pieces on the plan (config coordinates, metres): defaults for a new piece, footprints, turning
// and resizing. Shared by the card editor and the 3D Build mode.
import { movePiece } from './model.js';
export const N = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
export const r2 = v => Math.round(v * 100) / 100;
export const DIRS = ['n', 'e', 's', 'w'];
// pieces with a front (`facing`) and a size given as w (x) × d (z): a quarter turn swaps the two
export const FRONTED = ['toilet', 'sink', 'shower', 'bathtub', 'washer', 'towel'];
// furniture: defaults for a new piece, the colour key, and the fields of its form
export const NEW_PIECE = {
  bed: { width: 1.4, length: 2, head: 'n' }, sofa: { w: 2, d: 0.9, back: 'n' }, table: { w: 1.2, d: 0.8 }, chair: { face: 'n' },
  tv: { w: 1.4, h: 0.8, y: 0.6, facing: 's' }, lamp: { h: 1.5 }, fan: { radius: 0.6 }, marker: { y: 0.9 }, plant: { size: 0.8 },
  rug: { w: 2, d: 1.4 }, toilet: { w: 0.4, d: 0.65, facing: 's' }, sink: { w: 0.8, d: 0.5, h: 0.85, facing: 's' }, shower: { w: 0.9, d: 0.9, facing: 's' },
  bathtub: { w: 1.7, d: 0.75, facing: 's' }, washer: { w: 0.6, d: 0.6, h: 0.85, facing: 's' }, towel: { w: 0.5, d: 0.08, y: 0.4, facing: 's' }, ac: { facing: 's', style: 'wall' }, charger: { y: 0.75 }, nightstand: { w: 0.5, d: 0.4, h: 0.55, facing: 's' }, box: { w: 0.8, d: 0.5, h: 0.9 }, block: { w: 2, d: 0.6, h: 0.9 }, vacuum: {},
  car: { facing: 'n', color: '#2563eb' }, tree: { size: 1 }, sprinkler: { radius: 2 },
  hedge: { _span: [1, 0.2], h: 0.9 }, pool: { _span: [1.5, 1] },
  // pieces given by corners: [half width, half depth] around the tap
  stairs: { _span: [1, 0.5], axis: 'x', steps: 8 }, blinds: { _span: [0.6, 0] },
};
export const PALETTE = ['bed', 'sofa', 'table', 'chair', 'tv', 'ac', 'lamp', 'fan', 'blinds', 'vacuum', 'marker', 'plant', 'rug', 'nightstand', 'charger', 'toilet', 'sink', 'shower', 'bathtub', 'towel', 'washer', 'box', 'block', 'stairs', 'car', 'tree', 'hedge', 'pool', 'sprinkler'];
/* ---------------- furniture geometry on the plan (config coordinates, metres) ---------------- */
export function footprint(f) {
  const t = String(f.type || 'box').toLowerCase();
  if (f.from && f.to) {
    const r = [Math.min(f.from[0], f.to[0]), Math.min(f.from[1], f.to[1]), Math.max(f.from[0], f.to[0]), Math.max(f.from[1], f.to[1])];
    if (r[2] - r[0] < 0.1) { r[0] -= 0.06; r[2] += 0.06; } if (r[3] - r[1] < 0.1) { r[1] -= 0.06; r[3] += 0.06; } // a blind: a line along a wall
    return { rect: r };
  }
  const x = N(f.x, 0), z = N(f.z, 0);
  const circ = r => ({ circle: [x, z, r] });
  if (t === 'lamp') return circ(0.2 * N(f.size, 1));
  if (t === 'fan') return circ(N(f.radius, 0.6));
  if (t === 'marker') return circ(0.14);
  if (t === 'vacuum') return { rect: { s: [x - 0.2, z - 0.1, x + 0.2, z + 0.42], n: [x - 0.2, z - 0.42, x + 0.2, z + 0.1], e: [x - 0.1, z - 0.2, x + 0.42, z + 0.2], w: [x - 0.42, z - 0.2, x + 0.1, z + 0.2] }[f.facing || 's'] || [x - 0.2, z - 0.1, x + 0.2, z + 0.42] }; // dock + robot in front of it
  if (t === 'ac') { // the unit's size by style, the long side along the wall it blows away from
    const st = f.style || 'wall', ew = ['e', 'w'].includes(f.facing || 's'); const [a, b] = st === 'cassette' ? [0.6, 0.6] : st === 'floor' ? [0.45, 0.3] : [0.9, 0.22];
    const [w, d] = ew ? [b, a] : [a, b]; return { rect: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] };
  }
  if (t === 'tree') return circ(0.8 * N(f.size, 1));
  if (t === 'sprinkler') return circ(0.15);
  if (t === 'car') { const L = N(f.length, 4.3), W = N(f.width, 1.8), ew = ['e', 'w'].includes(f.facing); return { rect: ew ? [x - L / 2, z - W / 2, x + L / 2, z + W / 2] : [x - W / 2, z - L / 2, x + W / 2, z + L / 2] }; }
  if (t === 'plant') return circ(0.4 * N(f.size, 1));
  if (t === 'cylinder' || t === 'ball') return circ(N(f.radius, 0.2));
  let w, d;
  if (t === 'bed') { const across = N(f.width, 1.4), along = N(f.length, 2); [w, d] = ['e', 'w'].includes(f.head) ? [along, across] : [across, along]; }
  else if (t === 'chair') { w = d = 0.46; }
  else if (t === 'tv') { const s = N(f.w, 1.6); [w, d] = ['e', 'w'].includes(f.facing) ? [0.1, s] : [s, 0.1]; }
  else if (t === 'charger') { w = 0.1; d = 0.17; }
  else { const D = { table: [1.2, 0.8], rug: [2, 1.5], sofa: [2, 0.9], nightstand: [0.5, 0.4], toilet: [0.4, 0.65], sink: [0.8, 0.5], shower: [0.9, 0.9], bathtub: [1.7, 0.75], washer: [0.6, 0.6], towel: [0.5, 0.08] }[t] || [t === 'box' ? 0.5 : 1, t === 'box' ? 0.5 : 1]; w = N(f.w, D[0]); d = N(f.d, D[1]); }
  return { rect: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] };
}
export const fpBox = fp => fp.rect || [fp.circle[0] - fp.circle[2], fp.circle[1] - fp.circle[2], fp.circle[0] + fp.circle[2], fp.circle[1] + fp.circle[2]];
export const inBox = ([x, z], [a, b, c, d], pad = 0) => x >= a - pad && x <= c + pad && z >= b - pad && z <= d + pad;
// resize a piece to the rectangle x1,z1 – x2,z2 (or, for round pieces, to the distance from its centre)
export function sizePiece(f, x1, z1, x2, z2) {
  const t = String(f.type || 'box'); const w = r2(Math.abs(x2 - x1)), d = r2(Math.abs(z2 - z1)), cx = r2((x1 + x2) / 2), cz = r2((z1 + z2) / 2);
  if (w < 0.1 || d < 0.1) return;
  if (t === 'blinds' && f.from && f.to) { // a blind stays a line: only its length changes
    if (Math.abs(f.to[0] - f.from[0]) >= Math.abs(f.to[1] - f.from[1])) { f.from = [r2(Math.min(x1, x2)), f.from[1]]; f.to = [r2(Math.max(x1, x2)), f.from[1]]; }
    else { f.from = [f.from[0], r2(Math.min(z1, z2))]; f.to = [f.from[0], r2(Math.max(z1, z2))]; }
    return;
  }
  if (f.from && f.to) { f.from = [r2(Math.min(x1, x2)), r2(Math.min(z1, z2))]; f.to = [r2(Math.max(x1, x2)), r2(Math.max(z1, z2))]; return; }
  if (['lamp', 'fan', 'marker', 'plant', 'cylinder', 'ball', 'chair', 'charger', 'vacuum', 'tree', 'sprinkler', 'ac'].includes(t)) return;
  if (t === 'car') { const ew = ['e', 'w'].includes(f.facing); f.x = cx; f.z = cz; f.length = ew ? w : d; f.width = ew ? d : w; return; } // fixed size (or set in the form)
  f.x = cx; f.z = cz;
  if (t === 'bed') { const ew = ['e', 'w'].includes(f.head); f.width = ew ? d : w; f.length = ew ? w : d; }
  else if (t === 'tv') f.w = ['e', 'w'].includes(f.facing) ? d : w;
  else { f.w = w; f.d = d; }
}
// turn a piece a quarter to the right
// round pieces look the same whichever way they face: there is nothing to turn
export const ROUND = ['lamp', 'fan', 'marker', 'plant', 'tree', 'sprinkler', 'cylinder', 'ball'];
// a quarter turn clockwise: the side a piece faces moves on (n → e → s → w), its footprint swaps width and depth
export function turnPiece(f) {
  const t = String(f.type || 'box').toLowerCase(); if (ROUND.includes(t)) return false;
  const next = (v, d = 'n') => DIRS[(DIRS.indexOf(v || d) + 1) % 4];
  for (const k of ['head', 'back', 'face', 'facing']) if (k in f || (k === 'head' && t === 'bed') || (k === 'back' && t === 'sofa') || (k === 'face' && t === 'chair') || (k === 'facing' && ['tv', 'car', 'vacuum', 'nightstand', 'ac', ...FRONTED].includes(t))) f[k] = next(f[k], t === 'vacuum' ? 's' : 'n');
  if (t === 'stairs') f.axis = (f.axis || 'x') === 'x' ? 'z' : 'x'; // the flight climbs the other way too
  if (f.from && f.to) {
    const [a, b, c, d] = footprint(f).rect, cx = (a + c) / 2, cz = (b + d) / 2, hw = (c - a) / 2, hd = (d - b) / 2;
    f.from = [r2(cx - hd), r2(cz - hw)]; f.to = [r2(cx + hd), r2(cz + hw)];
  } else if (['box', 'nightstand', ...FRONTED, 'table', 'rug', 'block', 'sofa', 'stairs', 'counter', 'hedge', 'pool'].includes(t)) {
    const [a, b, c, d] = footprint(f).rect; f.w = r2(d - b); f.d = r2(c - a); // its size as drawn, also when it was the default size
  }
  return true;
}

// A piece close to a wall (up to 35 cm) is pulled flat against it: counters, cabinets, sofas, beds… go where a wall
// is, not a grid step away from it. It stops at the wall's inner face (walls are drawn on the room's edge lines).
// A toilet, sink, washer… (and a wall AC) also turns to face away from that wall. `segs`: the wall lines [x1, z1, x2, z2].
export function toWall(f, segs, again = false) {
  const t = String(f.type || 'box'); if (t === 'ac' && f.style === 'cassette') return; if (['lamp', 'fan', 'marker', 'plant', 'cylinder', 'ball', 'tree', 'sprinkler', 'rug', 'pool', 'car', 'blinds', 'stairs'].includes(t)) return;
  const b = fpBox(footprint(f)), MAG = 0.35, IN = 0.06; let dx = 0, dz = 0, bx = MAG, bz = MAG, fx = null, fz = null;
  for (const [x1, z1, x2, z2] of segs) {
    if (Math.abs(x1 - x2) < 1e-6) { // a wall along z at x = x1: the piece's left or right side goes to it
      if (Math.min(z1, z2) > b[3] - 0.05 || Math.max(z1, z2) < b[1] + 0.05) continue;
      for (const [d, fc] of [[x1 + IN - b[0], 'e'], [x1 - IN - b[2], 'w']]) if (Math.abs(d) < bx) { bx = Math.abs(d); dx = d; fx = fc; }
    } else if (Math.abs(z1 - z2) < 1e-6) { // a wall along x at z = z1
      if (Math.min(x1, x2) > b[2] - 0.05 || Math.max(x1, x2) < b[0] + 0.05) continue;
      for (const [d, fc] of [[z1 + IN - b[1], 's'], [z1 - IN - b[3], 'n']]) if (Math.abs(d) < bz) { bz = Math.abs(d); dz = d; fz = fc; }
    }
  }
  if ((t === 'ac' || FRONTED.includes(t)) && !again && (fx || fz)) { // a wall AC blows away from its wall; a toilet, sink, washer… faces away from it: turn it, then put it flat against that wall
    const fc = fx && (!fz || bx <= bz) ? fx : fz;
    if (fc !== (f.facing || 's')) { if (t === 'ac') f.facing = fc; else for (let k = 0; k < 3 && (f.facing || 's') !== fc; k++) turnPiece(f); return toWall(f, segs, true); }
  }
  if (dx || dz) movePiece(f, r2(dx), r2(dz));
}
