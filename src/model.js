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
  charger: ['Phone charger', 'mdi:cellphone-charging'], stairs: ['Stairs', 'mdi:stairs'], blinds: ['Blinds', 'mdi:blinds'], vacuum: ['Robot vacuum', 'mdi:robot-vacuum'] };

const ROOM_ICONS = [[/stair/, 'mdi:stairs'], [/living|lounge|family|salon/, 'mdi:sofa'], [/kitchen/, 'mdi:countertop'], [/dining/, 'mdi:table-chair'],
  [/master|bedroom|bed room|guest room|room/, 'mdi:bed'], [/bath|toilet|wc|shower/, 'mdi:shower'], [/office|study|work/, 'mdi:desk'],
  [/garage/, 'mdi:garage'], [/garden|yard|patio|terrace|balcony|outside|outdoor/, 'mdi:flower'], [/hall|corridor|entry|entrance|landing/, 'mdi:door-open'],
  [/stair/, 'mdi:stairs'], [/laundry|utility/, 'mdi:washing-machine'], [/kid|child|nursery|play/, 'mdi:teddy-bear'], [/basement|cellar|storage/, 'mdi:archive']];
const roomIcon = n => (ROOM_ICONS.find(([re]) => re.test(String(n).toLowerCase())) || [0, 'mdi:home-outline'])[1];
const roomFloor = n => /bath|toilet|wc|shower|kitchen|laundry/.test(n) ? 'tile' : /bed|kid|nursery/.test(n) ? 'carpet' : /garage|garden|yard|patio|terrace|balcony|outside|outdoor/.test(n) ? 'stone' : /living|dining|lounge|office|study/.test(n) ? 'wood' : 'marble';
const isOutdoor = n => /garden|yard|patio|terrace|balcony|outside|outdoor/.test(String(n).toLowerCase());

/* ------------------------------------------------------------------ */
/* automatic house: one box per HA area, laid out on a grid             */
/* ------------------------------------------------------------------ */
function autoRooms(R, cfg) {
  const floorLevel = a => areaLevel(R, a) ?? 0;
  let ids = Object.keys(R.areas);
  if (cfg.areas) ids = arr(cfg.areas).filter(a => R.areas[a]);
  else ids = ids.filter(a => (R.byArea[a] || []).length); // areas with something in them
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
  const [x1, z1, x2, z2] = room.rects[0], o = typeof room.stairs === 'object' ? room.stairs : {};
  const alongX = o.axis ? o.axis === 'x' : x2 - x1 >= z2 - z1, len = alongX ? x2 - x1 : z2 - z1;
  // on an upper floor the stairwell goes down (to the floor below); on the lowest floor it goes up
  return { type: 'stairs', room: room.id, x0: x1 + 0.08, z0: z1 + 0.08, x1: x2 - 0.08, z1: z2 - 0.08, axis: alongX ? 'x' : 'z', mode: o.mode || ((room.level ?? 0) > 0 ? 'down' : 'up'), steps: o.steps || Math.max(4, Math.min(16, Math.round(len / 0.28))) };
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
  } else if (/garden|yard|patio|terrace|balcony/.test(n)) {
    f.push({ type: 'plant', room: R, x: x1 + 0.6, z: z1 + 0.6, size: 1 }, { type: 'plant', room: R, x: x2 - 0.6, z: z1 + 0.6, size: 0.9 });
    f.push({ type: 'table', room: R, x: cx, z: cz, w: 0.8, d: 0.8, h: 0.72, top: 0xf1f5f9, leg: 0x94a3b8 });
  } else if (/stair/.test(n)) {
    f.push(stairsFor(room));
  } else if (/garage/.test(n)) {
    f.push({ type: 'box', room: R, x: cx, z: cz, w: Math.min(1.8, w * 0.5), d: Math.min(4.2, d * 0.8), h: 1.2, color: 0x334155 });
  }
  return f;
}

// The automatic set for one room config, written the way YAML writes furniture (from / to corners, #hex colours),
// so the card editor can turn it into pieces the user can move and change.
export function autoFurnitureConfig(rc, name) {
  const rects = arr(rc.rects || (rc.rect ? [rc.rect] : [])); if (!rects.length) return [];
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
/* walls from room rectangles                                          */
/* ------------------------------------------------------------------ */
// Every room edge becomes wall; an edge shared by two rooms becomes one inner wall. Outdoor-only edges become
// railings. Optional: openings (gaps), windows, open_plan (room pairs with no wall), automatic doorways / windows.
export function wallsFromRooms(rooms, house = {}) {
  const E = 1e-3, key = v => Math.round(v * 1000) / 1000;
  const lines = new Map(); // "h:z" or "v:x" → [{a,b,room}]
  for (const r of rooms) for (const [x1, z1, x2, z2] of r.rects) {
    for (const [o, c, a, b] of [['h', z1, x1, x2], ['h', z2, x1, x2], ['v', x1, z1, z2], ['v', x2, z1, z2]]) {
      const k = o + ':' + key(c); (lines.get(k) || lines.set(k, []).get(k)).push({ a: Math.min(a, b), b: Math.max(a, b), room: r });
    }
  }
  const openPlan = arr(house.open_plan).map(p => arr(p).map(String));
  const isOpen = (r1, r2) => openPlan.some(p => p.includes(r1.id) && p.includes(r2.id));
  const segs = [];
  for (const [k, list] of lines) {
    const [o, cs] = k.split(':'); const c = Number(cs);
    const pts = [...new Set(list.flatMap(s => [key(s.a), key(s.b)]))].sort((x, y) => x - y);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; if (b - a < E) continue;
      const on = list.filter(s => s.a <= a + E && s.b >= b - E).map(s => s.room);
      const uniq = [...new Set(on)];
      let type = 'w';
      if (uniq.length >= 2) {
        if (uniq.every(r => r.outdoor)) continue;
        if (isOpen(uniq[0], uniq[1])) continue;
        type = 'w';
      } else if (uniq[0]?.outdoor) type = 'rail';
      segs.push({ o, c, a, b, type, rooms: uniq });
    }
  }
  // merge neighbours of the same type and room set
  segs.sort((s, t) => (s.o + s.c).localeCompare(t.o + t.c) || s.c - t.c || s.a - t.a);
  const merged = [];
  for (const s of segs) {
    const m = merged[merged.length - 1];
    if (m && m.o === s.o && Math.abs(m.c - s.c) < E && Math.abs(m.b - s.a) < E && m.type === s.type && m.rooms.map(r => r.id).join() === s.rooms.map(r => r.id).join()) m.b = s.b;
    else merged.push({ ...s });
  }
  const cut = (list, o, c, a, b, type) => { // replace [a,b] on line (o,c) with `type` (null = gap)
    const out = [];
    for (const s of list) {
      if (s.o !== o || Math.abs(s.c - c) > 0.02 || s.b <= a + E || s.a >= b - E) { out.push(s); continue; }
      if (s.a < a - E) out.push({ ...s, b: a });
      if (type) out.push({ ...s, a: Math.max(a, s.a), b: Math.min(b, s.b), type });
      if (s.b > b + E) out.push({ ...s, a: b });
    }
    return out;
  };
  let res = merged;
  const seg2 = ([x1, z1, x2, z2]) => Math.abs(z1 - z2) < E ? ['h', z1, Math.min(x1, x2), Math.max(x1, x2)] : ['v', x1, Math.min(z1, z2), Math.max(z1, z2)];
  // automatic doorways: a 0.9 m gap in the middle of each wall shared by two indoor rooms (unless an opening is given there)
  const explicitOpen = arr(house.openings).map(seg2);
  if (house.doorways !== 'none' && house.doorways !== false) {
    const done = new Set();
    for (const s of [...res]) {
      if (s.rooms.length < 2 || s.type !== 'w') continue;
      const pair = s.rooms.map(r => r.id).sort().join('|'); if (done.has(pair)) continue;
      if (explicitOpen.some(([o, c, a, b]) => o === s.o && Math.abs(c - s.c) < 0.05 && b > s.a && a < s.b)) { done.add(pair); continue; }
      if (s.b - s.a < 1.2) continue;
      done.add(pair); const m = (s.a + s.b) / 2;
      res = cut(res, s.o, s.c, m - 0.45, m + 0.45, null);
    }
  }
  for (const [o, c, a, b] of explicitOpen) res = cut(res, o, c, a, b, null);
  // windows: given ones, or one in the middle of each long outer wall
  const wins = arr(house.windows);
  if (wins.length || house.windows === 'none') for (const w of wins) { const [o, c, a, b] = seg2(w); res = cut(res, o, c, a, b, 'win'); }
  else for (const s of [...res]) {
    if (s.type !== 'w' || s.rooms.length !== 1 || s.b - s.a < 2.6) continue;
    const m = (s.a + s.b) / 2, half = Math.min(1.0, (s.b - s.a) * 0.22);
    res = cut(res, s.o, s.c, m - half, m + half, 'win');
  }
  return res.filter(s => s.b - s.a > E).map(s => s.o === 'h' ? [s.a, s.c, s.b, s.c, s.type] : [s.c, s.a, s.c, s.b, s.type]);
}

/* ------------------------------------------------------------------ */
/* the full model                                                       */
/* ------------------------------------------------------------------ */
export function buildModel(cfg = {}, hass) {
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
    const rects = arr(rc.rects || (rc.rect ? [rc.rect] : [])).map(r => r.map(Number));
    const found = rc.area ? discoverRoom(R, rc.area) : {};
    const pick = (k, key) => (rc[k] !== undefined ? rc[k] : found[key ?? k]);
    const lightFx = rc.light_fx || rc.lightFx || null;
    const lvl = rc.level != null && rc.level !== '' && !isNaN(Number(rc.level)) ? Number(rc.level) : 0;
    const r = {
      id: roomIdOf(rc, i, R), name, area: rc.area || null, icon: rc.icon || (rc.stairs ? 'mdi:stairs' : roomIcon(name)), level: lvl, ci: auto ? null : i, stairs: rc.stairs || false,
      rects, floorRects: rc.floor_rects || rc.floorRects || undefined, floor: rc.floor || roomFloor(String(name).toLowerCase()),
      outdoor: rc.outdoor ?? isOutdoor(name), anchor: rc.anchor || undefined,
      lights: arr(pick('lights')), temp: pick('temperature', 'temp') || null, hum: pick('humidity', 'hum') || null,
      motion: arr(pick('motion')), doors: arr(pick('doors')), locks: arr(pick('locks')),
      climate: pick('climate') || null, fan: pick('fan') || null, count: rc.count || null,
      plugs: arr(rc.plugs !== undefined ? rc.plugs : found.plugs).map(p => typeof p === 'string' ? { id: p, name: R.name(p), icon: 'mdi:power-socket-eu', power: R.sameDevice(p, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null } : { icon: 'mdi:power-socket-eu', ...p }),
      media: rc.media !== undefined ? rc.media : found.media || null,
      lightFx: lightFx || undefined, lightNames: rc.light_names || rc.lightNames || undefined,
      motionNames: rc.motion_names || rc.motionNames || undefined, stripSides: rc.strip_sides ?? rc.stripSides,
      tvGlow: rc.tv_glow || rc.tvGlow || undefined, colorLights: arr(rc.color_lights || rc.colorLights),
      simpleLights: arr(rc.simple_lights || rc.simpleLights), labelY: rc.label_height, zoom: rc.zoom,
      ac: rc.ac, auto: !!rc.auto, furniture: rc.furniture,
      // anything else to show in the room popup ("Other"): `entity_id` or {entity, name, icon}
      entities: arr(rc.entities !== undefined ? rc.entities : found.entities).map(e => (typeof e === 'string' ? { id: e } : { id: e.entity || e.id, name: e.name, icon: e.icon })).filter(e => e.id),
    };
    return r;
  }).filter(r => r.rects.length);

  /* ---------- normalise coordinates so the plan starts at (0,0) ---------- */
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const r of rooms) for (const [x1, z1, x2, z2] of r.rects) { minx = Math.min(minx, x1, x2); minz = Math.min(minz, z1, z2); maxx = Math.max(maxx, x1, x2); maxz = Math.max(maxz, z1, z2); }
  if (!isFinite(minx)) { minx = 0; minz = 0; maxx = 10; maxz = 8; }
  const ox = minx, oz = minz;
  const sx = x => Number(x) - ox, sz = z => Number(z) - oz;
  const shiftRect = ([x1, z1, x2, z2]) => [sx(Math.min(x1, x2)), sz(Math.min(z1, z2)), sx(Math.max(x1, x2)), sz(Math.max(z1, z2))];
  for (const r of rooms) {
    r.rects = r.rects.map(shiftRect);
    if (r.floorRects) r.floorRects = r.floorRects.map(shiftRect);
    if (r.anchor) r.anchor = [sx(r.anchor[0]), sz(r.anchor[1])];
    if (r.tvGlow) r.tvGlow = { ...r.tvGlow, x: sx(r.tvGlow.x), z: sz(r.tvGlow.z) };
    if (r.ac && typeof r.ac === 'object') r.ac = { ...r.ac, x: sx(r.ac.x), z: sz(r.ac.z) };
  }
  const W = maxx - minx, D = maxz - minz;
  const roomAt = (x, z, l) => rooms.find(r => (l == null || r.level === l) && r.rects.some(([a, b, c, d]) => x >= a - 0.05 && x <= c + 0.05 && z >= b - 0.05 && z <= d + 0.05))?.id || null;

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

  /* ---------- doors: a leaf that swings open with its contact sensor (or stays shut without one) ---------- */
  const doors = arr(house.doors).map(d => {
    const from = d.from || [d.x, d.z], to = d.to;
    if (from[0] == null || from[1] == null) return null;
    let axis = d.axis, dir = d.dir, w = d.width ?? d.w;
    if (to) { axis = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]) ? 'x' : 'z'; dir = (axis === 'x' ? to[0] - from[0] : to[1] - from[1]) >= 0 ? 1 : -1; w = Math.hypot(to[0] - from[0], to[1] - from[1]); }
    axis = axis || 'x'; dir = dir ?? 1; w = num(w, 0.9);
    const x = sx(from[0]), z = sz(from[1]);
    return { id: d.entity || d.id || null, x, z, axis, dir, w, side: d.side ?? 1, main: !!d.main, level: lvOf(d.level),
      seg: axis === 'x' ? [x, z, x + dir * w, z] : [x, z, x, z + dir * w] };
  }).filter(Boolean);

  /* ---------- walls, per floor ---------- */
  // segments carry their floor as a 5th item: [x1, z1, x2, z2, level]
  const segLv = q => lvOf(q[4]);
  const shiftQ = ([a, b2, c, d]) => [sx(a), sz(b2), sx(c), sz(d)];
  let walls;
  if (Array.isArray(house.walls) && house.walls.length) walls = house.walls.map(([x1, z1, x2, z2, t, l]) => [sx(x1), sz(z1), sx(x2), sz(z2), t || 'w', lvOf(l)]);
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
    if (r.furniture !== false && (r.stairs || /stair/i.test(r.name)) && !furniture.some(f => f.room === r.id && f.type === 'stairs')) furniture.push(stairsFor(r));
  }
  // every piece gets its index (the 3D view and the popup refer to it), its floor and its linked entities
  const lvOfRoom = Object.fromEntries(rooms.map(r => [r.id, r.level]));
  // a flight of stairs stays within the wall height (a cut-away house has low walls)
  const wallH = num(house.wall_height, 1.35);
  for (const f of furniture) if (f.type === 'stairs' && f.rise == null) f.rise = Math.min(0.13, (wallH * 0.92) / num(f.steps, 10));
  furniture.forEach((f, i) => { f.idx = i; f.level = f.room ? lvOfRoom[f.room] ?? lvOf(f.level) : lvOf(f.level); if (!Array.isArray(f.entities)) f.entities = furnEntities(f); });
  for (const r of rooms) r.furnEnts = furniture.filter(f => f.room === r.id).flatMap(f => f.entities);
  const badges = arr(house.lock_badges).map(b => ({ lock: b.lock || b.entity, x: sx(b.x), z: sz(b.z), y: num(b.y, 1.0), axis: b.axis || 'z', level: lvOf(b.level) })).filter(b => b.lock);

  /* ---------- entity map ---------- */
  const P = cfg.panels || {};
  const panel = k => P[k] !== false;
  const sec = typeof P.security === 'object' ? P.security : {};
  const persons = cfg.persons ? arr(cfg.persons) : allOf('person');
  // phone panel per person: the mobile_app device behind one of the person's trackers
  const phones = {};
  for (const p of persons) {
    const trk = arr(states[p]?.attributes?.device_trackers).find(t => R.platform(t) === 'mobile_app');
    if (!trk) continue;
    const on = (pred) => R.sameDevice(trk, pred)[0] || null;
    phones[p] = {
      name: R.devs[R.ents[trk]?.device_id]?.name_by_user || R.devs[R.ents[trk]?.device_id]?.name || R.name(trk), tracker: trk,
      battery: on(e => /battery_level$/.test(e)), charging: on(e => /is_charging$/.test(e) || (e.startsWith('binary_sensor.') && R.dc(e) === 'battery_charging')),
      location: on(e => /geocoded_location$/.test(e)), ringer: on(e => /ringer_mode$/.test(e)), wifi: on(e => /wi_fi_connection$|wifi_connection$/.test(e)),
      buttons: [],
    };
  }
  const roomOfEntity = id => rooms.find(r => r.climate === id || r.lights.includes(id) || r.locks.includes(id))?.id || null;
  const climates = arr(P.climate?.entities).length ? arr(P.climate.entities) : allOf('climate');
  const acs = climates.map(id => ({
    id, name: R.name(id), room: roomOfEntity(id),
    power: R.sameDevice(id, e => e.startsWith('sensor.') && R.dc(e) === 'power')[0] || null,
  }));
  const lockList = (sec.locks ? arr(sec.locks) : allOf('lock')).map(l => typeof l === 'string' ? { id: l, name: R.name(l) } : { id: l.entity || l.id, name: l.name || R.name(l.entity || l.id) });
  const doorList = (sec.doors ? arr(sec.doors) : allOf('binary_sensor', id => ['door', 'garage_door'].includes(R.dc(id)))).slice(0, 24)
    .map(d => typeof d === 'string' ? { id: d, name: R.name(d) } : { id: d.entity || d.id, name: d.name || R.name(d.entity || d.id), open: d.open_state });
  const camList = (sec.cameras ? arr(sec.cameras) : allOf('camera')).map(c => {
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
  const tvPlayer = media.player || first('media_player', id => R.dc(id) === 'tv') || null;
  const W2 = P.water || {};
  const IR = P.irrigation || {};
  const CAR = P.car || {};
  const EN = P.energy || {};
  const AT = P.attention || {};

  const E = {
    weather: cfg.weather || first('weather'), sun: 'sun.sun',
    persons, phones,
    alarm: sec.alarm || first('alarm_control_panel'),
    locks: lockList,
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
    water: { tank: W2.tank || null, quality: W2.quality || null, temp: W2.temperature || null, pumps: arr(W2.pumps).map(p => ({ id: p.entity, name: p.name || R.name(p.entity), power: p.power || null, info: p.info || p.timer || null, confirm: p.confirm !== false })) },
    car: {
      charging: CAR.charging || null, power: CAR.power || null, time: CAR.time || null, perCharge: CAR.energy_per_charge || null, costCharge: CAR.cost_per_charge || null,
      month: CAR.energy_month || null, costMonth: CAR.cost_month || null, year: CAR.energy_year || null, costYear: CAR.cost_year || null, parking: CAR.status || null,
    },
    cameras: camList,
    media: {
      tv: tvPlayer, shield: null, echoes: arr(media.speakers),
      ytTimer: media.watch_timer || null, ytLimit: media.watch_limit || null, ytSelect: media.limit_select || null,
      ytBlock: media.block_switch || null, ytForce: media.unblock_switch || null,
    },
    mserver,
    lab,
    devices: arr(P.devices?.entities || cfg.devices).map(d => typeof d === 'string' ? { name: R.name(d).replace(/\s*battery( level)?$/i, ''), icon: 'mdi:cellphone', bat: d } : { name: d.name, icon: d.icon || 'mdi:cellphone', bat: d.battery, chg: d.charging, trk: d.tracker, chgState: d.charging_state }),
    irrigation: {
      valves: arr(IR.zones).map((z, i) => [z.entity, z.name || `Zone ${i + 1}`]), durations: arr(IR.zones).map(z => z.duration || null),
      every: IR.interval || null, day: IR.weekday || null, tomorrow: IR.tomorrow || null, next: IR.next || null, notify: IR.notification || null, time: IR.time || null,
    },
    modes: arr(cfg.modes).map(m => typeof m === 'string' ? [m, R.name(m), states[m]?.attributes?.icon || 'mdi:toggle-switch-outline'] : [m.entity, m.name || R.name(m.entity), m.icon || 'mdi:toggle-switch-outline']),
    face: sec.face || null,
    forecast,
    tvLight: { light: P.tv_light?.light || null, selects: arr(P.tv_light?.selects).map(s => typeof s === 'string' ? [s, R.name(s), 'mdi:tune'] : [s.entity, s.name || R.name(s.entity), s.icon || 'mdi:tune']) },
  };
  if (!E.devices.length && (P.devices === undefined || P.devices === true)) {
    // phones / tablets / watches: battery level sensors of the Companion app
    E.devices = allOf('sensor', id => R.platform(id) === 'mobile_app' && /battery_level$/.test(id)).map(id => {
      const ch = R.sameDevice(id, e => /is_charging$/.test(e) || /battery_state$/.test(e))[0];
      const trk = R.sameDevice(id, e => e.startsWith('device_tracker.'))[0];
      const dn = R.devs[R.ents[id]?.device_id]?.name_by_user || R.devs[R.ents[id]?.device_id]?.name || R.name(id);
      return { name: dn, icon: /watch/i.test(dn) ? 'mdi:watch' : /pad|tab/i.test(dn) ? 'mdi:tablet' : 'mdi:cellphone', bat: id, chg: ch && ch.startsWith('binary_sensor.') ? ch : undefined, chgState: ch && ch.startsWith('sensor.') ? ch : undefined, trk };
    });
  }

  /* ---------- which tabs have something to show ---------- */
  const has = {
    security: panel('security') && !!(E.alarm || E.locks.length || E.doors.length || E.cameras.length || E.gate.relay),
    climate: panel('climate') && !!(E.acs.length || rooms.some(r => r.temp)),
    energy: panel('energy'),
    water: !!(E.water.tank || E.water.pumps.length || E.irrigation.valves.length),
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
