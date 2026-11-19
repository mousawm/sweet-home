// Sweet Home 3D import tests: run with `node test/sh3d.test.mjs` (part of `npm test`). No browser needed.
import assert from 'node:assert/strict';
import { zip } from './zip.mjs';
import { sh3dXml, readHome, toHouse, importSh3d, ImportError } from '../src/sh3d.js';
import { buildModel, cleanConfig } from '../src/model.js';

let failed = 0;
const test = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.stack); } };

// A two-floor home as Sweet Home 3D writes it (centimetres, y down). Ground floor, 8 × 5 m with 10 cm walls:
// living room on the left (rooms drawn on the inner faces of the walls), a bedroom top right with a door from the
// living room, a kitchen bottom right that is open to the living room (no wall), a low separate wall in the living
// room. Upstairs: an office (no walls) and a curved garden wall.
const room = (name, level, pts) => `<room level='${level}' name='${name}' areaVisible='true'>${pts.map(([x, y]) => `<point x='${x}' y='${y}'/>`).join('')}</room>`;
const wall = (id, level, x1, y1, x2, y2, extra = '') => `<wall id='${id}' level='${level}' xStart='${x1}' yStart='${y1}' xEnd='${x2}' yEnd='${y2}' height='250.0' thickness='10.0' ${extra}/>`;
const XML = `<?xml version='1.0'?>
<home version='7200' name='test.sh3d' camera='topCamera' wallHeight='250.0'>
  <property name='com.eteks.sweethome3d.SweetHome3D.FrameMaximized' value='true'/>
  <level id='lv1' name='Upstairs' elevation='260.0' floorThickness='12.0' height='250.0' elevationIndex='0'/>
  <level id='lv0' name='Ground &amp; garden' elevation='0.0' floorThickness='12.0' height='250.0' elevationIndex='0'/>
  <pieceOfFurniture level='lv0' catalogId='eTeks#bed140x190' name='Double bed' x='600.0' y='150.0' width='140.0' depth='190.0' height='50.0'/>
  <pieceOfFurniture level='lv0' catalogId='eTeks#sofa' name='Sofa' x='200.0' y='100.0' angle='3.1415927' width='200.0' depth='90.0' height='80.0'/>
  <pieceOfFurniture level='lv0' catalogId='eTeks#fridge' name='Refrigerator' x='700.0' y='450.0' angle='1.5707964' width='70.0' depth='60.0' height='180.0'/>
  <pieceOfFurniture level='lv0' catalogId='eTeks#man' name='Man' x='300.0' y='300.0' width='50.0' depth='30.0' height='175.0'/>
  <pieceOfFurniture level='lv0' name='Hidden box' x='300.0' y='400.0' width='50.0' depth='30.0' height='75.0' visible='false'/>
  <pieceOfFurniture level='lv0' catalogId='eTeks#staircase' name='Staircase' x='100.0' y='420.0' width='100.0' depth='150.0' height='260.0' staircaseCutOutShape='M0,0 L1,1'/>
  <furnitureGroup level='lv0' name='Group' x='100.0' y='300.0' width='50.0' depth='50.0' height='90.0'>
    <pieceOfFurniture catalogId='eTeks#chair' name='Chair' x='100.0' y='300.0' angle='1.5707964' width='45.0' depth='50.0' height='90.0' color='FF336699'/>
  </furnitureGroup>
  <light level='lv0' catalogId='eTeks#ceilingLight' name='Ceiling light' x='200.0' y='250.0' elevation='230.0' width='40.0' depth='40.0' height='20.0' power='0.5'><lightSource x='0.5' y='0.5' z='0.5' color='#FFFFFF'/></light>
  <doorOrWindow level='lv0' catalogId='eTeks#door' name='Door' x='400.0' y='150.0' angle='1.5707964' width='90.0' depth='10.0' height='210.0'><sash xAxis='0' yAxis='0' width='90' startAngle='0' endAngle='1.57'/></doorOrWindow>
  <doorOrWindow level='lv0' catalogId='eTeks#frontDoor' name='Front door' x='200.0' y='503.0' width='100.0' depth='16.0' height='210.0'/>
  <doorOrWindow level='lv0' catalogId='eTeks#window' name='Window' x='600.0' y='0.0' elevation='90.0' width='120.0' depth='10.0' height='120.0'/>
  <doorOrWindow level='lv0' catalogId='eTeks#doorFrame' name='Door frame' x='600.0' y='300.0' width='80.0' depth='10.0' height='210.0'/>
  ${wall('w1', 'lv0', 0, 0, 800, 0)}${wall('w2', 'lv0', 800, 0, 800, 500)}${wall('w3', 'lv0', 800, 500, 0, 500)}${wall('w4', 'lv0', 0, 500, 0, 0)}
  ${wall('w5', 'lv0', 400, 0, 400, 300)}${wall('w6', 'lv0', 400, 300, 800, 300)}
  <wall id='w7' level='lv0' xStart='100' yStart='200' xEnd='300' yEnd='200' height='100' thickness='10'/>
  <wall id='w8' level='lv1' xStart='0' yStart='600' xEnd='400' yEnd='600' thickness='10' arcExtent='1.0'/>
  ${room('Living room', 'lv0', [[5, 5], [395, 5], [395, 495], [5, 495]])}
  ${room('Master Bedroom', 'lv0', [[405, 5], [795, 5], [795, 295], [405, 295]])}
  ${room('Kitchen', 'lv0', [[400, 305], [795, 305], [795, 495], [400, 495]])}
  ${room('Office', 'lv1', [[0, 0], [400, 0], [400, 300], [0, 300]])}
  <room level='lv1' name='Tiny'><point x='0' y='0'/><point x='10' y='0'/><point x='10' y='10'/></room>
  <label x='0' y='0'><text>&lt;not a room&gt;</text></label>
</home>`;
const areas = { living: { area_id: 'living', name: 'Living Room' }, bed: { area_id: 'bed', name: 'Bedroom' }, office: { area_id: 'office', name: 'Office' } };
const st = (state, attributes = {}) => ({ state, attributes });
const hass = { states: { 'light.living': st('on') }, entities: { 'light.living': { area_id: 'living' } }, devices: {}, areas, floors: {} };

console.log('sweet home 3d import');
await test('reads Home.xml from a .sh3d file (deflated or stored), or the XML on its own', async () => {
  assert.equal(await sh3dXml(zip([['Home', 'java'], ['Home.xml', XML], ['0', 'model']])), XML);
  assert.equal(await sh3dXml(zip([['Home.xml', XML, 0]])), XML);
  assert.equal(await sh3dXml(new TextEncoder().encode(XML).buffer), XML);
});
await test('clear errors: not a Sweet Home 3D file, an old one, no rooms', async () => {
  const code = async b => { try { await importSh3d(b, {}); return 'no error'; } catch (e) { assert.ok(e instanceof ImportError, e.stack); return e.code; } };
  assert.equal(await code(new TextEncoder().encode('hello').buffer), 'not-sh3d');
  assert.equal(await code(zip([['Home', 'java serialized']])), 'old-version');
  assert.equal(await code(zip([['readme.txt', 'x']])), 'not-sh3d');
  assert.equal(await code(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]).buffer), 'not-sh3d');
  assert.equal(await code(zip([['Home.xml', "<home><wall id='a' xStart='0' yStart='0' xEnd='100' yEnd='0' thickness='10'/></home>"]])), 'empty');
});

const home = readHome(XML);
await test('the XML: levels, walls, rooms and pieces in metres (pieces in a group, entities decoded)', () => {
  assert.equal(home.levels.length, 2); assert.equal(home.levels[1].name, 'Ground & garden');
  assert.equal(home.walls.length, 8); assert.deepEqual(home.walls[0].b, [8, 0]);
  assert.equal(home.rooms.length, 5); assert.deepEqual(home.rooms[0].points[1], [3.95, 0.05]);
  assert.ok(home.pieces.some(p => p.name === 'Chair' && p.level === 'lv0' && p.color === '#336699'), 'the chair in the group takes the group level');
  assert.equal(home.pieces.filter(p => p.kind === 'door').length, 4);
});

const { house, summary } = toHouse(home, { areas });
const R = Object.fromEntries(house.rooms.map(r => [r.area || r.name, r]));
await test('rooms: moved onto the wall centre lines, rectangles kept as rectangles, floors by elevation', () => {
  assert.deepEqual(R.living.rects, [[0, 0, 4, 5]]);
  assert.deepEqual(R.bed.rects, [[4, 0, 8, 3]]);
  assert.deepEqual(R.Kitchen.rects, [[4, 3, 8, 5]]);
  assert.deepEqual(R.office.rects, [[0, 0, 4, 3]]); assert.equal(R.office.level, 1);
  assert.ok(!('level' in R.living), 'ground floor: no level');
  assert.ok(!house.rooms.some(r => r.name === 'Tiny'), 'a tiny room is left out');
  assert.deepEqual(house.levels, [{ level: 0, name: 'Ground & garden' }, { level: 1, name: 'Upstairs' }]);
});
await test('rooms link to Home Assistant areas by name (and keep a name of their own)', () => {
  assert.equal(R.bed.name, 'Master Bedroom');
  assert.ok(!('name' in R.living));
  assert.equal(summary.linked, 3); assert.deepEqual(summary.unlinked, ['Kitchen']);
});
await test('doors, windows, door frames and the open side between living room and kitchen', () => {
  assert.deepEqual(house.doors, [{ from: [4, 1.05], to: [4, 1.95] }, { from: [1.5, 5], to: [2.5, 5], main: true }]);
  assert.deepEqual(house.windows, [[5.4, 0, 6.6, 0]]);
  assert.deepEqual(house.openings, [[4, 3, 4, 5], [5.6, 3, 6.4, 3]]);
});
await test('separate walls: the low wall is a half wall; the curved one upstairs keeps its bend', () => {
  assert.deepEqual(house.extra_walls, [{ from: [1, 2], to: [3, 2], type: 'half' }, { from: [0, 6], to: [4, 6], bow: 0.51, level: 1 }]);
});
await test('furniture: the nearest card piece, in its room; ceiling lights and people left out', () => {
  assert.deepEqual(R.bed.furniture, [{ type: 'bed', x: 6, z: 1.5, width: 1.4, length: 1.9, head: 'n' }]);
  const lv = R.living.furniture;
  assert.deepEqual(lv.find(f => f.type === 'sofa'), { type: 'sofa', x: 2, z: 1, w: 2, d: 0.9, back: 's' });
  assert.deepEqual(lv.find(f => f.type === 'chair'), { type: 'chair', x: 1, z: 3, face: 'w' });
  assert.deepEqual(lv.find(f => f.type === 'stairs'), { type: 'stairs', from: [0.5, 3.45], to: [1.5, 4.95], axis: 'z' });
  assert.deepEqual(R.Kitchen.furniture, [{ type: 'box', x: 7, z: 4.5, name: 'Refrigerator', w: 0.6, d: 0.7, h: 1.8, color: '#e5e7eb' }]);
  assert.equal(summary.lights, 1); assert.equal(summary.people, 1); assert.equal(summary.hidden, 1); assert.equal(summary.furniture, 5);
});
await test('the card builds the imported house: shared walls, the door and opening cut them', () => {
  const m = buildModel(cleanConfig({ house }), hass);
  assert.equal(m.rooms.length, 4);
  const at = (x, z) => m.walls.filter(w => (w[5] ?? 0) === 0 && w[0] === x && w[2] === x && Math.min(w[1], w[3]) < z && Math.max(w[1], w[3]) > z);
  assert.equal(at(4, 0.5).length, 1, 'one wall between living room and bedroom');
  assert.equal(at(4, 1.5).length, 0, 'the door makes a gap');
  assert.equal(at(4, 4).length, 0, 'living room and kitchen are open');
  assert.equal(m.doors.length, 2);
  assert.equal(m.levels.length, 2);
});
await test('importing over a drawn plan: room settings and house options are kept, the old geometry goes', () => {
  const old = { wall_height: 2, auto_furniture: true, lock_badges: [{ lock: 'lock.front', x: 1, z: 1 }], doors: [{ from: [0, 0], to: [1, 0], entity: 'binary_sensor.door' }], open_plan: [['a', 'b']],
    rooms: [{ area: 'living', rects: [[9, 9, 12, 12]], lights: ['light.living'], floor: 'wood', ac: { x: 1, z: 1 }, furniture: [{ type: 'tv', x: 10, z: 10 }] }, { name: 'Kitchen', rects: [[0, 0, 1, 1]], floor: 'tile' }] };
  const r = toHouse(home, { areas, house: old }), L = r.house.rooms.find(x => x.area === 'living');
  assert.deepEqual(L.lights, ['light.living']); assert.equal(L.floor, 'wood'); assert.ok(!('ac' in L));
  assert.ok(L.furniture.every(f => f.type !== 'tv'), 'furniture comes from the file');
  assert.equal(r.house.rooms.find(x => x.name === 'Kitchen').floor, 'tile', 'matched by name');
  assert.equal(r.house.wall_height, 2); assert.equal(r.house.auto_furniture, true);
  assert.ok(!r.house.lock_badges && !r.house.open_plan);
  assert.equal(r.summary.badgesDropped, 1); assert.equal(r.summary.sensorsDropped, 1); assert.equal(r.summary.replaced, 2);
});
await test('a 3D file setup becomes a floor plan', () => {
  const r = toHouse(home, { areas, house: { type: 'gltf', url: '/local/home.glb', mesh_rooms: { a: 'b' }, wall_height: 1.2 } });
  assert.ok(!r.house.type && !r.house.url && !r.house.mesh_rooms); assert.equal(r.house.wall_height, 1.2); assert.ok(r.summary.wasGltf);
});
await test('one floor with no levels; a room drawn without walls keeps its outline; slanted rooms stay outlines', async () => {
  const xml = `<home wallHeight='250'>${room('Hall', undefined, [[0, 0], [300, 0], [300, 200], [100, 300], [0, 300]]).replace(" level='undefined'", '')}</home>`;
  const r = await importSh3d(zip([['Home.xml', xml]]), {});
  assert.deepEqual(r.house.rooms, [{ name: 'Hall', points: [[0, 0], [3, 0], [3, 2], [1, 3], [0, 3]] }]);
  assert.ok(!r.house.levels && !r.house.openings && !r.house.extra_walls);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall import tests passed');
