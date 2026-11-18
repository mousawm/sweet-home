/*
 * Sweet Home — visual card editor.
 * Steps: Rooms → Panels → Look. The Rooms step has four modes on one floor plan:
 *   Shape      draw rooms (drag on the grid), move and resize their rectangles
 *   Entities   what each room shows: found from its Home Assistant area, plus anything you add
 *   Furniture  place, move, resize and turn pieces, and link them to entities
 *   Doors      animated doors, windows, open passages and lock badges
 * Undo / redo cover every change. Everything it writes is plain YAML, so anything the editor doesn't cover can still be
 * added in the code editor and is kept untouched.
 */
import { t, setLang, isRTL } from './i18n.js';
import { registry, discoverRoom, roleOf, SINGLE_ROLES, roomIdOf, autoFurnitureConfig, wallsFromRooms, FURN_TYPES, furnEntities, arr, floorLevels, areaLevel, roomOutline, polyRects, polyArea, inPoly, lineOf, extraWalls, cutNear, cleanConfig } from './model.js';

// a room's shape as the card sees it: its outline (from `points`, bends cut into pieces) or null, and its rectangles
const shapeOf = r => { const poly = roomOutline(r); return { poly, rects: poly ? polyRects(poly) : arr(r.rects).map(q => q.map(Number)) }; };
const hasShape = r => !!(roomOutline(r) || arr(r.rects).length);
// ready-made shapes for a room, fitted into its box (x0, z0, width, depth). A third number on a corner bends the edge
// that starts there (metres it bows out of the room).
const SHAPES = [['rect', 'Rectangle'], ['l', 'L shape'], ['t', 'T shape'], ['u', 'U shape'], ['cut', 'Cut corner'], ['bay', 'Bay window'], ['curve', 'Curved wall'], ['round', 'Round']];
function shapePoints(kind, x0, z0, w, d) {
  const R = v => Math.round(v * 100) / 100, P = (u, v) => [R(x0 + u * w), R(z0 + v * d)];
  const c = Math.min(w, d);
  switch (kind) {
    case 'l': return [P(0, 0), P(1, 0), P(1, 0.5), P(0.5, 0.5), P(0.5, 1), P(0, 1)];
    case 't': return [P(0, 0), P(1, 0), P(1, 0.45), P(0.67, 0.45), P(0.67, 1), P(0.33, 1), P(0.33, 0.45), P(0, 0.45)];
    case 'u': return [P(0, 0), P(0.33, 0), P(0.33, 0.5), P(0.67, 0.5), P(0.67, 0), P(1, 0), P(1, 1), P(0, 1)];
    case 'cut': return [P(0, 0), P(1, 0), [R(x0 + w), R(z0 + d - c * 0.35)], [R(x0 + w - c * 0.35), R(z0 + d)], P(0, 1)];
    case 'bay': { const o = R(Math.min(0.9, d * 0.25)), s = w * 0.12; return [P(0, 0), P(1, 0), P(1, 1), P(0.7, 1), [R(x0 + w * 0.7 - s), R(z0 + d + o)], [R(x0 + w * 0.3 + s), R(z0 + d + o)], P(0.3, 1), P(0, 1)]; }
    case 'curve': return [P(0, 0), P(1, 0), [...P(1, 1), R(c * 0.3)], P(0, 1)];
    case 'round': { const r = c / 2, cx = x0 + w / 2, cz = z0 + d / 2; return [[R(cx - r), R(cz), R(r)], [R(cx + r), R(cz), R(r)]]; }
    default: return null;
  }
}
// the box a room takes (outline or rectangles)
const roomBox = r => { const { poly, rects } = shapeOf(r), xs = [], zs = []; for (const [x, z] of poly || []) { xs.push(x); zs.push(z); } for (const q of rects) { xs.push(q[0], q[2]); zs.push(q[1], q[3]); } return xs.length ? [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] : null; };
const WALL_TYPES = [['wall', 'Wall'], ['half', 'Half wall'], ['glass', 'Glass']];

const STEPS = [['rooms', 'Rooms', 'mdi:floor-plan'], ['panels', 'Panels', 'mdi:view-dashboard-outline'], ['look', 'Look', 'mdi:palette-outline']];
const MODES = [['shape', 'Shape', 'mdi:vector-square'], ['entities', 'Entities', 'mdi:devices'], ['furniture', 'Furniture', 'mdi:sofa-outline'], ['doors', 'Doors & windows', 'mdi:door']];
const PANELS = [
  ['security', 'Security', 'Alarm, locks, doors and cameras'],
  ['climate', 'Climate', 'Air conditioners, temperatures'],
  ['energy', 'Energy', 'Live power, history (from HA’s Energy settings)'],
  ['car', 'Electric car', 'Charging, battery, energy and cost (Energy tab)'],
  ['water', 'Water', 'Tank and pumps'],
  ['irrigation', 'Irrigation', 'Valves and schedule'],
  ['media', 'Media', 'TV, speakers'],
  ['media_server', 'Media Server', 'Jellyfin, Sonarr, Radarr, qBittorrent'],
  ['homelab', 'Home Lab', 'Proxmox VE node and guests'],
  ['attention', 'Needs Attention', 'Unavailable devices, low batteries, repairs, updates'],
  ['modes', 'Modes', 'One-tap buttons on the Home tab: guests, holiday, scenes, scripts'],
  ['devices', 'Devices', 'Batteries of phones, tablets, watches and other devices (System tab)'],
  ['people', 'People', 'Who shows at the top, and each person’s phone panel (long press their picture)'],
];
// room settings that hold entities, as the Entities mode shows them: [YAML key, title, key in the discovered set, icon]
const ROLES = [
  ['lights', 'Lights', 'lights', 'mdi:lightbulb-group'], ['climate', 'Air conditioner / thermostat', 'climate', 'mdi:air-conditioner'],
  ['temperature', 'Temperature', 'temp', 'mdi:thermometer'], ['humidity', 'Humidity', 'hum', 'mdi:water-percent'],
  ['motion', 'Motion & presence', 'motion', 'mdi:motion-sensor'], ['doors', 'Doors', 'doors', 'mdi:door'], ['locks', 'Locks', 'locks', 'mdi:lock'],
  ['plugs', 'Plugs', 'plugs', 'mdi:power-socket-eu'], ['fan', 'Fan', 'fan', 'mdi:fan'], ['media', 'TV / media player', 'media', 'mdi:television'],
  ['entities', 'Other', 'entities', 'mdi:dots-horizontal-circle-outline'],
];
const LIGHT_FX = [['', 'Ceiling light'], ['spots', 'Spots'], ['strip', 'LED strip'], ['tv', 'TV backlight']];
// entities worth offering in the "not in any room" list
const USEFUL = id => {
  const d = id.split('.')[0];
  return ['light', 'switch', 'fan', 'cover', 'climate', 'lock', 'media_player', 'script', 'scene', 'vacuum', 'valve', 'humidifier', 'input_boolean', 'button', 'camera'].includes(d) || d === 'sensor' || d === 'binary_sensor';
};
// furniture: defaults for a new piece, the colour key, and the fields of its form
const NEW_PIECE = {
  bed: { width: 1.4, length: 2, head: 'n' }, sofa: { w: 2, d: 0.9, back: 'n' }, table: { w: 1.2, d: 0.8 }, chair: { face: 'n' },
  tv: { w: 1.4, h: 0.8, y: 0.6, facing: 's' }, lamp: { h: 1.5 }, fan: { radius: 0.6 }, marker: { y: 0.9 }, plant: { size: 0.8 },
  rug: { w: 2, d: 1.4 }, charger: { y: 0.75 }, nightstand: { w: 0.5, d: 0.4, h: 0.55, facing: 's' }, box: { w: 0.8, d: 0.5, h: 0.9 }, block: { w: 2, d: 0.6, h: 0.9 }, vacuum: {},
  car: { facing: 'n', color: '#2563eb' }, tree: { size: 1 }, sprinkler: { radius: 2 },
  hedge: { _span: [1, 0.2], h: 0.9 }, pool: { _span: [1.5, 1] },
  // pieces given by corners: [half width, half depth] around the tap
  stairs: { _span: [1, 0.5], axis: 'x', steps: 8 }, blinds: { _span: [0.6, 0] },
};
const PALETTE = ['bed', 'sofa', 'table', 'chair', 'tv', 'lamp', 'fan', 'blinds', 'vacuum', 'marker', 'plant', 'rug', 'nightstand', 'charger', 'box', 'block', 'stairs', 'car', 'tree', 'hedge', 'pool', 'sprinkler'];
const COLOR_KEY = { table: 'top', bed: 'duvet', lamp: 'shade', fan: 'blade', blinds: 'shade' };
// pieces made of several parts: a colour for each of the other parts too, with the colour the 3D view uses by default
const PART_COLORS = {
  sofa: [['cushion', 'Seat cushions', '#64748b'], ['pillow', 'Pillows', '#e2e8f0']],
  bed: [['frame', 'Frame', '#7c5a3c'], ['headboard', 'Headboard', '#e8dcc8'], ['pillow', 'Pillows', '#ffffff']],
  table: [['leg', 'Legs', '#b7a684']], nightstand: [['top', 'Top', '#7c5a3c'], ['handle', 'Handles', '#d4b483']], chair: [['seat', 'Seat', '#334155']],
};
const DIRS = ['n', 'e', 's', 'w'];
const DIR_OPTS = [['n', 'North (up)'], ['e', 'East (right)'], ['s', 'South (down)'], ['w', 'West (left)']];
// option lists are translated when a form is drawn
const trOpts = schema => schema.map(x => (x.schema ? { ...x, schema: trOpts(x.schema) } : x.selector?.select ? { ...x, selector: { select: { ...x.selector.select, options: x.selector.select.options.map(o => ({ ...o, label: t(o.label) })) } } } : x));
const num = (o, step = 0.05, min = 0, max = 10, unit = 'm') => ({ number: { min, max, step, mode: 'box', unit_of_measurement: unit } });
const sel = opts => ({ select: { mode: 'dropdown', options: opts.map(([value, label]) => ({ value, label })) } });
const PIECE_FIELDS = {
  box: [['w', num()], ['d', num()], ['h', num()], ['y', num()]], nightstand: [['w', num()], ['d', num()], ['h', num()], ['facing', sel(DIR_OPTS)], ['drawers', num(0, 1, 1, 4, '')], ['lamp', { boolean: {} }], ['plug', { entity: { filter: { domain: ['switch', 'input_boolean'] } } }], ['power', { entity: { filter: { domain: 'sensor' } } }]], charger: [['y', num()], ['plug', { entity: { filter: { domain: ['switch', 'input_boolean'] } } }], ['power', { entity: { filter: { domain: 'sensor' } } }], ['charging_w', num(0, 0.5, 0, 50, 'W')]], block: [['h', num()], ['y', num()]], rug: [['w', num()], ['d', num()]],
  table: [['w', num()], ['d', num()], ['h', num()]], chair: [['face', sel(DIR_OPTS)]],
  sofa: [['back', sel(DIR_OPTS)], ['arms', sel([['both', 'Both'], ['start', 'Start'], ['end', 'End'], ['none', 'None']])]],
  bed: [['width', num()], ['length', num()], ['head', sel(DIR_OPTS)]], plant: [['size', num(0, 0.1, 0.2, 3, '×')]],
  tv: [['w', num()], ['h', num()], ['y', num()], ['facing', sel(DIR_OPTS)]], lamp: [['h', num()], ['size', num(0, 0.1, 0.3, 3, '×')]],
  fan: [['radius', num()], ['y', num()]], marker: [['y', num()]], blinds: [['y', num()], ['h', num()]],
  car: [['facing', sel(DIR_OPTS)], ['length', num()], ['width', num()]], vacuum: [['facing', sel(DIR_OPTS)]], tree: [['size', num(0, 0.1, 0.3, 4, '×')]], hedge: [['h', num()]], sprinkler: [['radius', num()]], cylinder: [['radius', num()], ['h', num()], ['y', num()]], ball: [['radius', num()], ['y', num()]],
  stairs: [['axis', sel([['x', 'Along x'], ['z', 'Along z']])], ['mode', sel([['up', 'Up'], ['down', 'Down'], ['split', 'Split']])], ['steps', num(0, 1, 2, 30, '')]],
};
const ENTITY_FILTER = { lamp: { domain: 'light' }, nightstand: { domain: ['light', 'switch', 'sensor', 'binary_sensor', 'media_player'] }, fan: { domain: 'fan' }, tv: { domain: 'media_player' }, blinds: { domain: 'cover' }, vacuum: { domain: 'vacuum' },
  car: { domain: ['binary_sensor', 'device_tracker', 'person', 'sensor', 'input_boolean'] }, sprinkler: { domain: ['valve', 'switch', 'input_boolean'] } };
const PIECE_LABELS = { plug: 'Phone charger plug (the phone shows while it charges)', power: 'Charger power sensor (found from the plug when empty)', charging_w: 'Charging above', drawers: 'Drawers', lamp: 'Table lamp on top', trunk: 'Trunk colour', d: 'Depth', h: 'Height', y: 'Height above the floor', width: 'Width', length: 'Length', head: 'Head of the bed', back: 'Back side', arms: 'Arms', face: 'Faces', facing: 'Screen faces', size: 'Size', radius: 'Radius', axis: 'Direction', mode: 'Mode', steps: 'Steps' };

const clone = o => JSON.parse(JSON.stringify(o || {}));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = v => Math.round(v * 100) / 100;
const N = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
const COLORS = ['#2dd4bf', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#fb923c', '#f87171', '#38bdf8', '#c084fc'];
const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return undefined; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb2hex = a => (Array.isArray(a) ? '#' + a.map(x => Math.round(x).toString(16).padStart(2, '0')).join('') : undefined);
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } } };
const entityId = e => (typeof e === 'string' ? e : e?.entity || e?.id);

/* ---------------- furniture geometry on the plan (config coordinates, metres) ---------------- */
function footprint(f) {
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
  else { const D = { table: [1.2, 0.8], rug: [2, 1.5], sofa: [2, 0.9], nightstand: [0.5, 0.4] }[t] || [t === 'box' ? 0.5 : 1, t === 'box' ? 0.5 : 1]; w = N(f.w, D[0]); d = N(f.d, D[1]); }
  return { rect: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] };
}
const fpBox = fp => fp.rect || [fp.circle[0] - fp.circle[2], fp.circle[1] - fp.circle[2], fp.circle[0] + fp.circle[2], fp.circle[1] + fp.circle[2]];
const inBox = ([x, z], [a, b, c, d], pad = 0) => x >= a - pad && x <= c + pad && z >= b - pad && z <= d + pad;
function movePiece(f, dx, dz) {
  if (f.from && f.to) { f.from = [r2(f.from[0] + dx), r2(f.from[1] + dz)]; f.to = [r2(f.to[0] + dx), r2(f.to[1] + dz)]; }
  else { f.x = r2(N(f.x, 0) + dx); f.z = r2(N(f.z, 0) + dz); }
}
// resize a piece to the rectangle x1,z1 – x2,z2 (or, for round pieces, to the distance from its centre)
function sizePiece(f, x1, z1, x2, z2) {
  const t = String(f.type || 'box'); const w = r2(Math.abs(x2 - x1)), d = r2(Math.abs(z2 - z1)), cx = r2((x1 + x2) / 2), cz = r2((z1 + z2) / 2);
  if (w < 0.1 || d < 0.1) return;
  if (t === 'blinds' && f.from && f.to) { // a blind stays a line: only its length changes
    if (Math.abs(f.to[0] - f.from[0]) >= Math.abs(f.to[1] - f.from[1])) { f.from = [r2(Math.min(x1, x2)), f.from[1]]; f.to = [r2(Math.max(x1, x2)), f.from[1]]; }
    else { f.from = [f.from[0], r2(Math.min(z1, z2))]; f.to = [f.from[0], r2(Math.max(z1, z2))]; }
    return;
  }
  if (f.from && f.to) { f.from = [r2(Math.min(x1, x2)), r2(Math.min(z1, z2))]; f.to = [r2(Math.max(x1, x2)), r2(Math.max(z1, z2))]; return; }
  if (['lamp', 'fan', 'marker', 'plant', 'cylinder', 'ball', 'chair', 'charger', 'vacuum', 'tree', 'sprinkler'].includes(t)) return;
  if (t === 'car') { const ew = ['e', 'w'].includes(f.facing); f.x = cx; f.z = cz; f.length = ew ? w : d; f.width = ew ? d : w; return; } // fixed size (or set in the form)
  f.x = cx; f.z = cz;
  if (t === 'bed') { const ew = ['e', 'w'].includes(f.head); f.width = ew ? d : w; f.length = ew ? w : d; }
  else if (t === 'tv') f.w = ['e', 'w'].includes(f.facing) ? d : w;
  else { f.w = w; f.d = d; }
}
// turn a piece a quarter to the right
// round pieces look the same whichever way they face: there is nothing to turn
const ROUND = ['lamp', 'fan', 'marker', 'plant', 'tree', 'sprinkler', 'cylinder', 'ball'];
// a quarter turn clockwise: the side a piece faces moves on (n → e → s → w), its footprint swaps width and depth
function turnPiece(f) {
  const t = String(f.type || 'box').toLowerCase(); if (ROUND.includes(t)) return false;
  const next = (v, d = 'n') => DIRS[(DIRS.indexOf(v || d) + 1) % 4];
  for (const k of ['head', 'back', 'face', 'facing']) if (k in f || (k === 'head' && t === 'bed') || (k === 'back' && t === 'sofa') || (k === 'face' && t === 'chair') || (k === 'facing' && ['tv', 'car', 'vacuum', 'nightstand'].includes(t))) f[k] = next(f[k], t === 'vacuum' ? 's' : 'n');
  if (t === 'stairs') f.axis = (f.axis || 'x') === 'x' ? 'z' : 'x'; // the flight climbs the other way too
  if (f.from && f.to) {
    const [a, b, c, d] = footprint(f).rect, cx = (a + c) / 2, cz = (b + d) / 2, hw = (c - a) / 2, hd = (d - b) / 2;
    f.from = [r2(cx - hd), r2(cz - hw)]; f.to = [r2(cx + hd), r2(cz + hw)];
  } else if (['box', 'nightstand', 'table', 'rug', 'block', 'sofa', 'stairs', 'counter', 'hedge', 'pool'].includes(t)) {
    const [a, b, c, d] = footprint(f).rect; f.w = r2(d - b); f.d = r2(c - a); // its size as drawn, also when it was the default size
  }
  return true;
}
const segDist = ([px, pz], [x1, z1, x2, z2]) => {
  const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz; let t = L ? ((px - x1) * dx + (pz - z1) * dz) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
};

class SweetHomeCardEditor extends HTMLElement {
  constructor() {
    super();
    this._step = 'rooms'; this._mode = 'shape'; this._sel = 0; this._grid = 0.5;
    this._rsel = null; this._fsel = null; this._place = null; this._dtool = 'door'; this._dsel = null; this._lvl = 0; this._extraLv = [];
    this._stool = 'rect'; this._psel = null; this._wsel = null;
    this._hist = []; this._fut = []; this._last = null; this._lastPush = 0;
    this._guideOff = store.get('sweet-home-guide-off') === '1';
    this.addEventListener('keydown', e => this._keys(e));
  }
  connectedCallback() { window.__sweetHomeEditor = this; }
  disconnectedCallback() { if (window.__sweetHomeEditor === this) delete window.__sweetHomeEditor; }
  // a change made in the card's 3D view (furniture dragged in arrange mode): taken like an edit here, with undo
  applyExternal(config) { this._config = cleanConfig(clone(config)); this._emit(); this._render(); }
  setConfig(config) {
    const j = JSON.stringify(config || {});
    if (j === this._last) return; // our own change coming back from Home Assistant: nothing to redraw (keeps the focus while typing)
    this._config = cleanConfig(clone(config)); this._last = j; this._render(); // empty or broken list items are left out
  }
  set hass(h) { const first = !this._hass; this._hass = h; setLang(this._config?.language || h?.locale?.language || h?.language); this._R = null; if (first) this._render(); else this.querySelectorAll('ha-form').forEach(f => { f.hass = h; }); }
  get _reg() { return (this._R ||= registry(this._hass)); }

  /* ---------------- config changes, undo / redo ---------------- */
  // `typing`: a change from a text field; changes within 0.8 s are one undo step
  _emit(typing) {
    const H = this._config.house;
    if (H && Array.isArray(H.rooms) && !H.rooms.length) delete H.rooms;
    if (H && !Object.keys(H).length) delete this._config.house;
    const j = JSON.stringify(this._config);
    if (j === this._last) return;
    const now = performance.now();
    if (!(typing && this._typing && now - this._lastPush < 800)) { this._hist.push(this._last); if (this._hist.length > 80) this._hist.shift(); }
    this._typing = !!typing; this._lastPush = now; this._fut = []; this._last = j;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: clone(this._config) }, bubbles: true, composed: true }));
    this._syncUndo();
  }
  _undo(redo) {
    const from = redo ? this._fut : this._hist, to = redo ? this._hist : this._fut;
    if (!from.length) return;
    to.push(this._last); const j = from.pop();
    this._config = JSON.parse(j || '{}'); this._last = j; this._typing = false;
    this._rsel = null; this._fsel = null; this._dsel = null;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: clone(this._config) }, bubbles: true, composed: true }));
    this._render();
  }
  _syncUndo() {
    const u = this.querySelector('[data-undo]'), r = this.querySelector('[data-redo]');
    if (u) u.disabled = !this._hist.length; if (r) r.disabled = !this._fut.length;
  }
  _keys(e) {
    const t = e.composedPath()[0]; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const mod = e.ctrlKey || e.metaKey; if (!mod) { if ((e.key === 'Delete' || e.key === 'Backspace') && this._step === 'rooms') this._deleteSelected(e); return; }
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); this._undo(e.shiftKey); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); this._undo(true); }
  }
  _deleteSelected(e) {
    const r = this._rooms[this._sel]; if (!r) return;
    if (this._mode === 'furniture' && this._fsel != null && Array.isArray(r.furniture)) { e.preventDefault(); r.furniture.splice(this._fsel, 1); this._fsel = null; }
    else if (this._mode === 'shape' && this._stool === 'draw' && this._draft?.length) { e.preventDefault(); this._draft.pop(); this._render(); return; }
    else if (this._mode === 'shape' && this._stool === 'wall' && this._wsel != null) { e.preventDefault(); this._H.extra_walls.splice(this._wsel, 1); if (!this._H.extra_walls.length) delete this._H.extra_walls; this._wsel = null; }
    else if (this._mode === 'shape' && r.points && this._psel != null) { e.preventDefault(); if (r.points.length > 3) r.points.splice(this._psel, 1); this._psel = null; }
    else if (this._mode === 'shape' && this._rsel != null && r.rects) { e.preventDefault(); r.rects.splice(this._rsel, 1); this._rsel = null; }
    else if (this._mode === 'doors' && this._dsel) { e.preventDefault(); this._delDoorItem(); }
    else return;
    this._emit(); this._render();
  }

  get _H() { return (this._config.house ||= {}); }
  get _rooms() { const H = this._H; H.rooms = H.rooms || []; return H.rooms; }
  _roomName(r, i) { return r.name || this._hass.areas?.[r.area]?.name || 'Room ' + (i + 1); }

  /* ---------------- floors ---------------- */
  // rooms, doors, badges carry `level`; window / opening segments carry it as a 5th item. No level = ground floor (0).
  _lvOf(o) { const v = Array.isArray(o) ? o[4] : o?.level; return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : 0; }
  _onLv(o) { return this._lvOf(o) === this._lvl; }
  _setLv(o, l) { if (Array.isArray(o)) { o.length = 4; if (l) o.push(l); } else if (l) o.level = l; else delete o.level; }
  _levels() {
    const H = this._H, set = new Set([0, this._lvl, ...this._rooms.map(r => this._lvOf(r)), ...arr(H.levels).map(l => Number(l.level)), ...this._extraLv]);
    const fl = floorLevels(this._reg);
    return [...set].sort((a, b) => a - b).map(l => {
      const given = arr(H.levels).find(x => Number(x.level) === l)?.name;
      const ha = Object.values(this._hass.floors || {}).find(f => fl[f.floor_id] === l)?.name;
      return { level: l, name: given || ha || (l === 0 ? 'Ground floor' : l < 0 ? 'Basement' : `Floor ${l}`), given: !!given };
    });
  }
  _floorBar(slot) {
    const L = this._levels(), cur = L.find(l => l.level === this._lvl);
    const bar = document.createElement('div'); bar.className = 'sh-ed'; bar.style.gap = '8px';
    bar.innerHTML = `<div class="sh-rooms"><span class="sh-hint" style="align-self:center">${t('Floor')}</span>${L.map(l => `<button data-lv="${l.level}" class="${l.level === this._lvl ? 'on' : ''}"><ha-icon icon="mdi:layers-outline"></ha-icon>${esc(l.given ? l.name : l.name.startsWith('Floor ') ? t('Floor {0}', l.level) : t(l.name))} <span class="sh-tag">${this._rooms.filter(r => this._lvOf(r) === l.level).length}</span></button>`).join('')}
      <button data-addlv title="Add a floor above"><ha-icon icon="mdi:layers-plus"></ha-icon>${t('Add floor')}</button></div>
      ${L.length > 1 ? `<div class="sh-row"><span class="sh-hint">${t('Name of this floor')}</span><input class="sh-search" style="flex:1;width:auto" data-lvname value="${esc(cur.given ? cur.name : '')}" placeholder="${esc(cur.name)}"></div>` : ''}`;
    slot.appendChild(bar);
    bar.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => this._goLevel(Number(b.dataset.lv))));
    bar.querySelector('[data-addlv]').addEventListener('click', () => { const l = Math.max(...L.map(x => x.level)) + 1; this._extraLv.push(l); this._goLevel(l); });
    bar.querySelector('[data-lvname]')?.addEventListener('change', e => {
      const H = this._H, v = e.target.value.trim(), list = arr(H.levels).filter(x => Number(x.level) !== this._lvl);
      if (v) list.push({ level: this._lvl, name: v });
      if (list.length) H.levels = list.sort((a, b) => a.level - b.level); else delete H.levels;
      this._emit(); this._render();
    });
  }
  _goLevel(l) {
    this._lvl = l; this._rsel = null; this._fsel = null; this._dsel = null;
    const i = this._rooms.findIndex(r => this._lvOf(r) === l); this._sel = i < 0 ? -1 : i;
    this._render();
  }

  _form(schema, data, onChange, labels = {}, typing = false) {
    const f = document.createElement('ha-form');
    f.hass = this._hass; f.data = data; f.schema = trOpts(schema);
    f.computeLabel = s => t(labels[s.name] || s.label || s.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()));
    f.addEventListener('value-changed', e => { e.stopPropagation(); onChange(e.detail.value, typing); });
    return f;
  }

  _render() {
    if (!this._config || !this._hass) return;
    this._R = null;
    this.innerHTML = `<style>
      .sh-ed{display:flex;flex-direction:column;gap:14px}
      .sh-steps,.sh-modes{display:flex;gap:6px;flex-wrap:wrap}
      .sh-steps button,.sh-modes button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;border-radius:10px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;cursor:pointer;min-height:40px}
      .sh-modes button{font-size:13px;padding:7px 8px;white-space:nowrap}
      .sh-shapes{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .sh-shapes button{width:44px;height:40px;padding:4px;border-radius:10px;border:1px solid var(--divider-color);background:none;color:var(--primary-color);cursor:pointer}
      .sh-shapes button:hover{background:rgba(127,127,127,.12)}
      .sh-shapes svg{width:100%;height:100%;display:block}
      .sh-ent input[type=number]{width:90px;padding:6px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .sh-steps button.on,.sh-modes button.on{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .sh-steps ha-icon,.sh-modes ha-icon{--mdc-icon-size:18px}
      .sh-hint{font-size:13px;color:var(--secondary-text-color);line-height:1.45}
      .sh-rooms{display:flex;flex-wrap:wrap;gap:6px}
      .sh-rooms button,.sh-chip{padding:6px 10px;border-radius:999px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:34px}
      .sh-rooms button.on{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color) inset}
      .sh-rooms i{width:10px;height:10px;border-radius:3px;display:inline-block}
      .sh-plan{direction:ltr}.sh-plan:focus{outline:none}.sh-plan:focus-visible{outline:2px solid var(--primary-color)}
      .sh-plan{width:100%;touch-action:none;background:var(--secondary-background-color);border-radius:12px;cursor:crosshair;user-select:none;-webkit-user-select:none;display:block}
      .sh-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sh-row button,.sh-btn{padding:7px 12px;border-radius:8px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;font-size:13px;cursor:pointer;min-height:36px;display:inline-flex;align-items:center;gap:6px}
      .sh-row button:disabled,.sh-btn:disabled{opacity:.4;cursor:default}
      .sh-btn ha-icon,.sh-row button ha-icon{--mdc-icon-size:18px}
      .sh-btn.del{color:var(--error-color)}.sh-btn.pri{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .sh-panel,.sh-box{border:1px solid var(--divider-color);border-radius:12px;padding:10px 12px}
      .sh-panel summary,.sh-box summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center;list-style:none}
      .sh-panel summary small{color:var(--secondary-text-color)}
      .sh-panel[open] summary,.sh-box[open] summary{margin-bottom:8px}
      .sh-warn{border-color:var(--warning-color,#ffa600);background:color-mix(in srgb,var(--warning-color,#ffa600) 8%,transparent)}
      .sh-warn li{margin:4px 0;cursor:pointer}.sh-warn ul{margin:0;padding-left:18px;font-size:13px}
      .sh-guide ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
      .sh-wiz{border-color:var(--primary-color)}.sh-wiz-name{font-size:18px;font-weight:600;margin:8px 0 4px}.sh-wiz-name small{display:block;font-size:12px;font-weight:400;color:var(--secondary-text-color)}
      .sh-wiz-name input{font:inherit;font-size:16px;width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
      .sh-wiz input[type=number]{width:70px;padding:6px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .sh-wiz select{padding:6px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .sh-shapes button.on{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .sh-guide li{display:flex;gap:10px;align-items:flex-start;font-size:13px}.sh-guide li>ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color);flex:none}
      .sh-guide li.done>ha-icon{color:var(--success-color,#43a047)}.sh-guide li b{display:block}.sh-guide li .sh-row{margin-top:6px}
      .sh-role{border-top:1px solid var(--divider-color);padding-top:10px}
      .sh-role h4{margin:0 0 6px;font-size:13px;display:flex;align-items:center;gap:6px;font-weight:600}.sh-role h4 ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color)}
      .sh-role h4 small{font-weight:400;color:var(--secondary-text-color)}.sh-role h4 a{font-weight:400;font-size:12px;color:var(--primary-color);cursor:pointer;margin-left:auto}
      .sh-ent{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:var(--secondary-background-color);margin-bottom:6px;flex-wrap:wrap;font-size:13px}
      .sh-namebox{display:flex;align-items:center;gap:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);padding:0 8px;margin-bottom:3px;cursor:text}
      .sh-namebox:focus-within{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color) inset}.sh-namebox ha-icon{--mdc-icon-size:16px;color:var(--secondary-text-color);flex:none}
      .sh-rename{font:inherit;font-size:13px;color:var(--primary-text-color);background:transparent;border:0;padding:7px 0;width:100%;min-width:0;outline:none}
      .sh-ent .nm{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis}.sh-ent .nm small{display:block;color:var(--secondary-text-color);font-size:11px}
      .sh-ent.bad .nm small{color:var(--error-color)}
      .sh-ent select{font:inherit;font-size:12px;padding:4px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
      .sh-ent label{font-size:12px;display:flex;align-items:center;gap:3px;color:var(--secondary-text-color)}
      .sh-x{border:0;background:none;color:var(--secondary-text-color);cursor:pointer;padding:6px;border-radius:50%;display:inline-flex}.sh-x ha-icon{--mdc-icon-size:18px}
      .sh-sugg{display:flex;flex-wrap:wrap;gap:6px}.sh-sugg .sh-chip ha-icon{--mdc-icon-size:16px}
      .sh-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px}
      .sh-pal button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;border-radius:10px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;font-size:12px;cursor:pointer}
      .sh-pal button.on{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 14%,transparent)}
      .sh-search{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
      .sh-tag{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--divider-color);color:var(--secondary-text-color)}
    </style>
    <div class="sh-ed" dir="${isRTL() ? 'rtl' : 'ltr'}">
      <div class="sh-steps">${STEPS.map(([k, n, i]) => `<button data-step="${k}" class="${this._step === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('')}</div>
      <div class="sh-body"></div>
    </div>`;
    this.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { this._step = b.dataset.step; this._render(); }));
    const body = this.querySelector('.sh-body');
    ({ rooms: () => this._rRooms(body), panels: () => this._rPanels(body), look: () => this._rLook(body) })[this._step]();
  }

  /* ================================================================ */
  /* Rooms step                                                        */
  /* ================================================================ */
  _rRooms(body) {
    const rooms = this._rooms;
    if (this._sel >= rooms.length) this._sel = 0;
    // the selected room must be on the floor being edited
    if (rooms[this._sel] && !this._onLv(rooms[this._sel])) {
      if (this._levelFollowsRoom) this._lvl = this._lvOf(rooms[this._sel]);
      else { const i = rooms.findIndex(x => this._onLv(x)); this._sel = i < 0 ? -1 : i; }
    }
    this._levelFollowsRoom = false;
    const r = rooms[this._sel];
    const here = rooms.map((x, i) => [x, i]).filter(([x]) => this._onLv(x));
    body.innerHTML = `<div class="sh-ed">
      <div class="sh-guide-slot"></div>
      <div class="sh-warn-slot"></div>
      <div class="sh-row"><button data-undo title="${t('Undo')} (Ctrl+Z)"><ha-icon icon="mdi:undo"></ha-icon>${t('Undo')}</button><button data-redo title="${t('Redo')} (Ctrl+Shift+Z)"><ha-icon icon="mdi:redo"></ha-icon>${t('Redo')}</button>
        <span style="flex:1"></span>${rooms.length ? `<span class="sh-hint">${t('Grid')}</span><button data-grid title="Snap size">${this._grid} m</button>` : ''}</div>
      <div class="sh-floors"></div>
      <div class="sh-rooms">${here.map(([x, i]) => `<button data-room="${i}" class="${i === this._sel ? 'on' : ''}"><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(this._roomName(x, i))}</button>`).join('')}
        <button data-add>${t('+ Add room')}</button>${this._freeAreas().length && !this._wiz ? `<button data-wiz>${t('+ Room by room')}</button>` : ''}${this._freeAreas().length ? `<button data-import>${rooms.length ? t('+ Add my other areas ({0})', this._freeAreas().length) : t('Add all my areas')}</button>` : ''}</div>
      ${rooms.length && !r ? `<div class="sh-hint">${t('No rooms on this floor yet: add one, or add your areas.')}</div>` : ''}
      ${r ? `<div class="sh-modes">${MODES.map(([k, n, i]) => `<button data-mode="${k}" class="${this._mode === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('')}</div>` : ''}
      ${r ? `<div class="sh-hint sh-modehint"></div>` : rooms.length ? '' : '<div class="sh-hint">No rooms yet: the card builds a simple house from your Home Assistant areas on its own. Add rooms to draw your real floor plan.</div>'}
      ${r && this._mode !== 'entities' ? '<svg class="sh-plan"></svg>' : ''}
      <div class="sh-mode"></div>
    </div>`;
    if (this._wiz) this._wizard(body.querySelector('.sh-guide-slot')); else this._guide(body.querySelector('.sh-guide-slot'));
    if (rooms.length) this._floorBar(body.querySelector('.sh-floors'));
    this._warnings(body.querySelector('.sh-warn-slot'));
    body.querySelector('[data-undo]').addEventListener('click', () => this._undo());
    body.querySelector('[data-redo]').addEventListener('click', () => this._undo(true));
    this._syncUndo();
    body.querySelector('[data-grid]')?.addEventListener('click', () => { this._grid = this._grid === 0.5 ? 0.25 : this._grid === 0.25 ? 1 : 0.5; this._render(); });
    body.querySelector('[data-add]').addEventListener('click', () => {
      const nr = { name: `Room ${rooms.length + 1}`, rects: [] }; this._setLv(nr, this._lvl); rooms.push(nr); this._sel = rooms.length - 1; this._mode = 'shape'; this._rsel = null; this._emit(); this._render();
    });
    body.querySelector('[data-import]')?.addEventListener('click', () => this._importAreas());
    body.querySelector('[data-wiz]')?.addEventListener('click', () => this._wizStart());
    body.querySelectorAll('[data-room]').forEach(b => b.addEventListener('click', () => this._pickRoom(+b.dataset.room)));
    body.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { this._mode = b.dataset.mode; this._place = null; this._fsel = null; this._dsel = null; this._rsel = null; if (this._mode === 'entities') this._seenEnt = true; this._render(); }));
    if (!r) return;
    const hint = body.querySelector('.sh-modehint');
    const rn = this._roomName(r, this._sel);
    hint.textContent = {
      shape: this._stool === 'wall' ? t('Drag on the grid to draw a separate wall, in any direction (one square = {0} m).', this._grid)
        : this._stool === 'draw' ? t('Drawing the walls of {0}: tap each corner on the plan (one square = {1} m).', rn, this._grid)
        : r.points ? t('Drag the corners of {0} to reshape it, drag inside it to move it. Pick a ready-made shape below to start over.', rn)
        : t('Drag on an empty part of the grid to draw {0} (one square = {1} m). Drag again to add another rectangle (L-shapes). Drag a rectangle to move it, its corner dots to resize it. Tap another room to switch.', rn, this._grid),
      entities: t("What {0} shows in its popup. Devices in its Home Assistant area are found on their own; remove what you don't want or add anything else.", rn),
      furniture: this._place ? t('Tap the plan where it goes: {0}.', t(FURN_TYPES[this._place][0])) : t('Pick a piece below, then tap the plan to place it. Drag a piece to move it and its corner dot to resize it. Link it to an entity so it can be tapped in the 3D view.'),
      doors: t({ door: 'Drag along a wall to add a door. Pick its contact sensor to make it swing open in 3D.', window: 'Drag along an outer wall to add a window.', opening: 'Drag along a wall between two rooms to open it (no wall, no doorway).', badge: 'Tap where a small lock badge should float.' }[this._dtool]),
    }[this._mode];
    const svg = body.querySelector('.sh-plan');
    if (svg) { svg.setAttribute('tabindex', '0'); svg.setAttribute('aria-label', 'Floor plan'); this._bounds(); this._drawPlan(svg); this._planInput(svg); }
    const box = body.querySelector('.sh-mode');
    ({ shape: () => this._mShape(box, r), entities: () => this._mEntities(box, r), furniture: () => this._mFurniture(box, r), doors: () => this._mDoors(box) })[this._mode]();
  }
  _pickRoom(i) { if (i !== this._sel) { this._sel = i; this._rsel = null; this._fsel = null; } this._render(); }

  // areas that are not linked to a room yet
  _freeAreas() {
    const used = new Set(this._rooms.map(r => r.area).filter(Boolean));
    const floorLevel = a => this._hass.floors?.[this._hass.areas[a]?.floor_id]?.level ?? 0;
    return Object.values(this._hass.areas || {}).filter(a => !used.has(a.area_id))
      .sort((a, b) => floorLevel(a.area_id) - floorLevel(b.area_id) || String(a.name).localeCompare(b.name));
  }
  // every area becomes a 4 × 4 m room, in rows next to (or, the first time, instead of) the rooms already drawn
  // (areas on a Home Assistant floor go to that floor's level; the others to the floor being edited)
  _importAreas() {
    const rooms = this._rooms, free = this._freeAreas(); if (!free.length) return;
    const R = this._reg, byLv = new Map();
    for (const a of free) { const l = areaLevel(R, a.area_id) ?? this._lvl; (byLv.get(l) || byLv.set(l, []).get(l)).push(a); }
    const first = rooms.length;
    for (const [l, list] of byLv) {
      const all = rooms.filter(r => this._lvOf(r) === l).map(roomBox).filter(Boolean);
      const ox = all.length ? Math.max(...all.map(q => Math.max(q[0], q[2]))) + 1 : 0;
      const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.3)));
      list.forEach((a, i) => { const nr = { area: a.area_id, rects: [[ox + (i % cols) * 4, Math.floor(i / cols) * 4, ox + (i % cols) * 4 + 4, Math.floor(i / cols) * 4 + 4]] }; this._setLv(nr, l); rooms.push(nr); });
    }
    this._sel = first; this._lvl = this._lvOf(rooms[first]); this._emit(); this._render();
  }

  /* ---------------- room by room ---------------- */
  // A guide through the Home Assistant areas, one at a time: add it (shape, size, which side of the last room it goes)
  // or skip it; a room that is no area can be added on the way. Stop whenever you like; the rooms added stay.
  _wizStart() {
    const list = this._freeAreas().map(a => a.area_id);
    this._wiz = { list, i: 0, shape: 'rect', side: 'right', added: 0, skipped: 0 };
    this._wizSize(); this._mode = 'shape'; this._render();
  }
  // a size that suits the room's name (metres): a starting point, changed in the guide or later on the plan
  _wizSize() {
    const W = this._wiz, a = W.list[W.i], n = String(a ? this._hass.areas[a]?.name || a : W.custom || '').toLowerCase();
    const S = [[/living|lounge|salon|family/, 5, 4], [/kitchen/, 3.5, 3], [/dining/, 3.5, 3], [/master|parent/, 4.5, 4], [/bed|kid|child|nursery|guest/, 4, 3.5], [/bath|toilet|wc|shower|powder/, 2.5, 2],
      [/hall|corridor|landing|entr|lobby/, 1.5, 4], [/office|study|work/, 3, 3], [/garage|parking|carport/, 6, 3.5], [/garden|yard/, 8, 5], [/balcony|terrace|patio/, 3, 1.5], [/stair/, 2, 4], [/laundry|storage|closet|pantry|utility/, 2, 2]];
    const m = S.find(([re]) => re.test(n)) || [0, 4, 4]; W.w = m[1]; W.d = m[2];
  }
  _wizard(slot) {
    const W = this._wiz, R = this._reg, a = W.list[W.i], area = a ? this._hass.areas[a] : null, left = W.list.length - W.i;
    const lvl = a ? areaLevel(R, a) ?? this._lvl : this._lvl, floorName = this._levels().find(l => l.level === lvl)?.name || '';
    const anchors = this._rooms.map((r, i) => [r, i]).filter(([r]) => this._lvOf(r) === lvl && roomBox(r));
    if (W.anchor == null || !this._rooms[W.anchor] || this._lvOf(this._rooms[W.anchor]) !== lvl) W.anchor = anchors.length ? anchors[anchors.length - 1][1] : null;
    const prev = k => { if (k === 'rect') return 'M 0 0 L 1.4 0 L 1.4 1 L 0 1 Z'; const o = roomOutline({ points: shapePoints(k, 0, 0, 1.4, 1) }); return 'M ' + o.map(([x, z]) => `${r2(x)} ${r2(z)}`).join(' L ') + ' Z'; };
    const box = document.createElement('div'); box.className = 'sh-box sh-wiz';
    box.innerHTML = `<div class="sh-row"><b style="flex:1">${t('Room by room')}</b><span class="sh-hint">${t('{0} added · {1} skipped · {2} to go', W.added, W.skipped, left)}</span></div>
      ${a || W.customing ? `<div class="sh-wiz-name">${a ? esc(area?.name || a) : `<input data-wname placeholder="${t('Name of the room')}" value="${esc(W.custom || '')}">`}${floorName && this._levels().length > 1 ? `<small>${esc(floorName)}</small>` : ''}</div>
      <div class="sh-hint">${t('Shape')}</div>
      <div class="sh-shapes">${SHAPES.map(([k, n]) => `<button data-wshape="${k}" class="${W.shape === k ? 'on' : ''}" title="${t(n)}" aria-label="${t(n)}"><svg viewBox="-0.15 -0.15 1.7 1.6"><path d="${prev(k)}" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width=".07" stroke-linejoin="round"/></svg></button>`).join('')}</div>
      <div class="sh-row" style="margin-top:6px"><button class="sh-btn" data-wturn title="${t('Turn a quarter clockwise')}"><ha-icon icon="mdi:rotate-right"></ha-icon>${t('Turn')}${W.rot ? ` · ${W.rot * 90}°` : ''}</button></div>
      <div class="sh-row" style="margin-top:8px"><span class="sh-hint">${t('Size')}</span><input data-ww type="number" min="0.5" max="30" step="0.5" value="${W.w}"><span class="sh-hint">×</span><input data-wd type="number" min="0.5" max="30" step="0.5" value="${W.d}"><span class="sh-hint">m</span></div>
      ${anchors.length ? `<div class="sh-row"><span class="sh-hint">${t('Place it')}</span><select data-wside>${[['right', 'to the right of'], ['below', 'below'], ['left', 'to the left of'], ['above', 'above']].map(([v, l]) => `<option value="${v}" ${W.side === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
        <select data-wanchor>${anchors.map(([r, i]) => `<option value="${i}" ${W.anchor === i ? 'selected' : ''}>${esc(this._roomName(r, i))}</option>`).join('')}</select></div>` : `<div class="sh-hint">${t('The first room goes at the top left of the plan.')}</div>`}
      <div class="sh-row" style="margin-top:8px"><button class="sh-btn pri" data-wadd><ha-icon icon="mdi:plus"></ha-icon>${t('Add to the map')}</button>${a ? `<button class="sh-btn" data-wskip><ha-icon icon="mdi:skip-next"></ha-icon>${t('Skip')}</button>` : ''}<span style="flex:1"></span><button class="sh-btn" data-wend>${t('Finish')}</button></div>`
      : `<div class="sh-hint" style="margin:6px 0">${W.added ? t('That was the last area. Drag the rooms on the plan to fine-tune them, then add doors, devices and furniture.') : t('No areas left to add.')}</div>
      <div class="sh-row"><button class="sh-btn pri" data-wend>${t('Finish')}</button></div>`}
      ${!W.customing ? `<div class="sh-row" style="margin-top:6px"><button class="sh-btn" data-wcustom style="font-size:12px"><ha-icon icon="mdi:pencil-plus"></ha-icon>${t('Add a room that isn’t an area')}</button></div>` : ''}
      <div class="sh-hint" style="margin-top:6px">${t('After adding, drag the room on the plan below to move it or its corners to resize it.')}</div>`;
    slot.appendChild(box);
    const q = s => box.querySelector(s);
    box.querySelectorAll('[data-wshape]').forEach(b => b.addEventListener('click', () => { W.shape = b.dataset.wshape; this._render(); }));
    q('[data-ww]')?.addEventListener('change', e => { W.w = Math.max(0.5, Number(e.target.value) || W.w); this._render(); });
    q('[data-wd]')?.addEventListener('change', e => { W.d = Math.max(0.5, Number(e.target.value) || W.d); this._render(); });
    q('[data-wside]')?.addEventListener('change', e => { W.side = e.target.value; this._render(); });
    q('[data-wanchor]')?.addEventListener('change', e => { W.anchor = Number(e.target.value); this._render(); });
    q('[data-wname]')?.addEventListener('input', e => { W.custom = e.target.value; });
    q('[data-wskip]')?.addEventListener('click', () => { W.i++; W.skipped++; W.shape = 'rect'; W.rot = 0; this._wizSize(); this._render(); });
    q('[data-wturn]')?.addEventListener('click', () => { W.rot = ((W.rot || 0) + 1) % 4; this._render(); });
    q('[data-wend]').addEventListener('click', () => { this._wiz = null; this._render(); });
    q('[data-wcustom]')?.addEventListener('click', () => { W.customing = true; W.list.splice(W.i, 0, null); W.custom = ''; this._render(); });
    q('[data-wadd]')?.addEventListener('click', () => this._wizAdd(a, lvl));
  }
  // the room goes beside the chosen one, on the chosen side; if something is already there it moves further along
  // where the next room goes: beside the chosen room, moved further along while something is already there
  // the guide's shape turned a quarter `rot` times (clockwise): its points at x, z, and its width and depth as turned
  _wizDims() { const W = this._wiz; return W.rot % 2 ? [W.d, W.w] : [W.w, W.d]; }
  _wizPts(x, z) {
    const W = this._wiz; if (W.shape === 'rect') return null;
    let P = shapePoints(W.shape, 0, 0, W.w, W.d);
    for (let k = 0; k < (W.rot || 0) % 4; k++) { const b = roomBox({ points: P }); P = P.map(q => [r2(b[0] + (b[3] - q[1])), r2(b[1] + (q[0] - b[0])), ...q.slice(2)]); }
    const b = roomBox({ points: P }); return P.map(q => [r2(q[0] - b[0] + x), r2(q[1] - b[1] + z), ...q.slice(2)]);
  }
  _wizSpot(lvl) {
    const W = this._wiz, rooms = this._rooms, [w, d] = this._wizDims();
    const ab = W.anchor != null && rooms[W.anchor] ? roomBox(rooms[W.anchor]) : null;
    let [x, z] = !ab ? [0, 0] : { right: [ab[2], ab[1]], below: [ab[0], ab[3]], left: [ab[0] - w, ab[1]], above: [ab[0], ab[1] - d] }[W.side];
    const step = { right: [0.5, 0], below: [0, 0.5], left: [-0.5, 0], above: [0, -0.5] }[W.side] || [0.5, 0];
    const taken = rooms.filter(r => this._lvOf(r) === lvl).map(roomBox).filter(Boolean);
    const hits = (x0, z0) => taken.some(b => x0 < b[2] - 1e-6 && x0 + w > b[0] + 1e-6 && z0 < b[3] - 1e-6 && z0 + d > b[1] + 1e-6);
    for (let k = 0; k < 200 && hits(x, z); k++) { x += step[0]; z += step[1]; }
    return [r2(x), r2(z)];
  }
  _wizAdd(a, lvl) {
    const W = this._wiz, rooms = this._rooms, [w, d] = this._wizDims();
    const [x, z] = this._wizSpot(lvl);
    const nr = a ? { area: a } : { name: (W.custom || '').trim() || `${t('Room')} ${rooms.length + 1}` };
    if (W.shape === 'rect') nr.rects = [[x, z, r2(x + w), r2(z + d)]]; else nr.points = this._wizPts(x, z);
    this._setLv(nr, lvl); rooms.push(nr);
    this._sel = rooms.length - 1; this._lvl = lvl; W.anchor = this._sel; W.added++; W.i++; W.shape = 'rect'; W.rot = 0; W.customing = false; W.custom = '';
    if (!a) W.list.splice(W.i - 1, 1), W.i--; // the extra room was no area: the list goes on where it was
    this._wizSize(); this._emit(); this._render();
  }

  /* ---------------- setup guide ---------------- */
  _guide(slot) {
    const rooms = this._rooms, H = this._H;
    if (this._mode === 'shape' && rooms.length) this._seenShape = true;
    const steps = [
      ['Add your rooms', 'Go through your Home Assistant areas one by one: pick the ones you want, give each a shape and a size, and place it next to the last one. Skip any, stop when you like.', rooms.length > 0,
        this._freeAreas().length ? [['wizard', 'mdi:map-marker-path', 'Add my rooms one by one', true], ...(!rooms.length ? [['import', 'mdi:import', 'Add all my areas']] : [])] : []],
      ['Draw each room', 'In Shape mode, move and resize the squares into your floor plan. Draw more rectangles for L-shaped rooms.', rooms.length > 0 && rooms.every(hasShape) && this._seenShape,
        [['go-shape', 'mdi:vector-square', 'Open Shape']]],
      ['Check each room’s devices', 'Entities mode shows what every room found in its area. Remove extras, add what is missing.', !!this._seenEnt,
        [['go-ent', 'mdi:devices', 'Open Entities']]],
      ['Add furniture', 'Suggest a set from the room names, then move pieces and link lamps, TVs or fans to their entities.', rooms.some(r => Array.isArray(r.furniture) && r.furniture.length) || !!H.auto_furniture,
        [['suggest-all', 'mdi:auto-fix', 'Suggest furniture for all rooms', true], ['go-furn', 'mdi:sofa-outline', 'Open Furniture']]],
      ['Try it', 'The preview next to this editor updates as you go: tap a room or a piece there to see its popup.', false, []],
    ];
    const done = steps.slice(0, 4).every(s => s[2]);
    if (this._guideOff && rooms.length) return;
    if (done && !this._guideOpen) return;
    const det = document.createElement('details'); det.className = 'sh-box sh-guide'; det.open = !rooms.length || !this._guideClosed;
    det.innerHTML = `<summary><b>${t('Setup guide')}</b><span class="sh-hint">${t('{0} of 4 done', steps.slice(0, 4).filter(x => x[2]).length)}</span></summary>
      <ol>${steps.map(([title, d, ok, btns]) => `<li class="${ok ? 'done' : ''}"><ha-icon icon="${ok ? 'mdi:check-circle' : 'mdi:circle-outline'}"></ha-icon><div><b>${t(title)}</b><span class="sh-hint">${t(d)}</span>
        ${btns.length ? `<div class="sh-row">${btns.map(([k, i, n, pri]) => `<button class="sh-btn ${pri ? 'pri' : ''}" data-g="${k}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('')}</div>` : ''}</div></li>`).join('')}</ol>
      ${rooms.length ? `<div class="sh-row" style="margin-top:8px"><span style="flex:1"></span><button class="sh-btn" data-g="off">${t('Hide the guide')}</button></div>` : ''}`;
    det.addEventListener('toggle', () => { this._guideClosed = !det.open; });
    slot.appendChild(det);
    det.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.g;
      if (k === 'import') return this._importAreas();
      if (k === 'wizard') return this._wizStart();
      if (k === 'off') { this._guideOff = true; store.set('sweet-home-guide-off', '1'); return this._render(); }
      if (k === 'suggest-all') { for (const [i, x] of rooms.entries()) if (!Array.isArray(x.furniture) && hasShape(x)) x.furniture = autoFurnitureConfig(x, this._roomName(x, i)); this._emit(); this._mode = 'furniture'; return this._render(); }
      this._mode = { 'go-shape': 'shape', 'go-ent': 'entities', 'go-furn': 'furniture' }[k];
      if (this._mode === 'entities') this._seenEnt = true;
      this._render();
    }));
  }

  /* ---------------- warnings ---------------- */
  _problems() {
    const R = this._reg, rooms = this._rooms, H = this._H, out = [];
    const has = id => !!this._hass.states[id];
    const areaRoom = {}; rooms.forEach((r, i) => { if (r.area) areaRoom[r.area] = i; });
    rooms.forEach((r, i) => {
      const nm = this._roomName(r, i);
      if (!hasShape(r)) out.push([i, `${nm} has no shape yet: draw it in Shape mode, or it won't show.`]);
      if (r.area && !this._hass.areas?.[r.area]) out.push([i, `${nm} is linked to an area that no longer exists (${r.area}).`]);
      const first = r.area ? rooms.findIndex(x => x.area === r.area) : -1;
      if (first >= 0 && first < i) out.push([i, `${nm} and ${this._roomName(rooms[first], first)} are both linked to the area ${this._hass.areas?.[r.area]?.name || r.area}: its devices show in both. Link one of them to another area, or to none.`]);
      for (const [key] of ROLES) {
        if (r[key] === undefined || r[key] === null) continue;
        for (const e of arr(r[key])) {
          const id = entityId(e); if (!id) continue;
          if (!has(id)) { out.push([i, `${nm}: ${id} was not found.`]); continue; }
          const a = R.areaOf(id); if (a && r.area && a !== r.area && areaRoom[a] != null) out.push([i, `${nm}: ${R.name(id)} is in the area of ${this._roomName(rooms[areaRoom[a]], areaRoom[a])}.`]);
        }
      }
      for (const f of arr(r.furniture)) for (const id of furnEntities(f)) if (!has(id)) out.push([i, `${nm}: the ${String(FURN_TYPES[f.type]?.[0] || f.type).toLowerCase()} is linked to ${id}, which was not found.`]);
    });
    arr(H.doors).forEach(d => { if (d.entity && !has(d.entity)) out.push([null, `Door sensor ${d.entity} was not found.`]); });
    arr(H.lock_badges).forEach(b => { const l = b.lock || b.entity; if (!l) out.push([null, 'A lock badge has no lock yet.']); else if (!has(l)) out.push([null, `Lock ${l} was not found.`]); });
    return out;
  }
  _warnings(slot) {
    const list = this._problems(); if (!list.length) return;
    const det = document.createElement('details'); det.className = 'sh-box sh-warn'; det.open = !!this._warnOpen;
    det.innerHTML = `<summary><b>${t(list.length > 1 ? '{0} things to check' : '{0} thing to check', list.length)}</b><ha-icon icon="mdi:alert-outline"></ha-icon></summary><ul>${list.map(([i, t]) => `<li data-w="${i ?? ''}">${esc(t)}</li>`).join('')}</ul>`;
    det.addEventListener('toggle', () => { this._warnOpen = det.open; });
    det.querySelectorAll('[data-w]').forEach(li => li.addEventListener('click', () => { if (li.dataset.w === '') { this._mode = 'doors'; } else { this._sel = +li.dataset.w; this._levelFollowsRoom = true; if (/not found|area of/.test(li.textContent)) this._mode = /the \w+ is linked/.test(li.textContent) ? 'furniture' : 'entities'; else this._mode = 'shape'; } this._render(); }));
    slot.appendChild(det);
  }

  /* ---------------- the floor plan ---------------- */
  _bounds() {
    const H = this._H, xs = [0, 12], zs = [0, 9];
    for (const r of this._rooms) {
      const b = roomBox(r); if (b) { xs.push(b[0], b[2]); zs.push(b[1], b[3]); }
      for (const f of arr(r.furniture)) { const b = fpBox(footprint(f)); xs.push(b[0], b[2]); zs.push(b[1], b[3]); }
    }
    for (const d of arr(H.doors)) for (const p of [d.from, d.to]) if (p) { xs.push(p[0]); zs.push(p[1]); }
    for (const w of extraWalls(H.extra_walls)) { xs.push(w[0], w[2]); zs.push(w[1], w[3]); }
    if (this._wiz) { const [x0, z0] = this._wizSpot(this._lvl), [ww, wd] = this._wizDims(); xs.push(x0, x0 + ww); zs.push(z0, z0 + wd + 1); } // the next room's preview fits too
    this._B = { minX: Math.min(...xs) - 1, minZ: Math.min(...zs) - 1, maxX: Math.max(...xs) + 2, maxZ: Math.max(...zs) + 2, S: 40 };
  }
  _drawPlan(svg) {
    const B = this._B, S = B.S, H = this._H, rooms = this._rooms, g = this._grid;
    const X = x => r2((x - B.minX) * S), Z = z => r2((z - B.minZ) * S);
    svg.setAttribute('viewBox', `0 0 ${(B.maxX - B.minX) * S} ${(B.maxZ - B.minZ) * S}`);
    let h = '';
    const x0 = Math.ceil(B.minX / g) * g, z0 = Math.ceil(B.minZ / g) * g;
    for (let x = x0; x <= B.maxX + 1e-6; x += g) h += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${Z(B.maxZ)}" stroke="var(--divider-color)" stroke-width="${Math.abs(x - Math.round(x)) < 1e-6 ? 1.2 : 0.4}"/>`;
    for (let z = z0; z <= B.maxZ + 1e-6; z += g) h += `<line x1="0" y1="${Z(z)}" x2="${X(B.maxX)}" y2="${Z(z)}" stroke="var(--divider-color)" stroke-width="${Math.abs(z - Math.round(z)) < 1e-6 ? 1.2 : 0.4}"/>`;
    const shape = this._mode === 'shape';
    const pathOf = poly => 'M ' + poly.map(([x, z]) => `${X(x)} ${Z(z)}`).join(' L ') + ' Z';
    rooms.forEach((r, i) => { // rooms drawn as outlines
      const poly = roomOutline(r); if (!poly) return;
      const c = COLORS[i % COLORS.length], on = i === this._sel;
      if (!this._onLv(r)) { h += `<path d="${pathOf(poly)}" fill="none" stroke="var(--secondary-text-color)" stroke-opacity=".45" stroke-dasharray="4 5" pointer-events="none"/>`; return; }
      h += `<path d="${pathOf(poly)}" fill="${c}" fill-opacity="${on ? (shape ? 0.42 : 0.28) : 0.14}" stroke="${c}" stroke-width="${on ? 2.5 : 1.2}" stroke-linejoin="round"/>`;
    });
    rooms.forEach((r, i) => (roomOutline(r) ? [] : r.rects || []).forEach(([x1, z1, x2, z2], k) => {
      const c = COLORS[i % COLORS.length], on = i === this._sel;
      if (!this._onLv(r)) { h += `<rect x="${X(Math.min(x1, x2))}" y="${Z(Math.min(z1, z2))}" width="${Math.abs(x2 - x1) * S}" height="${Math.abs(z2 - z1) * S}" fill="none" stroke="var(--secondary-text-color)" stroke-opacity=".45" stroke-dasharray="4 5" pointer-events="none"/>`; return; }
      h += `<rect x="${X(Math.min(x1, x2))}" y="${Z(Math.min(z1, z2))}" width="${Math.abs(x2 - x1) * S}" height="${Math.abs(z2 - z1) * S}" fill="${c}" fill-opacity="${on ? (shape ? 0.42 : 0.28) : 0.14}" stroke="${c}" stroke-width="${on && shape && k === this._rsel ? 4 : on ? 2.5 : 1.2}"/>`;
    }));
    // walls as the card will draw them (dark), windows (blue), railings (dashed)
    const wl = this._walls();
    // separate walls: full (dark), half (dashed), glass (light blue); the selected one is highlighted
    const ew = arr(H.extra_walls);
    ew.forEach((w, i) => {
      if (!this._onLv(Array.isArray(w) ? w : w || {})) return;
      const pieces = extraWalls([w]), ty = pieces[0]?.[4], on = this._mode === 'shape' && this._stool === 'wall' && this._wsel === i;
      for (const [x1, z1, x2, z2] of pieces) h += `<line x1="${X(x1)}" y1="${Z(z1)}" x2="${X(x2)}" y2="${Z(z2)}" stroke="${on ? 'var(--primary-color)' : ty === 'glass' ? '#7dd3fc' : 'var(--primary-text-color)'}" stroke-opacity="${on ? 1 : 0.75}" stroke-width="${on ? 8 : ty === 'half' ? 4 : 6}" ${ty === 'half' ? 'stroke-dasharray="7 5"' : ''} stroke-linecap="round" pointer-events="none"/>`;
    });
    for (const [x1, z1, x2, z2, t] of wl) h += `<line x1="${X(x1)}" y1="${Z(z1)}" x2="${X(x2)}" y2="${Z(z2)}" stroke="${t === 'win' ? '#38bdf8' : 'var(--primary-text-color)'}" stroke-opacity="${t === 'win' ? 0.9 : 0.55}" stroke-width="${t === 'win' ? 5 : 4}" ${t === 'rail' ? 'stroke-dasharray="6 6"' : ''} stroke-linecap="round" pointer-events="none"/>`;
    // furniture
    const fur = this._mode === 'furniture' || this._mode === 'doors';
    rooms.forEach((r, i) => this._onLv(r) && arr(r.furniture).forEach((f, k) => {
      const fp = footprint(f), on = i === this._sel && k === this._fsel && this._mode === 'furniture', linked = furnEntities(f).length;
      const st = `fill="${linked ? 'var(--primary-color)' : 'var(--primary-text-color)'}" fill-opacity="${on ? 0.5 : fur ? (linked ? 0.32 : 0.16) : 0.08}" stroke="${on ? 'var(--primary-color)' : 'var(--primary-text-color)'}" stroke-opacity="${fur ? 0.7 : 0.25}" stroke-width="${on ? 3 : 1}" ${f.type === 'fan' ? 'stroke-dasharray="5 4"' : ''}`;
      if (f.type === 'sprinkler') h += `<circle cx="${X(fp.circle[0])}" cy="${Z(fp.circle[1])}" r="${N(f.radius, 2) * S}" fill="#38bdf8" fill-opacity=".08" stroke="#38bdf8" stroke-opacity=".5" stroke-dasharray="4 4" pointer-events="none"/>`;
      if (fp.circle) h += `<circle cx="${X(fp.circle[0])}" cy="${Z(fp.circle[1])}" r="${fp.circle[2] * S}" ${st}/>`;
      else h += `<rect x="${X(fp.rect[0])}" y="${Z(fp.rect[1])}" width="${(fp.rect[2] - fp.rect[0]) * S}" height="${(fp.rect[3] - fp.rect[1]) * S}" rx="3" ${st}/>`;
      if (f.type === 'stairs' && fp.rect) { // the steps
        const [a, b2, c, d] = fp.rect, n = Math.max(2, Math.min(30, N(f.steps, 10))), ax = (f.axis || 'x') === 'x';
        for (let j = 1; j < n; j++) { const t = j / n; h += ax ? `<line x1="${X(a + (c - a) * t)}" y1="${Z(b2)}" x2="${X(a + (c - a) * t)}" y2="${Z(d)}" stroke="var(--primary-text-color)" stroke-opacity=".45" pointer-events="none"/>` : `<line x1="${X(a)}" y1="${Z(b2 + (d - b2) * t)}" x2="${X(c)}" y2="${Z(b2 + (d - b2) * t)}" stroke="var(--primary-text-color)" stroke-opacity=".45" pointer-events="none"/>`; }
      }
      if (fur) {
        const b = fpBox(fp), dir = f.head || f.back || f.face || f.facing;
        if ((dir || f.type === 'car' || f.type === 'vacuum') && ['bed', 'sofa', 'chair', 'tv', 'car', 'vacuum', 'nightstand'].includes(f.type)) { // a tick on the side the piece's back / head / screen / front is on
          const [cx, cz] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], e = { n: [cx, b[1]], s: [cx, b[3]], e: [b[2], cz], w: [b[0], cz] }[f.type === 'tv' ? { n: 's', s: 'n', e: 'w', w: 'e' }[dir] : dir || (f.type === 'vacuum' ? 's' : 'n')];
          if (e) h += `<circle cx="${X(e[0])}" cy="${Z(e[1])}" r="4" fill="var(--primary-text-color)" fill-opacity=".7" pointer-events="none"/>`;
        }
        if (linked) h += `<circle cx="${X(b[2])}" cy="${Z(b[1])}" r="5" fill="var(--primary-color)" stroke="var(--card-background-color)" stroke-width="1.5" pointer-events="none"/>`;
      }
    }));
    // house-level furniture (YAML only): faint
    for (const f of arr(H.furniture)) { const b = fpBox(footprint(f)); h += `<rect x="${X(b[0])}" y="${Z(b[1])}" width="${(b[2] - b[0]) * S}" height="${(b[3] - b[1]) * S}" fill="none" stroke="var(--secondary-text-color)" stroke-dasharray="3 3" pointer-events="none"/>`; }
    // doors, openings, badges
    const dsel = this._dsel, dOn = (k, i) => this._mode === 'doors' && dsel && dsel.k === k && dsel.i === i;
    arr(H.openings).forEach((o, i) => { if (this._onLv(o)) h += `<line x1="${X(o[0])}" y1="${Z(o[1])}" x2="${X(o[2])}" y2="${Z(o[3])}" stroke="#a3e635" stroke-width="${dOn('opening', i) ? 9 : 6}" stroke-dasharray="4 4" stroke-linecap="round"/>`; });
    if (Array.isArray(H.windows)) H.windows.forEach((w, i) => { if (dOn('window', i) && this._onLv(w)) h += `<line x1="${X(w[0])}" y1="${Z(w[1])}" x2="${X(w[2])}" y2="${Z(w[3])}" stroke="#38bdf8" stroke-width="10" stroke-opacity=".5" stroke-linecap="round"/>`; });
    arr(H.doors).forEach((d, i) => {
      if (!d.from || !d.to || !this._onLv(d)) return; const on = dOn('door', i);
      h += `<line x1="${X(d.from[0])}" y1="${Z(d.from[1])}" x2="${X(d.to[0])}" y2="${Z(d.to[1])}" stroke="#fb923c" stroke-width="${on ? 9 : 6}" stroke-linecap="round" ${d.entity ? '' : 'stroke-dasharray="10 4"'}/>`;
      const L = Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) * S, sw = (d.side ?? 1) > 0 ? 1 : 0;
      h += `<path d="M ${X(d.to[0])} ${Z(d.to[1])} A ${L} ${L} 0 0 ${sw} ${X(d.from[0]) + (Z(d.to[1]) - Z(d.from[1])) * (sw ? -1 : 1)} ${Z(d.from[1]) + (X(d.to[0]) - X(d.from[0])) * (sw ? 1 : -1)}" fill="none" stroke="#fb923c" stroke-opacity=".5" stroke-dasharray="4 4" pointer-events="none"/>`;
    });
    arr(H.lock_badges).forEach((b, i) => { if (this._onLv(b)) h += `<circle cx="${X(N(b.x, 0))}" cy="${Z(N(b.z, 0))}" r="${dOn('badge', i) ? 10 : 7}" fill="#34d399" stroke="var(--card-background-color)" stroke-width="2"/>`; });
    // room names
    rooms.forEach((r, i) => { const q = shapeOf(r).rects[0]; if (q && this._onLv(r)) h += `<text x="${X((q[0] + q[2]) / 2)}" y="${Z((q[1] + q[3]) / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${S * 0.38}" font-weight="${i === this._sel ? 700 : 400}" fill="var(--primary-text-color)" pointer-events="none" paint-order="stroke" stroke="var(--secondary-background-color)" stroke-width="4">${esc(this._roomName(r, i))}</text>`; });
    // handles: corners of the selected rectangle (Shape) or piece (Furniture)
    for (const [x, z] of this._handles()) h += `<circle cx="${X(x)}" cy="${Z(z)}" r="8" fill="var(--card-background-color)" stroke="var(--primary-color)" stroke-width="3"/>`;
    if (shape && this._psel != null && rooms[this._sel]?.points?.[this._psel]) { const [x, z] = rooms[this._sel].points[this._psel]; h += `<circle cx="${X(x)}" cy="${Z(z)}" r="8" fill="var(--primary-color)" stroke="var(--card-background-color)" stroke-width="2" pointer-events="none"/>`; }
    // the middle of each edge of an outline: drag it to bend the edge, tap it to add a corner
    for (const [x, z] of this._midHandles()) h += `<rect x="${X(x) - 6}" y="${Z(z) - 6}" width="12" height="12" rx="3" fill="var(--primary-color)" fill-opacity=".85" stroke="var(--card-background-color)" stroke-width="2"/>`;
    // drawing a room's walls: the corners so far, and the next wall following the pointer
    if (this._mode === 'shape' && this._stool === 'draw' && this._draft?.length) {
      const D = this._draft, pts = [...D, ...(this._hover ? [this._hover] : [])];
      h += `<polyline points="${pts.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="var(--primary-color)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (D.length >= 3) h += `<line x1="${X(pts[pts.length - 1][0])}" y1="${Z(pts[pts.length - 1][1])}" x2="${X(D[0][0])}" y2="${Z(D[0][1])}" stroke="var(--primary-color)" stroke-opacity=".4" stroke-width="2" stroke-dasharray="6 6"/>`;
      D.forEach(([x, z], i) => { h += `<circle cx="${X(x)}" cy="${Z(z)}" r="${i ? 6 : 10}" fill="${i ? 'var(--card-background-color)' : 'var(--primary-color)'}" stroke="var(--primary-color)" stroke-width="3" pointer-events="none"/>`; });
      if (this._hover && D.length) { const [ax, az] = D[D.length - 1], [bx, bz] = this._hover; h += `<text x="${X((ax + bx) / 2)}" y="${Z((az + bz) / 2) - 8}" text-anchor="middle" font-size="12" fill="var(--primary-color)" pointer-events="none" paint-order="stroke" stroke="var(--secondary-background-color)" stroke-width="3">${r2(Math.hypot(bx - ax, bz - az))} m</text>`; }
    }
    // room by room: where the next room will go (dashed, with its name)
    const W = this._wiz, wa = W && (W.list[W.i] || W.customing ? W.list[W.i] : undefined);
    if (W && (wa || W.customing)) {
      const lv = wa ? areaLevel(this._reg, wa) ?? this._lvl : this._lvl;
      if (lv === this._lvl) {
        const [x0, z0] = this._wizSpot(lv), [ww, wd] = this._wizDims(), poly = W.shape === 'rect' ? [[x0, z0], [x0 + ww, z0], [x0 + ww, z0 + wd], [x0, z0 + wd]] : roomOutline({ points: this._wizPts(x0, z0) });
        h += `<path d="${pathOf(poly)}" fill="var(--primary-color)" fill-opacity=".1" stroke="var(--primary-color)" stroke-width="2.5" stroke-dasharray="8 6" pointer-events="none"/>`;
        h += `<text x="${X(x0 + ww / 2)}" y="${Z(z0 + wd / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${S * 0.36}" fill="var(--primary-color)" pointer-events="none">${esc(wa ? this._hass.areas[wa]?.name || wa : W.custom || t('New room'))}</text>`;
      }
    }
    // what is being drawn right now
    if (this._ghost) {
      const q = this._ghost;
      if (q.length === 4 && (this._mode !== 'shape' || this._stool === 'wall')) h += `<line x1="${X(q[0])}" y1="${Z(q[1])}" x2="${X(q[2])}" y2="${Z(q[3])}" stroke="var(--primary-color)" stroke-width="7" stroke-dasharray="8 6" stroke-linecap="round"/>`;
      else h += `<rect fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-dasharray="8 6" x="${X(Math.min(q[0], q[2]))}" y="${Z(Math.min(q[1], q[3]))}" width="${Math.abs(q[2] - q[0]) * S}" height="${Math.abs(q[3] - q[1]) * S}"/>`;
    }
    svg.innerHTML = h;
  }
  _walls() {
    const H = this._H;
    if (Array.isArray(H.walls) && H.walls.length) return H.walls;
    const rooms = this._rooms.map((r, i) => ({ id: roomIdOf(r, i, this._hass), ...shapeOf(r), outdoor: r.outdoor ?? /garden|yard|patio|terrace|balcony|outside|outdoor/i.test(this._roomName(r, i)), lv: this._lvOf(r) })).filter(r => r.rects.length && r.lv === this._lvl);
    const doorSegs = arr(H.doors).filter(d => d.from && d.to && this._onLv(d)).map(d => this._snapSeg([...d.from, ...d.to]));
    const wins = Array.isArray(H.windows) ? H.windows.filter(w => this._onLv(w)) : null;
    try { const gaps = [...arr(H.openings).filter(o => this._onLv(o)).map(o => o.slice(0, 4)), ...doorSegs.map(q => q.slice(0, 4))]; return cutNear(wallsFromRooms(rooms, { ...H, doorways: H.doorways ?? 'none', openings: gaps, windows: wins ? (wins.length ? wins : 'none') : H.windows }), gaps); } catch (e) { return []; }
  }
  _handles() {
    const r = this._rooms[this._sel]; if (!r) return [];
    if (this._mode === 'shape' && this._stool === 'wall') { const w = arr(this._H.extra_walls)[this._wsel]; const o = Array.isArray(w) ? { from: [w[0], w[1]], to: [w[2], w[3]] } : w; return o?.from && o?.to ? [o.from, o.to] : []; }
    if (this._mode === 'shape' && this._stool === 'draw') return []; // drawing: the old corners don't get in the way
    if (this._mode === 'shape' && r.points) return r.points.map(p => [p[0], p[1]]);
    if (this._mode === 'shape' && this._rsel != null) { const q = r.rects?.[this._rsel]; if (q) return [[q[0], q[1]], [q[2], q[1]], [q[0], q[3]], [q[2], q[3]]]; }
    if (this._mode === 'furniture' && this._fsel != null) {
      const f = arr(r.furniture)[this._fsel]; if (!f) return [];
      const fp = footprint(f), b = fpBox(fp);
      if (fp.circle || ['chair', 'charger'].includes(f.type)) return [];
      return [[b[2], b[3]]];
    }
    return [];
  }

  // the bend handles of the selected outline: the middle of each edge (on the arc for a bent one)
  _midHandles() {
    const r = this._rooms[this._sel]; if (this._mode !== 'shape' || this._stool === 'wall' || this._stool === 'draw' || !r?.points || !this._onLv(r)) return [];
    const P = r.points, sg = polyArea(P) >= 0 ? 1 : -1;
    return P.map((a, i) => { const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, bow = Number(a[2]) || 0; return [(a[0] + b[0]) / 2 + sg * (b[1] - a[1]) / L * bow, (a[1] + b[1]) / 2 - sg * (b[0] - a[0]) / L * bow]; });
  }
  // all pointer work on the plan: what a press starts depends on the mode and on what is under it
  _planInput(svg) {
    const g = () => this._grid, snap = v => r2(Math.round(v / g()) * g());
    const pt = e => { const b = svg.getBoundingClientRect(), B = this._B; return [B.minX + (e.clientX - b.left) / b.width * (B.maxX - B.minX), B.minZ + (e.clientY - b.top) / b.height * (B.maxZ - B.minZ)]; };
    const tol = () => { const b = svg.getBoundingClientRect(); return Math.max(0.2, 16 * (this._B.maxX - this._B.minX) / Math.max(1, b.width)); }; // ~16 px
    let op = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const p = pt(e); op = this._startOp(p, tol(), snap); if (!op) return;
      op.p0 = p; op.moved = false; svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      if (!op && this._mode === 'shape' && this._stool === 'draw' && this._draft?.length) { // the next wall follows the pointer
        this._hover = this._drawSnap(pt(e), snap); if (!this._hoverRaf) this._hoverRaf = requestAnimationFrame(() => { this._hoverRaf = null; this._drawPlan(svg); }); return;
      }
      if (!op) return; const p = pt(e);
      if (!op.moved && Math.hypot(p[0] - op.p0[0], p[1] - op.p0[1]) < tol() * 0.5) return;
      op.moved = true; op.move?.(p); this._drawPlan(svg);
    });
    const end = e => {
      if (!op) return; const o = op; op = null; this._ghost = null;
      const changed = o.end ? o.end(o.moved, pt(e)) : o.moved;
      if (changed) this._emit();
      this._render();
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', () => { op = null; this._ghost = null; this._render(); });
  }
  _roomAt(p) {
    const rooms = this._rooms;
    const hit = r => { const { poly, rects } = shapeOf(r); return poly ? inPoly(p[0], p[1], poly) : rects.some(q => inBox(p, q)); };
    if (rooms[this._sel] && this._onLv(rooms[this._sel]) && hit(rooms[this._sel])) return this._sel;
    const i = rooms.findIndex(r => this._onLv(r) && hit(r)); return i < 0 ? null : i;
  }
  _startOp(p, tol, snap) {
    const rooms = this._rooms, r = rooms[this._sel], H = this._H;
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
    if (this._mode === 'shape' && this._stool === 'wall') return this._wallOp(p, tol, snap);
    if (this._mode === 'shape' && this._stool === 'draw') return { end: (moved, m) => this._drawTap(m, tol, snap) };
    if (this._mode === 'shape' && r?.points) return this._outlineOp(r, p, near, snap);
    if (this._mode === 'shape') {
      // 1. a corner of the selected rectangle: resize
      const q = r.rects?.[this._rsel];
      if (q) for (const [cx, cz] of this._handles()) if (near(p, [cx, cz])) {
        const fx = cx === q[0] ? q[2] : q[0], fz = cz === q[1] ? q[3] : q[1];
        return { move: m => { const x = snap(m[0]), z = snap(m[1]); if (Math.abs(x - fx) >= this._grid && Math.abs(z - fz) >= this._grid) r.rects[this._rsel] = [Math.min(x, fx), Math.min(z, fz), Math.max(x, fx), Math.max(z, fz)]; } };
      }
      // 2. a rectangle of the selected room: select it, drag to move
      const k = (r.rects || []).findIndex(qq => inBox(p, qq));
      if (k >= 0) {
        const orig = r.rects[k].slice();
        return { move: m => { this._rsel = k; const dx = snap(m[0] - p[0]), dz = snap(m[1] - p[1]); r.rects[k] = [r2(orig[0] + dx), r2(orig[1] + dz), r2(orig[2] + dx), r2(orig[3] + dz)]; },
          end: moved => { this._rsel = k; return moved; } };
      }
      // 3. anywhere else: draw a new rectangle for the selected room (a tap on another room selects it instead)
      const other = this._roomAt(p);
      const a = [snap(p[0]), snap(p[1])];
      return {
        move: m => { this._ghost = [a[0], a[1], snap(m[0]), snap(m[1])]; },
        end: (moved, m) => {
          if (!moved) { if (other != null && other !== this._sel) { this._sel = other; this._rsel = null; } else this._rsel = null; return false; }
          const b = [snap(m[0]), snap(m[1])];
          if (Math.abs(b[0] - a[0]) < this._grid || Math.abs(b[1] - a[1]) < this._grid) return false;
          (r.rects ||= []).push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
          this._rsel = r.rects.length - 1; return true;
        },
      };
    }
    if (this._mode === 'furniture') {
      // placing a new piece: it goes into the room under the tap
      if (this._place) return { end: (moved, m) => { const i = this._roomAt(m) ?? this._sel; this._addPiece(i, this._place, snap(m[0]), snap(m[1])); this._place = null; return true; } };
      // the resize dot of the selected piece
      const f = arr(r.furniture)[this._fsel];
      if (f) for (const hd of this._handles()) if (near(p, hd)) {
        const b = fpBox(footprint(f));
        // the size changes by the grid steps dragged, on each side on its own: a side not dragged keeps its exact size
        const step = v => Math.round(v / this._grid) * this._grid;
        return { move: m => sizePiece(f, b[0], b[1], r2(Math.max(b[0] + 0.1, b[2] + step(m[0] - hd[0]))), r2(Math.max(b[1] + 0.1, b[3] + step(m[1] - hd[1])))) };
      }
      // a piece (the selected room's first, then any room's, topmost first): select it and drag to move
      const hit = this._pieceAt(p, tol * 0.4);
      if (hit) {
        const [ri, fi] = hit, pc = rooms[ri].furniture[fi], start = JSON.stringify(pc), orig = JSON.parse(start);
        return {
          // moved by whole grid steps, then pulled flat against a wall that is close (see _toWall)
          move: m => {
            this._sel = ri; this._fsel = fi; const dx = snap(m[0] - p[0]), dz = snap(m[1] - p[1]);
            for (const k of ['x', 'z', 'from', 'to']) if (orig[k] !== undefined) pc[k] = clone(orig[k]);
            movePiece(pc, dx, dz); this._toWall(pc);
          },
          end: () => {
            this._sel = ri; this._fsel = fi;
            if (JSON.stringify(pc) === start) return false;
            // dropped in another room: it belongs to that room now
            const b = fpBox(footprint(pc)), to = this._roomAt([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
            if (to != null && to !== ri) { rooms[ri].furniture.splice(fi, 1); const l = this._ownFurniture(to); l.push(pc); this._sel = to; this._fsel = l.length - 1; }
            return true;
          },
        };
      }
      const i = this._roomAt(p);
      return { end: () => { if (i != null) this._sel = i; this._fsel = null; return false; } };
    }
    if (this._mode === 'doors') {
      // an existing door, window, opening or lock badge: select it, drag to move it
      const item = this._doorItemAt(p, tol);
      if (item) {
        const key = { door: 'doors', window: 'windows', opening: 'openings', badge: 'lock_badges' }[item.k], o = H[key][item.i], start = JSON.stringify(o);
        const orig = JSON.parse(start);
        return {
          move: m => {
            this._dsel = item; const dx = snap(m[0] - p[0]), dz = snap(m[1] - p[1]);
            if (item.k === 'badge') { o.x = r2(N(orig.x, 0) + dx); o.z = r2(N(orig.z, 0) + dz); }
            else if (item.k === 'door') { const q = this._snapSeg([orig.from[0] + dx, orig.from[1] + dz, orig.to[0] + dx, orig.to[1] + dz]).map(r2); o.from = [q[0], q[1]]; o.to = [q[2], q[3]]; }
            else {
              const t = [orig[0] + dx, orig[1] + dz, orig[2] + dx, orig[3] + dz], na = this._nearWall([t[0], t[1]]), nb = this._nearWall([t[2], t[3]]);
              // on a bent wall each end stays on the arc; else the whole segment goes onto its wall line
              const q = na && nb && (this._bentPiece(na.seg) || this._bentPiece(nb.seg)) ? [...na.pt, ...nb.pt] : this._snapSeg(t).map(r2);
              o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; o[3] = q[3];
            }
          },
          end: () => { this._dsel = item; return JSON.stringify(o) !== start; },
        };
      }
      if (this._dtool === 'badge') return { end: (moved, m) => { const b = { lock: '', x: snap(m[0]), z: snap(m[1]) }; this._setLv(b, this._lvl); (H.lock_badges ||= []).push(b); this._dsel = { k: 'badge', i: H.lock_badges.length - 1 }; return true; } };
      const a = [snap(p[0]), snap(p[1])], nw = this._nearWall(p), bent = nw && this._bentPiece(nw.seg), sl = bent ? null : this._slantAt(p);
      const seg = m => {
        if (bent) { const e = this._nearWall(m, 1.5); return [...nw.pt, ...(e ? e.pt : [r2(m[0]), r2(m[1])])]; } // on a bent wall: from point to point of the arc
        if (sl) { const on = v => { const t = Math.round((v[0] * sl.dx + v[1] * sl.dz) / 0.05) * 0.05; return [r2(-sl.c * sl.dz + t * sl.dx), r2(sl.c * sl.dx + t * sl.dz)]; }; return [...on(p), ...on(m)]; } // along a slanted wall
        const b = [snap(m[0]), snap(m[1])]; return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? [a[0], a[1], b[0], a[1]] : [a[0], a[1], a[0], b[1]];
      };
      return {
        move: m => { this._ghost = bent ? seg(m) : this._snapSeg(seg(m)); },
        end: (moved, m) => {
          if (!moved) { this._dsel = null; return false; }
          const s = bent ? seg(m) : this._snapSeg(seg(m)); if (Math.hypot(s[2] - s[0], s[3] - s[1]) < 0.4) return false;
          if (this._dtool === 'door') { const d = { from: [s[0], s[1]], to: [s[2], s[3]] }; this._setLv(d, this._lvl); (H.doors ||= []).push(d); this._dsel = { k: 'door', i: H.doors.length - 1 }; }
          else if (this._dtool === 'window') { if (!Array.isArray(H.windows)) H.windows = []; this._setLv(s, this._lvl); H.windows.push(s); this._dsel = { k: 'window', i: H.windows.length - 1 }; }
          else { this._setLv(s, this._lvl); (H.openings ||= []).push(s); this._dsel = { k: 'opening', i: H.openings.length - 1 }; }
          return true;
        },
      };
    }
    return null;
  }
  // every line a wall stands on, on this floor: room edges (any direction) and separate walls
  _wallSegsHere() {
    const out = [];
    for (const r of this._rooms) if (this._onLv(r)) {
      const { poly, rects } = shapeOf(r);
      if (poly) poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; out.push([a[0], a[1], b[0], b[1]]); });
      else for (const [x1, z1, x2, z2] of rects) out.push([x1, z1, x2, z1], [x1, z2, x2, z2], [x1, z1, x1, z2], [x2, z1, x2, z2]);
    }
    for (const w of extraWalls(this._H.extra_walls)) if ((Number(w[5]) || 0) === this._lvl) out.push(w.slice(0, 4));
    return out;
  }
  // a door / window / opening segment goes onto the nearest wall line of this floor that runs its way (within 0.4 m)
  _snapSeg(q) {
    const me = lineOf(q[0], q[1], q[2], q[3]); if (!me) return q;
    const mx = (q[0] + q[2]) / 2, mz = (q[1] + q[3]) / 2;
    let best = null;
    for (const s of this._wallSegsHere()) {
      const l = lineOf(...s); if (!l || Math.abs(Math.sin(l.ang - me.ang)) > 0.09) continue;
      const t0 = q[0] * l.dx + q[1] * l.dz, t1 = q[2] * l.dx + q[3] * l.dz;
      if (Math.max(t0, t1) < l.a + 0.05 || Math.min(t0, t1) > l.b - 0.05) continue;
      const d = Math.abs(-mx * l.dz + mz * l.dx - l.c); if (d <= 0.4 && (!best || d < best[0])) best = [d, l];
    }
    if (!best) return q;
    const l = best[1], on = t => [r2(-l.c * l.dz + t * l.dx), r2(l.c * l.dx + t * l.dz)];
    return [...on(q[0] * l.dx + q[1] * l.dz), ...on(q[2] * l.dx + q[3] * l.dz), ...q.slice(4)];
  }
  // the nearest point on a wall of this floor within `max` metres: {pt, seg}, or null
  _nearWall(p, max = 0.45) {
    let best = null;
    for (const s of this._wallSegsHere()) {
      const dx = s[2] - s[0], dz = s[3] - s[1], L = dx * dx + dz * dz; if (!L) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dz) / L)), q = [s[0] + t * dx, s[1] + t * dz], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= max && (!best || d < best.d)) best = { d, pt: [r2(q[0]), r2(q[1])], seg: s };
    }
    return best;
  }
  // a bent wall is many short pieces: is this one of them?
  _bentPiece(s) { return Math.hypot(s[2] - s[0], s[3] - s[1]) < 0.6 && s[0] !== s[2] && s[1] !== s[3]; }
  // a slanted wall under the press (doors and windows are drawn along it), or null
  _slantAt(p) {
    for (const s of this._wallSegsHere()) {
      const l = lineOf(...s); if (!l || l.dx === 0 || l.dz === 0) continue;
      const t = p[0] * l.dx + p[1] * l.dz;
      if (t >= l.a - 0.1 && t <= l.b + 0.1 && Math.abs(-p[0] * l.dz + p[1] * l.dx - l.c) <= 0.4) return l;
    }
    return null;
  }
  // Shape mode on a room with an outline: drag a corner, bend an edge (drag its middle) or add a corner (tap its middle),
  // drag inside to move the room
  _outlineOp(r, p, near, snap) {
    const P = r.points;
    const ci = P.findIndex(q => near(p, q));
    if (ci >= 0) {
      const orig = P[ci].slice();
      return { move: m => { this._psel = ci; P[ci] = [snap(m[0]), snap(m[1]), ...orig.slice(2)]; }, end: moved => { this._psel = ci; return moved; } };
    }
    const mi = this._midHandles().findIndex(q => near(p, q));
    if (mi >= 0) {
      const a = P[mi], b = P[(mi + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, sg = polyArea(P) >= 0 ? 1 : -1;
      const n = [sg * (b[1] - a[1]) / L, -sg * (b[0] - a[0]) / L], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return {
        move: m => { let bow = r2(Math.round(((m[0] - mid[0]) * n[0] + (m[1] - mid[1]) * n[1]) / 0.05) * 0.05); bow = Math.max(-L * 0.75, Math.min(L * 0.75, bow)); P[mi] = Math.abs(bow) < 0.1 ? [a[0], a[1]] : [a[0], a[1], bow]; },
        end: moved => {
          if (moved) return true;
          if (Number(a[2])) return false; // tapping a bent edge does nothing
          P.splice(mi + 1, 0, [r2(mid[0]), r2(mid[1])]); this._psel = mi + 1; return true;
        },
      };
    }
    const { poly } = shapeOf(r);
    if (poly && inPoly(p[0], p[1], poly)) {
      const orig = P.map(q => q.slice());
      return { move: m => { const dx = snap(m[0] - p[0]), dz = snap(m[1] - p[1]); orig.forEach((q, i) => { P[i] = [r2(q[0] + dx), r2(q[1] + dz), ...q.slice(2)]; }); }, end: moved => { if (!moved) this._psel = null; return moved; } };
    }
    const other = this._roomAt(p);
    return { end: () => { if (other != null && other !== this._sel) { this._sel = other; this._psel = null; this._rsel = null; } else this._psel = null; return false; } };
  }
  // Shape mode, separate walls: drag to draw one (any direction), drag an end to change it, drag a wall to move it
  _wallOp(p, tol, snap) {
    const H = this._H, list = arr(H.extra_walls);
    const asObj = i => { const w = list[i]; if (Array.isArray(w)) { const o = { from: [w[0], w[1]], to: [w[2], w[3]] }; this._setLv(o, this._lvOf(w)); H.extra_walls[i] = o; } return H.extra_walls[i]; };
    const sel = this._wsel != null && list[this._wsel] ? asObj(this._wsel) : null;
    if (sel) for (const k of ['from', 'to']) if (Math.hypot(p[0] - sel[k][0], p[1] - sel[k][1]) <= tol) {
      return { move: m => { sel[k] = [snap(m[0]), snap(m[1])]; }, end: moved => moved };
    }
    const hit = list.findIndex(w => { if (!this._onLv(Array.isArray(w) ? w : w || {})) return false; return extraWalls([w]).some(q => segDist(p, q.slice(0, 4)) <= tol * 0.7); });
    if (hit >= 0) {
      const o = asObj(hit), f0 = o.from.slice(), t0 = o.to.slice();
      return { move: m => { this._wsel = hit; const dx = snap(m[0] - p[0]), dz = snap(m[1] - p[1]); o.from = [r2(f0[0] + dx), r2(f0[1] + dz)]; o.to = [r2(t0[0] + dx), r2(t0[1] + dz)]; }, end: moved => { this._wsel = hit; return moved; } };
    }
    const a = [snap(p[0]), snap(p[1])];
    return {
      move: m => { this._ghost = [a[0], a[1], snap(m[0]), snap(m[1])]; },
      end: (moved, m) => {
        if (!moved) { this._wsel = null; return false; }
        const b = [snap(m[0]), snap(m[1])]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) return false;
        const w = { from: a, to: b }; this._setLv(w, this._lvl); (H.extra_walls ||= []).push(w); this._wsel = H.extra_walls.length - 1; return true;
      },
    };
  }
  _pieceAt(p, pad) {
    const rooms = this._rooms, order = [this._sel, ...rooms.keys()].filter((v, i, a) => a.indexOf(v) === i && rooms[v] && this._onLv(rooms[v]));
    for (const ri of order) {
      const list = arr(rooms[ri]?.furniture);
      for (let fi = list.length - 1; fi >= 0; fi--) {
        const fp = footprint(list[fi]);
        if (fp.circle ? Math.hypot(p[0] - fp.circle[0], p[1] - fp.circle[1]) <= fp.circle[2] + pad : inBox(p, fp.rect, pad)) {
          if (list[fi].type === 'rug' && list.some((o, j) => j !== fi && o.type !== 'rug' && inBox(p, fpBox(footprint(o)), pad))) continue; // a rug lies under the rest
          return [ri, fi];
        }
      }
    }
    return null;
  }
  _doorItemAt(p, tol) {
    const H = this._H;
    for (const [i, b] of arr(H.lock_badges).entries()) if (this._onLv(b) && Math.hypot(p[0] - N(b.x, 0), p[1] - N(b.z, 0)) <= tol) return { k: 'badge', i };
    for (const [i, d] of arr(H.doors).entries()) if (d.from && d.to && this._onLv(d) && segDist(p, [...d.from, ...d.to]) <= tol * 0.7) return { k: 'door', i };
    for (const [i, o] of arr(H.openings).entries()) if (this._onLv(o) && segDist(p, o) <= tol * 0.7) return { k: 'opening', i };
    if (Array.isArray(H.windows)) for (const [i, w] of H.windows.entries()) if (this._onLv(w) && segDist(p, w) <= tol * 0.7) return { k: 'window', i };
    return null;
  }

  /* ---------------- Shape mode ---------------- */
  _mShape(box, r) {
    const tools = [['rect', 'Room shape', 'mdi:vector-square'], ['draw', 'Draw walls', 'mdi:draw'], ['wall', 'Separate walls', 'mdi:wall']];
    const tb = document.createElement('div'); tb.className = 'sh-modes'; tb.style.marginBottom = '10px';
    tb.innerHTML = tools.map(([k, n, i]) => `<button data-stool="${k}" class="${this._stool === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('');
    tb.querySelectorAll('[data-stool]').forEach(b => b.addEventListener('click', () => { this._stool = b.dataset.stool; this._wsel = null; this._psel = null; this._rsel = null; this._draft = null; this._render(); }));
    box.appendChild(tb);
    if (this._stool === 'wall') return this._mWalls(box);
    if (this._stool === 'draw') return this._mDraw(box, r);
    const L = this._levels();
    const stairsNow = r.stairs === true || (r.stairs && typeof r.stairs === 'object') ? 'auto' : r.stairs === false ? 'none' : ['both', 'up', 'down'].includes(r.stairs) ? r.stairs : '';
    const data = { name: r.name || '', area: r.area || '', icon: r.icon || '', floor: r.floor || '', outdoor: !!r.outdoor, stairs: stairsNow, level: String(this._lvOf(r)) };
    const formEl = (this._form([
      { name: 'area', selector: { area: {} } },
      { name: 'name', selector: { text: {} } },
      { type: 'grid', name: '', schema: [
        { name: 'icon', selector: { icon: {} } },
        { name: 'floor', selector: sel([['', 'Automatic'], ['wood', 'Wood'], ['tile', 'Tiles'], ['marble', 'Marble'], ['carpet', 'Carpet'], ['stone', 'Stone'], ['grass', 'Grass'], ['asphalt', 'Parking (asphalt)']].map(([v, n]) => [v, t(n)])) },
      ] },
      { name: 'outdoor', selector: { boolean: {} } },
      { name: 'stairs', selector: sel([['', 'Only if the room is named Stairs'], ['auto', 'Yes, by the floors'], ['both', 'Up and down'], ['up', 'Up'], ['down', 'Down'], ['none', 'No stairs']]) },
      ...(L.length > 1 ? [{ name: 'level', selector: sel(L.map(l => [String(l.level), l.name])) }] : []),
    ], data, (v, typing) => {
      const areaChanged = (v.area || '') !== (r.area || '');
      for (const k of ['name', 'area', 'icon', 'floor']) { if (v[k]) r[k] = v[k]; else delete r[k]; }
      if (v.outdoor) r.outdoor = true; else delete r.outdoor;
      if ((v.stairs ?? '') !== stairsNow) { if (!v.stairs) delete r.stairs; else r.stairs = v.stairs === 'auto' ? true : v.stairs === 'none' ? false : v.stairs; }
      const lv = Number(v.level ?? this._lvOf(r));
      if (lv !== this._lvOf(r)) { this._setLv(r, lv); this._lvl = lv; this._emit(); return this._render(); }
      this._emit(typing);
      const chip = this.querySelector(`[data-room="${this._sel}"]`); if (chip) chip.lastChild.textContent = this._roomName(r, this._sel);
      if (areaChanged) this._render();
      if (v.stairs !== data.stairs) { data.stairs = v.stairs; this._emit(); return this._render(); }
    }, { floor: 'Floor covering', area: 'Home Assistant area (its devices are found on their own)', outdoor: 'Outdoor (balcony, garden: no ceiling light, glass railing)', stairs: 'Stairs going', level: 'Floor' }, true));
    // ready-made shapes, drawn small: tap one to give the room that shape in the space it takes now
    const sh = document.createElement('div'); sh.className = 'sh-shapes';
    const prev = k => { if (k === 'rect') return 'M 0 0 L 1.4 0 L 1.4 1 L 0 1 Z'; const o = roomOutline({ points: shapePoints(k, 0, 0, 1.4, 1) }); return 'M ' + o.map(([x, z]) => `${r2(x)} ${r2(z)}`).join(' L ') + ' Z'; };
    sh.innerHTML = `<span class="sh-hint">${t('Shape')}</span>` + SHAPES.map(([k, n]) => `<button data-shape="${k}" title="${t(n)}" aria-label="${t(n)}"><svg viewBox="-0.15 -0.15 1.7 1.6"><path d="${prev(k)}" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width=".07" stroke-linejoin="round"/></svg></button>`).join('');
    box.appendChild(sh);
    sh.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => this._applyShape(r, b.dataset.shape)));
    const row = document.createElement('div'); row.className = 'sh-row'; row.style.marginTop = '10px';
    const q = this._rsel != null && !r.points ? r.rects?.[this._rsel] : null;
    row.innerHTML = (r.points ? `<span class="sh-hint">${t('{0} corners. Drag a corner to move it. Drag the square in the middle of an edge to bend it into a curve, tap it to add a corner.', r.points.length)}</span>
      <button data-rot><ha-icon icon="mdi:rotate-right"></ha-icon>${t('Turn')}</button><button data-rotby="-15" title="${t('Rotate 15° anticlockwise')}"><ha-icon icon="mdi:rotate-left"></ha-icon>15°</button><button data-rotby="15" title="${t('Rotate 15° clockwise')}"><ha-icon icon="mdi:rotate-right"></ha-icon>15°</button><input data-rotdeg type="number" step="1" placeholder="°" title="${t('Rotate by an angle (degrees, clockwise)')}" style="width:64px"><button data-flip><ha-icon icon="mdi:flip-horizontal"></ha-icon>${t('Mirror')}</button>
      ${this._psel != null && r.points.length > 3 ? `<button data-delpt class="del"><ha-icon icon="mdi:vector-point-minus"></ha-icon>${t('Delete corner')}</button>` : ''}
      <span style="flex:1"></span>` : `<span class="sh-hint">${t('{0} rectangle(s)', (r.rects || []).length)}${q ? ` · selected ${r2(q[2] - q[0])} × ${r2(q[3] - q[1])} m` : ''}</span>
      ${q ? `<button data-delrect class="del"><ha-icon icon="mdi:vector-square-remove"></ha-icon>${t('Delete rectangle')}</button>` : ''}
      ${(r.rects || []).length ? `<button data-outline title="${t('Free corners: slant or bend any wall')}"><ha-icon icon="mdi:vector-polygon"></ha-icon>${t('Edit corners')}</button><button data-rotby="-15" title="${t('Rotate 15° anticlockwise')}"><ha-icon icon="mdi:rotate-left"></ha-icon>15°</button><button data-rotby="15" title="${t('Rotate 15° clockwise')}"><ha-icon icon="mdi:rotate-right"></ha-icon>15°</button>` : ''}
      <span style="flex:1"></span>`) + `
      <button data-dup><ha-icon icon="mdi:content-copy"></ha-icon>${t('Duplicate room')}</button>
      <button class="sh-btn del" data-del><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete room')}</button>`;
    box.appendChild(row);
    row.querySelector('[data-delrect]')?.addEventListener('click', () => { r.rects.splice(this._rsel, 1); this._rsel = null; this._emit(); this._render(); });
    row.querySelector('[data-outline]')?.addEventListener('click', () => { if (!this._toOutline(r)) this._toast = t('These rectangles don’t touch: join them first.'); this._emit(); this._render(); });
    row.querySelector('[data-delpt]')?.addEventListener('click', () => { r.points.splice(this._psel, 1); this._psel = null; this._emit(); this._render(); });
    // turn a quarter clockwise / mirror left-right, keeping the top-left corner of the room's box where it is
    const turn = f => { const b = roomBox(r); r.points = r.points.map(q => [...f(q[0], q[1], b).map(v => r2(v)), ...q.slice(2)]); this._pbox = null; this._emit(); this._render(); };
    row.querySelector('[data-rot]')?.addEventListener('click', () => turn((x, z, b) => [b[0] + (b[3] - z), b[1] + (x - b[0])]));
    row.querySelector('[data-flip]')?.addEventListener('click', () => turn((x, z, b) => [b[0] + (b[2] - x), z]));
    // rotate by any angle around the middle of the room (rectangles become free corners first)
    const rotBy = deg => {
      if (!r.points && !this._toOutline(r)) { this._toast = t('These rectangles don’t touch: join them first.'); return this._render(); }
      const b = roomBox(r), cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      r.points = r.points.map(q => [r2(cx + (q[0] - cx) * c - (q[1] - cz) * s), r2(cz + (q[0] - cx) * s + (q[1] - cz) * c), ...q.slice(2)]);
      this._pbox = null; this._emit(); this._render();
    };
    row.querySelectorAll('[data-rotby]').forEach(b => b.addEventListener('click', () => rotBy(Number(b.dataset.rotby))));
    row.querySelector('[data-rotdeg]')?.addEventListener('change', e => { const v = Number(e.target.value); if (v) rotBy(v); });
    if (this._toast) { const n = document.createElement('div'); n.className = 'sh-hint'; n.style.color = 'var(--warning-color, #f59e0b)'; n.textContent = this._toast; box.appendChild(n); this._toast = null; }
    row.querySelector('[data-dup]').addEventListener('click', () => this._dupRoom());
    row.querySelector('[data-del]').addEventListener('click', () => { this._rooms.splice(this._sel, 1); this._sel = Math.max(0, this._sel - 1); this._rsel = null; this._emit(); this._render(); });
    formEl.style.marginTop = '12px'; box.appendChild(formEl); // the room's settings under its shape tools
  }
  // a room gets a ready-made shape, in the box it takes now (the box is kept while you try shapes on the same room)
  _applyShape(r, kind) {
    let b = this._pbox?.r === r ? this._pbox.b : roomBox(r);
    if (!b) { const all = this._rooms.filter(x => x !== r && this._onLv(x)).map(roomBox).filter(Boolean); const x0 = all.length ? Math.max(...all.map(q => q[2])) + 1 : 0; b = [x0, 0, x0 + 4, 3]; }
    this._pbox = { r, b };
    if (kind === 'rect') { r.rects = [[b[0], b[1], b[2], b[3]]]; delete r.points; }
    else { r.points = shapePoints(kind, b[0], b[1], b[2] - b[0], b[3] - b[1]); delete r.rects; }
    this._psel = null; this._rsel = null; this._emit(); this._render();
  }
  // rectangles → an outline with free corners (the rectangles must touch each other)
  _toOutline(r) {
    const segs = wallsFromRooms([{ id: 'x', rects: arr(r.rects).map(q => q.map(Number)) }], { windows: 'none', doorways: 'none' }).map(q => q.slice(0, 4));
    if (!segs.length) return false;
    const k = (x, z) => `${r2(x)},${r2(z)}`, used = new Set([0]), pts = [[segs[0][0], segs[0][1]]];
    let cur = [segs[0][2], segs[0][3]];
    while (k(...cur) !== k(...pts[0])) {
      pts.push(cur);
      const i = segs.findIndex((s, j) => !used.has(j) && (k(s[0], s[1]) === k(...cur) || k(s[2], s[3]) === k(...cur)));
      if (i < 0) return false;
      used.add(i); const s = segs[i]; cur = k(s[0], s[1]) === k(...cur) ? [s[2], s[3]] : [s[0], s[1]];
    }
    if (used.size !== segs.length) return false; // more than one piece
    const out = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6; });
    if (out.length < 3) return false;
    r.points = out.map(p => [r2(p[0]), r2(p[1])]); delete r.rects; this._rsel = null; return true;
  }
  /* drawing a room's walls corner by corner */
  // the next corner: on the grid, and with "straight walls" on, on a line from the last corner at a multiple of 45°
  _drawSnap(p, snap) {
    const D = this._draft || [], last = D[D.length - 1];
    if (!last || this._drawFree) return [snap(p[0]), snap(p[1])];
    const dx = p[0] - last[0], dz = p[1] - last[1], L = Math.hypot(dx, dz); if (L < 1e-6) return [last[0], last[1]];
    // the wall's direction to the nearest 45°; its length in grid steps along x and z, so its end stays on the grid
    const a = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4), along = L * Math.cos(Math.atan2(dz, dx) - a);
    const ux = Math.round(Math.cos(a)), uz = Math.round(Math.sin(a)), diag = ux && uz;
    const n = Math.max(1, Math.round((diag ? along / Math.SQRT2 : along) / this._grid)) * this._grid;
    return [r2(last[0] + ux * n), r2(last[1] + uz * n)];
  }
  _drawTap(m, tol, snap) {
    const D = (this._draft ||= []), q = this._drawSnap(m, snap);
    if (D.length >= 3 && Math.hypot(m[0] - D[0][0], m[1] - D[0][1]) <= tol) return this._drawClose(); // back on the first corner: the room is closed
    const last = D[D.length - 1]; if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.05) return false;
    D.push(q); this._hover = null; return false;
  }
  _drawClose() {
    const r = this._rooms[this._sel], D = this._draft || [];
    if (!r || D.length < 3) return false;
    r.points = D.map(p => [r2(p[0]), r2(p[1])]); delete r.rects; this._draft = null; this._hover = null; this._stool = 'rect'; this._psel = null;
    return true;
  }
  _mDraw(box, r) {
    const D = this._draft || [], d = document.createElement('div'); d.className = 'sh-ed';
    d.innerHTML = `<div class="sh-hint">${t('Tap each corner of {0} in turn: the walls follow. Tap the first corner again (or Done) to close the room. Its shape is replaced by what you draw.', esc(this._roomName(r, this._sel)))}</div>
      <div class="sh-row"><span class="sh-hint" style="flex:1">${t('{0} corners', D.length)}</span>
        <label class="sh-hint" style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-dstraight ${this._drawFree ? '' : 'checked'}>${t('Straight walls (every 45°)')}</label></div>
      <div class="sh-row"><button class="sh-btn pri" data-ddone ${D.length >= 3 ? '' : 'disabled'}><ha-icon icon="mdi:check"></ha-icon>${t('Done')}</button>
        <button class="sh-btn" data-dback ${D.length ? '' : 'disabled'}><ha-icon icon="mdi:undo"></ha-icon>${t('Remove last corner')}</button><span style="flex:1"></span>
        <button class="sh-btn" data-dcancel>${t('Cancel')}</button></div>`;
    box.appendChild(d);
    d.querySelector('[data-dstraight]').addEventListener('change', e => { this._drawFree = !e.target.checked; });
    d.querySelector('[data-ddone]').addEventListener('click', () => { if (this._drawClose()) this._emit(); this._render(); });
    d.querySelector('[data-dback]').addEventListener('click', () => { D.pop(); this._render(); });
    d.querySelector('[data-dcancel]').addEventListener('click', () => { this._draft = null; this._hover = null; this._stool = 'rect'; this._render(); });
  }
  /* separate walls: a partition, a kitchen half wall, a glass screen, a curved garden wall */
  _mWalls(box) {
    const H = this._H, w = arr(H.extra_walls)[this._wsel];
    const o = w && !Array.isArray(w) ? w : null;
    const n = arr(H.extra_walls).filter(x => this._onLv(Array.isArray(x) ? x : x || {})).length;
    const d = document.createElement('div'); d.className = 'sh-ed';
    d.innerHTML = `<div class="sh-hint">${t('Drag on the plan to draw a wall that stands on its own: a partition, a kitchen half wall, a glass screen, a curved garden wall. Tap a wall to change it, drag it or its ends to move it. Doors and openings cut it too.')}</div>
      <div class="sh-hint">${t('{0} separate wall(s) on this floor', n)}</div>
      ${o ? `<div class="sh-ent"><span class="nm">${t('Kind')}</span><select data-wt>${WALL_TYPES.map(([v, l]) => `<option value="${v}" ${(o.type || 'wall') === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></div>
      <div class="sh-ent"><span class="nm">${t('Height (m, empty: automatic)')}</span><input data-wh type="number" min="0.2" max="3" step="0.05" value="${o.height ?? ''}"></div>
      <div class="sh-ent"><span class="nm">${t('Bend (m, + one side, − the other)')}</span><input data-wb type="number" min="-5" max="5" step="0.1" value="${o.bow ?? ''}"></div>
      <div class="sh-row"><span class="sh-hint">${t('Length')}: ${r2(Math.hypot(o.to[0] - o.from[0], o.to[1] - o.from[1]))} m</span><span style="flex:1"></span><button data-wdel class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete wall')}</button></div>` : ''}`;
    box.appendChild(d);
    if (!o) return;
    const set = (k, v) => { if (v === '' || v == null || (k === 'type' && v === 'wall')) delete o[k]; else o[k] = k === 'type' ? v : Number(v); this._emit(); this._render(); };
    d.querySelector('[data-wt]').addEventListener('change', e => set('type', e.target.value));
    d.querySelector('[data-wh]').addEventListener('change', e => set('height', e.target.value));
    d.querySelector('[data-wb]').addEventListener('change', e => set('bow', e.target.value === '' || Number(e.target.value) === 0 ? '' : e.target.value));
    d.querySelector('[data-wdel]').addEventListener('click', () => { H.extra_walls.splice(this._wsel, 1); if (!H.extra_walls.length) delete H.extra_walls; this._wsel = null; this._emit(); this._render(); });
  }
  // a copy of the room (without its area, so devices aren't found twice), to the right of the plan
  _dupRoom() {
    const rooms = this._rooms, r = rooms[this._sel], c = clone(r);
    const all = rooms.map(roomBox).filter(Boolean), mine = roomBox(r);
    const dx = mine ? Math.max(...all.map(q => q[2])) + 1 - mine[0] : 0;
    if (c.points) c.points = c.points.map(q => [r2(q[0] + dx), q[1], ...q.slice(2)]);
    else c.rects = arr(r.rects).map(q => [r2(q[0] + dx), q[1], r2(q[2] + dx), q[3]]);
    for (const f of arr(c.furniture)) movePiece(f, dx, 0);
    delete c.area; delete c.id; c.name = `${this._roomName(r, this._sel)} copy`;
    rooms.splice(this._sel + 1, 0, c); this._sel++; this._rsel = null; this._emit(); this._render();
  }

  /* ---------------- Entities mode ---------------- */
  // what a room shows for one setting: [entity ids, whether it is the room's own list (true) or found in its area (false)]
  _roleList(r, key, fkey, found) {
    if (r[key] !== undefined) return [r[key] === null ? [] : arr(r[key]).map(entityId).filter(Boolean), true];
    return [arr(found[fkey]).map(entityId).filter(Boolean), false];
  }
  _mEntities(box, r) {
    const R = this._reg, found = r.area ? discoverRoom(R, r.area) : {};
    const lists = Object.fromEntries(ROLES.map(([key, , fkey]) => [key, this._roleList(r, key, fkey, found)]));
    const assigned = new Set(Object.values(lists).flatMap(([l]) => l));
    const nm = id => esc(R.name(id));
    const html = [];
    if (!r.area) html.push(`<div class="sh-hint">This room isn't linked to an area, so nothing is found on its own. Link one in Shape mode, or add entities here.</div>`);
    for (const [key, title, , icon] of ROLES) {
      const [ids, own] = lists[key];
      if (!ids.length && !own) continue;
      html.push(`<div class="sh-role" data-role="${key}"><h4><ha-icon icon="${icon}"></ha-icon>${t(title)}<small>${t(own ? 'your list' : 'found in area')}</small>${own ? `<a data-reset="${key}">${t('Back to what the area has')}</a>` : ''}</h4>
        ${ids.length ? ids.map(id => this._entRowHtml(r, key, id)).join('') : `<div class="sh-hint">${t('None.')}</div>`}${key === 'lights' ? this._stripHtml(r) : ''}</div>`);
    }
    // area entities that aren't shown anywhere yet
    const sugg = (R.byArea[r.area] || []).filter(id => !assigned.has(id));
    html.push(`<div class="sh-role"><h4><ha-icon icon="mdi:plus-circle-outline"></ha-icon>${t('Add')}</h4>
      ${sugg.length ? `<div class="sh-hint" style="margin-bottom:6px">${t('Also in this area:')}</div><div class="sh-sugg">${sugg.slice(0, 30).map(id => `<button class="sh-chip" data-addent="${id}"><ha-icon icon="mdi:plus"></ha-icon>${nm(id)}</button>`).join('')}</div>` : ''}
      <div class="sh-anyslot" style="margin-top:8px"></div></div>`);
    // entities in no room at all
    const free = this._unassigned();
    html.push(`<details class="sh-box" ${this._freeOpen ? 'open' : ''} data-free> <summary><b>${t('Not in any room ({0})', free.length)}</b><span class="sh-hint">${t('tap to add here')}</span></summary>
      <input class="sh-search" type="search" placeholder="${t('Search')}" value="${esc(this._freeQ || '')}"><div class="sh-sugg sh-freelist" style="margin-top:8px"></div></details>`);
    box.innerHTML = html.join('');
    // any entity
    box.querySelector('.sh-anyslot').appendChild(this._form([{ name: 'add', selector: { entity: {} } }], { add: '' }, v => { if (v.add) { this._addEntity(r, v.add, found); } }, { add: t('Any entity') }));
    box.querySelectorAll('[data-addent]').forEach(b => b.addEventListener('click', () => this._addEntity(r, b.dataset.addent, found)));
    box.querySelectorAll('[data-reset]').forEach(a => a.addEventListener('click', () => { delete r[a.dataset.reset]; this._emit(); this._render(); }));
    box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.key, id = b.dataset.rm, [ids] = lists[key];
      if (SINGLE_ROLES.includes(key)) r[key] = null; else r[key] = ids.filter(x => x !== id).map(x => this._keepObj(r, key, x));
      if (key === 'lights') this._lightOpt(r, id, null);
      this._emit(); this._render();
    }));
    box.querySelectorAll('[data-rename]').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => this._rename(inp, r));
    });
    box.querySelectorAll('[data-lfx]').forEach(s => s.addEventListener('change', () => { this._lightOpt(r, s.dataset.lfx, { fx: s.value }); this._emit(); this._render(); }));
    box.querySelectorAll('[data-sside]').forEach(c => c.addEventListener('change', () => {
      const v = [...box.querySelectorAll('[data-sside]')].filter(x => x.checked).map(x => x.dataset.sside).join('');
      if (v === 'nesw') delete r.strip_sides; else r.strip_sides = v; this._emit();
    }));
    box.querySelector('[data-smode]')?.addEventListener('change', e => { if (e.target.value === 'walls') r.strip_mode = 'walls'; else delete r.strip_mode; this._emit(); });
    box.querySelectorAll('[data-lcol]').forEach(c => c.addEventListener('change', () => { this._lightOpt(r, c.dataset.lcol, { color: c.checked }); this._emit(); }));
    box.querySelectorAll('[data-lsim]').forEach(c => c.addEventListener('change', () => { this._lightOpt(r, c.dataset.lsim, { simple: c.checked }); this._emit(); }));
    const det = box.querySelector('[data-free]'), q = det.querySelector('.sh-search'), list = det.querySelector('.sh-freelist');
    det.addEventListener('toggle', () => { this._freeOpen = det.open; });
    const fill = () => {
      const s = (this._freeQ || '').toLowerCase();
      const hits = free.filter(id => !s || id.includes(s) || R.name(id).toLowerCase().includes(s));
      list.innerHTML = hits.slice(0, 40).map(id => `<button class="sh-chip" data-free="${id}" title="${id}"><ha-icon icon="mdi:plus"></ha-icon>${nm(id)}</button>`).join('') + (hits.length > 40 ? `<span class="sh-hint">…and ${hits.length - 40} more: search to narrow it down</span>` : '') || '<span class="sh-hint">Nothing.</span>';
      list.querySelectorAll('[data-free]').forEach(b => b.addEventListener('click', () => this._addEntity(r, b.dataset.free, found)));
    };
    q.addEventListener('input', () => { this._freeQ = q.value; fill(); });
    fill();
  }
  // LED strip of the room (when one of its lights is drawn as a strip): which walls it runs along, and what it does
  // where a wall is missing (an opening, a door): keep going along the whole side, or stop at the gap
  _stripHtml(r) {
    if (!Object.values(r.light_fx || {}).includes('strip')) return '';
    if (Array.isArray(r.strip_sides)) return `<div class="sh-hint">${t('Strip on more than one rectangle: set its sides in YAML (strip_sides)')}</div>`;
    const sides = r.strip_sides ?? 'nesw', mode = r.strip_mode === 'walls' ? 'walls' : 'full';
    return `<div class="sh-ent"><span class="nm">${t('LED strip on')}</span>${[['n', 'North'], ['e', 'East'], ['s', 'South'], ['w', 'West']].map(([k, n]) => `<label><input type="checkbox" data-sside="${k}" ${sides.includes(k) ? 'checked' : ''}>${t(n)}</label>`).join('')}</div>
      <div class="sh-ent"><span class="nm">${t('Where there is no wall')}</span><select data-smode><option value="full" ${mode === 'full' ? 'selected' : ''}>${t('Keep going')}</option><option value="walls" ${mode === 'walls' ? 'selected' : ''}>${t('Stop at the gap')}</option></select></div>`;
  }
  _entRowHtml(r, key, id) {
    const R = this._reg, ok = !!this._hass.states[id];
    let opts = '';
    if (key === 'lights') {
      const fx = (r.light_fx || {})[id] || '', col = arr(r.color_lights).includes(id), simple = arr(r.simple_lights).includes(id);
      opts = `<select data-lfx="${id}" title="How it is drawn in 3D">${LIGHT_FX.map(([v, n]) => `<option value="${v}" ${v === fx ? 'selected' : ''}>${t(n)}</option>`).join('')}</select>
        <label><input type="checkbox" data-lcol="${id}" ${col ? 'checked' : ''}>${t('Colours')}</label><label><input type="checkbox" data-lsim="${id}" ${simple ? 'checked' : ''}>${t('On / off only')}</label>`;
    }
    // The name can be changed right here, for this dashboard only (room `names`); Home Assistant is not changed.
    const own = (r.names || {})[id] ?? (key === 'lights' ? (r.light_names || {})[id] : undefined);
    const cur = own ?? (ok ? R.name(id) : id);
    const name = `<label class="sh-namebox"><ha-icon icon="mdi:pencil-outline"></ha-icon><input class="sh-rename" data-rename="${id}" value="${esc(cur)}" placeholder="${esc(ok ? R.name(id) : id)}" title="${esc(t('Rename'))}" aria-label="${esc(t('Name of {0}', id))}"></label>`;
    const note = !ok ? t('not found') : own != null ? `${esc(id)} · ${t('name on this dashboard')}` : esc(id);
    return `<div class="sh-ent ${ok ? '' : 'bad'}"><span class="nm">${name}<small>${note}</small></span>${opts}
      <button class="sh-x" data-rm="${id}" data-key="${key}" title="Remove from this room"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
  }
  // a name for this dashboard only (room `names`); an empty field, or the entity's own name, removes it
  _rename(inp, r) {
    const id = inp.dataset.rename, v = inp.value.trim(), small = inp.closest('.nm')?.querySelector('small');
    const names = { ...(r.names || {}) };
    if (!v || v === this._reg.name(id)) delete names[id]; else names[id] = v;
    if (r.light_names?.[id] != null) { const ln = { ...r.light_names }; delete ln[id]; if (Object.keys(ln).length) r.light_names = ln; else delete r.light_names; }
    if (Object.keys(names).length) r.names = names; else delete r.names;
    this._dropName(id, r); // one name per entity on this dashboard: the one given here
    this._emit();
    if (small) { small.textContent = `${id} · ${t(names[id] ? 'name on this dashboard' : 'default name')}`; small.style.color = 'var(--success-color, #43a047)'; }
  }
  // Security: for each gate / garage door picked, the sensors that tell whether it is open — a contact sensor, or a
  // camera's state classification (Frigate) — with suggestions found by name and device
  _entranceSensors(det, P) {
    const S = typeof P.security === 'object' && P.security ? P.security : null, list = arr(S?.entrances);
    if (!list.length) return;
    const R = this._reg, words = id => (this._reg.name(id) + ' ' + id).toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/).filter(w => w.length > 2 && !/^(cover|switch|button|script|relay|the|open|close|sensor|binary)$/.test(w));
    const box = document.createElement('div'); box.className = 'sh-ed'; box.style.marginTop = '10px';
    box.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${t('Open / closed sensors')}</div><div class="sh-hint">${t('Tell each gate whether it is open: a door or contact sensor, or a camera that recognises the gate’s state (Frigate state classification: a sensor that reads open / closed). Add a second one as a backup.')}</div>`;
    det.appendChild(box);
    list.forEach((e, i) => {
      const id = entityId(e); if (!id) return;
      const o = typeof e === 'object' ? e : { entity: id }, cur = arr(o.sensor);
      const row = document.createElement('div'); row.className = 'sh-ent'; row.style.display = 'block';
      // suggestions: contact sensors / text sensors on the same device, or sharing a word with the gate's name
      const ws = words(id), dev = R.ents[id]?.device_id;
      const sugg = Object.keys(this._hass.states).filter(x => (x.startsWith('binary_sensor.') && ['door', 'garage_door', 'opening', 'window'].includes(R.dc(x))) || (x.startsWith('sensor.') && (R.platform(x) === 'frigate' || /state|status|position/.test(x))))
        .filter(x => !cur.includes(x) && ((dev && R.ents[x]?.device_id === dev) || words(x).some(w => ws.includes(w)))).slice(0, 4);
      row.innerHTML = `<span class="nm">${esc(R.name(id))}<small>${esc(id)}</small></span>${sugg.length ? `<div class="sh-hint" style="margin:4px 0">${t('Suggested')}: ${sugg.map(x => `<button class="sh-chip" data-sg="${esc(x)}">${esc(R.name(x))}</button>`).join(' ')}</div>` : ''}`;
      row.appendChild(this._form([{ name: 'sensor', selector: { entity: { domain: ['binary_sensor', 'sensor', 'select', 'input_select', 'cover', 'lock', 'input_boolean'] } } }, { name: 'sensor_2', selector: { entity: { domain: ['binary_sensor', 'sensor', 'select', 'input_select', 'cover', 'lock', 'input_boolean'] } } }],
        { sensor: cur[0] || '', sensor_2: cur[1] || '' }, v => {
          const nx = [v.sensor, v.sensor_2].filter(Boolean), obj = { ...o, entity: id }; delete obj.sensor_2;
          if (nx.length) obj.sensor = nx.length > 1 ? nx : nx[0]; else delete obj.sensor;
          S.entrances[i] = Object.keys(obj).length === 1 ? id : obj; this._emit();
        }, { sensor: 'Open / closed sensor', sensor_2: 'Second sensor (backup)' }));
      row.querySelectorAll('[data-sg]').forEach(b => b.addEventListener('click', () => {
        const nx = [...cur, b.dataset.sg].slice(0, 2), obj = { ...o, entity: id, sensor: nx.length > 1 ? nx : nx[0] };
        S.entrances[i] = obj; this._emit(); this._render();
      }));
      box.appendChild(row);
    });
  }
  // People: who shows at the top (empty: everyone), and for each person the rows of their phone panel. A field left
  // empty is found on the person's phone (Home Assistant app); anything picked wins.
  _mPeople(det) {
    const C = this._config, all = Object.keys(this._hass.states).filter(x => x.startsWith('person.'));
    det.appendChild(this._form([{ name: 'persons', selector: { entity: { domain: 'person', multiple: true } } }], { persons: arr(C.persons) }, v => {
      if (arr(v.persons).length) C.persons = arr(v.persons); else delete C.persons; this._emit(); this._render();
    }, { persons: 'People at the top (empty: everyone)' }));
    const sensor = { entity: { domain: ['sensor', 'binary_sensor'] } };
    for (const p of arr(C.persons).length ? arr(C.persons) : all) {
      const o = { ...(C.people?.[p] || {}) }, d = document.createElement('details'); d.className = 'sh-panel'; d.style.margin = '8px 0 0';
      d.innerHTML = `<summary><span><b>${esc(this._reg.name(p))}</b><br><small>${t('Phone panel: leave every field empty to find them on the phone; once you pick one, only what you pick shows')}</small></span></summary>`;
      d.appendChild(this._form([
        { name: 'name', selector: { text: {} } }, { name: 'tracker', selector: { entity: { domain: 'device_tracker' } } },
        { type: 'grid', name: '', schema: [{ name: 'battery', selector: sensor }, { name: 'charging', selector: sensor }, { name: 'location', selector: sensor }, { name: 'ringer', selector: sensor }, { name: 'wifi', selector: sensor }] },
        { name: 'entities', selector: { entity: { multiple: true } } },
        { name: 'buttons', selector: { entity: { domain: ['button', 'input_button', 'script', 'scene', 'switch', 'input_boolean'], multiple: true } } },
      ], { ...o, entities: arr(o.entities), buttons: arr(o.buttons).map(entityId).filter(Boolean) }, (v, typing) => {
        const n = { ...(C.people?.[p] || {}) };
        for (const [k, val] of Object.entries(v)) {
          let x = val; if (k === 'buttons') x = arr(val).map(id => arr(n.buttons).find(b => typeof b === 'object' && entityId(b) === id) || id);
          if (x === '' || x == null || (Array.isArray(x) && !x.length)) delete n[k]; else n[k] = x;
        }
        C.people = { ...(C.people || {}) }; if (Object.keys(n).length) C.people[p] = n; else delete C.people[p]; if (!Object.keys(C.people).length) delete C.people;
        this._emit(typing);
      }, { name: 'Name on the panel (empty: the phone’s name)', tracker: 'Phone tracker', battery: 'Battery', charging: 'Charging', location: 'Address', ringer: 'Ringer mode', wifi: 'Wi-Fi', entities: 'More rows (any entity)', buttons: 'Buttons (ring the phone, find it, scripts…)' }));
      // each button: a name and an icon of its own for this dashboard (empty: the button's name without "button" and the
      // phone's name, and an icon picked from what it does)
      arr(o.buttons).forEach((b, bi) => {
        const id = entityId(b); if (!id) return;
        const bo = typeof b === 'object' ? b : { entity: id }, row = document.createElement('div'); row.className = 'sh-ent'; row.style.display = 'block';
        row.innerHTML = `<span class="nm">${t('Button')}: ${esc(this._reg.name(id))}<small>${esc(id)}</small></span>`;
        row.appendChild(this._form([{ type: 'grid', name: '', schema: [{ name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } }] }], { name: bo.name || '', icon: bo.icon || '' }, (v, typing) => {
          const n = { ...C.people[p] }, list = arr(n.buttons).slice(), nb = { ...bo, entity: id };
          for (const k of ['name', 'icon']) { if (v[k]) nb[k] = v[k]; else delete nb[k]; }
          list[bi] = Object.keys(nb).length === 1 ? id : nb; n.buttons = list; C.people = { ...C.people, [p]: n }; this._emit(typing);
        }, { name: 'Name on this dashboard', icon: 'Icon (empty: picked from what it does)' }));
        d.appendChild(row);
      });
      det.appendChild(d);
    }
  }
  // removes an entity's dashboard name everywhere except in `keep` (the card's `names`, other rooms' `names` / `light_names`)
  _dropName(id, keep) {
    for (const h of [this._config, ...this._rooms]) if (h !== keep) for (const k of ['names', 'light_names']) if (h[k]?.[id] != null) { delete h[k][id]; if (!Object.keys(h[k]).length) delete h[k]; }
  }
  // a plug written as {entity, name, power} keeps its extra settings when the list changes
  _keepObj(r, key, id) { return arr(r[key]).find(e => typeof e === 'object' && entityId(e) === id) || id; }
  _addEntity(r, id, found) {
    const key = roleOf(this._reg, id), fkey = ROLES.find(x => x[0] === key)[2];
    if (SINGLE_ROLES.includes(key)) r[key] = id;
    else { const [ids] = this._roleList(r, key, fkey, found); if (!ids.includes(id)) r[key] = [...ids.map(x => this._keepObj(r, key, x)), id]; }
    this._emit(); this._render();
  }
  _lightOpt(r, id, o) {
    const fx = { ...(r.light_fx || {}) }, col = new Set(arr(r.color_lights)), sim = new Set(arr(r.simple_lights));
    if (o === null) { delete fx[id]; col.delete(id); sim.delete(id); }
    else {
      if ('fx' in o) { if (o.fx) fx[id] = o.fx; else delete fx[id]; }
      if ('color' in o) o.color ? col.add(id) : col.delete(id);
      if ('simple' in o) o.simple ? sim.add(id) : sim.delete(id);
    }
    if (Object.keys(fx).length) r.light_fx = fx; else delete r.light_fx;
    if (col.size) r.color_lights = [...col]; else delete r.color_lights;
    if (sim.size) r.simple_lights = [...sim]; else delete r.simple_lights;
  }
  // useful entities that no room shows: not in a linked area, not in any room's lists or furniture
  _unassigned() {
    const R = this._reg, rooms = this._rooms, H = this._H;
    const areas = new Set(rooms.map(r => r.area).filter(Boolean)), used = new Set();
    for (const r of rooms) {
      for (const [key] of ROLES) for (const e of arr(r[key])) used.add(entityId(e));
      for (const f of arr(r.furniture)) furnEntities(f).forEach(e => used.add(e));
    }
    for (const d of arr(H.doors)) used.add(d.entity);
    for (const b of arr(H.lock_badges)) used.add(b.lock || b.entity);
    return Object.keys(this._hass.states).filter(id => USEFUL(id) && R.visible(id) && !used.has(id) && !areas.has(R.areaOf(id))
      && !(id.startsWith('sensor.') && !['temperature', 'humidity', 'power', 'energy', 'illuminance', 'carbon_dioxide', 'pm25'].includes(R.dc(id)))
      && !(id.startsWith('binary_sensor.') && !['motion', 'occupancy', 'presence', 'door', 'window', 'opening', 'garage_door', 'moisture', 'smoke'].includes(R.dc(id))))
      .sort((a, b) => R.name(a).localeCompare(R.name(b)));
  }

  /* ---------------- Furniture mode ---------------- */
  // a room with automatic furniture gets its own list the first time it is edited (the automatic set, as pieces)
  _ownFurniture(i) {
    const r = this._rooms[i];
    if (!Array.isArray(r.furniture)) r.furniture = this._H.auto_furniture && r.furniture !== false ? autoFurnitureConfig(r, this._roomName(r, i)) : [];
    return r.furniture;
  }
  _addPiece(i, type, x, z) {
    const list = this._ownFurniture(i);
    const o = clone(NEW_PIECE[type] || {}), span = o._span; delete o._span;
    list.push(span ? { type, from: [r2(x - span[0]), r2(z - span[1])], to: [r2(x + span[0]), r2(z + span[1])], ...o } : { type, x, z, ...o });
    this._sel = i; this._fsel = list.length - 1; this._toWall(list[list.length - 1]);
  }
  // A piece close to a wall (up to 35 cm) is pulled flat against it: counters, cabinets, sofas, beds… go where a wall
  // is, not a grid step away from it. It stops at the wall's inner face (walls are drawn on the room's edge lines).
  _toWall(f) {
    const t = String(f.type || 'box'); if (['lamp', 'fan', 'marker', 'plant', 'cylinder', 'ball', 'tree', 'sprinkler', 'rug', 'pool', 'car', 'blinds', 'stairs'].includes(t)) return;
    const b = fpBox(footprint(f)), MAG = 0.35, IN = 0.06; let dx = 0, dz = 0, bx = MAG, bz = MAG;
    for (const [x1, z1, x2, z2] of this._wallSegsHere()) {
      if (Math.abs(x1 - x2) < 1e-6) { // a wall along z at x = x1: the piece's left or right side goes to it
        if (Math.min(z1, z2) > b[3] - 0.05 || Math.max(z1, z2) < b[1] + 0.05) continue;
        for (const d of [x1 + IN - b[0], x1 - IN - b[2]]) if (Math.abs(d) < bx) { bx = Math.abs(d); dx = d; }
      } else if (Math.abs(z1 - z2) < 1e-6) { // a wall along x at z = z1
        if (Math.min(x1, x2) > b[2] - 0.05 || Math.max(x1, x2) < b[0] + 0.05) continue;
        for (const d of [z1 + IN - b[1], z1 - IN - b[3]]) if (Math.abs(d) < bz) { bz = Math.abs(d); dz = d; }
      }
    }
    if (dx || dz) movePiece(f, r2(dx), r2(dz));
  }
  _mFurniture(box, r) {
    const auto = !Array.isArray(r.furniture) && this._H.auto_furniture && r.furniture !== false;
    const list = arr(Array.isArray(r.furniture) ? r.furniture : []);
    const f = list[this._fsel];
    box.innerHTML = `<div class="sh-ed">
      ${auto ? '<div class="sh-hint">This room uses automatic furniture (from its name). Placing, moving or suggesting a piece turns it into pieces you can change.</div>' : ''}
      <div class="sh-pal">${PALETTE.map(k => `<button data-pal="${k}" class="${this._place === k ? 'on' : ''}"><ha-icon icon="${FURN_TYPES[k][1]}"></ha-icon>${t(FURN_TYPES[k][0])}</button>`).join('')}</div>
      <div class="sh-row"><button data-suggest><ha-icon icon="mdi:auto-fix"></ha-icon>${t(list.length ? 'Replace with a suggested set' : 'Suggest furniture')}</button>
        ${list.length ? `<button data-clear class="del"><ha-icon icon="mdi:delete-sweep-outline"></ha-icon>${t('Remove all')}</button>` : ''}
        ${r.furniture === false ? '' : `<button data-none><ha-icon icon="mdi:cancel"></ha-icon>${t('No furniture')}</button>`}</div>
      <div class="sh-piece"></div>
      ${list.length ? `<div class="sh-sugg">${list.map((p, k) => `<button class="sh-chip" data-pick="${k}" style="${k === this._fsel ? 'border-color:var(--primary-color)' : ''}"><ha-icon icon="${FURN_TYPES[p.type]?.[1] || 'mdi:shape-outline'}"></ha-icon>${esc(p.name || t(FURN_TYPES[p.type]?.[0] || p.type))}${furnEntities(p).length ? ` <span class="sh-tag">${t('linked')}</span>` : ''}</button>`).join('')}</div>` : ''}
    </div>`;
    box.querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => { this._place = this._place === b.dataset.pal ? null : b.dataset.pal; this._fsel = null; this._render(); }));
    box.querySelector('[data-suggest]').addEventListener('click', () => { r.furniture = autoFurnitureConfig(r, this._roomName(r, this._sel)); this._fsel = null; this._emit(); this._render(); });
    box.querySelector('[data-clear]')?.addEventListener('click', () => { r.furniture = []; this._fsel = null; this._emit(); this._render(); });
    box.querySelector('[data-none]')?.addEventListener('click', () => { r.furniture = false; this._fsel = null; this._emit(); this._render(); });
    box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { this._fsel = +b.dataset.pick; this._render(); }));
    if (f) this._pieceForm(box.querySelector('.sh-piece'), r, f);
  }
  _pieceForm(slot, r, f) {
    const ty = f.type, ck = COLOR_KEY[ty] || 'color', fields = PIECE_FIELDS[ty] || [];
    const ents = furnEntities(f);
    const parts = PART_COLORS[ty] || [];
    const data = { name: f.name || '', entities: ents, badge: f.badge !== false, color: hex2rgb(f[ck]) };
    for (const [k, , d] of parts) data['c_' + k] = hex2rgb(typeof f[k] === 'string' ? f[k] : d);
    for (const [k] of fields) if (f[k] !== undefined) data[k] = f[k];
    if (ty === 'nightstand') { data.lamp = f.lamp !== false; data.drawers ??= 2; }
    const schema = [
      { name: 'entities', selector: { entity: { multiple: true, ...(ENTITY_FILTER[ty] ? { filter: ENTITY_FILTER[ty] } : {}) } } },
      { name: 'name', selector: { text: {} } },
      ...(fields.length ? [{ type: 'grid', name: '', schema: fields.map(([name, selector]) => ({ name, selector })) }] : []),
      ...(['plant', 'stairs', 'vacuum'].includes(ty) ? [] : [{ name: 'color', selector: { color_rgb: {} } }]),
      ...(parts.length ? [{ type: 'grid', name: '', schema: parts.map(([k]) => ({ name: 'c_' + k, selector: { color_rgb: {} } })) }] : []),
      ...(ents.length ? [{ name: 'badge', selector: { boolean: {} } }] : []),
    ];
    const head = document.createElement('div'); head.className = 'sh-row'; head.style.marginBottom = '6px';
    head.innerHTML = `<b style="flex:1">${esc(t(FURN_TYPES[ty]?.[0] || ty))}</b>${ROUND.includes(ty) ? '' : `<button data-turn title="${t('Turn a quarter clockwise')}"><ha-icon icon="mdi:rotate-right"></ha-icon>${t('Turn')}</button>`}
      <button data-copy><ha-icon icon="mdi:content-copy"></ha-icon>${t('Duplicate')}</button><button class="del" data-delp><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete')}</button>`;
    slot.appendChild(head);
    head.querySelector('[data-turn]')?.addEventListener('click', () => { turnPiece(f); this._emit(); this._render(); });
    head.querySelector('[data-copy]').addEventListener('click', () => { const c = clone(f); movePiece(c, this._grid * 2, this._grid * 2); r.furniture.push(c); this._fsel = r.furniture.length - 1; this._emit(); this._render(); });
    head.querySelector('[data-delp]').addEventListener('click', () => { r.furniture.splice(this._fsel, 1); this._fsel = null; this._emit(); this._render(); });
    slot.appendChild(this._form(schema, data, (v, typing) => {
      const ids = arr(v.entities).filter(Boolean);
      delete f.entity; delete f.entities;
      if (ids.length === 1) f.entity = ids[0]; else if (ids.length > 1) f.entities = ids;
      if (v.name) f.name = v.name; else delete f.name;
      for (const [k] of fields) { if (v[k] !== undefined && v[k] !== '' && v[k] !== null) f[k] = v[k]; }
      for (const k of ['plug', 'power']) if (fields.some(([n]) => n === k) && !v[k]) delete f[k]; // a cleared entity is gone
      const hx = rgb2hex(v.color); if (hx) f[ck] = hx;
      for (const [k, , d] of parts) { const c = rgb2hex(v['c_' + k]); if (c && (c !== d || typeof f[k] === 'string')) f[k] = c; } // the other parts' colours
      if (v.badge === false && ids.length) f.badge = false; else delete f.badge;
      const relink = (ids.length > 0) !== (ents.length > 0);
      this._emit(typing);
      if (relink) this._render(); else { const svg = this.querySelector('.sh-plan'); if (svg) this._drawPlan(svg); }
    }, { ...PIECE_LABELS, entities: ty === 'car' ? 'Car sensor (shows the car while it is parked)' : ty === 'sprinkler' ? 'Valve or switch (sprays water while it is on)' : 'Linked entities (tap the piece in 3D to control them)', badge: 'Show a badge over it in 3D', ...(ty === 'nightstand' ? { facing: 'Drawers face', entities: 'Linked entities (a light makes its lamp glow)' } : {}), ...(ty === 'charger' ? { entities: 'Linked entities (tap the phone in 3D to control them)' } : {}), ...(f.plug && !f.power ? { power: this._reg.powerOf(f.plug) ? t('Charger power sensor (empty: uses {0})', this._reg.name(this._reg.powerOf(f.plug))) : 'Charger power sensor (none found: the phone shows while the plug is on)' } : {}), color: ty === 'sofa' ? 'Colour (frame and back)' : 'Colour', ...Object.fromEntries(parts.map(([k, l]) => ['c_' + k, l])) }, true));
  }

  /* ---------------- Doors & windows mode ---------------- */
  _mDoors(box) {
    const H = this._H, tools = [['door', 'Door', 'mdi:door-open'], ['window', 'Window', 'mdi:window-closed-variant'], ['opening', 'Open passage', 'mdi:arrow-expand-horizontal'], ['badge', 'Lock badge', 'mdi:lock']];
    box.innerHTML = `<div class="sh-ed"><div class="sh-modes">${tools.map(([k, n, i]) => `<button data-tool="${k}" class="${this._dtool === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('')}</div>
      ${Array.isArray(H.windows) ? `<div class="sh-row"><span class="sh-hint" style="flex:1">Automatic windows are off because you placed your own (${H.windows.length}).</span><button data-autowin>${t('Back to automatic windows')}</button></div>` : `<div class="sh-hint">${t('Windows are placed on long outer walls automatically. Add one to place them yourself.')}</div>`}
      <div class="sh-hint">${t('Rooms are closed by walls: add a door or an opening wherever you can walk between them. Drag a door, window, opening or badge to move it.')}</div>
      <div class="sh-ditem"></div></div>`;
    box.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { this._dtool = b.dataset.tool; this._dsel = null; this._render(); }));
    box.querySelector('[data-autowin]')?.addEventListener('click', () => { delete H.windows; this._dsel = null; this._emit(); this._render(); });
    const it = this._dsel, slot = box.querySelector('.sh-ditem'); if (!it) return;
    const head = document.createElement('div'); head.className = 'sh-row';
    head.innerHTML = `<b style="flex:1">${t({ door: 'Door', window: 'Window', opening: 'Open passage', badge: 'Lock badge' }[it.k])}</b><button class="del" data-deld><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete')}</button>`;
    slot.appendChild(head);
    head.querySelector('[data-deld]').addEventListener('click', () => { this._delDoorItem(); this._emit(); this._render(); });
    if (it.k === 'door') {
      const d = H.doors[it.i];
      slot.appendChild(this._form([
        { name: 'entity', selector: { entity: { domain: 'binary_sensor' } } },
        { name: 'side', selector: sel([['1', 'Swings one way'], ['-1', 'Swings the other way']].map(([v, n]) => [v, t(n)])) },
        { name: 'main', selector: { boolean: {} } },
      ], { entity: d.entity || '', side: String(d.side ?? 1), main: !!d.main }, v => {
        if (v.entity) d.entity = v.entity; else delete d.entity; if (v.side === '-1') d.side = -1; else delete d.side; if (v.main) d.main = true; else delete d.main;
        this._emit(); const svg = this.querySelector('.sh-plan'); if (svg) this._drawPlan(svg);
      }, { entity: 'Contact sensor (optional: the door opens in 3D while it is open)', main: 'Main entrance' }));
    } else if (it.k === 'badge') {
      const b = H.lock_badges[it.i];
      slot.appendChild(this._form([{ name: 'lock', selector: { entity: { domain: 'lock' } } }, { name: 'name', selector: { text: {} } }, { name: 'label', selector: { boolean: {} } }],
        { lock: b.lock || b.entity || '', name: b.name || '', label: b.label !== false }, (v, typing) => {
          b.lock = v.lock || ''; delete b.entity;
          if (v.name) b.name = v.name; else delete b.name;
          if (v.label === false) b.label = false; else delete b.label;
          this._emit(typing);
        }, { lock: 'Lock', name: 'Name shown in 3D (empty: the lock’s name)', label: 'Show the name above the badge' }));
    }
  }
  _delDoorItem() {
    const H = this._H, it = this._dsel; if (!it) return;
    const key = { door: 'doors', window: 'windows', opening: 'openings', badge: 'lock_badges' }[it.k];
    if (Array.isArray(H[key])) H[key].splice(it.i, 1);
    if (key !== 'windows' && Array.isArray(H[key]) && !H[key].length) delete H[key];
    this._dsel = null;
  }

  /* ================================================================ */
  /* Panels step                                                       */
  /* ================================================================ */
  _rPanels(body) {
    const P = this._config.panels = this._config.panels || {};
    body.innerHTML = `<div class="sh-ed"><div class="sh-hint">Panels show up when Home Assistant has something for them (found by integration and device class). Switch off what you don't want, or pick the entities yourself.</div><div class="sh-pl sh-ed"></div></div>`;
    const list = body.querySelector('.sh-pl');
    const set = (k, v) => { if (v === undefined || (typeof v === 'object' && !Object.keys(v).length)) delete P[k]; else P[k] = v; if (!Object.keys(P).length) delete this._config.panels; this._emit(); };
    const schemas = {
      security: [{ name: 'alarm', selector: { entity: { domain: 'alarm_control_panel' } } }, { name: 'locks', selector: { entity: { domain: 'lock', multiple: true } } }, { name: 'entrances', selector: { entity: { domain: ['cover', 'switch', 'button', 'input_button', 'input_boolean', 'script'], multiple: true } } }, { name: 'doors', selector: { entity: { domain: 'binary_sensor', device_class: ['door', 'garage_door'], multiple: true } } }, { name: 'cameras', selector: { entity: { domain: 'camera', multiple: true } } }],
      climate: [{ name: 'entities', selector: { entity: { domain: 'climate', multiple: true } } }],
      energy: [{ name: 'grid_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'solar_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'month_sensor', selector: { entity: { domain: 'sensor' } } }, { name: 'year_sensor', selector: { entity: { domain: 'sensor' } } }],
      car: [{ name: 'name', selector: { text: {} } }, { name: 'color', selector: { color_rgb: {} } },
        { name: 'charging', selector: { entity: { domain: ['binary_sensor', 'switch', 'input_boolean', 'sensor'] } } }, { name: 'power', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
        { name: 'battery', selector: { entity: { domain: 'sensor' } } }, { name: 'range', selector: { entity: { domain: 'sensor' } } },
        { name: 'status', selector: { entity: { domain: ['sensor', 'device_tracker', 'binary_sensor', 'select'] } } }, { name: 'time', selector: { entity: { domain: 'sensor' } } },
        { type: 'grid', name: '', schema: [{ name: 'energy_per_charge', selector: { entity: { domain: 'sensor' } } }, { name: 'cost_per_charge', selector: { entity: { domain: 'sensor' } } },
          { name: 'energy_month', selector: { entity: { domain: 'sensor' } } }, { name: 'cost_month', selector: { entity: { domain: 'sensor' } } },
          { name: 'energy_year', selector: { entity: { domain: 'sensor' } } }, { name: 'cost_year', selector: { entity: { domain: 'sensor' } } }] }],
      water: [{ name: 'tank', selector: { entity: { domain: 'sensor' } } }, { name: 'quality', selector: { entity: { domain: 'sensor' } } }, { name: 'temperature', selector: { entity: { domain: 'sensor' } } },
        { name: 'pumps', selector: { entity: { domain: ['switch', 'input_boolean'], multiple: true } } }, { name: 'entities', selector: { entity: { multiple: true } } }],
      irrigation: [{ name: 'zones', selector: { entity: { domain: ['valve', 'switch', 'input_boolean'], multiple: true } } }, { name: 'interval', selector: { entity: { domain: ['select', 'input_select'] } } }, { name: 'weekday', selector: { entity: { domain: ['select', 'input_select'] } } }, { name: 'tomorrow', selector: { entity: { domain: ['input_boolean', 'switch'] } } }, { name: 'next', selector: { entity: {} } }, { name: 'notification', selector: { entity: {} } }, { name: 'time', selector: { entity: {} } }],
      media: [{ name: 'player', selector: { entity: { domain: 'media_player' } } }, { name: 'speakers', selector: { entity: { domain: 'media_player', multiple: true } } }],
      media_server: [],
      homelab: [{ name: 'temperature', selector: { entity: { domain: 'sensor', device_class: 'temperature' } } }],
      people: [{ name: 'persons', selector: { entity: { domain: 'person', multiple: true } } }],
      devices: [{ name: 'entities', selector: { entity: { domain: 'sensor', device_class: 'battery', multiple: true } } }],
      modes: [{ name: 'modes', selector: { entity: { domain: ['input_boolean', 'switch', 'scene', 'script', 'automation', 'input_button', 'button', 'light', 'fan'], multiple: true } } }],
      attention: [{ name: 'exclude_devices', selector: { device: { multiple: true } } }, { name: 'exclude_entities', selector: { entity: { multiple: true } } },
        { name: 'battery_exclude_devices', selector: { device: { multiple: true } } },
        { name: 'battery_threshold', selector: { number: { min: 1, max: 50, unit_of_measurement: '%', mode: 'slider' } } }, { name: 'wifi_threshold', selector: { number: { min: -95, max: -50, unit_of_measurement: 'dBm', mode: 'slider' } } }, { name: 'tunnels', selector: { boolean: {} } }],
    };
    for (const [k, n, d] of PANELS) {
      const det = document.createElement('details'); det.className = 'sh-panel';
      const on = P[k] !== false;
      det.innerHTML = `<summary><span><b>${t(n)}</b><br><small>${d}</small></span></summary>`;
      const sw = document.createElement('ha-switch'); sw.checked = on;
      sw.addEventListener('click', e => e.stopPropagation());
      sw.addEventListener('change', () => { set(k, sw.checked ? undefined : false); this._render(); });
      det.querySelector('summary').appendChild(sw);
      if (on && schemas[k].length) {
        const cur = typeof P[k] === 'object' && P[k] ? P[k] : {};
        // the form shows plain IDs: pumps written as {entity, power, timer} and devices excluded by name are kept as they are
        const data = { ...cur };
        if (k === 'water' && cur.pumps) data.pumps = arr(cur.pumps).map(entityId).filter(Boolean);
        if (k === 'water' && cur.entities) data.entities = arr(cur.entities).map(entityId).filter(Boolean);
        if (k === 'security' && cur.entrances) data.entrances = arr(cur.entrances).map(entityId).filter(Boolean);
        if (k === 'devices') data.entities = arr(cur.entities).map(d => (typeof d === 'string' ? d : d?.battery)).filter(Boolean);
        if (k === 'people') { this._mPeople(det); list.appendChild(det); continue; }
        if (k === 'modes') { // modes live in the card's own `modes` list (not under panels): a name or icon given in YAML stays
          det.appendChild(this._form(schemas.modes, { modes: arr(this._config.modes).map(entityId).filter(Boolean) }, v => {
            const old = arr(this._config.modes), val = arr(v.modes).map(id => old.find(o => typeof o === 'object' && entityId(o) === id) || id);
            if (val.length) this._config.modes = val; else delete this._config.modes; this._emit();
          }, { modes: 'Mode buttons (switches, helpers, scenes, scripts)' }));
          if (!arr(this._config.modes).length) { // a head start: the on / off helpers the home already has
            const sugg = Object.keys(this._hass.states).filter(x => x.startsWith('input_boolean.')).slice(0, 6);
            if (sugg.length) { const b = document.createElement('div'); b.className = 'sh-hint'; b.innerHTML = `${t('Suggested')}: ${sugg.map(x => `<button class="sh-chip" data-msg="${esc(x)}">${esc(this._reg.name(x))}</button>`).join(' ')}`; b.querySelectorAll('[data-msg]').forEach(c => c.addEventListener('click', () => { this._config.modes = [...arr(this._config.modes), c.dataset.msg]; this._emit(); this._render(); })); det.appendChild(b); }
          }
          list.appendChild(det); continue;
        }
        if (k === 'irrigation' && (cur.zones || cur.valves)) { data.zones = arr(cur.zones ?? cur.valves).map(entityId).filter(Boolean); delete data.valves; }
        if (k === 'car' && cur.color) data.color = hex2rgb(cur.color);
        det.appendChild(this._form(schemas[k], data, v => {
          const next = { ...(typeof P[k] === 'object' && P[k] ? P[k] : {}) };
          for (const [kk, vv] of Object.entries(v)) {
            let val = vv;
            if (k === 'water' && (kk === 'pumps' || kk === 'entities')) val = arr(vv).map(id => arr(next[kk]).find(o => typeof o === 'object' && entityId(o) === id) || id);
            if (k === 'devices' && kk === 'entities') val = arr(vv).map(id => arr(next.entities).find(o => typeof o === 'object' && o.battery === id) || id); // a device's name / icon stay
            if (k === 'security' && kk === 'entrances') val = arr(vv).map(id => arr(next.entrances).find(o => typeof o === 'object' && entityId(o) === id) || id); // a gate's sensor and name stay
            if (k === 'irrigation' && kk === 'zones') { val = arr(vv).map(id => arr(next.zones ?? next.valves).find(o => typeof o === 'object' && entityId(o) === id) || id); delete next.valves; } // a zone's name and duration are kept
            if (k === 'car' && kk === 'color') val = rgb2hex(vv);
            if (k === 'attention' && /devices$/.test(kk)) val = [...arr(next[kk]).filter(x => !this._hass.devices?.[x] && !arr(vv).includes(x)), ...arr(vv)]; // names stay
            if (val === '' || val == null || (Array.isArray(val) && !val.length)) delete next[kk]; else next[kk] = val;
          }
          set(k, next);
        }, { exclude_devices: 'Hidden devices', exclude_entities: 'Hidden entities', battery_exclude_devices: 'Hidden from low batteries only', battery_threshold: 'Battery alert below', wifi_threshold: 'Weak Wi-Fi below', tunnels: 'Cloudflare tunnels',
          name: k === 'car' ? 'Name' : undefined, color: 'Colour', charging: 'Charging (on while it charges)', power: 'Charging power', battery: 'Battery level', range: 'Range',
          status: 'Status (parked, driving…)', time: k === 'car' ? 'Charging time / time left' : 'Watering time', zones: 'Valves (one per zone)', entrances: 'Gates, garage doors, barriers, shutters', locks: 'Locks', notification: 'Reminder notification', interval: 'Water every', weekday: 'Day of the week', tomorrow: 'Water tomorrow (switch)', next: 'Next watering', energy_per_charge: 'This charge: energy', cost_per_charge: 'This charge: cost', energy_month: 'This month: energy',
          cost_month: 'This month: cost', energy_year: 'This year: energy', cost_year: 'This year: cost',
          pumps: 'Pumps', entities: k === 'devices' ? 'Batteries to show (empty: every phone, tablet and watch with the Home Assistant app)' : 'Other entities (valves, flow, pressure…)', tank: 'Tank level', quality: 'Water quality', temperature: 'Water temperature' }));
        if (['security', 'media', 'irrigation', 'energy'].includes(k)) det.insertAdjacentHTML('beforeend', `<div class="sh-hint" style="margin-top:6px">${t('Leave every field empty and they are found on their own. Once you pick one, only what you pick shows.')}</div>`);
        if (k === 'security') this._entranceSensors(det, P);
      } else if (on) det.insertAdjacentHTML('beforeend', '<div class="sh-hint">Found automatically from the integrations.</div>');
      list.appendChild(det);
    }
  }

  /* ================================================================ */
  /* Look step                                                         */
  /* ================================================================ */
  _rLook(body) {
    const C = this._config, H = C.house = C.house || {};
    const data = { title: C.title || '', weather: C.weather || '', start_tab: C.start_tab || 'home', type: H.type === 'gltf' ? 'gltf' : 'floorplan', url: H.url || '', wall_height: H.wall_height ?? 1.35, auto_furniture: !!H.auto_furniture, hide_hint: C.hint === false };
    body.innerHTML = '';
    body.appendChild(this._form([
      { name: 'title', selector: { text: {} } },
      { name: 'weather', selector: { entity: { domain: 'weather' } } },
      { name: 'start_tab', selector: { select: { mode: 'dropdown', options: ['home', 'security', 'climate', 'energy', 'water', 'media', 'system'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) } } },
      { name: 'type', selector: { select: { mode: 'list', options: [{ value: 'floorplan', label: 'Drawn floor plan (rooms)' }, { value: 'gltf', label: '3D file (.glb) from /config/www' }] } } },
      ...(data.type === 'gltf' ? [{ name: 'url', selector: { text: {} } }] : [{ name: 'wall_height', selector: { number: { min: 0.4, max: 3, step: 0.05, unit_of_measurement: 'm', mode: 'slider' } } }, { name: 'auto_furniture', selector: { boolean: {} } }]),
      { name: 'hide_hint', selector: { boolean: {} } },
    ], data, (v, typing) => {
      for (const k of ['title', 'weather']) { if (v[k]) C[k] = v[k]; else delete C[k]; }
      if (v.start_tab && v.start_tab !== 'home') C.start_tab = v.start_tab; else delete C.start_tab;
      const was = H.type;
      if (v.type === 'gltf') { H.type = 'gltf'; if (v.url) H.url = v.url; else delete H.url; } else { delete H.type; delete H.url; }
      if (v.wall_height != null && v.wall_height !== 1.35) H.wall_height = v.wall_height; else delete H.wall_height;
      if (v.auto_furniture) H.auto_furniture = true; else delete H.auto_furniture;
      if (v.hide_hint) C.hint = false; else delete C.hint; // on = the tip is not shown
      if (!Object.keys(H).length) delete C.house;
      this._emit(typing);
      if (was !== H.type) this._render();
    }, { url: '3D file URL (e.g. /local/home.glb)', wall_height: 'Wall height', auto_furniture: 'Add furniture automatically to rooms without their own (bedrooms, kitchen, living room…)', hide_hint: 'Hide the “tap a room” tip' }, true));
    this._mNames(body);
  }
  // Names on this dashboard: every entity renamed here, in a room or on a panel. Home Assistant keeps its own names.
  _mNames(body) {
    const C = this._config, list = [];
    for (const [i, r] of this._rooms.entries()) for (const k of ['light_names', 'names']) for (const [id, v] of Object.entries(r[k] || {})) list.push([id, v, this._roomName(r, i)]);
    for (const [id, v] of Object.entries(C.names || {})) list.push([id, v, '']);
    if (this._newName && !list.some(x => x[0] === this._newName)) list.push([this._newName, '', '']);
    const box = document.createElement('div'); box.className = 'sh-ed'; box.style.marginTop = '18px';
    box.innerHTML = `<div style="font-weight:600;font-size:15px;margin-bottom:4px">${t('Names on this dashboard')}</div>
      <div class="sh-hint">${t('Renamed in a room popup, on a panel (pencil while editing) or here. They replace the entity name everywhere on this dashboard; Home Assistant keeps its own names. Clear a name to go back to the default.')}</div>
      ${list.map(([id, v, room]) => `<div class="sh-ent"><span class="nm">${esc(this._reg.name(id))}<small>${esc(id)}${room ? ' · ' + esc(room) : ''}</small></span><input data-nm="${esc(id)}" value="${esc(v)}" placeholder="${esc(this._reg.name(id))}" style="flex:1;min-width:140px;padding:6px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font:inherit"><button data-nmdel="${esc(id)}" class="del" title="${t('Default name')}"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join('') || `<div class="sh-hint">${t('No names yet.')}</div>`}`;
    body.appendChild(box);
    const add = this._form([{ name: 'entity', selector: { entity: {} } }], {}, v => { if (v.entity) { this._newName = v.entity; this._render(); } }, { entity: 'Rename another entity' });
    box.appendChild(add);
    const set = (id, v) => {
      const holder = [this._config, ...this._rooms].find(h => h.names?.[id] != null || h.light_names?.[id] != null) || this._config;
      this._dropName(id, null);
      if (v && v !== this._reg.name(id)) (holder.names ||= {})[id] = v;
      if (this._newName === id) this._newName = null;
      this._emit(); this._render();
    };
    box.querySelectorAll('[data-nm]').forEach(i => i.addEventListener('change', () => set(i.dataset.nm, i.value.trim())));
    box.querySelectorAll('[data-nmdel]').forEach(b => b.addEventListener('click', () => set(b.dataset.nmdel, '')));
  }
}
if (!customElements.get('sweet-home-card-editor')) customElements.define('sweet-home-card-editor', SweetHomeCardEditor);
export { footprint, sizePiece, turnPiece, movePiece };
