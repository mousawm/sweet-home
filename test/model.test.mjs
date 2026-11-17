// Model tests: run with `node test/model.test.mjs` (part of `npm test`). No browser needed.
import assert from 'node:assert/strict';
import { buildModel, roleOf, registry, autoFurnitureConfig, furnEntities, floorLevels } from '../src/model.js';

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
test('stairs for rooms named or marked as stairs, going down on upper floors', () => {
  const m = buildModel({ house: { rooms: [{ name: 'Stairs', rects: [[0, 0, 2, 4]] }, { name: 'Hall', stairs: true, level: 1, rects: [[0, 0, 2, 4]] }] } }, hass);
  const s = m.furniture.filter(f => f.type === 'stairs');
  assert.deepEqual(s.map(f => [f.room, f.level, f.mode, f.axis]), [['stairs', 0, 'up', 'z'], ['hall', 1, 'down', 'z']]);
  assert.ok(s.every(f => f.rise * f.steps <= 1.35), 'within the wall height');
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
