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
  await p.evaluate(() => card.shadowRoot.querySelector('#drawer [data-act=names]').click());
  await p.evaluate(() => { const i = card.shadowRoot.querySelector('[data-rename="light.living_room"]'); i.value = 'Ceiling'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(100);
  check('renaming from the popup', await p.evaluate(() => (window.ws || []).some(m => m.type === 'config/entity_registry/update' && m.entity_id === 'light.living_room' && m.name === 'Ceiling')));
  check('LED strip stops where a wall is missing (doors on two sides)', await p.evaluate(() => card._three.rooms.living_room.strip.washes.length === 6));
  await p.evaluate(() => card._setTab('water')); await p.waitForTimeout(200);
  check('water card: pumps with their power sensor, and other entities', await p.evaluate(() => {
    const w = card.shadowRoot.getElementById('water'); return !!w.querySelector('[data-id="switch.well_pump"][data-id2="sensor.well_pump_power"]') && !!w.querySelector('[data-id="sensor.water_flow"]') && !!w.querySelector('[data-id="valve.garden"]');
  }));
  await p.evaluate(() => card._setTab('system')); await p.waitForTimeout(300);
  check('needs attention rows have a hide button', await p.evaluate(() => !!card.shadowRoot.querySelector('#alerts [data-act=exclude][data-id="sensor.door_sensor_battery"]')));
  await p.evaluate(() => card._setTab('home'));
  check('doors without a sensor are drawn', await p.evaluate(() => card._model.doors.filter(d => !d.id).length === 4));
  check('no page errors (card)', !p.errors.length, p.errors.join(' | '));
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
  check('the card follows the editor', await p.evaluate(() => card._model.doors.length === 6));
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
