// Visual tests: the card drawn with real WebGL (software rendering, no GPU needed), checked by reading the pixels of
// screenshots. They catch what the other tests can't see: a blank 3D view, lights that don't light, a theme that
// doesn't reach the card, a room zoom that doesn't move the camera. No reference images: each check compares the
// picture with itself in another state (lights on / off, zoomed / not) or with a colour the theme sets, so small
// rendering differences between machines don't matter.
// Run with `node test/visual.mjs` after `npm run build` (part of `npm test`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(root, path.endsWith('/') || !path ? join(path, 'index.html') : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }); res.end(body); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/test/`;

let failed = 0;
const check = (name, ok, info = '') => { if (ok) console.log('  ok  ', name); else { failed++; console.log('  FAIL', name, info); } };
// software WebGL (SwiftShader): the same picture on any machine, with or without a GPU
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(query, viewport = { width: 1100, height: 700 }) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  await p.goto(base + query + '&gl=real'); await p.waitForFunction(() => window.ready); await p.waitForFunction(() => window.card._three, null, { timeout: 30000 });
  await p.evaluate(() => card._hintDone?.());
  await p.waitForTimeout(2500); // the camera settles
  return p;
}
// pixel numbers for a part of the page: average colour, brightness, how many distinct colours (coarse)
async function pixels(p, rect) {
  const png = (await p.screenshot({ clip: rect })).toString('base64');
  return p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, n = d.length / 4, seen = new Set(); let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4); }
    r /= n; g /= n; b /= n;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), lum: Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b), colours: seen.size };
  }, png);
}
const rectOf = (p, sel) => p.evaluate(s => { const el = s.split('>>').reduce((n, q) => (n.shadowRoot || n).querySelector(q.trim()), card); const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }; }, sel);
const near = (a, b, tol = 12) => Math.abs(a.r - b[0]) <= tol && Math.abs(a.g - b[1]) <= tol && Math.abs(a.b - b[2]) <= tol;
// turn every light in the demo house on or off (states only: the card redraws from them)
const setLights = (p, on) => p.evaluate(async on => {
  const h = card._hass._raw || card._hass, states = { ...h.states };
  for (const id of Object.keys(states)) if (id.startsWith('light.')) states[id] = { ...states[id], state: on ? 'on' : 'off', attributes: { ...states[id].attributes, brightness: on ? 255 : undefined } };
  card.hass = { ...h, states }; await new Promise(r => setTimeout(r, 2500));
}, on);

try {
  console.log('3D view (full card)');
  let p = await open('?config=demo', { width: 1400, height: 1000 });
  const vp = await rectOf(p, '#viewport');
  const house = await pixels(p, vp);
  check('the 3D house is drawn (the view is not blank)', house.colours > 150, JSON.stringify(house));
  await setLights(p, false); const dark = await pixels(p, vp);
  await setLights(p, true); const lit = await pixels(p, vp);
  check('lights switched on make the house brighter', lit.lum > dark.lum + 1, JSON.stringify({ dark: dark.lum, lit: lit.lum }));
  await p.evaluate(() => card._three.view('top')); await p.waitForTimeout(2500);
  const top = await pixels(p, vp);
  check('the floor plan view looks different from the 3D view', Math.abs(top.lum - lit.lum) + Math.abs(top.colours - lit.colours) / 10 > 3, JSON.stringify({ top, lit }));
  check('no page errors (3D view)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('full card: light look');
  p = await open('?config=demo', { width: 1400, height: 1000 });
  await p.evaluate(() => card.setConfig({ ...card._config, appearance: 'light' })); await p.waitForTimeout(1500);
  { const glance = await rectOf(p, '#glance'), vp = await rectOf(p, '#viewport'), clock = await rectOf(p, '#time');
    const page = await pixels(p, { x: 0, y: 0, width: 1400, height: 20 });
    const panel = await pixels(p, { x: glance.x + glance.width - 30, y: glance.y + 8, width: 20, height: 6 });
    const pic = await pixels(p, { x: vp.x + 20, y: vp.y + 20, width: vp.width - 40, height: vp.height - 40 });
    const time = await pixels(p, clock);
    check('light look: a light page and light panels', page.lum > 200 && panel.lum > 200, JSON.stringify({ page, panel }));
    check('light look: the 3D picture stays dark and drawn', pic.lum < 110 && pic.colours > 80, JSON.stringify(pic));
    check('light look: the clock is dark on the light page (readable)', time.lum < page.lum - 40, JSON.stringify({ time, page }));
    const on = await rectOf(p, '#modeSeg > button.on'), seg = await rectOf(p, '#modeSeg');
    const pill = await pixels(p, { x: on.x + 4, y: on.y + 3, width: 6, height: 4 }), track = await pixels(p, { x: seg.x + seg.width - 10, y: seg.y + 4, width: 4, height: 4 });
    check('light look: the selected view mode stands out on its light track', pill.lum > 240 && pill.lum - track.lum > 6 && track.lum > 200, JSON.stringify({ pill, track })); }
  await p.evaluate(() => card.setConfig({ ...card._config, appearance: 'dark' })); await p.waitForTimeout(1500);
  { const page = await pixels(p, { x: 0, y: 0, width: 1400, height: 20 }); check('dark look (the default) is unchanged: a dark page', page.lum < 60, JSON.stringify(page)); }
  check('no page errors (light look)', !p.errors.length, p.errors.join(' | '));
  await p.close();

  console.log('Sweet Home 3D: theme');
  for (const [name, dark, card, text] of [['light theme', false, [255, 255, 255], [33, 33, 33]], ['dark theme', true, [28, 28, 28], [225, 225, 225]]]) {
    p = await open('?config=demo&card=3d');
    await p.evaluate(([dark, cardBg, text]) => {
      const rgb = a => `rgb(${a.join(',')})`;
      document.body.style.cssText = `margin:0;padding:20px;background:${dark ? '#111' : '#c5cfdb'};--card-background-color:${rgb(cardBg)};--primary-text-color:${rgb(text)};--secondary-text-color:${dark ? '#9b9b9b' : '#727272'};--divider-color:${dark ? 'rgba(225,225,225,.12)' : '#e0e0e0'};--ha-card-border-radius:16px`;
      card.style.cssText = 'display:block;width:700px;height:520px'; card.layout = 'grid';
    }, [dark, card, text]);
    await p.waitForTimeout(1500);
    const box = await rectOf(p, '.sh-card'), stage = await rectOf(p, '.stage-top'), view = await rectOf(p, '#viewport');
    // a strip of the card's own surface, right of the title (no text, no buttons)
    const surface = await pixels(p, { x: box.x + 6, y: view.y - 8, width: 120, height: 4 });
    check(`${name}: the card's background is the theme's card colour`, near(surface, card), JSON.stringify(surface));
    const title = await pixels(p, { x: stage.x + 56, y: stage.y + 6, width: 140, height: 20 });
    check(`${name}: the title is drawn in the theme's text colour`, dark ? title.lum > surface.lum + 12 : title.lum < surface.lum - 12, JSON.stringify({ title, surface }));
    const pic = await pixels(p, { x: view.x + 20, y: view.y + 20, width: view.width - 40, height: view.height - 40 });
    check(`${name}: the 3D picture stays dark and drawn`, pic.lum < 110 && pic.colours > 80, JSON.stringify(pic));
    await p.evaluate(() => card._select('living_room')); await p.waitForTimeout(700);
    const dr = await rectOf(p, '#drawer');
    const pop = await pixels(p, { x: dr.x + dr.width - 30, y: dr.y + 90, width: 20, height: 10 });
    check(`${name}: the room pop-up uses the theme's card colour`, near(pop, card, 16), JSON.stringify(pop));
    check(`no page errors (${name})`, !p.errors.length, p.errors.join(' | '));
    await p.close();
  }

  console.log('Sweet Home 3D: room zoom');
  p = await open('?config=demo&card=3d');
  await p.evaluate(() => { card.style.cssText = 'display:block;height:560px'; card.layout = 'grid'; }); await p.waitForTimeout(1500);
  const view = await rectOf(p, '#viewport'), whole = await pixels(p, view);
  await p.evaluate(() => card.setConfig({ ...card._config, room: 'kitchen' })); await p.waitForTimeout(4000);
  const zoomed = await pixels(p, view);
  check('zooming on a room changes the picture (the camera moved in)', Math.abs(zoomed.lum - whole.lum) > 3 || Math.abs(zoomed.colours - whole.colours) > 40, JSON.stringify({ whole, zoomed }));
  check('no page errors (room zoom)', !p.errors.length, p.errors.join(' | '));
  await p.close();
} finally { await browser.close(); server.close(); }

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall visual tests passed');
