// Browser tests: the card and the card editor on the test page (made-up home, no WebGL needed).
// Run with `node test/e2e.mjs` after `npm run build` (part of `npm test`). Needs Playwright's Chromium
// (`npx playwright install chromium` once).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(root, path.endsWith('/') || !path ? join(path, 'index.html') : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || (path.endsWith('/') ? 'text/html' : 'application/octet-stream') }); res.end(body); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/test/`;

let failed = 0;
const check = (name, ok, info = '') => { if (ok) console.log('  ok  ', name); else { failed++; console.log('  FAIL', name, info); } };
const browser = await chromium.launch();

async function open(query, viewport = { width: 1500, height: 2200 }) {
  const p = await browser.newPage({ viewport });
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto(base + query); await p.waitForFunction(() => window.ready); await p.waitForFunction(() => window.card._three, null, { timeout: 15000 });
  return p;
}

try {
  console.log('card');
  let p = await open('?config=demo');
  check('two floors and a floor switch', await p.evaluate(() => card._model.levels.length === 2 && card.shadowRoot.querySelectorAll('[data-act=level]').length === 2));
  await p.evaluate(() => card.shadowRoot.querySelector('[data-act=level][data-level="1"]').click());
  check('switching floors', await p.evaluate(() => card._level === 1 && card._three.level === 1));
  await p.evaluate(() => card._select('kitchen'));
  check('opening a room on another floor switches to it', await p.evaluate(() => card._level === 0));
  await p.evaluate(() => card._selectFurn(card._model.furniture.find(f => f.name === 'Fridge').idx));
  check('a linked piece opens its room with the piece on top', await p.evaluate(() => card._sel === 'kitchen' && card.shadowRoot.querySelector('.fgrp.focus .fhd')?.textContent.includes('Fridge')));
  await p.evaluate(() => card._select('living_room'));
  await p.evaluate(() => card.shadowRoot.querySelector('#drawer [data-act=run]').click());
  check('scripts run from the popup', await p.evaluate(() => (window.calls || []).some(c => c[0] === 'homeassistant' && c[2].entity_id === 'script.movie_night')));
  check('rename and move are hidden outside edit mode', await p.evaluate(() => !card.shadowRoot.querySelector('#drawer [data-act=names]') && !card.shadowRoot.querySelector('[data-act=rnsec]') && getComputedStyle(card.shadowRoot.getElementById('arrBtn')).display === 'none'));
  await p.evaluate(() => { card.editMode = true; }); await p.waitForTimeout(100);
  check('…and shown while the dashboard is edited', await p.evaluate(() => !!card.shadowRoot.querySelector('#drawer [data-act=names]') && !!card.shadowRoot.querySelector('#glance [data-act=rnsec]') && getComputedStyle(card.shadowRoot.getElementById('arrBtn')).display !== 'none'));
  await p.evaluate(() => card.shadowRoot.querySelector('#drawer [data-act=names]').click());
  await p.evaluate(() => { const i = card.shadowRoot.querySelector('[data-rename="light.living_room"]'); i.value = 'Ceiling'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(100);
  await p.evaluate(() => card.shadowRoot.querySelector('#drawer [data-act=names]').click()); await p.waitForTimeout(150);
  check('renaming from the popup saves a dashboard name, not a Home Assistant name', await p.evaluate(() => !(window.ws || []).some(m => m.type === 'config/entity_registry/update') && (window.ws || []).some(m => m.type === 'lovelace/config')));
  await p.evaluate(() => { card.editMode = false; }); await p.waitForTimeout(100);
  check('leaving edit mode closes renaming', await p.evaluate(() => !card.shadowRoot.querySelector('[data-rename]') && !card._naming));
  check('edit mode is also found from Home Assistant\'s edit wrapper around the card', await p.evaluate(async () => {
    const w = document.createElement('hui-card-options'); card.before(w); w.appendChild(card); await new Promise(r => setTimeout(r, 50));
    const inside = card.hasAttribute('editing'); w.before(card); w.remove(); await new Promise(r => setTimeout(r, 50));
    return inside && !card.hasAttribute('editing');
  }));
  check('LED strip stops where a wall is missing (doors on two sides)', await p.evaluate(() => card._three.rooms.living_room.strip.washes.length === 6));
  await p.evaluate(() => card._setTab('water')); await p.waitForTimeout(200);
  check('water card: pumps with their power sensor, and other entities', await p.evaluate(() => {
    const w = card.shadowRoot.getElementById('water'); return !!w.querySelector('[data-id="switch.well_pump"][data-id2="sensor.well_pump_power"]') && !!w.querySelector('[data-id="sensor.water_flow"]') && !!w.querySelector('[data-id="valve.garden"]');
  }));
  await p.evaluate(() => card._setTab('system')); await p.waitForTimeout(300);
  check('needs attention: no hide button outside edit mode', await p.evaluate(() => { card._setTab('system'); return !card.shadowRoot.querySelector('#alerts [data-act=exclude]'); }));
  await p.evaluate(() => { card.editMode = true; }); await p.waitForTimeout(200);
  check('…the hide button shows while the dashboard is edited', await p.evaluate(() => { card._setTab('system'); return !!card.shadowRoot.querySelector('#alerts [data-act=exclude][data-id="sensor.door_sensor_battery"]'); }));
  await p.evaluate(() => { card.editMode = false; card._setTab('home'); }); await p.waitForTimeout(150);
  await p.evaluate(() => card._setTab('home'));
  check('a parked car is shown, a sprinkler sprays while its valve is open', await p.evaluate(() => card._three.cars[0].g.visible && card._three.sprinklers[0].onT === 1));
  await p.evaluate(() => { const h = window.hassObj; h.states['binary_sensor.car_parked'] = { ...h.states['binary_sensor.car_parked'], state: 'off' }; card.hass = { ...h, states: { ...h.states } }; });
  check('the car drives off when its sensor says it left', await p.waitForFunction(() => !card._three.cars[0].g.visible, null, { timeout: 8000 }).then(() => true, () => false));
  await p.evaluate(() => card._selectFurn(card._model.furniture.find(f => f.type === 'car').idx));
  check('the car in the popup: Away', await p.evaluate(() => card.shadowRoot.querySelector('.fgrp.focus')?.textContent.includes('Away')));
  await p.evaluate(() => card._select(null));
  check('stairs going up and down, with a stairwell', await p.evaluate(() => card._model.furniture.find(f => f.room === 'stairs' && f.type === 'stairs')?.mode === 'split' && !!card._model.rooms.find(r => r.id === 'stairs').floorRects));
  check('a name given in the card replaces the entity name everywhere on the dashboard', await p.evaluate(() => card._hass.states['sensor.living_room_temperature'].attributes.friendly_name === 'Lounge Temp' && window.hassObj.states['sensor.living_room_temperature'].attributes.friendly_name !== 'Lounge Temp'));
  await p.evaluate(() => card._setTab('energy')); await p.waitForTimeout(300);
  check('EV car card on the Energy tab: name, charging power, battery and range, colour', await p.evaluate(() => {
    const c = card.shadowRoot.getElementById('car'), t = c?.textContent || '';
    return c.style.display !== 'none' && t.includes('Model Y') && t.includes('7.20') && t.includes('64%') && t.includes('310') && !!c.querySelector('stop[stop-color="#dc2626"]');
  }));
  await p.evaluate(() => card._setTab('home'));
  check('doors without a sensor are drawn', await p.evaluate(() => card._model.doors.filter(d => !d.id).length === 6));
  check('a door placed off its wall snaps onto it and opens a gap', await p.evaluate(() => { const d = card._model.doors[5]; return d.z === 5 && !card._model.walls.some(w => w[5] === 0 && w[1] === 5 && w[3] === 5 && Math.min(w[0], w[2]) < d.x + 0.9 && Math.max(w[0], w[2]) > d.x + 0.1); }));
  check('a room with a slanted corner and a curved wall: its outline, a door on the slanted wall', await p.evaluate(() => { const r = card._model.rooms.find(x => x.id === 'bedroom'); return r.poly.length > 8 && card._model.doors.some(d => d.axis === 'a') && card._three.doors.some(D => D.d.axis === 'a'); }));
  check('separate walls: half, glass and a bent garden wall', await p.evaluate(() => { const w = card._model.walls.filter(q => q[6]); return w.some(q => q[4] === 'half') && w.some(q => q[4] === 'glass') && w.filter(q => q[6].bent).length > 3; }));
  // security: gates and garage doors next to the locks (covers found on their own, the older relay gate kept)
  await p.evaluate(() => card._setTab('security')); await p.waitForTimeout(150);
  check('security shows the garage door, the gate cover and the relay gate with their state', await p.evaluate(() => {
    const t = id => card.shadowRoot.querySelector(`#security [data-act=entrance][data-id="${id}"]`)?.textContent.replace(/\s+/g, ' ') || '';
    return t('cover.garage_door').includes('Garage Door') && t('cover.garage_door').includes('Closed') && t('cover.driveway_gate').includes('Opening') && t('switch.gate_relay').includes('Main Gate') && t('switch.gate_relay').includes('Open');
  }));
  check('locks show a plain padlock by default (as before)', await p.evaluate(() => {
    const k = id => { const b = card.shadowRoot.querySelector(`#security [data-act=lock][data-id="${id}"]`); return b ? [b.dataset.kind, b.querySelector('.lk-ic > ha-icon').getAttribute('icon'), b.querySelector('.lk-b ha-icon')?.getAttribute('icon') || ''].join() : ''; };
    return ['lock.front_door', 'lock.garage_side', 'lock.home_safe', 'lock.shed', 'lock.bike'].every(id => k(id).endsWith(',mdi:lock,'));
  }));
  for (const id of ['cover.garage_door', 'cover.driveway_gate', 'switch.gate_relay']) for (let k = 0; k < 2; k++) { await p.evaluate(id => card.shadowRoot.querySelector(`#security [data-act=entrance][data-id="${id}"]`).click(), id); await p.waitForTimeout(400); }
  check('a second tap opens the garage door, stops the moving gate, pulses the relay', await p.evaluate(() => { const c = window.calls || [], has = (d, s, id) => c.some(x => x[0] === d && x[1] === s && x[2].entity_id === id); return has('cover', 'open_cover', 'cover.garage_door') && has('cover', 'stop_cover', 'cover.driveway_gate') && has('switch', 'turn_on', 'switch.gate_relay'); }));
  check('one tap alone does nothing', await p.evaluate(() => (window.calls || []).filter(x => x[2]?.entity_id === 'cover.garage_door').length === 1));
  await p.evaluate(() => card._setTab('home'));
  // modes on the Home tab: switches light up while on, a scene runs with one tap
  check('modes card on the Home tab', await p.evaluate(() => { card._setTab('home'); const t = [...card.shadowRoot.querySelectorAll('#modes .tile')]; return t.length === 3 && t[0].classList.contains('on') && t[0].textContent.includes('Guests') && !t[1].classList.contains('on') && t[2].dataset.act === 'run'; }));
  await p.evaluate(() => { card.shadowRoot.querySelector('#modes [data-id="input_boolean.motion_stop"]').click(); card.shadowRoot.querySelector('#modes [data-id="scene.good_night"]').click(); });
  check('…a mode toggles, a scene runs', await p.evaluate(() => { const c = window.calls || []; return c.some(x => x[1] === 'toggle' && x[2].entity_id === 'input_boolean.motion_stop') && c.some(x => x[2]?.entity_id === 'scene.good_night'); }));
  // gate sensors: a camera's state classification (Frigate: open / closed text), a contact sensor as backup, words of your own
  check('a gate tells open / closed from Frigate, falls back to the second sensor, shows an unclear reading', await p.evaluate(async () => {
    const T = customElements.get('t-card'), el = new T(), cfg = JSON.parse(JSON.stringify(card._config));
    cfg.panels.security = { entrances: [{ entity: 'switch.gate_relay', name: 'Gate', sensor: 'sensor.gate_cam_gate_state', sensor_2: 'binary_sensor.gate' }, { entity: 'cover.garage_door', sensor: 'sensor.gate_cam_gate_state', open_states: ['gate_up'] }] };
    el.setConfig(cfg); card.remove(); document.body.appendChild(el); window.card = el;
    const H = window.hassObj, run = async (cam, contact) => { const h = { ...H, states: { ...H.states, 'sensor.gate_cam_gate_state': { ...H.states['sensor.gate_cam_gate_state'], state: cam }, 'binary_sensor.gate': { ...H.states['binary_sensor.gate'], state: contact } } }; el.hass = h; await new Promise(r => setTimeout(r, 250)); el._setTab('security'); await new Promise(r => setTimeout(r, 120)); return [...el.shadowRoot.querySelectorAll('#security [data-act=entrance]')].map(b => b.querySelector('span').textContent).join('|'); };
    const r = [await run('closed', 'on'), await run('Open', 'off'), await run('unknown', 'on'), await run('partially', 'unavailable'), await run('gate_up', 'off')];
    el._setTab('home');
    return JSON.stringify(r);
  }).then(r => { const ok = r === JSON.stringify(['Closed|Closed', 'Open|Open', 'Open|Unavailable', 'Partially|Partially', 'Closed|Open']); if (!ok) console.log('      got', r); return ok; }));
  // irrigation: its valves (a valve entity and a switch), named, and they open / start with a second tap
  await p.evaluate(() => card._setTab('water')); await p.waitForTimeout(150);
  check('irrigation panel shows its valves', await p.evaluate(() => { const v = [...card.shadowRoot.querySelectorAll('#irrigation .valve')]; return v.length === 2 && v[0].textContent.includes('Front lawn') && v[0].textContent.includes('Watering') && v[1].textContent.includes('Drip Zone') && v[1].textContent.includes('Closed'); }));
  // two taps 0.4 s apart (a quick double tap on a zone with a duration opens the duration instead)
  for (const id of ['valve.garden', 'switch.drip_zone']) for (let k = 0; k < 2; k++) { await p.evaluate(id => card.shadowRoot.querySelector(`#irrigation .valve[data-id="${id}"]`).click(), id); await p.waitForTimeout(400); }
  check('a valve closes with valve.close_valve, a switch zone starts with switch.turn_on', await p.evaluate(() => (window.calls || []).some(c => c[0] === 'valve' && c[1] === 'close_valve' && c[2].entity_id === 'valve.garden') && (window.calls || []).some(c => c[0] === 'switch' && c[1] === 'turn_on' && c[2].entity_id === 'switch.drip_zone')));
  await p.evaluate(() => card._setTab('home'));
  // states Home Assistant has not filled in yet (just after a restart): no "NaN" anywhere
  check('unknown states with no attributes show "—", never NaN', await p.evaluate(async () => {
    const h = JSON.parse(JSON.stringify(window.hassObj)); for (const k in h.states) { h.states[k].state = 'unknown'; h.states[k].attributes = {}; }
    card.hass = h; let ok = true;
    for (const t of ['home', 'security', 'climate', 'energy', 'water', 'system']) { card._setTab(t); await new Promise(r => setTimeout(r, 120)); if (/NaN|undefined/.test(card.shadowRoot.textContent)) ok = false; }
    card.hass = window.hassObj; card._setTab('home'); await new Promise(r => setTimeout(r, 150)); return ok;
  }));
  check('no page errors (card)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  // a home with no rooms yet: say what to do; a panel switched off is hidden
  p = await open('?config=demo');
  check('no rooms yet: the 3D view says how to add them, no tap-a-room tip', await p.evaluate(async () => {
    const T = customElements.get('t-card'), el = new T(); el.setConfig({ house: { rooms: [] }, panels: { security: false } }); card.remove(); document.body.appendChild(el); window.card = el;
    el.hass = { ...window.hassObj, areas: {}, floors: {} }; await new Promise(r => setTimeout(r, 900));
    const L = el.shadowRoot.getElementById('loading');
    return L.classList.contains('noroom') && L.textContent.includes('No rooms yet') && !el.shadowRoot.getElementById('hint').classList.contains('show');
  }));
  check('a panel switched off is hidden (Security off: no Security tab, cameras too)', await p.evaluate(() => ![...card.shadowRoot.querySelectorAll('#tabs [data-tab]')].some(t => t.dataset.tab === 'security')));
  check('no page errors (empty home)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('editor');
  p = await open('?config=demo&editor=1');
  const pt = (x, z) => p.evaluate(([x, z]) => { const s = editor.querySelector('.sh-plan'), b = s.getBoundingClientRect(), B = editor._B; return [b.left + (x - B.minX) / (B.maxX - B.minX) * b.width, b.top + (z - B.minZ) / (B.maxZ - B.minZ) * b.height]; }, [x, z]);
  const drag = async (a, c) => { const A = await pt(...a), C = await pt(...c); await p.mouse.move(...A); await p.mouse.down(); await p.mouse.move(...C, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150); };
  const rooms = () => p.evaluate(() => JSON.stringify(editor._config.house.rooms.map(r => r.rects)));
  const before = await rooms();
  await p.mouse.click(...await pt(8, 2)); await drag([8, 2], [8.5, 2]);
  check('dragging a room moves it', await p.evaluate(() => editor._config.house.rooms[1].rects[0][0] === 6.5));
  await p.click('[data-undo]');
  check('undo', await rooms() === before);
  await p.evaluate(() => { editor._mode = 'doors'; editor._render(); });
  await drag([1, 5], [2, 5]);
  check('drawing a door', await p.evaluate(() => JSON.stringify(editor._config.house.doors.at(-1)) === '{"from":[1,5],"to":[2,5]}'));
  await drag([8.3, 8.9], [9.3, 8.9]);
  check('dragging a lock badge', await p.evaluate(() => editor._config.house.lock_badges[0].x === 9.3));
  await p.evaluate(() => { editor._sel = 2; editor._mode = 'furniture'; editor._fsel = null; editor._render(); });
  await p.click('[data-pal="blinds"]'); await p.mouse.click(...await pt(3, 5.2)); await p.waitForTimeout(150);
  check('placing blinds', await p.evaluate(() => editor._config.house.rooms[2].furniture.at(-1).type === 'blinds'));
  // (the card rebuilds after each editor change: wait until the System tab shows the row)
  await p.waitForFunction(() => { if (card._tab !== 'system') card._setTab('system'); return !!card.shadowRoot.querySelector('#alerts [data-act=exclude][data-id="sensor.door_sensor_battery"]'); }, null, { timeout: 10000, polling: 300 });
  // the first tap only arms it (after several rebuilds: a tap must still count once)
  check('one tap asks for a second (after the card was rebuilt)', await p.evaluate(() => { const b = () => card.shadowRoot.querySelector('#alerts [data-act=exclude][data-id="sensor.door_sensor_battery"]'); b().click(); return !!b() && !editor._config.panels.attention; }));
  await p.evaluate(() => card.shadowRoot.querySelector('#alerts [data-act=exclude][data-id="sensor.door_sensor_battery"]').click());
  await p.waitForTimeout(300);
  check('hiding a device from Needs Attention goes into the config', await p.evaluate(() => JSON.stringify(editor._config.panels.attention) === '{"battery_exclude_devices":["ds1"]}'));
  await p.waitForTimeout(1500);
  check('the hidden device is gone from the list', await p.waitForFunction(() => { if (card._tab !== 'system') card._setTab('system'); const el = card.shadowRoot.querySelector('#alerts'); return card._tab === 'system' && el?._html !== undefined && card._model.E.alerts.batteryExcludeDevices.includes('ds1') && !el.querySelector('[data-id="sensor.door_sensor_battery"]'); }, null, { timeout: 10000, polling: 300 }).then(() => true, () => false));
  await p.evaluate(() => card._setTab('home'));
  await p.evaluate(() => editor._goLevel(1));
  check('first floor shows its own rooms', await p.evaluate(() => [...editor.querySelectorAll('[data-room]')].map(b => b.textContent.trim()).join() === 'Office,Landing'));
  await p.waitForTimeout(1500);
  check('the card follows the editor', await p.evaluate(() => card._model.doors.length === 8));
  await p.evaluate(() => { editor._goLevel(0); editor._sel = 0; editor._mode = 'entities'; editor._render(); });
  await p.evaluate(() => { const i = editor.querySelector('[data-rename="light.living_room"]'); i.value = 'Ceiling strip'; i.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(100);
  check('renaming in the editor list: a name on this dashboard only', await p.evaluate(() => editor._config.house.rooms[0].names?.['light.living_room'] === 'Ceiling strip' && !(window.ws || []).some(m => m.type === 'config/entity_registry/update')));
  await p.evaluate(() => { const i = editor.querySelector('[data-rename="script.movie_night"]'); i.value = 'Cinema'; i.dispatchEvent(new Event('change')); });
  check('renaming an entity Home Assistant can\'t rename: a name in this card', await p.evaluate(() => editor._config.house.rooms[0].names?.['script.movie_night'] === 'Cinema'));
  await p.waitForTimeout(1500);
  await p.evaluate(() => card._select('living_room')); await p.waitForTimeout(200);
  check('the popup uses the card name', await p.evaluate(() => card.shadowRoot.getElementById('drawer').textContent.includes('Cinema')));
  await p.evaluate(() => { card.shadowRoot.querySelector('#drawer [data-act=names]').click(); });
  await p.evaluate(() => { const i = card.shadowRoot.querySelector('[data-rename="sensor.living_room_temperature"]'); i.value = 'Room Temp'; i.dispatchEvent(new Event('change', { bubbles: true })); card.shadowRoot.querySelector('#drawer [data-act=names]').click(); });
  await p.waitForTimeout(400);
  check('renaming from the popup (editor open): saved with Done, the room opens again', await p.evaluate(() => editor._config.house.rooms[0].names?.['sensor.living_room_temperature'] === 'Room Temp' && card._sel === 'living_room' && card._hass.states['sensor.living_room_temperature'].attributes.friendly_name === 'Room Temp'));
  // lock badges: their name floats above them in 3D; renamed there while editing, or in the editor
  await p.evaluate(() => { card.editMode = false; card._setTab('home'); }); await p.waitForTimeout(200);
  check('a lock badge shows its lock\'s name in 3D, no pencil outside edit mode', await p.evaluate(() => { const l = card.shadowRoot.querySelector('.blbl'); return !!l && l.textContent.includes('Front Door') && l.dataset.id === 'lock.front_door'; }));
  await p.evaluate(() => { card.editMode = true; }); await p.waitForTimeout(200);
  await p.evaluate(() => card.shadowRoot.querySelector('.blbl [data-act=rnbadge]').click()); await p.waitForTimeout(100);
  await p.evaluate(() => { const i = card.shadowRoot.querySelector('#sheet [data-rename="badge:0"]'); i.value = 'Main entrance'; i.dispatchEvent(new Event('change', { bubbles: true })); card.shadowRoot.querySelector('#sheet [data-act=rnbsave]').click(); });
  await p.waitForTimeout(1500);
  check('renaming a lock badge in 3D: saved on the badge, shown above it', await p.evaluate(() => editor._config.house.lock_badges[0].name === 'Main entrance' && card.shadowRoot.querySelector('.blbl').textContent.includes('Main entrance') && !(window.ws || []).some(m => m.type === 'config/entity_registry/update')));
  await p.evaluate(() => { card.editMode = false; });
  // renaming on the other panels (edit mode): a pencil on each panel, names for this dashboard only
  await p.evaluate(() => card._setTab('climate'));
  await p.evaluate(() => { card.editMode = true; }); await p.waitForTimeout(150);
  check('a rename pencil on the panels while editing', await p.evaluate(() => !!card.shadowRoot.querySelector('#climate [data-act=rnsec]') && !!card.shadowRoot.querySelector('#glance [data-act=rnsec]')));
  await p.evaluate(() => card.shadowRoot.querySelector('#climate [data-act=rnsec]').click()); await p.waitForTimeout(100);
  const rid = await p.evaluate(() => card.shadowRoot.querySelector('#sheet [data-rename]')?.dataset.rename);
  check('the rename sheet lists what the panel shows', !!rid, rid);
  await p.evaluate(id => { const i = card.shadowRoot.querySelector(`#sheet [data-rename="${id}"]`); i.value = 'Panel Name'; i.dispatchEvent(new Event('change', { bubbles: true })); card.shadowRoot.querySelector('#sheet [data-act=rnsave]').click(); }, rid);
  await p.waitForTimeout(1500);
  check('renaming on a panel: a dashboard name used on every panel, Home Assistant untouched', await p.evaluate(id => {
    const n = Object.assign({}, editor._config.names, ...editor._config.house.rooms.map(r => r.names || {}));
    return n[id] === 'Panel Name' && card._hass.states[id].attributes.friendly_name === 'Panel Name' && window.hassObj.states[id].attributes.friendly_name !== 'Panel Name' && !(window.ws || []).some(m => m.type === 'config/entity_registry/update');
  }, rid));
  check('…and shown on the panel', await p.evaluate(() => { card._setTab('climate'); return card.shadowRoot.getElementById('climate').textContent.includes('Panel Name'); }));
  await p.evaluate(() => { card.editMode = false; card._setTab('home'); editor._step = 'look'; editor._render(); }); await p.waitForTimeout(100);
  check('Look: the tip switch is "Hide the tip", off by default', await p.evaluate(() => { const i = editor.querySelector('ha-form input[name=hide_hint]'); return !!i && !i.checked && !editor.querySelector('ha-form input[name=hint]'); }));
  await p.evaluate(() => { const i = editor.querySelector('ha-form input[name=hide_hint]'); i.checked = true; i.dispatchEvent(new Event('change')); });
  check('…turning it on hides the tip (hint: false)', await p.evaluate(() => editor._config.hint === false));
  await p.evaluate(() => { const i = editor.querySelector('ha-form input[name=hide_hint]'); i.checked = false; i.dispatchEvent(new Event('change')); });
  check('…turning it off shows it again', await p.evaluate(() => !('hint' in editor._config)));
  check('the tip switched off also drops "tap a room" from the 3D view\'s subtitle', await p.evaluate(async () => {
    const T = customElements.get('t-card'), sub = async hint => { const el = new T(); el.setConfig({ ...card._config, hint }); document.body.appendChild(el); el.hass = window.hassObj; await new Promise(r => setTimeout(r, 300)); const t = el.shadowRoot.querySelector('.stage .title span').textContent; el.remove(); return t; };
    return (await sub(false)) === 'Live 3D view' && (await sub(undefined)).includes('tap a room');
  }));
  check('the editor lists the names on this dashboard', await p.evaluate(id => !!editor.querySelector(`[data-nm="${id}"]`) && editor.querySelector(`[data-nm="${id}"]`).value === 'Panel Name', rid));
  await p.evaluate(id => editor.querySelector(`[data-nmdel="${id}"]`).click(), rid);
  check('…and clears one back to the default', await p.evaluate(id => ![editor._config, ...editor._config.house.rooms].some(h => h.names?.[id]), rid));
  await p.evaluate(() => { editor._step = 'rooms'; editor._render(); });
  // security in the editor: gates and garage doors picked there, a gate's sensor and name kept
  await p.evaluate(() => { editor._step = 'panels'; editor._render(); });
  await p.evaluate(() => { const i = [...editor.querySelectorAll('ha-form input[name=entrances]')][0]; i.value = 'cover.garage_door'; i.dispatchEvent(new Event('change')); });
  check('picking entrances in the editor', await p.evaluate(() => JSON.stringify(editor._config.panels.security.entrances) === '["cover.garage_door"]'));
  await p.waitForTimeout(1500);
  check('…the card shows the picked one and the older gate', await p.evaluate(() => { card._setTab('security'); return [...card.shadowRoot.querySelectorAll('#security [data-act=entrance]')].map(b => b.dataset.id).join() === 'cover.garage_door,switch.gate_relay'; }));
  await p.evaluate(() => card._setTab('home'));
  // open passages on curved and outdoor walls: drawn along the wall, cut in the plan and in 3D
  await p.evaluate(() => { editor._step = 'rooms'; editor._mode = 'doors'; editor._dtool = 'opening'; editor._render(); });
  const nOp = await p.evaluate(() => (editor._config.house.openings || []).length);
  for (const [a, c] of [[[-0.6, 6.0], [-0.6, 7.0]], [[2, 12.15], [3.4, 12.05]], [[10, 6], [10, 7]], [[2, 14], [4, 14]]]) await drag(a, c);
  check('drawing open passages on a curved room wall, a curved garden wall and outdoor railings', await p.evaluate(n => (editor._config.house.openings || []).length === n + 4, nOp));
  await p.waitForTimeout(1500);
  check('…each one opens the wall in the editor plan and in 3D', await p.evaluate(n => {
    const near = (walls, o, ox = 0, oz = 0) => { const x = (o[0] + o[2]) / 2 + ox, z = (o[1] + o[3]) / 2 + oz; return walls.some(w => (w[5] ?? 0) === 0 && (() => { const [x1, z1, x2, z2] = w, dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L)); return Math.hypot(x1 + t * dx - x, z1 + t * dz - z) < 0.15; })()); };
    const liv = card._model.rooms.find(r => r.id === 'living_room').rects[0], plan = editor._walls();
    return editor._config.house.openings.slice(n).every(o => !near(plan, o) && !near(card._model.walls, o, liv[0], liv[1]));
  }, nOp));
  const arcOp = await p.evaluate(n => editor._config.house.openings[n], nOp);
  await drag([(arcOp[0] + arcOp[2]) / 2, (arcOp[1] + arcOp[3]) / 2], [(arcOp[0] + arcOp[2]) / 2 + 0.2, (arcOp[1] + arcOp[3]) / 2 + 0.5]);
  check('moving a passage on a curved wall keeps both ends on the arc', await p.evaluate(n => { const o = editor._config.house.openings[n]; return o[1] > 6.2 && [[o[0], o[1]], [o[2], o[3]]].every(q => editor._nearWall(q, 0.03)); }, nOp));
  await p.evaluate(() => { editor._mode = 'shape'; editor._render(); });
  // modes in the editor (Panels → Modes): picked there, written to the card's own `modes`, a mode's icon kept
  await p.evaluate(() => { editor._step = 'panels'; editor._render(); });
  check('the editor lists the mode buttons', await p.evaluate(() => [...editor.querySelectorAll('ha-form input[name=modes]')].some(i => i.value === 'input_boolean.guests,input_boolean.motion_stop,scene.good_night')));
  await p.evaluate(() => { const i = [...editor.querySelectorAll('ha-form input[name=modes]')][0]; i.value = 'input_boolean.motion_stop,scene.good_night'; i.dispatchEvent(new Event('change')); });
  check('…removing one keeps the others as they were', await p.evaluate(() => JSON.stringify(editor._config.modes) === '[{"entity":"input_boolean.motion_stop","icon":"mdi:motion-sensor-off"},"scene.good_night"]'));
  await p.waitForTimeout(1500);
  check('…and the card follows', await p.evaluate(() => card.shadowRoot.querySelectorAll('#modes .tile').length === 2));
  await p.evaluate(() => { editor._step = 'rooms'; editor._render(); });
  // gate sensors in the editor: a picker per gate, with the Frigate sensor suggested by name
  await p.evaluate(() => { editor._config.panels = { ...editor._config.panels, security: { entrances: ['switch.gate_relay'] } }; editor._step = 'panels'; editor._render(); });
  check('each gate gets open / closed sensor pickers, with suggestions', await p.evaluate(() => !!editor.querySelector('ha-form input[name=sensor]') && !!editor.querySelector('ha-form input[name=sensor_2]') && !!editor.querySelector('[data-sg="sensor.gate_cam_gate_state"]')));
  await p.evaluate(() => editor.querySelector('[data-sg="sensor.gate_cam_gate_state"]').click());
  check('…a suggestion sets the sensor', await p.evaluate(() => JSON.stringify(editor._config.panels.security.entrances) === '[{"entity":"switch.gate_relay","sensor":"sensor.gate_cam_gate_state"}]'));
  await p.evaluate(() => { const i = editor.querySelector('ha-form input[name=sensor_2]'); i.value = 'binary_sensor.gate'; i.dispatchEvent(new Event('change')); });
  check('…and a second one as a backup', await p.evaluate(() => JSON.stringify(editor._config.panels.security.entrances[0].sensor) === '["sensor.gate_cam_gate_state","binary_sensor.gate"]'));
  await p.evaluate(() => { editor._step = 'rooms'; editor._render(); });
  // irrigation in the editor: valves are picked there, a zone's name and duration stay
  await p.evaluate(() => { editor._step = 'panels'; editor._render(); });
  check('the irrigation panel in the editor has a valves field', await p.evaluate(() => [...editor.querySelectorAll('ha-form input[name=zones]')].some(i => i.value === 'valve.garden,switch.drip_zone')));
  await p.evaluate(() => { const i = [...editor.querySelectorAll('ha-form input[name=zones]')][0]; i.value = 'valve.garden,switch.drip_zone,switch.well_pump'; i.dispatchEvent(new Event('change')); });
  check('adding a valve keeps the other zones as they were', await p.evaluate(() => JSON.stringify(editor._config.panels.irrigation.zones) === '[{"entity":"valve.garden","name":"Front lawn","duration":"sensor.water_flow"},"switch.drip_zone","switch.well_pump"]'));
  await p.waitForTimeout(1500);
  check('the card shows the added valve', await p.evaluate(() => { card._setTab('water'); return card.shadowRoot.querySelectorAll('#irrigation .valve').length === 3; }));
  await p.evaluate(() => { card._setTab('home'); editor._step = 'rooms'; editor._render(); });
  // room shapes: ready-made shapes, corners, bends, separate walls
  await p.evaluate(() => { editor._sel = 1; editor._mode = 'shape'; editor._stool = 'rect'; editor._render(); editor.querySelector('[data-shape=l]').click(); });
  check('a ready-made L shape', await p.evaluate(() => JSON.stringify(editor._config.house.rooms[1].points) === '[[6,0],[10,0],[10,2.5],[8,2.5],[8,5],[6,5]]' && !editor._config.house.rooms[1].rects));
  await drag([10, 2.5], [10.5, 3]);
  check('dragging a corner', await p.evaluate(() => JSON.stringify(editor._config.house.rooms[1].points[2]) === '[10.5,3]'));
  const mh = await p.evaluate(() => editor._midHandles()[0]);
  await drag(mh, [mh[0], mh[1] - 1]);
  check('dragging the middle of an edge bends it', await p.evaluate(() => editor._config.house.rooms[1].points[0][2] === 1));
  await p.evaluate(() => { editor._sel = 0; editor._render(); editor.querySelector('[data-outline]').click(); });
  check('rectangles turn into an outline', await p.evaluate(() => JSON.stringify(editor._config.house.rooms[0].points) === '[[0,0],[6,0],[6,5],[0,5]]'));
  await p.evaluate(() => editor.querySelector('[data-stool=wall]').click());
  const nw = await p.evaluate(() => editor._config.house.extra_walls.length);
  await drag([1, 1.5], [3, 3.5]);
  await p.evaluate(() => { const s = editor.querySelector('[data-wt]'); s.value = 'half'; s.dispatchEvent(new Event('change')); });
  check('drawing a separate wall at an angle and making it a half wall', await p.evaluate(n => { const w = editor._config.house.extra_walls; return w.length === n + 1 && JSON.stringify(w.at(-1)) === '{"from":[1,1.5],"to":[3,3.5],"type":"half"}'; }, nw));
  await p.waitForTimeout(1500);
  check('the card draws the new shapes', await p.evaluate(() => card._model.rooms.find(r => r.id === 'kitchen').poly.length > 8 && card._model.walls.some(w => w[4] === 'half' && w[0] !== w[2] && w[1] !== w[3])));
  check('no page errors (editor)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('arabic');
  p = await open('?config=demo&lang=ar', { width: 1280, height: 900 });
  check('right-to-left layout and Arabic text', await p.evaluate(() => card.shadowRoot.querySelector('.app').dir === 'rtl' && card.shadowRoot.querySelector('#tabs').textContent.includes('الرئيسية')));
  check('no page errors (arabic)', !p.errors.length, p.errors.join(' | '));
  await p.close();
} finally { await browser.close(); server.close(); }

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall browser tests passed');
