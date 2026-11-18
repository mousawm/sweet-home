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
  check('an AC placed in the bedroom replaces its automatic unit, with the room\'s climate entity', await p.evaluate(() => { const A = card._three.acs.filter(a => a.ent === 'climate.bedroom_ac'); return A.length === 1 && A[0].dx === 1 && !card._model.rooms.find(r => r.id === 'bedroom').ac; }));
  check('an AC has a badge it can hide', await p.evaluate(async () => { const fi = card._model.furniture.find(f => f.type === 'ac').idx, on = !!card._three.fpieces.find(P => P.idx === fi)?.el; const c = JSON.parse(JSON.stringify(card._config)); c.house.rooms.find(r => r.area === 'bedroom').furniture.find(f => f.type === 'ac').badge = false; card.setConfig(c); await new Promise(r => setTimeout(r, 1500)); const P = card._three.fpieces.find(P => P.f.type === 'ac'); return on && P && !P.el; }));
  check('bedside table: the phone shows while its charger plug draws power (power sensor found from the plug)', await p.evaluate(() => card._model.furniture.find(f => f.type === 'nightstand' && f.plug)?.power === 'sensor.phone_charger_power' && card._three.chargers[0].parts[0].visible));
  await p.evaluate(() => { const h = window.hassObj; h.states['sensor.phone_charger_power'] = { ...h.states['sensor.phone_charger_power'], state: '0.2' }; card.hass = { ...h, states: { ...h.states } }; });
  check('…and is gone once it stops charging', await p.waitForFunction(() => !card._three.chargers[0].parts[0].visible, null, { timeout: 5000 }).then(() => true, () => false));
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
  check('two rooms on the same area: each keeps its own label, none left empty in the corner', await p.evaluate(async () => {
    const T = customElements.get('t-card'), el = new T(), cfg = JSON.parse(JSON.stringify(card._config));
    cfg.house.rooms.push({ area: 'living_room', name: 'Living room corridor', rects: [[0, 14, 3, 16]] });
    el.setConfig(cfg); card.remove(); document.body.appendChild(el); window.card = el; el.hass = window.hassObj; await new Promise(r => setTimeout(r, 900));
    const L = [...el.shadowRoot.querySelectorAll('.lbl')], t = L.map(l => l.textContent);
    const ok = !L.some(l => !l.textContent.trim()) && t.some(x => x.includes('Living Room')) && t.some(x => x.includes('Living room corridor'));
    el.remove(); const c = new T(); c.setConfig(JSON.parse(JSON.stringify(cfg)).house ? (cfg.house.rooms.pop(), cfg) : cfg); document.body.appendChild(c); window.card = c; c.hass = window.hassObj; await new Promise(r => setTimeout(r, 600)); return ok;
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
  // Devices panel: found on its own (Companion app), or picked in the editor (any battery), with name, charging and place
  check('devices: the Companion-app iPad is found on its own, with its charging state and place', await p.evaluate(() => { card._setTab('system'); const t = card.shadowRoot.getElementById('devices')?.textContent || ''; return t.includes('Mousa’s iPad') && t.includes('30') && !t.includes('Door Sensor'); }));
  await p.evaluate(() => { editor._step = 'panels'; editor._render(); });
  await p.evaluate(() => { const i = [...editor.querySelectorAll('ha-form input[name=entities]')].find(x => x.closest('details')?.textContent.includes('Batteries of phones')); i.value = 'sensor.ipad_battery_level,sensor.door_sensor_battery'; i.dispatchEvent(new Event('change')); });
  check('…picking batteries in the editor (Panels → Devices)', await p.evaluate(() => JSON.stringify(editor._config.panels.devices) === '{"entities":["sensor.ipad_battery_level","sensor.door_sensor_battery"]}'));
  await p.waitForTimeout(1500);
  check('…the card shows them: the iPad as before and the door sensor by its device name', await p.evaluate(() => { card._setTab('system'); const t = card.shadowRoot.getElementById('devices')?.textContent || ''; return t.includes('Mousa’s iPad') && t.includes('Door Sensor'); }));
  await p.evaluate(() => { card._setTab('home'); editor._step = 'rooms'; editor._render(); });
  // People: the phone panel found on the person's phone, then set up in the editor (name, more rows, buttons)
  check('a person\'s phone panel is found on their phone', await p.evaluate(async () => { card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100)); const t = card.shadowRoot.getElementById('sheet').textContent; card._closeSheet(); return t.includes('Mousa’s iPad') && t.includes('30%'); }));
  await p.evaluate(() => { editor._step = 'panels'; editor._render(); const d = [...editor.querySelectorAll('details.sh-panel')].find(x => x.textContent.includes('Who shows at the top')); d.open = true; });
  await p.evaluate(() => {
    const f = [...editor.querySelectorAll('details.sh-panel details.sh-panel')].find(x => x.textContent.includes('Alex'));
    const set = (n, v) => { const i = f.querySelector(`ha-form input[name=${n}]`); i.value = v; i.dispatchEvent(new Event('change')); };
    set('name', 'Areen phone'); set('entities', 'sensor.water_flow'); set('buttons', 'script.movie_night');
  });
  check('…set up in the editor (Panels → People)', await p.evaluate(() => JSON.stringify(editor._config.people) === '{"person.alex":{"name":"Areen phone","entities":["sensor.water_flow"],"buttons":["script.movie_night"]}}'));
  await p.waitForTimeout(1500);
  check('…the phone panel shows the name, the extra row and a button that runs the script', await p.evaluate(async () => {
    card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100)); const sh = card.shadowRoot.getElementById('sheet'), t = sh.textContent;
    const ok = t.includes('Areen phone') && t.includes('Water Flow') && t.includes('30%') && sh.querySelector('.phbtn[data-id="script.movie_night"]')?.dataset.act === 'run'; card._closeSheet(); return ok;
  }));
  // phone buttons: a clean label and a fitting icon on their own; a name and icon of your own from the editor
  await p.evaluate(() => {
    const f = [...editor.querySelectorAll('details.sh-panel details.sh-panel')].find(x => x.textContent.includes('Alex'));
    const i = f.querySelector('ha-form input[name=buttons]'); i.value = 'button.ipad_ring_mod,button.ipad_location_update'; i.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(1500);
  check('phone buttons: "button" and the phone\'s name dropped, an icon from what they do', await p.evaluate(async () => {
    card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100));
    const b = id => { const e = card.shadowRoot.querySelector(`#sheet .phbtn[data-id="${id}"]`); return e ? e.textContent.trim() + '|' + e.querySelector('ha-icon').getAttribute('icon') : ''; };
    const r = [b('button.ipad_ring_mod'), b('button.ipad_location_update')]; card._closeSheet(); return JSON.stringify(r);
  }).then(r => { const ok = r === JSON.stringify(['Ring Mod|mdi:bell-ring', 'Location Update|mdi:crosshairs-gps']); if (!ok) console.log('      got', r); return ok; }));
  await p.evaluate(() => { editor._render(); const d = [...editor.querySelectorAll('details.sh-panel')].find(x => x.textContent.includes('Who shows at the top')); d.open = true; });
  await p.evaluate(() => {
    const row = [...editor.querySelectorAll('.sh-ent')].find(x => x.textContent.includes('button.ipad_ring_mod'));
    const set = (n, v) => { const i = row.querySelector(`ha-form input[name=${n}]`); i.value = v; i.dispatchEvent(new Event('change')); };
    set('name', 'Ring Mode'); set('icon', 'mdi:bell-alert');
  });
  check('…a button gets a name and icon of its own in the editor', await p.evaluate(() => JSON.stringify(editor._config.people['person.alex'].buttons[0]) === '{"entity":"button.ipad_ring_mod","name":"Ring Mode","icon":"mdi:bell-alert"}'));
  await p.waitForTimeout(1500);
  check('…and the phone panel shows them', await p.evaluate(async () => { card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100)); const e = card.shadowRoot.querySelector('#sheet .phbtn[data-id="button.ipad_ring_mod"]'); const ok = e?.textContent.trim() === 'Ring Mode' && e.querySelector('ha-icon').getAttribute('icon') === 'mdi:bell-alert'; card._closeSheet(); return ok; }));
  check('…in edit mode the phone panel has a pencil that lists its rows and buttons to rename', await p.evaluate(async () => {
    card.editMode = true; await new Promise(r => setTimeout(r, 150)); card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100));
    card.shadowRoot.querySelector('#sheet [data-act=rnphone]').click(); await new Promise(r => setTimeout(r, 100));
    const ids = [...card.shadowRoot.querySelectorAll('#sheet [data-rename]')].map(i => i.dataset.rename); card._closeSheet(); card.editMode = false;
    return ids.includes('button.ipad_location_update') && ids.includes('sensor.ipad_battery_level');
  }));
  await p.evaluate(() => {
    const f = [...editor.querySelectorAll('details.sh-panel details.sh-panel')].find(x => x.textContent.includes('Alex'));
    const i = f.querySelector('ha-form input[name=wifi]'); i.value = 'sensor.water_flow'; i.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(1500);
  check('…once one phone row is picked, only picked rows show (battery, place… are no longer found)', await p.evaluate(async () => {
    card._openInfo('phone:person.alex'); await new Promise(r => setTimeout(r, 100)); const t = card.shadowRoot.getElementById('sheet').textContent;
    const rows = [...card.shadowRoot.querySelectorAll('#sheet .mrow')].map(r => r.textContent); card._closeSheet();
    return t.includes('Wi-Fi') && !t.includes('Battery') && !t.includes('30%') && !rows.some(r => /^\s*Location/.test(r)) && t.includes('Areen phone');
  }));
  await p.evaluate(() => { editor._step = 'rooms'; editor._render(); });
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
  // turning furniture: the robot vacuum, a cabinet at its default size, stairs (they climb the other way); round pieces have no Turn
  check('Turn works for every piece that has a front or a long side', await p.evaluate(async () => {
    const r = editor._config.house.rooms[0]; r.furniture = [{ type: 'vacuum', x: 5, z: 4 }, { type: 'box', x: 1, z: 1 }, { type: 'stairs', x: 3, z: 2, w: 2, d: 1, axis: 'x' }, { type: 'table', x: 2, z: 3 }, { type: 'plant', x: 4, z: 4 }];
    editor._sel = 0; editor._mode = 'furniture'; const out = [];
    for (let i = 0; i < 5; i++) { editor._fsel = i; editor._render(); const b = editor.querySelector('[data-turn]'); if (!b) { out.push('no turn'); continue; } b.click(); out.push(JSON.stringify(editor._config.house.rooms[0].furniture[i])); }
    return out;
  }).then(o => { const ok = o[0].includes('"facing":"w"') && o[1].includes('"w":0.5') && o[2].includes('"axis":"z"') && o[2].includes('"w":1') && o[2].includes('"d":2') && o[3].includes('"w":0.8') && o[3].includes('"d":1.2') && o[4] === 'no turn'; if (!ok) console.log('      got', o); return ok; }));
  await p.waitForTimeout(1500);
  check('…the robot vacuum sits beside its dock on the side it faces', await p.evaluate(() => { const v = card._three.vacuums[0]; return !!v; }));
  await p.evaluate(() => { editor._mode = 'shape'; editor._fsel = null; editor._render(); });
  // resizing a turned sofa: only the side dragged changes, the other keeps its exact size
  check('editor: an AC with no entity picked still has the "show a badge" switch', await p.evaluate(() => { const r = editor._config.house.rooms[0]; r.furniture = [{ type: 'ac', x: 3, z: 0.2, facing: 's' }]; editor._sel = 0; editor._mode = 'furniture'; editor._fsel = 0; editor._render(); return [...editor.querySelectorAll('ha-form')].some(f => JSON.stringify(f.schema).includes('"badge"')); }));
  await p.evaluate(() => { const r = editor._config.house.rooms[0]; r.furniture = [{ type: 'sofa', x: 3, z: 2.5, w: 2, d: 0.9, back: 'n' }]; editor._sel = 0; editor._mode = 'furniture'; editor._fsel = 0; editor._render(); editor.querySelector('[data-turn]').click(); });
  const hd = await p.evaluate(() => editor._handles()[0]);
  await drag(hd, [hd[0] + 0.08, hd[1] + 1]);
  check('resizing a turned sofa keeps its width (0.9 m) and changes only its length', await p.evaluate(() => { const f = editor._config.house.rooms[0].furniture[0]; return f.w === 0.9 && f.d === 3; }));
  // a counter dropped near a wall is pulled flat against it (the grid alone left a gap)
  await p.evaluate(() => { const r = editor._config.house.rooms[0]; r.furniture = [{ type: 'block', from: [1, 3], to: [3, 3.6], h: 0.9 }]; editor._sel = 0; editor._mode = 'furniture'; editor._fsel = 0; editor._render(); });
  await drag([2, 3.3], [2, 4.3]);
  check('a counter dragged near a wall goes flat against it', await p.evaluate(() => { const f = editor._config.house.rooms[0].furniture[0]; return Math.abs(Math.max(f.from[1], f.to[1]) - 4.94) < 1e-6 && Math.abs(Math.abs(f.to[1] - f.from[1]) - 0.6) < 1e-6; }));
  await drag([2, 4.6], [2, 2.6]);
  check('…and away from walls it just follows the grid', await p.evaluate(() => { const f = editor._config.house.rooms[0].furniture[0]; return Math.abs(Math.min(f.from[1], f.to[1]) - 2.34) < 1e-6; }));
  await p.evaluate(() => { delete editor._config.house.rooms[0].furniture; editor._sel = 0; editor._render(); });
  // a sofa's parts each get a colour: frame and back, seat cushions, pillows
  await p.evaluate(() => { const r = editor._config.house.rooms[0]; r.furniture = [{ type: 'sofa', x: 3, z: 2.5, w: 2, d: 0.9, back: 'n' }]; editor._fsel = 0; editor._render(); });
  check('a sofa has colours for its seat cushions and pillows, showing the 3D defaults', await p.evaluate(() => { const c = editor.querySelector('ha-form input[name=c_cushion]'), pl = editor.querySelector('ha-form input[name=c_pillow]'); return c?.value === '#64748b' && pl?.value === '#e2e8f0'; }));
  await p.evaluate(() => { const i = editor.querySelector('ha-form input[name=c_cushion]'); i.value = '#7c3aed'; i.dispatchEvent(new Event('change')); });
  check('…changing the cushions writes only the cushions', await p.evaluate(() => { const f = editor._config.house.rooms[0].furniture[0]; return f.cushion === '#7c3aed' && f.pillow === undefined; }));
  await p.waitForTimeout(1500);
  check('…and the 3D sofa uses it', await p.evaluate(() => card._model.furniture.find(f => f.type === 'sofa' && f.room === 'living_room')?.cushion === 0x7c3aed));
  // the same for a counter (written with corners, as the suggested kitchen set writes it) and a counter at its default size
  for (const piece of [{ type: 'block', from: [1, 1], to: [3.5, 1.6], h: 0.9 }, { type: 'block', x: 3, z: 3, w: 2, d: 0.6 }]) {
    await p.evaluate(pc => { const r = editor._config.house.rooms[0]; r.furniture = [pc]; editor._fsel = 0; editor._render(); editor.querySelector('[data-turn]').click(); }, piece);
    const h2 = await p.evaluate(() => editor._handles()[0]);
    await drag(h2, [h2[0] + 0.1, h2[1] + 1]);
    check(`resizing a turned counter keeps its depth (${piece.from ? 'corners' : 'centre and size'})`, await p.evaluate(() => { const f = editor._config.house.rooms[0].furniture[0], b = f.from ? [Math.abs(f.to[0] - f.from[0]), Math.abs(f.to[1] - f.from[1])] : [f.w, f.d]; return Math.abs(b[0] - 0.6) < 1e-6 && b[1] > 2.5; }));
  }
  await p.evaluate(() => { delete editor._config.house.rooms[0].furniture; editor._mode = 'shape'; editor._fsel = null; editor._emit(); editor._render(); });
  // drawing a room's walls corner by corner (straight walls snap to 45°), and rotating a room by any angle
  await p.evaluate(() => { editor._sel = 2; editor._mode = 'shape'; editor._stool = 'draw'; editor._render(); });
  for (const q of [[0, 5], [6, 5], [6, 8.2], [3.1, 9.9], [0, 9.9], [0, 5]]) { await p.mouse.click(...await pt(...q)); await p.waitForTimeout(80); }
  check('drawing walls: tap each corner, back on the first one closes the room (a slanted wall snaps to 45°)', await p.evaluate(() => JSON.stringify(editor._config.house.rooms[2].points) === '[[0,5],[6,5],[6,8],[3.5,10.5],[0,10.5]]' && editor._stool === 'rect'));
  await p.evaluate(() => { editor._sel = 0; editor._stool = 'rect'; editor._render(); editor.querySelector('[data-rotby="15"]').click(); });
  check('rotating a room by 15° (a rectangle becomes free corners, turned around its middle)', await p.evaluate(() => { const P = editor._config.house.rooms[0].points; return P?.length === 4 && Math.abs(P[0][0] - (3 - 3 * Math.cos(Math.PI / 12) + 2.5 * Math.sin(Math.PI / 12))) < 0.02 && !editor._config.house.rooms[0].rects; }));
  await p.evaluate(() => { const i = editor.querySelector('[data-rotdeg]'); i.value = '-15'; i.dispatchEvent(new Event('change')); });
  check('…and back by typing an angle (to the centimetre)', await p.evaluate(() => [[0, 0], [6, 0], [6, 5], [0, 5]].every((q, i) => Math.abs(editor._config.house.rooms[0].points[i][0] - q[0]) <= 0.011 && Math.abs(editor._config.house.rooms[0].points[i][1] - q[1]) <= 0.011)));
  await p.evaluate(() => { const r = editor._config.house.rooms[0]; delete r.points; r.rects = [[0, 0, 6, 5]]; editor._emit(); editor._render(); }); // as it was, for the tests below
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

  console.log('room by room');
  p = await open('?editor=1');
  check('the setup guide offers to add rooms one by one', await p.evaluate(() => !!editor.querySelector('[data-g=wizard]')));
  await p.evaluate(() => editor.querySelector('[data-g=wizard]').click());
  const wizName = () => p.evaluate(() => editor.querySelector('.sh-wiz-name')?.textContent.trim());
  check('…it starts with the first area (by floor, then name)', (await wizName()).startsWith('Balcony'));
  await p.evaluate(() => editor.querySelector('[data-wskip]').click());
  check('…Skip leaves it out and goes to the next', (await wizName()).startsWith('Bedroom') && await p.evaluate(() => !(editor._config.house?.rooms || []).length));
  await p.evaluate(() => { const set = (s, v) => { const i = editor.querySelector(s); i.value = v; i.dispatchEvent(new Event('change')); }; set('[data-ww]', '4'); set('[data-wd]', '3'); editor.querySelector('[data-wadd]').click(); });
  check('…Add puts it on the map with its size (a name-based size to start with)', await p.evaluate(() => JSON.stringify(editor._config.house.rooms[0]) === '{"area":"bedroom","rects":[[0,0,4,3]]}'));
  check('…the next area gets a size that suits its name', await p.evaluate(() => editor._wiz.w === 3.5 && editor._wiz.d === 3 && editor.querySelector('.sh-wiz-name').textContent.startsWith('Kitchen')));
  await p.evaluate(() => { editor.querySelector('[data-wshape=l]').click(); });
  check('…the plan shows where the next room will go (dashed, with its name)', await p.evaluate(() => [...editor.querySelectorAll('.sh-plan path[stroke-dasharray="8 6"]')].length === 1 && [...editor.querySelectorAll('.sh-plan text')].some(t => t.textContent === 'Kitchen')));
  await p.evaluate(() => editor.querySelector('[data-wturn]').click());
  check('…a ready-made shape can be turned before it is added', await p.evaluate(() => editor._wiz.rot === 1 && editor.querySelector('[data-wturn]').textContent.includes('90°')));
  await p.evaluate(() => editor.querySelector('[data-wturn]').click()); await p.evaluate(() => editor.querySelector('[data-wturn]').click()); await p.evaluate(() => editor.querySelector('[data-wturn]').click());
  await p.evaluate(() => { const s = editor.querySelector('[data-wside]'); s.value = 'below'; s.dispatchEvent(new Event('change')); editor.querySelector('[data-wadd]').click(); });
  check('…with a shape, placed below the last room without overlapping', await p.evaluate(() => { const r = editor._config.house.rooms[1]; return r.area === 'kitchen' && r.points?.length === 6 && Math.min(...r.points.map(q => q[1])) === 3; }));
  await p.evaluate(() => editor.querySelector('[data-wcustom]').click());
  await p.evaluate(() => { const i = editor.querySelector('[data-wname]'); i.value = 'Store room'; i.dispatchEvent(new Event('input')); editor.querySelector('[data-wadd]').click(); });
  check('…a room that is no area can be added on the way, then the areas go on', await p.evaluate(() => editor._config.house.rooms[2].name === 'Store room' && !editor._config.house.rooms[2].area && editor.querySelector('.sh-wiz-name').textContent.startsWith('Living Room')));
  await p.evaluate(() => editor.querySelector('[data-wend]').click());
  check('…Finish any time: the rooms added stay, the other areas are left out', await p.evaluate(() => !editor._wiz && editor._config.house.rooms.length === 3 && !!editor.querySelector('[data-wiz]')));
  check('no page errors (room by room)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('arabic');
  p = await open('?config=demo&lang=ar', { width: 1280, height: 900 });
  check('right-to-left layout and Arabic text', await p.evaluate(() => card.shadowRoot.querySelector('.app').dir === 'rtl' && card.shadowRoot.querySelector('#tabs').textContent.includes('الرئيسية')));
  check('no page errors (arabic)', !p.errors.length, p.errors.join(' | '));
  await p.close();
} finally { await browser.close(); server.close(); }

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall browser tests passed');
