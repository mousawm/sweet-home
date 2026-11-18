// Model tests: run with `node test/model.test.mjs` (part of `npm test`). No browser needed.
import assert from 'node:assert/strict';
import { buildModel, roleOf, registry, autoFurnitureConfig, furnEntities, floorLevels, roomOutline, polyRects } from '../src/model.js';

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

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall model tests passed');
