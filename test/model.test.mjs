// Model tests: run with `node test/model.test.mjs` (part of `npm test`). No browser needed.
import assert from 'node:assert/strict';
import { zigbeeModel, zbStatus, zbSummary, zbSource, zbConfig, ieeeKey, z2mMap, zbRoute } from '../src/zigbee.js';
import { VIEW_MODES, CARD_ORDER, tankRate } from '../src/model.js';
import { buildModel, roleOf, registry, autoFurnitureConfig, furnEntities, floorLevels, roomOutline, polyRects, extraWalls, cleanConfig } from '../src/model.js';
// is there a wall running beside the middle part of segment g (within 0.3 m, roughly its direction)?
const wallBeside = (walls, [x1, z1, x2, z2], lvl = 0) => { const gx = x2 - x1, gz = z2 - z1, gl = Math.hypot(gx, gz); return [0.4, 0.5, 0.6].some(f => { const px = x1 + gx * f, pz = z1 + gz * f; return walls.some(w => { if ((w[5] ?? 0) !== lvl) return false; const dx = w[2] - w[0], dz = w[3] - w[1], L = Math.hypot(dx, dz); if (!L || Math.abs(dx * gx + dz * gz) / (L * gl) < 0.5) return false; const t = Math.max(0, Math.min(1, ((px - w[0]) * dx + (pz - w[1]) * dz) / (L * L))); return Math.hypot(w[0] + t * dx - px, w[1] + t * dz - pz) < 0.2; }); }); };

let failed = 0;
const test = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message); } };

const st = (state, attributes = {}) => ({ state, attributes });
const hass = {
  states: {
    'light.living': st('on'), 'light.bed': st('off'), 'light.office': st('on'),
    'sensor.living_temp': st('22', { device_class: 'temperature' }), 'cover.blinds': st('open', { current_position: 30 }),
    'switch.outlet': st('on', { device_class: 'outlet' }), 'switch.kettle': st('off'), 'binary_sensor.door': st('off', { device_class: 'door' }),
  },
  entities: {
    'light.living': { area_id: 'living' }, 'light.bed': { area_id: 'bed' }, 'light.office': { area_id: 'office' },
    'sensor.living_temp': { area_id: 'living' }, 'cover.blinds': { area_id: 'living' }, 'switch.outlet': { area_id: 'living' }, 'switch.kettle': { area_id: 'living' },
  },
  devices: {},
  areas: { living: { area_id: 'living', name: 'Living Room', floor_id: 'g' }, bed: { area_id: 'bed', name: 'Bedroom', floor_id: 'g' }, office: { area_id: 'office', name: 'Office', floor_id: 'up' }, stairs: { area_id: 'stairs', name: 'Stairs', floor_id: 'g' } },
  floors: { g: { floor_id: 'g', name: 'Ground', level: 0 }, up: { floor_id: 'up', name: 'Upstairs', level: 1 } },
};
hass.states['light.stairs'] = st('off'); hass.entities['light.stairs'] = { area_id: 'stairs' };

console.log('model');
test('roles by domain and device class', () => {
  const R = registry(hass);
  assert.equal(roleOf(R, 'light.living'), 'lights');
  assert.equal(roleOf(R, 'sensor.living_temp'), 'temperature');
  assert.equal(roleOf(R, 'switch.outlet'), 'plugs');
  assert.equal(roleOf(R, 'cover.blinds'), 'entities');
});
test('HA floors become levels', () => {
  assert.deepEqual(floorLevels(registry(hass)), { g: 0, up: 1 });
  const m = buildModel({}, hass);
  assert.deepEqual(m.levels.map(l => [l.level, l.name]), [[0, 'Ground'], [1, 'Upstairs']]);
  assert.equal(m.rooms.find(r => r.id === 'office').level, 1);
  assert.ok(m.walls.some(w => w[5] === 1) && m.walls.some(w => w[5] === 0), 'walls on both floors');
});
test('blinds and plain switches of an area go under "Other"', () => {
  const m = buildModel({ house: { rooms: [{ area: 'living', rects: [[0, 0, 4, 4]] }] } }, hass);
  assert.deepEqual(m.rooms[0].entities.map(e => e.id).sort(), ['cover.blinds', 'switch.kettle']);
});
test('drawn rooms: a wall between rooms until a door is added; the door cuts it', () => {
  const rooms = [{ name: 'A', rects: [[0, 0, 4, 4]] }, { name: 'B', rects: [[4, 0, 8, 4]] }];
  const shared = m => m.walls.filter(w => w[0] === 4 && w[2] === 4).map(w => [w[1], w[3]]);
  assert.deepEqual(shared(buildModel({ house: { rooms } }, hass)), [[0, 4]], 'no automatic doorway');
  const m = buildModel({ house: { rooms, doors: [{ from: [4, 1], to: [4, 2] }] } }, hass);
  assert.equal(m.doors.length, 1, 'a door without a sensor is kept');
  assert.equal(m.doors[0].id, null);
  assert.deepEqual(shared(m), [[0, 1], [2, 4]], 'the door makes a gap');
  assert.deepEqual(shared(buildModel({ house: { rooms, doorways: 'auto' } }, hass)), [[0, 1.55], [2.45, 4]], 'doorways: auto still works');
});
test('a door a little off its wall snaps onto it and cuts the gap (also in your own walls)', () => {
  const rooms = [{ name: 'A', rects: [[0, 0, 4, 4]] }, { name: 'B', rects: [[4, 0, 8, 4]] }];
  const m = buildModel({ house: { rooms, doors: [{ from: [4.25, 1], to: [4.25, 2] }, { from: [5, 3.8], to: [6, 3.8] }] } }, hass);
  assert.deepEqual(m.doors.map(d => [d.x, d.z]), [[4, 1], [5, 4]], 'on the wall lines x = 4 and z = 4');
  assert.deepEqual(m.walls.filter(w => w[0] === 4 && w[2] === 4).map(w => [w[1], w[3]]), [[0, 1], [2, 4]]);
  assert.ok(!m.walls.some(w => w[1] === 4 && w[3] === 4 && Math.min(w[0], w[2]) < 6 && Math.max(w[0], w[2]) > 5), 'gap in the outer wall');
  const own = buildModel({ house: { rooms, walls: [[0, 0, 8, 0], [4, 0, 4, 4]], doors: [{ from: [4.1, 1], to: [4.1, 2] }] } }, hass);
  assert.deepEqual(own.walls.filter(w => w[0] === 4 && w[2] === 4).map(w => [w[1], w[3]]), [[0, 1], [2, 4]]);
});
test('stairs follow the floors: up from the lowest, down from the top, both in between; a stairwell for a flight going down', () => {
  const rooms = [{ name: 'Stairs', rects: [[0, 0, 2, 4]] }, { name: 'Hall', stairs: true, level: 1, rects: [[0, 0, 2, 4]] }, { name: 'Loft', stairs: true, level: 2, rects: [[0, 0, 2, 4]] }];
  const m = buildModel({ house: { rooms } }, hass);
  const s = m.furniture.filter(f => f.type === 'stairs');
  assert.deepEqual(s.map(f => [f.room, f.level, f.mode, f.axis]), [['stairs', 0, 'up', 'z'], ['hall', 1, 'split', 'z'], ['loft', 2, 'down', 'z']]);
  assert.ok(s.every(f => f.rise * f.steps <= 1.35), 'within the wall height');
  const area = rs => rs.reduce((a, [x1, z1, x2, z2]) => a + (x2 - x1) * (z2 - z1), 0);
  assert.equal(m.rooms[0].floorRects, undefined, 'up: no hole');
  assert.ok(Math.abs(area(m.rooms[1].floorRects) - (8 - 0.92 * 3.84)) < 1e-6, 'both: a hole for the half that goes down');
  assert.ok(!m.rooms[2].floorRects.some(([x1, z1, x2, z2]) => x1 < 1 && x2 > 1 && z1 < 2 && z2 > 2), 'down: a hole for the whole flight');
  const chosen = buildModel({ house: { rooms: [{ name: 'Stairs', stairs: 'both', rects: [[0, 0, 2, 4]] }, { name: 'Hall', level: 1, rects: [[0, 0, 2, 4]] }] } }, hass);
  assert.equal(chosen.furniture.find(f => f.type === 'stairs').mode, 'split', 'a choice made by hand wins');
});
test('one floor (a flat): stairs go both ways unless set; stairs: false turns them off', () => {
  const m = buildModel({ house: { rooms: [{ name: 'Stairs', rects: [[0, 0, 2, 4]] }, { name: 'Hall', stairs: 'down', rects: [[2, 0, 4, 4]] }] } }, hass);
  assert.deepEqual(m.furniture.filter(f => f.type === 'stairs').map(f => f.mode), ['split', 'down']);
  assert.ok(m.rooms.every(r => r.floorRects), 'a stairwell in both');
  assert.equal(buildModel({ house: { auto_furniture: true, rooms: [{ name: 'Stairs', stairs: false, rects: [[0, 0, 2, 4]] }] } }, hass).furniture.filter(f => f.type === 'stairs').length, 0);
});
test('parking: asphalt floor, a car in the automatic set; cars and garden pieces keep their sensor', () => {
  const m = buildModel({ house: { auto_furniture: true, rooms: [{ name: 'Driveway', rects: [[0, 0, 3, 6]] }, { name: 'Garden', rects: [[3, 0, 9, 6]], furniture: [{ type: 'car', x: 1, z: 1, entity: 'binary_sensor.door', color: '#ff0000' }, { type: 'sprinkler', x: 5, z: 3, entity: 'switch.kettle' }] }] } }, hass);
  assert.equal(m.rooms[0].floor, 'asphalt'); assert.ok(m.rooms[0].outdoor);
  assert.equal(m.furniture.find(f => f.room === 'driveway').type, 'car');
  const car = m.furniture.find(f => f.type === 'car' && f.room === 'garden');
  assert.deepEqual([car.entities, car.color], [['binary_sensor.door'], 0xff0000]);
});
test('an L made of two rectangles has no wall inside; a floor with no windows of its own keeps all its walls', () => {
  const l = buildModel({ house: { rooms: [{ name: 'L', rects: [[0, 0, 4, 2], [0, 2, 2, 4]] }] } }, hass);
  assert.ok(!l.walls.some(w => w[1] === 2 && w[3] === 2 && Math.min(w[0], w[2]) < 2), 'no wall across the L');
  const m = buildModel({ house: { windows: [[0, 0, 1, 0, 1]], rooms: [{ name: 'A', rects: [[0, 0, 4, 4]] }, { name: 'B', level: 1, rects: [[0, 0, 4, 4]] }] } }, hass);
  assert.equal(m.walls.filter(w => w[5] === 0 && w[0] === w[2]).length, 2, 'both side walls on the ground floor');
});
test('outlines: L, slanted and bent edges make walls in any direction; shared edges become one wall', () => {
  const L = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 5], [0, 5]];
  assert.deepEqual(polyRects(L), [[0, 0, 6, 3], [0, 3, 3, 5]], 'an L is two rectangles');
  const m = buildModel({ house: { windows: 'none', rooms: [{ name: 'Living', points: L }, { name: 'Bay', points: [[3, 3], [6, 3], [6, 5], [4, 6], [3, 5]] }] } }, hass);
  assert.equal(m.rooms[0].poly.length, 6);
  const shared = m.walls.filter(w => w[1] === 3 && w[3] === 3 && w[0] >= 3 - 1e-6);
  assert.equal(shared.length, 1, 'one wall between the two rooms');
  assert.ok(m.walls.some(w => Math.abs((w[3] - w[1]) / (w[2] - w[0])) === 0.5), 'a slanted wall');
  const arc = roomOutline({ points: [[0, 0, 1], [4, 0], [4, 4], [0, 4]] });
  assert.ok(arc.length > 8, 'a bent edge is cut into pieces');
  assert.ok(arc.some(([x, z]) => Math.abs(x - 2) < 0.2 && Math.abs(z + 1) < 0.05), 'its middle bows 1 m out of the room');
  const bowed = buildModel({ house: { windows: 'none', rooms: [{ name: 'Round', points: [[0, 0, 1], [4, 0], [4, 4], [0, 4]] }] } }, hass);
  assert.ok(bowed.walls.length > 8);
  assert.equal(bowed.rooms[0].rects.length > 1, true);
});
test('separate walls (full, half, glass, bent) stand on their own and doors cut them', () => {
  const m = buildModel({ house: { windows: 'none', rooms: [{ name: 'A', rects: [[0, 0, 8, 6]] }], extra_walls: [{ from: [4, 0], to: [4, 4] }, { from: [1, 5], to: [3, 5], type: 'half', height: 0.9 }, [6, 1, 7, 2], { from: [5, 4], to: [7, 4], bow: 0.6, type: 'glass' }], doors: [{ from: [4, 1], to: [4, 2] }] } }, hass);
  const ex = m.walls.filter(w => w[6]);
  assert.deepEqual(ex.filter(w => w[0] === 4 && w[2] === 4).map(w => [w[1], w[3]]), [[0, 1], [2, 4]], 'the door cuts the separate wall');
  assert.deepEqual(ex.find(w => w[4] === 'half').slice(0, 4), [1, 5, 3, 5]); assert.equal(ex.find(w => w[4] === 'half')[6].h, 0.9);
  assert.ok(ex.some(w => w[0] === 6 && w[3] === 2), 'a slanted one from a plain list');
  assert.ok(ex.filter(w => w[4] === 'glass').length > 3, 'a bent glass wall');
});
test('a door on a slanted wall snaps onto it and cuts it', () => {
  const m = buildModel({ house: { windows: 'none', rooms: [{ name: 'A', points: [[0, 0], [6, 0], [6, 3], [3, 6], [0, 6]] }], doors: [{ from: [5.4, 3.7], to: [4.7, 4.4] }] } }, hass);
  const d = m.doors[0];
  assert.equal(d.axis, 'a');
  assert.ok(Math.abs(d.x + d.z - 9) < 1e-3, 'on the line x + z = 9');
  const diag = m.walls.filter(w => w[0] !== w[2] && w[1] !== w[3]);
  assert.equal(diag.length, 2, 'the slanted wall has a gap');
});
test('locks: a padlock, or what they lock when kind / icon is given', () => {
  const h = { ...hass, states: { ...hass.states, 'lock.front': st('locked', { friendly_name: 'Front Door' }), 'lock.x': st('locked', { friendly_name: 'Thing' }) } };
  const m = buildModel({ panels: { security: { locks: ['lock.front', 'lock.x', { entity: 'lock.x', kind: 'gate' }, { entity: 'lock.x', icon: 'mdi:star' }] } } }, h);
  assert.deepEqual(m.E.locks.map(l => [l.kind, l.icon]), [['door', null], ['padlock', null], ['gate', 'mdi:gate'], ['padlock', 'mdi:star']], 'a padlock unless kind / icon is given');
});
test('open passages on every kind of wall: inner, outer, outdoor railings, slanted, curved, separate (straight and bent)', () => {
  const rooms = [{ name: 'Living', rects: [[0, 0, 6, 5]] }, { name: 'Balcony', outdoor: true, rects: [[6, 0, 9, 5]] }, { name: 'Bed', points: [[0, 5], [6, 5], [6, 9, 1], [0, 9]] }, { name: 'Den', points: [[9, 0], [12, 0], [12, 3], [10, 5], [9, 5]] }, { name: 'Garden', rects: [[0, 10, 12, 14]] }, { name: 'Up', level: 1, points: [[0, 0, -0.8], [4, 0], [4, 4], [0, 4]] }];
  const extra = [{ from: [0.5, 12], to: [3, 12] }, { from: [4, 12], to: [8, 12], bow: 0.5 }];
  // the chord between two points of an arc: the arc of a bent edge a→b with `bow` at fractions f0, f1 (as the editor draws it)
  // a point of the arc of a bent edge (outline from corner a to corner b) or of a bent separate wall, f from 0 to 1
  const arcOf = (pts, a, b) => { const o = roomOutline({ points: pts }), i = o.findIndex(p => p[0] === a[0] && p[1] === a[1]), j = o.findIndex(p => p[0] === b[0] && p[1] === b[1]); return j > i ? o.slice(i, j + 1) : [...o.slice(i), ...o.slice(0, j + 1)]; };
  const bed = arcOf([[0, 5], [6, 5], [6, 9, 1], [0, 9]], [6, 9], [0, 9]), sep = extraWalls([extra[1]]).map(w => [w[0], w[1]]).concat([[8, 12]]);
  const at = (arc, f) => arc[Math.round(f * (arc.length - 1))];
  const cases = {
    'outer wall': [2, 0, 3, 0], 'between a room and a balcony': [6, 1, 6, 2], 'balcony railing': [7, 5, 8, 5], 'balcony outer railing': [7, 0, 8, 0],
    'garden edge (outdoor)': [2, 14, 4, 14], 'slanted wall': [11.6, 3.4, 10.9, 4.1], 'separate wall': [1, 12, 2, 12],
    'curved room wall': [...at(bed, 0.35), ...at(bed, 0.6)],
    'bent separate wall': [...at(sep, 0.3), ...at(sep, 0.55)],
  };
  for (const [name, op] of Object.entries(cases)) {
    const cfg = lv => ({ house: { windows: 'none', rooms, extra_walls: extra, openings: [[...op, ...(lv ? [lv] : [])]] } });
    const before = buildModel({ house: { windows: 'none', rooms, extra_walls: extra } }, hass), m = buildModel(cfg(0), hass);
    const ox = m.rooms.find(r => r.id === 'living').rects[0][0], oz = m.rooms.find(r => r.id === 'living').rects[0][1], g = [op[0] + ox, op[1] + oz, op[2] + ox, op[3] + oz];
    assert.ok(wallBeside(before.walls, g), `${name}: there is a wall before`);
    assert.ok(!wallBeside(m.walls, g), `${name}: the passage opens it`);
  }
  const upArc = arcOf([[0, 0, -0.8], [4, 0], [4, 4], [0, 4]], [0, 0], [4, 0]), up = [...at(upArc, 0.3), ...at(upArc, 0.6)];
  const m1 = buildModel({ house: { windows: 'none', rooms, openings: [[...up, 1]] } }, hass), sh = m1.rooms.find(r => r.id === 'up').poly.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1])], [1e9, 1e9]);
  const o1 = roomOutline({ points: [[0, 0, -0.8], [4, 0], [4, 4], [0, 4]] }).reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1])], [1e9, 1e9]);
  const g1 = [up[0] - o1[0] + sh[0], up[1] - o1[1] + sh[1], up[2] - o1[0] + sh[0], up[3] - o1[1] + sh[1]];
  assert.ok(!wallBeside(m1.walls, g1, 1), 'a curved wall upstairs opens on its own floor');
});
test('a config with broken values: what can be used is kept, the rest left out, nothing throws', () => {
  const junk = { names: 'oops', panels: { security: 'yes', water: { pumps: [null, 'switch.p'] } }, house: { rooms: [null, 'x', { name: 'A', rects: [['a', 1, 2, 3], [0, 0, 4, 4]], furniture: [null, 'lamp', { type: 'lamp', x: 1, z: 1 }], lights: [null, 42, 'light.living'] }, { name: 'B', level: 'two', points: [[5, 0], ['x', 1], [9, 0], [9, 4]] }],
    doors: [null, { to: [1, 1] }, { from: [4, 1], to: [4, 2] }], lock_badges: [{ lock: 'lock.x' }, { lock: 'lock.y', x: 1, z: 1 }], openings: [[1, 2], 'x', [0, 0, 1, 0]], extra_walls: [null, { from: [1, 1] }, [1, 1, 2, 2]] } };
  const c = cleanConfig(junk);
  assert.equal(c.names, undefined); assert.equal(c.panels.security, undefined); assert.deepEqual(c.panels.water.pumps, ['switch.p']);
  assert.deepEqual(c.house.rooms.map(r => r.name), ['A', 'B']); assert.deepEqual(c.house.rooms[0].rects, [[0, 0, 4, 4]]); assert.equal(c.house.rooms[0].furniture.length, 1); assert.deepEqual(c.house.rooms[0].lights, ['light.living']);
  assert.equal(c.house.rooms[1].level, undefined); assert.equal(c.house.rooms[1].points.length, 3);
  assert.equal(c.house.doors.length, 1); assert.equal(c.house.lock_badges.length, 1); assert.deepEqual(c.house.openings, [[0, 0, 1, 0]]); assert.equal(c.house.extra_walls.length, 1);
  const m = buildModel(junk, hass);
  assert.equal(m.rooms.length, 2); assert.equal(m.doors.length, 1);
});
test('areas without devices still become rooms (a new home), and Security off hides its cameras', () => {
  const h = { ...hass, states: { 'camera.porch': st('idle') }, entities: {} };
  assert.equal(buildModel({}, h).rooms.length, 4, 'every area while none has devices');
  assert.equal(buildModel({}, hass).rooms.length, 4, 'with devices: the areas that have them');
  assert.equal(buildModel({ panels: { security: false } }, h).E.cameras.length, 0);
  assert.equal(buildModel({}, h).E.cameras.length, 1);
});
test('a panel with several fields: pick any and only what you picked shows; pick none and all are found', () => {
  const h = { ...hass, states: { ...hass.states, 'lock.a': st('locked'), 'camera.c': st('idle'), 'alarm_control_panel.h': st('disarmed'), 'valve.v': st('closed'), 'media_player.tv': st('off', { device_class: 'tv' }) } };
  const auto = buildModel({}, h).E;
  assert.ok(auto.locks.length && auto.cameras.length && auto.alarm && auto.doors.length && auto.irrigation.valves.length && auto.media.tv, 'nothing picked: all found');
  const own = buildModel({ panels: { security: { cameras: ['camera.c'] }, irrigation: { interval: 'input_select.x' }, media: { speakers: ['media_player.x'] } } }, h).E;
  assert.deepEqual([own.locks.length, own.doors.length, own.alarm, own.cameras.length, own.irrigation.valves.length, own.media.tv], [0, 0, null, 1, 0, null]);
  assert.ok(buildModel({ panels: { security: { gate: { relay: 'switch.g' } } } }, h).E.locks.length, 'the older gate alone still finds the rest');
});
test('two rooms on the same area (or with the same name) still get their own ids', () => {
  const m = buildModel({ house: { rooms: [{ area: 'living', rects: [[0, 0, 4, 4]] }, { area: 'living', name: 'Living room corridor', rects: [[4, 0, 6, 4]] }, { name: 'Hall', rects: [[0, 4, 4, 6]] }, { name: 'Hall', rects: [[4, 4, 6, 6]] }] } }, hass);
  assert.deepEqual(m.rooms.map(r => r.id), ['living', 'living_2', 'hall', 'hall_2']);
});
test('two sofas overlapping at a right angle become one L-shaped sofa', () => {
  const m = buildModel({ house: { windows: 'none', rooms: [{ name: 'Lounge', rects: [[0, 0, 6, 5]], furniture: [{ type: 'sofa', from: [0.2, 0.2], to: [3.2, 1.1], back: 'n' }, { type: 'sofa', from: [0.2, 0.2], to: [1.1, 3], back: 'w' }, { type: 'sofa', from: [4, 3], to: [5.8, 3.9], back: 's' }] }] } }, hass);
  const [A, B, C] = m.furniture.filter(f => f.type === 'sofa');
  assert.deepEqual([A.arms, A.cornerBack, B.arms, B.z0, B.z1], ['end', 'start', 'end', 1.1, 3], 'A keeps the corner, B starts at its edge, no arms at the joint');
  assert.equal(C.arms, undefined, 'a sofa on its own keeps both arms');
  // a sofa along the top that runs past the side sofa ends at its outer edge; one that stops inside it reaches it
  for (const [topTo, sideFrom, sideTo] of [[[5.6, 1.05], [4.5, 0.15], [5.4, 3.6]], [[5.0, 1.05], [4.5, 0.15], [5.4, 3.6]]]) {
    const m2 = buildModel({ house: { windows: 'none', rooms: [{ name: 'Lounge', rects: [[0, 0, 6, 5]], furniture: [{ type: 'sofa', from: [0.8, 0.15], to: topTo, back: 'n' }, { type: 'sofa', from: sideFrom, to: sideTo, back: 'e' }] }] } }, hass);
    const [T, S] = m2.furniture.filter(f => f.type === 'sofa');
    assert.deepEqual([T.x0, T.x1, T.cornerBack, S.z0, S.x1], [0.8, 5.4, 'end', 1.05, 5.4], `top to ${topTo[0]}: a square corner`);
  }
});
test('two counters overlapping at a right angle become one corner counter (tops of another height stay apart)', () => {
  const m = buildModel({ house: { windows: 'none', rooms: [{ name: 'Kitchen', rects: [[0, 0, 6, 5]], furniture: [
    { type: 'block', from: [0.1, 0.1], to: [3, 0.7], h: 0.9 }, { type: 'block', from: [0.1, 0.1], to: [0.7, 3], h: 0.9 }, { type: 'block', from: [0.1, 0.1], to: [3, 0.7], h: 0.05, y: 0.9 }] }] } }, hass);
  const [A, B, top] = m.furniture.filter(f => f.type === 'block');
  assert.deepEqual([A.x0, A.x1, A.z0, A.z1], [0.1, 3, 0.1, 0.7], 'the one along x keeps the corner');
  assert.deepEqual([B.z0, B.z1], [0.7, 3], 'the other starts at its edge');
  assert.deepEqual([top.z0, top.z1], [0.1, 0.7], 'a top at another height is left as it is');
});
test('furniture keeps its place in the config and its entities', () => {
  const m = buildModel({ house: { rooms: [{ name: 'A', rects: [[0, 0, 4, 4]], furniture: [{ type: 'lamp', x: 1, z: 1, entity: 'light.living' }, { type: 'bed', x: 2, z: 2, entities: ['light.bed', 'light.living'] }] }] } }, hass);
  assert.deepEqual(m.furniture.map(f => f.src), [{ room: 0, i: 0 }, { room: 0, i: 1 }]);
  assert.deepEqual(m.furniture[1].entities, ['light.bed', 'light.living']);
  assert.deepEqual(furnEntities({ type: 'charger', plug: 'switch.outlet' }), ['switch.outlet']);
});
test('suggested furniture is written like YAML', () => {
  const f = autoFurnitureConfig({ name: 'Living room', rects: [[0, 0, 6, 5]] });
  assert.ok(f.length > 3);
  assert.ok(f.every(p => !('x0' in p) && !('room' in p)));
  assert.match(f.find(p => p.type === 'sofa').color, /^#[0-9a-f]{6}$/);
});

test('automatic bedrooms get bedside tables next to the bed', () => {
  const big = autoFurnitureConfig({ name: 'Master bedroom', rects: [[0, 0, 5, 4]] }), small = autoFurnitureConfig({ name: 'Kids room', rects: [[0, 0, 3, 3]] });
  const ns = big.filter(p => p.type === 'nightstand'), bed = big.find(p => p.type === 'bed');
  assert.equal(ns.length, 2);
  for (const n of ns) { assert.ok(Math.abs(Math.abs(n.x - bed.x) - (bed.width / 2 + 0.3)) < 0.02); assert.ok(n.z > bed.z); }
  assert.equal(small.filter(p => p.type === 'nightstand').length, 1);
});

test('a plug\'s power sensor is found without being picked', () => {
  const S = (u, dcl) => st('5', { unit_of_measurement: u, ...(dcl ? { device_class: dcl } : {}) });
  const R = registry({ states: { 'switch.a': st('on'), 'sensor.a_energy': S('kWh', 'energy'), 'sensor.a_power': S('W', 'power'),
      'switch.b': st('on'), 'sensor.b_today': S('kWh'), 'sensor.b_load': S('W'),
      'switch.c': st('on'), 'sensor.c_power': S('W'), 'switch.d': st('on'), 'sensor.d_voltage': S('V', 'voltage') },
    entities: { 'switch.a': { device_id: 'A' }, 'sensor.a_energy': { device_id: 'A' }, 'sensor.a_power': { device_id: 'A', entity_category: 'diagnostic' },
      'switch.b': { device_id: 'B' }, 'sensor.b_today': { device_id: 'B' }, 'sensor.b_load': { device_id: 'B' }, 'switch.d': { device_id: 'D' }, 'sensor.d_voltage': { device_id: 'D' } } });
  assert.equal(R.powerOf('switch.a'), 'sensor.a_power'); // device class power, even as a diagnostic entity
  assert.equal(R.powerOf('switch.b'), 'sensor.b_load'); // no device class: a W unit
  assert.equal(R.powerOf('switch.c'), 'sensor.c_power'); // no device: named after the plug
  assert.equal(R.powerOf('switch.d'), null); // nothing that reads power
});

test('an AC piece replaces the room\'s automatic unit and works with its climate entity', () => {
  const h = { ...hass, states: { ...hass.states, 'climate.bed': st('cool') }, entities: { ...hass.entities, 'climate.bed': { area_id: 'bed' } } };
  const auto = buildModel({ house: { rooms: [{ area: 'bed', rects: [[0, 0, 4, 4]] }] } }, h);
  assert.ok(auto.rooms[0].ac);
  const m = buildModel({ house: { rooms: [{ area: 'bed', rects: [[0, 0, 4, 4]], furniture: [{ type: 'ac', x: 0.2, z: 2, facing: 'e' }] }] } }, h);
  assert.equal(m.rooms[0].ac, undefined);
  assert.deepEqual(m.furniture.find(f => f.type === 'ac').entities, ['climate.bed']);
});

test('automatic bathrooms get a toilet, a sink and a bathtub or shower; laundries a washing machine', () => {
  const T = c => autoFurnitureConfig(c).map(p => p.type);
  assert.deepEqual(T({ name: 'Bathroom', rects: [[0, 0, 2.6, 2.6]] }).sort(), ['bathtub', 'sink', 'toilet']);
  assert.deepEqual(T({ name: 'Guest WC', rects: [[0, 0, 1.6, 2.2]] }).sort(), ['shower', 'sink', 'toilet']);
  assert.ok(T({ name: 'Laundry', rects: [[0, 0, 2, 2]] }).includes('washer'));
  // nothing sticks out of a small bathroom
  for (const p of autoFurnitureConfig({ name: 'Bathroom', rects: [[0, 0, 1.6, 2.2]] })) assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 1.6 && p.z - p.d / 2 >= 0 && p.z + p.d / 2 <= 2.2, p.type);
});

test('the automatic AC of an outline room hangs on its top wall, not mid-room', () => {
  const h = { ...hass, states: { ...hass.states, 'climate.bed': st('cool') }, entities: { ...hass.entities, 'climate.bed': { area_id: 'bed' } } };
  const m = buildModel({ house: { rooms: [{ area: 'bed', points: [[0, 0], [6, 0], [6, 4], [1.2, 4], [0, 2.8, 0.7]] }] } }, h);
  const r = m.rooms[0], top = Math.min(...r.rects.map(q => q[1]));
  assert.ok(Math.abs(r.ac.z - (top + 0.14)) < 1e-6, JSON.stringify(r.ac));
});

test('smart plugs: outlets, switches with a power sensor or named like a plug / charger; added ones move to Plugs', () => {
  const h = { states: { 'switch.phone_charger': st('on', { friendly_name: 'Phone Charger' }), 'switch.lamp': st('off', { friendly_name: 'Lamp' }), 'sensor.lamp_power': st('3', { unit_of_measurement: 'W' }),
      'switch.dnd': st('off', { friendly_name: 'Do not disturb' }), 'switch.socket': st('on', { device_class: 'outlet' }) },
    entities: { 'switch.phone_charger': { area_id: 'bed' }, 'switch.lamp': { area_id: 'bed', device_id: 'L' }, 'sensor.lamp_power': { device_id: 'L' }, 'switch.dnd': { area_id: 'bed' }, 'switch.socket': { area_id: 'bed' } },
    areas: { bed: { area_id: 'bed', name: 'Bedroom' } }, devices: {}, floors: {} };
  const r = buildModel({ house: { rooms: [{ area: 'bed', rects: [[0, 0, 4, 4]] }] } }, h).rooms[0];
  assert.deepEqual(r.plugs.map(p => p.id).sort(), ['switch.lamp', 'switch.phone_charger', 'switch.socket']);
  assert.equal(r.plugs.find(p => p.id === 'switch.phone_charger').icon, 'mdi:cellphone-charging');
  assert.deepEqual(r.entities.map(e => e.id), ['switch.dnd']);
  // picked by hand under the room's entities: still shown with its plugs
  const r2 = buildModel({ house: { rooms: [{ area: 'bed', rects: [[0, 0, 4, 4]], plugs: [], entities: ['switch.phone_charger', 'switch.dnd'] }] } }, h).rooms[0];
  assert.deepEqual([r2.plugs.map(p => p.id), r2.entities.map(e => e.id)], [['switch.phone_charger'], ['switch.dnd']]);
});

test('room icons: a bathroom or laundry room is not a bedroom', () => {
  const ic = n => buildModel({ house: { rooms: [{ name: n, rects: [[0, 0, 3, 3]] }] } }, hass).rooms[0].icon;
  assert.deepEqual(['Bathroom', 'Laundry room', 'Master bedroom', 'Guest room', 'Storage room'].map(ic), ['mdi:shower', 'mdi:washing-machine', 'mdi:bed', 'mdi:bed', 'mdi:archive']);
});

test('Plex: found by its integration, library sensors split into shows and movies, plex: false leaves it out', () => {
  const h = JSON.parse(JSON.stringify(hass));
  const add = (id, p, state = 'idle', attributes = {}) => { h.states[id] = { ...st(state), attributes }; h.entities[id] = { platform: p }; };
  assert.equal(buildModel({}, h).E.mserver.plex.off, true, 'no Plex: off');
  add('sensor.plex_server', 'plex', '1'); add('sensor.plex_server_library_films', 'plex', '120', { library_type: 'movie' });
  add('sensor.plex_server_library_tv_shows', 'plex', '35', { library_type: 'show' }); add('media_player.plex_plex_web_chrome', 'plex', 'playing');
  const m = buildModel({}, h), P = m.E.mserver.plex;
  assert.deepEqual([P.off, P.movies, P.shows], [false, ['sensor.plex_server_library_films'], ['sensor.plex_server_library_tv_shows']]);
  assert.ok(m.hasMS, 'the Media Server card shows with Plex alone');
  assert.equal(buildModel({ panels: { media_server: { plex: false } } }, h).E.mserver.plex.off, true);
  // library_count: the Library tiles' numbers (total by default; library / both; anything else: total)
  assert.deepEqual(['total', 'library', 'both', 'x'].map(c => buildModel({ panels: { media_server: { library_count: c } } }, h).E.mserver.count), ['total', 'library', 'both', 'total']);
  assert.equal(m.E.mserver.count, 'total');
});

test('Jellyfin or Jellyfin + JellyHA (hybrid): playing through the official integration, the rest from JellyHA when picked', () => {
  const h = JSON.parse(JSON.stringify(hass));
  const add = (id, p, state = 'idle') => { h.states[id] = st(state); h.entities[id] = { platform: p }; };
  add('media_player.jellyha_library_browser', 'jellyha'); add('sensor.jellyha_connected_clients', 'jellyha', '38'); add('sensor.jellyha_active_sessions', 'jellyha', '2');
  const J = c => buildModel({ panels: { media_server: c } }, h).E.mserver.jellyfin;
  assert.equal(J({}).kind, 'hybrid', 'only JellyHA installed: Jellyfin + JellyHA');
  assert.equal(J({}).view, 'jellyha');
  assert.equal(J({}).clients, 'sensor.jellyha_active_sessions', 'JellyHA: its active sessions, not every connected client');
  add('media_player.living_room_tv', 'jellyfin'); add('sensor.jellyfin_active_clients', 'jellyfin', '1');
  assert.equal(J({}).kind, 'jellyfin', 'both installed, not set: Jellyfin');
  assert.equal(J({}).view, 'jellyfin');
  assert.equal(J({}).clients, 'sensor.jellyfin_active_clients');
  const hy = J({ integration: 'hybrid' });
  assert.deepEqual([hy.kind, hy.view, hy.clients, hy.playClients], ['hybrid', 'jellyha', 'sensor.jellyha_active_sessions', 'sensor.jellyfin_active_clients']);
  assert.equal(J({ integration: 'hybrid', clients_sensor: 'sensor.my_count' }).clients, 'sensor.my_count', 'a picked clients sensor wins');
  assert.equal(J({ integration: 'jellyfin', clients_sensor: 'sensor.my_count' }).clients, 'sensor.my_count');
  assert.equal(J({ integration: 'jellyha' }).kind, 'hybrid', 'the older jellyha setting means Jellyfin + JellyHA');
  assert.equal(J({ integration: 'jellyfin' }).kind, 'jellyfin');
  assert.ok(buildModel({ panels: { media_server: { integration: 'hybrid' } } }, h).hasMS, 'the Media Server card shows');
});

test('Energy Month / Year: from Home Assistant\'s Energy data by default; the picked sensors only with energy_dashboard_totals off', () => {
  const E = c => buildModel({ panels: { energy: c } }, hass).E.energy;
  assert.deepEqual([E({}).monthly, E({}).yearly], [null, null]);
  assert.deepEqual([E({ month_sensor: 'sensor.m', year_sensor: 'sensor.y' }).monthly, E({ month_sensor: 'sensor.m', year_sensor: 'sensor.y' }).yearly], [null, null], 'on by default: the sensors are not used');
  assert.deepEqual([E({ energy_dashboard_totals: false, month_sensor: 'sensor.m', year_sensor: 'sensor.y' }).monthly, E({ energy_dashboard_totals: false, month_sensor: 'sensor.m', year_sensor: 'sensor.y' }).yearly], ['sensor.m', 'sensor.y']);
});

test('Energy extra rows: plain entity IDs (as the card editor writes them) or {entity, name, icon}', () => {
  const x = buildModel({ panels: { energy: { extra: ['sensor.a', { entity: 'sensor.b', name: 'B', icon: 'mdi:car' }, null] } } }, hass).E.energy.extra;
  assert.deepEqual(x.map(r => [r.id, r.icon]), [['sensor.a', 'mdi:flash'], ['sensor.b', 'mdi:car']]);
  assert.equal(x[1].name, 'B');
});

test('Home Lab: each sensor found from the Proxmox node or picked; servers listed automatically unless auto_guests is off', () => {
  const h = JSON.parse(JSON.stringify(hass));
  h.states['sensor.node_pve_cpu_used'] = st('11'); h.entities['sensor.node_pve_cpu_used'] = { platform: 'proxmoxve' };
  const L = c => buildModel({ panels: { homelab: c } }, h).E.lab;
  const a = L({});
  assert.deepEqual([a.cpu, a.mem, a.disk, a.swap, a.cts, a.vms, a.updates, a.temp, a.auto], ['sensor.node_pve_cpu_used', 'sensor.node_pve_memory_used_percentage', 'sensor.node_pve_disk_used_percentage',
    'sensor.node_pve_swap_used_percentage', 'sensor.node_pve_containers_running', 'sensor.node_pve_virtual_machines_running', 'sensor.node_pve_total_updates', null, true]);
  const o = L({ cpu: 's.c', memory: 's.m', disk: 's.d', swap: 's.s', temperature: 's.t', containers: 's.ct', vms: 's.v', updates: 's.u', auto_guests: false, pinned: ['lxc_a_1', { key: 'qemu_b_2', name: 'B' }] });
  assert.deepEqual([o.cpu, o.mem, o.disk, o.swap, o.temp, o.cts, o.vms, o.updates, o.auto], ['s.c', 's.m', 's.d', 's.s', 's.t', 's.ct', 's.v', 's.u', false]);
  assert.deepEqual(o.guests, [['lxc_a_1', null, null], ['qemu_b_2', 'B', undefined]]);
  const none = buildModel({ panels: { homelab: { cpu: 'sensor.my_cpu' } } }, hass).E.lab;
  assert.equal(none.cpu, 'sensor.my_cpu', 'no Proxmox node: picked sensors still make a Home Lab card');
  assert.equal(none.status, null);
});

test('TV backlight: a light set as the TV backlight glows around the room\'s TV piece (its place and facing); tv_glow by hand is kept', () => {
  const room = extra => ({ house: { rooms: [{ area: 'living', rects: [[0, 0, 5, 4]], light_fx: { 'light.living': 'tv' },
    furniture: [{ type: 'tv', x: 2.5, z: 3.8, w: 1.4, h: 0.8, y: 0.7, facing: 'n' }], ...extra }] } });
  const G = c => buildModel(c, hass).rooms[0].tvGlow;
  const g = G(room({}));
  assert.ok(g && g.auto, 'placed on the TV');
  assert.deepEqual([g.w, g.h, g.y, g.facing], [1.4, 0.8, 0.7, 'n']);
  assert.equal(G({ house: { rooms: [{ area: 'living', rects: [[0, 0, 5, 4]], furniture: [{ type: 'tv', x: 2.5, z: 3.8 }] }] } }), undefined, 'no TV backlight light: no glow');
  const own = G(room({ tv_glow: { x: 1, z: 1, y: 0.5, w: 1, h: 0.6 } }));
  assert.ok(own && !own.auto && own.w === 1, 'a glow placed by hand is kept');
});


test('"Found from" switches: Jellyfin / Sonarr / Radarr / qBittorrent / Forecast.Solar off leave their part out', () => {
  const h = JSON.parse(JSON.stringify(hass));
  const add = (id, p, state = '1') => { h.states[id] = st(state); h.entities[id] = { platform: p }; };
  add('media_player.living_room_tv', 'jellyfin', 'idle'); add('sensor.jellyfin_active_clients', 'jellyfin');
  add('sensor.sonarr_upcoming', 'sonarr'); add('sensor.sonarr_shows', 'sonarr'); add('sensor.radarr_movies', 'radarr');
  add('sensor.qbittorrent_download_speed', 'qbittorrent'); add('sensor.energy_production_today', 'forecast_solar', '12');
  const M = (ms, en) => buildModel({ panels: { media_server: ms, energy: en } }, h);
  const on = M({}, {}).E;
  assert.deepEqual([on.mserver.sonarr.shows, on.mserver.radarr.movies, on.mserver.qbt.down, on.forecast.today, !!on.mserver.jellyfin.off],
    ['sensor.sonarr_shows', 'sensor.radarr_movies', 'sensor.qbittorrent_download_speed', 'sensor.energy_production_today', false], 'on by default');
  const x = M({ jellyfin: false, sonarr: false, radarr: false, qbittorrent: false }, { solar_forecast: false });
  assert.equal(x.E.mserver.jellyfin.off, true);
  assert.equal(x.E.mserver.jellyfin.clients, null);
  const none = o => Object.entries(o).every(([k, v]) => (k === 'more' ? v.length === 0 : v === null));
  assert.ok(none(x.E.mserver.sonarr) && none(x.E.mserver.radarr) && none(x.E.mserver.qbt));
  assert.equal(x.E.forecast.today, null, 'Forecast.Solar off: no Solar Forecast box');
  assert.equal(x.hasMS, false, 'everything off: no Media Server card');
  assert.equal(M({ jellyfin: false }).hasMS, true, 'Sonarr still on: the card stays');
});

test('fence and gate: a fence separate wall keeps its kind (and its height); a gate is a door with its own height', () => {
  assert.deepEqual(extraWalls([{ from: [0, 0], to: [4, 0], type: 'fence', height: 1.5 }]).map(w => [w[4], w[6].h]), [['fence', 1.5]]);
  const m = buildModel({ house: { rooms: [{ name: 'A', rects: [[0, 0, 4, 4]] }], extra_walls: [{ from: [0, 6], to: [6, 6], type: 'fence' }], doors: [{ from: [2, 6], to: [3.2, 6], gate: true, height: 1.4 }, { from: [1, 4], to: [2, 4] }] } }, hass);
  assert.deepEqual(m.doors.map(d => [d.gate, d.gh]), [[true, 1.4], [false, null]]);
  assert.equal(m.walls.filter(w => w[4] === 'fence').length, 2, 'the gate cuts the fence in two');
});
test('water trend_hours: the tank trend is worked out from 2, 6, 12 or 24 hours (6 by default, or for anything else)', () => {
  const H = w => buildModel({ panels: { water: w } }, hass).E.water.trendHours;
  assert.deepEqual([H({}), H({ trend_hours: 2 }), H({ trend_hours: '12' }), H({ trend_hours: 24 }), H({ trend_hours: 3 }), H({ trend_hours: 'x' })], [6, 2, 12, 24, 6, 6]);
});

test('doors_hours: the timeline span is 6, 12, 18 or 24 hours (24 by default, or for anything else)', () => {
  const H = sec => buildModel({ panels: { security: sec } }, hass).E.doorsHours;
  assert.deepEqual([H({}), H({ doors_hours: 6 }), H({ doors_hours: '12' }), H({ doors_hours: 18 }), H({ doors_hours: 7 }), H({ doors_hours: 'x' })], [24, 6, 12, 18, 24, 24]);
});
test('several instances: Sonarr / Radarr / qBittorrent per config entry, every Proxmox node', () => {
  const h = JSON.parse(JSON.stringify(hass));
  const add = (id, p, entry, state = '1') => { h.states[id] = st(state); h.entities[id] = { platform: p, config_entry_id: entry }; };
  add('sensor.radarr_movies', 'radarr', 'r1', '300'); add('sensor.radarr_4k_movies', 'radarr', 'r2', '40');
  add('sensor.qbittorrent_download_speed', 'qbittorrent', 'q1', '2'); add('sensor.qbit_2_download_speed', 'qbittorrent', 'q2', '3');
  add('sensor.sonarr_shows', 'sonarr', 's1', '48');
  for (const n of ['pve', 'pve2']) add(`sensor.node_${n}_cpu_used`, 'proxmoxve', 'p1', '10');
  const M = c => buildModel({ panels: c || {} }, h).E;
  const E = M();
  assert.deepEqual([E.mserver.radarr.movies, E.mserver.radarr.more.map(m => m.movies)], ['sensor.radarr_movies', ['sensor.radarr_4k_movies']], 'a second Radarr server');
  assert.deepEqual(E.mserver.qbt.more.map(m => m.down), ['sensor.qbit_2_download_speed'], 'a second qBittorrent');
  assert.deepEqual([E.mserver.sonarr.shows, E.mserver.sonarr.more], ['sensor.sonarr_shows', []], 'one Sonarr: nothing more');
  assert.deepEqual([E.lab.node, E.lab.nodes], ['pve', ['pve', 'pve2']], 'every Proxmox node');
  assert.equal(E.lab.byNode.pve2.cpu, 'sensor.node_pve2_cpu_used');
  assert.equal(M({ homelab: { node: 'pve2' } }).lab.cpu, 'sensor.node_pve2_cpu_used', 'homelab.node: the node shown first');
  assert.deepEqual(M({ media_server: { radarr: false } }).mserver.radarr.more, [], 'switched off: none of its instances');
});

// Zigbee: Zigbee2MQTT / ZHA devices as one list (src/zigbee.js)
{
  const now = Date.parse('2026-11-27T12:00:00Z'), at = m => new Date(now - m * 60e3).toISOString();
  const zh = () => {
    const S = {}, Ent = {}, D = {};
    const put = (id, state, attributes, dev, m = 2) => { S[id] = { entity_id: id, state, attributes: attributes || {}, last_changed: at(m), last_updated: at(m) }; Ent[id] = { entity_id: id, device_id: dev, platform: 'mqtt' }; };
    D.br = { id: 'br', name: 'Zigbee2MQTT Bridge', identifiers: [['mqtt', 'zigbee2mqtt_bridge_0x00124b0024c1aa01']] };
    put('binary_sensor.zigbee2mqtt_bridge_connection_state', 'on', { device_class: 'connectivity' }, 'br');
    D.a = { id: 'a', name: 'Kitchen Plug', area_id: 'kitchen', model: 'TRETAKT', identifiers: [['mqtt', 'zigbee2mqtt_0x00158d0001a2b301']] };
    put('switch.kitchen_plug', 'on', {}, 'a'); put('sensor.kitchen_plug_linkquality', '182', { unit_of_measurement: 'lqi' }, 'a');
    D.b = { id: 'b', name: 'Garage Relay', identifiers: [['mqtt', 'zigbee2mqtt_0x00158d0001a2b302']] };
    put('switch.garage_relay', 'unavailable', {}, 'b', 180); put('sensor.garage_relay_linkquality', 'unavailable', { unit_of_measurement: 'lqi' }, 'b', 180);
    D.c = { id: 'c', name: 'Garden Temp', name_by_user: 'Garden Temperature', identifiers: [['mqtt', 'zigbee2mqtt_0x00158d0001a2b303']] };
    put('sensor.garden_temp_battery', '58', { device_class: 'battery', unit_of_measurement: '%' }, 'c', 55); put('sensor.garden_temp_linkquality', '38', { unit_of_measurement: 'lqi' }, 'c', 55);
    put('sensor.garden_temp_last_seen', at(7), { device_class: 'timestamp' }, 'c', 7);
    D.x = { id: 'x', name: 'Not Zigbee', identifiers: [['hue', '123']] }; put('light.not_zigbee', 'on', {}, 'x');
    return { states: S, entities: Ent, devices: D, areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } } };
  };
  test('zigbee: Zigbee2MQTT devices from the registry (online from availability, LQI, battery, last seen)', () => {
    const m = zigbeeModel(zh(), {}, {}, now);
    assert.equal(m.source, 'z2m');
    assert.equal(m.bridge.online, true);
    assert.deepEqual(m.devices.map(d => [d.id, d.name, d.role, d.power, d.online, d.lqi]), [
      ['b', 'Garage Relay', 'R', 'mains', false, null], ['c', 'Garden Temperature', 'E', 'battery', true, 38], ['a', 'Kitchen Plug', 'R', 'mains', true, 182]]);
    const c = m.devices.find(d => d.id === 'c'), a = m.devices.find(d => d.id === 'a');
    assert.deepEqual([c.battery, c.exact, c.lastSeen, c.roleKnown], [58, true, now - 7 * 60e3, false], 'its last_seen sensor: exact');
    assert.deepEqual([a.exact, a.lastSeen, a.area, a.ieee, a.entity], [false, now - 2 * 60e3, 'Kitchen', '0x00158d0001a2b301', 'sensor.kitchen_plug_linkquality'], 'no last_seen: the last change');
    assert.deepEqual(m.devices.map(d => zbStatus(d, 60)), ['off', 'weak', 'ok']);
    const S = zbSummary(m, 60);
    assert.deepEqual([S.total, S.online, S.healthy, S.routers, S.routersOnline, S.weakest.id, S.lowestBattery.id], [3, 2, 1, 2, 1, 'c', 'c']);
    assert.equal(zbStatus(c, 30), 'ok', 'the LQI limit');
  });
  test('zigbee: what Zigbee2MQTT says on MQTT wins (role, power, availability, link quality, coordinator)', () => {
    const live = {
      devices: [{ ieee_address: '0x00124B0024C1AA01', type: 'Coordinator' }, { ieee_address: '0x00158d0001a2b302', type: 'EndDevice', friendly_name: 'Garage Relay', power_source: 'Battery' },
        { ieee_address: '0x00158d0001a2b3ff', type: 'Router', friendly_name: 'Only In Z2M', power_source: 'Mains (single phase)', definition: { model: 'X1', vendor: 'Acme' } },
        { ieee_address: '0x00158d0001a2b301', type: 'Router', friendly_name: 'Kitchen Plug', disabled: true }],
      info: { version: '2.1.1', coordinator: { type: 'EmberZNet', meta: { revision: '7.4' } }, network: { channel: 25 }, config: { availability: { enabled: true }, advanced: { last_seen: 'disable' } } },
      avail: { 'Garage Relay': true }, seen: { 'Garden Temperature': { lqi: 90, at: now - 60e3 } },
    };
    const m = zigbeeModel(zh(), {}, live, now), d = id => m.devices.find(x => x.id === id);
    assert.deepEqual([m.bridge.coordinator, m.bridge.channel, m.bridge.version, m.bridge.lastSeenOff], ['EmberZNet 7.4', 25, '2.1.1', true]);
    assert.deepEqual([d('b').role, d('b').power, d('b').online, d('b').roleKnown], ['E', 'battery', true, true]);
    assert.ok(!d('a'), 'disabled in Zigbee2MQTT: left out');
    assert.deepEqual([d('0x00158d0001a2b3ff').name, d('0x00158d0001a2b3ff').model, d('0x00158d0001a2b3ff').role], ['Only In Z2M', 'X1', 'R'], 'a device only Zigbee2MQTT has');
    assert.deepEqual([d('c').lqi, d('c').lastSeen], [90, now - 60e3], 'a newer message: its LQI and time');
    assert.equal(zigbeeModel(zh(), {}, { state: 'offline' }, now).devices.every(x => x.online === null), true, 'bridge offline: nothing known about the devices');
    assert.equal(zigbeeModel(zh(), {}, { state: 'offline' }, now).bridge.online, false);
  });
  test('zigbee: availability off in Zigbee2MQTT: offline after 25 h of silence (nothing is pinged, so a quiet plug is not offline)', () => {
    const info = { config: { availability: { enabled: false } } };
    const m = zigbeeModel(zh(), {}, { info, seen: { 'Kitchen Plug': { at: now - 11 * 60e3 }, 'Garden Temperature': { at: now - 24 * 3600e3 } } }, now), d = id => m.devices.find(x => x.id === id);
    assert.deepEqual([d('a').online, d('c').online], [true, true]);
    assert.equal(zigbeeModel(zh(), {}, { info, seen: { 'Kitchen Plug': { at: now - 26 * 3600e3 } } }, now).devices.find(x => x.id === 'a').online, false);
    assert.equal(zigbeeModel(zh(), {}, { info: { config: { availability: { enabled: true } } }, seen: { 'Kitchen Plug': { at: now - 26 * 3600e3 } } }, now).devices.find(x => x.id === 'a').online, true, 'availability on: Zigbee2MQTT decides');
    const m2 = zigbeeModel(zh(), {}, { info, seen: { 'Garden Temperature': { at: now - 26 * 3600e3 } } }, now);
    assert.equal(m2.devices.find(x => x.id === 'c').online, true, 'a newer last_seen sensor wins over an older message');
  });
  test('zigbee: ZHA devices, with ZHA\'s own list', () => {
    const h = { states: { 'sensor.porch_temp': { entity_id: 'sensor.porch_temp', state: '20', attributes: {}, last_updated: at(3) } }, entities: { 'sensor.porch_temp': { device_id: 'p' } },
      devices: { p: { id: 'p', name: 'Porch Sensor', identifiers: [['zha', '00:15:8d:00:01:a2:b3:c4']] }, co: { id: 'co', name: 'Coordinator', identifiers: [['zha', '00:12:4b:00:24:c1:aa:01']] } }, areas: {} };
    const zha = [{ ieee: '00:12:4b:00:24:c1:aa:01', device_type: 'Coordinator', manufacturer: 'Silicon Labs', model: 'EZSP', available: true },
      { ieee: '00:15:8D:00:01:A2:B3:C4', device_type: 'EndDevice', power_source: 'Battery or Unknown', lqi: 120, rssi: -70, last_seen: at(5), available: false }];
    assert.equal(zbSource(h), 'zha');
    const m = zigbeeModel(h, {}, { zha }, now);
    assert.deepEqual([m.bridge.coordinator, m.bridge.online], ['Silicon Labs EZSP', true]);
    assert.deepEqual(m.devices.map(d => [d.id, d.role, d.power, d.lqi, d.rssi, d.online, d.exact]), [['p', 'E', 'battery', 120, -70, false, true]], 'the coordinator is not a device');
    assert.deepEqual(zigbeeModel(h, {}, {}, now).devices.map(d => [d.id, d.role, d.online]), [['p', 'R', true]], 'without ZHA\'s list: from the entities');
  });
  test('zigbee: the network map (Zigbee2MQTT raw map): links, parents, hops, routes, and devices behind an offline router', () => {
    const C = '0x00124b0024c1aa01', K = '0x00158d0001a2b301', G = '0x00158d0001a2b302', T = '0x00158d0001a2b303';
    const resp = { status: 'ok', data: { type: 'raw', value: {
      nodes: [{ ieeeAddr: C, type: 'Coordinator' }, { ieeeAddr: K, type: 'Router' }, { ieeeAddr: G, type: 'Router' }, { ieeeAddr: T, type: 'EndDevice' }],
      links: [{ source: { ieeeAddr: K }, target: { ieeeAddr: C }, linkquality: 182, relationship: 1 }, { source: { ieeeAddr: C }, target: { ieeeAddr: K }, linkquality: 170, relationship: 0 },
        { source: { ieeeAddr: G }, target: { ieeeAddr: K }, linkquality: 71, relationship: 2 }, { source: { ieeeAddr: G }, target: { ieeeAddr: C }, linkquality: 40, relationship: 2 },
        { source: { ieeeAddr: T }, target: { ieeeAddr: G }, linkquality: 90, relationship: 1 }, { source: { ieeeAddr: '0xdeadbeef00000000' }, target: { ieeeAddr: C }, linkquality: 9, relationship: 1 }] } } };
    const mp = z2mMap(resp, now);
    assert.deepEqual([mp.coord, mp.entries.length, mp.at, mp.entries[0]], [C, 6, now, { reporter: C, neighbor: K, lqi: 182, rel: 'child' }]);
    assert.equal(z2mMap({ status: 'error', error: 'busy' }), null);
    const m = zigbeeModel(zh(), {}, { map: mp }, now), d = id => m.devices.find(x => x.id === id);
    assert.deepEqual(m.links.map(l => [...[l.a, l.b].sort(), l.lqi].join()).sort(), ['a,b,71', 'a,coord,182', 'b,c,90', 'b,coord,40'], 'one link per pair, its best LQI; unknown devices left out');
    assert.deepEqual([d('a').parent, d('a').hops, d('b').parent, d('b').hops, d('c').parent], ['coord', 1, 'coord', 1, 'b'], 'routers: fewest hops, then best LQI; end devices: the parent their router names');
    assert.deepEqual(zbRoute(m, 'c'), ['c', 'b', 'coord']);
    assert.deepEqual([d('c').parentOff, zbStatus(d('c'), 30), zbStatus(d('c'), 60)], [true, 'orphan', 'weak'], 'behind the offline Garage Relay (weak signal still comes first)');
    assert.equal(zbSummary(m, 30).healthy, 1);
  });
  test('zigbee: ZHA neighbour tables make the map too', () => {
    const h = { states: {}, entities: {}, devices: { r: { id: 'r', name: 'Plug', identifiers: [['zha', '00:15:8d:00:00:00:00:01']] }, e: { id: 'e', name: 'Sensor', identifiers: [['zha', '00:15:8d:00:00:00:00:02']] } }, areas: {} };
    const zha = [{ ieee: '00:12:4b:00:00:00:00:00', device_type: 'Coordinator', neighbors: [{ ieee: '00:15:8d:00:00:00:00:01', relationship: 'Child', lqi: '200' }] },
      { ieee: '00:15:8d:00:00:00:00:01', device_reg_id: 'r', device_type: 'Router', available: true, neighbors: [{ ieee: '00:15:8d:00:00:00:00:02', relationship: 'Child', lqi: 150 }] },
      { ieee: '00:15:8d:00:00:00:00:02', device_reg_id: 'e', device_type: 'EndDevice', available: true, neighbors: [] }];
    const m = zigbeeModel(h, {}, { zha }, now);
    assert.deepEqual(m.devices.map(d => [d.id, d.parent, d.hops]), [['r', 'coord', 1], ['e', 'r', 2]]);
    assert.deepEqual(m.links.map(l => l.lqi).sort(), [150, 200]);
    assert.equal(m.map.at, null, 'when ZHA last scanned is not known');
  });
  test('zigbee: no Zigbee in Home Assistant, ieeeKey, and panels.zigbee defaults', () => {
    assert.equal(zigbeeModel({ states: {}, devices: {} }).source, null);
    assert.equal(ieeeKey('0x00158D0001A2B3C4'), ieeeKey('00:15:8d:00:01:a2:b3:c4'));
    assert.deepEqual(zbConfig(undefined), { on: true, source: null, base: 'zigbee2mqtt', views: ['summary', 'list', 'map'], alerts: ['offline', 'weak'], autoScan: true, lqiMin: 60 });
    assert.deepEqual(zbConfig({ source: 'zha', base_topic: '/z2m/', views: ['list', 'nope'], alerts: [], lqi_min: '80' }), { on: true, source: 'zha', base: 'z2m', views: ['list'], alerts: [], autoScan: true, lqiMin: 80 });
    assert.equal(zbConfig({ auto_scan: false }).autoScan, false);
    assert.equal(zbConfig(false).on, false);
    assert.deepEqual(buildModel({ panels: { zigbee: { views: 'summary' } } }, hass).E.zigbee.views, ['summary']);
  });
}

test('view_modes and card_order: the 3D view\'s modes (all by default, unknown ones left out) and each tab\'s card order', () => {
  const M = c => buildModel(c, hass);
  assert.deepEqual(M({}).viewModes, ['lights', 'climate', 'presence', 'zigbee']);
  assert.deepEqual(M({ view_modes: ['zigbee', 'nope', 'climate'] }).viewModes, ['zigbee', 'climate']);
  assert.deepEqual(M({ view_modes: 'presence' }).viewModes, ['presence']);
  assert.deepEqual(M({ view_modes: [] }).viewModes, []);
  assert.deepEqual(M({ card_order: { system: ['devices', 'alerts'] } }).cardOrder, { system: ['devices', 'alerts'] });
  assert.deepEqual([M({}).cardOrder, M({ card_order: ['x'] }).cardOrder], [{}, {}]);
  assert.deepEqual([M({}).headerChips.length, M({ header_chips: ['power', 'x', 'weather'] }).headerChips, M({ header_chips: [] }).headerChips], [8, ['power', 'weather'], []]);
  assert.deepEqual([M({}).tabLabels, M({ tab_labels: 'stacked' }).tabLabels, M({ tab_labels: 'x' }).tabLabels], ['auto', 'stacked', 'auto']);
  assert.deepEqual([M({}).phoneBadges, M({ phone_badges: ['always', 'x', 'climate'] }).phoneBadges, M({ phone_badges: [] }).phoneBadges], [['lights', 'motion', 'climate', 'doors', 'unlocked', 'charging', 'plugs'], ['always', 'climate'], []]);
});

test('tank trend: only the latest fill or drain counts', () => {
  const H = 36e5, P = pts => pts.map(([h, v]) => [h * H, v]);
  // filled from 60 to 95 over 2 h, then drained to 88 over 4 h: draining, ~-1.75 %/h (the whole-window fit was rising)
  const r = tankRate(P([[0, 60], [1, 78], [2, 95], [3, 93], [4, 91], [5, 90], [6, 88]]));
  assert.ok(r < -1.5 && r > -2, `rate ${r}`);
  // drained, then the pump fills it: rising
  assert.ok(tankRate(P([[0, 80], [2, 60], [3, 70], [4, 85]])) > 10);
  // small noise is not a turn: a steady drain stays one run
  assert.ok(Math.abs(tankRate(P([[0, 90], [1, 89.5], [2, 89.8], [3, 88.9], [4, 88.5]])) + 0.37) < 0.1);
  assert.equal(tankRate(P([[0, 50]])), null);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall model tests passed');
