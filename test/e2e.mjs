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
  p.outside = []; p.on('request', r => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) p.outside.push(r.url()); });
  await p.goto(base + query); await p.waitForFunction(() => window.ready); await p.waitForFunction(() => window.card._three, null, { timeout: 15000 });
  return p;
}

  // card-mod puts a <card-mod> element (holding the card_mod styles) inside the card: it must survive the card's redraws
  const cardModSurvives = pg => pg.evaluate(async () => {
    const R = card.shadowRoot, wait = ms => new Promise(r => setTimeout(r, ms)), cfg0 = card._config, out = {};
    const cm = document.createElement('card-mod'); cm.innerHTML = '<style>:host{--teal:rgb(1, 2, 3)}</style>'; R.appendChild(cm);
    const teal = () => getComputedStyle(card).getPropertyValue('--teal').trim();
    out.applied = teal() === 'rgb(1, 2, 3)';
    card.setConfig({ ...cfg0, title: 'Renamed' }); await wait(700); // a soft redraw (the house is the same)
    out.soft = cm.isConnected && cm.parentNode === R && teal() === 'rgb(1, 2, 3)' && R.querySelectorAll('card-mod').length === 1;
    card.setConfig({ ...cfg0, house: { ...(cfg0.house || {}), wall_height: 1.2 } }); await wait(1200); // the house changed: rebuilt
    out.hard = cm.isConnected && teal() === 'rgb(1, 2, 3)' && R.querySelectorAll('card-mod').length === 1;
    card.setConfig(cfg0); await wait(1200); cm.remove();
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  });
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
  { const r = await p.evaluate(() => {
    // a room's dimmable light that is on: its % shows once, on the light's row, and the slider under it moves that number
    const w = [...card.shadowRoot.querySelectorAll('#drawer .lwrap')].find(x => x.querySelector('[data-id="light.living_room"]'));
    const sl = w?.querySelector('input[data-bright]'), top = w?.querySelector('.lrow b');
    const out = { slider: !!sl, noSecond: !w?.querySelector('.slrow em'), linked: !!sl && sl.dataset.lbl === top?.id, before: top?.textContent };
    if (sl) { sl.value = 37; sl.dispatchEvent(new Event('input', { bubbles: true })); }
    out.after = top?.textContent; out.count = (w?.textContent.match(/\d+%/g) || []).length;
    return (out.slider && out.noSecond && out.linked && out.before === '78%' && out.after === '37%' && out.count === 1) || JSON.stringify(out);
  }); check('room light: the dimmer % shows once (on the row), and moves with the slider', r === true, r); }
  await p.evaluate(() => card.shadowRoot.querySelector('#drawer [data-act=run]').click());
  check('a room\'s other sensors (a people count) are under Sensors, scripts stay under Other', await p.evaluate(async () => {
    const h = window.hassObj; h.states['sensor.living_people'] = { entity_id: 'sensor.living_people', state: '2', attributes: { friendly_name: 'People Detected' } }; h.entities['sensor.living_people'] = { entity_id: 'sensor.living_people', area_id: 'living_room' };
    card.hass = { ...h, states: { ...h.states }, entities: { ...h.entities } }; const c = JSON.parse(JSON.stringify(card._config)); c.house.rooms.find(r => r.area === 'living_room').entities = ['script.movie_night', 'cover.living_room_blinds', 'sensor.living_people']; card.setConfig(c); await new Promise(r => setTimeout(r, 800)); card._select('living_room'); await new Promise(r => setTimeout(r, 200));
    const secOf = id => { let n = card.shadowRoot.querySelector(`#drawer [data-id="${id}"]`); while (n && !n.classList?.contains('dsec')) n = n.previousElementSibling || n.parentElement; return n?.textContent; };
    return secOf('sensor.living_people') === 'Sensors' && secOf('script.movie_night') === 'Other';
  }));
  check('rows get icons from their names: a fan switch, a water heater, a plug named after its device', await p.evaluate(() => {
    const h = window.hassObj, add = (id, n) => { h.states[id] = { entity_id: id, state: 'on', attributes: { friendly_name: n } }; };
    add('switch.bathroom_fan', 'Fan'); add('switch.boiler', 'Water Heater'); add('switch.kettle_plug', 'Kettle'); card.hass = { ...h, states: { ...h.states } };
    const icon = html => (html.match(/icon="([^"]+)"/) || [])[1];
    return icon(card._entRow('switch.bathroom_fan')) === 'mdi:fan' && /spin/.test(card._entRow('switch.bathroom_fan')) && icon(card._entRow('switch.boiler')) === 'mdi:water-boiler' && icon(card._entRow('switch.kettle_plug')) === 'mdi:kettle';
  }));
  check('scripts run from the popup', await p.evaluate(() => (window.calls || []).some(c => c[0] === 'homeassistant' && c[2].entity_id === 'script.movie_night')));
  check('rename and move are hidden outside edit mode', await p.evaluate(() => !card.shadowRoot.querySelector('#drawer [data-act=names]') && !card.shadowRoot.querySelector('[data-act=rnsec]') && getComputedStyle(card.shadowRoot.getElementById('arrBtn')).display === 'none'));
  await p.evaluate(() => { card.editMode = true; }); await p.waitForTimeout(100);
  check('…and shown while the dashboard is edited', await p.evaluate(() => !!card.shadowRoot.querySelector('#drawer [data-act=names]') && !!card.shadowRoot.querySelector('#modes [data-act=rnsec]') && getComputedStyle(card.shadowRoot.getElementById('arrBtn')).display !== 'none'));
  check('…but not on panels or rooms with nothing to rename', await p.evaluate(() => !card.shadowRoot.querySelector('#glance [data-act=rnsec]') && card._rnPanelIds('glance', card.shadowRoot.getElementById('glance')).length === 0
    && (() => { // a room popup gets its pencil only when the room has entities (the demo has rooms of both kinds)
      const sel = card._sel, pen = r => { card._sel = r.id; return card._rDrawer().includes('data-act="names"'); };
      const ok = card._model.rooms.some(r => !card._roomRnIds(r).length) && card._model.rooms.every(r => pen(r) === !!card._roomRnIds(r).length);
      card._sel = sel; return ok;
    })()));
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
  { const r = await p.evaluate(() => {
    const t = card._three, id = Object.keys(t.rooms)[0], r = t.rooms[id].r, keep = r.plugs, h = window.hassObj;
    h.states['switch.badge_fan'] = { entity_id: 'switch.badge_fan', state: 'on', attributes: { friendly_name: 'Fan' } };
    h.states['sensor.badge_fan_power'] = { entity_id: 'sensor.badge_fan_power', state: '10', attributes: { unit_of_measurement: 'W' } };
    card.hass = { ...h, states: { ...h.states } };
    const icons = () => { t.lbls[id]._sig = ''; t.sync(); return [...t.lbls[id].querySelectorAll('ha-icon')].map(i => i.getAttribute('icon')); };
    r.plugs = [{ id: 'switch.badge_fan', name: 'Fan', icon: 'mdi:power-socket-eu', power: 'sensor.badge_fan_power' }];
    const fan = icons();
    // drawn like the badge's other icons: no tile around it (a class name shared with another panel gave it one)
    const fi = t.lbls[id].querySelector('ha-icon[icon="mdi:fan"]'), cs = fi && getComputedStyle(fi), plain = cs && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(cs.paddingLeft) === 0 && cs.borderTopStyle === 'none';
    r.plugs = [{ id: 'switch.badge_fan', name: 'Phone charger', icon: 'mdi:power-socket-eu', power: 'sensor.badge_fan_power' }];
    const chg = icons();
    r.plugs = keep; icons();
    return fan.includes('mdi:fan') && !fan.includes('mdi:battery-charging') && chg.includes('mdi:battery-charging') && plain || JSON.stringify({ fan, chg, plain });
  }); check('room badge: a fan plug that is on shows a plain fan icon (no tile), not a charging battery; only a charger shows the battery', r === true, r); }
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
  { const r = await p.evaluate(() => {
    let fired = 0; const on = () => fired++; card.addEventListener('hass-more-info', on);
    card.more(null); card.more('null'); card.more(undefined); card.more('sensor.does_not_exist');
    card.removeEventListener('hass-more-info', on);
    const tpl = document.createElement('template'); tpl.innerHTML = card._rEnergy(); // the Energy card's markup (it is drawn when it scrolls into view)
    const nodes = [...tpl.content.querySelectorAll('.flow .node.n-home, .flow .node.n-sun, .flow .node.n-grid')];
    return (!fired && nodes.length === 3 && nodes.every(n => !n.dataset.act ? !n.dataset.id : n.dataset.act === 'more' && !!card._hass.states[n.dataset.id])
      && !tpl.content.querySelector('.n-home').dataset.act && !/Home ·/.test(tpl.content.querySelector('.n-home').textContent)) || JSON.stringify({ fired, n: nodes.map(n => [n.className, n.dataset.act, n.dataset.id, n.dataset.kind]) });
  }); check('energy flow: Home / Solar / Grid open their own sensor, or do nothing without one (never a "null" dialog)', r === true, r); }
  // ---- Jellyfin + JellyHA: Now Watching, clients and library from JellyHA; playing on the TV through the official integration
  // a shared setup: JellyHA's players and sensor, the official integration's phone app, a Shield (Android TV over ADB)
  const jfSetup = `(() => {
    const h = window.hassObj, old = new Date(Date.now() - 6e5).toISOString();
    const put = (id, state, a, platform, device_id) => { h.states[id] = { entity_id: id, state, attributes: a, last_updated: old }; h.entities[id] = { entity_id: id, platform, ...(device_id ? { device_id } : {}) }; };
    const now = { media_title: 'Pilot', media_series_title: 'Show', session_id: 's1', supported_features: 512 | 1, supports_remote_control: true };
    put('media_player.jellyha_library_browser', 'idle', { friendly_name: 'JellyHA Library', supported_features: 512 }, 'jellyha');
    put('media_player.jellyha_user_mousa', 'playing', { ...now, friendly_name: 'JellyHA User mousa' }, 'jellyha');
    put('media_player.jellyha_device_shield', 'playing', { ...now, friendly_name: 'JellyHA Device SHIELD', device_name: 'SHIELD', client: 'Jellyfin for Android TV', device_id: 'dev-shield' }, 'jellyha');
    put('sensor.jellyha_connected_clients', '38', {}, 'jellyha'); put('sensor.jellyha_active_sessions', '2', {}, 'jellyha');
    put('sensor.jellyfin_active_clients', '1', {}, 'jellyfin');
    h.devices.jfphone = { id: 'jfphone', name: 'Pixel 8', model: 'Jellyfin Android' }; h.devices.jfshield = { id: 'jfshield', name: 'SHIELD', model: 'Jellyfin Android TV' };
    put('media_player.pixel_8', 'idle', { friendly_name: 'Pixel 8', supported_features: 512 }, 'jellyfin', 'jfphone');
    put('media_player.shield', 'on', { friendly_name: 'Shield', source_list: ['Jellyfin'], source: 'Home' }, 'androidtv');
    window.jfCleanup = () => { for (const id of ['media_player.jellyha_library_browser', 'media_player.jellyha_user_mousa', 'media_player.jellyha_device_shield', 'sensor.jellyha_connected_clients', 'sensor.jellyha_active_sessions',
      'sensor.jellyfin_active_clients', 'media_player.pixel_8', 'media_player.shield', 'media_player.shield_jellyfin']) { delete h.states[id]; delete h.entities[id]; } delete h.devices.jfphone; delete h.devices.jfshield; };
    // the TV's official Jellyfin session: appears once the app has been opened on the TV
    window.jfShieldSession = () => { put('media_player.shield_jellyfin', 'idle', { friendly_name: 'SHIELD', supported_features: 512 }, 'jellyfin', 'jfshield'); h.states['media_player.shield_jellyfin'].last_updated = new Date().toISOString(); };
  })()`;
  { const r = await p.evaluate(async setup => {
    eval(setup); const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config));
    const M = 'media-source://jellyha', E1 = M + '/e1', G1 = 'a'.repeat(32), G2 = 'b'.repeat(32), SH = 'c'.repeat(32), SE = 'd'.repeat(32), EP = 'e'.repeat(32);
    const dir = (title, id) => ({ title, media_content_id: id, can_play: false, can_expand: true });
    const tree = {
      [M]: { children: [dir('JellyHA (mousawm)', E1)] },
      [E1]: { children: [dir('📽️ Movies', E1 + '/movies'), dir('📺 TV Series', E1 + '/series'), dir('🆕 Recently Added', E1 + '/recent'), dir('❤️ Favorites', E1 + '/favorites')] },
      [E1 + '/movies']: { children: [{ title: 'Heat (1995)', media_content_id: E1 + '/item/' + G1, can_play: true, can_expand: false, media_class: 'movie' }, { title: 'No Year ()', media_content_id: E1 + '/item/' + G2, can_play: true, can_expand: false, media_class: 'movie' }] },
      [E1 + '/series']: { children: [{ title: 'Show (2020)', media_content_id: E1 + '/show/' + SH, can_play: true, can_expand: true, media_class: 'tv_show' }] },
      [E1 + '/show/' + SH]: { title: 'Show (2020)', children: [{ title: 'Season 1', media_content_id: E1 + '/season/' + SE, can_play: true, can_expand: true }] },
      [E1 + '/season/' + SE]: { children: [{ title: '1. Pilot', media_content_id: E1 + '/item/' + EP, can_play: true, can_expand: false, media_class: 'episode' }] } };
    const orig = h.callWS; h.callWS = async m => m.type === 'media_source/browse_media' && m.media_content_id.startsWith(M) ? tree[m.media_content_id] || { children: [] } : orig(m);
    const c2 = JSON.parse(JSON.stringify(cfg)); c2.panels = { ...(c2.panels || {}), media_server: { integration: 'hybrid' } };
    card.setConfig(c2); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 1500)); card._jfc = {};
    const tpl = document.createElement('template'); tpl.innerHTML = card._rMServer();
    const rows = [...tpl.content.querySelectorAll('.jfs')], out = {
      rows: rows.length, rowTxt: rows[0]?.textContent.replace(/\s+/g, ' ').trim(), clients: /\b2 clients/.test(tpl.content.textContent) && !/38 clients/.test(tpl.content.textContent),
      // playing: only the official integration's players, never JellyHA's; the phone's app is not a target when there is a TV
      sessions: card._jfSessions().map(x => x.st.entity_id).join(), targets: card._jfTargets({ id: 'media_player.shield' }).map(x => x.st.entity_id).join() };
    card._openInfo('jflib:movies'); await new Promise(r => setTimeout(r, 300));
    const sh = () => card.shadowRoot.getElementById('sheet');
    out.items = [...sh().querySelectorAll('.jfpo')].map(b => [b.dataset.item, b.dataset.title]);
    card._openInfo('jflib:shows'); await new Promise(r => setTimeout(r, 300));
    const showBtn = sh().querySelector('.jfpo[data-kind^="jfshow:"]');
    card._openInfo(showBtn?.dataset.kind || 'jfshow:none'); await new Promise(r => setTimeout(r, 400));
    out.eps = [...sh().querySelectorAll('.jfep')].map(b => [b.dataset.item, b.querySelector('b')?.textContent]);
    card._closeSheet(); h.callWS = orig; window.jfCleanup();
    card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 1200)); card._jfc = {};
    const ok = out.rows === 1 && /SHIELD/.test(out.rowTxt) && !/JellyHA/.test(out.rowTxt) && out.clients && out.sessions === 'media_player.pixel_8' && out.targets === ''
      && JSON.stringify(out.items) === JSON.stringify([[G1, 'Heat (1995)'], [G2, 'No Year']]) && JSON.stringify(out.eps) === JSON.stringify([[EP, '1. Pilot']]);
    return ok || JSON.stringify(out);
  }, jfSetup); check('Jellyfin + JellyHA: Now Watching, clients and Shows / Movies from JellyHA; only the official Jellyfin players play (never JellyHA\'s, never the phone)', r === true, r); }
  for (const qc of [false, true]) { const r = await p.evaluate(async ([setup, qc]) => {
    // tapping a movie: Jellyfin is opened on the Shield, its official session appears, the movie is sent there with
    // play_media (the Jellyfin item id from JellyHA's library); no JellyHA service is used. Quick Connect: only after Play.
    eval(setup); const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config)), G = 'f'.repeat(32);
    const calls = [], origS = h.callService; h.callService = async (d, sv, data) => { calls.push([d, sv, data]); };
    const c2 = JSON.parse(JSON.stringify(cfg)); c2.panels = { ...(c2.panels || {}), media_server: { integration: 'hybrid', ...(qc ? { jellyfin_tv: { quick_connect: true } } : {}) } };
    card.setConfig(c2); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 1200));
    window.calls = []; card._openInfo('jflib:movies');
    const all = () => [...calls, ...window.calls];
    const done = card._jfPlay(G, 'movie', 'Heat');
    for (let i = 0; i < 60 && !window.calls.some(c => c[1] === 'select_source'); i++) await new Promise(r => setTimeout(r, 100));
    const out = { opened: window.calls.some(c => c[1] === 'select_source'), restarted: window.calls.some(c => c[1] === 'adb_command') };
    if (qc) {
      const btn = () => card.shadowRoot.querySelector('#sheet [data-act="jfqc"]');
      for (let i = 0; i < 40 && !btn(); i++) await new Promise(r => setTimeout(r, 100));
      out.asked = !!btn(); window.jfShieldSession(); card.hass = { ...h, states: { ...h.states } };
      await new Promise(r => setTimeout(r, 1000)); out.sentBeforePlay = all().some(([, sv, x]) => sv === 'play_media' && x.entity_id !== 'media_player.shield');
      btn()?.click();
    } else { await new Promise(r => setTimeout(r, 500)); window.jfShieldSession(); card.hass = { ...h, states: { ...h.states } }; }
    await done;
    const sent = all().filter(([, sv, x]) => sv === 'play_media' && x.media_content_type !== 'app').map(([, , x]) => x.entity_id + ':' + x.media_content_id);
    out.sent = sent; out.jellyha = all().some(([d]) => d === 'jellyha');
    card._closeSheet(); h.callService = origS; window.jfCleanup();
    card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 1200));
    const ok = out.opened && out.restarted && sent.length === 1 && sent[0] === 'media_player.shield_jellyfin:' + G && !out.jellyha && (!qc || (out.asked && !out.sentBeforePlay));
    return ok || JSON.stringify(out);
  }, [jfSetup, qc]); check(qc ? 'Jellyfin + JellyHA with Quick Connect: Jellyfin opens on the TV, the sheet asks to sign in, the movie goes to the TV\'s official Jellyfin session only after Play'
    : 'Jellyfin + JellyHA: tapping a movie opens Jellyfin on the TV and plays it on the TV\'s official Jellyfin session (no JellyHA service)', r === true, r); }
  { const r = await p.evaluate(async () => {
    const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config));
    h.states['sensor.my_month'] = { entity_id: 'sensor.my_month', state: '999', attributes: { unit_of_measurement: 'kWh' } };
    const kpis = () => { const t = document.createElement('template'); t.innerHTML = card._eCardKpis(); return [...t.content.querySelectorAll('div > div')].map(d => [d.querySelector('span')?.textContent, d.dataset.id, d.querySelector('b')?.textContent]); };
    const set = async en => { const c = JSON.parse(JSON.stringify(cfg)); c.panels = { ...(c.panels || {}), energy: en }; card.setConfig(c); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800)); card._etot = { d: 1.5, m: 42.25, y: 300, at: Date.now() }; };
    await set({ month_sensor: 'sensor.my_month' }); const on = kpis().find(k => k[0] === 'Month');
    await set({ month_sensor: 'sensor.my_month', energy_dashboard_totals: false }); const off = kpis().find(k => k[0] === 'Month');
    delete h.states['sensor.my_month']; card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800));
    return (on?.[1] !== 'sensor.my_month' && /42\.3/.test(on?.[2]) && off?.[1] === 'sensor.my_month' && /999/.test(off?.[2])) || JSON.stringify({ on, off });
  }); check('Energy card: Month and Year come from Home Assistant\'s Energy data, also when Month / Year sensors are set (switch on by default)', r === true, r); }
  { const r = await p.evaluate(async () => {
    // Stored: shown on the Energy card with a stored-energy sensor; not shown when none is set or it doesn't exist
    const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config));
    h.states['sensor.energy_stored'] = { entity_id: 'sensor.energy_stored', state: '12.4', attributes: { unit_of_measurement: 'kWh' } };
    const tiles = () => { const t = document.createElement('template'); t.innerHTML = card._eCardKpis(); return [...t.content.querySelectorAll('.kpis > div')].map(d => [d.querySelector('span')?.textContent, d.dataset.id || '']); };
    const set = async en => { const c = JSON.parse(JSON.stringify(cfg)); c.panels = { ...(c.panels || {}), energy: en }; card.setConfig(c); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800)); };
    await set({ stored_sensor: 'sensor.energy_stored' }); const withS = tiles();
    await set({}); const none = tiles();
    await set({ stored_sensor: 'sensor.not_there' }); const missing = tiles();
    delete h.states['sensor.energy_stored']; card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800));
    const names = x => x.map(t => t[0]).join();
    return (names(withS) === 'Today,Month,Year,Stored' && withS[3][1] === 'sensor.energy_stored' && names(none) === 'Today,Month,Year' && names(missing) === 'Today,Month,Year') || JSON.stringify({ withS, none, missing });
  }); check('Energy card: Stored shows with a stored-energy sensor, and is hidden when none is set or it doesn\'t exist', r === true, r); }
  { const r = await p.evaluate(async () => {
    // the TV light panel switched off in the editor hides its card
    const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config));
    h.states['light.tv_backlight'] = { entity_id: 'light.tv_backlight', state: 'on', attributes: { friendly_name: 'TV Backlight' } };
    const show = async tl => { const c = JSON.parse(JSON.stringify(cfg)); c.panels = { ...(c.panels || {}), tv_light: tl }; card.setConfig(c); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 900)); return card.shadowRoot.getElementById('tvlight')?.style.display !== 'none'; };
    const on = await show({ light: 'light.tv_backlight' }), off = await show(false);
    delete h.states['light.tv_backlight']; card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 900));
    return (on && !off) || JSON.stringify({ on, off });
  }); check('TV light card: shown with a backlight, hidden when its panel is switched off', r === true, r); }
  { const r = await p.evaluate(async () => {
    // Home Lab: a picked sensor replaces the node's; auto_guests off lists only the picked servers
    const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config));
    h.states['sensor.my_cpu'] = { entity_id: 'sensor.my_cpu', state: '77', attributes: { unit_of_measurement: '%' } };
    const html = () => { const t = document.createElement('template'); t.innerHTML = card._rLab(); return t.content; };
    const set = async hl => { const c = JSON.parse(JSON.stringify(cfg)); c.panels = { ...(c.panels || {}), homelab: hl }; card.setConfig(c); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800)); card._labMore = true; };
    await set({}); const all = html().querySelectorAll('.vm').length;
    await set({ cpu: 'sensor.my_cpu', auto_guests: false, pinned: ['lxc_jellyfin_102', 'qemu_haos_103'] });
    const c = html(), only = [...c.querySelectorAll('.vm')].map(v => v.dataset.gid).join(), cpu = c.querySelector('.ring')?.dataset.id, more = !!c.querySelector('[data-act=labmore]');
    await set({ pinned: ['lxc_jellyfin_102'] }); const pinnedFirst = html().querySelector('.vm')?.dataset.gid, stillAll = html().querySelectorAll('.vm').length;
    delete h.states['sensor.my_cpu']; card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 800)); card._labMore = false;
    return (all === 8 && only === '102,103' && cpu === 'sensor.my_cpu' && !more && pinnedFirst === '102' && stillAll === 8) || JSON.stringify({ all, only, cpu, more, pinnedFirst, stillAll });
  }); check('Home Lab: a picked CPU sensor is used; with automatic servers off only the picked ones are listed; on, pinned ones come first', r === true, r); }
  { const r = await p.evaluate(async () => {
    // a living room light set as the TV backlight: the 3D view draws the glow on the room's TV, and it lights up with the light
    const h = window.hassObj, cfg = JSON.parse(JSON.stringify(card._config)), c2 = JSON.parse(JSON.stringify(cfg));
    const lr = c2.house.rooms.find(x => x.area === 'living_room'); if (!lr) return 'no living room';
    lr.light_fx = { ...(lr.light_fx || {}), 'light.living_room': 'tv' };
    if (!(lr.furniture || []).some(f => f.type === 'tv')) lr.furniture = [...(lr.furniture || []), { type: 'tv', x: 2, z: 1, facing: 'e', w: 1.4 }];
    card.setConfig(c2); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 2500));
    const R = card._three.rooms.living_room, out = { glow: !!R?.tv, target: R?.tvT, on: h.states['light.living_room']?.state };
    card.setConfig(cfg); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 2500));
    return (out.glow && out.on === 'on' && out.target > 0) || JSON.stringify(out);
  }); check('TV backlight: a light set as the TV backlight gets its glow on the room\'s TV in 3D (no tv_glow needed)', r === true, r); }
  { const r = await p.evaluate(async () => {
    // the TV's 3D screen shows a picture while the TV is on: its cover art (a Home Assistant URL) or the lit "on" picture
    const tab0 = card._tab; card._setTab('home'); await new Promise(r => setTimeout(r, 300)); // the 3D view follows Home Assistant on the Home tab
    const h = window.hassObj, three = card._three, tv = (three.tvs || [])[0]; if (!tv?.sp) return 'no TV screen';
    const id = tv.entity || card._model.E.media.tv, was = h.states[id] && { ...h.states[id] };
    const put = async (state, attrs = {}) => { h.states[id] = { entity_id: id, state, attributes: { friendly_name: 'TV', ...attrs }, last_updated: new Date().toISOString() }; card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 900)); };
    const facing = card._model.furniture.find(f => f.type === 'tv')?.facing || 'n';
    const normal = { x: Math.round(Math.sin(tv.sp.rotation.y)), z: Math.round(Math.cos(tv.sp.rotation.y)) }, want = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[facing];
    const out = { faces: normal.x === want[0] && normal.z === want[1] };
    await put('on'); out.on = tv.vis === 1 && tv.sp.visible && tv.scr.map === three._tvIdle;
    await put('playing', { entity_picture: '/api/media_player_proxy/' + id + '?token=x' }); out.art = tv.pic === '/api/media_player_proxy/' + id + '?token=x';
    await put('playing', { entity_picture: 'https://example.com/a.jpg' }); out.noOutside = tv.pic === null && tv.scr.map === three._tvIdle;
    await put('off'); await new Promise(r => setTimeout(r, 1200)); out.off = tv.vis === 0 && !tv.sp.visible;
    if (was) h.states[id] = was; else delete h.states[id]; card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 600)); card._setTab(tab0);
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('TV screen in 3D: faces the room, shows a picture while the TV is on (cover art from Home Assistant, else a lit screen), dark when off', r === true, r); }
  { const r = await p.evaluate(() => {
    // Energy History: with some devices picked, "Show all" is the legend's first button (top row), not wrapped at the end
    const z = () => new Array(24).fill(0), eh0 = card._eh, c0 = card._ehCache;
    card._eh = { p: 'day', off: 0, sel: ['sensor.x'], bar: null }; card._ehCache = { 'day|0': { gi: z(), go: z(), so: z(), home: z(), dev: {} } };
    const t = document.createElement('template'); t.innerHTML = card._rEHist();
    const first = t.content.querySelector('.ehlg > *'), last = t.content.querySelector('.ehlg > *:last-child');
    card._eh = { p: 'day', off: 0, sel: null, bar: null }; card._ehBody = null; const t2 = document.createElement('template'); t2.innerHTML = card._rEHist(); const none = !t2.content.querySelector('.ehlg .rst');
    card._eh = eh0; card._ehCache = c0;
    return (first?.dataset.act === 'ehreset' && /Show all/.test(first.textContent) && /Other/.test(last?.textContent) && none) || JSON.stringify({ first: first?.outerHTML.slice(0, 80), last: last?.textContent, none });
  }); check('Energy History: "Show all" comes first in the legend (only while devices are picked)', r === true, r); }
  check('EV car card on the Energy tab: name, charging power, battery and range, colour', await p.evaluate(() => {
    const c = card.shadowRoot.getElementById('car'), t = c?.textContent || '';
    return c.style.display !== 'none' && t.includes('Model Y') && t.includes('7.20') && t.includes('64%') && t.includes('310') && !!c.querySelector('stop[stop-color="#dc2626"]');
  }));
  await p.evaluate(() => card._setTab('home'));
  check('doors without a sensor are drawn', await p.evaluate(() => card._model.doors.filter(d => !d.id).length === 6));
  check('a door placed off its wall snaps onto it and opens a gap', await p.evaluate(() => { const d = card._model.doors[5]; return d.z === 5 && !card._model.walls.some(w => w[5] === 0 && w[1] === 5 && w[3] === 5 && Math.min(w[0], w[2]) < d.x + 0.9 && Math.max(w[0], w[2]) > d.x + 0.1); }));
  check('every door opens to the side its floor-plan arc shows, whichever way it was drawn', await p.evaluate(() => card._three.doors.every(D => {
    const { vx, vz, side } = D.d, a = D.ang, ox = vx * Math.cos(a) + vz * Math.sin(a), oz = -vx * Math.sin(a) + vz * Math.cos(a);
    return (ox * -vz + oz * vx) * side > 0.5; // the open leaf points to (-vz, vx) for side 1 (the plan's arc), the other way for -1
  }) && card._three.doors.length > 3));
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
  check('a gate with an open / closed sensor is listed with the doors, open while its sensor says open', await p.evaluate(async () => {
    const H = window.hassObj; card.hass = { ...H, states: { ...H.states, 'sensor.gate_cam_gate_state': { ...H.states['sensor.gate_cam_gate_state'], state: 'open' }, 'binary_sensor.gate': { ...H.states['binary_sensor.gate'], state: 'off' } } };
    await new Promise(r => setTimeout(r, 250)); card._setTab('security'); await new Promise(r => setTimeout(r, 150));
    const chip = [...card.shadowRoot.querySelectorAll('#security .door')].find(d => d.textContent.trim() === 'Gate'); card._setTab('home');
    return !!chip && chip.classList.contains('open') && chip.dataset.id === 'sensor.gate_cam_gate_state';
  }));
  check('the Security tab\'s counter follows a gate opening and closing right away', await p.evaluate(async () => {
    const H = window.hassObj, put = async st => { card.hass = { ...H, states: { ...H.states, 'sensor.gate_cam_gate_state': { ...H.states['sensor.gate_cam_gate_state'], state: st }, 'binary_sensor.gate': { ...H.states['binary_sensor.gate'], state: 'off' } } }; await new Promise(r => setTimeout(r, 150)); };
    const badge = () => Number(card.shadowRoot.querySelector('.tb[data-tab="security"] .bd')?.textContent || 0);
    card._setTab('home'); await put('closed'); const n0 = badge(); await put('open'); const n1 = badge(); await put('closed'); const n2 = badge();
    card.hass = H; return n1 > n0 && n2 === n0 || JSON.stringify([n0, n1, n2]);
  }).then(r => { if (r !== true) console.log('      got', r); return r === true; }));
  check('rename sheets show each entity\'s name (not "false")', await p.evaluate(async () => {
    card.editMode = true; card._setTab('security'); await new Promise(r => setTimeout(r, 200));
    card.shadowRoot.querySelector('#security [data-act=rnsec]').click(); await new Promise(r => setTimeout(r, 200));
    const vals = [...card.shadowRoot.querySelectorAll('#sheet [data-rename]')].map(i => i.value); card._closeSheet(); card.editMode = false; card._setTab('home');
    return vals.length > 0 && !vals.includes('false') && vals.every(v => v);
  }));
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
  // names and states come from users and integrations: markup in them must show as text, never become HTML
  { const r = await p.evaluate(async () => {
    const X = '<img data-xss src="x">', wait = ms => new Promise(r => setTimeout(r, ms)), found = [], cfg = JSON.parse(JSON.stringify(card._config));
    const scan = where => { const n = card.shadowRoot.querySelectorAll('[data-xss]').length; if (n) found.push(`${where}: ${n}`); };
    for (const mode of ['names', 'states']) {
      const h = { ...window.hassObj, states: JSON.parse(JSON.stringify(window.hassObj.states)) };
      for (const k in h.states) {
        const st = h.states[k];
        if (mode === 'names') st.attributes = { ...st.attributes, friendly_name: X + (st.attributes.friendly_name || k), app_name: st.attributes.app_name ? X : undefined };
        else if (isNaN(parseFloat(st.state))) st.state = X;
      }
      // a TV that lists Jellyfin (its name is in the Jellyfin sheets' subtitle) and a power-drawing device on the Energy card
      h.states['media_player.xss_tv'] = { entity_id: 'media_player.xss_tv', state: 'on', attributes: { friendly_name: X + 'TV', source_list: ['Jellyfin'] } };
      const c2 = JSON.parse(JSON.stringify(cfg)); c2.panels = { ...(c2.panels || {}), energy: { ...(c2.panels?.energy || {}), consumers: [{ entity: 'sensor.ev_power' }] } };
      card.hass = h; card.setConfig(c2); card.hass = h; await wait(600); // the config is read again: names it keeps (pumps, devices) come from these states
      for (const t of ['home', 'security', 'climate', 'energy', 'water', 'media', 'system']) { card._setTab(t); await wait(200); scan(`${mode} · ${t} tab`); }
      for (const k of ['lights', 'temps', 'weather', 'power', 'jflib:movies', 'jflib:shows']) { card._openInfo(k); await wait(250); scan(`${mode} · ${k} sheet`); card._closeSheet(); }
      for (const room of Object.keys(card._three.rooms)) { card._select(room); await wait(120); scan(`${mode} · ${room} room`); }
      card._select(null);
    }
    card.setConfig(cfg); card.hass = window.hassObj; card._setTab('home'); await wait(600);
    return found.length ? found.join('; ') : true;
  }); check('markup in entity names and states is shown as text everywhere (no HTML injection)', r === true, r); }
  check('two rooms on the same area: each keeps its own label, none left empty in the corner', await p.evaluate(async () => {
    const T = customElements.get('t-card'), el = new T(), cfg = JSON.parse(JSON.stringify(card._config));
    cfg.house.rooms.push({ area: 'living_room', name: 'Living room corridor', rects: [[0, 14, 3, 16]] });
    el.setConfig(cfg); card.remove(); document.body.appendChild(el); window.card = el; el.hass = window.hassObj; await new Promise(r => setTimeout(r, 900));
    const L = [...el.shadowRoot.querySelectorAll('.lbl')], t = L.map(l => l.textContent);
    const ok = !L.some(l => !l.textContent.trim()) && t.some(x => x.includes('Living Room')) && t.some(x => x.includes('Living room corridor'));
    el.remove(); const c = new T(); c.setConfig(JSON.parse(JSON.stringify(cfg)).house ? (cfg.house.rooms.pop(), cfg) : cfg); document.body.appendChild(c); window.card = c; c.hass = window.hassObj; await new Promise(r => setTimeout(r, 600)); return ok;
  }));
  await p.evaluate(() => card._setTab('home')); await p.waitForTimeout(200);
  const cfg0 = await p.evaluate(() => JSON.stringify(card._config));
  check('modes: icons from their names, renamed from the Modes panel (pencil while editing)', await p.evaluate(async () => {
    const ico = () => [...card.shadowRoot.querySelectorAll('#modes .tile')].map(b => b.querySelector('ha-icon')?.getAttribute('icon'));
    const before = ico(); card.editMode = true; await new Promise(r => setTimeout(r, 150));
    card.shadowRoot.querySelector('#modes [data-act=rnsec]')?.click(); await new Promise(r => setTimeout(r, 150));
    const inp = card.shadowRoot.querySelector('#sheet [data-rename="input_boolean.guests"]'); if (!inp) return 'no rename row ' + before;
    inp.value = 'Visitors'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    const keep = window.__sweetHomeEditor; window.__sweetHomeEditor = { isConnected: true, applyExternal: c => { card.setConfig(c); } };
    card.shadowRoot.querySelector('#sheet [data-act=rnsave]').click(); await new Promise(r => setTimeout(r, 1500)); window.__sweetHomeEditor = keep;
    const names = [...card.shadowRoot.querySelectorAll('#modes .tile span')].map(x => x.textContent); card.editMode = false;
    const ok = before[0] === 'mdi:account-multiple' && before[1] === 'mdi:motion-sensor-off' && before[2] === 'mdi:weather-night' && names.includes('Visitors'); if (!ok) console.log(JSON.stringify([before, names])); return ok;
  }));
  check('Look → automatic icons off: Home Assistant\'s icons', await p.evaluate(async () => {
    const h = window.hassObj; h.states['input_boolean.guests'] = { ...h.states['input_boolean.guests'], attributes: { ...h.states['input_boolean.guests'].attributes, icon: 'mdi:home-heart' } }; card.hass = { ...h, states: { ...h.states } };
    card.setConfig({ ...JSON.parse(JSON.stringify(card._config)), smart_icons: false }); await new Promise(r => setTimeout(r, 1200));
    const off = card.shadowRoot.querySelector('#modes .tile ha-icon')?.getAttribute('icon');
    card.setConfig({ ...JSON.parse(JSON.stringify(card._config)), smart_icons: true }); await new Promise(r => setTimeout(r, 1200));
    return off === 'mdi:home-heart' && card.shadowRoot.querySelector('#modes .tile ha-icon')?.getAttribute('icon') === 'mdi:account-multiple';
  }));
  await p.evaluate(async c => { card.setConfig(JSON.parse(c)); await new Promise(r => setTimeout(r, 1200)); card._select('living_room'); await new Promise(r => setTimeout(r, 200)); }, cfg0);
  check('typing in the editor: one rebuild after the last letter, and the 3D view is kept when the house did not change', await p.evaluate(async () => {
    const scene = card._three; let n = 0; const orig = card._rebuild.bind(card); card._rebuild = soft => { n++; return orig(soft); };
    for (const t of ['M', 'My', 'My ', 'My H', 'My Ho', 'My Hom', 'My Home']) { card.setConfig({ ...JSON.parse(card._cfgJSON), title: t }); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 900)); card._rebuild = orig;
    return n === 1 && card._three === scene && card.shadowRoot.contains(scene.cv);
  }));
  check('changing the house rebuilds the 3D view once, from the same camera angle', await p.evaluate(async () => {
    const old = card._three; old.goal.theta = old.orbit.theta = 1.234; old.goal.radius = old.orbit.radius = 19;
    const c = JSON.parse(card._cfgJSON); c.house.wall_height = 1.2; card.setConfig(c); await new Promise(r => setTimeout(r, 400));
    const waited = card._three === old; await new Promise(r => setTimeout(r, 2500));
    const sc = card._three; c.house.wall_height = undefined; delete c.house.wall_height; card.setConfig(c); await new Promise(r => setTimeout(r, 2500));
    return waited && sc && sc !== old && Math.abs(sc.goal.theta - 1.234) < 1e-6 && sc.goal.radius === 19;
  }));
  check('the header shows its house icon (and no stray text)', await p.evaluate(() => { const t = card.shadowRoot.querySelector('.title'); return t.querySelector('ha-icon')?.getAttribute('icon') === 'mdi:home-modern' && !t.querySelector('img') && !t.textContent.includes('%'); }));
  { const r = await p.evaluate(async () => {
      const sc = card._three, c = JSON.parse(card._cfgJSON); c.default_view = { pc: 'top' }; c.default_floor = { pc: 1 }; card.setConfig(c); await new Promise(r => setTimeout(r, 700));
      const ok = card._three === sc && card._three.vmode === 'top' && card._level === 1; return ok || JSON.stringify({ same: card._three === sc, sc: !!sc, vmode: card._three?.vmode, level: card._level, lv: card._model?.levels?.length });
    });
    check('Look → start view and floor for computers: shown right away (no 3D rebuild)', r === true, r); }
  check('long press on a floor button: the default on this device, before the dashboard\'s; again: back to the dashboard\'s', await p.evaluate(async () => {
    localStorage.clear(); const L = card._model?.levels || window.card && (await new Promise(r => r())) || null;
    const press = async el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: 5, clientY: 5, button: 0 })); await new Promise(r => setTimeout(r, 650)); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); };
    const btn = () => card.shadowRoot.querySelector('#lvls [data-level="0"]');
    await press(btn()); const pinned = card._defFloor([{ level: 0 }, { level: 1 }]) === 0 && /default on this device/.test(card.shadowRoot.getElementById('toast').textContent);
    await press(btn()); const cleared = card._defFloor([{ level: 0 }, { level: 1 }]) === 1;
    const c = JSON.parse(card._cfgJSON); delete c.default_view; delete c.default_floor; card.setConfig(c); await new Promise(r => setTimeout(r, 700));
    return pinned && cleared;
  }));
  check('editor preview (Home Assistant makes a new card for each change): the new card takes over the same 3D view, no "Building your home"', await p.evaluate(async () => {
    const swap = cfg => { const old = window.card, el = new old.constructor(); el.preview = true; el.setConfig(cfg); el.hass = window.hassObj; const parent = old.parentNode; old.remove(); parent.appendChild(el); window.card = el; return el; };
    window.card.preview = true; const sc = window.card._three, theta = sc.goal.theta;
    const c = JSON.parse(window.card._cfgJSON); c.title = 'Renamed'; const el = swap(c); await new Promise(r => setTimeout(r, 300));
    const kept = el._three === sc && el.shadowRoot.contains(sc.cv) && el.shadowRoot.getElementById('loading').classList.contains('gone') && sc.card === el;
    // the house changes: the old view stays on screen, then one new 3D view from the same angle
    sc.goal.theta = sc.orbit.theta = 0.777; const c2 = JSON.parse(el._cfgJSON); c2.house.wall_height = 1.2; const el2 = swap(c2); await new Promise(r => setTimeout(r, 200));
    const meanwhile = el2._three === sc && el2.shadowRoot.getElementById('loading').classList.contains('gone');
    await new Promise(r => setTimeout(r, 3000)); const sc2 = el2._three;
    const rebuilt = sc2 && sc2 !== sc && Math.abs(sc2.goal.theta - 0.777) < 1e-6;
    const c3 = JSON.parse(el2._cfgJSON); delete c3.house.wall_height; c3.title = c.title === 'Renamed' ? undefined : c.title; delete c3.title; const el3 = swap(c3); await new Promise(r => setTimeout(r, 3000)); el3.preview = false;
    return kept && meanwhile && rebuilt || JSON.stringify({ kept, meanwhile, rebuilt });
  }) === true);
  check('edit mode: leaving the view and coming back keeps (or rebuilds) the 3D view', await p.evaluate(async () => {
    const el = window.card, parent = el.parentNode; el.editMode = true; const sc = el._three;
    el.remove(); await new Promise(r => setTimeout(r, 100)); parent.appendChild(el); await new Promise(r => setTimeout(r, 200));
    const quick = el._three === sc && el.shadowRoot.contains(sc.cv);
    el.remove(); await new Promise(r => setTimeout(r, 5600)); parent.appendChild(el); await new Promise(r => setTimeout(r, 3500));
    const later = !!el._three && el._three !== sc && el.shadowRoot.contains(el._three.cv) && el.shadowRoot.getElementById('loading').classList.contains('gone');
    el.editMode = false; return quick && later || JSON.stringify({ quick, later });
  }) === true);
  check('nothing is loaded from outside (fonts are bundled)', !p.outside.length, p.outside.join(' '));
  check('a °F home: 72 °F is the colour of 22 °C (comfortable), not of a heat wave', await p.evaluate(async () => {
    const h = window.hassObj, col = async (t, unit) => { card.hass = { ...h, config: { ...(h.config || {}), unit_system: { temperature: unit } }, states: { ...h.states, 'sensor.living_room_temperature': { ...h.states['sensor.living_room_temperature'], state: String(t) } } }; await new Promise(r => setTimeout(r, 200)); card._select('living_room'); await new Promise(r => setTimeout(r, 200)); return card.shadowRoot.querySelector('#drawer .dstats b')?.style.color; };
    const f = await col(71.6, '°F'), c = await col(22, '°C'), hot = await col(71.6, '°C'); card._select(null); card.hass = h;
    return f && f === c && f !== hot;
  }));
  { const r = await cardModSurvives(p); check('card-mod: its styles stay after the card is redrawn (config change, house change)', r === true, r); }
  { const r = await p.evaluate(async () => {
    // the water tank's label: on the water (wet) or on the empty glass above it (dry), so it can be coloured to stay readable
    const h = card._hass._raw || card._hass, cfg0 = card._config, id = 'sensor.water_tank_level';
    card.setConfig({ ...cfg0, panels: { ...(cfg0.panels || {}), water: { ...(cfg0.panels?.water || {}), tank: id } } }); await new Promise(r => setTimeout(r, 900));
    const lbl = lvl => { h.states[id] = { entity_id: id, state: String(lvl), attributes: {} }; card._hass = h; const t = document.createElement('template'); t.innerHTML = card._rWater(); return t.content.querySelector('.tank-lbl')?.className; };
    const full = lbl(80), low = lbl(30);
    delete h.states[id]; card._hass = h; card.setConfig(cfg0); await new Promise(r => setTimeout(r, 900));
    return (/\bwet\b/.test(full) && /\bdry\b/.test(low)) || JSON.stringify({ full, low });
  }); check('water tank: the level label knows whether it sits on the water or on the empty glass (readable in the light look)', r === true, r); }
  { const r = await p.evaluate(async () => {
    // the energy flow: a bubble glows only while power flows through it (grid / solar sensors picked in the config)
    const cfg0 = card._config; card.setConfig({ ...cfg0, panels: { ...(cfg0.panels || {}), energy: { grid_power: 'sensor.grid_power', solar_power: 'sensor.solar_power' } } }); await new Promise(r => setTimeout(r, 900));
    const h = card._hass._raw || card._hass, keep = { ...h.states }, out = {};
    const flow = (grid, solar) => {
      h.states = { ...keep, 'sensor.grid_power': { ...keep['sensor.grid_power'], state: String(grid) }, 'sensor.solar_power': { ...keep['sensor.solar_power'], state: String(solar) } };
      card._hass = h; const t = document.createElement('template'); t.innerHTML = card._rEnergy();
      const cls = sel => t.content.querySelector(sel)?.className || '';
      return { sun: /\bon\b/.test(cls('.n-sun')), grid: /\bon\b/.test(cls('.n-grid')), exp: /\bexp\b/.test(cls('.n-grid')), home: /\bon\b/.test(cls('.n-home')), devs: [...t.content.querySelectorAll('.n-dev')].map(d => /\bon\b/.test(d.className)) };
    };
    const night = flow(438, 0);
    out.night = !night.sun && night.grid && night.home && night.devs.every(Boolean);
    const sunny = flow(-500, 2100);
    out.exporting = sunny.sun && sunny.grid && sunny.exp && sunny.home;
    const idle = flow(0, 0);
    out.idle = !idle.sun && !idle.grid && !idle.home;
    h.states = keep; card._hass = h; card.setConfig(cfg0); await new Promise(r => setTimeout(r, 900));
    return Object.values(out).every(Boolean) || JSON.stringify({ ...out, night, sunny, idle });
  }); check('energy flow: a bubble glows only while power flows (no Solar glow at 0 W, Grid glows importing or exporting)', r === true, r); }
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
  check('a rename pencil on the panels while editing', await p.evaluate(() => !!card.shadowRoot.querySelector('#climate [data-act=rnsec]')));
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
  check('Look: start view per device type and start floor (only picked values are kept)', await p.evaluate(() => {
    const f = n => editor.querySelector(`ha-form [name=${n}]`); if (!f('view_phone') || !f('floor_tablet')) return false;
    f('view_phone').value = '3d'; f('view_phone').dispatchEvent(new Event('change'));
    f('floor_tablet').value = '1'; f('floor_tablet').dispatchEvent(new Event('change'));
    const ok = JSON.stringify(editor._config.default_view) === '{"phone":"3d"}' && JSON.stringify(editor._config.default_floor) === '{"tablet":1}';
    f('view_phone').value = 'auto'; f('view_phone').dispatchEvent(new Event('change')); f('floor_tablet').value = 'auto'; f('floor_tablet').dispatchEvent(new Event('change'));
    return ok && !editor._config.default_view && !editor._config.default_floor;
  }));
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
  check('People panel changes in the editor: the 3D house is kept (same scene and canvas, no full rebuild)', await p.evaluate(async () => {
    const sc = card._three, cv = sc?.cv, soft = []; const orig = card._rebuild.bind(card); card._rebuild = x => { soft.push(x); return orig(x); };
    const p0 = Object.keys(editor._hass.states).find(x => x.startsWith('person.'));
    editor._config.persons = [p0]; editor._emit(); await new Promise(r => setTimeout(r, 700));
    editor._config.people = { [p0]: { name: 'Test' } }; editor._emit(); await new Promise(r => setTimeout(r, 700));
    delete editor._config.persons; delete editor._config.people; editor._emit(); await new Promise(r => setTimeout(r, 700)); card._rebuild = orig;
    return soft.length >= 2 && soft.every(x => x === true) && card._three === sc && card._three.cv === cv && card.shadowRoot.contains(cv);
  }));
  check('media server: the TV to play on is picked in the editor and saved by its name (without the session number)', await p.evaluate(() => {
    const h = editor._hass; h.states['media_player.living_room_tv_3'] = { entity_id: 'media_player.living_room_tv_3', state: 'idle', attributes: { friendly_name: 'Living Room TV 3', supported_features: 512 } };
    h.entities['media_player.living_room_tv_3'] = { entity_id: 'media_player.living_room_tv_3', platform: 'jellyfin' }; editor._R = null; editor._render();
    const i = editor.querySelector('ha-form input[name=tv_player]'); if (!i) return false; i.value = 'media_player.living_room_tv_3'; i.dispatchEvent(new Event('change'));
    return editor._config.panels.media_server?.jellyfin_tv?.session === 'Living Room TV';
  }));
  { const r = await p.evaluate(async () => {
    const det = () => [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('input[name=energy_dashboard_totals]'));
    const d0 = det(); if (!d0) return 'no switch'; d0.open = true; await new Promise(r => setTimeout(r, 50));
    const sw = () => det().querySelector('input[name=energy_dashboard_totals]'), fields = () => !!det().querySelector('input[name=month_sensor]') + !!det().querySelector('input[name=year_sensor]');
    const out = { onByDefault: sw().checked, hidden: fields() === 0 };
    sw().checked = false; sw().dispatchEvent(new Event('change'));
    out.saved = editor._config.panels?.energy?.energy_dashboard_totals === false; out.shown = fields() === 2; out.stillOpen = det().open;
    sw().checked = true; sw().dispatchEvent(new Event('change'));
    out.removed = editor._config.panels?.energy?.energy_dashboard_totals === undefined; out.hiddenAgain = fields() === 0;
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('editor, Energy: "Month and Year from Home Assistant\'s Energy data" is on by default and hides the Month / Year sensors; off shows them', r === true, r); }
  { const r = await p.evaluate(() => {
    const i = editor.querySelector('ha-form input[name=stored_sensor]'); if (!i) return 'no stored picker';
    i.value = 'sensor.energy_stored'; i.dispatchEvent(new Event('change')); const saved = editor._config.panels?.energy?.stored_sensor === 'sensor.energy_stored';
    const j = editor.querySelector('ha-form input[name=stored_sensor]'); j.value = ''; j.dispatchEvent(new Event('change'));
    return (saved && !editor._config.panels?.energy?.stored_sensor) || JSON.stringify({ saved, after: editor._config.panels?.energy });
  }); check('editor, Energy: the stored-energy sensor is picked and saved (cleared when emptied)', r === true, r); }
  { const r = await p.evaluate(() => {
    // Media: the screen-time entities are picked in the editor (saved, cleared when emptied)
    const out = {}, inp = n => editor.querySelector(`ha-form input[name=${n}]`);
    for (const n of ['watch_timer', 'watch_limit', 'limit_select', 'block_switch', 'unblock_switch']) {
      if (!inp(n)) { out[n] = 'missing'; continue; }
      inp(n).value = 'x.' + n; inp(n).dispatchEvent(new Event('change')); const saved = editor._config.panels?.media?.[n] === 'x.' + n;
      inp(n).value = ''; inp(n).dispatchEvent(new Event('change')); out[n] = saved && editor._config.panels?.media?.[n] === undefined;
    }
    return Object.values(out).every(v => v === true) || JSON.stringify(out);
  }); check('editor, Media: watched today, daily limit, limit picker, Block and Force Unblock are picked and saved', r === true, r); }
  { const r = await p.evaluate(async () => {
    // TV light: a panel of its own: the backlight and its selectors; a selector written with its own name keeps it
    const det = () => [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('input[name=selects]'));
    if (!det()) return 'no TV light panel';
    editor._config.panels = { ...(editor._config.panels || {}), tv_light: { selects: [{ entity: 'select.tv_mode', name: 'Mode' }] } }; editor._render(); await new Promise(r => setTimeout(r, 50));
    const light = det().querySelector('input[name=light]'), sel = det().querySelector('input[name=selects]');
    const shown = sel.value === 'select.tv_mode';
    light.value = 'light.tv_backlight'; light.dispatchEvent(new Event('change'));
    sel.value = 'select.tv_mode,select.tv_effect'; sel.dispatchEvent(new Event('change'));
    const tl = editor._config.panels.tv_light;
    const ok = shown && tl.light === 'light.tv_backlight' && JSON.stringify(tl.selects) === JSON.stringify([{ entity: 'select.tv_mode', name: 'Mode' }, 'select.tv_effect']);
    delete editor._config.panels.tv_light; editor._emit(); editor._render();
    return ok || JSON.stringify({ shown, tl });
  }); check('editor, TV light: the backlight and its selectors are picked and saved (a selector\'s own name is kept)', r === true, r); }
  { const r = await p.evaluate(() => {
    const i = editor.querySelector('ha-form input[name=clients_sensor]'); if (!i) return 'no clients picker';
    i.value = 'sensor.my_count'; i.dispatchEvent(new Event('change')); const saved = editor._config.panels?.media_server?.clients_sensor === 'sensor.my_count';
    const j = editor.querySelector('ha-form input[name=clients_sensor]'); j.value = ''; j.dispatchEvent(new Event('change'));
    return (saved && !editor._config.panels?.media_server?.clients_sensor) || JSON.stringify({ saved, ms: editor._config.panels?.media_server });
  }); check('editor, Media Server: the clients sensor is picked and saved (cleared when emptied)', r === true, r); }
  { const r = await p.evaluate(async () => {
    const det = () => [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('input[name=auto_guests]'));
    if (!det()) return 'no Home Lab switch'; det().open = true; await new Promise(r => setTimeout(r, 50));
    const out = { fields: ['cpu', 'memory', 'disk', 'swap', 'temperature', 'containers', 'vms', 'updates'].every(n => det().querySelector(`input[name=${n}]`)) };
    out.onByDefault = det().querySelector('input[name=auto_guests]').checked;
    const opts = [...det().querySelector('select[name=pinned]').options].map(o => o.value); out.options = opts.includes('lxc_jellyfin_102') && opts.includes('qemu_haos_103');
    const i = det().querySelector('input[name=cpu]'); i.value = 'sensor.my_cpu'; i.dispatchEvent(new Event('change')); out.cpu = editor._config.panels?.homelab?.cpu === 'sensor.my_cpu';
    const sw = det().querySelector('input[name=auto_guests]'); sw.checked = false; sw.dispatchEvent(new Event('change'));
    const lab = [...det().querySelectorAll('ha-form')].find(f => f.querySelector('select[name=pinned]'))?.computeLabel?.({ name: 'pinned' });
    out.off = editor._config.panels?.homelab?.auto_guests === false && lab === 'Servers to show' && det().open;
    const sel = det().querySelector('select[name=pinned]'); sel.value = 'qemu_haos_103'; sel.dispatchEvent(new Event('change'));
    out.pinned = JSON.stringify(editor._config.panels?.homelab?.pinned) === '["qemu_haos_103"]';
    delete editor._config.panels.homelab; editor._emit(); editor._render();
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('editor, Home Lab: the 8 sensors can be picked, automatic servers is on by default, off saves only the picked servers', r === true, r); }
  check('media server: the Quick Connect switch is saved with the TV settings', await p.evaluate(() => {
    const i = editor.querySelector('ha-form input[name=quick_connect]'); if (!i) return false;
    i.checked = true; i.dispatchEvent(new Event('change')); const on = editor._config.panels.media_server?.jellyfin_tv?.quick_connect === true;
    const j = editor.querySelector('ha-form input[name=quick_connect]'); j.checked = false; j.dispatchEvent(new Event('change'));
    return on && !editor._config.panels.media_server?.jellyfin_tv?.quick_connect;
  }));
  check('media server: Jellyfin or Jellyfin + JellyHA is picked in the editor and saved, the panel stays open', await p.evaluate(async () => {
    const sel = () => editor.querySelector('ha-form select[name=integration]'); if (!sel()) return 'no picker';
    const opts = [...sel().options].map(o => o.value).join();
    sel().closest('details').open = true; await new Promise(r => setTimeout(r, 50)); sel().value = 'hybrid'; sel().dispatchEvent(new Event('change'));
    const picked = editor._config.panels.media_server?.integration === 'hybrid' && sel()?.closest('details').open;
    sel().value = 'jellyfin'; sel().dispatchEvent(new Event('change')); const back = editor._config.panels.media_server?.integration === 'jellyfin';
    delete editor._config.panels.media_server.integration; if (!Object.keys(editor._config.panels.media_server).length) delete editor._config.panels.media_server; editor._emit();
    return (opts === 'jellyfin,hybrid' && picked && back) || JSON.stringify({ opts, picked, back });
  }));
  { const r = await p.evaluate(async () => {
    const h = editor._hass; const add = (id, pl, v = '1') => { h.states[id] = { entity_id: id, state: v, attributes: {} }; h.entities[id] = { entity_id: id, platform: pl }; };
    add('sensor.sonarr_upcoming', 'sonarr'); add('sensor.sonarr_shows', 'sonarr', '40'); add('sensor.radarr_movies', 'radarr', '12');
    editor._R = null; editor._render(); await new Promise(r => setTimeout(r, 50));
    const det = () => [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('select[name=integration]'));
    const row = k => det().querySelector(`.sh-intr[data-int=${k}]`), out = {};
    out.found = row('sonarr')?.classList.contains('ok') && row('radarr')?.classList.contains('ok') && !!row('sonarr').querySelector('ha-switch');
    out.notFound = row('qbittorrent')?.classList.contains('no') && !row('qbittorrent').querySelector('ha-switch') && /Not found/.test(row('qbittorrent').textContent);
    out.jellyha = [...det().querySelectorAll('.sh-intr')].some(x => /JellyHA/.test(x.textContent) && !x.querySelector('ha-switch'));
    const sw = row('sonarr').querySelector('ha-switch'); sw.checked = false; sw.dispatchEvent(new Event('change'));
    out.saved = editor._config.panels?.media_server?.sonarr === false;
    const sw2 = det().querySelector('.sh-intr[data-int=sonarr] ha-switch'); out.showsOff = sw2 && sw2.checked === false;
    sw2.checked = true; sw2.dispatchEvent(new Event('change')); out.cleared = editor._config.panels?.media_server?.sonarr === undefined;
    const en = [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('input[name=energy_dashboard_totals]'));
    out.energy = !!en?.querySelector('.sh-intr[data-int=solar_forecast]');
    out.lab = [...editor.querySelectorAll('details.sh-panel')].find(d => d.querySelector('input[name=auto_guests]'))?.querySelector('.sh-intr')?.textContent.includes('Proxmox VE');
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('editor, Found from: each integration shows found / not found, its switch saves sonarr: false and clears when back on', r === true, r); }
  { const r = await p.evaluate(async () => {
    const h = card._hass._raw || card._hass, cfg0 = card._config;
    const add = (id, pl, v = '1') => { h.states[id] = { entity_id: id, state: v, attributes: {} }; h.entities[id] = { entity_id: id, platform: pl }; };
    add('sensor.sonarr_upcoming', 'sonarr'); add('sensor.sonarr_shows', 'sonarr', '40'); add('sensor.sonarr_wanted', 'sonarr', '0'); add('calendar.sonarr', 'sonarr');
    add('sensor.radarr_movies', 'radarr', '12'); add('sensor.qbittorrent_download_speed', 'qbittorrent', '0');
    card._mcal = { at: Date.now(), items: [] };
    const show = async ms => { const c = JSON.parse(JSON.stringify(cfg0)); c.panels = { ...(c.panels || {}), media_server: ms }; card.setConfig(c); card.hass = { ...h, states: { ...h.states }, entities: { ...h.entities } }; await new Promise(r => setTimeout(r, 800)); card._mcal = { at: Date.now(), items: [] }; return card._rMServer(); };
    const secs = html => [...html.matchAll(/class="dsec">([^<·]+)/g)].map(m => m[1].trim()).join(',');
    const out = {};
    const all = await show({}); out.all = secs(all);
    const some = await show({ sonarr: false, qbittorrent: false, jellyfin: false }); out.some = secs(some);
    out.noWanted = !/data-kind="wanted"/.test(some) && /Movies/.test(some) && !/data-kind="jflib/.test(some);
    card.setConfig(cfg0); card.hass = { ...h, states: { ...h.states } }; await new Promise(r => setTimeout(r, 500));
    return (out.all === 'Now Watching,Library,Coming Up,Downloads' && out.some === 'Library' && out.noWanted) || JSON.stringify(out);
  }); check('Media Server: Jellyfin / Sonarr / qBittorrent switched off hide Now Watching, Wanted and Downloads', r === true, r); }
  { const r = await p.evaluate(async () => {
    // two Radarr servers and two qBittorrents (one config entry each), two Proxmox nodes
    const h = card._hass._raw || card._hass, cfg0 = card._config, out = {};
    const add = (id, pl, v, entry) => { h.states[id] = { entity_id: id, state: v, attributes: {} }; h.entities[id] = { entity_id: id, platform: pl, config_entry_id: entry }; };
    add('sensor.radarr_movies', 'radarr', '300', 'r1'); add('sensor.radarr_4k_movies', 'radarr', '40', 'r2');
    add('sensor.qbittorrent_download_speed', 'qbittorrent', '2.5', 'q1'); add('sensor.qbit_nas_download_speed', 'qbittorrent', '1.5', 'q2');
    add('sensor.qbittorrent_active_torrents', 'qbittorrent', '3', 'q1'); add('sensor.qbit_nas_active_torrents', 'qbittorrent', '4', 'q2');
    add('sensor.node_pve2_cpu_used', 'proxmoxve', '77', 'p1');
    const pveEnt = h.entities['sensor.node_pve_cpu_used']; h.entities['sensor.node_pve_cpu_used'] = { entity_id: 'sensor.node_pve_cpu_used', platform: 'proxmoxve', config_entry_id: 'p1' }; // as in Home Assistant: every node is Proxmox's
    card.hass = { ...h, states: { ...h.states }, entities: { ...h.entities } }; card._rebuild(); await new Promise(r => setTimeout(r, 900));
    const ms = card._rMServer();
    out.movies = /<b>340<\/b><span>Movies/.test(ms);
    out.speed = /<b>4\.0<small>MB\/s/.test(ms);
    out.torrents = /<b>7<small>\//.test(ms);
    card._setTab('system'); await new Promise(r => setTimeout(r, 300));
    const R = card.shadowRoot, chips = () => [...R.querySelectorAll('#lab .labnodes button')];
    out.chips = chips().map(b => b.textContent.trim()).join() === 'pve,pve2' && chips()[0].classList.contains('on');
    chips()[1].click(); await new Promise(r => setTimeout(r, 100));
    out.switched = chips()[1].classList.contains('on') && R.querySelector('#lab .ring[data-id="sensor.node_pve2_cpu_used"]') !== null;
    chips()[0].click(); await new Promise(r => setTimeout(r, 100));
    out.back = R.querySelector('#lab .ring[data-id="sensor.node_pve_cpu_used"]') !== null;
    card._setTab('home');
    for (const id of ['sensor.radarr_movies', 'sensor.radarr_4k_movies', 'sensor.qbittorrent_download_speed', 'sensor.qbit_nas_download_speed', 'sensor.qbittorrent_active_torrents', 'sensor.qbit_nas_active_torrents', 'sensor.node_pve2_cpu_used']) { delete h.states[id]; delete h.entities[id]; }
    if (pveEnt) h.entities['sensor.node_pve_cpu_used'] = pveEnt; else delete h.entities['sensor.node_pve_cpu_used'];
    card.hass = { ...h, states: { ...h.states }, entities: { ...h.entities } }; card._rebuild(); await new Promise(r => setTimeout(r, 900));
    return Object.values(out).every(Boolean) || JSON.stringify({ ...out, ms: ms.slice(ms.indexOf('mlib'), ms.indexOf('mlib') + 600) });
  }); check('several instances: two Radarr servers and two qBittorrents add up; Home Lab switches between Proxmox nodes', r === true, r); }
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
  check('editor: a toilet put near the bottom wall turns to face into the room and sits flat against it', await p.evaluate(() => { const r = editor._config.house.rooms[0]; r.furniture = []; editor._addPiece(0, 'toilet', 3, 4.8); const f = r.furniture[0]; return f.facing === 'n' && Math.abs(f.z + f.d / 2 - (5 - 0.06)) < 0.011 && f.d === 0.65; }));
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
  { const r = await p.evaluate(async () => {
    editor._step = 'look'; editor._render(); await new Promise(r => setTimeout(r, 30));
    const sel = () => editor.querySelector('ha-form select[name=appearance]'), out = {};
    out.options = sel() && [...sel().options].map(o => o.value).join() === 'dark,light,auto';
    sel().value = 'light'; sel().dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 700)); out.light = editor._config.appearance === 'light' && card.getAttribute('look') === 'light';
    const h = card._hass._raw || card._hass;
    sel().value = 'auto'; sel().dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 700));
    card.hass = { ...h, themes: { darkMode: true } }; out.autoDark = card.getAttribute('look') === 'dark';
    card.hass = { ...h, themes: { darkMode: false } }; out.autoLight = card.getAttribute('look') === 'light';
    sel().value = 'dark'; sel().dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 700));
    out.dark = editor._config.appearance === undefined && card.getAttribute('look') === 'dark';
    card.hass = h; editor._step = 'rooms'; editor._render();
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('editor, Look: Appearance dark (default, not saved) / light / auto (follows the Home Assistant theme)', r === true, r); }
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

  console.log('sweet home 3d');
  p = await open('?config=demo&card=3d&editor=1', { width: 1280, height: 900 });
  { const r = await p.evaluate(async () => {
    const R = card.shadowRoot, $ = id => R.getElementById(id), shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0, out = {};
    out.solo = card.hasAttribute('solo') && R.querySelector('.app').classList.contains('solo');
    out.only3d = !shown($('tabs')) && !shown(R.querySelector('header.top')) && !shown($('glance')) && !shown(R.querySelector('.foot')) && shown($('viewport'));
    out.height = Math.round($('viewport').getBoundingClientRect().height) === 420;
    out.grid = JSON.stringify(card.getGridOptions()) === '{"columns":12,"rows":8,"min_columns":4,"min_rows":4}' && card.getCardSize() >= 4;
    out.inPop = $('drawer').parentElement === $('rpop') && !$('viewport').querySelector('.drawer');
    card._select('kitchen'); await new Promise(r => setTimeout(r, 50));
    out.opens = $('rpop').classList.contains('open') && shown($('drawer')) && /Kitchen/.test($('drawer').textContent);
    $('drawer').querySelector('.dh, b, span')?.click(); out.staysOpen = card._sel === 'kitchen';
    $('rpop').click(); out.backdrop = card._sel === null && !$('rpop').classList.contains('open');
    card._select('bedroom'); out.again = card._sel === 'bedroom' && /Bedroom/.test($('drawer').textContent);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); out.escape = card._sel === null && !$('rpop').classList.contains('open');
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('Sweet Home 3D: only the 3D view (420 px), a room opens as a pop-up that closes beside it or with Escape', r === true, r); }
  { const r = await p.evaluate(async () => {
    const R = card.shadowRoot, out = {};
    card.layout = 'grid'; card.style.cssText = 'display:block;height:300px'; await new Promise(r => setTimeout(r, 50));
    const vh = R.getElementById('viewport').getBoundingClientRect().height, ch = card.getBoundingClientRect().height;
    out.fills = card.getAttribute('layout') === 'grid' && vh > 150 && vh < 300 && Math.abs(R.querySelector('.sh-card').getBoundingClientRect().height - ch) < 2;
    card.layout = undefined; card.style.cssText = '';
    out.steps = [...editor.querySelectorAll('[data-step]')].map(b => b.dataset.step).join() === 'rooms,look';
    editor._step = 'look'; editor._render(); await new Promise(r => setTimeout(r, 30));
    const h = editor.querySelector('ha-form input[name=height]'); out.field = !!h && !editor.querySelector('ha-form select[name=start_tab]');
    h.value = '360'; h.dispatchEvent(new Event('change')); out.saved = editor._config.height === 360;
    await new Promise(r => setTimeout(r, 900)); out.applied = Math.round(R.getElementById('viewport').getBoundingClientRect().height) === 360;
    const h2 = editor.querySelector('ha-form input[name=height]'); h2.value = '0'; h2.dispatchEvent(new Event('change')); out.cleared = editor._config.height === undefined;
    out.listed = window.customCards.some(c => c.type === 'sweet-home-3d-card' && c.name === 'Sweet Home 3D');
    return Object.values(out).every(Boolean) || JSON.stringify({ ...out, vh, ch });
  }); check('Sweet Home 3D: fills its sections-grid size; the editor has Rooms and Look (with a height), no Panels', r === true, r); }
  { const r = await p.evaluate(async () => {
    const R = card.shadowRoot, out = {}, cfg0 = card._config, wait = ms => new Promise(r => setTimeout(r, ms));
    const zoom = async room => { card.setConfig({ ...cfg0, room }); await wait(900); };
    await zoom('Office'); // by name, on the first floor
    out.byName = card._focus === 'office' && card._level === 1 && card._three.level === 1;
    out.noFloors = R.getElementById('lvls').style.display === 'none';
    const B = card._three.rooms.office.box, cx = (B[0] + B[2]) / 2, cz = (B[1] + B[3]) / 2, at = () => Math.hypot(card._three.goal.target.x - cx, card._three.goal.target.z - cz) < 0.01;
    out.framed = at();
    card._select('landing'); out.other = card._sel === 'landing' && !at();
    card._select(null); out.back = at() && card._level === 1;
    card._three.view('top'); out.top = at() && card._three.goal.phi < 0.1; card._three.view('reset'); out.reset = at();
    await zoom('kitchen'); out.byArea = card._focus === 'kitchen' && card._three.level === 0;
    await zoom('nowhere'); out.unknown = card._focus === null && R.getElementById('lvls').style.display !== 'none';
    card.setConfig(cfg0); await wait(900); out.cleared = card._focus === null;
    editor._step = 'look'; editor._render(); await wait(30);
    const sel = editor.querySelector('ha-form select[name=room]'), opts = sel ? [...sel.options].map(o => o.value) : [];
    out.picker = opts[0] === '' && opts.includes('kitchen') && opts.includes('Landing');
    sel.value = 'kitchen'; sel.dispatchEvent(new Event('change')); out.saved = editor._config.room === 'kitchen';
    const sel2 = editor.querySelector('ha-form select[name=room]'); sel2.value = ''; sel2.dispatchEvent(new Event('change')); out.removed = editor._config.room === undefined;
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('Sweet Home 3D room zoom: by name or area, on its floor without floor buttons; closing a room, 3D / floor plan come back to it', r === true, r); }
  { const r = await cardModSurvives(p); check('Sweet Home 3D: card-mod styles stay after the card is redrawn', r === true, r); }
  { const r = await p.evaluate(async () => {
    const R = card.shadowRoot, wait = ms => new Promise(r => setTimeout(r, ms)), out = {}, cs = el => getComputedStyle(el);
    const box = R.querySelector('.sh-card'); out.haCard = box?.localName === 'ha-card' && box.contains(R.getElementById('viewport'));
    // a light theme: white cards, dark text, big corners and a shadow
    const V = { '--card-background-color': 'rgb(255, 255, 255)', '--primary-text-color': 'rgb(33, 33, 33)', '--secondary-text-color': 'rgb(114, 114, 114)', '--divider-color': 'rgb(224, 224, 224)', '--ha-card-border-radius': '18px', '--ha-card-box-shadow': 'rgb(0, 0, 0) 0px 4px 10px 0px' };
    for (const [k, v] of Object.entries(V)) card.style.setProperty(k, v);
    await wait(100);
    out.surface = cs(box).backgroundColor === 'rgb(255, 255, 255)' && cs(box).borderTopLeftRadius === '18px' && cs(box).boxShadow.includes('4px 10px');
    out.text = cs(R.querySelector('.title b')).color === 'rgb(33, 33, 33)' && cs(R.querySelector('.title span')).color === 'rgb(114, 114, 114)';
    out.stagePlain = cs(R.querySelector('.stage')).backgroundColor === 'rgba(0, 0, 0, 0)';
    out.pictureOwn = cs(R.getElementById('legend')).color !== 'rgb(114, 114, 114)'; // the labels on the 3D picture keep their own colours
    card._select('kitchen'); await wait(100);
    const dr = R.getElementById('drawer'); out.popup = cs(dr).backgroundColor === 'rgb(255, 255, 255)' && cs(dr).color === 'rgb(33, 33, 33)';
    card._select(null);
    // a card-mod theme (card-mod-card: ha-card {...}) or card_mod `ha-card` styles reach the card
    const cm = document.createElement('card-mod'); cm.innerHTML = '<style>ha-card{border-radius:30px}</style>'; R.appendChild(cm); await wait(50);
    out.cardModHaCard = cs(box).borderTopLeftRadius === '30px'; cm.remove();
    for (const k of Object.keys(V)) card.style.removeProperty(k);
    await wait(50); out.fallback = cs(box).backgroundColor !== 'rgb(255, 255, 255)'; // the theme gone: not white any more
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('Sweet Home 3D: inside an ha-card that follows the theme (light or dark), with a themed pop-up; card-mod ha-card styles apply', r === true, r); }
  check('no page errors (sweet home 3d)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('arabic');
  p = await open('?config=demo&lang=ar', { width: 1280, height: 900 });
  check('right-to-left layout and Arabic text', await p.evaluate(() => card.shadowRoot.querySelector('.app').dir === 'rtl' && card.shadowRoot.querySelector('#tabs').textContent.includes('الرئيسية')));
  { const r = await p.evaluate(async () => {
    // every panel, rendered in Arabic: no text the dictionary can translate is left in English
    const { t, setLang } = await import('/src/i18n.js'); setLang('ar');
    const left = new Set(), R = card.shadowRoot;
    for (const tab of ['home', 'security', 'climate', 'energy', 'water', 'media', 'system']) {
      if (!card._tabOn(tab)) continue;
      card._setTab(tab); await new Promise(r => setTimeout(r, 300));
      const w = document.createTreeWalker(R, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const x = n.textContent.trim();
        if (x && /[A-Za-z]/.test(x) && t(x) !== x && !n.parentElement.closest('.lbl, .sh-h, style')) left.add(x);
      }
    }
    // the Media Server (the demo house has none): rendered on its own
    const h = card._hass._raw || card._hass, add = (id, pl, v) => { h.states[id] = { entity_id: id, state: v, attributes: {} }; h.entities[id] = { entity_id: id, platform: pl }; };
    add('media_player.jellyfin_tv', 'jellyfin', 'idle'); add('sensor.sonarr_shows', 'sonarr', '4'); add('sensor.sonarr_wanted', 'sonarr', '1'); add('calendar.sonarr', 'sonarr', 'off');
    add('sensor.radarr_movies', 'radarr', '9'); add('sensor.qbittorrent_download_speed', 'qbittorrent', '0'); add('sensor.radarr_queue', 'radarr', '1');
    card.hass = { ...h, states: { ...h.states }, entities: { ...h.entities } }; card._rebuild(); await new Promise(r => setTimeout(r, 900));
    card._mcal = { at: Date.now(), items: [] };
    const tpl = document.createElement('template'); tpl.innerHTML = card._rMServer();
    const w2 = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    for (let n = w2.nextNode(); n; n = w2.nextNode()) { const x = n.textContent.trim().replace(/\s*›$/, ''); if (x && /[A-Za-z]/.test(x) && t(x) !== x) left.add(x); }
    card._setTab('home');
    return !left.size || JSON.stringify([...left]);
  }); check('Arabic: no translatable English text left on any tab', r === true, r); }
  { const r = await p.evaluate(async () => {
    const R = card.shadowRoot, out = {}, main = R.querySelector('main');
    // swiping: in Arabic the next tab is to the left, so a swipe to the right opens it
    const swipe = dx => { const t0 = new Touch({ identifier: 1, target: main, clientX: 400, clientY: 500 }), t1 = new Touch({ identifier: 1, target: main, clientX: 400 + dx, clientY: 505 });
      main.dispatchEvent(new TouchEvent('touchstart', { touches: [t0], changedTouches: [t0], bubbles: true }));
      main.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t1], bubbles: true })); };
    card._setTab('home'); const ids = card._tabList().map(x => x[0]);
    swipe(160); out.rightIsNext = card._tab === ids[1];
    swipe(-160); out.leftIsBack = card._tab === 'home';
    // the greeting joins with an Arabic comma
    const g = R.getElementById('greet').textContent; out.comma = !card.name() || (g.includes('،') && !g.includes(', '));
    // values keep their own direction; option names with a duration or a weekday are in Arabic
    const { t } = await import('/src/i18n.js');
    out.bdi = card.f('sensor.living_room_temperature', 1).startsWith('<bdi>');
    { const c = await import('/src/core.js'), i18n = await import('/src/i18n.js'); i18n.setLang('ar'); const ago15 = new Date(Date.now() - 900e3).toISOString();
      out.times = c.agoShort(ago15) === '15 دقيقة' && c.ago(ago15).includes('15') && !/min|ago/.test(c.ago(ago15)); } // "15 min" in Arabic (Intl)
    { const cs = getComputedStyle(R.getElementById('time')); out.clockRoom = parseFloat(cs.paddingBottom) > 0 && parseFloat(cs.marginBottom) < 0; } // room under the line for "ص" (the gradient only paints inside the box)
    { const c = await import('/src/core.js'); out.when = /نوفمبر/.test(c.whenText('27 Nov at 4:00 AM') || '') && c.whenText('Friday') === null; } // sensor dates written again in Arabic
    out.sheetRtl = R.getElementById('sheet').dir === 'rtl' && R.getElementById('toast').dir === 'rtl'; // the pop-up sheets are right to left too
    // option names stay as the entity has them ("2 hours"), in their own order (<bdi>): not translated
    out.words = t('2 hours') === '2 hours' && t('Friday') === 'الجمعة' && card.pickChip !== undefined;
    // the lock tiles' state is translated
    card._setTab('security'); await new Promise(r => setTimeout(r, 300));
    out.locks = ![...R.querySelectorAll('#security .lock span')].some(sp => /^(locked|unlocked)$/i.test(sp.textContent.trim()));
    card._setTab('home');
    return Object.values(out).every(Boolean) || JSON.stringify(out);
  }); check('Arabic: swipe right for the next tab, Arabic comma, values and option names keep their own direction, weekdays / lock states translated', r === true, r); }
  { const vs = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    const r = await p.evaluate(async () => {
      card._setTab('home'); card._select('living_room'); await new Promise(r => setTimeout(r, 600));
      const R = card.shadowRoot, d = R.getElementById('drawer').getBoundingClientRect(), v = R.getElementById('viewport').getBoundingClientRect();
      const sl = R.querySelector('#drawer .sl'), out = {};
      out.fullWidth = Math.abs((d.left - v.left) - (v.right - d.right)) < 2 && d.width > v.width - 24; // phones: the room panel spans the view, centred, in Arabic too
      out.fill = !sl || getComputedStyle(sl).backgroundImage.includes('270deg'); // the slider fill starts on the right, with its thumb
      // room_backdrop (default on): the 3D view behind is blurred and a tap on it closes the room
      const bk = R.getElementById('rback'); out.backdrop = !!bk && getComputedStyle(bk).visibility === 'visible' && getComputedStyle(bk).backdropFilter.includes('blur');
      bk?.click(); await new Promise(r => setTimeout(r, 300)); out.tapCloses = !card._sel && !R.getElementById('drawer').classList.contains('open');
      // off: no backdrop (a tap on the 3D view picks another room, as before)
      card.setConfig({ ...card._config, room_backdrop: false }); card._rebuild?.(); await new Promise(r => setTimeout(r, 600));
      out.offNoBackdrop = !card.shadowRoot.getElementById('rback');
      card.setConfig({ ...card._config, room_backdrop: undefined }); card._rebuild?.(); await new Promise(r => setTimeout(r, 600));
      card._select('living_room'); await new Promise(r => setTimeout(r, 400));
      card._select(null);
      return Object.values(out).every(Boolean) || JSON.stringify(out);
    }); await p.setViewportSize(vs);
    check('Arabic on a phone: the room panel is full width and centred, slider fill from the right', r === true, r); }
  { const r = await p.evaluate(async () => {
      // an update being installed: a bar and its percentage (HA's update_percentage); without one, a moving bar
      const h = card._hass._raw || card._hass, base = { state: 'on', last_changed: new Date().toISOString(), attributes: { friendly_name: 'Home Assistant Core Update', title: 'Home Assistant Core', supported_features: 1, installed_version: '2026.11.1', latest_version: '2026.11.2' } };
      const put = attrs => { card.hass = { ...h, states: { ...h.states, 'update.home_assistant_core_update': { ...base, entity_id: 'update.home_assistant_core_update', attributes: { ...base.attributes, ...attrs } } } }; };
      card._setTab('system'); put({ in_progress: true, update_percentage: 42 }); card._rerender('alerts'); await new Promise(r => setTimeout(r, 300));
      const row = () => card.shadowRoot.querySelector('[data-id="update.home_assistant_core_update"]');
      const out = {}; out.pct = row()?.querySelector('.uppct')?.textContent.includes('42%') && row()?.querySelector('.upbar>i')?.style.width === '42%';
      put({ in_progress: true, update_percentage: null }); card._rerender('alerts'); await new Promise(r => setTimeout(r, 300));
      out.ind = !!row()?.querySelector('.upbar.ind') && !row()?.querySelector('.uppct');
      // a battery dropping low: the System tab's counter follows within a second (not on the 30 s refresh)
      card.hass = h; card._rerender('alerts', 'tabs'); card._setTab('home'); await new Promise(r => setTimeout(r, 1300));
      const badge = () => Number(card.shadowRoot.querySelector('.tb[data-tab="system"] .bdg, [data-tab="system"] .badge')?.textContent || 0);
      const n0 = card._alertCount ?? 0;
      card.hass = { ...h, states: { ...h.states, 'sensor.x_test_battery': { entity_id: 'sensor.x_test_battery', state: '5', last_changed: new Date().toISOString(), attributes: { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Test Battery' } } } };
      await new Promise(r => setTimeout(r, 300)); card.hass = { ...card._hass._raw || card._hass, states: { ...(card._hass._raw || card._hass).states, 'sensor.x_test_battery': { entity_id: 'sensor.x_test_battery', state: '4', last_changed: new Date().toISOString(), attributes: { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Test Battery' } } } };
      await new Promise(r => setTimeout(r, 1400));
      out.fast = card._alertCount === n0 + 1;
      card.hass = h; await new Promise(r => setTimeout(r, 1300));
      return Object.values(out).every(Boolean) || JSON.stringify(out);
    }); check('an update being installed shows a bar and its percentage (a moving bar without one)', r === true, r); }
  { const r = await p.evaluate(async () => {
      // a Home Assistant repair is counted on the System tab from the start, without opening the System tab first
      const h = card._hass._raw || card._hass;
      card._setTab('home'); card.hass = h; card._repairs = null; card._repAt = 0; card._alertCount = null; card._rerender('tabs'); await new Promise(r => setTimeout(r, 500));
      const n0 = card._alertCount ?? 0;
      card.hass = { ...h, callWS: async m => m.type === 'repairs/list_issues' ? { issues: [{ issue_id: 'x_test', domain: 'demo', issue_domain: 'demo', translation_key: 'x_test', severity: 'warning', ignored: false }] } : h.callWS(m) };
      card._repAt = 0; card._alertCount = null; card._rerender('tabs'); await new Promise(r => setTimeout(r, 500));
      const out = { home: card._tab === 'home', count: card._alertCount === n0 + 1,
        badge: Number(card.shadowRoot.querySelector('.tb[data-tab="system"] .bd')?.textContent || 0) === n0 + 1 };
      card.hass = h; card._repairs = null; card._repAt = Date.now(); card._alertCount = null; card._rerender('tabs');
      return Object.values(out).every(Boolean) || JSON.stringify(out);
    }); check('the System tab counts repairs on load, before the System tab is opened', r === true, r); }
  { const r = await p.evaluate(async () => {
      // the dashboard left open on the Home tab: each tab's badge follows a live change within a second, no tab opened
      const H = card._hass._raw || card._hass, E = card._model.E, out = {};
      const set = async (id, state, attrs = id === 'sensor.x_live_battery' ? { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Live Battery' } : null) => { const h = card._hass._raw || card._hass; card.hass = { ...h, states: { ...h.states, [id]: { ...(h.states[id] || { entity_id: id, attributes: {} }), entity_id: id, state, last_changed: new Date().toISOString(), ...(attrs ? { attributes: attrs } : {}) } } }; await new Promise(r => setTimeout(r, 1300)); };
      const bd = k => card.shadowRoot.querySelector(`.tb[data-tab="${k}"] .bd`)?.outerHTML ?? ''; // some badges are icons
      card._setTab('home'); card.hass = H; await new Promise(r => setTimeout(r, 300));
      const run = async (key, id, onSt, offSt) => { if (!id || !card.shadowRoot.querySelector(`.tb[data-tab="${key}"]`)) return; await set(id, offSt); const a = bd(key); await set(id, onSt); const b = bd(key); await set(id, offSt); const c = bd(key); out[key] = a !== b && a === c || [a, b, c]; };
      await run('security', E.doors[0]?.id, E.doors[0]?.open || 'on', 'off');
      await run('climate', E.acs[0]?.id, 'cool', 'off');
      await run('energy', E.car.charging, 'on', 'off');
      await run('water', E.water.tank, '10', '80');
      await run('media', E.media.tv, 'playing', 'idle');
      await run('system', 'sensor.x_live_battery', '4', '90'); // a battery going low
      card.hass = H; card._tab === 'home' || (out.tab = false); await new Promise(r => setTimeout(r, 300));
      return Object.keys(out).length >= 4 && Object.values(out).every(v => v === true) || JSON.stringify(out);
    }); check('with the dashboard open, every tab badge follows a live change (no tab opened)', r === true, r); }
  check('no page errors (arabic)', !p.errors.length, p.errors.join(' | '));
  await p.close();
} finally { await browser.close(); server.close(); }

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall browser tests passed');
