/*
 * Sweet Home — model builder.
 * Turns the card's YAML / visual-editor config plus Home Assistant's own registries (areas, devices, entities)
 * into the internal model the card and the 3D scene read: rooms, walls, doors, furniture and the entity map `E`.
 * Nothing here is specific to one house: every entity is either configured or discovered.
 */

const BAD = ['unavailable', 'unknown', 'none', 'None', ''];
export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'room';
export const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
export const toColor = (c, d) => {
  if (c == null || c === '') return d;
  if (typeof c === 'number') return c;
  const s = String(c).trim();
  if (/^#?[0-9a-f]{6}$/i.test(s)) return parseInt(s.replace('#', ''), 16);
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  return d;
};

/* ------------------------------------------------------------------ */
/* registry helpers                                                    */
/* ------------------------------------------------------------------ */
export function registry(hass) {
  const states = hass?.states || {}, ents = hass?.entities || {}, devs = hass?.devices || {}, areas = hass?.areas || {};
  const floors = hass?.floors || {};
  const areaOf = id => ents[id]?.area_id || devs[ents[id]?.device_id]?.area_id || null;
  const dc = id => states[id]?.attributes?.device_class;
  const name = id => states[id]?.attributes?.friendly_name || id;
  const visible = id => !!states[id] && !ents[id]?.hidden && !ents[id]?.entity_category;
  const platform = id => ents[id]?.platform;
  const byArea = {};
  for (const id of Object.keys(states)) {
    if (!visible(id)) continue;
    const a = areaOf(id); if (!a) continue;
    (byArea[a] ||= []).push(id);
  }
  const sameDevice = (id, pred) => {
    const dev = ents[id]?.device_id; if (!dev) return [];
    return Object.keys(ents).filter(e => ents[e].device_id === dev && e !== id && states[e] && pred(e));
  };
  const ofPlatform = (p, re) => Object.keys(ents).filter(id => ents[id].platform === p && states[id] && (!re || re.test(id)));
  return { states, ents, devs, areas, floors, areaOf, dc, name, visible, platform, byArea, sameDevice, ofPlatform };
}

// the level of each Home Assistant floor (its `level`, or its place in the list when it has none)
export function floorLevels(R) {
  const fl = Object.values(R.floors || {});
  const out = {};
  fl.slice().sort((a, b) => (a.level ?? 1e9) - (b.level ?? 1e9) || String(a.name).localeCompare(b.name)).forEach((f, i) => { out[f.floor_id] = f.level ?? i; });
  return out;
}
export const areaLevel = (R, a) => { const f = R.areas[a]?.floor_id; return f != null ? floorLevels(R)[f] ?? null : null; };

/* entities of one area, sorted into what a room needs */
export function discoverRoom(R, areaId) {
  const ids = R.byArea[areaId] || [];
  const d = id => id.split('.')[0];
  const lc = id => R.name(id).toLowerCase();
  const temps = ids.filter(id => d(id) === 'sensor' && R.dc(id) === 'temperature' && !/cpu|battery|device temp|processor|chip|board|water|outdoor/.test(lc(id)));
  const hums = ids.filter(id => d(id) === 'sensor' && R.dc(id) === 'humidity');
  const plugs = ids.filter(id => d(id) === 'switch' && R.dc(id) === 'outlet').map(id => ({
    id, name: R.name(id), icon: 'mdi:power-socket-eu',
    power: R.sameDevice(id, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null,
  }));
  return {
    lights: ids.filter(id => d(id) === 'light'),
    temp: temps[0] || null,
    hum: hums[0] || null,
    motion: ids.filter(id => d(id) === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(R.dc(id))),
    doors: ids.filter(id => d(id) === 'binary_sensor' && ['door', 'garage_door', 'opening'].includes(R.dc(id))),
    climate: ids.find(id => d(id) === 'climate') || null,
    locks: ids.filter(id => d(id) === 'lock'),
    fan: ids.find(id => d(id) === 'fan') || null,
    plugs,
    media: ids.find(id => d(id) === 'media_player') || null,
    // everything else worth a button in the room popup: blinds, plain switches, valves, vacuums…
    entities: ids.filter(id => OTHER_DOMAINS.includes(d(id)) && !(d(id) === 'switch' && R.dc(id) === 'outlet')),
  };
}
const OTHER_DOMAINS = ['cover', 'switch', 'valve', 'vacuum', 'humidifier', 'siren', 'water_heater'];

// Which room setting an entity belongs to (the YAML key of the room). Anything else is shown under "Other" (`entities`).
// Single-value keys hold one entity; the others hold lists.
export const ROLE_KEYS = ['lights', 'climate', 'temperature', 'humidity', 'motion', 'doors', 'locks', 'fan', 'plugs', 'media', 'entities'];
export const SINGLE_ROLES = ['climate', 'temperature', 'humidity', 'fan', 'media'];
export function roleOf(R, id) {
  const d = String(id).split('.')[0], dc = R.dc(id);
  if (d === 'light') return 'lights';
  if (d === 'climate') return 'climate';
  if (d === 'sensor' && dc === 'temperature') return 'temperature';
  if (d === 'sensor' && dc === 'humidity') return 'humidity';
  if (d === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(dc)) return 'motion';
  if (d === 'binary_sensor' && ['door', 'garage_door', 'opening'].includes(dc)) return 'doors';
  if (d === 'lock') return 'locks';
  if (d === 'fan') return 'fan';
  if (d === 'switch' && dc === 'outlet') return 'plugs';
  if (d === 'media_player') return 'media';
  return 'entities';
}
// the same room id the model gives a room config
export const roomIdOf = (rc, i, R) => String(rc.id || slug(rc.area || rc.name || R?.areas?.[rc.area]?.name || `Room ${i + 1}`));
// entities one furniture piece is linked to (`entity`, `entities`, or a charger's plug)
export const furnEntities = f => arr(f.entities ?? f.entity ?? (f.type === 'charger' ? f.plug : null)).map(e => (typeof e === 'string' ? e : e?.entity || e?.id)).filter(Boolean);

// furniture types: [name, icon] (the card's popup and the card editor's palette)
export const FURN_TYPES = { bed: ['Bed', 'mdi:bed'], sofa: ['Sofa', 'mdi:sofa'], table: ['Table', 'mdi:table-furniture'], chair: ['Chair', 'mdi:chair-rolling'],
  tv: ['TV', 'mdi:television'], lamp: ['Lamp', 'mdi:floor-lamp'], fan: ['Ceiling fan', 'mdi:ceiling-fan'], marker: ['Device', 'mdi:map-marker-radius'], plant: ['Plant', 'mdi:sprout'],
  rug: ['Rug', 'mdi:rug'], box: ['Cabinet', 'mdi:wardrobe'], block: ['Counter', 'mdi:countertop'], cylinder: ['Cylinder', 'mdi:cylinder'], ball: ['Ball', 'mdi:circle'],
  charger: ['Phone charger', 'mdi:cellphone-charging'], stairs: ['Stairs', 'mdi:stairs'], blinds: ['Blinds', 'mdi:blinds'], vacuum: ['Robot vacuum', 'mdi:robot-vacuum'],
  car: ['Car', 'mdi:car'], tree: ['Tree', 'mdi:tree'], hedge: ['Hedge', 'mdi:grass'], pool: ['Pool', 'mdi:pool'], sprinkler: ['Sprinkler', 'mdi:sprinkler-variant'] };

const ROOM_ICONS = [[/stair/, 'mdi:stairs'], [/parking|carport|driveway/, 'mdi:car'], [/living|lounge|family|salon/, 'mdi:sofa'], [/kitchen/, 'mdi:countertop'], [/dining/, 'mdi:table-chair'],
  [/master|bedroom|bed room|guest room|room/, 'mdi:bed'], [/bath|toilet|wc|shower/, 'mdi:shower'], [/office|study|work/, 'mdi:desk'],
  [/garage/, 'mdi:garage'], [/garden|yard|patio|terrace|balcony|outside|outdoor/, 'mdi:flower'], [/hall|corridor|entry|entrance|landing/, 'mdi:door-open'],
  [/stair/, 'mdi:stairs'], [/laundry|utility/, 'mdi:washing-machine'], [/kid|child|nursery|play/, 'mdi:teddy-bear'], [/basement|cellar|storage/, 'mdi:archive']];
const roomIcon = n => (ROOM_ICONS.find(([re]) => re.test(String(n).toLowerCase())) || [0, 'mdi:home-outline'])[1];
const roomFloor = n => /bath|toilet|wc|shower|kitchen|laundry/.test(n) ? 'tile' : /bed|kid|nursery/.test(n) ? 'carpet' : /garage|parking|carport|driveway/.test(n) ? 'asphalt' : /garden|yard|patio|terrace|balcony|outside|outdoor/.test(n) ? 'stone' : /living|dining|lounge|office|study/.test(n) ? 'wood' : 'marble';
const isOutdoor = n => /garden|yard|patio|terrace|balcony|outside|outdoor|driveway|carport|parking/.test(String(n).toLowerCase());

/* ------------------------------------------------------------------ */
/* automatic house: one box per HA area, laid out on a grid             */
/* ------------------------------------------------------------------ */
function autoRooms(R, cfg) {
  const floorLevel = a => areaLevel(R, a) ?? 0;
  let ids = Object.keys(R.areas);
  if (cfg.areas) ids = arr(cfg.areas).filter(a => R.areas[a]);
  else if (ids.some(a => (R.byArea[a] || []).length)) ids = ids.filter(a => (R.byArea[a] || []).length); // areas with something in them (or every area, while none has devices yet)
  ids.sort((a, b) => floorLevel(a) - floorLevel(b) || String(R.areas[a].name).localeCompare(R.areas[b].name));
  if (!ids.length) return [];
  // one block per floor, all at the same place: the card shows one floor at a time
  const byFloor = new Map();
  for (const a of ids) { const f = floorLevel(a); (byFloor.get(f) || byFloor.set(f, []).get(f)).push(a); }
  const rooms = []; const ox = 0;
  for (const [level, list] of byFloor) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length * 1.3)));
    const S = 4.5; let maxc = 0;
    list.forEach((a, i) => {
      const c = i % cols, r = Math.floor(i / cols); maxc = Math.max(maxc, c);
      const n = R.areas[a].name;
      rooms.push({ id: slug(a), name: n, area: a, level, rects: [[ox + c * S, r * S, ox + (c + 1) * S, (r + 1) * S]], auto: true });
    });
  }
  return rooms;
}

// a flight of stairs filling a room's first rectangle, climbing along its longer side
export function stairsFor(room) {
  const [x1, z1, x2, z2] = room.rects[0], o = room.stairs && typeof room.stairs === 'object' ? room.stairs : {};
  const alongX = o.axis ? o.axis === 'x' : x2 - x1 >= z2 - z1, len = alongX ? x2 - x1 : z2 - z1;
  // `stairs: up | down | both` (or {mode, axis, steps}); by default both: one flight up, one down
  const chosen = { up: 'up', down: 'down', both: 'split', split: 'split' }[o.mode || room.stairs];
  // not chosen: set by the floors (see buildModel): up on the lowest floor, down on the top one, both in between
  return { type: 'stairs', room: room.id, x0: x1 + 0.08, z0: z1 + 0.08, x1: x2 - 0.08, z1: z2 - 0.08, axis: alongX ? 'x' : 'z', mode: chosen || 'split', byFloors: !chosen, steps: o.steps || Math.max(4, Math.min(16, Math.round(len / 0.28))) };
}

/* automatic furniture for automatic / furniture-less rooms, from the room's name */
export function autoFurniture(room) {
  const [x1, z1, x2, z2] = room.rects[0], w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const n = String(room.name).toLowerCase(), f = [];
  const R = room.id;
  if (/living|lounge|family|salon/.test(n)) {
    f.push({ type: 'rug', room: R, x: cx, z: cz, w: w * 0.6, d: d * 0.5, color: 0x6b6253 });
    f.push({ type: 'sofa', room: R, x0: x1 + w * 0.15, z0: z1 + 0.15, x1: x2 - w * 0.15, z1: z1 + 1.1, back: 'n', color: 0x475569, cushion: 0x64748b, pillow: 0xe2e8f0 });
    f.push({ type: 'box', room: R, x: cx, z: cz, w: 1.1, d: 0.6, h: 0.4, color: 0x1f2937 });
    f.push({ type: 'tv', room: R, x: cx, z: z2 - 0.2, w: Math.min(1.6, w * 0.4), h: 0.9, y: 0.6, entity: room.media || undefined });
    f.push({ type: 'plant', room: R, x: x2 - 0.5, z: z2 - 0.5, size: 0.8 });
  } else if (/kitchen/.test(n)) {
    f.push({ type: 'block', room: R, x0: x1 + 0.1, z0: z1 + 0.1, x1: x2 - 0.1, z1: z1 + 0.7, h: 0.88, color: 0x6b4a2b });
    f.push({ type: 'block', room: R, x0: x1 + 0.1, z0: z1 + 0.1, x1: x2 - 0.1, z1: z1 + 0.7, h: 0.05, y: 0.88, color: 0x111111 });
    f.push({ type: 'table', room: R, x: cx, z: cz + 0.6, w: 1.2, d: 0.8, h: 0.76, top: 0x0b0b0b, leg: 0x1f1a17 });
    for (const [dx, dz, face] of [[-0.35, -0.65, 's'], [0.35, -0.65, 's'], [-0.35, 0.65, 'n'], [0.35, 0.65, 'n']]) f.push({ type: 'chair', room: R, x: cx + dx, z: cz + 0.6 + dz, face, color: 0x3a2a1d });
  } else if (/dining/.test(n)) {
    f.push({ type: 'table', room: R, x: cx, z: cz, w: 1.8, d: 1.0, h: 0.76, top: 0xd8ccb2, leg: 0xb7a684 });
    for (const [dx, dz, face] of [[-0.5, -0.75, 's'], [0.5, -0.75, 's'], [-0.5, 0.75, 'n'], [0.5, 0.75, 'n']]) f.push({ type: 'chair', room: R, x: cx + dx, z: cz + dz, face, color: 0xcfc4ae });
  } else if (/bath|toilet|wc|shower/.test(n)) {
    f.push({ type: 'box', room: R, x: x1 + 0.5, z: cz, w: 0.8, d: 1.6, h: 0.56, color: 0xffffff });
    f.push({ type: 'box', room: R, x: x2 - 0.45, z: z1 + 0.35, w: 0.7, d: 0.45, h: 0.85, color: 0xe5e7eb });
  } else if (/bed|room|kid|nursery|guest/.test(n) && !/bath|living|dining/.test(n)) {
    const big = /master|parent|main/.test(n);
    f.push({ type: 'rug', room: R, x: cx, z: cz + 0.3, w: w * 0.6, d: d * 0.5, color: 0xa5a9b2 });
    f.push({ type: 'bed', room: R, x: cx, z: z2 - 1.15, width: big ? 1.8 : 1.1, length: 2.0, head: 's', frame: 0x7c5a3c, duvet: big ? 0xf3c5d2 : 0x93c5fd, headboard: 0xe8dcc8 });
    f.push({ type: 'block', room: R, x0: x1 + 0.1, z0: z1 + 0.1, x1: x1 + Math.min(2.4, w * 0.6), z1: z1 + 0.65, h: 1.3, color: 0x8b6b45 });
  } else if (/office|study|work/.test(n)) {
    f.push({ type: 'box', room: R, x: cx, z: z1 + 0.4, w: 1.4, d: 0.65, h: 0.75, color: 0x111111 });
    f.push({ type: 'chair', room: R, x: cx, z: z1 + 1.05, face: 'n', color: 0x334155 });
  } else if (/garden|yard/.test(n)) {
    f.push({ type: 'tree', room: R, x: x1 + Math.min(1.2, w * 0.25), z: z1 + Math.min(1.2, d * 0.25), size: 1 });
    f.push({ type: 'hedge', room: R, x0: x1 + 0.15, z0: z2 - 0.55, x1: x2 - 0.15, z1: z2 - 0.15, h: 0.8 });
    f.push({ type: 'table', room: R, x: cx, z: cz, w: 0.8, d: 0.8, h: 0.72, top: 0xf1f5f9, leg: 0x94a3b8 });
  } else if (/patio|terrace|balcony/.test(n)) {
    f.push({ type: 'plant', room: R, x: x1 + 0.6, z: z1 + 0.6, size: 1 }, { type: 'plant', room: R, x: x2 - 0.6, z: z1 + 0.6, size: 0.9 });
    f.push({ type: 'table', room: R, x: cx, z: cz, w: 0.8, d: 0.8, h: 0.72, top: 0xf1f5f9, leg: 0x94a3b8 });
  } else if (/stair/.test(n) && room.stairs !== false) {
    f.push(stairsFor(room));
  } else if (/garage|parking|carport|driveway/.test(n)) {
    f.push({ type: 'car', room: R, x: cx, z: cz, facing: d >= w ? 'n' : 'e', color: 0x2563eb });
  }
  return f;
}

// The automatic set for one room config, written the way YAML writes furniture (from / to corners, #hex colours),
// so the card editor can turn it into pieces the user can move and change.
export function autoFurnitureConfig(rc, name) {
  const poly = roomOutline(rc), rects = poly ? polyRects(poly) : arr(rc.rects || (rc.rect ? [rc.rect] : [])); if (!rects.length) return [];
  const r2 = x => Math.round(x * 100) / 100;
  const hex = c => '#' + Number(c).toString(16).padStart(6, '0');
  return autoFurniture({ id: 'x', name: name || rc.name || rc.area || '', rects, media: typeof rc.media === 'string' ? rc.media : null }).map(f => {
    const o = {};
    for (const [k, v] of Object.entries(f)) {
      if (k === 'room' || v === undefined) continue;
      if (['x0', 'z0', 'x1', 'z1'].includes(k)) continue;
      o[k] = typeof v === 'number' && ['color', 'cushion', 'pillow', 'top', 'leg', 'frame', 'duvet', 'headboard', 'seat'].includes(k) ? hex(v) : typeof v === 'number' ? r2(v) : v;
    }
    if (f.x0 != null) { o.from = [r2(f.x0), r2(f.z0)]; o.to = [r2(f.x1), r2(f.z1)]; }
    return o;
  });
}

/* ------------------------------------------------------------------ */
/* room shapes                                                          */
/* ------------------------------------------------------------------ */
// A room is rectangles (`rects`, several make an L, T or U) or an outline (`points`: [[x, z], …], its corners in order),
// which can have slanted edges. A third number on a point bends the edge that starts there into an arc: how many metres
// the middle of the edge bows out of the room (negative: into it).
const rnd4 = v => Math.round(v * 1e4) / 1e4;
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
// the points between a and b on an arc whose middle is `bow` metres off the straight line, towards the unit normal n
export function bendEdge(a, b, bow, n) {
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]), s = Math.abs(bow); if (!s || c < 1e-6) return [];
  const R = (c * c / 4 + s * s) / (2 * s), Phi = 4 * Math.atan(2 * s / c), sg = Math.sign(bow);
  const u = [n[0] * sg, n[1] * sg], d = [(b[0] - a[0]) / c, (b[1] - a[1]) / c];
  const ctr = [(a[0] + b[0]) / 2 - u[0] * (R - s), (a[1] + b[1]) / 2 - u[1] * (R - s)];
  const k = Math.max(4, Math.min(48, Math.ceil(R * Phi / 0.3))), out = [];
  for (let i = 1; i < k; i++) { const f = -Phi / 2 + Phi * i / k; out.push([ctr[0] + R * (Math.cos(f) * u[0] + Math.sin(f) * d[0]), ctr[1] + R * (Math.cos(f) * u[1] + Math.sin(f) * d[1])]); }
  return out;
}
// the outline of a room given by `points`, with its bent edges cut into short straight pieces (null for rectangles)
export function roomOutline(rc) {
  const P = arr(rc?.points).filter(p => Array.isArray(p) && p.length >= 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1]))).map(p => p.map(Number));
  if (P.length < 3 && !(P.length === 2 && P.some(p => p[2]))) return null; // two corners make a round room when bent
  const sg = polyArea(P) >= 0 ? 1 : -1, out = [];
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return;
    out.push([a[0], a[1]]);
    if (a[2]) out.push(...bendEdge(a, b, a[2], [sg * (b[1] - a[1]) / L, -sg * (b[0] - a[0]) / L]));
  });
  return out.length >= 3 ? out.map(p => p.map(rnd4)) : null;
}
export function inPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// rectangles that roughly fill an outline, biggest first (exact for L, T and U shapes): furniture, lights and
// stairs that work on rectangles use them
export function polyRects(poly) {
  const zs = [...new Set(poly.map(p => rnd4(p[1])))].sort((a, b) => a - b), out = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const z1 = zs[i], z2 = zs[i + 1]; if (z2 - z1 < 0.02) continue;
    const zm = (z1 + z2) / 2, xs = [];
    for (let k = 0; k < poly.length; k++) { const [xa, za] = poly[k], [xb, zb] = poly[(k + 1) % poly.length]; if ((za <= zm) !== (zb <= zm)) xs.push(xa + (zm - za) / (zb - za) * (xb - xa)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = rnd4(xs[k]), b = rnd4(xs[k + 1]); if (b - a < 0.02) continue;
      const up = out.find(q => Math.abs(q[0] - a) < 1e-3 && Math.abs(q[2] - b) < 1e-3 && Math.abs(q[3] - z1) < 1e-3);
      if (up) up[3] = z2; else out.push([a, z1, b, z2]);
    }
  }
  return out.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]));
}
// the edges of a room: its outline, or the sides of its rectangles
export const roomEdges = r => r.poly ? r.poly.map((p, i) => [p[0], p[1], r.poly[(i + 1) % r.poly.length][0], r.poly[(i + 1) % r.poly.length][1]])
  : r.rects.flatMap(([x1, z1, x2, z2]) => [[x1, z1, x2, z1], [x1, z2, x2, z2], [x1, z1, x1, z2], [x2, z1, x2, z2]]);

// A straight line in any direction: unit direction (dx, dz) with dz ≥ 0, offset c along the normal (-dz, dx), and the
// stretch [a, b] a segment covers along it. Axis lines come out exact (c = z for horizontal ones).
export function lineOf(x1, z1, x2, z2) {
  let dx = x2 - x1, dz = z2 - z1; const L = Math.hypot(dx, dz); if (L < 1e-6) return null;
  dx /= L; dz /= L;
  if (Math.abs(dz) < 1e-6) { dx = 1; dz = 0; } else if (Math.abs(dx) < 1e-6) { dx = 0; dz = 1; } else if (dz < 0) { dx = -dx; dz = -dz; }
  const c = -x1 * dz + z1 * dx, t1 = x1 * dx + z1 * dz, t2 = x2 * dx + z2 * dz;
  return { dx, dz, c, ang: Math.atan2(dz, dx), a: Math.min(t1, t2), b: Math.max(t1, t2) };
}
const sameLine = (p, q, tol = 0.02) => Math.abs(p.ang - q.ang) < 2e-3 && Math.abs(p.c - q.c) < tol;
const lineKey = l => `${Math.round(l.ang * 1e3)}:${Math.round(l.c * 100)}`;
const onLine = (l, t) => [rnd4(-l.c * l.dz + t * l.dx), rnd4(l.c * l.dx + t * l.dz)];

/* ------------------------------------------------------------------ */
/* walls from room shapes                                               */
/* ------------------------------------------------------------------ */
// Every room edge becomes wall; an edge shared by two rooms becomes one inner wall. Outdoor-only edges become
// railings. Edges between two parts of the same room (an L made of two rectangles) get no wall. Optional: openings
// (gaps), windows, open_plan (room pairs with no wall), automatic doorways / windows. Edges can run in any direction.
export function wallsFromRooms(rooms, house = {}) {
  const E = 1e-3, key = v => Math.round(v * 1000) / 1000;
  const lines = new Map(); // line key → { l, list: [{a, b, room}] }
  for (const r of rooms) for (const [x1, z1, x2, z2] of roomEdges(r)) {
    const l = lineOf(x1, z1, x2, z2); if (!l) continue;
    const k = lineKey(l), e = lines.get(k) || lines.set(k, { l, list: [] }).get(k);
    e.list.push({ a: l.a, b: l.b, room: r });
  }
  const openPlan = arr(house.open_plan).map(p => arr(p).map(String));
  const isOpen = (r1, r2) => openPlan.some(p => p.includes(r1.id) && p.includes(r2.id));
  const segs = [];
  for (const [, { l, list }] of lines) {
    const pts = [...new Set(list.flatMap(s => [key(s.a), key(s.b)]))].sort((x, y) => x - y);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; if (b - a < E) continue;
      const on = list.filter(s => s.a <= a + E && s.b >= b - E).map(s => s.room);
      const uniq = [...new Set(on)];
      if (!uniq.length) continue;
      let type = 'w';
      if (uniq.length >= 2) {
        if (uniq.every(r => r.outdoor)) continue;
        if (isOpen(uniq[0], uniq[1])) continue;
      } else if (on.length >= 2) continue; // inside one room: two of its parts meet here
      else if (uniq[0]?.outdoor) type = 'rail';
      segs.push({ l, a, b, type, rooms: uniq });
    }
  }
  // merge neighbours of the same type and room set
  segs.sort((s, t) => lineKey(s.l).localeCompare(lineKey(t.l)) || s.a - t.a);
  const merged = [];
  for (const s of segs) {
    const m = merged[merged.length - 1];
    if (m && sameLine(m.l, s.l, E) && Math.abs(m.b - s.a) < E && m.type === s.type && m.rooms.map(r => r.id).join() === s.rooms.map(r => r.id).join()) m.b = s.b;
    else merged.push({ ...s });
  }
  const cut = (list, g, type) => { // replace the stretch of `g` (a line with [a, b]) with `type` (null = gap)
    const out = [];
    for (const s of list) {
      if (!sameLine(s.l, g) || s.b <= g.a + E || s.a >= g.b - E) { out.push(s); continue; }
      if (s.a < g.a - E) out.push({ ...s, b: g.a });
      if (type) out.push({ ...s, a: Math.max(g.a, s.a), b: Math.min(g.b, s.b), type });
      if (s.b > g.b + E) out.push({ ...s, a: g.b });
    }
    return out;
  };
  let res = merged;
  const segLine = q => (Array.isArray(q) && q.length >= 4 ? lineOf(...q.slice(0, 4).map(Number)) : null);
  // automatic doorways: a 0.9 m gap in the middle of each wall shared by two indoor rooms (unless an opening is given there)
  const explicitOpen = arr(house.openings).map(segLine).filter(Boolean);
  if (house.doorways !== 'none' && house.doorways !== false) {
    const done = new Set();
    for (const s of [...res]) {
      if (s.rooms.length < 2 || s.type !== 'w') continue;
      const pair = s.rooms.map(r => r.id).sort().join('|'); if (done.has(pair)) continue;
      if (explicitOpen.some(g => sameLine(g, s.l, 0.05) && g.b > s.a && g.a < s.b)) { done.add(pair); continue; }
      if (s.b - s.a < 1.2) continue;
      done.add(pair); const m = (s.a + s.b) / 2;
      res = cut(res, { ...s.l, a: m - 0.45, b: m + 0.45 }, null);
    }
  }
  for (const g of explicitOpen) res = cut(res, g, null);
  // windows: given ones (a list, empty = none), or one in the middle of each long outer wall
  if (Array.isArray(house.windows) || house.windows === 'none') { for (const w of arr(Array.isArray(house.windows) ? house.windows : [])) { const g = segLine(w); if (g) res = cut(res, g, 'win'); } }
  else for (const s of [...res]) {
    if (s.type !== 'w' || s.rooms.length !== 1 || s.b - s.a < 2.6) continue;
    const m = (s.a + s.b) / 2, half = Math.min(1.0, (s.b - s.a) * 0.22);
    res = cut(res, { ...s.l, a: m - half, b: m + half }, 'win');
  }
  return res.filter(s => s.b - s.a > E).map(s => [...onLine(s.l, s.a), ...onLine(s.l, s.b), s.type]);
}

// cuts gaps into wall segments [x1, z1, x2, z2, type, level, …] where the gap segments [x1, z1, x2, z2, level] lie on them
export function cutWalls(walls, gaps) {
  let out = walls;
  for (const q of gaps) {
    const g = lineOf(q[0], q[1], q[2], q[3]); if (!g) continue;
    const next = [];
    for (const w of out) {
      const l = lineOf(w[0], w[1], w[2], w[3]);
      if (!l || w[5] !== q[4] || !sameLine(l, g) || l.b <= g.a + 1e-3 || l.a >= g.b - 1e-3) { next.push(w); continue; }
      const seg = (p, r) => [...onLine(l, p), ...onLine(l, r), ...w.slice(4)];
      if (l.a < g.a - 1e-3) next.push(seg(l.a, g.a));
      if (l.b > g.b + 1e-3) next.push(seg(g.b, l.b));
    }
    out = next;
  }
  return out;
}

// Cuts gaps [x1, z1, x2, z2, level] out of the wall pieces that run along them, also when the wall is bent (cut into
// short pieces) and the gap is a straight line between two points on it: a piece within `tol` of the gap and running
// its way (within 60°) loses the stretch that lies beside the gap. A gap without a level cuts every floor.
export function cutNear(walls, gaps, tol = 0.35) {
  let out = walls;
  for (const q of gaps) {
    const gx = q[2] - q[0], gz = q[3] - q[1], gl = Math.hypot(gx, gz); if (gl < 0.05) continue;
    const ux = gx / gl, uz = gz / gl, next = [];
    for (const w of out) {
      if (q[4] != null && w[5] != null && w[5] !== q[4]) { next.push(w); continue; }
      const [x1, z1, x2, z2] = w, L = Math.hypot(x2 - x1, z2 - z1);
      const ta = (x1 - q[0]) * ux + (z1 - q[1]) * uz, tb = (x2 - q[0]) * ux + (z2 - q[1]) * uz;
      const da = Math.abs(-(x1 - q[0]) * uz + (z1 - q[1]) * ux), db = Math.abs(-(x2 - q[0]) * uz + (z2 - q[1]) * ux);
      if (L < 1e-6 || Math.max(da, db) > tol || Math.abs(tb - ta) < L * 0.5 || Math.max(ta, tb) <= 1e-3 || Math.min(ta, tb) >= gl - 1e-3) { next.push(w); continue; }
      const at = t => (t - ta) / (tb - ta), pt = s => [rnd4(x1 + (x2 - x1) * s), rnd4(z1 + (z2 - z1) * s)];
      const s0 = at(0), s1 = at(gl), lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      if (lo > 1e-3) next.push([...pt(0), ...pt(Math.min(1, lo)), ...w.slice(4)]);
      if (hi < 1 - 1e-3) next.push([...pt(Math.max(0, hi)), ...pt(1), ...w.slice(4)]);
    }
    out = next.filter(w => Math.hypot(w[2] - w[0], w[3] - w[1]) > 0.02);
  }
  return out;
}

// separate walls (`extra_walls`): {from, to, type: wall | half | glass, height, bow, level} or [x1, z1, x2, z2]; a bent
// one is cut into short straight pieces. → [x1, z1, x2, z2, type, level, {h}] with type w / half / glass
export function extraWalls(list) {
  const out = [];
  for (const w of arr(list)) {
    const o = Array.isArray(w) ? { from: [w[0], w[1]], to: [w[2], w[3]], level: w[4] } : (w || {});
    const a = o.from, b = o.to; if (!a || !b || [a[0], a[1], b[0], b[1]].some(v => v == null || isNaN(Number(v)))) continue;
    const A = a.map(Number), B = b.map(Number), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.05) continue;
    const type = { half: 'half', glass: 'glass', low: 'half' }[o.type] || 'w', bow = num(o.bow, 0);
    const pts = [A, ...(bow ? bendEdge(A, B, bow, [(B[1] - A[1]) / L, -(B[0] - A[0]) / L]) : []), B];
    for (let i = 0; i + 1 < pts.length; i++) out.push([rnd4(pts[i][0]), rnd4(pts[i][1]), rnd4(pts[i + 1][0]), rnd4(pts[i + 1][1]), type, o.level, { h: o.height != null ? num(o.height, null) : null, bent: !!bow }]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the full model                                                       */
/* ------------------------------------------------------------------ */
// A config typed by hand can hold anything: empty list items, text where numbers go, a list where one item goes. This
// keeps what can be used and drops what can't (it never adds anything), so one bad line can't stop the whole card.
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = v => v !== '' && v != null && isFinite(Number(v));
const segOk = q => Array.isArray(q) && q.length >= 4 && q.slice(0, 4).every(isNum);
const ptOk = q => Array.isArray(q) && q.length >= 2 && isNum(q[0]) && isNum(q[1]);
const entOk = e => (typeof e === 'string' && e.includes('.')) || (isObj(e) && typeof (e.entity || e.id) === 'string');
export function cleanConfig(cfg) {
  if (!isObj(cfg)) return {};
  const c = { ...cfg };
  if (c.names !== undefined && !isObj(c.names)) delete c.names;
  if (c.panels !== undefined && !isObj(c.panels)) delete c.panels;
  if (isObj(c.panels)) {
    c.panels = { ...c.panels };
    for (const [k, v] of Object.entries(c.panels)) {
      if (v !== false && !isObj(v)) { delete c.panels[k]; continue; } // `true`, text or a list: as if not set
      if (!isObj(v)) continue;
      const o = c.panels[k] = { ...v };
      for (const [kk, vv] of Object.entries(o)) if (Array.isArray(vv)) o[kk] = vv.filter(x => x != null && x !== '' && (typeof x !== 'object' || isObj(x)));
    }
  }
  if (!isObj(c.house)) { if (c.house !== undefined) delete c.house; return c; }
  const H = c.house = { ...c.house };
  const objs = k => { if (H[k] !== undefined) H[k] = arr(H[k]).filter(isObj); };
  const segs = k => { if (Array.isArray(H[k])) H[k] = H[k].filter(segOk); else if (H[k] !== undefined && H[k] !== 'none' && H[k] !== 'auto') delete H[k]; };
  objs('doors'); objs('lock_badges'); objs('door_info'); objs('levels'); objs('furniture');
  segs('openings'); segs('windows');
  if (H.walls !== undefined) H.walls = arr(H.walls).filter(segOk);
  if (H.extra_walls !== undefined) H.extra_walls = arr(H.extra_walls).filter(w => segOk(w) || (isObj(w) && ptOk(w.from) && ptOk(w.to)));
  H.doors = H.doors?.filter(d => ptOk(d.from) || (isNum(d.x) && isNum(d.z)));
  if (!H.doors) delete H.doors;
  H.lock_badges = H.lock_badges?.filter(b => isNum(b.x) && isNum(b.z));
  if (!H.lock_badges) delete H.lock_badges;
  if (H.rooms !== undefined) H.rooms = arr(H.rooms).filter(isObj).map(r => {
    const o = { ...r };
    if (o.rects !== undefined) o.rects = arr(o.rects).filter(segOk);
    if (o.points !== undefined) o.points = arr(o.points).filter(ptOk);
    if (Array.isArray(o.furniture)) o.furniture = o.furniture.filter(f => isObj(f) && typeof (f.type ?? 'box') === 'string');
    for (const k of ['names', 'light_names', 'motion_names', 'light_fx']) if (o[k] !== undefined && !isObj(o[k])) delete o[k];
    for (const k of ['lights', 'motion', 'doors', 'locks', 'plugs', 'entities', 'color_lights', 'simple_lights']) if (o[k] != null) o[k] = arr(o[k]).filter(entOk);
    for (const k of ['temperature', 'humidity', 'climate', 'fan', 'media']) if (o[k] != null && o[k] !== false && typeof o[k] !== 'string') delete o[k];
    if (o.level != null && !isNum(o.level)) delete o.level;
    return o;
  });
  return c;
}

const MODE_ICON = { scene: 'mdi:palette', script: 'mdi:script-text-play', automation: 'mdi:robot', input_boolean: 'mdi:toggle-switch-outline', switch: 'mdi:toggle-switch-outline', light: 'mdi:lightbulb', fan: 'mdi:fan', input_button: 'mdi:gesture-tap-button', button: 'mdi:gesture-tap-button' };
export function buildModel(cfg = {}, hass) {
  cfg = cleanConfig(cfg);
  const R = registry(hass);
  const house = cfg.house || {};
  const states = R.states;
  const first = (domain, pred = () => true) => Object.keys(states).find(id => id.startsWith(domain + '.') && R.visible(id) && pred(id)) || null;
  const allOf = (domain, pred = () => true) => Object.keys(states).filter(id => id.startsWith(domain + '.') && R.visible(id) && pred(id));

  /* ---------- rooms ---------- */
  let rawRooms = arr(house.rooms);
  const auto = !rawRooms.length && house.type !== 'gltf';
  if (auto) rawRooms = autoRooms(R, house);
  const rooms = rawRooms.map((rc, i) => {
    const name = rc.name || R.areas[rc.area]?.name || `Room ${i + 1}`;
    // an outline (`points`) wins over rectangles; its rectangles are only a rough fill for furniture and lights
    const poly = roomOutline(rc);
    const rects = poly ? polyRects(poly) : arr(rc.rects || (rc.rect ? [rc.rect] : [])).map(r => r.map(Number));
    const found = rc.area ? discoverRoom(R, rc.area) : {};
    const pick = (k, key) => (rc[k] !== undefined ? rc[k] : found[key ?? k]);
    const lightFx = rc.light_fx || rc.lightFx || null;
    const lvl = rc.level != null && rc.level !== '' && !isNaN(Number(rc.level)) ? Number(rc.level) : 0;
    const r = {
      id: roomIdOf(rc, i, R), name, area: rc.area || null, icon: rc.icon || (rc.stairs ? 'mdi:stairs' : roomIcon(name)), level: lvl, ci: auto ? null : i, stairs: rc.stairs ?? null,
      rects, poly: poly || undefined, floorRects: rc.floor_rects || rc.floorRects || undefined, floor: rc.floor || roomFloor(String(name).toLowerCase()),
      outdoor: rc.outdoor ?? isOutdoor(name), anchor: rc.anchor || undefined,
      lights: arr(pick('lights')), temp: pick('temperature', 'temp') || null, hum: pick('humidity', 'hum') || null,
      motion: arr(pick('motion')), doors: arr(pick('doors')), locks: arr(pick('locks')),
      climate: pick('climate') || null, fan: pick('fan') || null, count: rc.count || null,
      plugs: arr(rc.plugs !== undefined ? rc.plugs : found.plugs).map(p => typeof p === 'string' ? { id: p, name: rc.names?.[p] || R.name(p), icon: 'mdi:power-socket-eu', power: R.sameDevice(p, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null } : { icon: 'mdi:power-socket-eu', ...p, name: rc.names?.[p.id || p.entity] || p.name }),
      media: rc.media !== undefined ? rc.media : found.media || null,
      // names for this card only (`names`, and the older `light_names` for lights)
      names: { ...(rc.light_names || rc.lightNames || {}), ...(rc.names || {}) },
      lightFx: lightFx || undefined, lightNames: { ...(rc.light_names || rc.lightNames || {}), ...(rc.names || {}) },
      motionNames: { ...(rc.names || {}), ...(rc.motion_names || rc.motionNames || {}) }, stripSides: rc.strip_sides ?? rc.stripSides, stripMode: rc.strip_mode || rc.stripMode || 'full',
      tvGlow: rc.tv_glow || rc.tvGlow || undefined, colorLights: arr(rc.color_lights || rc.colorLights),
      simpleLights: arr(rc.simple_lights || rc.simpleLights), labelY: rc.label_height, zoom: rc.zoom,
      ac: rc.ac, auto: !!rc.auto, furniture: rc.furniture,
      // anything else to show in the room popup ("Other"): `entity_id` or {entity, name, icon}
      entities: arr(rc.entities !== undefined ? rc.entities : found.entities).map(e => (typeof e === 'string' ? { id: e } : { id: e.entity || e.id, name: e.name, icon: e.icon })).filter(e => e.id),
    };
    return r;
  }).filter(r => r.rects.length);
  // every room needs its own id: two rooms on the same area or with the same name get "_2", "_3"… (otherwise the second
  // one takes the first one's label, popup and lights in the 3D view)
  const seenIds = new Set();
  for (const r of rooms) { let id = r.id, n = 2; while (seenIds.has(id)) id = `${r.id}_${n++}`; r.id = id; seenIds.add(id); }

  /* ---------- normalise coordinates so the plan starts at (0,0) ---------- */
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const r of rooms) for (const [x1, z1, x2, z2] of [...r.rects, ...(r.poly || []).map(([x, z]) => [x, z, x, z])]) { minx = Math.min(minx, x1, x2); minz = Math.min(minz, z1, z2); maxx = Math.max(maxx, x1, x2); maxz = Math.max(maxz, z1, z2); }
  if (!isFinite(minx)) { minx = 0; minz = 0; maxx = 10; maxz = 8; }
  const ox = minx, oz = minz;
  const sx = x => Number(x) - ox, sz = z => Number(z) - oz;
  const shiftRect = ([x1, z1, x2, z2]) => [sx(Math.min(x1, x2)), sz(Math.min(z1, z2)), sx(Math.max(x1, x2)), sz(Math.max(z1, z2))];
  for (const r of rooms) {
    r.rects = r.rects.map(shiftRect);
    if (r.poly) r.poly = r.poly.map(([x, z]) => [rnd4(sx(x)), rnd4(sz(z))]);
    if (r.floorRects) r.floorRects = r.floorRects.map(shiftRect);
    if (r.anchor) r.anchor = [sx(r.anchor[0]), sz(r.anchor[1])];
    if (r.tvGlow) r.tvGlow = { ...r.tvGlow, x: sx(r.tvGlow.x), z: sz(r.tvGlow.z) };
    if (r.ac && typeof r.ac === 'object') r.ac = { ...r.ac, x: sx(r.ac.x), z: sz(r.ac.z) };
  }
  const W = maxx - minx, D = maxz - minz;
  const roomAt = (x, z, l) => rooms.find(r => (l == null || r.level === l) && (r.poly ? inPoly(x, z, r.poly) : r.rects.some(([a, b, c, d]) => x >= a - 0.05 && x <= c + 0.05 && z >= b - 0.05 && z <= d + 0.05)))?.id || null;

  /* AC units: given position, or on the room's first wall facing in */
  for (const r of rooms) {
    if (!r.climate || r.ac === false) { if (r.ac === false) delete r.ac; continue; }
    if (!r.ac || r.ac === 'auto' || r.ac === true) { const [x1, z1, x2] = r.rects[0]; r.ac = { x: (x1 + x2) / 2, z: z1 + 0.14, dx: 0, dz: 1 }; }
  }

  /* ---------- floors (levels) ---------- */
  const levelIds = [...new Set(rooms.map(r => r.level))].sort((x, y) => x - y);
  if (!levelIds.length) levelIds.push(0);
  const lvOf = v => (v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : levelIds.includes(0) ? 0 : levelIds[0]);
  const flv = floorLevels(R);
  const levels = levelIds.map(l => {
    const given = arr(house.levels).find(x => Number(x.level) === l);
    const haFloor = Object.values(R.floors).find(f => flv[f.floor_id] === l && rooms.some(r => r.level === l && R.areas[r.area]?.floor_id === f.floor_id));
    return { level: l, name: given?.name || haFloor?.name || (l === 0 ? 'Ground floor' : l < 0 ? (l === -1 ? 'Basement' : `Basement ${-l}`) : `Floor ${l}`), icon: given?.icon || haFloor?.icon || null };
  });

  // the lines walls stand on, per floor (room edges or your own walls, and separate walls), in any direction
  const customWalls = Array.isArray(house.walls) && house.walls.length ? house.walls.map(([x1, z1, x2, z2, t, l]) => [sx(x1), sz(z1), sx(x2), sz(z2), t || 'w', lvOf(l)]) : null;
  const extra = extraWalls(house.extra_walls).map(([x1, z1, x2, z2, t, l, o]) => [rnd4(sx(x1)), rnd4(sz(z1)), rnd4(sx(x2)), rnd4(sz(z2)), t, lvOf(l), o]);
  const wallLines = l => [...(customWalls ? customWalls.filter(q => q[5] === l) : rooms.filter(r => r.level === l).flatMap(roomEdges)), ...extra.filter(q => q[5] === l)]
    .map(q => lineOf(q[0], q[1], q[2], q[3])).filter(Boolean);

  /* ---------- doors: a leaf that swings open with its contact sensor (or stays shut without one) ---------- */
  const doors = arr(house.doors).map(d => {
    const from = d.from || [d.x, d.z], to = d.to;
    if (from[0] == null || from[1] == null) return null;
    let axis = d.axis || 'x', dir = d.dir ?? 1, w = num(d.width ?? d.w, 0.9);
    let x = sx(from[0]), z = sz(from[1]);
    // the leaf runs from `from` towards `to`: along x or z, or slanted (on an angled wall)
    let vx = axis === 'x' ? dir : 0, vz = axis === 'z' ? dir : 0;
    if (to) { const ex = sx(to[0]) - x, ez = sz(to[1]) - z; w = Math.hypot(ex, ez) || w; vx = ex / w; vz = ez / w; }
    const level = lvOf(d.level);
    // a door placed a little off its wall (typed by hand, drawn on another grid) goes onto the nearest wall line within
    // 0.4 m, so it cuts its gap and isn't hidden inside the wall
    const me = lineOf(x, z, x + vx * w, z + vz * w);
    let best = null;
    for (const l of wallLines(level)) {
      if (Math.abs(Math.sin(l.ang - me.ang)) > 0.09) continue; // not the same direction (within ~5°)
      const t0 = x * l.dx + z * l.dz, t1 = t0 + (vx * l.dx + vz * l.dz) * w;
      if (Math.max(t0, t1) < l.a + 0.05 || Math.min(t0, t1) > l.b - 0.05) continue;
      const dist = Math.abs(-x * l.dz + z * l.dx - l.c); if (dist <= 0.4 && (!best || dist < best[0])) best = [dist, l];
    }
    if (best) {
      const l = best[1], t0 = x * l.dx + z * l.dz, s = Math.sign(vx * l.dx + vz * l.dz) || 1;
      [x, z] = onLine(l, t0); vx = l.dx * s; vz = l.dz * s;
    }
    if (Math.abs(vz) < 1e-6) { axis = 'x'; dir = vx >= 0 ? 1 : -1; } else if (Math.abs(vx) < 1e-6) { axis = 'z'; dir = vz >= 0 ? 1 : -1; } else axis = 'a';
    return { id: d.entity || d.id || null, x, z, axis, dir, w, vx, vz, side: d.side ?? 1, main: !!d.main, level,
      seg: [x, z, rnd4(x + vx * w), rnd4(z + vz * w)] };
  }).filter(Boolean);

  /* ---------- walls, per floor ---------- */
  // segments carry their floor as a 5th item: [x1, z1, x2, z2, level]
  const segLv = q => lvOf(q[4]);
  const shiftQ = ([a, b2, c, d]) => [sx(a), sz(b2), sx(c), sz(d)];
  let walls;
  // your own walls: doors and openings cut them too
  const gaps = [...arr(house.openings).map(q => [...shiftQ(q), segLv(q)]), ...doors.map(d => [...d.seg, d.level])];
  if (customWalls) walls = cutWalls(customWalls, gaps);
  else {
    walls = [];
    for (const l of levelIds) {
      const rs = rooms.filter(r => r.level === l); if (!rs.length) continue;
      const wins = Array.isArray(house.windows) ? house.windows.filter(q => segLv(q) === l).map(shiftQ) : null;
      walls.push(...wallsFromRooms(rs, {
        ...house,
        // between two rooms there is a wall until you add a door or an opening (automatic doorways only for the automatic house)
        doorways: house.doorways ?? (auto ? 'auto' : 'none'),
        openings: [...arr(house.openings).filter(q => segLv(q) === l).map(shiftQ), ...doors.filter(d => d.level === l).map(d => d.seg)],
        windows: wins ? (wins.length ? wins : 'none') : house.windows,
      }).map(q => [...q, l]));
    }
  }
  // separate walls stand on top of these; doors and openings cut them too
  walls.push(...cutWalls(extra, gaps));
  // …and on bent walls (room outlines or separate walls), where a gap is a straight line between two points of the arc
  walls = cutNear(walls, gaps);

  const doorInfo = {};
  for (const d of arr(house.door_info)) if (d.entity) doorInfo[d.entity] = { name: d.name || R.name(d.entity), timeout: d.timeout };

  /* ---------- furniture ---------- */
  const shiftF = f => {
    const o = { ...f, type: String(f.type || 'box').toLowerCase() };
    for (const k of ['x', 'x0', 'x1']) if (o[k] != null) o[k] = sx(o[k]);
    for (const k of ['z', 'z0', 'z1']) if (o[k] != null) o[k] = sz(o[k]);
    if (o.from) { o.x0 = sx(o.from[0]); o.z0 = sz(o.from[1]); }
    if (o.to) { o.x1 = sx(o.to[0]); o.z1 = sz(o.to[1]); }
    // centre + size → extents for the extent-based pieces
    if (['sofa', 'block', 'stairs', 'counter'].includes(o.type) && o.x0 == null && o.x != null) { o.x0 = o.x - num(o.w, 1) / 2; o.x1 = o.x + num(o.w, 1) / 2; o.z0 = o.z - num(o.d, 1) / 2; o.z1 = o.z + num(o.d, 1) / 2; }
    if (!o.room) { const px = o.x ?? ((o.x0 + o.x1) / 2), pz = o.z ?? ((o.z0 + o.z1) / 2); o.room = roomAt(px, pz, f.level != null ? lvOf(f.level) : null); }
    for (const k of ['color', 'cushion', 'pillow', 'top', 'leg', 'frame', 'duvet', 'headboard', 'seat', 'emissive', 'shade']) if (o[k] != null) o[k] = toColor(o[k], undefined);
    o.entities = furnEntities(f);
    return o;
  };
  // `src` says where a piece is in the config (so the 3D view can move it): {house: i} or {room: room index, i}
  let furniture = arr(house.furniture).map((f, i) => ({ ...shiftF(f), src: { house: i } }));
  for (const r of rooms) {
    if (Array.isArray(r.furniture)) furniture.push(...r.furniture.map((f, i) => ({ ...shiftF({ room: r.id, ...f }), src: r.ci != null ? { room: r.ci, i } : null })));
    else if ((auto || r.auto || house.auto_furniture) && r.furniture !== false) furniture.push(...autoFurniture(r));
    // stairs: rooms marked `stairs`, or named "Stairs" / "Staircase", get a flight of stairs
    if (r.furniture !== false && r.stairs !== false && (r.stairs || /stair/i.test(r.name)) && !furniture.some(f => f.room === r.id && f.type === 'stairs')) furniture.push(stairsFor(r));
  }
  // a flight going down needs a hole in the floor: the room's floor leaves out the stairwell
  const minus = ([a, b, c, d], [p, q, u, v]) => {
    if (u <= a || p >= c || v <= b || q >= d) return [[a, b, c, d]];
    const out = [], qq = Math.max(b, q), vv = Math.min(d, v);
    if (q > b) out.push([a, b, c, q]); if (v < d) out.push([a, v, c, d]);
    if (p > a) out.push([a, qq, p, vv]); if (u < c) out.push([u, qq, c, vv]);
    return out.filter(([x1, z1, x2, z2]) => x2 - x1 > 0.02 && z2 - z1 > 0.02);
  };
  // stairs and the floors: with several floors, stairs not set by hand go up from the lowest floor, down from the top
  // one, and both ways in between. With one floor (a flat in a building) they go both ways.
  const lvRoom = Object.fromEntries(rooms.map(r => [r.id, r.level]));
  for (const f of furniture) {
    if (f.type !== 'stairs' || !f.byFloors || levelIds.length < 2) continue;
    const l = lvRoom[f.room] ?? lvOf(f.level);
    f.mode = l <= levelIds[0] ? 'up' : l >= levelIds[levelIds.length - 1] ? 'down' : 'split';
  }
  for (const f of furniture) {
    if (f.type !== 'stairs' || !['down', 'split'].includes(f.mode) || !f.room) continue;
    const r = rooms.find(x => x.id === f.room); if (!r) continue;
    const x0 = num(f.x0, 0), z0 = num(f.z0, 0), x1 = num(f.x1, 2), z1 = num(f.z1, 1), alongX = (f.axis || 'x') === 'x';
    // split: the second half across the flight goes down
    const well = f.mode === 'down' ? [x0, z0, x1, z1] : alongX ? [x0, (z0 + z1) / 2, x1, z1] : [(x0 + x1) / 2, z0, x1, z1];
    if (r.poly) (r.holes ||= []).push(well); // an outline: the 3D view cuts the hole out of it
    else r.floorRects = (r.floorRects || r.rects).flatMap(q => minus(q, well));
    f.well = well;
  }
  // Two sofas at a right angle whose ends overlap make one corner (L-shaped) sofa: the one along x keeps the corner
  // seat, the other stops at its edge, neither has an arm at the joint, and the corner gets a back on the outer side.
  const sofas = furniture.filter(f => f.type === 'sofa' && f.x0 != null && f.z0 != null);
  const ext = f => [Math.min(f.x0, f.x1), Math.min(f.z0, f.z1), Math.max(f.x0, f.x1), Math.max(f.z0, f.z1)];
  const dropArm = (f, end) => { const a = f.arms || 'both'; f.arms = a === 'both' ? (end === 'start' ? 'end' : 'start') : a === end ? 'none' : a; };
  for (const A of sofas) for (const B of sofas) {
    if (A === B || A.room !== B.room || A.lJoin || B.lJoin) continue;
    const ah = ['n', 's'].includes(A.back || 'n'), bh = ['n', 's'].includes(B.back || 'n'); if (!ah || bh) continue; // A along x, B along z
    const a = ext(A), b = ext(B), ox0 = Math.max(a[0], b[0]), oz0 = Math.max(a[1], b[1]), ox1 = Math.min(a[2], b[2]), oz1 = Math.min(a[3], b[3]);
    if (ox1 - ox0 < 0.05 || oz1 - oz0 < 0.05) continue; // they don't overlap
    const aEnd = (ox0 + ox1) / 2 < (a[0] + a[2]) / 2 ? 'start' : 'end', bTop = (oz0 + oz1) / 2 < (b[1] + b[3]) / 2;
    dropArm(A, aEnd); dropArm(B, bTop ? 'start' : 'end');
    // B stops where A's seat ends (on the side away from A's back)
    if (bTop) { B.z0 = Math.min(a[3], b[3] - 0.3); B.z1 = b[3]; } else { B.z1 = Math.max(a[1], b[1] + 0.3); B.z0 = b[1]; }
    B.x0 = b[0]; B.x1 = b[2]; A.x0 = a[0]; A.x1 = a[2]; A.z0 = a[1]; A.z1 = a[3];
    // the corner's outer side gets a back when B's back is on that side
    if ((aEnd === 'start' && (B.back || 'n') === 'w') || (aEnd === 'end' && B.back === 'e')) A.cornerBack = aEnd;
    A.lJoin = B.lJoin = true;
  }
  // Two counters (or cabinets) at a right angle whose ends overlap make one corner counter: the one along x keeps the
  // corner, the other starts at its edge, so their tops don't overlap. Counters of a different height or level stay apart.
  const blocks = furniture.filter(f => ['block', 'counter'].includes(f.type) && f.x0 != null && f.z0 != null);
  for (const A of blocks) for (const B of blocks) {
    if (A === B || A.room !== B.room || B.cJoin) continue;
    if (Math.abs(num(A.h, 0.9) - num(B.h, 0.9)) > 0.02 || Math.abs(num(A.y, 0) - num(B.y, 0)) > 0.02) continue;
    const a = ext(A), b = ext(B); if (a[2] - a[0] < a[3] - a[1] || b[2] - b[0] >= b[3] - b[1]) continue; // A along x, B along z
    const ox0 = Math.max(a[0], b[0]), oz0 = Math.max(a[1], b[1]), ox1 = Math.min(a[2], b[2]), oz1 = Math.min(a[3], b[3]);
    if (ox1 - ox0 < 0.05 || oz1 - oz0 < 0.05) continue;
    const bTop = (oz0 + oz1) / 2 < (b[1] + b[3]) / 2;
    if (bTop) { B.z0 = Math.min(a[3], b[3] - 0.1); B.z1 = b[3]; } else { B.z1 = Math.max(a[1], b[1] + 0.1); B.z0 = b[1]; }
    B.x0 = b[0]; B.x1 = b[2]; B.cJoin = true;
  }
  // every piece gets its index (the 3D view and the popup refer to it), its floor and its linked entities
  const lvOfRoom = Object.fromEntries(rooms.map(r => [r.id, r.level]));
  // a flight of stairs stays within the wall height (a cut-away house has low walls)
  const wallH = num(house.wall_height, 1.35);
  for (const f of furniture) if (f.type === 'stairs' && f.rise == null) f.rise = Math.min(0.13, (wallH * 0.92) / num(f.steps, 10));
  furniture.forEach((f, i) => { f.idx = i; f.level = f.room ? lvOfRoom[f.room] ?? lvOf(f.level) : lvOf(f.level); if (!Array.isArray(f.entities)) f.entities = furnEntities(f); });
  for (const r of rooms) r.furnEnts = furniture.filter(f => f.room === r.id).flatMap(f => f.entities);
  // lock badges float in 3D with their name above them (`name`, else the lock's name; `label: false` hides it); `i` is
  // the badge's place in the config, so the 3D view can rename it
  const badges = arr(house.lock_badges).map((b, i) => ({ lock: b.lock || b.entity, x: sx(b.x), z: sz(b.z), y: num(b.y, 1.0), axis: b.axis || 'z', level: lvOf(b.level), name: b.name || null, label: b.label !== false, i })).filter(b => b.lock);

  /* ---------- entity map ---------- */
  const P = cfg.panels || {};
  const panel = k => P[k] !== false;
  const sec = typeof P.security === 'object' ? P.security : {};
  // A panel with several fields: pick any of them yourself and only what you picked shows — the fields you left empty
  // stay empty instead of being found on their own. Pick none and they are all found as before.
  const given = (o, keys) => !!o && typeof o === 'object' && keys.some(k => o[k] != null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length));
  const secOwn = given(sec, ['alarm', 'locks', 'doors', 'cameras', 'entrances']);
  const persons = P.people === false ? [] : cfg.persons ? arr(cfg.persons).filter(p => typeof p === 'string') : allOf('person');
  // phone panel per person: the mobile_app device behind one of the person's trackers, and what `people` sets for the
  // person: {name, tracker, battery, charging, location, ringer, wifi, entities: [...], buttons: [...]} (each one given
  // wins over what is found; `false` hides that row)
  const phones = {}, people = cfg.people && typeof cfg.people === 'object' ? cfg.people : {};
  for (const p of persons) {
    const o = people[p] && typeof people[p] === 'object' ? people[p] : {};
    // pick any of the phone's rows yourself and only what you picked shows (nothing else is found); pick none and
    // they are all found on the person's phone
    const own = ['tracker', 'battery', 'charging', 'location', 'ringer', 'wifi'].some(k => o[k]);
    const trk = own ? o.tracker || null : arr(states[p]?.attributes?.device_trackers).find(t => R.platform(t) === 'mobile_app');
    if (!trk && !Object.keys(o).length) continue;
    const on = (pred) => (trk ? R.sameDevice(trk, pred)[0] || null : null);
    const pick = (k, found) => (own ? o[k] || null : o[k] === false ? null : found);
    phones[p] = {
      name: o.name || (trk && (R.devs[R.ents[trk]?.device_id]?.name_by_user || R.devs[R.ents[trk]?.device_id]?.name || R.name(trk))) || R.name(p), tracker: trk || null,
      battery: pick('battery', on(e => /battery_level$/.test(e))), charging: pick('charging', on(e => /is_charging$/.test(e) || (e.startsWith('binary_sensor.') && R.dc(e) === 'battery_charging'))),
      location: pick('location', on(e => /geocoded_location$/.test(e))), ringer: pick('ringer', on(e => /ringer_mode$/.test(e))), wifi: pick('wifi', on(e => /wi_fi_connection$|wifi_connection$/.test(e))),
      entities: arr(o.entities).filter(e => typeof e === 'string'),
      buttons: arr(o.buttons).map(b => (typeof b === 'string' ? { entity: b } : b)).filter(b => typeof b?.entity === 'string')
        .map(b => [b.entity, b.name || null, b.icon || states[b.entity]?.attributes?.icon || null]), // no icon: the card picks one from the name
    };
  }
  const roomOfEntity = id => rooms.find(r => r.climate === id || r.lights.includes(id) || r.locks.includes(id))?.id || null;
  const climates = arr(P.climate?.entities).length ? arr(P.climate.entities) : allOf('climate');
  const acs = climates.map(id => ({
    id, name: R.name(id), room: roomOfEntity(id),
    power: R.sameDevice(id, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null,
  }));
  // locks: `entity_id` or {entity, name, kind, icon}. The kind (what is locked) picks the icon: door, sliding door, gate,
  // garage, window, safe, car, locker, else a padlock. Not given: guessed from the lock's id and name.
  const LOCK_ICON = { door: 'mdi:door-closed', sliding: 'mdi:door-sliding', gate: 'mdi:gate', garage: 'mdi:garage', window: 'mdi:window-closed-variant', safe: 'mdi:safe', car: 'mdi:car', locker: 'mdi:locker', padlock: null };
  const lockKind = (id, name) => { const t = `${id} ${name}`.toLowerCase(); return /garage/.test(t) ? 'garage' : /sliding|patio/.test(t) ? 'sliding' : /gate/.test(t) ? 'gate' : /window/.test(t) ? 'window' : /safe\b|vault/.test(t) ? 'safe' : /\bcar\b|vehicle|tesla/.test(t) ? 'car' : /locker|cabinet|drawer|box/.test(t) ? 'locker' : /door|front|back|entr|deadbolt|porch|main/.test(t) ? 'door' : 'padlock'; };
  const lockList = (sec.locks ? arr(sec.locks) : secOwn ? [] : allOf('lock')).map(l => (typeof l === 'string' ? { entity: l } : l)).filter(l => l?.entity || l?.id).map(l => {
    const id = l.entity || l.id, name = l.name || R.name(id), kind = LOCK_ICON[l.kind] !== undefined ? l.kind : lockKind(id, name);
    // a plain padlock unless you ask for what it locks (`kind`) or an icon of your own
    return { id, name, kind, icon: l.icon || (l.kind ? LOCK_ICON[l.kind] : null) || null };
  });
  // entrances next to the locks: gates, garage doors, barriers, shutters. A cover opens / closes itself; a relay
  // (switch / button / script) is pulsed and an optional `sensor` says whether it is open. Not given: every cover that is a
  // garage door or a gate. The older single `gate: {relay, sensor, name}` is kept as one of them.
  const ENT_ICON = { garage: ['mdi:garage', 'mdi:garage-open'], gate: ['mdi:gate', 'mdi:gate-open'], door: ['mdi:door-closed', 'mdi:door-open'], shutter: ['mdi:window-shutter', 'mdi:window-shutter-open'], barrier: ['mdi:boom-gate', 'mdi:boom-gate-up'] };
  const kindOf = (id, name) => { const t = `${R.dc(id) || ''} ${id} ${name}`.toLowerCase(); return /garage/.test(t) ? 'garage' : /barrier|boom/.test(t) ? 'barrier' : /shutter|rolling|blind/.test(t) ? 'shutter' : /gate/.test(t) ? 'gate' : /door/.test(t) ? 'door' : 'gate'; };
  const entranceList = [...(sec.entrances !== undefined ? arr(sec.entrances) : P.security === false || secOwn ? [] : allOf('cover', id => ['garage', 'gate'].includes(R.dc(id)))), ...(sec.gate?.relay ? [{ entity: sec.gate.relay, sensor: sec.gate.sensor, name: sec.gate.name || 'Gate', kind: 'gate' }] : [])]
    .map(e => (typeof e === 'string' ? { entity: e } : e)).filter(e => e?.entity || e?.id).map(e => {
      const id = e.entity || e.id, name = e.name || R.name(id), kind = e.kind || e.type || kindOf(e.sensor || id, name);
      const own = !e.kind && !e.type && states[id]?.attributes?.icon; // an icon set on the entity in Home Assistant
      // `sensor`: one or more entities that tell open / closed (contact sensor, Frigate state classification, …): the
      // first one with a clear reading wins; `open_states` / `closed_states`: words of your own for a text sensor
      const sensors = arr(e.sensor).concat(arr(e.sensor_2)).filter(x => typeof x === 'string' && x.includes('.'));
      return { id, name, cfgName: e.name || null, sensor: sensors[0] || null, sensors, openWords: arr(e.open_states).map(x => String(x).toLowerCase()), closedWords: arr(e.closed_states).map(x => String(x).toLowerCase()), kind, icons: e.icon ? [e.icon, e.icon] : own ? [own, own] : ENT_ICON[kind] || ENT_ICON.gate, cover: id.startsWith('cover.') };
    });
  const doorList = (sec.doors ? arr(sec.doors) : secOwn ? [] : allOf('binary_sensor', id => ['door', 'garage_door'].includes(R.dc(id)))).slice(0, 24)
    .map(d => typeof d === 'string' ? { id: d, name: R.name(d) } : { id: d.entity || d.id, name: d.name || R.name(d.entity || d.id), open: d.open_state });
  const camList = (P.security === false ? [] : sec.cameras ? arr(sec.cameras) : secOwn ? [] : allOf('camera')).map(c => { // Security off: its cameras too
    const id = typeof c === 'string' ? c : c.entity || c.id;
    const obj = id.split('.')[1].replace(/_(rtsp|stream|main|sub|high|low)$/, '');
    const ex = s => states[`binary_sensor.${obj}_${s}`] ? `binary_sensor.${obj}_${s}` : null;
    return { id, name: (typeof c === 'object' && c.name) || R.name(id), person: c.person || ex('person_occupancy'), car: c.car || ex('car_occupancy'), motion: c.motion || ex('motion'), face: c.face, plate: c.plate, door: c.door, relay: c.relay };
  });

  // Proxmox VE (custom integration "proxmoxve"): the first node
  const pveNode = (Object.keys(states).map(id => id.match(/^sensor\.node_(.+)_cpu_used$/)).find(m => m && R.platform(m[0]) === 'proxmoxve') || [])[1]
    || (Object.keys(states).map(id => id.match(/^sensor\.node_(.+)_cpu_used$/)).find(Boolean) || [])[1];
  const lab = pveNode ? {
    node: pveNode, status: `binary_sensor.node_${pveNode}_status`, cpu: `sensor.node_${pveNode}_cpu_used`, mem: `sensor.node_${pveNode}_memory_used_percentage`,
    disk: `sensor.node_${pveNode}_disk_used_percentage`, cts: `sensor.node_${pveNode}_containers_running`, vms: `sensor.node_${pveNode}_virtual_machines_running`,
    updates: `sensor.node_${pveNode}_total_updates`, swap: `sensor.node_${pveNode}_swap_used_percentage`, swapUsed: `sensor.node_${pveNode}_swap_used`,
    swapTotal: `sensor.node_${pveNode}_swap_total`, update: `update.node_${pveNode}_software_update`, temp: P.homelab?.temperature || null,
    guests: arr(P.homelab?.pinned).map(g => typeof g === 'string' ? [g, null, null] : [g.key, g.name, g.icon]),
  } : { guests: [] };

  // media server: Jellyfin / Sonarr / Radarr / qBittorrent are found by their integration
  const plat = (p, re) => R.ofPlatform(p, re)[0] || null;
  const MS = P.media_server || {};
  const mserver = {
    jellyfin: { clients: plat('jellyfin', /_active_clients$/), tv: MS.jellyfin_tv || null },
    sonarr: { upcoming: plat('sonarr', /_upcoming$/), wanted: plat('sonarr', /_wanted$/), queue: plat('sonarr', /^sensor\..*_queue$/), shows: plat('sonarr', /_shows$/), disk: plat('sonarr', /_disk_space/), cal: plat('sonarr', /^calendar\./) },
    radarr: { movies: plat('radarr', /_movies$/), queue: plat('radarr', /^sensor\..*_queue$/), health: plat('radarr', /^binary_sensor\..*_health$/), disk: plat('radarr', /_disk_space/), cal: plat('radarr', /^calendar\./) },
    qbt: {
      down: plat('qbittorrent', /_download_speed$/), up: plat('qbittorrent', /_upload_speed$/), status: plat('qbittorrent', /_status$/), conn: plat('qbittorrent', /_connection_status$/),
      active: plat('qbittorrent', /_active_torrents$/), all: plat('qbittorrent', /_all_torrents$/), errored: plat('qbittorrent', /_errored_torrents$/), ratio: plat('qbittorrent', /_global_ratio$/),
      alt: plat('qbittorrent', /^switch\..*_alternative_speed$/),
    },
  };
  const hasMS = !!(mserver.jellyfin.clients || R.ofPlatform('jellyfin', /^media_player\./).length || mserver.sonarr.upcoming || mserver.radarr.movies || mserver.qbt.down);

  // solar forecast (Forecast.Solar)
  const fs = re => plat('forecast_solar', re);
  const forecast = { today: fs(/energy_production_today$/), remaining: fs(/energy_production_today_remaining$/), tomorrow: fs(/energy_production_tomorrow$/), peak: fs(/power_highest_peak_time_today$/) };

  const media = P.media || {};
  const tvPlayer = media.player || (given(media, ['speakers']) ? null : first('media_player', id => R.dc(id) === 'tv')) || null;
  const W2 = P.water || {};
  const IR = P.irrigation || {};
  const irrGiven = IR.zones ?? IR.valves;
  const irrZones = (irrGiven !== undefined ? arr(irrGiven) : P.irrigation === false || given(IR, ['interval', 'weekday', 'tomorrow', 'next', 'notification', 'time']) ? [] : allOf('valve').map(entity => ({ entity, auto: true })))
    .map(z => (typeof z === 'string' ? { entity: z } : z)).filter(z => z?.entity);
  const CAR = P.car || {};
  const EN = P.energy || {};
  const AT = P.attention || {};

  // one row of the Devices panel: the device's name and kind (phone, tablet, watch, laptop…), charging, where it is
  function batDevice(d) {
    const id = d.battery, dev = R.devs[R.ents[id]?.device_id];
    const ch = d.charging || d.charging_state ? null : R.sameDevice(id, e => /is_charging$|battery_state$|charger_type$/.test(e) || (e.startsWith('binary_sensor.') && R.dc(e) === 'battery_charging'))[0];
    const dn = d.name || dev?.name_by_user || dev?.name || R.name(id).replace(/\s*battery( level)?$/i, '');
    const kind = `${dn} ${dev?.model || ''}`.toLowerCase();
    const icon = d.icon || (/watch/.test(kind) ? 'mdi:watch' : /pad|tab/.test(kind) ? 'mdi:tablet' : /mac|book|laptop|pc\b/.test(kind) ? 'mdi:laptop' : /lock/.test(kind) ? 'mdi:lock' : /remote/.test(kind) ? 'mdi:remote' : R.platform(id) === 'mobile_app' || /phone|pixel|galaxy/.test(kind) ? 'mdi:cellphone' : 'mdi:battery');
    return { name: dn, icon, bat: id, chg: d.charging || (ch && ch.startsWith('binary_sensor.') ? ch : undefined), chgState: d.charging_state || (ch && ch.startsWith('sensor.') ? ch : undefined), trk: d.tracker || R.sameDevice(id, e => e.startsWith('device_tracker.'))[0] };
  }
  const E = {
    weather: cfg.weather || first('weather'), sun: 'sun.sun',
    persons, phones,
    alarm: sec.alarm || (secOwn ? null : first('alarm_control_panel')),
    locks: lockList,
    entrances: entranceList,
    gate: sec.gate ? { name: sec.gate.name || 'Gate', relay: sec.gate.relay, sensor: sec.gate.sensor } : { name: 'Gate', relay: null, sensor: null },
    doors: doorList,
    acs,
    alerts: {
      unavailDomains: arr(AT.unavailable_domains || ['light', 'switch', 'lock', 'climate', 'cover', 'fan']),
      unavailPlatforms: arr(AT.unavailable_integrations), excludeDevices: arr(AT.exclude_devices), excludeEntities: arr(AT.exclude_entities),
      batteryMax: num(AT.battery_threshold, 15), batteryExcludeDevices: arr(AT.battery_exclude_devices), batteryExclude: arr(AT.battery_exclude),
      batteryExtra: AT.battery_extra || {}, rssiMin: num(AT.wifi_threshold, -75), tunnels: AT.tunnels !== false,
    },
    ehist: { gridIn: null, gridOut: null, solar: null, devices: arr(EN.devices).map(d => [d.entity, d.name, d.icon || 'mdi:flash', d.color || '#38bdf8', d.max_kwh_per_hour]) },
    energy: {
      grid: EN.grid_power || null, solar: EN.solar_power || null, current: EN.current || null,
      monthly: EN.month_sensor || null, yearly: EN.year_sensor || null, stored: EN.stored_sensor || null,
      consumers: arr(EN.consumers).map(c => [c.entity, c.name || R.name(c.entity), c.icon || 'mdi:flash']),
      extra: arr(EN.extra).map(c => ({ id: c.entity, name: c.name || R.name(c.entity), icon: c.icon || 'mdi:flash' })),
      exclude: arr(EN.exclude),
    },
    // pumps: `entity_id` or {entity, name, power, timer}; their power sensor is found on the same device when not given.
    // entities: anything else for the Water card (valves, flow and pressure sensors, …)
    water: {
      tank: W2.tank || null, quality: W2.quality || null, temp: W2.temperature || null,
      pumps: arr(W2.pumps).map(p => (typeof p === 'string' ? { entity: p } : p)).filter(p => p?.entity).map(p => ({ id: p.entity, name: p.name || R.name(p.entity), power: p.power || R.sameDevice(p.entity, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null, info: p.info || p.timer || null, confirm: p.confirm !== false })),
      entities: arr(W2.entities).map(e => (typeof e === 'string' ? { id: e } : { id: e.entity || e.id, name: e.name, icon: e.icon })).filter(e => e.id),
    },
    car: {
      charging: CAR.charging || null, power: CAR.power || null, time: CAR.time || null, perCharge: CAR.energy_per_charge || null, costCharge: CAR.cost_per_charge || null,
      month: CAR.energy_month || null, costMonth: CAR.cost_month || null, year: CAR.energy_year || null, costYear: CAR.cost_year || null, parking: CAR.status || null,
      battery: CAR.battery || null, range: CAR.range || null, name: CAR.name || null, color: CAR.color || null,
    },
    cameras: camList,
    media: {
      tv: tvPlayer, shield: null, echoes: arr(media.speakers),
      ytTimer: media.watch_timer || null, ytLimit: media.watch_limit || null, ytSelect: media.limit_select || null,
      ytBlock: media.block_switch || null, ytForce: media.unblock_switch || null,
    },
    mserver,
    lab,
    // Devices panel: battery level sensors (`entity_id`, or {battery, name, icon, charging, charging_state, tracker}); for
    // a plain id the device's name, its charging sensor and its location tracker are found on the same device
    devices: arr(P.devices?.entities || cfg.devices).filter(d => typeof d === 'string' || (d && typeof d.battery === 'string')).map(d => batDevice(typeof d === 'string' ? { battery: d } : d)),
    irrigation: {
      // zones: `entity_id` or {entity, name, duration}; `valves` is the same list. Not given: every valve entity.
      valves: irrZones.map((z, i) => [z.entity, z.name || (z.auto ? R.name(z.entity) : null) || R.name(z.entity) || `Zone ${i + 1}`]), durations: irrZones.map(z => z.duration || null),
      every: IR.interval || null, day: IR.weekday || null, tomorrow: IR.tomorrow || null, next: IR.next || null, notify: IR.notification || null, time: IR.time || null,
    },
    // modes on the Home tab: switches, helpers, scenes, scripts, automations; `entity_id` or {entity, name, icon}
    modes: P.modes === false ? [] : arr(cfg.modes).map(m => (typeof m === 'string' ? { entity: m } : m)).filter(m => typeof m?.entity === 'string' && m.entity.includes('.'))
      .map(m => [m.entity, m.name || null, m.icon || states[m.entity]?.attributes?.icon || MODE_ICON[m.entity.split('.')[0]] || 'mdi:toggle-switch-outline']),
    face: sec.face || null,
    forecast,
    tvLight: { light: P.tv_light?.light || null, selects: arr(P.tv_light?.selects).map(s => typeof s === 'string' ? [s, R.name(s), 'mdi:tune'] : [s.entity, s.name || R.name(s.entity), s.icon || 'mdi:tune']) },
  };
  if (!E.devices.length && (P.devices === undefined || P.devices === true || (typeof P.devices === 'object' && !arr(P.devices.entities).length))) {
    // phones / tablets / watches: battery level sensors of the Companion app
    E.devices = allOf('sensor', id => R.platform(id) === 'mobile_app' && /battery_level$/.test(id)).map(id => batDevice({ battery: id }));
  }

  /* ---------- which tabs have something to show ---------- */
  const has = {
    security: panel('security') && !!(E.alarm || E.locks.length || E.doors.length || E.cameras.length || E.gate.relay || E.entrances.length),
    climate: panel('climate') && !!(E.acs.length || rooms.some(r => r.temp)),
    energy: panel('energy'),
    water: !!(E.water.tank || E.water.pumps.length || E.water.entities.length || E.irrigation.valves.length),
    media: (panel('media') && !!(E.media.tv || E.tvLight.light)) || (panel('media_server') && hasMS),
    system: panel('system'),
  };

  return {
    E, rooms, walls, doors, doorInfo, furniture, badges, levels,
    plan: { W, D, CX: W / 2, CZ: D / 2 },
    wallH: num(house.wall_height, 1.35),
    title: cfg.title || 'My Home', auto, has, hasMS,
    gltf: house.type === 'gltf' ? { url: house.url, scale: num(house.scale, 1), rotation: num(house.rotation, 0), offset: house.offset || [0, 0, 0], rooms: house.mesh_rooms || {} } : null,
    tabsOrder: arr(cfg.tabs),
    startTab: cfg.start_tab || 'home',
  };
}
