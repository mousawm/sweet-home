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
import { r2, ROUND, PALETTE, turnPiece } from './pieces.js';
import { movePiece, buildModel, registry, discoverRoom, roleOf, SINGLE_ROLES, autoFurnitureConfig, wallsFromRooms, FURN_TYPES, furnEntities, arr, floorLevels, areaLevel, roomOutline, polyRects, cleanConfig } from './model.js';

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
const WALL_TYPES = [['wall', 'Wall'], ['half', 'Half wall'], ['glass', 'Glass'], ['fence', 'Fence']];

const STEPS = [['rooms', 'Rooms', 'mdi:floor-plan'], ['panels', 'Panels', 'mdi:view-dashboard-outline'], ['look', 'Look', 'mdi:palette-outline']];
const PANELS = [
  ['security', 'Security', 'Alarm, locks, doors and cameras'],
  ['climate', 'Climate', 'Air conditioners, temperatures'],
  ['energy', 'Energy', 'Live power, history (from HA’s Energy settings)'],
  ['car', 'Electric car', 'Charging, battery, energy and cost (Energy tab)'],
  ['water', 'Water', 'Tank and pumps'],
  ['irrigation', 'Irrigation', 'Valves and schedule'],
  ['media', 'Media', 'TV, speakers, screen-time limits'],
  ['tv_light', 'TV light', 'The TV backlight and its mode / effect selectors (Media tab)'],
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
const COLOR_KEY = { table: 'top', bed: 'duvet', lamp: 'shade', fan: 'blade', blinds: 'shade' };
// pieces made of several parts: a colour for each of the other parts too, with the colour the 3D view uses by default
const PART_COLORS = {
  sofa: [['cushion', 'Seat cushions', '#64748b'], ['pillow', 'Pillows', '#e2e8f0']],
  bed: [['frame', 'Frame', '#7c5a3c'], ['headboard', 'Headboard', '#e8dcc8'], ['pillow', 'Pillows', '#ffffff']],
  table: [['leg', 'Legs', '#b7a684']], sink: [['top', 'Countertop', '#f8fafc']], nightstand: [['top', 'Top', '#7c5a3c'], ['handle', 'Handles', '#d4b483']], chair: [['seat', 'Seat', '#334155']],
};
const DIR_OPTS = [['n', 'North (up)'], ['e', 'East (right)'], ['s', 'South (down)'], ['w', 'West (left)']];
// option lists are translated when a form is drawn
const trOpts = schema => schema.map(x => (x.schema ? { ...x, schema: trOpts(x.schema) } : x.selector?.select ? { ...x, selector: { select: { ...x.selector.select, options: x.selector.select.options.map(o => ({ ...o, label: t(o.label) })) } } } : x));
const num = (o, step = 0.05, min = 0, max = 10, unit = 'm') => ({ number: { min, max, step, mode: 'box', unit_of_measurement: unit } });
const sel = opts => ({ select: { mode: 'dropdown', options: opts.map(([value, label]) => ({ value, label })) } });
const PIECE_FIELDS = {
  toilet: [['facing', sel(DIR_OPTS)]], sink: [['w', num()], ['d', num()], ['h', num()], ['facing', sel(DIR_OPTS)]], shower: [['w', num()], ['d', num()], ['facing', sel(DIR_OPTS)]],
  bathtub: [['w', num()], ['d', num()], ['facing', sel(DIR_OPTS)]], washer: [['w', num()], ['d', num()], ['h', num()], ['facing', sel(DIR_OPTS)]], towel: [['w', num()], ['y', num()], ['facing', sel(DIR_OPTS)]],
  ac: [['style', sel([['wall', 'Wall split'], ['cassette', 'Ceiling cassette'], ['floor', 'Floor standing']])], ['facing', sel(DIR_OPTS)]],
  box: [['w', num()], ['d', num()], ['h', num()], ['y', num()]], nightstand: [['w', num()], ['d', num()], ['h', num()], ['facing', sel(DIR_OPTS)], ['drawers', num(0, 1, 1, 4, '')], ['lamp', { boolean: {} }], ['plug', { entity: { filter: { domain: ['switch', 'input_boolean'] } } }], ['power', { entity: { filter: { domain: 'sensor' } } }]], charger: [['y', num()], ['plug', { entity: { filter: { domain: ['switch', 'input_boolean'] } } }], ['power', { entity: { filter: { domain: 'sensor' } } }], ['charging_w', num(0, 0.5, 0, 50, 'W')]], block: [['h', num()], ['y', num()]], rug: [['w', num()], ['d', num()]],
  table: [['w', num()], ['d', num()], ['h', num()]], chair: [['face', sel(DIR_OPTS)]],
  sofa: [['back', sel(DIR_OPTS)], ['arms', sel([['both', 'Both'], ['start', 'Start'], ['end', 'End'], ['none', 'None']])]],
  bed: [['width', num()], ['length', num()], ['head', sel(DIR_OPTS)]], plant: [['size', num(0, 0.1, 0.2, 3, '×')]],
  tv: [['w', num()], ['h', num()], ['y', num()], ['facing', sel(DIR_OPTS)]], lamp: [['h', num()], ['size', num(0, 0.1, 0.3, 3, '×')]],
  fan: [['radius', num()], ['y', num()]], marker: [['y', num()]], blinds: [['y', num()], ['h', num()]],
  car: [['facing', sel(DIR_OPTS)], ['length', num()], ['width', num()]], vacuum: [['facing', sel(DIR_OPTS)]], tree: [['size', num(0, 0.1, 0.3, 4, '×')]], hedge: [['h', num()]], sprinkler: [['radius', num()]], cylinder: [['radius', num()], ['h', num()], ['y', num()]], ball: [['radius', num()], ['y', num()]],
  stairs: [['axis', sel([['x', 'Along x'], ['z', 'Along z']])], ['mode', sel([['up', 'Up'], ['down', 'Down'], ['split', 'Split']])], ['steps', num(0, 1, 2, 30, '')]],
};
const ENTITY_FILTER = { ac: { domain: 'climate' }, sink: { domain: ['light', 'switch'] }, towel: { domain: ['switch', 'climate', 'input_boolean'] },
  washer: { domain: ['switch', 'sensor', 'binary_sensor', 'input_boolean'] }, shower: { domain: ['switch', 'sensor', 'binary_sensor', 'water_heater', 'input_boolean'] }, lamp: { domain: 'light' }, nightstand: { domain: ['light', 'switch', 'sensor', 'binary_sensor', 'media_player'] }, fan: { domain: 'fan' }, tv: { domain: 'media_player' }, blinds: { domain: 'cover' }, vacuum: { domain: 'vacuum' },
  car: { domain: ['binary_sensor', 'device_tracker', 'person', 'sensor', 'input_boolean'] }, sprinkler: { domain: ['valve', 'switch', 'input_boolean'] } };
const ENT_LABEL = { sink: 'Mirror light (the mirror glows while it is on)', washer: 'Plug, power sensor or status (the drum turns while it runs)',
  shower: 'Water heater, switch or humidity sensor (steam while it is on, or above 70 %)', towel: 'Switch (the rails glow warm while it is on)' };
const PIECE_LABELS = { plug: 'Phone charger plug (the phone shows while it charges)', power: 'Charger power sensor (found from the plug when empty)', charging_w: 'Charging above', drawers: 'Drawers', lamp: 'Table lamp on top', trunk: 'Trunk colour', d: 'Depth', h: 'Height', y: 'Height above the floor', width: 'Width', length: 'Length', head: 'Head of the bed', back: 'Back side', arms: 'Arms', face: 'Faces', facing: 'Front faces', size: 'Size', radius: 'Radius', axis: 'Direction', mode: 'Mode', steps: 'Steps' };

const clone = o => JSON.parse(JSON.stringify(o || {}));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return undefined; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb2hex = a => (Array.isArray(a) ? '#' + a.map(x => Math.round(x).toString(16).padStart(2, '0')).join('') : undefined);
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } } };
const entityId = e => (typeof e === 'string' ? e : e?.entity || e?.id);


// the editor's stylesheet (also the inspector's, in Build mode)
const EDITOR_CSS = `
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
      .sh-int{display:flex;flex-direction:column;gap:2px;margin:0 0 10px;padding:6px 10px;border-radius:10px;background:rgba(127,127,127,.08)}
      .sh-int>small{font-size:12px;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.04em;padding:4px 0}
      .sh-intr{display:flex;align-items:center;gap:10px;min-height:40px}.sh-intr ha-icon{--mdc-icon-size:20px;color:#22c55e}.sh-intr.no ha-icon{color:var(--disabled-text-color,#9ca3af)}
      .sh-intr>span{flex:1;display:flex;flex-direction:column;font-size:14px}.sh-intr>span small{font-size:12px;color:var(--secondary-text-color)}.sh-intr.no>span b{color:var(--secondary-text-color);font-weight:500}
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
`;

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
  set hass(h) { const first = !this._hass; this._hass = h; setLang(this._config?.language || h?.locale?.language || h?.language); this._R = null; if (this._b3dEl?._config) this._b3dEl.hass = h; if (first) this._render(); else this.querySelectorAll('ha-form').forEach(f => { f.hass = h; }); }
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
    const mod = e.ctrlKey || e.metaKey; if (!mod) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); this._undo(e.shiftKey); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); this._undo(true); }
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
    this.innerHTML = `<style>${EDITOR_CSS}    </style>
    <div class="sh-ed" dir="${isRTL() ? 'rtl' : 'ltr'}">
      <div class="sh-steps">${STEPS.filter(([k]) => !(this.solo && k === 'panels')).map(([k, n, i]) => `<button data-step="${k}" class="${this._step === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${t(n)}</button>`).join('')}</div>
      <div class="sh-body"></div>
    </div>`;
    this.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { this._step = b.dataset.step; this._render(); }));
    const body = this.querySelector('.sh-body');
    if (this.solo && this._step === 'panels') this._step = 'rooms'; // Sweet Home 3D has no panels
    ({ rooms: () => this._rRooms(body), panels: () => this._rPanels(body), look: () => this._rLook(body) })[this._step]();
  }

  /* ================================================================ */
  /* Rooms step                                                        */
  /* ================================================================ */
  // The Rooms step: your home built right in 3D (Build mode, like a life-sim game) in a Sweet Home 3D view inside
  // the editor. Its changes come back here (applyExternal), with undo / redo; what it can't show (problems) stays above.
  _rRooms(body) {
    body.innerHTML = `<div class="sh-ed">
      <div class="sh-hint">${t('Build your home right here in 3D: draw rooms and walls, put in doors and windows, paint, furnish. Tap Select, then anything, for all its settings (a room\u2019s area and devices too).')}</div>
      <div class="sh-warn-slot"></div>
      <div class="sh-row"><button data-undo title="${t('Undo')} (Ctrl+Z)"><ha-icon icon="mdi:undo"></ha-icon>${t('Undo')}</button><button data-redo title="${t('Redo')} (Ctrl+Shift+Z)"><ha-icon icon="mdi:redo"></ha-icon>${t('Redo')}</button><span style="flex:1"></span>
        ${this._freeAreas().length ? `<button data-import>${this._rooms.length ? t('+ Add my other areas ({0})', this._freeAreas().length) : t('Add all my areas')}</button>` : ''}</div>
      <div class="sh-b3d"></div>
    </div>`;
    this._warnings(body.querySelector('.sh-warn-slot'));
    body.querySelector('[data-undo]').addEventListener('click', () => this._undo());
    body.querySelector('[data-redo]').addEventListener('click', () => this._undo(true));
    this._syncUndo();
    body.querySelector('[data-import]')?.addEventListener('click', () => this._importAreas());
    const c = this._b3d(); if (c) body.querySelector('.sh-b3d').appendChild(c);
    else body.querySelector('.sh-b3d').innerHTML = `<div class="sh-hint">${t('The 3D builder could not start here. Edit the house on the dashboard instead: the hammer button on the 3D view, while the dashboard is in edit mode.')}</div>`;
  }
  // the 3D builder: one Sweet Home 3D view, kept while the editor redraws, always in Build mode
  _b3d() {
    let c = this._b3dEl;
    if (!c) {
      const C = customElements.get('sweet-home-3d-card'); if (!C) return null;
      c = this._b3dEl = new C(); c._embed = true; c.setAttribute('embed', ''); c.style.display = 'block';
    }
    c.setConfig(this._config); // its settings first: the card reads them when it gets hass
    if (this._hass) c.hass = this._hass;
    return c;
  }

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

  /* ---------------- warnings ---------------- */
  _problems() {
    const R = this._reg, rooms = this._rooms, H = this._H, out = [];
    const has = id => !!this._hass.states[id];
    const areaRoom = {}; rooms.forEach((r, i) => { if (r.area) areaRoom[r.area] = i; });
    rooms.forEach((r, i) => {
      const nm = this._roomName(r, i);
      if (!hasShape(r)) out.push([i, `${nm} has no shape yet: give it one (Select it, pick a shape), or it won't show.`]);
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
    det.querySelectorAll('[data-w]').forEach(li => li.addEventListener('click', () => { if (li.dataset.w !== '') this._b3dEl?._bShowRoom?.(+li.dataset.w); }));
    slot.appendChild(det);
  }

  /* ---------------- a room: settings and shape (Build mode's inspector) ---------------- */
  // a room's settings: area, name, icon, floor covering, outdoor, stairs, which floor it is on
  _roomForm(r) {
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
    return formEl;
  }
  // a room's shape tools: ready-made shapes, its rectangles or corners, turn / rotate / mirror, duplicate, delete
  _shapeTools(box, r) {
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
  /* separate walls: a partition, a kitchen half wall, a glass screen, a curved garden wall */
  // a separate wall's settings: kind, height, bend, length, delete
  _wallHtml(o) {
    return `<div class="sh-ent"><span class="nm">${t('Kind')}</span><select data-wt>${WALL_TYPES.map(([v, l]) => `<option value="${v}" ${(o.type || 'wall') === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></div>
      <div class="sh-ent"><span class="nm">${t('Height (m, empty: automatic)')}</span><input data-wh type="number" min="0.2" max="3" step="0.05" value="${o.height ?? ''}"></div>
      <div class="sh-ent"><span class="nm">${t('Bend (m, + one side, − the other)')}</span><input data-wb type="number" min="-5" max="5" step="0.1" value="${o.bow ?? ''}"></div>
      <div class="sh-row"><span class="sh-hint">${t('Length')}: ${r2(Math.hypot(o.to[0] - o.from[0], o.to[1] - o.from[1]))} m</span><span style="flex:1"></span><button data-wdel class="del"><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete wall')}</button></div>`;
  }
  _wallWire(d, o) {
    const H = this._H;
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

  /* ---------------- a room's devices ---------------- */
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
  // Water → each pump: what it shows while running (power, running time or both), how many taps turn it on, and its
  // power sensor (found on the pump's device when empty). Kept on the pump's entry in `pumps` ({entity, show, presses, power}).
  // "Found from": the integrations a panel reads, whether Home Assistant has them, and a switch to hide that part of
  // the card (stored only when off, e.g. panels.media_server.sonarr: false)
  _integrations(det, k, cur, set) {
    const ents = this._hass.entities || {}, states = this._hass.states;
    const of = p => Object.keys(ents).filter(id => ents[id].platform === p && states[id]);
    // "14 entities", or with several servers of the same integration (one config entry each) "2 servers · 14 entities"
    const n = p => { const ids = of(p), c = ids.length, k = new Set(ids.map(id => ents[id].config_entry_id || '-')).size;
      return c ? `${k > 1 ? `${k} ${t('servers')} · ` : ''}${c} ${c === 1 ? t('entity') : t('entities')}` : ''; };
    const nodes = [...new Set(Object.keys(states).map(id => id.match(/^sensor\.node_(.+)_cpu_used$/)).filter(Boolean).map(m => m[1]))], pve = nodes[0];
    const hybrid = ['hybrid', 'jellyha'].includes(cur.integration) || (!cur.integration && !of('jellyfin').length && of('jellyha').length);
    // [key stored in the panel's config (null: no switch), name, what it shows, found, detail, hint when not found]
    const rows = {
      energy: [['solar_forecast', 'Forecast.Solar', 'Solar Forecast box', of('forecast_solar').length > 0, n('forecast_solar'), 'Add the Forecast.Solar integration for a solar forecast']],
      media_server: [
        ['jellyfin', 'Jellyfin', 'Now Watching, playing on the TV', of('jellyfin').length > 0, n('jellyfin'), 'Add the Jellyfin integration'],
        [null, 'JellyHA', hybrid ? 'Now Watching, clients and library (Jellyfin + JellyHA)' : 'Used with “Jellyfin + JellyHA”', of('jellyha').length > 0, n('jellyha'), 'Optional (HACS)'],
        ['sonarr', 'Sonarr', 'Shows, Wanted, Coming Up, storage', of('sonarr').length > 0, n('sonarr'), 'Add the Sonarr integration'],
        ['radarr', 'Radarr', 'Movies, Coming Up', of('radarr').length > 0, n('radarr'), 'Add the Radarr integration'],
        ['qbittorrent', 'qBittorrent', 'Downloads', of('qbittorrent').length > 0, n('qbittorrent'), 'Add the qBittorrent integration'],
      ],
      homelab: [[null, 'Proxmox VE', 'Server, containers and VMs', !!pve, pve ? `${nodes.length > 1 ? t('nodes') : t('node')} ${nodes.join(', ')}` : '', 'Add the Proxmox VE integration (HACS)']],
    }[k];
    if (!rows) return;
    const box = document.createElement('div'); box.className = 'sh-int';
    box.innerHTML = `<small>${t('Found from')}</small>`;
    for (const [key, name, what, found, detail, hint] of rows) {
      const r = document.createElement('div'); r.className = `sh-intr ${found ? 'ok' : 'no'}`; if (key) r.dataset.int = key;
      r.innerHTML = `<ha-icon icon="${found ? 'mdi:check-circle' : 'mdi:minus-circle-outline'}"></ha-icon><span><b>${esc(name)}</b><small>${esc(t(what))}${found ? (detail ? ` · ${esc(detail)}` : '') : ` · ${esc(t('Not found'))}: ${esc(t(hint))}`}</small></span>`;
      if (key && found) {
        const sw = document.createElement('ha-switch'); sw.checked = cur[key] !== false;
        sw.addEventListener('change', () => {
          const next = { ...(typeof this._config.panels?.[k] === 'object' && this._config.panels[k] ? this._config.panels[k] : {}) };
          if (sw.checked) delete next[key]; else next[key] = false;
          set(k, Object.keys(next).length ? next : undefined);
        });
        r.appendChild(sw);
      }
      box.appendChild(r);
    }
    det.appendChild(box);
  }

  _pumpOptions(det, P) {
    const W = typeof P.water === 'object' && P.water ? P.water : null, list = arr(W?.pumps);
    if (!list.length) return;
    const box = document.createElement('div'); box.className = 'sh-ed'; box.style.marginTop = '10px';
    box.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${t('Pumps')}</div>`;
    det.appendChild(box);
    list.forEach((e, i) => {
      const id = entityId(e); if (!id) return;
      const o = typeof e === 'object' ? e : { entity: id };
      const row = document.createElement('div'); row.className = 'sh-ent'; row.style.display = 'block';
      row.innerHTML = `<span class="nm">${esc(this._reg.name(id))}<small>${esc(id)}</small></span>`;
      row.appendChild(this._form([
        { name: 'show', selector: sel([['power', 'Power'], ['time', 'Running time'], ['both', 'Running time and power']]) },
        { name: 'presses', selector: sel([['2', 'Two presses (tap again to confirm)'], ['1', 'One press']]) },
        { name: 'power', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
      ], { show: o.show || 'power', presses: String(o.presses ?? (o.confirm === false ? 1 : 2)), power: o.power || '' }, v => {
        const obj = { ...o, entity: id }; delete obj.confirm;
        if (v.show && v.show !== 'power') obj.show = v.show; else delete obj.show;
        if (String(v.presses) === '1') obj.presses = 1; else delete obj.presses;
        if (v.power) obj.power = v.power; else delete obj.power;
        W.pumps[i] = Object.keys(obj).length === 1 ? id : obj; this._emit();
      }, { show: 'While it runs, show', presses: 'To turn it on', power: 'Power sensor (found on the pump’s device when empty)' }));
      box.appendChild(row);
    });
  }
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

  /* ---------------- a room's furniture, a piece ---------------- */
  // a room with automatic furniture gets its own list the first time it is edited (the automatic set, as pieces)
  _ownFurniture(i) {
    const r = this._rooms[i];
    if (!Array.isArray(r.furniture)) r.furniture = this._H.auto_furniture && r.furniture !== false ? autoFurnitureConfig(r, this._roomName(r, i)) : [];
    return r.furniture;
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
      ...(ents.length || ty === 'ac' ? [{ name: 'badge', selector: { boolean: {} } }] : []), // an AC is linked to its room's climate entity even when none is picked
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
      if (v.badge === false && (ids.length || ty === 'ac')) f.badge = false; else delete f.badge;
      const relink = (ids.length > 0) !== (ents.length > 0);
      this._emit(typing);
      if (relink) this._render();
    }, { ...PIECE_LABELS, entities: ty === 'car' ? 'Car sensor (shows the car while it is parked)' : ty === 'sprinkler' ? 'Valve or switch (sprays water while it is on)' : 'Linked entities (tap the piece in 3D to control them)', badge: 'Show a badge over it in 3D', ...(ty === 'nightstand' ? { facing: 'Drawers face', entities: 'Linked entities (a light makes its lamp glow)' } : {}), ...(ty === 'tv' ? { facing: 'Screen faces' } : {}), ...(ENT_LABEL[ty] ? { entities: ENT_LABEL[ty] } : {}), ...(ty === 'ac' ? { facing: 'Blows towards', style: 'Type', entities: 'Climate entity (empty: the room\'s own)' } : {}), ...(ty === 'charger' ? { entities: 'Linked entities (tap the phone in 3D to control them)' } : {}), ...(f.plug && !f.power ? { power: this._reg.powerOf(f.plug) ? t('Charger power sensor (empty: uses {0})', this._reg.name(this._reg.powerOf(f.plug))) : 'Charger power sensor (none found: the phone shows while the plug is on)' } : {}), color: ty === 'sofa' ? 'Colour (frame and back)' : 'Colour', ...Object.fromEntries(parts.map(([k, l]) => ['c_' + k, l])) }, true));
  }

  /* ---------------- a door, window, passage, lock badge, separate wall ---------------- */
  // the selected door, gate, window, open passage or lock badge (`_dsel`): its settings
  _doorItem(slot) {
    const H = this._H, it = this._dsel; if (!it) return;
    const head = document.createElement('div'); head.className = 'sh-row';
    head.innerHTML = `<b style="flex:1">${t(it.k === 'door' && H.doors[it.i]?.gate ? 'Gate' : { door: 'Door', window: 'Window', opening: 'Open passage', badge: 'Lock badge' }[it.k])}</b><button class="del" data-deld><ha-icon icon="mdi:delete-outline"></ha-icon>${t('Delete')}</button>`;
    slot.appendChild(head);
    head.querySelector('[data-deld]').addEventListener('click', () => { this._delDoorItem(); this._emit(); this._render(); });
    if (it.k !== 'badge') slot.appendChild(this._widthRow(it));
    if (it.k === 'door') {
      const d = H.doors[it.i];
      slot.appendChild(this._form([
        { name: 'entity', selector: { entity: { domain: d.gate ? ['binary_sensor', 'cover'] : 'binary_sensor' } } },
        ...(d.gate ? [{ name: 'height', selector: { number: { min: 0.5, max: 3, step: 0.05, mode: 'box', unit_of_measurement: 'm' } } }] : []),
        { name: 'side', selector: sel([['1', 'Swings one way'], ['-1', 'Swings the other way']].map(([v, n]) => [v, t(n)])) },
        { name: 'main', selector: { boolean: {} } },
      ], { entity: d.entity || '', side: String(d.side ?? 1), main: !!d.main, ...(d.gate ? { height: d.height ?? 1.25 } : {}) }, v => {
        if (v.entity) d.entity = v.entity; else delete d.entity;
        if (d.gate) { if (v.height != null && v.height !== '' && Number(v.height) !== 1.25) d.height = Number(v.height); else delete d.height; } if (v.side === '-1') d.side = -1; else delete d.side; if (v.main) d.main = true; else delete d.main;
        this._emit();
      }, d.gate ? { entity: 'Sensor or cover (optional: the gate opens in 3D while it is open)', height: 'Gate height', main: 'Main entrance' } : { entity: 'Contact sensor (optional: the door opens in 3D while it is open)', main: 'Main entrance' }));
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
  // the width of a door, gate, window or open passage, typed in metres: a door / gate keeps its hinge (from) and moves
  // its other end; a window or passage keeps its middle
  _widthRow(it) {
    const H = this._H, key = { door: 'doors', window: 'windows', opening: 'openings' }[it.k], o = arr(H[key])[it.i];
    const seg = it.k === 'door' ? (o?.from && o?.to ? [...o.from, ...o.to] : null) : o;
    const row = document.createElement('div'); row.className = 'sh-ent';
    if (!seg) return row;
    const L = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    row.innerHTML = `<span class="nm">${t('Width (m)')}</span><input data-dw type="number" min="0.3" max="12" step="0.05" value="${r2(L)}">`;
    row.querySelector('[data-dw]').addEventListener('change', e => {
      const W = Number(e.target.value); if (!(W >= 0.3 && W <= 12) || !L) { e.target.value = r2(L); return; }
      const ux = (seg[2] - seg[0]) / L, uz = (seg[3] - seg[1]) / L;
      if (it.k === 'door') o.to = [r2(o.from[0] + ux * W), r2(o.from[1] + uz * W)];
      else { const mx = (seg[0] + seg[2]) / 2, mz = (seg[1] + seg[3]) / 2; o[0] = r2(mx - ux * W / 2); o[1] = r2(mz - uz * W / 2); o[2] = r2(mx + ux * W / 2); o[3] = r2(mz + uz * W / 2); }
      this._emit(); this._render();
    });
    return row;
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
      security: [{ name: 'alarm', selector: { entity: { domain: 'alarm_control_panel' } } }, { name: 'locks', selector: { entity: { domain: 'lock', multiple: true } } }, { name: 'entrances', selector: { entity: { domain: ['cover', 'switch', 'button', 'input_button', 'input_boolean', 'script'], multiple: true } } }, { name: 'doors', selector: { entity: { domain: 'binary_sensor', device_class: ['door', 'garage_door'], multiple: true } } }, { name: 'doors_view', selector: { select: { mode: 'dropdown', options: [['both', 'Timeline, Show details opens more'], ['timeline', 'Timeline only (last 24 h)'], ['list', 'List only (last opened)']].map(([value, label]) => ({ value, label: t(label) })) } } }, { name: 'doors_timeline', selector: { select: { mode: 'dropdown', options: [['fill', 'Fill each row'], ['aligned', 'Aligned, with hour labels']].map(([value, label]) => ({ value, label: t(label) })) } } },
        { name: 'doors_hours', selector: { select: { mode: 'dropdown', options: [6, 12, 18, 24].map(h => ({ value: String(h), label: t('Last {0} hours', h) })) } } }, { name: 'cameras', selector: { entity: { domain: 'camera', multiple: true } } }, { name: 'face', selector: { entity: { domain: ['sensor', 'input_text', 'text'] } } }],
      climate: [{ name: 'entities', selector: { entity: { domain: 'climate', multiple: true } } }],
      energy: [{ name: 'grid_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'solar_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'current', label: 'Current (shown next to Home)', selector: { entity: { domain: 'sensor', device_class: 'current' } } },
        { name: 'stored_sensor', selector: { entity: { domain: 'sensor' } } },
        { name: 'energy_dashboard_totals', selector: { boolean: {} } }, { name: 'month_sensor', selector: { entity: { domain: 'sensor' } } }, { name: 'year_sensor', selector: { entity: { domain: 'sensor' } } }],
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
      media: [{ name: 'player', selector: { entity: { domain: 'media_player' } } }, { name: 'speakers', selector: { entity: { domain: 'media_player', multiple: true } } },
        // screen-time limits: watched today and the daily limit as H:MM:SS, the limit picker, Block / Force Unblock
        { name: 'watch_timer', selector: { entity: { domain: ['sensor', 'input_text', 'input_datetime'] } } }, { name: 'watch_limit', selector: { entity: { domain: ['sensor', 'input_text', 'input_datetime'] } } },
        { name: 'limit_select', selector: { entity: { domain: ['select', 'input_select'] } } },
        { name: 'block_switch', selector: { entity: { domain: ['switch', 'input_boolean'] } } }, { name: 'unblock_switch', selector: { entity: { domain: ['switch', 'input_boolean'] } } }],
      tv_light: [{ name: 'light', selector: { entity: { domain: 'light' } } }, { name: 'selects', selector: { entity: { domain: ['select', 'input_select'], multiple: true } } }],
      media_server: [{ name: 'jellyfin_tv' }], // its own form below
      // Home Lab: each sensor is found from the Proxmox node's name when left empty; the servers (containers / VMs) list
      // gets its options below
      homelab: [...[['cpu'], ['memory'], ['disk'], ['swap'], ['temperature', 'temperature'], ['containers'], ['vms'], ['updates']]
        .map(([name, dc]) => ({ name, selector: { entity: { domain: 'sensor', ...(dc ? { device_class: dc } : {}) } } })),
        { name: 'auto_guests', selector: { boolean: {} } }, { name: 'pinned', selector: { select: { multiple: true, mode: 'list', options: [] } } }],
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
        if (k === 'tv_light' && cur.selects) data.selects = arr(cur.selects).map(entityId).filter(Boolean);
        if (k === 'devices') data.entities = arr(cur.entities).map(d => (typeof d === 'string' ? d : d?.battery)).filter(Boolean);
        this._integrations(det, k, cur, set);
        if (k === 'people') { this._mPeople(det); list.appendChild(det); continue; }
        // Energy: Month / Year from Home Assistant's Energy data (on by default) hide the Month / Year sensor fields
        const enStats = k === 'energy' && cur.energy_dashboard_totals !== false;
        if (k === 'energy') { data.energy_dashboard_totals = enStats; det.open = !!this._enOpen; det.addEventListener('toggle', () => { this._enOpen = det.open; }); }
        // Home Lab: every container / VM listed automatically (on by default); off: only the ones picked under Servers
        const hlAuto = k === 'homelab' && cur.auto_guests !== false;
        if (k === 'homelab') {
          data.auto_guests = hlAuto; data.pinned = arr(cur.pinned).map(g => (typeof g === 'string' ? g : g?.key)).filter(Boolean);
          det.open = !!this._hlOpen; det.addEventListener('toggle', () => { this._hlOpen = det.open; });
        }
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
        if (k === 'media_server') { // the TV that Jellyfin plays on: found by name (its entity id changes with each app session)
          det.open = !!this._msOpen; det.addEventListener('toggle', () => { this._msOpen = det.open; }); // stays open when the integration changes
          const tv = typeof cur.jellyfin_tv === 'object' && cur.jellyfin_tv ? cur.jellyfin_tv : {};
          // Jellyfin (the official integration) or Jellyfin + JellyHA (playing on the TV through the official integration,
          // the rest of the card from JellyHA); not set: the official one when installed, else Jellyfin + JellyHA
          const hasP = p => Object.keys(this._hass.states).some(x => this._reg.platform(x) === p);
          const integ = ['hybrid', 'jellyha'].includes(cur.integration) ? 'hybrid' : cur.integration === 'jellyfin' ? 'jellyfin'
            : hasP('jellyfin') || !hasP('jellyha') ? 'jellyfin' : 'hybrid';
          det.appendChild(this._form([{ name: 'integration', selector: sel([['jellyfin', 'Jellyfin'], ['hybrid', 'Jellyfin + JellyHA']].map(([v, n]) => [v, t(n)])) }],
            { integration: integ }, v => {
              const ms = { ...cur }; if (['jellyfin', 'hybrid'].includes(v.integration)) ms.integration = v.integration; else delete ms.integration;
              set(k, Object.keys(ms).length ? ms : undefined); this._render();
            }, { integration: 'Jellyfin integration (Jellyfin + JellyHA: playing on the TV through Jellyfin, the rest from JellyHA)' }));
          // the "N clients" count next to Now Watching; empty: Jellyfin's active clients, or JellyHA's active sessions
          det.appendChild(this._form([{ name: 'clients_sensor', selector: { entity: { domain: 'sensor' } } }], { clients_sensor: cur.clients_sensor || '' }, v => {
            const ms = { ...cur }; if (v.clients_sensor) ms.clients_sensor = v.clients_sensor; else delete ms.clients_sensor;
            set(k, Object.keys(ms).length ? ms : undefined);
          }, { clients_sensor: integ === 'hybrid' ? 'Clients count (empty: JellyHA’s active sessions)' : 'Clients count (empty: Jellyfin’s active clients)' }));
          // the TV's Jellyfin app: always an official Jellyfin player (playing goes through the official integration)
          const players = Object.keys(this._hass.states).filter(x => x.startsWith('media_player.') && this._reg.platform(x) === 'jellyfin');
          const pick = players.find(x => tv.session && new RegExp(tv.session.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(this._reg.name(x)));
          det.appendChild(this._form([
            { name: 'tv_player', selector: { entity: { domain: 'media_player', integration: 'jellyfin' } } }, { name: 'tv_name', selector: { text: {} } },
            { name: 'app_player', selector: { entity: { domain: 'media_player' } } }, { name: 'quick_connect', selector: { boolean: {} } },
          ], { tv_player: pick || '', tv_name: tv.name || '', app_player: tv.app_player || '', quick_connect: !!tv.quick_connect }, (v, typing) => {
            const o = { ...tv }; delete o.session; delete o.name; delete o.app_player; delete o.quick_connect; delete o.on_tap; if (v.quick_connect) o.quick_connect = true;
            // the player's name without the session number HA adds ("Living Room TV 3" → "Living Room TV")
            if (v.tv_player) o.session = this._reg.name(v.tv_player).replace(/\s*\d+$/, '').trim() || this._reg.name(v.tv_player);
            if (v.tv_name) o.name = v.tv_name; if (v.app_player) o.app_player = v.app_player;
            const ms = { ...cur }; if (Object.keys(o).length) ms.jellyfin_tv = o; else delete ms.jellyfin_tv;
            set(k, Object.keys(ms).length ? ms : undefined);
          }, { tv_player: 'Jellyfin app on the TV (optional: only needed when several TVs run Jellyfin)', tv_name: 'Name of the TV (shown as “play on …”)', app_player: 'TV to open Jellyfin on (optional: found by itself from the TVs that list Jellyfin as a source)', quick_connect: 'The TV signs in to Jellyfin with Quick Connect (ask me to sign in before playing)' }));
          list.appendChild(det); continue;
        }
        if (k === 'irrigation' && (cur.zones || cur.valves)) { data.zones = arr(cur.zones ?? cur.valves).map(entityId).filter(Boolean); delete data.valves; }
        if (k === 'car' && cur.color) data.color = hex2rgb(cur.color);
        let schema = enStats ? schemas[k].filter(f => !['month_sensor', 'year_sensor'].includes(f.name)) : schemas[k];
        if (k === 'security' && cur.doors_view === 'list') schema = schema.filter(f => !['doors_timeline', 'doors_hours'].includes(f.name)); // the bars' layout and span are for the timeline
        if (k === 'security') data.doors_hours = String(cur.doors_hours || 24); // shown as the default (24 h) when not set
        if (k === 'homelab') { // the Proxmox guests Home Assistant has (sensor / binary_sensor <lxc|qemu>_…_status), by name
          const keys = [...new Set(Object.keys(this._hass.states).map(id => id.match(/^(?:binary_)?sensor\.((?:lxc|qemu)_.+)_status$/)?.[1]).filter(Boolean))];
          const nm = g => (this._reg.name(`sensor.${g}_status`) || this._reg.name(`binary_sensor.${g}_status`) || g).replace(/\s*status$/i, '');
          const options = [...new Set([...keys, ...data.pinned])].map(g => ({ value: g, label: nm(g) })).sort((a, b) => a.label.localeCompare(b.label));
          schema = schema.map(f => (f.name === 'pinned' ? { ...f, selector: { select: { multiple: true, mode: 'list', options } } } : f));
        }
        det.appendChild(this._form(schema, data, v => {
          const next = { ...(typeof P[k] === 'object' && P[k] ? P[k] : {}) };
          for (const [kk, vv] of Object.entries(v)) {
            let val = vv;
            if (k === 'homelab' && kk === 'auto_guests') { // on is the default: stored only when off; the Servers label changes with it
              const was = next[kk] !== false; if (vv === false) next[kk] = false; else delete next[kk];
              if (was !== (vv !== false)) { set(k, next); this._render(); return; }
              continue;
            }
            if (k === 'homelab' && kk === 'pinned') // a guest written with its own name / icon keeps them
              val = (Array.isArray(vv) ? vv : String(vv || '').split(',').map(x => x.trim()).filter(Boolean)).map(g => arr(next.pinned).find(o => typeof o === 'object' && o?.key === g) || g);
            if (k === 'security' && kk === 'doors_view' && (vv === 'list') !== (next.doors_view === 'list')) { // the Timeline bars field comes and goes with it
              if (vv) next[kk] = vv; else delete next[kk]; set(k, next); this._render(); return;
            }
            if (k === 'energy' && kk === 'energy_dashboard_totals') { // on is the default: stored only when off; the form changes with it
              const was = next[kk] !== false; if (vv === false) next[kk] = false; else delete next[kk];
              if (was !== (vv !== false)) { set(k, next); this._render(); return; }
              continue;
            }
            if (k === 'water' && (kk === 'pumps' || kk === 'entities')) val = arr(vv).map(id => arr(next[kk]).find(o => typeof o === 'object' && entityId(o) === id) || id);
            if (k === 'devices' && kk === 'entities') val = arr(vv).map(id => arr(next.entities).find(o => typeof o === 'object' && o.battery === id) || id); // a device's name / icon stay
            if (k === 'tv_light' && kk === 'selects') val = arr(vv).map(id => arr(next.selects).find(o => typeof o === 'object' && entityId(o) === id) || id); // a selector's name / icon stay
            if (k === 'security' && kk === 'entrances') val = arr(vv).map(id => arr(next.entrances).find(o => typeof o === 'object' && entityId(o) === id) || id); // a gate's sensor and name stay
            if (k === 'irrigation' && kk === 'zones') { val = arr(vv).map(id => arr(next.zones ?? next.valves).find(o => typeof o === 'object' && entityId(o) === id) || id); delete next.valves; } // a zone's name and duration are kept
            if (k === 'car' && kk === 'color') val = rgb2hex(vv);
            if (k === 'security' && kk === 'doors_hours') { const h = Number(vv); val = [6, 12, 18].includes(h) ? h : null; } // 24 h is the default: not stored
            if (k === 'attention' && /devices$/.test(kk)) val = [...arr(next[kk]).filter(x => !this._hass.devices?.[x] && !arr(vv).includes(x)), ...arr(vv)]; // names stay
            if (val === '' || val == null || (Array.isArray(val) && !val.length)) delete next[kk]; else next[kk] = val;
          }
          set(k, next);
        }, { exclude_devices: 'Hidden devices', exclude_entities: 'Hidden entities', battery_exclude_devices: 'Hidden from low batteries only', battery_threshold: 'Battery alert below', wifi_threshold: 'Weak Wi-Fi below', tunnels: 'Cloudflare tunnels',
          name: k === 'car' ? 'Name' : undefined, color: 'Colour', charging: 'Charging (on while it charges)', power: 'Charging power', battery: 'Battery level', range: 'Range',
          status: 'Status (parked, driving…)', time: k === 'car' ? 'Charging time / time left' : 'Watering time', zones: 'Valves (one per zone)', entrances: 'Gates, garage doors, barriers, shutters', doors_view: 'Doors view', doors_timeline: 'Timeline bars', doors_hours: 'Timeline span', locks: 'Locks', notification: 'Reminder notification', interval: 'Water every', weekday: 'Day of the week', tomorrow: 'Water tomorrow (switch)', next: 'Next watering', energy_per_charge: 'This charge: energy', cost_per_charge: 'This charge: cost', energy_month: 'This month: energy',
          cost_month: 'This month: cost', energy_year: 'This year: energy', cost_year: 'This year: cost',
          energy_dashboard_totals: 'Month and Year from Home Assistant’s Energy data (like Energy History); off: pick your own sensors', month_sensor: 'Month total sensor', year_sensor: 'Year total sensor',
          stored_sensor: 'Energy stored (shown as Stored on the Energy card; empty: not shown)',
          cpu: 'CPU', memory: 'Memory', disk: 'Disk', swap: 'Swap', containers: 'Containers running', vms: 'VMs running', updates: 'Updates',
          auto_guests: 'Show every container and VM automatically (off: only the servers picked below)',
          pinned: k === 'homelab' && cur.auto_guests === false ? 'Servers to show' : 'Servers pinned at the top',
          player: 'TV', speakers: 'Speakers', watch_timer: 'Screen time: watched today (H:MM:SS)', watch_limit: 'Screen time: daily limit (H:MM:SS)', limit_select: 'Screen time: daily limit picker',
          block_switch: 'Screen time: Block switch', unblock_switch: 'Screen time: Force Unblock switch', light: k === 'tv_light' ? 'TV backlight' : undefined, selects: 'Backlight modes / effects (selectors)',
          pumps: 'Pumps', entities: k === 'devices' ? 'Batteries to show (empty: every phone, tablet and watch with the Home Assistant app)' : 'Other entities (valves, flow, pressure…)', tank: 'Tank level', quality: 'Water quality', face: 'Face recognition: the last recognised face (badge on the Cameras card; empty: the cameras’ own face sensors)', temperature: k === 'homelab' ? 'CPU temperature' : 'Water temperature' }));
        if (['security', 'media', 'irrigation', 'energy'].includes(k)) det.insertAdjacentHTML('beforeend', `<div class="sh-hint" style="margin-top:6px">${t('Leave every field empty and they are found on their own. Once you pick one, only what you pick shows.')}</div>`);
        if (k === 'security') this._entranceSensors(det, P);
        if (k === 'water') this._pumpOptions(det, P);
      } else if (on) det.insertAdjacentHTML('beforeend', '<div class="sh-hint">Found automatically from the integrations.</div>');
      list.appendChild(det);
    }
  }

  /* ================================================================ */
  /* Look step                                                         */
  /* ================================================================ */
  _rLook(body) {
    const C = this._config, H = C.house = C.house || {};
    const data = { title: C.title || '', weather: C.weather || '', start_tab: C.start_tab || 'home', type: H.type === 'gltf' ? 'gltf' : 'floorplan', url: H.url || '', wall_height: H.wall_height ?? 1.35, style: H.style === 'dollhouse' ? 'dollhouse' : 'classic', setting: H.setting === 'apartment' ? 'apartment' : 'house', apartment_floor: H.apartment_floor ?? 2, auto_furniture: !!H.auto_furniture, hide_hint: C.hint === false, room_backdrop: C.room_backdrop !== false, smart_icons: C.smart_icons !== false, height: Number(C.height) || 0, room: C.room || '', appearance: C.appearance || 'dark' };
    for (const d of ['phone', 'tablet', 'pc']) { data['view_' + d] = C.default_view?.[d] || 'auto'; data['floor_' + d] = C.default_floor?.[d] != null ? String(C.default_floor[d]) : 'auto'; }
    // the floors to choose from: the ones the house has (Home Assistant floors, or the rooms' own levels)
    let floors = []; try { floors = buildModel(this._config, this._hass).levels || []; } catch (e) { /* not ready */ }
    const VIEW = { select: { mode: 'dropdown', options: [{ value: 'auto', label: 'Automatic' }, { value: 'top', label: 'Floor plan (from above)' }, { value: '3d', label: '3D view' }] } };
    const FLOOR = { select: { mode: 'dropdown', options: [{ value: 'auto', label: 'Automatic (ground floor)' }, ...floors.map(l => ({ value: String(l.level), label: l.name.startsWith('Floor ') ? t('Floor {0}', l.level) : l.name }))] } };
    body.innerHTML = '';
    body.appendChild(this._form([
      { name: 'title', selector: { text: {} } },
      { name: 'weather', selector: { entity: { domain: 'weather' } } },
      // Sweet Home 3D: the height of its 3D view (in a sections view, the size picked there wins); the full card: its first tab
      ...(this.solo ? [{ name: 'height', selector: { number: { min: 0, max: 1200, step: 10, unit_of_measurement: 'px', mode: 'box' } } },
        { name: 'room', selector: { select: { mode: 'dropdown', options: [{ value: '', label: t('Whole house') }, ...this._rooms.map((r, i) => ({ value: String(r.area || r.name || ''), label: this._roomName(r, i) })).filter(o => o.value)] } } }]
        : [{ name: 'appearance', selector: { select: { mode: 'dropdown', options: [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Follow Home Assistant (light or dark theme)']].map(([value, label]) => ({ value, label: t(label) })) } } }, { name: 'start_tab', selector: { select: { mode: 'dropdown', options: ['home', 'security', 'climate', 'energy', 'water', 'media', 'system'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) } } }]),
      { name: 'type', selector: { select: { mode: 'list', options: [{ value: 'floorplan', label: 'Drawn floor plan (rooms)' }, { value: 'gltf', label: '3D file (.glb) from /config/www' }] } } },
      ...(data.type === 'gltf' ? [{ name: 'url', selector: { text: {} } }] : [{ name: 'style', selector: { select: { mode: 'dropdown', options: [['classic', 'Classic (night blue)'], ['dollhouse', 'Dollhouse (sunny lot, wallpapered rooms, near walls cut down)']].map(([value, label]) => ({ value, label: t(label) })) } } },
          { name: 'setting', selector: { select: { mode: 'dropdown', options: [['house', 'A house (on its own lot)'], ['apartment', 'An apartment (a flat in a building, the street below)']].map(([value, label]) => ({ value, label: t(label) })) } } },
          ...(data.setting === 'apartment' ? [{ name: 'apartment_floor', selector: { number: { min: 0, max: 40, step: 1, mode: 'box' } } }] : []), { name: 'wall_height', selector: { number: { min: 0.4, max: 3, step: 0.05, unit_of_measurement: 'm', mode: 'slider' } } }, { name: 'auto_furniture', selector: { boolean: {} } }]),
      { name: 'hide_hint', selector: { boolean: {} } },
      ...(this.solo ? [] : [{ name: 'room_backdrop', selector: { boolean: {} } }]),
      { name: 'smart_icons', selector: { boolean: {} } },
      { type: 'grid', name: '', schema: ['phone', 'tablet', 'pc'].map(d => ({ name: 'view_' + d, selector: VIEW })) },
      ...(floors.length > 1 ? [{ type: 'grid', name: '', schema: ['phone', 'tablet', 'pc'].map(d => ({ name: 'floor_' + d, selector: FLOOR })) }] : []),
    ], data, (v, typing) => {
      for (const k of ['title', 'weather']) { if (v[k]) C[k] = v[k]; else delete C[k]; }
      if (!this.solo) { if (v.start_tab && v.start_tab !== 'home') C.start_tab = v.start_tab; else delete C.start_tab; if (['light', 'auto'].includes(v.appearance)) C.appearance = v.appearance; else delete C.appearance; }
      if (this.solo) { if (Number(v.height) > 0) C.height = Number(v.height); else delete C.height; if (v.room) C.room = v.room; else delete C.room; }
      const was = H.type;
      if (v.type === 'gltf') { H.type = 'gltf'; if (v.url) H.url = v.url; else delete H.url; } else { delete H.type; delete H.url; }
      if (v.wall_height != null && v.wall_height !== 1.35) H.wall_height = v.wall_height; else delete H.wall_height;
      if (v.auto_furniture) H.auto_furniture = true; else delete H.auto_furniture;
      if (v.type !== 'gltf' && v.style === 'dollhouse') H.style = 'dollhouse'; else delete H.style;
      if (v.type !== 'gltf' && v.setting === 'apartment') { H.setting = 'apartment'; const f = Math.round(Number(v.apartment_floor)); if (v.apartment_floor != null && v.apartment_floor !== '' && f >= 0 && f !== 2) H.apartment_floor = f; else delete H.apartment_floor; }
      else { delete H.setting; delete H.apartment_floor; }
      if (!this.solo) { if (v.room_backdrop === false) C.room_backdrop = false; else delete C.room_backdrop; } // off = no blur behind a room on phones; a tap switches rooms
      if (v.hide_hint) C.hint = false; else delete C.hint; // on = the tip is not shown
      if (v.smart_icons === false) C.smart_icons = false; else delete C.smart_icons; // off = the icons set in Home Assistant
      // where the 3D view starts, per kind of device (only what is picked is kept)
      for (const [key, pre, num] of [['default_view', 'view_', false], ['default_floor', 'floor_', true]]) {
        const o = {}; for (const d of ['phone', 'tablet', 'pc']) { const x = v[pre + d]; if (x != null && x !== '' && x !== 'auto') o[d] = num ? Number(x) : x; }
        if (Object.keys(o).length) C[key] = o; else delete C[key];
      }
      if (!Object.keys(H).length) delete C.house;
      this._emit(typing);
      if (was !== H.type) this._render();
    }, { appearance: 'Appearance', height: 'Height of the 3D view (empty: 420 px; in a sections view, the card’s size is used)', room: 'Zoom on one room (its floor buttons are hidden; closing its pop-up comes back to it)', url: '3D file URL (e.g. /local/home.glb)', wall_height: 'Wall height', style: 'House style', setting: 'Home type', apartment_floor: 'The floor the apartment is on (0 = ground floor)', auto_furniture: 'Add furniture automatically to rooms without their own (bedrooms, kitchen, living room…)', hide_hint: 'Hide the “tap a room” tip', room_backdrop: 'Phones: blur the 3D view behind an open room (a tap outside closes it). Off: tap another room to switch to it', smart_icons: 'Automatic icons: pick icons from names (a fan, a heater, a guest mode…). Off: the icons set in Home Assistant', view_phone: 'Start view on phones', view_tablet: 'Start view on tablets', view_pc: 'Start view on computers', floor_phone: 'Start floor on phones', floor_tablet: 'Start floor on tablets', floor_pc: 'Start floor on computers' }, true));
    { const h = document.createElement('div'); h.className = 'sh-hint'; h.textContent = t('One phone or tablet can start differently: long press a floor button, or the floor plan / 3D button, on the 3D view of that device. Long press it again to go back to these settings.'); body.appendChild(h); }
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

/* ================================================================ */
/* Inspector (Build mode)                                            */
/* ================================================================ */
// The settings of one thing picked in the 3D view with Build mode's Select tool: a room (its settings, shape,
// devices, furniture), a furniture piece, a door / gate, window, open passage, lock badge or separate wall. It is the
// card editor's own forms, for that one thing. `sel`: {k: 'room', i} · {k: 'piece', room (index or null: the house's
// own pieces), i} · {k: 'door' | 'window' | 'opening' | 'badge' | 'wall', i}. Each change is sent as a
// `sh-inspect-change` event ({config, typing}); `sh-inspect-close` when the thing is gone (deleted).
class SweetHomeInspector extends SweetHomeCardEditor {
  _b3d() { return null; }
  connectedCallback() { /* not the card editor: Build mode sends its changes itself */ }
  disconnectedCallback() {}
  _keys() { /* the card handles the keys while building */ }
  set sel(v) { this._isel = v; this._fsel = null; this._render(); }
  get sel() { return this._isel; }
  _emit(typing) {
    const H = this._config.house;
    if (H && Array.isArray(H.rooms) && !H.rooms.length) delete H.rooms;
    if (H && !Object.keys(H).length) delete this._config.house;
    const j = JSON.stringify(this._config); if (j === this._last) return; this._last = j;
    this.dispatchEvent(new CustomEvent('sh-inspect-change', { detail: { config: clone(this._config), typing: !!typing } }));
  }
  _syncUndo() {}
  _render() {
    const S = this._isel; if (!this._config || !this._hass || !S) { this.innerHTML = ''; return; }
    this._R = null;
    const H = this._H, rooms = arr(H.rooms), gone = () => { this.innerHTML = ''; this.dispatchEvent(new CustomEvent('sh-inspect-close')); };
    // a piece picked in a room's furniture list
    if (S.k === 'room' && this._fsel != null) { this._isel = { k: 'piece', room: S.i, i: this._fsel }; this._fsel = null; return this._render(); }
    this.innerHTML = `<style>${EDITOR_CSS}.sh-insp .sh-pal{display:none}.sh-insp details>summary{font-weight:600}</style><div class="sh-ed sh-insp" dir="${isRTL() ? 'rtl' : 'ltr'}"></div>`;
    const box = this.querySelector('.sh-insp');
    if (S.k === 'room') {
      const r = rooms[S.i]; if (!r) return gone();
      this._sel = S.i; this._lvl = this._lvOf(r); this._mode = 'shape'; this._stool = 'rect';
      box.appendChild(this._roomForm(r));
      const shape = document.createElement('div'); this._shapeTools(shape, r); box.appendChild(shape);
      const sec = (title, open, fill) => { const d = document.createElement('details'); d.className = 'sh-box'; d.open = !!(this._open ||= {})[title] || open; d.innerHTML = `<summary>${t(title)}</summary>`; d.addEventListener('toggle', () => { this._open[title] = d.open; }); const b = document.createElement('div'); d.appendChild(b); box.appendChild(d); fill(b); };
      sec('Devices', false, b => this._mEntities(b, r));
      sec('Furniture', false, b => this._mFurniture(b, r));
    } else if (S.k === 'piece') {
      const r = S.room == null ? { furniture: (H.furniture ||= []) } : rooms[S.room], f = arr(r?.furniture)[S.i]; if (!f) return gone();
      this._sel = S.room ?? 0; this._fsel = S.i;
      this._pieceForm(box, r, f);
      this._fsel = null;
    } else if (['door', 'window', 'opening', 'badge'].includes(S.k)) {
      const key = { door: 'doors', window: 'windows', opening: 'openings', badge: 'lock_badges' }[S.k]; if (!arr(H[key])[S.i]) return gone();
      this._dsel = { k: S.k, i: S.i }; this._doorItem(box);
    } else if (S.k === 'wall') {
      const o = arr(H.extra_walls)[S.i]; if (!o) return gone();
      this._wsel = S.i;
      if (Array.isArray(o)) { box.innerHTML = `<div class="sh-hint">${t('This wall is written as a list in YAML: change it there.')}</div>`; return; }
      box.innerHTML = this._wallHtml(o); this._wallWire(box, o);
    }
  }
}
if (!customElements.get('sweet-home-inspector')) customElements.define('sweet-home-inspector', SweetHomeInspector);
export { footprint, sizePiece } from './pieces.js';
export { turnPiece, movePiece };
