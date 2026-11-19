/*
 * Sweet Home — an interactive 3D home dashboard card for Home Assistant.
 * MIT licence. Use: `type: custom:sweet-home-card` (best in a panel view). Configure it in the card editor or YAML;
 * without any configuration the house is built from your Home Assistant areas.
 */
import * as THREE_LIB from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import INTER from './fonts/inter-latin-wght-normal.woff2'; // Inter (SIL Open Font License 1.1, see src/fonts/OFL-Inter.txt)
import { buildModel, toColor, FURN_TYPES, lineOf, inPoly, polyArea, arr, cleanConfig } from './model.js';
import { movePiece } from './editor.js';
import { t as tr, setLang, isRTL } from './i18n.js';
import './strategy.js';
const VERSION = typeof __SH_VERSION__ !== 'undefined' ? __SH_VERSION__ : 'dev';

/* ------------------------------------------------------------------ */
/* the current model (rooms, walls, furniture, entity map). Each card instance has its own model; the methods of
/* the card and the scene switch these module variables to their own model when they run (see `bindModel` below).  */
/* ------------------------------------------------------------------ */
let MODEL = null, E = null, ROOMS = [], ROOM = {}, DOOR_INFO = {}, WALLS = [], DOORS = [], FURN = [], BADGES = [];
let CX = 5, CZ = 4, PLAN_W = 10, PLAN_D = 8, WALL_H = 1.35, SPAN = 12;
function useModel(m) {
  if (!m || MODEL === m) return;
  MODEL = m; E = m.E; ROOMS = m.rooms; ROOM = Object.fromEntries(ROOMS.map(r => [r.id, r]));
  DOOR_INFO = m.doorInfo || {}; WALLS = m.walls; DOORS = m.doors; FURN = m.furniture; BADGES = m.badges;
  CX = m.plan.CX; CZ = m.plan.CZ; PLAN_W = m.plan.W; PLAN_D = m.plan.D; WALL_H = m.wallH; SPAN = Math.max(PLAN_W, PLAN_D, 6);
}
// sections shown on each tab
// panels whose entities can be renamed for this dashboard (pencil in edit mode)
const RN_SECS = ['glance', 'modes', 'security', 'cams', 'climate', 'energy', 'car', 'ehist', 'water', 'irrigation', 'media', 'mserver', 'tvlight', 'alerts', 'lab', 'devices'];
const TAB_SECS = { home: ['glance'], security: ['security', 'cams'], climate: ['climate'], energy: ['energy', 'car', 'ehist'], water: ['water', 'irrigation'], media: ['media', 'mserver', 'tvlight'], system: ['alerts', 'lab', 'devices'] };

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
// Title Case for names: capitalise each word that is all lowercase (keeps LED, TV, iPad, LocalAI as they are)
const tc = s => String(s ?? '').replace(/(^|[\s(/&-])(\p{Ll}[\p{Ll}\d']*)(?=$|[\s),./&-])/gu, (m, a, w) => a + w[0].toUpperCase() + w.slice(1));
// "just now", "5 min ago", "2 h 10 min ago", "yesterday 21:40", "Sat 14:05", "12 Nov 09:30"
const ago = (iso, lang = 'en') => {
  const t = new Date(iso), s = (Date.now() - t) / 1000; if (isNaN(s)) return '';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 6 * 3600) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return `${h} h${m ? ` ${m} min` : ''} ago`; }
  const hm = t.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (days === 0) return `today ${hm}`;
  if (days === 1) return `yesterday ${hm}`;
  if (days < 7) return `${t.toLocaleDateString(lang, { weekday: 'short' })} ${hm}`;
  return `${t.toLocaleDateString(lang, { day: 'numeric', month: 'short' })} ${hm}`;
};
// short form for one-line rows: "now", "5 min", "2 h", "yesterday", "Sat", "12 Nov"
const agoShort = (iso, lang = 'en') => {
  const t = new Date(iso), s = (Date.now() - t) / 1000; if (isNaN(s)) return '';
  if (s < 45) return 'now'; if (s < 3600) return `${Math.round(s / 60)} min`; if (s < 12 * 3600) return `${Math.round(s / 3600)} h`;
  const now = new Date(), days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (days <= 0) return `${Math.round(s / 3600)} h`; if (days === 1) return 'yesterday';
  return days < 7 ? t.toLocaleDateString(lang, { weekday: 'short' }) : t.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// apply Title Case to every configured sensor / device / room name
(function titleNames(o) {
  if (Array.isArray(o)) {
    if (o.length >= 2 && o.length <= 3 && typeof o[0] === 'string' && typeof o[1] === 'string' && !o[1].includes('.')) o[1] = tc(o[1]);
    else o.forEach(titleNames);
  } else if (o && typeof o === 'object') {
    for (const k in o) {
      if (k === 'name' && typeof o[k] === 'string') o[k] = tc(o[k]);
      else if ((k === 'lightNames' || k === 'motionNames') && o[k]) for (const e in o[k]) o[k][e] = tc(o[k][e]);
      else if (typeof o[k] === 'object' && k !== 'alerts') titleNames(o[k]); // alert filters are ids/domains, not names
    }
  }
})([E, ROOMS, DOOR_INFO]);
const ic = (i, cls = '') => `<ha-icon class="${cls}" icon="${i}"></ha-icon>`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BAD = ['unavailable', 'unknown', 'none', 'None', ''];
const TEMP_STOPS = [[16, [59, 130, 246]], [19.5, [34, 211, 238]], [22.5, [52, 211, 153]], [25.5, [251, 191, 36]], [29, [244, 63, 94]]];
// the colour of a temperature (cold blue → comfortable green → hot red); in a °F home it is read as °F
let FAHR = false;
function tempRGB(t) {
  if (t == null || isNaN(t)) return [120, 130, 150];
  if (FAHR) t = (t - 32) * 5 / 9;
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) { const [t0, c0] = TEMP_STOPS[i - 1]; const k = (t - t0) / (t1 - t0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * k)); }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}
const rgb = a => `rgb(${a.join(',')})`;
// Patch `oldP` in place to match `newP` so existing nodes (buttons, sliders, camera images, animations) survive updates.
function morph(oldP, newP, skip) {
  const oldK = [...oldP.childNodes], newK = [...newP.childNodes];
  newK.forEach((n, i) => {
    const o = oldK[i];
    if (!o) { oldP.appendChild(n); return; }
    if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) { oldP.replaceChild(n, o); return; }
    if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    if (o.tagName === 'IMG' && o.dataset.cam) { if (o.dataset.cam !== n.dataset.cam) oldP.replaceChild(n, o); return; }
    if (o.dataset?.live) { if (o.dataset.live !== n.dataset.live) oldP.replaceChild(n, o); return; }
    for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
    for (const a of [...n.attributes]) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
    if (o.tagName === 'INPUT') { if (o !== skip && o.value !== n.getAttribute('value')) o.value = n.getAttribute('value'); return; }
    morph(o, n, skip);
  });
  for (let i = oldK.length - 1; i >= newK.length; i--) oldP.removeChild(oldK[i]);
}
// LED colour presets (k = colour temperature in kelvin, used for the whites)
const COLORS = [
  { n: 'Warm white', k: 2700, css: '#ffd29a' }, { n: 'Cool white', k: 6000, css: '#eef4ff' },
  { n: 'Red', rgb: [255, 0, 0] }, { n: 'Orange', rgb: [255, 110, 0] }, { n: 'Amber', rgb: [255, 180, 40] },
  { n: 'Green', rgb: [0, 255, 60] }, { n: 'Cyan', rgb: [0, 220, 255] }, { n: 'Blue', rgb: [0, 60, 255] },
  { n: 'Purple', rgb: [150, 0, 255] }, { n: 'Pink', rgb: [255, 0, 150] },
];
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // phone / tablet
// Loading placeholders: shimmer blocks (`.skl`) shaped like the content that is coming, so cards keep their size
const skl = (w = '100%', h = 11, extra = '') => `<span class="skl" style="width:${w};height:${h}px;${extra}"></span>`;
const skPill = label => `<div class="ehspin">${ic('mdi:loading', 'spin')}<span>${esc(label)}</span></div>`;
// Proxmox guests (Home Lab "Show more", v1.19.0): a nicer name and an icon per server, from the name Proxmox reports
const GUEST_NAMES = { adguard: 'AdGuard', npmplus: 'NPMplus', nginxproxymanager: 'Nginx Proxy Manager', vaultwarden: 'Vaultwarden', pihole: 'Pi-hole',
  esphome: 'ESPHome', qbittorrent: 'qBittorrent', localai: 'LocalAI', haos: 'Home Assistant', libretranslate: 'LibreTranslate',
  'proxmox-backup-server': 'Proxmox Backup Server', nextcloud: 'Nextcloud', frigate: 'Frigate', mariadb: 'MariaDB', jellyfin: 'Jellyfin', immich: 'Immich' };
const GUEST_ICONS = [[/adguard/, 'mdi:shield-check'], [/pihole|pi-hole/, 'mdi:pi-hole'], [/cloudflared/, 'mdi:cloud-lock'], [/bazarr/, 'mdi:subtitles'],
  [/sonarr/, 'mdi:television-classic'], [/radarr/, 'mdi:movie-open'], [/qbittorrent|torrent/, 'mdi:download-network'], [/prowlarr/, 'mdi:radar'],
  [/seerr/, 'mdi:movie-search'], [/lingarr|translate/, 'mdi:translate'], [/flaresolverr/, 'mdi:fire'], [/immich/, 'mdi:image-multiple'],
  [/esphome/, 'mdi:chip'], [/mariadb|mysql|postgres/, 'mdi:database'], [/vaultwarden|bitwarden|-bw/, 'mdi:shield-key'], [/nginx|npm/, 'mdi:web'],
  [/notifiarr/, 'mdi:bell-ring'], [/double-take/, 'mdi:face-recognition'], [/frigate|camera/, 'mdi:cctv'], [/backup/, 'mdi:backup-restore'],
  [/supabase/, 'mdi:database-cog'], [/agent|llm|\bai\b/, 'mdi:robot'], [/games/, 'mdi:gamepad-variant'], [/tasks/, 'mdi:calendar-check'],
  [/pulse/, 'mdi:pulse'], [/localai|ollama/, 'mdi:robot'], [/nextcloud/, 'mdi:cloud'], [/jellyfin/, 'mdi:filmstrip'],
  [/haos|home.?assistant/, 'mdi:home-assistant'], [/grafana|influx|prometheus/, 'mdi:chart-box']];
const guestInfo = (states, g) => {
  const fn = states[`sensor.${g}_status`]?.attributes.friendly_name || states[`binary_sensor.${g}_status`]?.attributes.friendly_name || g;
  const m = fn.match(/^(LXC|QEMU)\s+(.+?)\s*\((\d+)\)/i), raw = m ? m[2] : g.replace(/^(lxc|qemu)_/, '').replace(/_\d+$/, '');
  const key = raw.toLowerCase(), vm = m ? /qemu/i.test(m[1]) : g.startsWith('qemu');
  const name = GUEST_NAMES[key] || tc(raw.replace(/[-_]+/g, ' ').replace(/\bdocker\b/i, 'Docker'));
  const icon = (GUEST_ICONS.find(([re]) => re.test(key)) || [0, vm ? 'mdi:monitor' : 'mdi:cube-outline'])[1];
  return { name, icon, id: m ? m[3] : '', vm };
};
// Side view of the car: first-generation Kia Niro EV in dark metallic grey, facing right —
// flat roof with silver roof rails and a small spoiler, three side windows with a chrome surround and a body-coloured
// C-pillar, black arch / sill cladding, blue accent low on the front bumper, two-tone twin-spoke wheels
// the car drawing's body gradient for a colour (default: graphite)
const carGrad = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return ['#7a8089', '#5a5f67', '#3a3e44', '#202327'];
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = f => '#' + c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, '0')).join('');
  return [mix(0.32), mix(0), mix(-0.38), mix(-0.68)];
};
const CAR_SVG = (ch, color) => {
  const g = carGrad(color);
  const wheel = (cx, cy) => `<g transform="translate(${cx} ${cy})"><circle class="tire" r="13.5"/><circle class="rim" r="9.2"/>`
    + [0, 72, 144, 216, 288].map(a => [-7, 7].map(d => `<line class="spoke" x1="0" y1="-3" x2="0" y2="-8.6" transform="rotate(${a + d})"/>`).join('')).join('')
    + `<circle class="lip" r="9.2"/><circle class="hub" r="2.6"/></g>`;
  return `<svg viewBox="0 0 240 92" aria-label="Car">
    <defs>
      <linearGradient id="cg" x1="0" x2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
      <linearGradient id="cbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".28" stop-color="${g[1]}"/><stop offset=".62" stop-color="${g[2]}"/><stop offset="1" stop-color="${g[3]}"/></linearGradient>
      <linearGradient id="cglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2230"/><stop offset=".55" stop-color="#2c3646"/><stop offset="1" stop-color="#0d1219"/></linearGradient>
    </defs>
    <ellipse cx="120" cy="82.5" rx="106" ry="3.2" fill="rgba(0,0,0,.55)"/>
    <path class="body" d="M22 68.5 L19.6 60 C18.6 52 18.8 44 20.2 36 L23.4 25.6 C24.6 22.4 27 21 31 20.6 L38 20 C62 18.2 96 16.8 118 16.8 C130 16.8 138 18.4 145 22.6 L162 35.6 C180 37.4 198 40 210 43.6 C218 46.2 222.2 50.6 222.2 57 L221.4 64.6 C220.6 67.4 217.6 68.5 212.4 68.5 L196 68.5 A18 18 0 0 0 160 68.5 L76 68.5 A18 18 0 0 0 40 68.5 Z"/>
    <path class="spoiler" d="M24.8 23.4 C26.2 21.6 28.4 20.8 31.6 20.6 L41 20 L40.4 21.6 L29.2 22.6 C27.4 22.8 26.2 23.6 25.4 24.6 Z"/>
    <path class="glass" d="M37.8 37.4 L40.8 26 C41.6 24 43.4 23.2 46.2 23 L112 20.3 C125 19.8 133 21 139.8 24.8 L155.6 37.4 Z"/>
    <path class="cpil" d="M60.6 22.2 L69.4 21.8 L67.4 37.4 L57.6 37.4 Z"/>
    <rect class="pillar" x="106.4" y="20.1" width="3.2" height="17.3"/>
    <path class="chrome" d="M37.8 37.4 L40.8 26 C41.6 24 43.4 23.2 46.2 23 L112 20.3 C125 19.8 133 21 139.8 24.8 L155.6 37.4 L37.8 37.4"/>
    <path class="rail" d="M40 19.2 C70 17.4 100 16 121 15.9"/><path class="rail feet" d="M44 19.1 L44 20.2 M117 16 L117 17"/>
    <path class="clad" d="M40 68.5 A18 18 0 0 1 76 68.5 L76 70.2 L73.8 70.2 A15.8 15.8 0 0 0 42.2 70.2 L40 70.2 Z M160 68.5 A18 18 0 0 1 196 68.5 L196 70.2 L193.8 70.2 A15.8 15.8 0 0 0 162.2 70.2 L160 70.2 Z M76 63.6 L160 63.6 L160 70 L76 70 Z M19.6 60.2 L40 62 L40 68.5 L22 68.5 Z M196 63 L221.2 61.8 L220.6 65.2 C219.8 67.6 217.4 68.5 212.4 68.5 L196 68.5 Z"/>
    <path class="accent" d="M204 63.8 L220.6 62.6"/>
    <path class="tail" d="M20.4 31.6 L26.6 30.6 L25.6 42.6 L20 43.6 Z"/>
    <path class="head" d="M198.8 42.8 L215.6 46.2 L214.4 49.4 L202 47.2 Z"/><path class="drl" d="M214.6 54.2 L219 53.6 L218.6 58.6 L214.6 59 Z"/>
    <path class="line" d="M28 44 C80 42 150 41.4 206 45.6"/>
    <path class="line" d="M109 37.4 L108.4 63.6 M150.6 39.8 L152.6 63.6 M66.6 37.6 C64.4 46 64.8 55 67.6 63.6"/>
    <rect class="handle" x="90" y="42.6" width="9" height="1.6" rx=".8"/><rect class="handle" x="134" y="42.4" width="9" height="1.6" rx=".8"/>
    <path class="mirror" d="M148.6 33.2 L157.6 31.4 L160 36.2 L151.4 37.6 Z"/>
    ${wheel(58, 68.5)}${wheel(178, 68.5)}
    <rect class="cbar" x="88" y="87" width="64" height="3.4" rx="1.7"/><rect class="cbarf" x="88" y="87" width="${ch ? 64 : 0}" height="3.4" rx="1.7"/>
  </svg>`;
};
// white tones for colour-temperature-only bulbs
const WHITES = [
  { n: 'Candle', k: 2200, css: '#ffb46b' }, { n: 'Warm', k: 2700, css: '#ffc98f' }, { n: 'Soft', k: 3000, css: '#ffd6aa' },
  { n: 'Natural', k: 3500, css: '#ffe4c6' }, { n: 'Neutral', k: 4000, css: '#fff0de' }, { n: 'Daylight', k: 5000, css: '#fff8f2' },
  { n: 'Cool', k: 6500, css: '#eef3ff' },
];
// option pickers: attribute that lists the options, how to read the current one, and the service that sets it
const PICK = {
  select: { title: 'Choose', list: st => st.attributes.options, cur: st => st.state, call: (id, o) => [id.split('.')[0], 'select_option', { option: o }] },
  hvac: { title: 'Mode', list: st => st.attributes.hvac_modes, cur: st => st.state, call: (id, o) => ['climate', 'set_hvac_mode', { hvac_mode: o }] },
  fan: { title: 'Fan speed', list: st => st.attributes.fan_modes, cur: st => st.attributes.fan_mode, call: (id, o) => ['climate', 'set_fan_mode', { fan_mode: o }] },
  swing: { title: 'Vertical swing', list: st => st.attributes.swing_modes, cur: st => st.attributes.swing_mode, call: (id, o) => ['climate', 'set_swing_mode', { swing_mode: o }] },
  swingh: { title: 'Horizontal swing', list: st => st.attributes.swing_horizontal_modes, cur: st => st.attributes.swing_horizontal_mode, call: (id, o) => ['climate', 'set_swing_horizontal_mode', { swing_horizontal_mode: o }] },
  preset: { title: 'Preset', list: st => st.attributes.preset_modes, cur: st => st.attributes.preset_mode, call: (id, o) => ['climate', 'set_preset_mode', { preset_mode: o }] },
  source: { title: 'Source', list: st => st.attributes.source_list, cur: st => st.attributes.source, call: (id, o, h) => /launcher/i.test(o) && h?.entities?.[id]?.platform === 'androidtv'
    // ADB can't start the home screen as an app (no launcher activity), so press the Home key instead
    ? ['androidtv', 'adb_command', { command: 'HOME' }] : ['media_player', 'select_source', { source: o }] },
  effect: { title: 'Effect', list: st => st.attributes.effect_list, cur: st => st.attributes.effect, call: (id, o) => ['light', 'turn_on', { effect: o }] },
};
const pretty = o => {
  if (o == null) return '—';
  let s = String(o).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
  if (s === s.toUpperCase()) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// entities a tap switches on / off
const TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'siren', 'humidifier', 'cover', 'valve', 'automation', 'remote', 'vacuum'];
// binary sensor wording by device class: [on, off]
const BIN_LABEL = { door: ['Open', 'Closed'], window: ['Open', 'Closed'], garage_door: ['Open', 'Closed'], opening: ['Open', 'Closed'], motion: ['Detected', 'Clear'],
  occupancy: ['Detected', 'Clear'], presence: ['At home', 'Away'], moisture: ['Wet', 'Dry'], smoke: ['Smoke', 'Clear'], gas: ['Gas', 'Clear'], battery: ['Low', 'Normal'],
  plug: ['Plugged in', 'Unplugged'], power: ['Power', 'No power'], problem: ['Problem', 'OK'], connectivity: ['Connected', 'Disconnected'], lock: ['Unlocked', 'Locked'], vibration: ['Vibration', 'Still'] };
const DOM_ICON = { light: ['mdi:lightbulb-on', 'mdi:lightbulb-outline'], switch: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'], fan: ['mdi:fan', 'mdi:fan-off'],
  input_boolean: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'], cover: ['mdi:window-shutter-open', 'mdi:window-shutter'], valve: ['mdi:valve-open', 'mdi:valve-closed'],
  media_player: ['mdi:cast-connected', 'mdi:cast'], climate: ['mdi:thermostat', 'mdi:thermostat'], lock: ['mdi:lock-open-variant', 'mdi:lock'], script: ['mdi:script-text-play', 'mdi:script-text'],
  scene: ['mdi:palette', 'mdi:palette'], button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'], input_button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'],
  camera: ['mdi:cctv', 'mdi:cctv'], vacuum: ['mdi:robot-vacuum', 'mdi:robot-vacuum'], humidifier: ['mdi:air-humidifier', 'mdi:air-humidifier-off'], siren: ['mdi:bullhorn', 'mdi:bullhorn-outline'],
  automation: ['mdi:robot', 'mdi:robot-off'], remote: ['mdi:remote', 'mdi:remote-off'], person: ['mdi:account', 'mdi:account-outline'], device_tracker: ['mdi:map-marker', 'mdi:map-marker-off'] };
const DC_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', power: 'mdi:flash', energy: 'mdi:lightning-bolt', battery: 'mdi:battery', illuminance: 'mdi:brightness-5',
  motion: 'mdi:motion-sensor', occupancy: 'mdi:home-account', door: 'mdi:door', window: 'mdi:window-closed-variant', moisture: 'mdi:water-alert', carbon_dioxide: 'mdi:molecule-co2',
  pm25: 'mdi:blur', smoke: 'mdi:smoke-detector', opening: 'mdi:square-outline', plug: 'mdi:power-plug', outlet: 'mdi:power-socket-eu', signal_strength: 'mdi:wifi', voltage: 'mdi:sine-wave', current: 'mdi:current-ac' };
// An icon that says what a button does, from its name and id (when it has no icon of its own)
const BTN_ICONS = [[/ring|bell|alert|chime/, 'mdi:bell-ring'], [/locat|gps|find|where|track/, 'mdi:crosshairs-gps'], [/update|refresh|sync|reload/, 'mdi:refresh'],
  [/flash|torch/, 'mdi:flashlight'], [/unlock/, 'mdi:lock-open-variant'], [/lock/, 'mdi:lock'], [/garage/, 'mdi:garage'], [/gate/, 'mdi:gate'], [/door/, 'mdi:door'],
  [/restart|reboot/, 'mdi:restart'], [/shut ?down|power ?off/, 'mdi:power'], [/notif|message|send/, 'mdi:message-text'], [/speak|tts|say|announce/, 'mdi:account-voice'],
  [/mute|silen/, 'mdi:volume-off'], [/vibrat/, 'mdi:vibrate'], [/volume/, 'mdi:volume-high'], [/wi-?fi/, 'mdi:wifi'], [/bluetooth/, 'mdi:bluetooth'], [/camera|photo|snap/, 'mdi:camera'],
  [/light|lamp/, 'mdi:lightbulb'], [/alarm/, 'mdi:alarm'], [/dnd|do not disturb/, 'mdi:minus-circle'], [/battery|charg/, 'mdi:battery-charging'], [/car/, 'mdi:car'], [/clean|vacuum/, 'mdi:robot-vacuum'], [/water|valve/, 'mdi:water'], [/fan/, 'mdi:fan'], [/tv|media|play/, 'mdi:play-circle']];
// icons for switches, fans, plugs… from their name, when the entity has no icon of its own ("Bathroom Fan" → a fan)
const NAME_ICONS = [[/exhaust|ventilat|extract|\bfans?\b|مروحة|شفاط/, 'mdi:fan'], [/charger|charging|شاحن/, 'mdi:cellphone-charging'], [/water ?heater|boiler|geyser|سخان/, 'mdi:water-boiler'],
  [/towel|radiator|heater|heating|underfloor|floor heat|دفاية|مدفأة/, 'mdi:radiator'], [/dehumid/, 'mdi:air-humidifier-off'], [/humidif/, 'mdi:air-humidifier'], [/purif/, 'mdi:air-purifier'],
  [/\bac\b|a\/c|air ?con|aircon|مكيف/, 'mdi:air-conditioner'], [/dish ?wash/, 'mdi:dishwasher'], [/dryer|tumble/, 'mdi:tumble-dryer'], [/wash|غسال/, 'mdi:washing-machine'],
  [/coffee|espresso|قهوة/, 'mdi:coffee-maker'], [/kettle|غلاية/, 'mdi:kettle'], [/microwave/, 'mdi:microwave'], [/oven|stove|cooker/, 'mdi:stove'], [/fridge|freezer|ثلاجة/, 'mdi:fridge'],
  [/pump|مضخة/, 'mdi:pump'], [/irrigat|sprinkl|garden water/, 'mdi:sprinkler-variant'], [/valve|water/, 'mdi:water'], [/pool/, 'mdi:pool'], [/fountain/, 'mdi:fountain'],
  [/\btv\b|television|شاشة|تلفزيون/, 'mdi:television'], [/speaker|sound|audio/, 'mdi:speaker'], [/console|playstation|xbox|\bps5\b/, 'mdi:gamepad-variant'], [/computer|\bpc\b|desktop/, 'mdi:desktop-tower-monitor'],
  [/printer/, 'mdi:printer'], [/router|wi-?fi|modem|network/, 'mdi:router-wireless'], [/camera|cctv|كاميرا/, 'mdi:cctv'], [/siren|alarm/, 'mdi:alarm-light'],
  [/christmas|xmas|string light|fairy/, 'mdi:string-lights'], [/mirror|مرآة/, 'mdi:mirror'], [/aquarium|fish/, 'mdi:fishbowl'], [/garage/, 'mdi:garage'], [/gate|بوابة/, 'mdi:gate'],
  [/curtain|blind|shade|ستارة/, 'mdi:blinds'], [/door|باب/, 'mdi:door'], [/window|نافذة/, 'mdi:window-closed-variant'], [/lamp|light|led|bulb|إضاءة|مصباح|ضوء/, 'mdi:lightbulb'],
  [/do not disturb|\bdnd\b/, 'mdi:minus-circle'], [/guest/, 'mdi:account-multiple'], [/sleep|night|نوم/, 'mdi:weather-night'], [/away|vacation|holiday/, 'mdi:airplane'],
  [/motion|presence|occupan/, 'mdi:motion-sensor'], [/plug|socket|outlet|power ?strip|extension|قابس|مقبس/, 'mdi:power-socket-eu']];
const NAMED_DOMAINS = ['switch', 'input_boolean', 'fan', 'button', 'input_button', 'script', 'automation', 'valve', 'humidifier'];
// the kind of device the card runs on: a phone or tablet (touch first; a tablet has a screen side of 600 px or more) or a PC
const devType = () => {
  if (!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) return 'pc';
  return Math.min(screen.width || 0, screen.height || 0) >= 600 ? 'tablet' : 'phone';
};
// a default kept by this browser only (long press on a floor or view button): sweet-home:<dashboard>:<kind>
const devKey = k => `sweet-home:${location.pathname.split('/')[1] || 'lovelace'}:${k}`;
const devGet = k => { try { return localStorage.getItem(devKey(k)); } catch (e) { return null; } };
const devSet = (k, v) => { try { if (v == null) localStorage.removeItem(devKey(k)); else localStorage.setItem(devKey(k), String(v)); } catch (e) { /* storage off */ } };
// The card editor's preview: Home Assistant makes a NEW card for every change typed or picked in the editor (hui-card
// rebuilds its element in preview mode). The card it removes hands its 3D view (canvas, labels, camera) over here, and
// the new card takes it instead of building the house again. Not taken within a few seconds: it is thrown away.
let SHARED = null;
const dropShared = () => { const S = SHARED; SHARED = null; if (!S) return; clearTimeout(S.timer); try { S.scene.pause(); S.scene.renderer?.dispose(); S.scene.ro?.disconnect(); S.scene.io?.disconnect(); } catch (e) { /* gone */ } };
let SMART = true; // `smart_icons` (Look): icons picked from names; off: the icon set in Home Assistant
const nameIcon = (id, name) => { const t = `${name || ''} ${String(id).split('.')[1] || ''}`.toLowerCase().replace(/_/g, ' '); return (NAME_ICONS.find(([re]) => re.test(t)) || [])[1] || null; };
const btnIcon = (id, name) => { const t = `${name || ''} ${String(id).split('.')[1] || ''}`.toLowerCase().replace(/_/g, ' '); return (BTN_ICONS.find(([re]) => re.test(t)) || [])[1] || (String(id).startsWith('script.') ? 'mdi:script-text-play' : 'mdi:gesture-tap-button'); };
// a button's label without the noise: "button Areen phone ring mod" → "Ring Mod" (the word "button" and the phone / person's name go)
const cleanLabel = (name, strip = []) => { let s = ` ${String(name || '')} `; for (const w of ['button', ...strip.filter(Boolean)]) s = s.replace(new RegExp(`\\s${String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']s?/g, "[’']?s?")}(?=\\s)`, 'gi'), ' '); s = s.trim().replace(/\s+/g, ' '); return s ? s.replace(/(^|\s)\S/g, c => c.toUpperCase()) : String(name || ''); };
const domIcon = (d, v, a = {}) => {
  const on = ['on', 'open', 'opening', 'playing', 'unlocked', 'home'].includes(v) || (d === 'climate' && v && v !== 'off');
  if (a.device_class && DC_ICON[a.device_class]) return DC_ICON[a.device_class];
  return DOM_ICON[d]?.[on ? 0 : 1] || (d === 'sensor' ? 'mdi:eye' : d === 'binary_sensor' ? (on ? 'mdi:checkbox-marked-circle' : 'mdi:checkbox-blank-circle-outline') : 'mdi:shape-outline');
};
const furnName = f => f.name || tr(FURN_TYPES[f.type]?.[0] || pretty(f.type));
const furnIcon = f => f.icon || FURN_TYPES[f.type]?.[1] || 'mdi:shape-outline';
const ALL_TABS = [
  ['home', 'Home', 'mdi:home-modern'], ['security', 'Security', 'mdi:shield-home'], ['climate', 'Climate', 'mdi:air-conditioner'],
  ['energy', 'Energy', 'mdi:lightning-bolt'], ['water', 'Water & Garden', 'mdi:water'], ['media', 'Media', 'mdi:television-play'], ['system', 'System', 'mdi:server'],
];
const fmtW = w => { if (w == null || isNaN(w)) return '—'; const a = Math.abs(w); return a >= 1000 ? `${(w / 1000).toFixed(2)}<small>kW</small>` : `${Math.round(w)}<small>W</small>`; };
const wxName = st => tc(String(st || '').replace('partlycloudy', 'partly cloudy').replace(/-/g, ' '));
const WEATHER_ICON = { 'clear-night': 'mdi:weather-night', cloudy: 'mdi:weather-cloudy', fog: 'mdi:weather-fog', hail: 'mdi:weather-hail', lightning: 'mdi:weather-lightning', 'lightning-rainy': 'mdi:weather-lightning-rainy', partlycloudy: 'mdi:weather-partly-cloudy', pouring: 'mdi:weather-pouring', rainy: 'mdi:weather-rainy', snowy: 'mdi:weather-snowy', 'snowy-rainy': 'mdi:weather-snowy-rainy', sunny: 'mdi:weather-sunny', windy: 'mdi:weather-windy', 'windy-variant': 'mdi:weather-windy-variant', exceptional: 'mdi:alert-circle-outline' };
const ACT_MODE = { heating: 'heat', cooling: 'cool', drying: 'dry', fan: 'fan_only' };
const acMode = st => !st || st.state === 'off' ? 'off' : ACT_MODE[st.attributes?.hvac_action] || st.state;
const acIcon = st => { const m = acMode(st); return `<ha-icon class="ac" icon="${HVAC_ICON[m] || 'mdi:air-conditioner'}" style="color:${HVAC_COLOR[m] || '#60a5fa'}" title="${m.replace('_', ' ')}"></ha-icon>`; };
const HVAC_ICON = { off: 'mdi:power', cool: 'mdi:snowflake', heat: 'mdi:fire', auto: 'mdi:thermostat-auto', dry: 'mdi:water-percent', fan_only: 'mdi:fan', heat_cool: 'mdi:sun-snowflake-variant' };
const HVAC_COLOR = { cool: '#60a5fa', heat: '#fb923c', auto: '#34d399', dry: '#fbbf24', fan_only: '#a5b4fc', heat_cool: '#c084fc' };
const ALARM = {
  disarmed: ['Disarmed', 'mdi:shield-off-outline', '#94a3b8'], armed_away: ['Armed away', 'mdi:shield-lock', '#f43f5e'],
  armed_home: ['Armed home', 'mdi:shield-home', '#fbbf24'], armed_night: ['Armed night', 'mdi:shield-moon', '#a78bfa'],
  armed_vacation: ['Vacation', 'mdi:shield-airplane', '#38bdf8'], arming: ['Arming…', 'mdi:shield-sync', '#fbbf24'],
  pending: ['Pending…', 'mdi:shield-alert', '#fb923c'], triggered: ['TRIGGERED', 'mdi:bell-ring', '#ef4444'],
};

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
export class SweetHomeCard extends HTMLElement {
  static get THREE() { return THREE_LIB; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sections = [];
    this._prev = new Map();
    this._mode = 'lights';
    this._sel = null;
    this._acOpen = null;
    this._confirm = {};
    this._hist = null;
  }
  // A new config (the card editor sends one for every letter typed or option picked). The card is rebuilt once the
  // changes stop for a moment, not for each of them; and when the house itself (rooms, walls, furniture…) didn't
  // change, the 3D view is kept as it is and only the panels are redrawn.
  setConfig(config) {
    const prev = this._cfgJSON, prevHouse = this._houseJSON;
    this._config = cleanConfig(config); this._cfgJSON = JSON.stringify(this._config); // what can't be used is left out
    // what the 3D view is built from: the house without the entity names given per room (names don't change the 3D view)
    const NAMES = ['names', 'light_names', 'lightNames', 'motion_names', 'motionNames'];
    this._houseJSON = JSON.stringify([this._config.house ?? null, this._config.language ?? null], (k, v) => (NAMES.includes(k) ? undefined : v));
    SMART = this._config.smart_icons !== false;
    if (!this._built || prev === this._cfgJSON) return;
    this._softNext = (this._softNext ?? true) && prevHouse === this._houseJSON; // soft only if no change in the batch touched the house
    clearTimeout(this._rbT);
    this._rbT = setTimeout(() => { const soft = this._softNext; this._softNext = null; this._rebuild(soft); }, this._softNext ? 250 : 600);
  }
  getCardSize() { return 20; }
  // Renaming devices and moving furniture are for editing the dashboard: their buttons show only while it is in edit
  // mode (Home Assistant sets `editMode` / `preview` on cards), while the card editor is open, or when the card sits in
  // Home Assistant's edit-mode wrappers. Leaving edit mode turns them off.
  set editMode(v) { this._editModeProp = !!v; this._syncEditing(); }
  get editMode() { return !!this._editModeProp; }
  set preview(v) { this._previewProp = !!v; this._syncEditing(); }
  get preview() { return !!this._previewProp; }
  _isEditing() {
    if (this._editModeProp || this._previewProp || window.__sweetHomeEditor?.isConnected) return true;
    if (/[?&]edit=1\b/.test(location.search)) return true;
    for (let n = this.parentNode, i = 0; n && i < 60; i++) {
      if (/^(hui-card-options|hui-card-edit-mode|hui-card-preview|hui-dialog-edit-card|hui-section-edit-mode)$/i.test(n.tagName || '')) return true;
      n = n.host || n.parentNode; // up through shadow roots
    }
    return false;
  }
  _syncEditing() {
    const e = this._isEditing(); if (e === this._editing) return;
    this._editing = e; this.toggleAttribute('editing', e);
    if (!e) { // left edit mode: stop moving furniture and renaming
      if (this._arrange) { this._arrange = false; if (this._three) this._three.arrange = false; this.$?.('arrBtn')?.classList.remove('on'); }
      if (this._naming) { this._naming = null; this._pendNames = null; }
      if (this._info?.startsWith('rename:')) this._closeSheet();
    }
    if (this._sections?.length) this._rerender(); // the pencils on the panels come and go
  }
  static getConfigElement() { return document.createElement('sweet-home-card-editor'); }
  static getStubConfig() { return { title: 'My Home' }; }
  // a new config (card editor): throw the old house away and build again
  _rebuild(soft = false) {
    clearTimeout(this._rbT);
    const T3 = this._three;
    if (soft && T3 && this.$('viewport')) this._keep3d = { scene: T3, vp: this.$('viewport') }; // moved into the new page as it is
    else {
      // the house changed: a new 3D view, seen from where the old one was (angle, zoom, floor, view mode)
      if (T3) this._view = { orbit: { ...T3.orbit, target: T3.orbit.target.clone() }, goal: { ...T3.goal, target: T3.goal.target.clone() }, vmode: T3.vmode, mode: T3.mode };
      try { T3?.pause(); T3?.renderer?.dispose(); T3?.ro?.disconnect(); T3?.io?.disconnect(); } catch (e) { /* gone */ }
    }
    if (this._sel) this._reselect = this._sel; // the open room stays open
    const tab = this._tab; this._keepTab = tab;
    this._three = null; this._model = null; this._built = false; this._sections = []; this._prev = new Map();
    this._eprefsReq = false; this._histReq = false; this._hist = null; this._ehCache = {}; this._mcal = null; this._mmeta = null; this._sel = null;
    if (this._hass) this.hass = this._hass;
  }
  // which tabs have at least one card to show
  _secOff(id) { const sec = this._sections?.find(x => x.el.id === id); return !sec || !!sec.off; }
  _tabOn(k) { return k === 'home' || (TAB_SECS[k] || []).some(id => !this._secOff(id)); }
  _tabList() { return ALL_TABS.filter(([k]) => this._tabOn(k)); }

  // Names given in this card (room `names` / `light_names`, card editor → Entities) replace the entity's name everywhere
  // on the dashboard: the card reads states through a copy of hass whose friendly_name is changed for those entities.
  // The renamed states are cached per original state object, so an entity that didn't change is still the same object.
  _withNames(h) {
    if (this._nameCfg !== this._config) {
      this._nameCfg = this._config; this._nameCache = new WeakMap();
      this._nameMap = Object.assign({}, ...(this._config?.house?.rooms || []).map(r => ({ ...(r.light_names || {}), ...(r.names || {}) })), this._config?.names || {});
    }
    const map = this._nameMap, ids = Object.keys(map); if (!h || !ids.length) return h;
    const states = { ...h.states };
    for (const id of ids) {
      const st = states[id]; if (!st || !map[id]) continue;
      let c = this._nameCache.get(st);
      if (!c) { c = { ...st, attributes: { ...st.attributes, friendly_name: map[id] } }; this._nameCache.set(st, c); }
      states[id] = c;
    }
    const o = Object.create(h); o.states = states; o._raw = h; return o;
  }
  set hass(h) {
    h = this._withNames(h?._raw || h);
    this._hass = h;
    FAHR = String(h?.config?.unit_system?.temperature || '').toUpperCase().includes('F');
    this._syncEditing();
    setLang(this._config?.language || h?.locale?.language || h?.language);
    if (!this._model) this._model = buildModel(this._config || {}, h);
    useModel(this._model);
    if (!this._built) this._build();
    if (!this._eprefsReq) { this._eprefsReq = true; this._loadEPrefs(); }
    if (!this._hist && !this._histReq) { this._histReq = true; this._loadHistory(); } // 24 h grid / solar chart on the Energy tab
    // CPU: HA sends a new hass object for every state change in the house (power sensors every second,
    // ~100 Proxmox sensors …); on phones the card now takes them in batches at most every 400 ms
    if (this._raf || this._updT) return;
    const run = () => { this._updT = null; this._raf = requestAnimationFrame(() => { this._raf = null; this._update(); }); };
    if (COARSE && this._built && this._sections) this._updT = setTimeout(run, 400); else run();
  }
  get hass() { return this._hass; }

  connectedCallback() {
    this._syncEditing(); setTimeout(() => this._syncEditing(), 300); // the edit-mode wrappers can arrive just after
    this._clockT = setInterval(() => this._tick(), 1000);
    this._camT = setInterval(() => this._refreshCams(), 4000);
    if (!this._visH) {
      this._visH = () => {
        if (document.hidden) { this._hiddenAt = Date.now(); this._unmountCams(); return; }
        if (this._hiddenAt && Date.now() - this._hiddenAt > 60e3 && this._tab !== 'home') { this._select?.(null); this._setTab(MODEL?.startTab && this._tabOn(MODEL.startTab) ? MODEL.startTab : 'home'); }
        this._hiddenAt = 0; this._refreshCams(true);
      };
      document.addEventListener('visibilitychange', this._visH);
    }
    this._histT = setInterval(() => { this._loadHistory(); this._loadETotals(); if (this._eh?.off === 0) { this._ehCache = {}; this._rerender('ehist'); } }, 5 * 60 * 1000);
    if (this._three) this._three.resume();
    else if (this._gaveAway && SHARED?.owner === this) { this._gaveAway = false; this._adoptShared(); }
    else if (this._gaveAway && this._built) { this._gaveAway = false; this._rebuild(false); } // its 3D view was handed over and is gone: build it again
  }
  disconnectedCallback() {
    clearInterval(this._clockT); clearInterval(this._camT); clearInterval(this._histT);
    this._unmountCams(); if (this._visH) { document.removeEventListener('visibilitychange', this._visH); this._visH = null; }
    if (this._three) this._three.pause();
    // while the dashboard or this card is being edited: the 3D view is kept for the card that replaces this one
    if (this._three && (this._previewProp || this._editModeProp || window.__sweetHomeEditor?.isConnected) && this.$('viewport')) {
      if (SHARED && SHARED.scene !== this._three) dropShared();
      SHARED = { scene: this._three, vp: this.$('viewport'), owner: this, mode: this._mode, level: this._level, sel: this._sel, tab: this._tab, timer: setTimeout(dropShared, 5000) };
      this._three = null; this._gaveAway = true;
    }
  }

  /* ---------- state helpers ---------- */
  s(id) { return id ? this._hass?.states[id] : undefined; }
  v(id) { return this.s(id)?.state; }
  n(id) { const x = parseFloat(this.v(id)); return isNaN(x) ? null : x; }
  f(id, d = 1, unit = true) {
    const st = this.s(id); if (!st || BAD.includes(st.state)) return '—';
    const x = parseFloat(st.state); if (isNaN(x)) return esc(st.state);
    const u = unit ? (st.attributes.unit_of_measurement || '') : '';
    return `${x.toFixed(d)}${u ? `<small>${esc(u)}</small>` : ''}`;
  }
  // an entrance (gate, garage door…): open / closed / moving / bad (unavailable) / unknown (a relay without a sensor)
  // Sensors: a contact sensor (on = open), a cover or lock, or a text sensor such as Frigate's state classification
  // ("open" / "closed" / "partially open" …). The first sensor with a clear reading wins; with sensors but no clear
  // reading it is 'unsure' (the tile shows what the sensor says).
  entState(g) {
    const srcs = g.sensors?.length ? g.sensors : g.sensor ? [g.sensor] : g.cover || g.id.startsWith('lock.') ? [g.id] : [];
    if (!srcs.length) return BAD.includes(this.v(g.id)) ? 'bad' : 'unknown';
    let seen = false;
    for (const src of srcs) {
      const raw = this.v(src); if (raw == null || BAD.includes(raw)) continue; seen = true;
      const v = String(raw).toLowerCase().trim(), d = src.split('.')[0];
      if (g.openWords?.includes(v)) return 'open';
      if (g.closedWords?.includes(v)) return 'closed';
      if (/^(opening|closing|moving)$/.test(v)) return 'moving';
      if (d === 'binary_sensor' || d === 'input_boolean' || d === 'switch') return v === 'on' ? 'open' : 'closed';
      if (/^(open|opened|on|unlocked|ajar|partially[ _]?open|half[ _]?open)$/.test(v)) return 'open';
      if (/^(closed|close|shut|off|locked)$/.test(v)) return 'closed';
    }
    return seen ? 'unsure' : 'bad';
  }
  on(id) { const v = this.v(id); return v === 'on' || v === 'open' || v === 'playing' || v === 'home'; }
  ok(id) { const v = this.v(id); return v !== undefined && !BAD.includes(v); }
  climOn(id) { const v = this.v(id); return v && v !== 'off' && !BAD.includes(v); }
  doorOpen(d) { const v = this.v(d.id); return d.open ? String(v || '').toLowerCase() === d.open.toLowerCase() : v === 'on'; }
  // a car is parked when its sensor says so: binary sensor on, tracker / person home, or a state like "parked"
  // (`parked_state` sets the exact state); no sensor: always parked
  carParked(id, want) {
    if (!id) return true;
    const v = String(this.v(id) ?? ''), d = id.split('.')[0];
    if (BAD.includes(v)) return true;
    if (want != null) return v.toLowerCase() === String(want).toLowerCase();
    if (d === 'binary_sensor' || d === 'input_boolean' || d === 'switch') return v === 'on';
    if (d === 'device_tracker' || d === 'person') return v === 'home';
    return ['on', 'home', 'parked', 'present', 'occupied', 'detected', 'true', 'yes'].includes(v.toLowerCase()) || (!isNaN(parseFloat(v)) && parseFloat(v) > 0);
  }
  roomLit(r) { return (r.lights || []).some(l => this.v(l) === 'on'); }
  roomMotion(r) { return (r.motion || []).some(m => this.v(m) === 'on'); }
  name() { return (this._hass?.user?.name || '').split(' ')[0]; }

  // resolves true on success, false on failure (and shows the error)
  call(domain, service, data) {
    return this._hass.callService(domain, service, data).then(() => true, e => { this.haptic('failure'); this._toast(e?.message || 'That action failed', true); return false; });
  }
  // Haptic feedback: the same window 'haptic' event HA's own buttons fire. HA forwards it to the Companion app
  // (iPhone + Android) or, in a browser, vibrates when the profile's "Vibrate" setting is on. Types:
  // selection · light · medium · heavy · success · warning · failure
  haptic(type) { window.dispatchEvent(new CustomEvent('haptic', { detail: type })); }
  _toast(msg, bad) {
    const el = this.$?.('toast'); if (!el) return;
    el.textContent = msg; el.className = `toast show ${bad ? 'bad' : ''}`;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.className = 'toast'; }, 2800);
  }
  _openKeypad(svc) {
    const label = { alarm_disarm: 'turn the alarm off', alarm_arm_away: 'arm away', alarm_arm_night: 'arm night', alarm_arm_vacation: 'arm for a trip', alarm_arm_home: 'arm home' }[svc] || 'continue';
    this._pin = ''; this._pinSvc = svc; this._pick = null;
    const sh = this.$('sheet');
    sh.innerHTML = `<div class="sheet keypad" role="dialog" aria-label="Alarm code">
      <div class="sh-h"><div><b>Enter alarm code</b><span>to ${esc(label)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="pin-dots" id="pinDots" aria-live="polite"></div><div class="pin-msg" id="pinMsg"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => `<button class="key k-${k}" data-act="pin" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k === 'ok' ? 'Submit' : k}">${k === 'del' ? ic('mdi:backspace-outline') : k === 'ok' ? ic('mdi:check-bold') : k}</button>`).join('')}</div></div>`;
    sh.classList.add('open');
    this._renderPin();
    this._keyH = e => {
      if (/^[0-9]$/.test(e.key)) this._pinKey(e.key); else if (e.key === 'Backspace') this._pinKey('del');
      else if (e.key === 'Enter') this._pinKey('ok'); else if (e.key === 'Escape') this._closeSheet(); else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this._keyH);
  }
  _renderPin(msg, bad) {
    const d = this.$('pinDots'); if (!d) return;
    d.innerHTML = this._pin.length ? '<i></i>'.repeat(this._pin.length) : '<span>••••</span>';
    const m = this.$('pinMsg'); if (m) { m.textContent = msg || ''; m.className = `pin-msg ${bad ? 'bad' : ''}`; }
  }
  _pinKey(k) {
    if (this._pinBusy || this._pin == null) return;
    if (k === 'del') this._pin = this._pin.slice(0, -1);
    else if (k === 'ok') return this._pinSubmit();
    else if (this._pin.length < 12) this._pin += k;
    this._renderPin();
  }
  async _pinSubmit() {
    if (!this._pin) return;
    const code = this._pin, svc = this._pinSvc, before = this.v(E.alarm);
    this._pinBusy = true; this._renderPin('Checking…');
    const sent = await this.call('alarm_control_panel', svc, { entity_id: E.alarm, code });
    const ok = sent && await this._waitState(E.alarm, s => svc === 'alarm_disarm' ? s === 'disarmed' : s !== before, 3500);
    this._pinBusy = false; this._pin = '';
    if (ok) { this.haptic('success'); this._closeSheet(); this._toast(svc === 'alarm_disarm' ? 'Alarm turned off' : 'Alarm armed'); }
    else { this.haptic('failure'); this._renderPin('Wrong code, try again', true); const d = this.$('pinDots'); d?.classList.remove('shake'); void d?.offsetWidth; d?.classList.add('shake'); }
  }
  _waitState(id, pred, ms) {
    return new Promise(res => { const t0 = Date.now(); const chk = () => { if (pred(this.v(id))) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(chk, 150); }; chk(); });
  }
  more(entityId) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })); }

  /* ---------- build ---------- */
  _build() {
    this._built = true;
    if (!document.getElementById('h3d-font')) { // Inter, bundled with the card: nothing is loaded from outside (works offline, no third party)
      const l = document.createElement('style'); l.id = 'h3d-font';
      l.textContent = `@font-face{font-family:'Inter';font-style:normal;font-display:swap;font-weight:100 900;src:url(${INTER}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
      document.head.appendChild(l);
    }
    // Arabic uses the device's own Arabic font (SF Arabic on Apple, Noto on Android, Segoe UI on Windows): nothing loaded from outside
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
    <div class="app" dir="${isRTL() ? 'rtl' : 'ltr'}" lang="${esc(this._hass?.locale?.language || 'en')}">
      <div class="aurora a1"></div><div class="aurora a2"></div><div class="aurora a3"></div>
      <header class="top">
        <div class="hello">
          <div class="greet" id="greet"></div>
          <div class="clock"><span id="time"></span><span class="date" id="date"></span></div>
        </div>
        <div class="hdr-right" id="hdr"></div>
      </header>

      <nav class="tabs" id="tabs"></nav>
      <main>
      <section class="tab" data-tab="home">
       <div class="home-grid">
        <section class="stage card">
          <div class="stage-top">
            <div class="title">${ic('mdi:home-modern')}<div><b>${esc(MODEL.title)}</b><span>${this._config?.hint === false ? tr('Live 3D view') : tr('Live 3D view · tap a room')}</span></div></div>
            <div class="seg" id="modeSeg">
              <button data-act="mode" data-mode="lights" class="on">${ic('mdi:lightbulb-group')}<span>${tr('Lights')}</span></button>
              <button data-act="mode" data-mode="climate">${ic('mdi:thermometer')}<span>${tr('Climate')}</span></button>
              <button data-act="mode" data-mode="presence">${ic('mdi:motion-sensor')}<span>${tr('Presence')}</span></button>
            </div>
            <div class="tools">
              <button class="ibtn" data-act="view" data-view="top" data-lp="view" title="${tr('Top view')} · ${tr('long press: the default on this device')}">${ic('mdi:floor-plan')}</button>
              <button class="ibtn" data-act="view" data-view="reset" data-lp="view" title="${tr('3D view')} · ${tr('long press: the default on this device')}">${ic('mdi:rotate-3d-variant')}</button>
              <button class="ibtn" data-act="spin" id="spinBtn" title="${tr('Auto-rotate')}">${ic('mdi:autorenew')}</button>
              ${this._hass?.user?.is_admin && !MODEL.gltf ? `<button class="ibtn edit-only ${this._arrange ? 'on' : ''}" data-act="arrange" id="arrBtn" title="${tr('Move furniture')}" aria-label="${tr('Move furniture')}">${ic('mdi:cursor-move')}</button>` : ''}
            </div>
          </div>
          <div class="viewport" id="viewport">
            <canvas id="cv"></canvas>
            <div class="labels" id="labels"></div>
            <div class="legend" id="legend"></div>
            <div class="hint" id="hint" role="note"></div>
            <div class="lvls" id="lvls" role="tablist" aria-label="${tr('Floors')}"></div>
            <div class="loading" id="loading"><div class="spinner"></div><span>${tr('Building your home…')}</span></div>
            <aside class="drawer" id="drawer"></aside>
          </div>
        </section>
        <aside class="col">
          <div class="card" id="glance"></div>
          <div class="card" id="modes"></div>
        </aside>
       </div>
      </section>
      <section class="tab" data-tab="security"><div class="tgrid sec"><div class="card" id="security"></div><div class="card cams" id="cams"></div></div></section>
      <section class="tab" data-tab="climate"><div class="card" id="climate"></div></section>
      <section class="tab" data-tab="energy"><div class="tgrid wide1"><div class="card" id="energy"></div><div class="card" id="car"></div><div class="card" id="ehist"></div></div></section>
      <section class="tab" data-tab="water"><div class="tgrid"><div class="card" id="water"></div><div class="card" id="irrigation"></div></div></section>
      <section class="tab" data-tab="media"><div class="tgrid"><div class="card" id="media"></div><div class="card" id="mserver"></div><div class="card" id="tvlight"></div></div></section>
      <section class="tab" data-tab="system"><div class="tgrid"><div class="alerts" id="alerts"></div><div class="card" id="lab"></div><div class="card" id="devices"></div></div></section>
      </main>
      <footer class="foot">Sweet Home · v${VERSION}</footer>
    </div>
    <div class="sheet-bg" id="sheet" data-act="sheetclose"></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
    const K3 = this._keep3d; // the same house: the old 3D view (canvas, labels, camera) is moved into the new page as it is
    if (K3) { this.$('viewport').replaceWith(K3.vp); const dr = this.$('drawer'); if (dr) { dr.className = 'drawer'; dr.innerHTML = ''; } }
    const $ = id => this.shadowRoot.getElementById(id);
    this.$ = $;
    this._swipeClose($('drawer'));
    this._swipeTabs(this.shadowRoot.querySelector('main'));
    this._lockBehindSheet();
    // listeners on the shadow root are attached once: it outlives a rebuild (each card editor change rebuilds the
    // card), and attaching them again made one tap count several times (a toggle switched back, a confirm skipped)
    if (!this._wired) {
    this._wired = true;
    this._longPress();
    this._spkInput();
    this.shadowRoot.addEventListener('click', e => this._onClick(e));
    this.shadowRoot.addEventListener('error', e => { if (e.target?.tagName === 'IMG' && e.target.closest('.jfimg')) e.target.remove(); }, true);
    this.shadowRoot.addEventListener('input', e => { if (e.target.matches?.('input[type=range],input[type=color]')) this._dragging = e.target; this._onSlide(e, false); });
    this.shadowRoot.addEventListener('change', e => { if (e.target.matches?.('[data-rename]')) { this._rename(e.target.dataset.rename, e.target.value); return; } });
    this.shadowRoot.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-rename]')) e.target.blur(); });
    // a name field being typed in is left alone when the popup redraws
    this.shadowRoot.addEventListener('focusin', e => { if (e.target.matches?.('[data-rename]')) this._dragging = e.target; });
    this.shadowRoot.addEventListener('focusout', e => { if (e.target.matches?.('[data-rename]') && this._dragging === e.target) this._dragging = null; });
    this.shadowRoot.addEventListener('change', e => { if (e.target.matches?.('[data-rename]')) return; if (e.target.matches?.('input[type=range]')) this.haptic('light'); this._onSlide(e, true); this._dragging = null; });
    }

    const all = (...a) => a.flat(Infinity).filter(Boolean);
    const roomEnts = ROOMS.map(r => [r.temp, r.hum, r.lights, r.motion, r.climate, r.count, r.fan, r.locks, r.doors, (r.doors || []).map(d => DOOR_INFO[d]?.timeout), (r.plugs || []).map(p => [p.id, p.power]), r.media, (r.entities || []).map(e => e.id), r.furnEnts]);
    const acEnts = E.acs.map(a => [a.id, a.power, this._acExtras(a.id)]);
    const glanceEnts = all(E.alarm, E.doors.map(d => d.id), E.locks.map(l => l.id), roomEnts, acEnts, E.energy.grid, E.energy.solar,
      E.water.tank, E.car.charging, E.car.parking, E.cameras.map(c => [c.person, c.car]), E.media.tv, E.lab.cpu, E.lab.status);
    this._sections = [
      { el: $('tabs'), deps: glanceEnts, render: () => this._rTabs() },
      { el: $('glance'), deps: glanceEnts, render: () => this._rGlance() },
      { el: $('hdr'), deps: all(E.weather, E.persons, E.alarm, E.doors.map(d => d.id), roomEnts, E.energy.grid, E.energy.solar, E.face, E.car.parking, E.locks.map(l => l.id)), render: () => this._rHeader() },
      { el: $('security'), deps: all(E.alarm, E.locks.map(l => l.id), E.doors.map(d => d.id), E.entrances.flatMap(g => [g.id, ...(g.sensors || [])])), render: () => this._rSecurity() },
      { el: $('climate'), deps: all(acEnts, roomEnts), render: () => this._rClimate() },
      { el: $('modes'), deps: all(E.modes.map(m => m[0])), render: () => this._rModes() },
      { el: $('drawer'), deps: all(roomEnts, acEnts, E.media.tv), render: () => this._rDrawer() },
      { el: $('tvlight'), deps: all(E.tvLight.light, E.tvLight.selects.map(s => s[0]), E.media.echoes), render: () => this._rTvLight() },
      { el: $('energy'), deps: all(E.energy.grid, E.energy.solar, E.energy.current, E.energy.daily, E.energy.monthly, E.energy.yearly, E.energy.imported, E.energy.exported, E.energy.produced, E.energy.dad, E.energy.stored, E.energy.consumers.map(c => c[0]), Object.values(E.forecast)), render: () => this._rEnergy(), after: el => this._afterEnergy(el) },
      { el: $('ehist'), deps: [], render: () => this._rEHist() },
      { el: $('alerts'), deps: [], render: () => this._rAlerts() },
      { el: $('water'), deps: all(E.water.tank, E.water.quality, E.water.temp, E.water.pumps.map(p => [p.id, p.power, p.info]), E.water.entities.map(e => e.id)), render: () => this._rWater() },
      { el: $('car'), deps: all(Object.values(E.car).filter(v => typeof v === 'string' && v.includes('.'))), render: () => this._rCar() },
      { el: $('cams'), deps: all(E.cameras.map(c => [c.person, c.car, c.motion, c.face, c.plate, c.relay, c.door]), E.face), render: () => this._rCams(), after: () => this._refreshCams(true) },
      { el: $('media'), deps: all(E.media.tv, E.media.shield, E.media.echoes, E.media.ytTimer, E.media.ytLimit, E.media.ytBlock, E.media.ytForce, E.media.ytSelect), render: () => this._rMedia() },
      { el: $('mserver'), deps: all(Object.values(E.mserver).map(o => Object.values(o).filter(v => typeof v === 'string')), this._jfPlayers()), render: () => this._rMServer() },
      { el: $('lab'), deps: all(Object.values(E.lab).filter(x => typeof x === 'string'), this._labGuestIds().map(g => [`binary_sensor.${g}_status`, `sensor.${g}_status`, `sensor.${g}_cpu_used`, `sensor.${g}_memory_used_percentage`])), render: () => this._rLab() },
      { el: $('devices'), deps: all(E.devices.map(d => [d.bat, d.chg, d.trk, d.chgState]), E.persons), render: () => this._rDevices() },
      { el: $('irrigation'), deps: all(E.irrigation.valves.map(v => v[0]), E.irrigation.every, E.irrigation.day, E.irrigation.tomorrow, E.irrigation.next, E.irrigation.notify, E.irrigation.time, E.irrigation.durations), render: () => this._rIrrigation() },
    ];
    const offP = k => this._config?.panels?.[k] === false; // a panel switched off in the card editor
    const off = {
      security: offP('security') || !(E.alarm || E.locks.length || E.doors.length || E.entrances.length), cams: offP('security') || offP('cameras') || !E.cameras.length, climate: offP('climate') || !MODEL.has.climate,
      modes: offP('modes') || !E.modes.length, tvlight: !(E.tvLight.light || E.media.echoes.length), car: !(E.car.charging || E.car.power || E.car.battery) || this._config?.panels?.car === false,
      water: offP('water') || !(E.water.tank || E.water.pumps.length || E.water.entities.length), irrigation: offP('irrigation') || !(E.irrigation.valves.length || E.irrigation.every || E.irrigation.day || E.irrigation.tomorrow || E.irrigation.next), media: !E.media.tv || MODEL.E && this._config?.panels?.media === false,
      mserver: !MODEL.hasMS || this._config?.panels?.media_server === false, lab: !E.lab.cpu || this._config?.panels?.homelab === false, devices: offP('devices') || !E.devices.length,
      energy: true, ehist: true, alerts: this._config?.panels?.attention === false,
    };
    for (const sec of this._sections) if (off[sec.el.id]) { sec.off = true; sec.el.style.display = 'none'; }
    const kt = this._keepTab; this._keepTab = null;
    this._setTab(kt && this._tabOn(kt) ? kt : MODEL.startTab && this._tabOn(MODEL.startTab) ? MODEL.startTab : 'home');
    const L = MODEL.levels || [{ level: 0 }];
    if (this._level == null || !L.some(l => l.level === this._level)) this._level = this._defFloor(L);
    this._tick();
    const K = this._keep3d;
    const defsNow = JSON.stringify([this._config?.default_view, this._config?.default_floor]); this._keep3d = null;
    if (K) { // the 3D view moved in above goes on as it was
      this._three = K.scene;
      // a new start view / floor picked in Look: shown right away
      const defs = JSON.stringify([this._config?.default_view, this._config?.default_floor]);
      if (this._defsJSON != null && defs !== this._defsJSON) { this._three.view(this._defView()); const L = MODEL.levels || [{ level: 0 }]; this._setLevel(this._defFloor(L)); if (ROOM[this._reselect]?.level !== this._level) this._reselect = null; }
      this._renderLegend(); this._three.sync(); this._three._dirty = true;
      // drawn again at once: a canvas moved in the page can show blank until its next frame (up to 0.5 s on a phone at rest)
      try { this._three.renderer.render(this._three.scene, this._three.cam); } catch (e) { /* next frame */ }
      this._three._wake?.();
      if (this._mode && this._mode !== 'lights') this._setMode(this._mode); // the mode buttons of the new page
    } else this._init3d();
    this._defsJSON = defsNow;
    this._hintShow();
    this._renderLevels();
    if (this._reselect && ROOM[this._reselect]) { const id = this._reselect; setTimeout(() => this._select(id), 0); }
    this._reselect = null;
  }

  _acExtras(id) { // related switches such as jet mode / display light
    const obj = id.split('.')[1];
    return Object.keys(this._hass?.states || {}).filter(e => e.startsWith(`switch.${obj}_`));
  }
  _setTab(t, dir) {
    this._tab = t;
    this.shadowRoot.querySelectorAll('.tab').forEach(s => { s.classList.toggle('on', s.dataset.tab === t); s.classList.remove('from-next', 'from-prev'); if (dir && s.dataset.tab === t) s.classList.add('from-' + dir); });
    this.shadowRoot.querySelectorAll('#tabs .tb').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    const bar = this.$?.('tabs'), btn = bar?.querySelector('.tb.on');
    if (bar && btn && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
    if (this._sections) this._update(); // render the cards of the tab being opened
    if (dir) this._scrollUp();
    if (t === 'security') this._refreshCams(true); else this._unmountCams();
    if (t !== 'home' && this._sel) this._select(null);
    this._closeSheet();
  }
  // after a swipe to another tab: back to the top of the cards. A smooth scroll here was sometimes dropped (still-running
  // fling from the swipe, or the tab bar's own smooth scroll cancelling it), so jump, and re-check briefly
  // unless a finger is down again
  // Lands with the first card just under the sticky tab bar (main's scroll-margin-top), the header scrolled away
  //. Only scrolls up: anywhere past that point, even a little (card top hidden under the tab bar),
  // counts; at the very top of the page it stays put.
  _scrollUp() {
    const m = this.shadowRoot.querySelector('main'); if (!m) return;
    const go = () => {
      if (this._touchDown) return;
      const mt = parseFloat(getComputedStyle(m).scrollMarginTop) || 0;
      if (m.getBoundingClientRect().top < mt - 1) m.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    go(); requestAnimationFrame(go); setTimeout(go, 150); setTimeout(go, 450);
  }
  // scroll a card into view just below the sticky tab bar and flash it (At a glance tiles)
  _goCard(id) {
    setTimeout(() => { // after the tab is shown
      const el = this.$(id); if (!el || !el.offsetParent) return;
      const bar = this.$('tabs'), off = (bar ? bar.getBoundingClientRect().height + 8 : 0) + 14;
      el.style.scrollMarginTop = off + 'px';
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }, 60);
  }
  _onSlide(e, commit) {
    const el = e.target;
    if (commit && el.dataset?.color) { const v = el.value; this.call('light', 'turn_on', { entity_id: el.dataset.color, rgb_color: [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)) }); return; }
    if (!el.matches?.('input[type=range]')) return;
    const v = Number(el.value); el.style.setProperty('--p', `${(v - el.min) / (el.max - el.min) * 100}%`);
    const lbl = el.dataset.lbl && this.shadowRoot.getElementById(el.dataset.lbl); if (lbl) lbl.textContent = `${v}%`;
    if (!commit) return;
    if (el.dataset.bright) this.call('light', 'turn_on', { entity_id: el.dataset.bright, brightness_pct: v });
    if (el.dataset.vol) this.call('media_player', 'volume_set', { entity_id: el.dataset.vol, volume_level: v / 100 });
  }
  _openPicker(id, kind) {
    const st = this.s(id), P = PICK[kind]; if (!st || !P) return;
    const opts = P.list(st) || []; const cur = P.cur(st);
    this._pick = { id, kind, opts };
    const name = tc((st.attributes.friendly_name || id).replace(/^Shelly\s*/i, ''));
    const sh = this.$('sheet');
    sh.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(P.title)}">
      <div class="sh-h"><div><b>${esc(P.title)}</b><span>${esc(name)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="opts">${opts.map((o, i) => `<button class="opt ${o === cur ? 'on' : ''}" data-act="pickopt" data-i="${i}">
        ${kind === 'hvac' ? ic(HVAC_ICON[o] || 'mdi:thermostat') : ''}<span>${esc(pretty(o))}</span>${o === cur ? ic('mdi:check') : ''}</button>`).join('')}</div></div>`;
    sh.classList.add('open');
  }
  // Info sheets opened from the header chips ("N lights on", "xx° inside"); they refresh live while open
  _openInfo(kind) {
    this._closeSheet();
    this._info = kind;
    const sh = this.$('sheet'); sh.innerHTML = `<div class="sheet" role="dialog" aria-label="${kind.startsWith('rename:') ? tr('Rename devices') : kind === 'lights' ? 'Lights' : kind === 'temps' ? 'Temperatures' : kind === 'weather' ? 'Weather' : kind === 'power' ? 'Power' : kind.startsWith('jf') ? 'Jellyfin library' : kind.startsWith('mup:') ? 'Coming up' : kind === 'swap' ? 'Swap usage' : kind === 'wanted' ? 'Wanted episodes' : 'Phone'}"></div>`;
    sh.classList.add('open');
    if (kind === 'weather') this._wxSub();
    if (kind === 'wanted' && (!this._wanted || Date.now() - this._wanted.at > 5 * 60e3 || String(this._wanted.n) !== String(this.v(E.mserver.sonarr.wanted)))) this._loadWanted();
    if (kind.startsWith('jf') && this._jfc && Date.now() - (this._jfcAt || 0) > 10 * 60e3) this._jfc = null; // library cache: 10 min
    this._renderInfo();
  }
  _renderInfo() {
    const box = this.$('sheet')?.querySelector('.sheet'); if (!box || !this._info) return;
    const head = (icon, title, sub) => `<div class="sh-h">${ic(icon)}<div><b>${title}</b><span>${sub}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>`;
    let html;
    if (this._info.startsWith('rename:')) html = this._rnSheet(head, this._info.slice(7));
    else if (this._info.startsWith('rnbadge:')) html = this._rnBadgeSheet(head, Number(this._info.slice(8)));
    else if (this._info === 'lights') {
      const rooms = ROOMS.filter(r => (r.lights || []).some(l => this.s(l)));
      const all = rooms.flatMap(r => r.lights.filter(l => this.s(l))), on = all.filter(l => this.v(l) === 'on').length;
      html = head('mdi:lightbulb-group', 'Lights', `${on} of ${all.length} on · tap to switch`) + rooms.map(r => {
        const rows = r.lights.filter(l => this.s(l)).map(l => {
          const st = this.s(l), isOn = st.state === 'on', fx = r.lightFx?.[l];
          const lv = isOn && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) + '%' : isOn ? 'On' : st.state === 'off' ? 'Off' : pretty(st.state);
          const icon = fx === 'strip' ? 'mdi:led-strip-variant' : fx === 'tv' ? 'mdi:television-ambient-light' : fx === 'spots' ? 'mdi:light-recessed' : isOn ? 'mdi:ceiling-light' : 'mdi:ceiling-light-outline';
          const nm = r.lightNames?.[l] || tc((st.attributes.friendly_name || l).replace(/^Shelly\s*/i, ''));
          return `<button class="lrow ${isOn ? 'on' : ''}" data-act="toggle" data-id="${l}">${ic(icon)}<span>${esc(nm)}</span><b>${esc(lv)}</b></button>`;
        }).join('');
        return `<div class="dsec">${esc(r.name)}</div>${rows}`;
      }).join('');
    } else if (this._info === 'weather') {
      html = this._weatherHTML(head);
    } else if (this._info === 'wanted') {
      html = this._wantedHTML(head);
    } else if (this._info === 'swap') {
      html = this._swapHTML(head);
    } else if (this._info.startsWith('mup:')) {
      html = this._mupHTML(head);
    } else if (this._info.startsWith('jf')) {
      html = this._jfHTML((...a) => head(...a) + this._jfWaitHTML());
    } else if (this._info === 'power') {
      html = this._powerHTML(head);
    } else if (this._info.startsWith('phone:')) {
      const pid = this._info.slice(6), P = E.phones[pid], ps = this.s(pid); if (!P) return;
      const pic = ps?.attributes.entity_picture;
      const b = this.n(P.battery), chg = this.on(P.charging), ring = this.v(P.ringer);
      const RING = { normal: ['Normal', 'mdi:volume-high'], vibrate: ['Vibrate', 'mdi:vibrate'], silent: ['Silent', 'mdi:volume-off'] };
      const rg = RING[ring] || [tc(pretty(ring || '—')), 'mdi:volume-high'];
      const row = (id, icon, label, val, cls = '') => id && this.s(id) ? `<div class="mrow ${cls}" data-act="more" data-id="${id}">${ic(icon)}<span>${label}</span><b>${esc(val)}</b></div>` : '';
      const where = this.v(P.tracker) || ps?.state;
      html = `<div class="sh-h">${pic ? `<img src="${esc(pic)}" alt="">` : ic('mdi:cellphone')}<div><b>${esc(P.name)}</b><span>${esc(tc(pretty(ps?.state || '—')))}</span></div>${this._editing && this._hass?.user?.is_admin ? `<button class="ibtn" data-act="rnphone" data-id="${pid}" title="${tr('Rename devices')}" aria-label="${tr('Rename devices')}">${ic('mdi:pencil-outline')}</button>` : ''}<button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>`
        + row(P.battery, chg ? 'mdi:battery-charging' : b != null && b < 20 ? 'mdi:battery-alert' : 'mdi:battery', 'Battery', b != null ? `${Math.round(b)}%${chg ? ' · Charging' : ''}` : '—', b != null && b < 20 && !chg ? 'open' : chg ? 'on' : '')
        + row(P.tracker, 'mdi:map-marker', 'Location', tc(pretty(where || '—')))
        + row(P.location, 'mdi:map', 'Address', this.ok(P.location) ? this.v(P.location) : '—')
        + row(P.ringer, rg[1], 'Ringer Mode', rg[0])
        + row(P.wifi, 'mdi:wifi', 'Wi-Fi', this.ok(P.wifi) && this.v(P.wifi) !== '<not connected>' ? this.v(P.wifi) : 'Not connected')
        + (P.entities || []).map(id => this._entRow(id)).join('')
        + `<div class="phbtns">${P.buttons.filter(([id]) => this.s(id)).map(([id, n, i0]) => {
          const d = id.split('.')[0], fn = this.s(id).attributes.friendly_name || id;
          // a name of your own (here or a dashboard name) as written; else the entity's name without "button" and the phone / person's name
          const dev = this._hass.devices?.[this._hass.entities?.[id]?.device_id] || {};
          const nm = n || (this._nameMap?.[id] ? fn : cleanLabel(fn, [dev.name_by_user, dev.name, P.name, ps?.attributes.friendly_name, String(pid).split('.')[1]?.replace(/_/g, ' ')])), i = i0 || (SMART ? btnIcon(id, nm) : this.s(id).attributes.icon || domIcon(d, this.s(id).state, this.s(id).attributes)); return `<button class="phbtn" data-act="${d === 'script' || d === 'scene' ? 'run' : d === 'button' || d === 'input_button' ? 'press' : 'toggle'}" data-id="${id}" data-label="${esc(nm)}">${ic(i)}<span>${esc(nm)}</span></button>`; }).join('')}</div>`;
    } else {
      const rows = ROOMS.filter(r => r.temp && this.s(r.temp)).map(r => {
        const t = this.n(r.temp), h = r.hum ? this.n(r.hum) : null, ac = r.climate && this.climOn(r.climate);
        return `<div class="mrow trow" data-act="more" data-id="${r.temp}">${ic(r.icon)}<span>${esc(r.name)}</span>${ac ? acIcon(this.s(r.climate)) : ''}${h != null ? `<em>${Math.round(h)}%</em>` : ''}<b style="color:${t != null ? rgb(tempRGB(t)) : 'inherit'}">${t != null ? t.toFixed(1) + '°' : '—'}</b></div>`;
      }).join('');
      const inside = ROOMS.filter(r => r.temp && !r.outdoor).map(r => this.n(r.temp)).filter(x => x != null);
      const avg = inside.length ? inside.reduce((a, b) => a + b, 0) / inside.length : null;
      const w = this.s(E.weather);
      const out = w ? `<div class="dsec">Outside</div><div class="mrow trow" data-act="info" data-kind="weather" data-id="${E.weather}">${ic(WEATHER_ICON[w.state] || 'mdi:weather-partly-cloudy')}<span>${esc(wxName(w.state))}</span>${w.attributes.humidity != null ? `<em>${Math.round(w.attributes.humidity)}%</em>` : ''}${isFinite(parseFloat(w.attributes.temperature)) ? `<b style="color:${rgb(tempRGB(Number(w.attributes.temperature)))}">${Number(w.attributes.temperature).toFixed(1)}°</b>` : '<b>—</b>'}</div>` : '';
      html = head('mdi:home-thermometer', 'Temperatures', avg != null ? `Average ${avg.toFixed(1)}° · ${Math.min(...inside).toFixed(1)}° – ${Math.max(...inside).toFixed(1)}°` : 'No readings')
        + `<div class="dsec">Rooms</div>${rows}${out}`;
    }
    if (box._html === html) return; box._html = html;
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    if (!box.firstChild) box.replaceChildren(tpl.content); else morph(box, tpl.content, /^(rename|rnbadge):/.test(this._info) ? this._dragging : null); // keeps the name being typed
  }
  // Weather sheet: replaces HA's weather more-info (still on long press). Daily + hourly forecasts
  // come live from weather/subscribe_forecast while the sheet is open.
  _wxSub() {
    const conn = this._hass?.connection; if (!conn?.subscribeMessage) return;
    this._wxUnsub = [];
    for (const type of ['daily', 'hourly']) {
      conn.subscribeMessage(m => { (this._wx ||= {})[type] = m.forecast || []; if (this._info === 'weather') this._renderInfo(); },
        { type: 'weather/subscribe_forecast', entity_id: E.weather, forecast_type: type })
        .then(u => { if (this._info === 'weather' && this._wxUnsub) this._wxUnsub.push(u); else u(); }, () => {});
    }
  }
  _weatherHTML(head) {
    const w = this.s(E.weather); if (!w) return head('mdi:weather-partly-cloudy', 'Weather', 'Not available');
    const a = w.attributes, lang = this._hass?.locale?.language || 'en';
    const daily = this._wx?.daily || [], hourly = (this._wx?.hourly || []).slice(0, 24);
    const icon = c => WEATHER_ICON[c] || 'mdi:weather-partly-cloudy';
    const deg = t => t == null || isNaN(t) ? '—' : `${Math.round(t)}°`;
    const col = t => t == null ? 'inherit' : rgb(tempRGB(t));
    const today = daily[0], night = w.state === 'clear-night' || this.v(E.sun) === 'below_horizon';
    const mood = /rain|pour|lightning|hail/.test(w.state) ? 'rain' : /snow/.test(w.state) ? 'snow' : /cloud|fog/.test(w.state) ? 'cloud' : night ? 'night' : 'sun';
    const compass = b => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16];
    const uvLvl = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very High' : 'Extreme';
    const tm = iso => new Date(iso).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
    const sun = this.s(E.sun)?.attributes || {};
    const rise = sun.next_rising, set = sun.next_setting, sunNext = rise && set ? (new Date(set) < new Date(rise) ? ['Sunset', set, 'mdi:weather-sunset-down'] : ['Sunrise', rise, 'mdi:weather-sunset-up']) : null;
    const stat = (ic_, label, val, sub, extra = '') => `<div class="wxs">${ic(ic_)}<span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}${extra}</div>`;
    const stats = [
      a.apparent_temperature != null ? stat('mdi:thermometer', 'Feels Like', deg(a.apparent_temperature)) : '',
      a.humidity != null ? stat('mdi:water-percent', 'Humidity', `${Math.round(a.humidity)}%`, a.dew_point != null ? `Dew point ${deg(a.dew_point)}` : '') : '',
      a.wind_speed != null ? stat('mdi:weather-windy', 'Wind', `${Math.round(a.wind_speed)}<small>${esc(a.wind_speed_unit || '')}</small>`, a.wind_bearing != null ? `from ${compass(a.wind_bearing)}` : '',
        a.wind_bearing != null ? `<i class="wxarrow" style="transform:rotate(${Math.round(a.wind_bearing + 180)}deg)">${ic('mdi:navigation')}</i>` : '') : '',
      a.uv_index != null ? stat('mdi:sun-wireless', 'UV Index', (Math.round(a.uv_index * 10) / 10).toString(), uvLvl(a.uv_index)) : '',
      a.pressure != null ? stat('mdi:gauge', 'Pressure', `${Math.round(a.pressure)}<small>${esc(a.pressure_unit || '')}</small>`) : '',
      a.cloud_coverage != null ? stat('mdi:cloud-percent-outline', 'Clouds', `${Math.round(a.cloud_coverage)}%`) : '',
      sunNext ? stat(sunNext[2], sunNext[0], tm(sunNext[1])) : '',
    ].filter(Boolean).slice(0, 6).join('');
    // hourly strip with a temperature curve behind the numbers
    let hours = '';
    if (hourly.length) {
      const ts = hourly.map(h => h.temperature), lo = Math.min(...ts), hi = Math.max(...ts), CW = 54, H = 34;
      const y = t => hi === lo ? H / 2 : 4 + (1 - (t - lo) / (hi - lo)) * (H - 8);
      const pts = hourly.map((h, i) => `${i * CW + CW / 2},${y(h.temperature).toFixed(1)}`).join(' ');
      hours = `<div class="wxh"><div class="wxhin" style="width:${hourly.length * CW}px">
        <svg class="wxcurve" width="${hourly.length * CW}" height="${H}" viewBox="0 0 ${hourly.length * CW} ${H}"><polyline points="${pts}" fill="none" stroke="rgba(251,191,36,.55)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${hourly.map((h, i) => `<circle cx="${i * CW + CW / 2}" cy="${y(h.temperature).toFixed(1)}" r="2.5" fill="${col(h.temperature)}"/>`).join('')}</svg>
        ${hourly.map((h, i) => `<div class="wxhc"><span>${i ? esc(new Date(h.datetime).toLocaleTimeString(lang, { hour: 'numeric' })) : 'Now'}</span>${ic(icon(h.condition))}<b style="color:${col(h.temperature)}">${deg(h.temperature)}</b><em>${h.precipitation > 0 ? `${h.precipitation}<small>mm</small>` : ''}</em></div>`).join('')}
      </div></div>`;
    }
    // daily rows with a range bar on one shared scale
    let days = '';
    if (daily.length) {
      const lo = Math.min(...daily.map(d => d.templow ?? d.temperature)), hi = Math.max(...daily.map(d => d.temperature)), span = Math.max(1, hi - lo);
      days = daily.map((d, i) => {
        const l = d.templow ?? d.temperature, h = d.temperature, x0 = (l - lo) / span * 100, x1 = (h - lo) / span * 100;
        const now = i === 0 && a.temperature != null ? `<i class="wxnowdot" style="left:${Math.min(100, Math.max(0, (a.temperature - lo) / span * 100))}%"></i>` : '';
        return `<div class="wxd"><span>${i ? esc(new Date(d.datetime).toLocaleDateString(lang, { weekday: 'short' })) : 'Today'}</span>${ic(icon(d.condition))}
          <em>${d.precipitation > 0 ? `${ic('mdi:water')}${d.precipitation}<small>mm</small>` : ''}</em>
          <b class="lo">${deg(l)}</b><div class="wxbar"><i style="left:${x0}%;width:${Math.max(2, x1 - x0)}%;background:linear-gradient(90deg,${col(l)},${col(h)})"></i>${now}</div><b>${deg(h)}</b></div>`;
      }).join('');
    }
    return head(icon(w.state), 'Weather', `${esc(tc(a.friendly_name || 'Outside'))} · now`)
      + `<div class="wxnow ${mood}" data-act="more" data-id="${E.weather}">${ic(icon(w.state), 'wxbig')}
          <div class="wxt"><b style="color:${col(a.temperature)}">${a.temperature != null ? Number(a.temperature).toFixed(1) : '—'}°</b><span>${esc(wxName(w.state))}</span></div>
          ${today ? `<div class="wxhl"><span>${ic('mdi:arrow-up')}${deg(today.temperature)}</span><span>${ic('mdi:arrow-down')}${deg(today.templow)}</span></div>` : ''}</div>`
      + `<div class="wxstats">${stats}</div>`
      + (hours ? `<div class="dsec">Next 24 Hours</div>${hours}` : '')
      + (days ? `<div class="dsec">${daily.length}-Day Forecast</div><div class="wxdays">${days}</div>` : (hours ? '' : `<div class="dsec">Next 24 Hours</div><div class="wxskh">${Array.from({ length: 6 }, () => `<div>${skl('60%', 9)}${skl('22px', 22, 'border-radius:50%;margin:6px auto')}${skl('70%', 12)}</div>`).join('')}</div>
        <div class="dsec">Forecast</div><div class="wxdays">${Array.from({ length: 5 }, () => `<div class="wxd">${skl('80%', 12)}${skl('20px', 20, 'border-radius:50%')}<span></span>${skl('100%', 11)}${skl('100%', 6)}${skl('100%', 11)}</div>`).join('')}</div>`))
      + (a.attribution ? `<div class="wxfoot">${esc(a.attribution)}</div>` : '');
  }
  // Power sheet: from the header "… now" chip, instead of HA's more-info of the grid sensor
  // (long press still opens that; double tap = solar). Live split, today's chart (same as the Energy tab), top devices.
  _powerHTML(head) {
    const g = this.n(E.energy.grid) ?? 0, sol = Math.max(0, this.n(E.energy.solar) ?? 0), home = Math.max(0, g + sol), exp = g < 0;
    const selfUse = home > 0 ? Math.round(Math.min(sol, home) / home * 100) : 0;
    const cons = this._eConsumers().map(([id, n, i]) => [n, i, this.n(id), id]).filter(c => c[2] != null && c[2] >= 6).sort((a, b) => b[2] - a[2]).slice(0, 6);
    const max = Math.max(1, ...cons.map(c => c[2]));
    const big = (id, icon, label, w, col, sub) => `<div class="pwb" data-act="more" data-id="${id}" style="--c:${col}">${ic(icon)}<span>${label}</span><b>${fmtW(w)}</b><small>${sub}</small></div>`;
    return head('mdi:flash', 'Power Now', exp ? `Sending ${fmtW(-g).replace(/<\/?small>/g, ' ').trim()} to the grid` : sol > 1 ? `Solar covers ${selfUse}% of the home` : 'All from the grid')
      + `<div class="pwbig">
          ${big(E.energy.current, 'mdi:home-lightning-bolt', 'Home', home, '#e7ecf6', this.ok(E.energy.current) ? this.f(E.energy.current, 1) : 'using now')}
          ${big(E.energy.solar, 'mdi:solar-panel-large', 'Solar', sol, '#fbbf24', sol > 1 ? 'producing' : 'idle')}
          ${big(E.energy.grid, 'mdi:transmission-tower', exp ? 'To Grid' : 'From Grid', Math.abs(g), exp ? '#34d399' : '#60a5fa', exp ? 'exporting' : 'importing')}
        </div>
        ${home > 0 ? `<div class="pwmix"><i style="width:${selfUse}%;background:#fbbf24"></i><i style="width:${100 - selfUse}%;background:#60a5fa"></i></div>
          <div class="pwmixl"><span><i style="background:#fbbf24"></i>Solar ${selfUse}%</span><span><i style="background:#60a5fa"></i>Grid ${100 - selfUse}%</span></div>` : ''}
        <div class="dsec">Today</div>
        <div class="spark pwspark" id="spark2">${this._sparkSVG()}</div>
        ${this._eCardKpis()}
        ${cons.length ? `<div class="dsec">Using Power Now</div><div class="cons">${cons.map(([n, i, w, id]) => `<div class="crow" data-act="more" data-id="${id}">${ic(i)}<span>${esc(n)}</span><div class="bar"><i style="width:${(w / max * 100).toFixed(1)}%"></i></div><b>${fmtW(w)}</b></div>`).join('')}</div>` : ''}
        <button class="pwgo" data-act="tab" data-tab="energy" data-to="energy">${ic('mdi:lightning-bolt')}Open Energy Tab${ic('mdi:chevron-right')}</button>`;
  }
  // ---------- Jellyfin library browser ----------
  // Shows / Movies tiles → poster grid (media_source/browse_media on media-source://jellyfin); a movie or an episode
  // plays on the TV (panels.media_server.jellyfin_tv) through the Jellyfin app's session player; a show opens its seasons and episodes.
  _jfBrowse(id) {
    const c = this._jfc || (this._jfc = {}); if (!this._jfcAt || !Object.keys(c).length) this._jfcAt = Date.now();
    if (c[id]) return c[id].data;
    c[id] = { data: null };
    this._hass.callWS({ type: 'media_source/browse_media', media_content_id: id })
      .then(r => { c[id].data = r; }, () => { c[id].data = { children: [], error: true }; })
      .then(() => { if (this._info?.startsWith('jf')) this._renderInfo(); });
    return null;
  }
  // ---- playing on the TV: works with no setup ----
  // 1. The TV: `jellyfin_tv.app_player` if set, else any media player (not Jellyfin's own) whose source list has
  //    Jellyfin — Android TV / Google TV / Fire TV over ADB first, then Android TV Remote, then webOS, Tizen, Roku ….
  // 2. The Jellyfin app is opened there. Over ADB it is force-stopped first: the Jellyfin Android TV app crashes when
  //    play_media reaches it while it sits idle after a video was closed, and plays fine right after a fresh start.
  // 3. The TV's Jellyfin session is the one that becomes playable after that (Jellyfin's session entity ids change
  //    with every app start, so they are never stored). A configured name (`jellyfin_tv.session`) and TV-type clients
  //    (device model "Jellyfin for Android TV", Roku, webOS …) only rank the candidates.
  // 4. While waiting, Jellyfin's session list is refreshed every 4 s; after 15 s the sheet shows what is going on,
  //    with Reconnect (reloads the Jellyfin integration — admins) for when Home Assistant has stopped seeing sessions.
  _jfLauncher() {
    const T = E.mserver.jellyfin.tv || {}, ents = this._hass?.entities || {};
    const plat = id => ents[id]?.platform || '';
    const src = st => (st?.attributes.source_list || []).find(s => /jellyfin/i.test(s));
    if (T.app_player) { const st = this.s(T.app_player); return st ? { id: T.app_player, plat: plat(T.app_player), source: T.source || src(st) || 'Jellyfin' } : null; }
    const rank = p => p === 'androidtv' ? 0 : p === 'androidtv_remote' ? 1 : 2;
    const c = Object.keys(this._hass?.states || {}).filter(id => id.startsWith('media_player.') && plat(id) !== 'jellyfin')
      .map(id => this.s(id)).filter(st => !BAD.includes(st.state) && src(st))
      .sort((a, b) => rank(plat(a.entity_id)) - rank(plat(b.entity_id)) || (a.state === 'off') - (b.state === 'off'));
    return c[0] ? { id: c[0].entity_id, plat: plat(c[0].entity_id), source: src(c[0]) } : null;
  }
  // Jellyfin players that can be sent a video now (available + PLAY_MEDIA, bit 512), best first:
  // configured name, then TV apps, then the most recently updated.
  _jfSessions() {
    const h = this._hass, ents = h?.entities || {}, T = E.mserver.jellyfin.tv || {};
    const re = T.session ? new RegExp(T.session.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return Object.keys(ents).filter(id => id.startsWith('media_player.') && ents[id].platform === 'jellyfin')
      .map(id => this.s(id)).filter(st => st && !BAD.includes(st.state) && (st.attributes.supported_features & 512))
      .map(st => {
        const dev = h.devices?.[ents[st.entity_id]?.device_id] || {};
        const tv = /\btv\b|android ?tv|roku|webos|tizen|kodi|xbox|playstation|fire/i.test(`${dev.model || ''}`);
        return { st, score: (re && re.test(st.attributes.friendly_name || st.entity_id) ? 4 : 0) + (tv ? 2 : 0) };
      })
      .sort((a, b) => b.score - a.score || new Date(b.st.last_updated) - new Date(a.st.last_updated));
  }
  // "Living Room TV" from the TV's own name, without an IP address the integration put in it
  _jfTvName(L) {
    const n = (this.s(L?.id)?.attributes.friendly_name || '').replace(/\s*\d{1,3}(\.\d{1,3}){3}\s*/g, ' ').trim();
    return n && !/^android tv$/i.test(n) ? n : 'your TV';
  }
  _jfPlayable() { return new Set(this._jfSessions().map(x => x.st.entity_id)); }
  async _jfPlay(item, kind, title) {
    const J = E.mserver.jellyfin; if (!item || this._jfBusy) return;
    this._jfBusy = true; this._jfCancel = false;
    const T = J.tv || {}, name = title || 'it';
    let tvName = tc(T.name || 'your TV');
    const send = async st => {
      if (await this.call('media_player', 'play_media', { entity_id: st.entity_id, media_content_id: item, media_content_type: kind || 'video' })) {
        this.haptic('success'); this._toast(`Playing ${name} on ${tvName}`); this._closeSheet();
      }
    };
    try {
      const L = this._jfLauncher(), all = this._jfSessions();
      if (L && !T.name) tvName = this._jfTvName(L);
      const best = all[0], live = all.find(x => x.score > 0 && ['playing', 'paused'].includes(x.st.state));
      // something already plays on the TV's Jellyfin app: send it straight there
      if (live) return await send(live.st);
      // no TV to open Jellyfin on: use a Jellyfin app that is open now
      if (!L) {
        if (best) return await send(best.st);
        this.haptic('failure'); this._toast(`Open the Jellyfin app on ${tvName} first`, true); return;
      }
      // a TV we can't restart Jellyfin on, with its Jellyfin app already open: play there
      if (L.plat !== 'androidtv' && best && best.score > 0) return await send(best.st);
      const before = this._jfPlayable();
      this._toast(`Starting Jellyfin on ${tvName}…`);
      let t0 = Date.now();
      if (this.v(L.id) === 'off' && !(await this.call('media_player', 'turn_on', { entity_id: L.id }))) return;
      if (L.plat === 'androidtv') {
        await this.call('androidtv', 'adb_command', { entity_id: L.id, command: `am force-stop ${T.package || 'org.jellyfin.androidtv'}` });
        await new Promise(r => setTimeout(r, 800));
      }
      const listed = (this.s(L.id)?.attributes.source_list || []).includes(L.source);
      const opened = L.plat === 'androidtv_remote' && !listed
        ? await this.call('media_player', 'play_media', { entity_id: L.id, media_content_type: 'app', media_content_id: T.package || 'org.jellyfin.androidtv' })
        : await this.call('media_player', 'select_source', { entity_id: L.id, source: L.source });
      if (!opened) return;
      // the TV's session: one that became playable after the app was opened (or after a reconnect)
      let ses = null, after = t0;
      const fresh = () => {
        if (this._jfCancel) return true;
        const c = this._jfSessions().filter(x => !before.has(x.st.entity_id) || new Date(x.st.last_updated) > after && x.score > 0);
        ses = c[0]?.st || null; return !!ses;
      };
      const ref = J.clients || Object.keys(this._hass.entities || {}).find(id => this._hass.entities[id].platform === 'jellyfin');
      const nudge = setInterval(() => { if (ref) this._hass.callService('homeassistant', 'update_entity', { entity_id: ref }).catch(() => {}); }, 4e3);
      this._jfReconnect = async () => {
        this._jfWait = { msg: 'Reconnecting Home Assistant to Jellyfin…', busy: true }; this._renderInfo();
        try {
          const [entry] = await this._hass.callWS({ type: 'config_entries/get', domain: 'jellyfin' });
          if (entry) { after = Date.now(); before.clear(); await this._hass.callService('homeassistant', 'reload_config_entry', { entry_id: entry.entry_id }); }
        } catch (e) { this._toast(e?.message || 'Reconnect failed', true); }
        this._jfWait = { msg: 'Reconnected — waiting for Jellyfin on the TV…', busy: true }; this._renderInfo();
      };
      let ok;
      try {
        ok = await this._waitFn(fresh, 15e3);
        if (!ok) {
          const front = /jellyfin/i.test(`${this.s(L.id)?.attributes.app_id || ''} ${this.s(L.id)?.attributes.source || ''}`);
          this._jfWait = { msg: front
            ? `Jellyfin is open on ${tvName}, but Home Assistant can't see it yet. If it asks who's watching, pick a user there — ${name} starts after that.`
            : `Waiting for Jellyfin on ${tvName}… If it asks who's watching, pick a user there — ${name} starts after that.` };
          this._renderInfo();
          ok = await this._waitFn(fresh, 180e3);
        }
      } finally { clearInterval(nudge); this._jfWait = null; this._jfReconnect = null; this._renderInfo(); }
      if (this._jfCancel) { this._toast('Stopped'); return; }
      if (!ok) { this.haptic('failure'); this._toast(`Jellyfin did not connect on ${tvName}`, true); return; }
      this._toast(`Opening ${name}…`);
      await new Promise(r => setTimeout(r, 2500)); // let the app finish loading its home screen
      await send(ses);
    } finally { this._jfBusy = false; }
  }
  // the waiting banner at the top of the Jellyfin sheets
  _jfWaitHTML() {
    const w = this._jfWait; if (!w) return '';
    const admin = this._hass?.user?.is_admin;
    return `<div class="jfwait" role="status"><div class="jfwm">${ic('mdi:loading', 'spin')}<span>${esc(w.msg)}</span></div>
      ${w.busy ? '' : `<div class="jfwb">${admin && this._jfReconnect ? `<button class="pill" data-act="jfreconnect">${ic('mdi:refresh')}<span>Reconnect</span></button>` : ''}<button class="pill" data-act="jfcancel"><span>Cancel</span></button></div>
      <div class="jfwh">${admin ? 'Reconnect reloads the Jellyfin integration, for when Home Assistant has stopped seeing Jellyfin apps.' : 'Still nothing? Ask an admin to reload the Jellyfin integration.'}</div>`}</div>`;
  }
  _waitFn(pred, ms) {
    return new Promise(res => { const t0 = Date.now(); const chk = () => { if (pred()) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(chk, 300); }; chk(); });
  }
  _jfHTML(head) {
    const k = this._info, id8 = x => String(x || '').replace('media-source://jellyfin/', '');
    const wait = `<div class="jfgrid">${Array.from({ length: 9 }, () => `<div class="jfpo"><div class="jfimg skl"></div>${skl('75%', 10)}</div>`).join('')}</div>`;
    const img = (src, icon) => `<div class="jfimg">${ic(icon)}${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</div>`;
    if (k === 'jflib:movies' || k === 'jflib:shows') {
      const movies = k.endsWith('movies');
      const root = this._jfBrowse('media-source://jellyfin');
      const H = t => head(movies ? 'mdi:movie-open' : 'mdi:television-classic', movies ? 'Movies' : 'Shows', t);
      if (!root) return H('Jellyfin') + wait;
      const libs = (root.children || []).filter(l => /movie/i.test(l.title) === movies);
      let n = 0, loading = false;
      const secs = libs.map(l => {
        const d = this._jfBrowse(l.media_content_id); if (!d) { loading = true; return ''; }
        const items = (d.children || []).slice().sort((a, b) => a.title.localeCompare(b.title)); n += items.length;
        const grid = items.map(c => {
          const play = c.can_play && !c.can_expand;
          return `<button class="jfpo" ${play ? `data-act="jfplay" data-mk="${c.media_class === 'episode' ? 'episode' : 'movie'}"` : `data-act="info" data-kind="jfshow:${id8(c.media_content_id)}"`} data-item="${id8(c.media_content_id)}" data-title="${esc(c.title)}">
            ${img(c.thumbnail, movies ? 'mdi:movie-open' : 'mdi:television-classic')}${play ? `<i class="jfplayi">${ic('mdi:play')}</i>` : ''}<span>${esc(c.title)}</span></button>`;
        }).join('');
        return `${libs.length > 1 ? `<div class="dsec">${esc(tc(l.title))} · ${items.length}</div>` : ''}<div class="jfgrid">${grid}</div>`;
      }).join('');
      return H(`${loading ? 'Loading…' : `${n} in Jellyfin`} · ${movies ? `tap to play on ${tc(E.mserver.jellyfin.tv?.name || this._jfTvName(this._jfLauncher()))}` : 'tap a show for its episodes'}`) + (secs || wait);
    }
    if (k.startsWith('jfshow:')) {
      const sid = k.slice(7), show = this._jfBrowse('media-source://jellyfin/' + sid);
      const back = `<button class="jfback" data-act="info" data-kind="jflib:shows">${ic('mdi:chevron-left')}Shows</button>`;
      if (!show) return head('mdi:television-classic', 'Show', 'Loading…') + back + wait;
      const kids = show.children || [];
      const direct = kids.filter(c => c.can_play && !c.can_expand), seasons = kids.filter(c => c.can_expand);
      const si = clamp(this._jfSeason?.[sid] ?? 0, 0, Math.max(0, seasons.length - 1));
      let eps = direct, loading = false;
      if (!direct.length && seasons.length) { const d = this._jfBrowse(seasons[si].media_content_id); if (d) eps = d.children || []; else loading = true; }
      const top = `<div class="jfshowh">${img(show.thumbnail, 'mdi:television-classic')}<div><b>${esc(show.title)}</b><span>${seasons.length ? `${seasons.length} season${seasons.length > 1 ? 's' : ''}` : ''}${eps.length ? `${seasons.length ? ' · ' : ''}${eps.length} episodes${seasons.length > 1 ? ' in this season' : ''}` : ''}</span><em>Tap an episode to play it on ${esc(tc(E.mserver.jellyfin.tv?.name || 'your TV'))}</em></div></div>`;
      const chips = seasons.length > 1 ? `<div class="jfseas">${seasons.map((c, i) => `<button class="${i === si ? 'on' : ''}" data-act="jfseason" data-show="${sid}" data-i="${i}">${esc(c.title)}</button>`).join('')}</div>` : '';
      const list = eps.map((c, i) => `<button class="jfep" data-act="jfplay" data-mk="episode" data-item="${id8(c.media_content_id)}" data-title="${esc(c.title)}">
          ${img(c.thumbnail, 'mdi:play-circle-outline')}<div><b>${i + 1}. ${esc(c.title)}</b></div>${ic('mdi:play', 'jfepp')}</button>`).join('');
      return head('mdi:television-classic', esc(show.title), 'Jellyfin') + back + top + chips + (loading ? wait : list || '<div class="wxwait">No episodes</div>');
    }
    return head('mdi:jellyfish', 'Jellyfin', '') + wait;
  }
  // Swap sheet: double tap the Home Lab Swap ring → the 10 LXC containers using the most swap, each with
  // a two-tap Reboot (its Proxmox VE `button.<guest>_reboot`). Only guests whose `sensor.<guest>_swap_used` is enabled
  // are listed; Proxmox reports no swap for VMs.
  _swapHTML(head) {
    const h = this._hass, L = E.lab, all = Object.keys(h.states);
    const ids = all.map(id => id.match(/^sensor\.((?:lxc|qemu)_.+)_swap_used$/)).filter(Boolean).map(m => m[1]);
    const name = g => {
      const fn = h.states[`sensor.${g}_status`]?.attributes.friendly_name || h.states[`binary_sensor.${g}_status`]?.attributes.friendly_name || g;
      const m = fn.match(/^(LXC|QEMU)\s+(.+?)\s*\((\d+)\)/i);
      return m ? { n: tc(m[2].replace(/[-_]+/g, ' ')), id: m[3], vm: /qemu/i.test(m[1]) } : { n: tc(g.replace(/_/g, ' ')), id: '', vm: g.startsWith('qemu') };
    };
    const rows = ids.map(g => ({ g, mb: this.n(`sensor.${g}_swap_used`), pct: this.n(`sensor.${g}_swap_used_percentage`), tot: this.n(`sensor.${g}_swap_total`) }))
      .filter(r => r.mb != null).sort((a, b) => b.mb - a.mb);
    const top = rows.slice(0, 10), max = Math.max(1, ...top.map(r => r.mb));
    const sz = mb => mb >= 1024 ? `${(mb / 1024).toFixed(2)}<small>GB</small>` : `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}<small>MB</small>`;
    const used = this.n(L.swapUsed), tot = this.n(L.swapTotal), np = this.n(L.swap);
    const list = top.map((r, i) => {
      const nm = name(r.g), up = this.v(`sensor.${r.g}_status`) === 'running' || this.on(`binary_sensor.${r.g}_status`);
      const rb = h.states[`button.${r.g}_reboot`] ? `button.${r.g}_reboot` : null;
      const col = r.pct != null && r.pct > 80 ? '#f43f5e' : r.pct != null && r.pct > 50 ? '#fbbf24' : '#f472b6';
      return `<div class="swr" data-act="more" data-id="sensor.${r.g}_swap_used">
        <em>${i + 1}</em>${ic(nm.vm ? 'mdi:monitor' : 'mdi:cube-outline')}
        <div class="swn"><b>${esc(nm.n)}</b><span>${nm.id ? `${nm.vm ? 'VM' : 'CT'} ${nm.id}` : ''}${up ? '' : ' · stopped'}${r.pct != null ? ` · ${Math.round(r.pct)}% of its swap` : ''}</span>
          <div class="bar"><i style="width:${(r.mb / max * 100).toFixed(1)}%;background:${col}"></i></div></div>
        <strong>${sz(r.mb)}</strong>
        ${rb ? (Date.now() - (this._rbAt?.[rb] || 0) < 20e3 ? `<button class="rbtn busy" disabled>${ic('mdi:loading', 'spin')}Rebooting…</button>` : `<button class="rbtn" data-act="reboot" data-id="${rb}">${ic('mdi:restart')}Reboot</button>`) : '<span class="swnr"></span>'}</div>`;
    }).join('');
    const sumTop = rows.reduce((a, r) => a + r.mb, 0);
    return head('mdi:swap-horizontal-bold', 'Swap Usage', np != null ? `Node ${Math.round(np)}% used${used != null && tot ? ` · ${(used / 1024).toFixed(1)} of ${(tot / 1024).toFixed(1)} GB` : ''}` : '')
      + (np != null ? `<div class="swnode" data-act="more" data-id="${L.swap}"><div class="bar"><i style="width:${clamp(np, 0, 100)}%;background:${np > 90 ? '#f43f5e' : np > 70 ? '#fbbf24' : '#f472b6'}"></i></div></div>` : '')
      + `<div class="dsec">Top ${top.length} containers · ${(sumTop / 1024).toFixed(2)} GB listed</div>`
      + (list || '<div class="wxwait">No container reports swap yet</div>')
      + (ids.length < 20 ? `<div class="swnote">${ic('mdi:information-outline')}Only ${ids.length} container${ids.length === 1 ? '' : 's'} report swap. The rest have their Proxmox VE "Swap used" sensor disabled in Home Assistant.</div>` : '');
  }
  // Wanted sheet: the Library "Wanted ›" tile → Sonarr's missing (monitored, aired, no file) episodes
  // from HA's sonarr.get_wanted, grouped by show: poster, show, then each episode with its air date and summary.
  async _loadWanted() {
    const n = this.v(E.mserver.sonarr.wanted);
    this._wanted = { at: Date.now(), n, eps: this._wanted?.eps || null };
    try {
      const r = await this._hass.callWS({ type: 'config_entries/get', domain: 'sonarr' });
      const entry = (r || []).find(e => e.state === 'loaded')?.entry_id;
      const res = entry ? await this._hass.callService('sonarr', 'get_wanted', { entry_id: entry, max_items: 100 }, undefined, false, true) : null;
      this._wanted = { at: Date.now(), n, eps: Object.values(res?.response?.episodes || {}) };
    } catch (e) { this._wanted = { at: Date.now(), n, eps: [], err: true }; }
    if (this._info === 'wanted') this._renderInfo();
  }
  _wantedHTML(head) {
    const W = this._wanted, lang = this._hass?.locale?.language || 'en';
    const H = sub => head('mdi:magnify', 'Wanted', sub);
    if (!W?.eps) return H('Loading from Sonarr…') + `<div class="wtg"><div class="wth"><div class="muppo jfimg skl"></div><div class="mupt">${skl('70%', 16)}${skl('45%', 11, 'margin-top:6px')}</div></div>${Array.from({ length: 2 }, () => `<div class="wte">${skl('60%', 12)}${skl('100%', 10, 'margin-top:8px')}${skl('85%', 10, 'margin-top:5px')}</div>`).join('')}</div>`;
    if (!W.eps.length) return H(W.err ? "Couldn't reach Sonarr" : 'Nothing missing') + `<div class="mempty">${ic('mdi:check-circle-outline')}${W.err ? 'Sonarr did not answer.' : 'Every monitored episode that has aired is downloaded.'}</div>`;
    const groups = new Map();
    for (const e of W.eps) { const k = e.series_title || 'Unknown'; (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    const day = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }); };
    const body = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([show, eps]) => {
      const f = eps[0], po = f.images?.poster;
      eps.sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
      return `<div class="wtg">
        <div class="wth">${f.images?.fanart ? `<div class="mupbg" style="background-image:url('${esc(this._img(f.images.fanart, 780))}')"></div>` : ''}
          <div class="muppo jfimg">${ic('mdi:television-classic')}${po ? `<img src="${esc(this._img(po, 342))}" alt="" loading="lazy">` : ''}</div>
          <div class="mupt"><b>${esc(show)}</b><span>${eps.length} missing episode${eps.length > 1 ? 's' : ''}</span><em>${esc([f.network, f.series_year, f.series_status ? tc(f.series_status) : ''].filter(Boolean).join(' · '))}</em></div></div>
        ${eps.map(e => `<div class="wte"><div class="wtei"><b>${esc(e.episode_identifier || '')}</b><span>${esc(e.title || 'TBA')}</span><em>${e.air_date ? `Aired ${esc(day(e.air_date_utc || e.air_date))}` : ''}${e.runtime ? ` · ${e.runtime} min` : ''}${e.monitored === false ? ' · not monitored' : ''}</em></div>
          ${e.overview ? `<p>${esc(e.overview)}</p>` : ''}</div>`).join('')}
      </div>`;
    }).join('');
    return H(`${W.eps.length} missing episode${W.eps.length > 1 ? 's' : ''} · ${groups.size} show${groups.size > 1 ? 's' : ''}`)
      + body + `<div class="swnote">${ic('mdi:information-outline')}Aired, monitored episodes Sonarr hasn't downloaded yet. Sonarr keeps searching for them automatically.</div>`;
  }
  // While a popup sheet is open the page behind it must not scroll: a drag / wheel on the
  // dimmed backdrop does nothing, and one inside the sheet only scrolls the sheet (overscroll-behavior:contain
  // stops the hand-over at its ends; a sheet too short to scroll blocks the gesture itself).
  _lockBehindSheet() {
    const bg = this.$('sheet'); if (!bg) return;
    let x0 = 0, y0 = 0;
    const block = (e, dy, dx = 0) => {
      const sh = e.target.closest?.('.sheet');
      if (!sh) return e.cancelable && e.preventDefault();
      if (Math.abs(dx) > Math.abs(dy)) return; // sideways rows inside the sheet (colour swatches …) still scroll
      const max = sh.scrollHeight - sh.clientHeight;
      if (max <= 1 || (dy < 0 && sh.scrollTop <= 0) || (dy > 0 && sh.scrollTop >= max - 1)) { if (e.cancelable) e.preventDefault(); }
    };
    bg.addEventListener('touchstart', e => { x0 = e.touches[0]?.clientX || 0; y0 = e.touches[0]?.clientY || 0; }, { passive: true });
    // dy > 0 = content moving up (scrolling down)
    bg.addEventListener('touchmove', e => { const x = e.touches[0]?.clientX || 0, y = e.touches[0]?.clientY || 0; block(e, y0 - y, x0 - x); x0 = x; y0 = y; }, { passive: false });
    bg.addEventListener('wheel', e => block(e, e.deltaY), { passive: false });
  }
  _closeSheet() {
    const sh = this.$?.('sheet'); if (sh) { sh.classList.remove('open'); sh.innerHTML = ''; }
    this._pick = null; this._pin = null; this._pinSvc = null; this._info = null; this._rnIds = null;
    if (this._wxUnsub) { this._wxUnsub.forEach(u => { try { u(); } catch (e) { /* closed */ } }); this._wxUnsub = null; }
    if (this._keyH) { window.removeEventListener('keydown', this._keyH); this._keyH = null; }
  }
  pickChip(id, kind, label, icon) {
    const st = this.s(id); if (!st) return '';
    const P = PICK[kind]; const opts = P.list(st) || []; if (!opts.length) return ''; label = tc(label);
    return `<button class="pick" data-act="pick" data-id="${id}" data-kind="${kind}">${icon ? ic(icon) : ''}<span>${esc(label)}</span><b>${esc(pretty(P.cur(st)))}</b>${ic('mdi:chevron-down', 'chev')}</button>`;
  }
  // colour swatches + custom picker for RGB lights; white presets use colour temperature when supported
  colorRow(id) {
    const st = this.s(id); if (!st) return '';
    const modes = st.attributes.supported_color_modes || [];
    const a = st.attributes;
    if (!modes.some(m => ['rgb', 'hs', 'xy', 'rgbw', 'rgbww'].includes(m))) {
      // white-only bulbs: colour-temperature swatches within the bulb's range
      if (!modes.includes('color_temp')) return '';
      const lo = a.min_color_temp_kelvin || 2000, hi = a.max_color_temp_kelvin || 6500;
      const sw = WHITES.filter(w => w.k >= lo - 100 && w.k <= hi + 100).map(w => {
        const k = clamp(w.k, lo, hi), sel = a.color_mode === 'color_temp' && Math.abs((a.color_temp_kelvin || 0) - k) < 150;
        return `<button class="sw ${sel ? 'swcur' : ''}" data-act="color" data-id="${id}" data-k="${k}" title="${w.n} · ${k}K" aria-label="${w.n}" style="--sw:${w.css}"></button>`;
      }).join('');
      return sw ? `<div class="swrow">${ic('mdi:palette')}<div class="sws">${sw}</div></div>` : '';
    }
    const ct = modes.includes('color_temp');
    const cur = a.color_mode === 'color_temp' ? null : a.rgb_color;
    const hex = cur ? '#' + cur.map(v => v.toString(16).padStart(2, '0')).join('') : '#ffffff';
    const near = c => cur && c.every((v, i) => Math.abs(v - cur[i]) < 24);
    const sw = COLORS.map(c => {
      const sel = c.k ? (a.color_mode === 'color_temp' && Math.abs((a.color_temp_kelvin || 0) - c.k) < 400) : near(c.rgb);
      if (c.k && !ct) return '';
      return `<button class="sw ${sel ? 'swcur' : ''}" data-act="color" data-id="${id}" ${c.k ? `data-k="${c.k}"` : `data-rgb="${c.rgb.join(',')}"`} title="${c.n}" aria-label="${c.n}" style="--sw:${c.css || `rgb(${c.rgb.join(',')})`}"></button>`;
    }).join('');
    return `<div class="swrow">${ic('mdi:palette')}<div class="sws">${sw}<label class="sw cust" title="Custom colour" style="--sw:${hex}">${ic('mdi:eyedropper-variant')}<input type="color" value="${hex}" data-color="${id}" aria-label="Custom colour"></label></div></div>`;
  }
  slider(id, kind, pct, color) {
    const lid = `sl-${kind}-${id.replace(/\W/g, '_')}`;
    return `<div class="slrow">${ic(kind === 'vol' ? 'mdi:volume-high' : 'mdi:brightness-6')}<input type="range" class="sl" min="1" max="100" value="${pct}" style="--p:${pct}%;--c:${color}"
      data-${kind === 'vol' ? 'vol' : 'bright'}="${id}" data-lbl="${lid}" aria-label="${kind === 'vol' ? 'Volume' : 'Brightness'}"><em id="${lid}">${pct}%</em></div>`;
  }

  _update() {
    const h = this._hass; if (!h) return;
    for (const sec of this._sections) {
      if (sec.off) continue;
      if (sec.tab === undefined) sec.tab = sec.el.closest('.tab')?.dataset.tab || null;
      if (sec.tab && sec.tab !== this._tab) continue; // battery: cards on hidden tabs are rendered when their tab opens (_setTab)
      if (this._labDrag && sec.el.id === 'lab') continue; // a Home Lab row is being dragged
      const prev = this._prev.get(sec.el);
      let changed = !prev || sec.force;
      if (!changed) for (let i = 0; i < sec.deps.length; i++) if (h.states[sec.deps[i]] !== prev[i]) { changed = true; break; }
      if (!changed) continue;
      sec.force = false;
      this._prev.set(sec.el, sec.deps.map(d => h.states[d]));
      let html = sec.render();
      // while the dashboard is edited, every panel gets a pencil next to its title: rename what it shows (this dashboard only)
      if (this._editing && this._hass?.user?.is_admin && RN_SECS.includes(sec.el.id) && html.includes('</h3>') && this._rnPanelIds(sec.el.id, Object.assign(document.createElement('template'), { innerHTML: html }).content).length)
        html = html.replace('</h3>', `</h3><button class="ibtn edit-only rnbtn" data-act="rnsec" data-sec="${sec.el.id}" title="${tr('Rename devices')}" aria-label="${tr('Rename devices')}">${ic('mdi:pencil-outline')}</button>`);
      if (sec.el._html === html) continue;
      const first = sec.el._html === undefined; sec.el._html = html;
      const tpl = document.createElement('template'); tpl.innerHTML = html;
      if (first) { sec.el.replaceChildren(tpl.content); if (sec.after) sec.after(sec.el); }
      else morph(sec.el, tpl.content, this._dragging);
    }
    if (this._three && this._tab === 'home') this._three.sync();
    if (this._info) this._renderInfo();
    if (this._tab === 'security') this.shadowRoot.querySelectorAll('.camlive > *').forEach(c => { if (c.hass !== h) c.hass = h; });
  }
  // Swipe the room popup down to close it: from its sticky header at any scroll position,
  // or from anywhere in it once it is scrolled to the top.
  _swipeClose(el) {
    let g = null;
    const reset = () => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; };
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || !el.classList.contains('open') || e.target.closest('input')) { g = null; return; }
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, t: performance.now(), head: !!e.target.closest('.dh'), top: el.scrollTop <= 0, drag: false, dy: 0 };
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!g) return;
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.drag) {
        if (Math.abs(dx) > Math.abs(dy) || Math.abs(dy) < 8) return;
        if (dy < 0 || !(g.head || (g.top && el.scrollTop <= 0))) { g = null; return; }
        g.drag = true; g.y = t.clientY; g.t = performance.now(); el.style.transition = 'none';
      }
      e.preventDefault();
      g.dy = Math.max(0, t.clientY - g.y); g.v = g.dy / Math.max(1, performance.now() - g.t);
      el.style.transform = `translateY(${g.dy}px)`; el.style.opacity = String(Math.max(0.4, 1 - g.dy / 500));
    }, { passive: false });
    const end = () => {
      if (!g || !g.drag) { g = null; return; }
      const close = g.dy > 90 || (g.dy > 30 && g.v > 0.5); g = null;
      el.style.transition = 'transform .25s ease-in, opacity .25s ease-in';
      if (!close) { el.style.transform = ''; el.style.opacity = ''; setTimeout(() => { el.style.transition = ''; }, 260); return; }
      el.style.transform = `translateY(${el.offsetHeight + 40}px)`; el.style.opacity = '0';
      setTimeout(() => { el.style.transition = 'none'; this._select(null); void el.offsetWidth; reset(); }, 250);
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  // Swipe left / right on a tab's content to go to the next / previous tab.
  // Ignored on the 3D view, sliders, the room popup, sheets and anything that scrolls sideways.
  _swipeTabs(el) {
    let g = null;
    const skip = t => t.closest('#viewport, .drawer, input, .sheet-bg, .seg, [data-spk]') || (() => {
      for (let n = t; n && n !== el; n = n.parentElement) { if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; }
      return false;
    })();
    el.addEventListener('touchstart', e => {
      this._touchDown = true;
      g = e.touches.length === 1 && !skip(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() } : null;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      this._touchDown = e.touches.length > 0;
      if (!g) return; const c = e.changedTouches[0], dx = c.clientX - g.x, dy = c.clientY - g.y, dt = performance.now() - g.t; g = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || dt > 700) return;
      const ids = this._tabList().map(t => t[0]), i = ids.indexOf(this._tab || 'home'), j = i + (dx < 0 ? 1 : -1);
      if (j < 0 || j >= ids.length) return;
      this._setTab(ids[j], dx < 0 ? 'next' : 'prev');
    }, { passive: true });
    el.addEventListener('touchcancel', e => { g = null; this._touchDown = e.touches.length > 0; });
  }
  _rerender(...ids) { for (const s of this._sections) if (!ids.length || ids.includes(s.el.id)) s.force = true; this._update(); }

  _tick() {
    if (!this.$) return;
    const d = new Date();
    const lang = this._hass?.locale?.language || 'en';
    const put = (id, txt) => { const el = this.$(id); if (el && el.textContent !== txt) el.textContent = txt; };
    put('time', d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }));
    put('date', d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }));
    const hr = d.getHours();
    const g = tr(hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening');
    put('greet', `${g}${this.name() ? ', ' + this.name() : ''}`);
    if (d.getSeconds() % 30 === 0) { this._alertCount = null; this._rerender('alerts', 'tabs'); }
    if (d.getSeconds() % 15 === 0) this.shadowRoot.querySelectorAll('[data-ago]').forEach(el => { el.textContent = el.dataset.short ? `${el.dataset.pre} · ${agoShort(el.dataset.ago, lang)}` : `${el.dataset.pre} ${ago(el.dataset.ago, lang)}`; });
  }

  /* ---------- click handling ---------- */
  // Gestures on every button:
  //   tap        = the button's own action (open info / switch / toggle …)
  //   double tap = details of the 2nd entity (buttons with data-id2)
  //   long press = details of the button's own entity when a tap does something else (switch, toggle, picker …);
  //                avatars with data-lp open the phone panel
  _longPress() {
    const R = this.shadowRoot; let lp = null;
    const clear = () => { if (lp) clearTimeout(lp.timer); lp = null; };
    const target = t => {
      const el = t.closest('[data-lp]') || t.closest('[data-act]'); if (!el) return null;
      if (el.dataset.lp) return el;
      const id = el.dataset.id; return id && id.includes('.') && this.s(id) ? el : null;
    };
    this._labDragSetup(R);
    R.addEventListener('pointerdown', e => {
      clear(); if (e.button > 0 || e.target.closest('input')) return;
      const el = target(e.target); if (!el) return;
      lp = { x: e.clientX, y: e.clientY, el, timer: setTimeout(() => {
        this._lpFired = performance.now(); el.classList.add('lp'); setTimeout(() => el.classList.remove('lp'), 250);
        this.haptic('medium');
        if (this._tap) { clearTimeout(this._tap.timer); this._tap = null; }
        if (el.dataset.lp === 'phone') this._openInfo('phone:' + el.dataset.id);
        else if (el.dataset.lp === 'floor') this._pinDefault('floor', el.dataset.level);
        else if (el.dataset.lp === 'view') this._pinDefault('view', el.dataset.view === 'top' ? 'top' : '3d');
        else this.more(el.dataset.id);
        lp = null;
      }, 500) };
    });
    R.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) clear(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) R.addEventListener(ev, clear);
    R.addEventListener('contextmenu', e => { if (target(e.target)) e.preventDefault(); });
  }
  _onClick(e) {
    if (this._lpFired && performance.now() - this._lpFired < 800) { this._lpFired = 0; e.stopPropagation(); e.preventDefault(); return; }
    const t = e.target.closest('[data-act]'); if (!t) return;
    e.stopPropagation();
    const a = t.dataset.act, id = t.dataset.id;
    if (!e._deferred) this._hapFor(a, t, e);
    // double tap → 2nd entity; the single-tap action waits ~0.28 s to tell them apart.
    // Locks and the gate / intercom relay keep their double tap for confirming; pumps and irrigation valves
    // confirm with a second, slower tap, so their quick double tap still opens the 2nd entity.
    if (t.dataset.id2 && !e._deferred && !['lock', 'relay'].includes(a)) {
      const now = performance.now();
      if (this._tap && this._tap.el === t && now - this._tap.t < 320) { clearTimeout(this._tap.timer); this._tap = null; this.haptic('light'); if (t.dataset.dt) this._openInfo(t.dataset.dt); else this.more(t.dataset.id2); return; }
      if (this._tap) clearTimeout(this._tap.timer);
      this._tap = { el: t, t: now, timer: setTimeout(() => { this._tap = null; this._onClick({ target: t, _deferred: true, stopPropagation() {}, preventDefault() {} }); }, 280) };
      return;
    }
    switch (a) {
      case 'toggle': this.call('homeassistant', 'toggle', { entity_id: id }); break;
      case 'color': this.call('light', 'turn_on', t.dataset.k ? { entity_id: id, color_temp_kelvin: Number(t.dataset.k) } : { entity_id: id, rgb_color: t.dataset.rgb.split(',').map(Number) }); break;
      case 'more': this.more(id); break;
      case 'mode': this._setMode(t.dataset.mode); break;
      case 'view': this._three?.view(t.dataset.view); break;
      case 'spin': { const on = this._three?.toggleSpin(); t.classList.toggle('on', !!on); break; }
      case 'room':
        // the click that follows a tap on the 3D canvas can land on the bubble that tap just made visible: ignore it
        if (performance.now() - (this._cvTap || 0) < 600) break;
        this._select(t.dataset.room === this._sel ? null : t.dataset.room); break;
      case 'close': this._select(null); break;
      case 'furn': if (performance.now() - (this._cvTap || 0) < 600) break; this._selectFurn(Number(t.dataset.idx)); break;
      case 'run': this.call('homeassistant', 'turn_on', { entity_id: id }); this._toast(tr(id.startsWith('scene.') ? 'Scene activated' : 'Script started')); break;
      case 'press': this.call(id.split('.')[0], 'press', { entity_id: id }); this._toast(tr('Pressed')); break;
      case 'dfold': { const k = t.dataset.k; (this._dOpen ||= new Set()).has(k) ? this._dOpen.delete(k) : this._dOpen.add(k); this._rerender('drawer'); break; }
      case 'hintx': this._hintDone(); break;
      case 'level': this._setLevel(Number(t.dataset.level)); break;
      case 'arrange': {
        if (!this._editing && !this._arrange) break;
        const on = this._arrange = !this._arrange; if (this._three) this._three.arrange = on; t.classList.toggle('on', on);
        if (on) { this._select(null); this._toast(tr('Drag furniture to move it. Tap the button again when done.')); }
        break;
      }
      case 'exclude': if (!this._editing) break; {
        if (!this._armConfirm(t, id, tr('Tap again to hide it'))) return;
        this._excludeDevice(id, t.dataset.kind); break;
      }
      case 'names': {
        if (!this._editing) break;
        if (this._naming === this._sel) { this._naming = null; this._rerender('drawer'); this._saveNames(ROOM[this._sel]); } // ✓ Done
        else { this._naming = this._sel; this._pendNames = null; this._rerender('drawer'); }
        break;
      }
      case 'alarm': {
        const svc = t.dataset.svc; const st = this.s(E.alarm);
        if (svc === 'alarm_disarm' && st?.state === 'disarmed') { this._toast('The alarm is already off'); return; }
        // Alarmo needs the user's PIN to disarm; arming only needs it when code_arm_required is set
        const needCode = svc === 'alarm_disarm' || !!st?.attributes.code_arm_required;
        if (needCode) this._openKeypad(svc); else this.call('alarm_control_panel', svc, { entity_id: E.alarm });
        break;
      }
      case 'pin': this._pinKey(t.dataset.k); break;
      case 'lock': {
        const locked = this.v(id) === 'locked';
        if (locked && !this._armConfirm(t, id, 'Tap again to unlock')) return;
        this.call('lock', locked ? 'unlock' : 'lock', { entity_id: id }); break;
      }
      case 'relay': if (!this._armConfirm(t, id, id === E.gate.relay ? 'Tap again to open the gate' : 'Tap again to open')) return; this.call('switch', 'turn_on', { entity_id: id }); this._toast(id === E.gate.relay ? 'Opening the gate' : 'Opening'); break;
      case 'entrance': { // a gate / garage door: second tap to open, close, or stop it while it moves
        const g = E.entrances.find(x => x.id === id); if (!g) break;
        const st = this.entState(g), d = id.split('.')[0], nm = this.s(id)?.attributes.friendly_name || g.name;
        const verb = st === 'moving' ? 'stop' : st === 'open' ? 'close' : 'open';
        if (!this._armConfirm(t, id, tr({ open: 'Tap again to open', close: 'Tap again to close', stop: 'Tap again to stop' }[verb]))) return;
        if (d === 'cover') this.call('cover', { open: 'open_cover', close: 'close_cover', stop: 'stop_cover' }[verb], { entity_id: id });
        else if (d === 'button' || d === 'input_button') this.call(d, 'press', { entity_id: id });
        else if (d === 'script' || d === 'scene') this.call(d, 'turn_on', { entity_id: id });
        else if (d === 'lock') this.call('lock', verb === 'open' ? 'unlock' : 'lock', { entity_id: id });
        else this.call(d === 'input_boolean' ? 'input_boolean' : 'switch', d === 'switch' || d === 'input_boolean' ? (this.on(id) && !g.sensor ? 'turn_off' : 'turn_on') : 'turn_on', { entity_id: id });
        this._toast(tr({ open: 'Opening {0}', close: 'Closing {0}', stop: 'Stopping {0}' }[verb], nm)); break;
      }
      case 'pump': { // water pumps: a second tap to start, one tap to stop; double tap / long press still open more-info
        const on = this.on(id);
        if (!on && !this._armConfirm(t, id, 'Tap again to start')) return;
        this.call('switch', on ? 'turn_off' : 'turn_on', { entity_id: id }); break;
      }
      case 'valve': { // irrigation zones need a second tap, like the locks
        const on = this.on(id);
        if (!this._armConfirm(t, id, on ? 'Tap again to stop' : 'Tap again to water')) return;
        const d = id.split('.')[0]; // a valve opens / closes; a switch or helper turns on / off
        if (d === 'valve') this.call('valve', on ? 'close_valve' : 'open_valve', { entity_id: id });
        else this.call(d === 'input_boolean' ? 'input_boolean' : 'switch', on ? 'turn_off' : 'turn_on', { entity_id: id });
        break;
      }
      case 'acexp': this._acOpen = this._acOpen === id ? null : id; this._rerender('drawer'); break;
      case 'acpow': this.call('climate', this.climOn(id) ? 'turn_off' : 'turn_on', { entity_id: id }); break;
      case 'acmode': this.call('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: t.dataset.mode }); break;
      case 'actemp': {
        // taps only change the number on screen; one set_temperature goes to the AC 1.2 s after the last tap
        const st = this.s(id); if (!st) break; const step = st.attributes.target_temp_step || 1;
        const base = +(this._acT(id) ?? 24);
        const P = this._acPend || (this._acPend = {}), p = P[id] || (P[id] = {});
        const next = clamp(base + step * Number(t.dataset.d), st.attributes.min_temp ?? (FAHR ? 61 : 16), st.attributes.max_temp ?? (FAHR ? 86 : 30));
        clearTimeout(p.timer); clearTimeout(p.drop); p.t = Math.round(next * 10) / 10; p.sent = false;
        p.timer = setTimeout(() => {
          p.sent = true;
          if (p.t !== this.s(id)?.attributes.temperature) this.call('climate', 'set_temperature', { entity_id: id, temperature: p.t });
          // keep showing the chosen value until the AC reports it (or give up after 10 s)
          p.drop = setTimeout(() => { if (P[id] === p) { delete P[id]; this._rerender('climate', 'drawer'); } }, 10e3);
          this._rerender('climate', 'drawer');
        }, 1200);
        this._rerender('climate', 'drawer'); break;
      }
      case 'acfan': this.call('climate', 'set_fan_mode', { entity_id: id, fan_mode: t.dataset.fan }); break;
      case 'media': this.call('media_player', t.dataset.svc, { entity_id: id }); break;
      case 'select': this._openPicker(id, 'select'); break;
      case 'pick': this._openPicker(id, t.dataset.kind); break;
      case 'pickopt': {
        const p = this._pick; if (!p) return;
        const o = p.opts[Number(t.dataset.i)]; const [d, svc, data] = PICK[p.kind].call(p.id, o, this.hass);
        this.call(d, svc, { entity_id: p.id, ...data }); this._closeSheet(); break;
      }
      case 'info': this._openInfo(t.dataset.kind); { const sh = this.$('sheet')?.querySelector('.sheet'); if (sh && t.closest('.sheet')) sh.scrollTop = 0; } break;
      case 'jfplay': this._jfPlay(t.dataset.item, t.dataset.mk, t.dataset.title); break;
      case 'jfreconnect': this._jfReconnect?.(); break;
      case 'jfcancel': this._jfCancel = true; break;
      case 'jfseason': this._jfSeason = { ...(this._jfSeason || {}), [t.dataset.show]: Number(t.dataset.i) }; this._renderInfo(); break;
      case 'ehp': this._eh = { ...this._eh, p: t.dataset.p, off: 0, bar: null }; this._rerender('ehist'); break;
      case 'ehnav': this._eh = { ...this._eh, off: Math.min(0, this._eh.off + Number(t.dataset.d)), bar: null }; this._rerender('ehist'); break;
      case 'ehnow': this._eh = { ...this._eh, off: 0, bar: null }; this._rerender('ehist'); break;
      case 'ehbar': { const i = Number(t.dataset.i); this._eh = { ...this._eh, bar: this._eh.bar === i ? null : i }; this._rerender('ehist'); break; }
      case 'ehdev': {
        const cur = this._eh.sel || this._ehAll(), set = new Set(cur);
        set.has(id) ? set.delete(id) : set.add(id);
        this._eh = { ...this._eh, sel: [...set] }; this._rerender('ehist'); break;
      }
      case 'ehreset': this._eh = { ...this._eh, sel: null }; this._rerender('ehist'); break;
      case 'spk': { const k = t.dataset.k, h = this._spkHide || (this._spkHide = new Set()); h.has(k) ? h.delete(k) : h.add(k); this._spkPaint(); break; }
      case 'press': this.call('button', 'press', { entity_id: id }); this._toast(`${t.dataset.label || 'Command'} sent`); break;
      case 'alexp': { const k = t.dataset.k; this._alOpen.has(k) ? this._alOpen.delete(k) : this._alOpen.add(k); this._rerender('alerts'); break; }
      case 'repairs': history.pushState(null, '', '/config/repairs'); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); break;
      case 'harestart': if (!this._armConfirm(t, id, 'Tap again to restart Home Assistant')) return; this.call('homeassistant', 'restart', {}); this._toast('Restarting Home Assistant…'); break;
      case 'install': if (!this._armConfirm(t, id, 'Tap again to update')) return; this.call('update', 'install', { entity_id: id }); this._toast('Update started'); setTimeout(() => this._rerender('alerts'), 3000); break;
      case 'reboot': if (!this._armConfirm(t, id, 'Tap again to reboot')) return; this.call('button', 'press', { entity_id: id }); this._toast('Reboot sent'); (this._rbAt ||= {})[id] = Date.now(); setTimeout(() => { if (this._info) this._renderInfo(); this._rerender('alerts'); }, 20e3); if (this._info) this._renderInfo(); this._rerender('alerts'); break;
      case 'rnbadge': if (!this._editing) break; this._pendNames = null; this._openInfo('rnbadge:' + t.dataset.i); break;
      case 'rnbsave': { const i = Number(t.dataset.i), v = this._pendNames?.['badge:' + i]; this._pendNames = null; this._closeSheet(); if (v !== undefined) this._saveBadgeName(i, v); break; }
      case 'rnphone': { // the phone panel's rows and buttons, renamed for this dashboard
        if (!this._editing) break; const P = E.phones[t.dataset.id]; if (!P) break;
        const ids = [P.battery, P.charging, P.tracker, P.location, P.ringer, P.wifi, ...(P.entities || []), ...P.buttons.map(b => b[0])].filter(x => x && this.s(x));
        this._pendNames = null; this._openInfo('rename:phone'); this._rnIds = { sid: 'phone', ids: [...new Set(ids)], title: P.name }; this._renderInfo(); break;
      }
      case 'rnsec': if (!this._editing) break; this._pendNames = null; this._rnIds = null; this._openInfo('rename:' + t.dataset.sec); break;
      case 'rnsave': { const pend = this._pendNames; this._closeSheet(); this._pendNames = pend; this._saveNames(null); break; }
      case 'sheetclose': if (t.id === 'sheet' && e.target !== t) return; this._closeSheet(); break;
      case 'labmore': this._labMore = !this._labMore; this._rerender('lab'); break;
      case 'labgrip': break; // dragged, see _labDragSetup
      case 'labreset': this._labSaveOrder(null); break;
      case 'tab': this._setTab(t.dataset.tab); if (t.dataset.to) this._goCard(t.dataset.to); break;
      case 'cam': this.more(id); break;
    }
  }
  // AC target to show: the value being chosen (not sent yet / not confirmed yet), else the AC's own
  _acT(id) {
    const p = this._acPend?.[id], cur = this.s(id)?.attributes.temperature;
    if (p && p.sent && cur === p.t) { clearTimeout(p.drop); delete this._acPend[id]; return cur; }
    return p ? p.t : cur;
  }
  // which haptic a tap gives: 'light' when it changes a device, 'selection' for screen-only taps;
  // two-tap buttons buzz in _armConfirm (warning on the first tap, success on the confirming one)
  _hapFor(a, t, e) {
    if (['lock', 'relay', 'pump', 'valve', 'install', 'reboot', 'harestart'].includes(a)) {
      // the taps that act at once (lock a door, stop a pump) are plain device taps
      if ((a === 'lock' && this.v(t.dataset.id) !== 'locked') || (a === 'pump' && this.on(t.dataset.id))) this.haptic('light');
      return;
    }
    if (a === 'sheetclose' && t.id === 'sheet' && e.target !== t) return;
    if (a === 'room' && performance.now() - (this._cvTap || 0) < 600) return;
    this.haptic(['jfplay', 'toggle', 'color', 'acpow', 'acmode', 'acfan', 'actemp', 'media', 'pickopt', 'press', 'alarm', 'mode'].includes(a) ? 'light' : 'selection');
  }
  _armConfirm(el, id, msg) {
    const now = Date.now();
    // confirmed: drop the blinking "Tap again" tip right away
    if (this._confirm[id] && now - this._confirm[id] < 3500) { delete this._confirm[id]; clearTimeout(el._cfT); el.classList.remove('confirm'); delete el.dataset.tip; this.haptic('success'); return true; }
    this._confirm[id] = now; this.haptic('warning');
    el.classList.add('confirm'); el.dataset.tip = msg;
    clearTimeout(el._cfT); el._cfT = setTimeout(() => { el.classList.remove('confirm'); }, 3500);
    return false;
  }
  _setMode(m) {
    this._mode = m;
    this.shadowRoot.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    this._three?.setMode(m);
    this._renderLegend();
  }
  // floor buttons on the 3D view (only with more than one floor)
  _renderLevels() {
    const el = this.$?.('lvls'), L = MODEL?.levels || []; if (!el) return;
    if (L.length < 2) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = [...L].reverse().map(l => `<button data-act="level" data-level="${l.level}" data-lp="floor" role="tab" aria-selected="${l.level === this._level}" class="${l.level === this._level ? 'on' : ''}" title="${esc(tr(l.name, l.level))}">${l.icon ? ic(l.icon) : ''}<span>${esc(l.name.startsWith('Floor ') ? tr('Floor {0}', l.level) : tr(l.name))}</span></button>`).join('');
  }
  // where the 3D view starts: this device's own choice (long press), else Look → per device type, else automatic
  // (3D on a PC, the floor plan on phones and tablets)
  _defView() {
    const own = devGet('view'), cfg = this._config?.default_view?.[devType()];
    return own === 'top' || own === '3d' ? own : cfg === 'top' || cfg === '3d' ? cfg : devType() === 'pc' ? '3d' : 'top';
  }
  _defFloor(L) {
    const ok = v => v != null && v !== '' && L.some(l => l.level === Number(v)), own = devGet('floor'), cfg = this._config?.default_floor?.[devType()];
    return ok(own) ? Number(own) : ok(cfg) ? Number(cfg) : L.some(l => l.level === 0) ? 0 : L[0].level;
  }
  // long press on a floor / view button: the default on this device (again on the same one: back to the dashboard's)
  _pinDefault(kind, v) {
    const cur = devGet(kind), same = cur === String(v);
    devSet(kind, same ? null : v);
    const name = kind === 'floor' ? (() => { const l = (MODEL.levels || []).find(x => String(x.level) === String(v)); return l ? (l.name.startsWith('Floor ') ? tr('Floor {0}', l.level) : tr(l.name)) : v; })() : tr(v === 'top' ? 'Floor plan' : '3D view');
    this._toast(same ? tr('Default cleared on this device') : tr('{0} is now the default on this device', name));
    this.haptic('success');
  }
  _setLevel(l) {
    if (l === this._level) return;
    this._level = l; this._three?.setLevel(l);
    if (this._sel && ROOM[this._sel]?.level !== l) this._select(null);
    this._renderLevels(); this._three?.sync();
  }
  _select(id, keepFurn) {
    if (id && ROOM[id] && ROOM[id].level !== this._level) this._setLevel(ROOM[id].level);
    if (id !== this._sel) this._acOpen = null;
    if (!keepFurn) this._fsel = null;
    if (id !== this._sel) this._naming = null;
    if (id) this._hintDone();
    this._sel = id;
    this.$('drawer').classList.toggle('open', !!id);
    this._three?.select(id);
    this._rerender('drawer');
  }
  // Leaves a device out of "Needs Attention" (or only out of the low-battery list): saved in the card config
  async _excludeDevice(id, kind) {
    const dev = this._hass.entities?.[id]?.device_id;
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    const P = (cfg.panels ||= {}), A = (P.attention = typeof P.attention === 'object' && P.attention ? P.attention : {});
    const key = dev ? (kind === 'battery' ? 'battery_exclude_devices' : 'exclude_devices') : (kind === 'battery' ? 'battery_exclude' : 'exclude_entities');
    const list = A[key] = [...(A[key] || [])]; if (!list.includes(dev || id)) list.push(dev || id);
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Hidden. Show it again in the card editor (Panels → Needs Attention).')); }
  }
  // a new config for this card: through the open card editor (with undo), else saved into the dashboard
  async _applyConfig(cfg) {
    const ed = window.__sweetHomeEditor;
    if (ed?.isConnected && ed.applyExternal) { ed.applyExternal(cfg); return true; }
    return this._saveCardConfig(cfg);
  }

  // A piece dragged in the 3D view (arrange mode): moved in the config. While the card editor is open, the move goes
  // through it (with undo); otherwise it is saved straight into this dashboard (storage dashboards, admins).
  async _arrangeMove(f, dx, dz, undo) {
    const src = f?.src;
    if (!src) { undo(); this._toast(tr('This piece is automatic: change its room in the card editor (Furniture) to move it'), true); return; }
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    const list = src.house != null ? cfg.house?.furniture : cfg.house?.rooms?.[src.room]?.furniture, piece = list?.[src.i ?? src.house];
    if (!piece) { undo(); this._toast('Could not find this piece in the configuration', true); return; }
    movePiece(piece, dx, dz);
    const viaEditor = window.__sweetHomeEditor?.isConnected;
    if (await this._applyConfig(cfg)) { this.haptic(viaEditor ? 'light' : 'success'); if (!viaEditor) this._toast(tr('Moved')); } else undo();
  }
  // saves a new config for this card into the dashboard it is on (the card must be found there exactly once)
  async _saveCardConfig(cfg) {
    const seg = location.pathname.split('/')[1] || 'lovelace', url_path = seg === 'lovelace' ? null : seg;
    try {
      const dash = await this._hass.callWS({ type: 'lovelace/config', url_path });
      if (dash?.strategy) { this._toast(tr('Take control of this dashboard first (⋮ → Edit dashboard)'), true); return false; }
      const mine = JSON.stringify(this._config); let hits = 0;
      const walk = o => {
        if (Array.isArray(o)) return o.map(walk);
        if (o && typeof o === 'object') {
          if (o.type === 'custom:sweet-home-card' && JSON.stringify(o) === mine) { hits++; return JSON.parse(JSON.stringify(cfg)); }
          return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
        }
        return o;
      };
      const next = walk(dash);
      if (hits !== 1) { this._toast(tr('Open the card editor to move furniture on this dashboard'), true); return false; }
      await this._hass.callWS({ type: 'lovelace/config/save', url_path, config: next });
      this.setConfig(cfg); return true;
    } catch (e) { this._toast(e?.message || tr('Could not save the dashboard'), true); return false; }
  }

  // a tap on a furniture piece that has entities: open its room with the piece at the top of the popup
  _selectFurn(idx) {
    const f = FURN[idx]; if (!f || !f.entities?.length) return;
    if (!f.room || !ROOM[f.room]) { this.more(f.entities[0]); return; }
    this._fsel = idx;
    if (this._sel === f.room) { this._rerender('drawer'); this.$('drawer').scrollTop = 0; } else this._select(f.room, true);
  }
  // first-use hint on the 3D view; gone for good after the first room is opened or when closed
  _hintShow() {
    let seen = false; try { seen = localStorage.getItem('sweet-home-hint') === '1'; } catch (e) { /* storage blocked */ }
    const el = this.$('hint'); if (!el || seen || this._config?.hint === false || (MODEL && !MODEL.gltf && !ROOMS.length)) return; // no rooms: nothing to tap yet
    const pieces = FURN.some(f => f.entities?.length);
    el.innerHTML = `${ic('mdi:gesture-tap')}<span>${tr("Tap a room to see and control what's in it.")}${pieces ? ' ' + tr('Furniture with a dot can be tapped too.') : ''} ${tr('Long press any row for details.')}</span><button class="ibtn" data-act="hintx" aria-label="${tr('Close hint')}">${ic('mdi:close')}</button>`;
    el.classList.add('on');
  }
  _hintDone() {
    const el = this.$?.('hint'); if (!el?.classList.contains('on')) return;
    el.classList.remove('on'); try { localStorage.setItem('sweet-home-hint', '1'); } catch (e) { /* storage blocked */ }
  }
  _renderLegend() {
    const el = this.$('legend');
    if (this._mode === 'climate') el.innerHTML = `<div class="lg-bar"></div><div class="lg-lbl"><span>16°</span><span>22°</span><span>29°</span></div>`;
    else if (this._mode === 'presence') el.innerHTML = `<span class="dot pulse teal"></span> ${tr('occupied')} <span class="dot gray"></span> ${tr('empty')}`;
    else el.innerHTML = `<span class="dot amber"></span> ${tr('lights on')} <span class="dot gray"></span> ${tr('off')}`;
  }

  /* ---------- sections ---------- */
  _rHeader() {
    const w = this.s(E.weather);
    const wx = w ? `<div class="chip big" data-act="info" data-kind="weather" data-id="${E.weather}">${ic(WEATHER_ICON[w.state] || 'mdi:weather-partly-cloudy')}
      <div><b>${isFinite(parseFloat(w.attributes.temperature)) ? Math.round(w.attributes.temperature) + '°' : '—'}</b><span>${esc(wxName(w.state))}${isFinite(parseFloat(w.attributes.humidity)) ? ` · ${Math.round(w.attributes.humidity)}%` : ''}</span></div></div>` : '';
    const persons = E.persons.map(p => {
      const st = this.s(p); if (!st) return '';
      const home = st.state === 'home'; const pic = st.attributes.entity_picture;
      const nm = tc(st.attributes.friendly_name || p);
      return `<div class="person ${home ? 'home' : 'away'}" data-act="more" data-id="${p}"${E.phones[p] ? ' data-lp="phone"' : ''} title="${esc(nm)}: ${esc(st.state)}${E.phones[p] ? ' · hold for phone' : ''}">
        ${pic ? `<img src="${esc(pic)}" draggable="false" alt="">` : `<span>${esc(nm[0])}</span>`}<i></i></div>`;
    }).join('');
    const al = ALARM[this.v(E.alarm)] || [this.v(E.alarm) || '—', 'mdi:shield', '#94a3b8'];
    const open = E.doors.filter(d => this.doorOpen(d));
    const unlocked = E.locks.filter(l => this.v(l.id) === 'unlocked');
    const lit = ROOMS.reduce((n, r) => n + (r.lights || []).filter(l => this.v(l) === 'on').length, 0);
    const grid = this.n(E.energy.grid) ?? 0, solar = this.n(E.energy.solar) ?? 0;
    const temps = ROOMS.filter(r => r.temp && !r.outdoor).map(r => this.n(r.temp)).filter(x => x != null);
    const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    return `
      ${wx}
      ${!E.alarm || this.v(E.alarm) === 'disarmed' ? '' : `<div class="chip" style="--c:${al[2]}" data-act="more" data-id="${E.alarm}">${ic(al[1])}<span>${tr(al[0])}</span></div>`}
      ${!E.doors.length ? '' : `<div class="chip ${open.length ? 'warn' : 'good'}">${ic(open.length ? 'mdi:door-open' : 'mdi:door-closed-lock')}<span>${open.length ? tr('{0} open', open.map(d => d.name).join('، ')) : tr('All doors closed')}</span></div>`}
      ${unlocked.length ? `<div class="chip warn">${ic('mdi:lock-open-variant')}<span>${tr('{0} unlocked', unlocked.map(l => l.name).join(', '))}</span></div>` : ''}
      ${lit ? `<div class="chip" style="--c:${lit ? '#fbbf24' : '#94a3b8'}" data-act="info" data-kind="lights">${ic(lit ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline')}<span>${lit === 1 ? tr('1 light on') : tr('{0} lights on', lit)}</span></div>` : ''}
      ${avg == null ? '' : `<div class="chip" style="--c:${avg != null ? rgb(tempRGB(avg)) : '#94a3b8'}" data-act="info" data-kind="temps">${ic('mdi:home-thermometer')}<span>${avg != null ? tr('{0}° inside', avg.toFixed(1)) : '—'}</span></div>`}
      ${!(E.energy.grid || E.energy.solar) ? '' : `<div class="chip" data-act="info" data-kind="power" data-id="${E.energy.grid || E.energy.solar}"${E.energy.solar && E.energy.grid ? ` data-id2="${E.energy.solar}"` : ''} style="--c:#fbbf24">${ic('mdi:flash')}<span>${tr('{0} now', fmtW(grid + solar).replace(/<\/?small>/g, ''))}</span></div>`}
      <div class="persons">${persons}</div>`;
  }

  _rSecurity() {
    const st = this.v(E.alarm);
    const al = ALARM[st] || [st || '—', 'mdi:shield', '#94a3b8'];
    const btn = (svc, icon, label, match) => `<button class="abtn ${st === match ? 'on' : ''}" data-act="alarm" data-svc="${svc}" title="${label}">${ic(icon)}<span>${label}</span></button>`;
    // a lock shows what it locks (door, gate, garage…) with a small padlock that tells its state; a plain lock is a padlock
    const locks = E.locks.map(l => {
      const s = this.v(l.id); const locked = s === 'locked'; const bad = !this.ok(l.id);
      const cls = bad ? 'na' : locked ? 'good' : s === 'unlocked' ? 'bad' : 'warn';
      const pad = locked ? 'mdi:lock' : s === 'unlocked' ? 'mdi:lock-open-variant' : s === 'jammed' ? 'mdi:lock-alert' : 'mdi:lock-clock';
      return `<button class="lock ${cls}" data-act="lock" data-id="${l.id}" data-kind="${l.kind || 'padlock'}">
        <div class="lk-ic">${l.icon ? `${ic(l.icon)}<i class="lk-b">${ic(pad)}</i>` : ic(pad)}</div>
        <b>${esc(l.name)}</b><span>${esc(s || '—')}</span></button>`;
    }).join('');
    // gates, garage doors, barriers, shutters: a second tap opens / closes (or stops one that is moving)
    const gate = E.entrances.filter(g => this.s(g.id)).map(g => {
      // a relay gate without an open sensor can't tell: it shows as closed (green) until a sensor says otherwise
      const st = this.entState(g), cls = st === 'bad' ? 'na' : st === 'closed' || st === 'unknown' ? 'good' : st === 'moving' || st === 'unsure' ? 'warn' : 'bad';
      const said = this.v(g.sensors?.find(x => this.ok(x)) || g.id);
      const label = { open: 'Open', closed: 'Closed', moving: pretty(said), bad: 'Unavailable', unknown: 'Closed', unsure: pretty(said) }[st];
      return `<button class="lock ${cls}" data-act="entrance" data-id="${g.id}"${g.sensor ? ` data-id2="${g.sensor}"` : ''}>
        <div class="lk-ic">${ic(st === 'open' || st === 'moving' ? g.icons[1] : g.icons[0])}</div>
        <b>${esc(g.cfgName || this.s(g.id).attributes.friendly_name || g.name)}</b><span>${esc(tr(label))}</span></button>`;
    }).join('');
    const doors = E.doors.map(d => {
      const o = this.doorOpen(d); const bad = !this.ok(d.id);
      return `<div class="door ${bad ? 'na' : o ? 'open' : ''}" data-act="more" data-id="${d.id}">${ic(o ? 'mdi:door-open' : 'mdi:door-closed')}<span>${esc(d.name)}</span></div>`;
    }).join('') + E.entrances.filter(g => this.s(g.id) && (g.sensors?.length || g.sensor)).filter(g => !(g.sensors || [g.sensor]).some(x => E.doors.some(d => d.id === x))).map(g => {
      // a gate / door with an open / closed sensor (a contact, or a camera's classification) is listed with the doors too
      const st = this.entState(g), src = g.sensors?.find(x => this.ok(x)) || g.sensors?.[0] || g.sensor, o = st === 'open' || st === 'moving';
      return `<div class="door ${st === 'bad' ? 'na' : o ? 'open' : ''}" data-act="more" data-id="${src}">${ic(o ? g.icons?.[1] || 'mdi:door-open' : g.icons?.[0] || 'mdi:door-closed')}<span>${esc(g.cfgName || this.s(g.id).attributes.friendly_name || g.name)}</span></div>`;
    }).join('');
    return `<div class="ch">${ic('mdi:shield-home')}<h3>Security</h3>${E.alarm ? `<span class="pill" style="--c:${al[2]}">${al[0]}</span>` : ''}</div>
      ${!E.alarm ? '' : `<div class="alarm" style="--c:${al[2]}">
        <div class="shield ${st === 'triggered' ? 'blink' : ''}" data-act="more" data-id="${E.alarm}">${ic(al[1])}</div>
        <div class="abtns">${btn('alarm_disarm', 'mdi:shield-off-outline', 'Off', 'disarmed')}${btn('alarm_arm_away', 'mdi:lock', 'Away', 'armed_away')}${btn('alarm_arm_night', 'mdi:weather-night', 'Night', 'armed_night')}${btn('alarm_arm_vacation', 'mdi:airplane', 'Trip', 'armed_vacation')}</div>
      </div>`}
      ${locks || gate ? `<div class="locks">${locks}${gate}</div>` : ''}
      ${doors ? `<div class="dsec">Doors</div><div class="doors">${doors}</div>` : ''}`;
  }

  _rTabs() {
    const badge = {};
    const open = E.doors.filter(d => this.doorOpen(d)).length + E.locks.filter(l => this.v(l.id) === 'unlocked').length + E.entrances.filter(g => this.entState(g) === 'open').length;
    if (open) badge.security = ['warn', open];
    const acOn = E.acs.filter(a => this.climOn(a.id)).length; if (acOn) badge.climate = ['info', acOn];
    if (this.on(E.car.charging)) badge.energy = ['good', ic('mdi:lightning-bolt')];
    const tank = this.n(E.water.tank); if (tank != null && tank < 25) badge.water = ['warn', '!'];
    if (this.v(E.media.tv) === 'playing') badge.media = ['pink', ic('mdi:play')];
    if (this._alertCount == null) this._alertCount = this._alertSections().reduce((n, x) => n + x[3].length, 0);
    if (E.lab.status && this.s(E.lab.status) && !this.on(E.lab.status)) badge.system = ['warn', '!']; else if (this._alertCount) badge.system = ['warn', this._alertCount];
    return this._tabList().map(([k, n, i]) => `<button class="tb ${this._tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}" role="tab" aria-selected="${this._tab === k}">
      ${ic(i)}<span>${tr(n)}</span>${badge[k] ? `<i class="bd ${badge[k][0]}">${badge[k][1]}</i>` : ''}</button>`).join('');
  }

  _rGlance() {
    const al = ALARM[this.v(E.alarm)] || [this.v(E.alarm) || '—', 'mdi:shield', '#94a3b8'];
    const open = E.doors.filter(d => this.doorOpen(d)).length + E.locks.filter(l => this.v(l.id) === 'unlocked').length + E.entrances.filter(g => this.entState(g) === 'open').length;
    const temps = ROOMS.filter(r => r.temp && !r.outdoor).map(r => this.n(r.temp)).filter(x => x != null);
    const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const acOn = E.acs.filter(a => this.climOn(a.id)).length;
    const home = Math.max(0, (this.n(E.energy.grid) ?? 0) + Math.max(0, this.n(E.energy.solar) ?? 0));
    const tank = this.n(E.water.tank);
    const ch = this.on(E.car.charging);
    const det = E.cameras.filter(c => this.on(c.person)).length;
    const tv = this.s(E.media.tv);
    const cpu = this.n(E.lab.cpu);
    // each tile opens its tab and scrolls to the card it summarises (data-to = that card's id)
    const tile = (tab, icon, color, label, value, sub, to = tab) => `<button class="gl" data-act="tab" data-tab="${tab}" data-to="${to}" style="--c:${color}">
      <span class="gi">${ic(icon)}</span><div><span>${tr(tc(label))}</span><b>${value}</b><em>${sub}</em></div></button>`;
    const tiles = `
      ${this._secOff('security') ? '' : tile('security', al[1], al[2], 'Security', tr(al[0]), open ? tr('{0} open / unlocked', open) : esc(tr('All closed & locked')))}
      ${this._secOff('climate') ? '' : tile('climate', 'mdi:home-thermometer', '#22d3ee', 'Climate', avg != null ? avg.toFixed(1) + '°' : '—', acOn ? tr('{0} AC running', acOn) : tr('All ACs off'))}
      ${this._secOff('energy') ? '' : tile('energy', 'mdi:lightning-bolt', '#fbbf24', 'Power now', fmtW(home), tr('Today {0}', this._eKwh('d', 1)))}
      ${!E.water.tank ? '' : tile('water', 'mdi:water', '#38bdf8', 'Water Tank', tank != null ? tank.toFixed(0) + '%' : '—', E.water.pumps.some(p => this.on(p.id)) ? tr('Pump running') : tr('Pumps idle'))}
      ${this._secOff('car') ? '' : tile('energy', 'mdi:car-electric', '#34d399', 'Car', ch ? tr('Charging') : esc(this.v(E.car.parking) || '—'), ch ? fmtW(this.n(E.car.power)) : tr('Charger idle'), 'car')}
      ${!E.cameras.length ? '' : tile('security', 'mdi:cctv', det ? '#fb7185' : '#94a3b8', 'Cameras', det ? (det > 1 ? tr('{0} persons', det) : tr('1 person')) : tr('All quiet'), tr('{0} cameras live', E.cameras.length), 'cams')}
      ${!tv ? '' : tile('media', 'mdi:television-play', '#f472b6', 'TV', esc(tr(pretty(tv?.state))), esc(tv?.attributes.app_name || tc(tv?.attributes.friendly_name || '')))}
      ${!E.lab.cpu ? '' : tile('system', 'mdi:server', '#a78bfa', 'Home Lab', cpu != null ? `CPU ${cpu.toFixed(0)}%` : '—', this.on(E.lab.status) ? tr('Online') : tr('Offline'), 'lab')}`;
    // nothing to sum up yet (a new home): say what fills this card instead of an empty box
    return `<div class="ch">${ic('mdi:view-dashboard-outline')}<h3>${tr('At a glance')}</h3></div>${tiles.trim() ? `<div class="glance">${tiles}</div>` : `<div class="empty">${ic('mdi:information-outline')} ${tr('Your alarm, locks, temperatures, power, cameras and TV show up here once Home Assistant has them.')}</div>`}`;
  }

  _acControls(id) {
    const st = this.s(id); if (!st) return '';
    const a = st.attributes; const mode = st.state;
    const modes = a.hvac_modes || [];
    const obj = id.split('.')[1];
    const extras = this._acExtras(id).filter(e => this.ok(e));
    return `<div class="acctl">
      <div class="tgt"><button class="ibtn" data-act="actemp" data-id="${id}" data-d="-1" aria-label="Lower temperature">${ic('mdi:minus')}</button>
        <div class="tv ${this._acPend?.[id] ? 'pend' : ''}"><b>${this._acT(id) ?? '—'}<small>°</small></b><span>target · ${a.min_temp ?? (FAHR ? 61 : 16)}–${a.max_temp ?? (FAHR ? 86 : 30)}°</span></div>
        <button class="ibtn" data-act="actemp" data-id="${id}" data-d="1" aria-label="Raise temperature">${ic('mdi:plus')}</button></div>
      <div class="modes">${modes.map(m => `<button class="mbtn ${mode === m ? 'on' : ''}" style="--c:${m === 'off' ? '#94a3b8' : HVAC_COLOR[m] || '#60a5fa'}" data-act="acmode" data-id="${id}" data-mode="${m}">${ic(HVAC_ICON[m] || 'mdi:thermostat')}<em>${esc(pretty(m))}</em></button>`).join('')}</div>
      <div class="picks">${this.pickChip(id, 'fan', 'Fan', 'mdi:fan')}${this.pickChip(id, 'swing', 'Swing ↕', 'mdi:arrow-up-down')}${this.pickChip(id, 'swingh', 'Swing ↔', 'mdi:arrow-left-right')}${this.pickChip(id, 'preset', 'Preset', 'mdi:star-four-points-outline')}</div>
      ${extras.length ? `<div class="xsw">${extras.map(e => `<button class="xs ${this.on(e) ? 'on' : ''}" data-act="toggle" data-id="${e}">${ic(/jet/.test(e) ? 'mdi:weather-windy' : /display/.test(e) ? 'mdi:monitor' : 'mdi:toggle-switch-outline')}<span>${esc(pretty(e.split('.')[1].slice(obj.length + 1)))}</span><b>${this.on(e) ? 'On' : 'Off'}</b></button>`).join('')}</div>` : ''}
    </div>`;
  }

  _rClimate() {
    const rows = E.acs.map(a => {
      const st = this.s(a.id); if (!st) return '';
      const on = this.climOn(a.id); const mode = st.state; const room = a.room ? ROOM[a.room] : null;
      const t = room?.temp ? this.n(room.temp) : st.attributes.current_temperature;
      const h = room?.hum ? this.n(room.hum) : null;
      const col = on ? (HVAC_COLOR[mode] || '#60a5fa') : '#475569';
      const p = a.power ? this.n(a.power) : null;
      const ctl = this._acControls(a.id);
      return `<div class="ac ${on ? 'on' : ''} open" style="--c:${col}">
        <div class="acrow" data-act="more" data-id="${a.id}"${a.power ? ` data-id2="${a.power}"` : ''}>
          <div class="acic ${on ? 'spin-' + mode : ''}">${ic(on ? (HVAC_ICON[mode] || 'mdi:air-conditioner') : 'mdi:air-conditioner')}</div>
          <div class="acn"><b>${esc(a.name)}</b><span>${on ? `${esc(mode.replace('_', ' '))} → ${this._acT(a.id) ?? '—'}°` : 'Off'}${p != null && p > 0 ? ` · ${Math.round(p)} W` : ''}</span></div>
          <div class="act"><b style="color:${rgb(tempRGB(t))}">${t != null ? Number(t).toFixed(1) + '°' : '—'}</b>${h != null ? `<span>${ic('mdi:water-percent')}${Math.round(h)}%</span>` : ''}</div>
          <button class="pow ${on ? 'on' : ''}" data-act="acpow" data-id="${a.id}">${ic('mdi:power')}</button>
        </div>${ctl}</div>`;
    }).join('');
    const rooms = ROOMS.filter(r => r.temp && this.s(r.temp)).map(r => {
      const t = this.n(r.temp), h = r.hum ? this.n(r.hum) : null;
      return `<button class="rtemp" data-act="more" data-id="${r.temp}"${r.hum ? ` data-id2="${r.hum}"` : ''} style="--c:${rgb(tempRGB(t))}">${ic(r.icon)}<span>${esc(r.name)}</span><b>${t != null ? t.toFixed(1) + '°' : '—'}</b>${h != null ? `<em>${Math.round(h)}%</em>` : ''}</button>`;
    }).join('');
    return `<div class="ch">${ic('mdi:air-conditioner')}<h3>Climate</h3><span class="pill">${E.acs.filter(a => this.climOn(a.id)).length} running</span></div>
      <div class="rtemps">${rooms}</div>
      <div class="acs full">${rows}</div>`;
  }

  // Modes on the Home tab: on / off switches light up while on; scenes, scripts and buttons run with one tap
  _rModes() {
    const t = E.modes.filter(m => this.s(m[0])).map(([id, n, i, di]) => {
      const d = id.split('.')[0], st = this.s(id), run = ['scene', 'script', 'button', 'input_button'].includes(d), bad = BAD.includes(st.state);
      const act = d === 'scene' || d === 'script' ? 'run' : d === 'button' || d === 'input_button' ? 'press' : 'toggle', name = n || st.attributes.friendly_name || id;
      const icon = i || (SMART && nameIcon(id, name)) || st.attributes.icon || di; // its own icon, else one that suits its name, else Home Assistant's
      return `<button class="tile ${!run && this.on(id) ? 'on' : ''} ${bad ? 'na' : ''}" data-act="${act}" data-id="${id}" title="${esc(name)}">${ic(icon, icon === 'mdi:fan' && this.on(id) ? 'spin' : '')}<span>${esc(name)}</span></button>`;
    }).join('');
    return `<div class="ch">${ic('mdi:tune-variant')}<h3>${tr('Modes')}</h3></div><div class="tiles">${t}</div>`;
  }

  _rDrawer() {
    const r = ROOM[this._sel]; if (!r) return '';
    if (this._naming === r.id && this._editing) return this._rRename(r);
    const t = r.temp ? this.n(r.temp) : null, h = r.hum ? this.n(r.hum) : null;
    const lights = (r.lights || []).filter(l => this.s(l)).map(l => {
      const st = this.s(l); const on = st.state === 'on';
      const simple = r.simpleLights?.includes(l);
      const br = on && st.attributes.brightness && !simple ? Math.round(st.attributes.brightness / 2.55) + '%' : on ? tr('On') : st.state === 'off' ? tr('Off') : st.state;
      const dim = l.startsWith('light.') && (st.attributes.supported_color_modes || []).some(m => m !== 'onoff');
      const pct = st.attributes.brightness ? Math.max(1, Math.round(st.attributes.brightness / 2.55)) : 100;
      const fx = r.lightFx?.[l];
      const icon = fx === 'strip' ? 'mdi:led-strip-variant' : fx === 'tv' ? 'mdi:television-ambient-light' : fx === 'spots' ? 'mdi:light-recessed' : on ? 'mdi:ceiling-light' : 'mdi:ceiling-light-outline';
      const lname = r.lightNames?.[l] || tc((st.attributes.friendly_name || l).replace(/^Shelly\s*/i, ''));
      return `<div class="lwrap ${on ? 'on' : ''}"><button class="lrow ${on ? 'on' : ''}" data-act="toggle" data-id="${l}">${ic(icon)}<span>${esc(lname)}</span><b>${esc(br)}</b></button>
        ${simple ? '' : `${dim && on ? this.slider(l, 'bright', pct, '#fbbf24') : ''}${on && (fx === 'strip' || r.colorLights?.includes(l)) ? this.colorRow(l) : ''}${on ? this.pickChip(l, 'effect', 'Effect', 'mdi:auto-fix') : ''}`}</div>`;
    });
    const motion = (r.motion || []).filter(m => this.s(m)).map(m => {
      const on = this.v(m) === 'on';
      return `<div class="mrow ${on ? 'on' : ''}" data-act="more" data-id="${m}">${ic(on ? 'mdi:motion-sensor' : 'mdi:motion-sensor-off')}<span>${esc(r.motionNames?.[m] || tc((this.s(m).attributes.friendly_name || m).replace(/\s*occupancy\s*$/i, '')))}</span><b data-ago="${this.s(m).last_changed}" data-pre="${on ? tr('Detected') : tr('Clear')}" data-short="1" title="${esc(ago(this.s(m).last_changed, this._hass?.locale?.language))}">${on ? tr('Detected') : tr('Clear')} · ${agoShort(this.s(m).last_changed, this._hass?.locale?.language)}</b></div>`;
    });
    const ac = r.climate && this.s(r.climate) ? (() => {
      const st = this.s(r.climate); const on = this.climOn(r.climate);
      // compact row; tapping it reveals the full controls
      const open = this._acOpen === r.climate;
      return `<div class="dac ${on ? 'on' : ''} ${open ? 'open' : ''}" style="--c:${HVAC_COLOR[st.state] || '#60a5fa'}">
        <div class="dac-row" data-act="acexp" data-id="${r.climate}" role="button" aria-expanded="${open}">
          <div class="dac-l">${ic(on ? HVAC_ICON[st.state] || 'mdi:air-conditioner' : 'mdi:air-conditioner')}<b>${tr('AC')}</b><span class="${this._acPend?.[r.climate] ? 'pend' : ''}">${on ? esc(pretty(st.state)) + ' · ' + (this._acT(r.climate) ?? '—') + '°' : tr('Off')}</span></div>
          <div class="tgt sm"><button class="ibtn" data-act="actemp" data-id="${r.climate}" data-d="-1" aria-label="Lower temperature">${ic('mdi:minus')}</button>
            <button class="pow ${on ? 'on' : ''}" data-act="acpow" data-id="${r.climate}" aria-label="AC power">${ic('mdi:power')}</button>
            <button class="ibtn" data-act="actemp" data-id="${r.climate}" data-d="1" aria-label="Raise temperature">${ic('mdi:plus')}</button>
            ${ic(open ? 'mdi:chevron-up' : 'mdi:chevron-down', 'dac-chev')}</div></div>
        ${open ? this._acControls(r.climate) : ''}</div>`;
    })() : '';
    const extra = [];
    const entry = [
      ...(r.locks || []).filter(l => this.s(l)).map(l => {
        const s = this.v(l); const locked = s === 'locked';
        const nm = r.names?.[l] || E.locks.find(x => x.id === l)?.name || tc(this.s(l).attributes.friendly_name);
        return `<button class="lrow lockrow ${locked ? 'good' : 'bad'}" data-act="lock" data-id="${l}" style="position:relative">${ic(locked ? 'mdi:lock' : s === 'unlocked' ? 'mdi:lock-open-variant' : 'mdi:lock-clock')}<span>${esc(nm)}</span><b>${locked ? tr('Locked · tap to unlock') : tr('{0} · tap to lock', esc(tr(pretty(s))))}</b></button>`;
      }),
      ...(r.doors || []).filter(d => this.s(d)).map(d => {
        const o = this.v(d) === 'on'; const info = DOOR_INFO[d] || { name: r.names?.[d] || tc(this.s(d)?.attributes.friendly_name || 'Door') };
        const long = info.timeout && this.v(info.timeout) === 'on';
        return `<div class="mrow ${o ? 'open' : ''}" data-act="more" data-id="${d}"${info.timeout ? ` data-id2="${info.timeout}"` : ''}>${ic(o ? 'mdi:door-open' : 'mdi:door-closed')}<span>${esc(info.name)}</span><b>${o ? (long ? tr('Open too long') : tr('Open')) : tr('Closed')}</b></div>`;
      }),
    ];
    const plugs = (r.plugs || []).filter(p => this.s(p.id)).map(p => {
      const on = this.on(p.id); const w = this.n(p.power); const drawing = on && (w ?? 0) > 1.5, charger = /charg/i.test(`${p.icon} ${p.id} ${p.name}`), chg = drawing && charger;
      const val = !on ? tr('Off') : chg ? tr('Charging · {0} W', w.toFixed(1)) : drawing ? tr('On · {0} W', w < 10 ? w.toFixed(1) : Math.round(w)) : p.power ? tr('On · idle') : tr('On');
      return `<button class="lrow ${on ? 'on cool' : ''}" data-act="toggle" data-id="${p.id}"${p.power ? ` data-id2="${p.power}"` : ''}>${ic(chg ? 'mdi:battery-charging' : p.icon && !['mdi:power-socket-eu', 'mdi:cellphone-charging'].includes(p.icon) ? p.icon : (SMART && nameIcon(p.id, p.name)) || this.s(p.id)?.attributes.icon || p.icon, on && SMART && nameIcon(p.id, p.name) === 'mdi:fan' ? 'spin' : '')}<span>${esc(p.name)}</span><b>${val}</b></button>`;
    });
    if (r.count && this.ok(r.count)) extra.push(`<div class="mrow"><ha-icon icon="mdi:account-multiple"></ha-icon><span>${tr('People Detected')}</span><b>${this.v(r.count)}</b></div>`);
    const devs = [];
    if (r.fan && this.s(r.fan)) devs.push(`<button class="lrow ${this.on(r.fan) ? 'on cool' : ''}" data-act="toggle" data-id="${r.fan}">${ic('mdi:fan', this.on(r.fan) ? 'spin' : '')}<span>${esc(r.names?.[r.fan] || tc(this.s(r.fan).attributes.friendly_name || 'Fan'))}</span><b>${this.on(r.fan) ? tr('On') : tr('Off')}</b></button>`);
    if (r.media && this.s(r.media)) devs.push(`<div class="mrow ${this.v(r.media) === 'playing' ? 'on' : ''}" data-act="more" data-id="${r.media}">${ic('mdi:television-play')}<span>${esc(tc(this.s(r.media).attributes.app_name || this.s(r.media).attributes.friendly_name || 'TV'))}</span><b>${esc(tr(pretty(this.v(r.media))))}</b></div>`);
    // furniture with entities: the piece tapped in 3D comes first, highlighted
    // (an entity that already has its own row above — a light, a door, the TV… — is not repeated under Furniture / Other)
    const shown = new Set([...(r.lights || []), ...(r.locks || []), ...(r.doors || []), ...(r.motion || []), ...(r.plugs || []).map(p => p.id), r.climate, r.fan, r.media, r.temp, r.hum, r.count].filter(Boolean));
    const pieces = FURN.filter(f => f.room === r.id && f.entities?.length);
    const focus = pieces.find(f => f.idx === this._fsel);
    const carVal = (f, id) => (f.type === 'car' ? (this.carParked(id, f.parked_state) ? { val: tr('Parked'), on: true, icon: 'mdi:car' } : { val: tr('Away'), icon: 'mdi:car-off' }) : {});
    const piece = (f, ids, cls = '') => `<div class="fgrp ${cls}"><div class="fhd">${ic(furnIcon(f))}<span>${esc(furnName(f))}</span></div>${ids.map(id => this._entRow(id, { name: r.names?.[id], ...carVal(f, id) })).join('')}</div>`;
    const furn = pieces.filter(f => f !== focus).map(f => [f, f.entities.filter(id => !shown.has(id))]).filter(([, ids]) => ids.length).map(([f, ids]) => piece(f, ids));
    const inFurn = new Set(pieces.flatMap(f => f.entities));
    // the rest: sensors (people counts, illuminance, power…) go with the room's other sensors, everything else under Other
    const rest = (r.entities || []).filter(e => !shown.has(e.id) && !inFurn.has(e.id)), isSensor = e => /^(binary_)?sensor\./.test(e.id);
    const row = e => this._entRow(e.id, { ...e, name: e.name || r.names?.[e.id] });
    const sensors = rest.filter(isSensor).map(row), other = rest.filter(e => !isSensor(e)).map(row);
    // a long list shows its first rows and a "Show more" button
    const fold = (key, rows) => {
      if (rows.length <= 6 || this._dOpen?.has(r.id + key)) return rows.join('') + (rows.length > 6 ? `<button class="dfold" data-act="dfold" data-k="${r.id + key}">${ic('mdi:chevron-up')}${tr('Show less')}</button>` : '');
      return rows.slice(0, 5).join('') + `<button class="dfold" data-act="dfold" data-k="${r.id + key}">${ic('mdi:chevron-down')}${tr('Show {0} more', rows.length - 5)}</button>`;
    };
    const sec = (title, key, rows) => (rows.length ? `<div class="dsec">${tr(title)}</div>${fold(key, rows)}` : '');
    const empty = !lights.length && !motion.length && !ac && !extra.length && !devs.length && t == null && !entry.length && !plugs.length && !pieces.length && !other.length && !sensors.length;
    return `<div class="dh">${ic(r.icon)}<h3>${esc(r.name)}</h3>${this._hass?.user?.is_admin && this._editing && this._roomRnIds(r).length ? `<button class="ibtn edit-only" data-act="names" title="${tr('Rename devices')}" aria-label="${tr('Rename devices')}">${ic('mdi:pencil-outline')}</button>` : ''}<button class="ibtn" data-act="close">${ic('mdi:close')}</button></div>
      ${focus ? piece(focus, focus.entities, 'focus') : ''}
      ${t != null || h != null ? `<div class="dstats">
        ${t != null ? `<div data-act="more" data-id="${r.temp}"><b style="color:${rgb(tempRGB(t))}">${t.toFixed(1)}°</b><span>${tr('Temperature')}</span></div>` : ''}
        ${h != null ? `<div data-act="more" data-id="${r.hum}"><b class="blue">${Math.round(h)}%</b><span>${tr('Humidity')}</span></div>` : ''}
      </div>` : ''}
      ${ac}
      ${sec('Lights', 'l', lights)}
      ${sec(r.locks?.length ? 'Entrance' : 'Doors', 'd', entry)}
      ${sec('Plugs', 'p', plugs)}
      ${sec('Furniture', 'f', furn)}
      ${sec('Devices', 'v', devs)}
      ${sec('Sensors', 's', [...motion, ...extra, ...sensors])}
      ${sec('Other', 'o', other)}
      ${empty ? `<div class="empty">${ic('mdi:information-outline')} ${tr('No devices mapped to this room yet. Link it to an area, or add entities in the card editor (Rooms → Entities).')}</div>` : ''}`;
  }

  // Rename view of the room popup (admins): every entity of the room with its name in a text field. A new name is saved
  // in Home Assistant itself (entity registry), so it changes everywhere; an empty field goes back to the default name.
  // Rename view of the room popup (edit mode): every entity of the room with its name in a text field. Names are for
  // this dashboard only (room `names`, or the card's `names` for the house built from areas); Home Assistant is not
  // changed. They are saved together with ✓ (Done); an empty field goes back to the entity's own name.
  // every entity of a room that its rename view lists (none: the room popup gets no pencil)
  _roomRnIds(r) {
    return [...new Set([...(r.lights || []), r.climate, r.temp, r.hum, ...(r.motion || []), ...(r.doors || []), ...(r.locks || []), ...(r.plugs || []).map(p => p.id), r.fan, r.media, ...(r.entities || []).map(e => e.id), ...(r.furnEnts || [])].filter(id => id && this.s(id)))];
  }
  _rRename(r) {
    const ids = this._roomRnIds(r);
    const raw = this._hass._raw || this._hass, pend = this._pendNames || {};
    const rows = ids.map(id => {
      const st = this.s(id), d = id.split('.')[0], own = raw.states[id]?.attributes.friendly_name || id;
      const cur = pend[id] ?? st.attributes.friendly_name ?? id;
      return `<label class="rnrow">${ic((SMART && NAMED_DOMAINS.concat('scene').includes(d) && nameIcon(id, cur)) || st.attributes.icon || domIcon(d, st.state, st.attributes))}<input data-rename="${id}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', id))}" enterkeyhint="done"><small>${esc(id)}</small></label>`;
    }).join('');
    return `<div class="dh">${ic('mdi:pencil-outline')}<h3>${tr('Rename · {0}', esc(r.name))}</h3><button class="ibtn on" data-act="names" title="${tr('Done')}" aria-label="${tr('Done')}">${ic('mdi:check')}</button></div>
      <div class="sub" style="margin-bottom:10px;font-size:12px;color:var(--mu)">${tr('Names change on this dashboard only. Clear a name to go back to the default.')}</div>
      ${rows || `<div class="empty">${ic('mdi:information-outline')} ${tr('Nothing to rename here.')}</div>`}`;
  }
  // Rename sheet of a panel (edit mode): every entity the panel shows, with its name in a text field. Like the room
  // popup: names are for this dashboard only, saved together with Done; an empty field goes back to the entity's own name.
  _rnSheet(head, sid) {
    const el = this.$(sid), title = (this._rnIds?.sid === sid && this._rnIds.title) || el?.querySelector('.ch h3')?.textContent?.trim() || tr('Panel');
    if (!this._rnIds || this._rnIds.sid !== sid) { // the entities on the panel when renaming started (the list stays put)
      this._rnIds = { sid, ids: this._rnPanelIds(sid, el) };
    }
    const raw = this._hass._raw || this._hass, pend = this._pendNames || {};
    const rows = this._rnIds.ids.map(id => {
      const st = this.s(id), d = id.split('.')[0], dv = sid === 'devices' ? E.devices.find(x => x.bat === id) : null;
      const own = dv ? this._devDefaultName(id) : raw.states[id]?.attributes.friendly_name || id;
      const cur = pend[id] ?? (sid === 'modes' ? E.modes.find(m => m[0] === id)?.[1] : null) ?? dv?.name ?? st.attributes.friendly_name ?? id;
      return `<label class="rnrow">${ic(dv?.icon || (SMART && NAMED_DOMAINS.concat('scene').includes(d) && nameIcon(id, cur)) || st.attributes.icon || domIcon(d, st.state, st.attributes))}<input data-rename="${id}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', id))}" enterkeyhint="done"><small>${esc(id)}</small></label>`;
    }).join('');
    return head('mdi:pencil-outline', esc(tr('Rename · {0}', title)), esc(tr('Names change on this dashboard only. Clear a name to go back to the default.')))
      + (rows ? `${rows}<button class="lrow on rnsave" data-act="rnsave">${ic('mdi:check')}<span>${tr('Done')}</span></button>` : `<div class="empty">${ic('mdi:information-outline')} ${tr('Nothing to rename here.')}</div>`);
  }
  // What a panel's rename sheet lists — also whether the panel gets its pencil at all (none when this is empty).
  // `root`: the panel's element, or its freshly rendered HTML as a fragment. Only entities whose name can be seen on the
  // panel (a temperature shown under its room's name is renamed in the room).
  _rnPanelIds(sid, root) {
    if (sid === 'modes') return E.modes.map(m => m[0]).filter(id => this.s(id));
    if (sid === 'devices') return E.devices.filter(d => this.s(d.bat)).map(d => d.bat); // a device row shows its device's name: renamed on its battery sensor
    const text = (root?.textContent || '').toLowerCase(), seen = id => { const n = String(this.s(id).attributes.friendly_name || id).toLowerCase(); return text.includes(n) || text.includes(n.replace(/^shelly\s*/, '')); };
    return [...new Set([...(root?.querySelectorAll('[data-id],[data-id2]') || [])].flatMap(n => [n.dataset.id, n.dataset.id2]).filter(id => id && id.includes('.') && this.s(id) && seen(id)))];
  }
  // Rename sheet of a lock badge (edit mode, pencil on its label in 3D): the name shown above the badge
  _rnBadgeSheet(head, i) {
    const b = BADGES.find(x => x.i === i); if (!b) return head('mdi:lock', tr('Lock badge'), '');
    const own = this.s(b.lock)?.attributes.friendly_name || b.lock, cur = this._pendNames?.['badge:' + i] ?? b.name ?? own;
    return head('mdi:pencil-outline', esc(tr('Rename · {0}', tr('Lock badge'))), esc(tr('The name above the badge in the 3D view, on this dashboard only. Clear it to show the lock’s name.')))
      + `<label class="rnrow">${ic('mdi:lock')}<input data-rename="badge:${i}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', b.lock))}" enterkeyhint="done"><small>${esc(b.lock)}</small></label>
      <button class="lrow on rnsave" data-act="rnbsave" data-i="${i}">${ic('mdi:check')}<span>${tr('Done')}</span></button>`;
  }
  async _saveBadgeName(i, v) {
    const cfg = JSON.parse(JSON.stringify(this._config || {})), b = cfg.house?.lock_badges?.[i]; if (!b) return;
    const own = (this._hass._raw || this._hass).states[b.lock || b.entity]?.attributes.friendly_name;
    if (!v || v === own) delete b.name; else b.name = v;
    if (JSON.stringify(cfg) === JSON.stringify(this._config)) return;
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Names saved')); }
  }
  // the name a Devices row has without a name given on this dashboard (same rule as the model's batDevice)
  _devDefaultName(id) {
    const h = this._hass, raw = h._raw || h, dev = h.devices?.[h.entities?.[id]?.device_id];
    return dev?.name_by_user || dev?.name || String(raw.states[id]?.attributes.friendly_name || id).replace(/\s*battery( level)?$/i, '');
  }
  // a name typed in a rename view: kept until ✓ (Done)
  _rename(id, name) { (this._pendNames ||= {})[id] = name.trim(); }
  // Names for this dashboard: each one is kept in one place only — the room it was renamed in (`ci`), else where it
  // already was, else the card's own `names` — so the same entity shows the same name on every panel.
  _storeNames(cfg, pend, ci) {
    const raw = this._hass._raw || this._hass, rooms = cfg.house?.rooms || [], holders = [cfg, ...rooms].filter(Boolean);
    for (const [id, v] of Object.entries(pend)) {
      const home = (ci != null && rooms[ci]) || holders.find(h => h.names?.[id] != null) || cfg;
      for (const h of holders) for (const k of ['names', 'light_names']) if (h[k]?.[id] != null) { delete h[k][id]; if (!Object.keys(h[k]).length) delete h[k]; }
      const dev = E.devices.some(d => d.bat === id); // a Devices row: its default is the device's name, not the sensor's
      if (v && v !== raw.states[id]?.attributes.friendly_name && !(dev && v === this._devDefaultName(id))) (home.names ||= {})[id] = v;
      for (const m of arr(cfg.modes)) if (m && typeof m === 'object' && m.entity === id) delete m.name; // a mode shows the name given here
      for (const list of [cfg.panels?.devices?.entities, cfg.devices]) for (const d of arr(list)) if (d && typeof d === 'object' && d.battery === id) delete d.name; // so does a device
    }
  }
  async _saveNames(r) {
    const pend = this._pendNames || {}; this._pendNames = null;
    if (!Object.keys(pend).length) return;
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    this._storeNames(cfg, pend, r?.ci ?? null);
    if (JSON.stringify(cfg) === JSON.stringify(this._config)) return;
    if (r) this._reselect = r.id; // open the room again after the card is rebuilt with the new names
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Names saved')); } else this._reselect = null;
  }

  // One row for any entity: lights, switches, fans, covers… toggle; scripts / scenes run; buttons press; locks lock with a
  // second tap to confirm; everything else shows its state and opens more-info. Long press always opens more-info.
  _entRow(id, o = {}) {
    const st = this.s(id);
    if (!st) return `<div class="mrow na">${ic('mdi:help-circle-outline')}<span>${esc(o.name || id)}</span><b>${tr('Not found')}</b></div>`;
    const d = id.split('.')[0], a = st.attributes, v = st.state, bad = BAD.includes(v);
    const name = esc(o.name || tc(a.friendly_name || id));
    const icon = o.icon || (SMART && !(a.device_class && DC_ICON[a.device_class]) && NAMED_DOMAINS.includes(d) && nameIcon(id, o.name || a.friendly_name)) || a.icon || domIcon(d, v, a);
    if (o.val != null) return `<div class="mrow ${o.on ? 'on' : ''}" data-act="more" data-id="${id}">${ic(icon)}<span>${name}</span><b>${esc(o.val)}</b></div>`;
    if (bad) return `<div class="mrow na" data-act="more" data-id="${id}">${ic(icon)}<span>${name}</span><b>${esc(pretty(v))}</b></div>`;
    if (TOGGLE_DOMAINS.includes(d)) {
      const on = ['on', 'open', 'opening'].includes(v);
      const val = d === 'light' && on && a.brightness ? Math.round(a.brightness / 2.55) + '%' : d === 'cover' || d === 'valve' ? tr(pretty(v)) : on ? tr('On') : tr('Off');
      return `<button class="lrow ${on ? 'on' : ''} ${d === 'light' ? '' : 'cool'}" data-act="toggle" data-id="${id}">${ic(icon, (d === 'fan' || icon === 'mdi:fan') && on ? 'spin' : '')}<span>${name}</span><b>${esc(val)}</b></button>`;
    }
    if (d === 'lock') {
      const locked = v === 'locked';
      return `<button class="lrow lockrow ${locked ? 'good' : 'bad'}" data-act="lock" data-id="${id}" style="position:relative">${ic(locked ? 'mdi:lock' : 'mdi:lock-open-variant')}<span>${name}</span><b>${locked ? tr('Locked') : esc(tr(pretty(v)))}</b></button>`;
    }
    if (d === 'script' || d === 'scene') return `<button class="lrow ${v === 'on' ? 'on cool' : ''}" data-act="run" data-id="${id}">${ic(icon)}<span>${name}</span><b>${tr(d === 'scene' ? 'Activate' : v === 'on' ? 'Running' : 'Run')}</b></button>`;
    if (d === 'button' || d === 'input_button') return `<button class="lrow" data-act="press" data-id="${id}">${ic(icon)}<span>${name}</span><b>${tr('Press')}</b></button>`;
    let val;
    if (d === 'binary_sensor') val = tr(BIN_LABEL[a.device_class]?.[v === 'on' ? 0 : 1] || (v === 'on' ? 'On' : 'Off'));
    else if (!isNaN(parseFloat(v)) && isFinite(v)) { const x = parseFloat(v); val = `${Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10}${a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}`; }
    else val = tr(pretty(v));
    const active = this.on(id) || (d === 'climate' && this.climOn(id));
    return `<div class="mrow ${active ? 'on' : ''}" data-act="more" data-id="${id}">${ic(icon)}<span>${name}</span><b>${esc(val)}</b></div>`;
  }

  _rEnergy() {
    const g = this.n(E.energy.grid) ?? 0, s = Math.max(0, this.n(E.energy.solar) ?? 0);
    const home = Math.max(0, g + s);
    const exporting = g < 0;
    const spd = w => w <= 1 ? 0 : clamp(Math.round(4 - Math.log10(w)), 1, 4); // smaller = faster
    const flowS = exporting ? home : s;
    const cons = this._eConsumers().map(([id, n, i]) => [n, i, this.n(id), id]).filter(c => c[2] != null && c[2] >= 6).sort((a, b) => b[2] - a[2]); // HA energy devices (no car); under 6 W hidden
    const max = Math.max(1, ...cons.map(c => c[2]));
    // top 3 devices drawing power right now, branching off the Home node
    const top = cons.slice(0, 3), FH = top.length ? 292 : 170;
    const DX = [246, 150, 54];
    const devPaths = top.map((c, k) => `<path class="fl act dev s${spd(c[2])}" d="${k === 0 ? 'M246 186 L246 212' : `M246 186 C246 200, ${DX[k]} 196, ${DX[k]} 212`}"/>`).join('');
    const devNodes = top.map(([n, i, w, id], k) => `<div class="node n-dev" style="left:${(DX[k] / 300 * 100).toFixed(2)}%" data-act="more" data-id="${id}">${ic(i)}<b>${fmtW(w)}</b><span>${esc(n)}</span></div>`).join('');
    return `<div class="ch">${ic('mdi:solar-power-variant')}<h3>Energy</h3><span class="pill" style="--c:${exporting ? '#34d399' : '#fbbf24'}">${exporting ? 'Exporting' : 'Importing'}</span></div>
      <div class="flow" style="height:${FH}px">
        <svg viewBox="0 0 300 ${FH}" class="flowsvg">
          <defs>
            <linearGradient id="gS" x1="0" x2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
          </defs>
          <path class="fl ${flowS > 1 ? 'act s' + spd(flowS) : ''} sun" d="M176 22 C222 22, 246 48, 246 94"/>
          <path class="fl ${!exporting && g > 1 ? 'act s' + spd(g) : ''} grid" d="M82 120 L218 120"/>
          <path class="fl ${exporting ? 'act s' + spd(-g) : ''} exp" d="M124 22 C78 22, 54 48, 54 94"/>
          ${devPaths}
        </svg>
        <div class="node n-sun" data-act="more" data-id="${E.energy.solar}">${ic('mdi:solar-panel-large')}<b>${fmtW(s)}</b><span>Solar</span></div>
        <div class="node n-grid ${exporting ? 'exp' : ''}" data-act="more" data-id="${E.energy.grid}">${ic('mdi:transmission-tower')}<b>${fmtW(Math.abs(g))}</b><span>${exporting ? 'To Grid' : 'From Grid'}</span></div>
        <div class="node n-home" data-act="more" data-id="${E.energy.current}">${ic('mdi:home-lightning-bolt')}<b>${fmtW(home)}</b><span>Home${E.energy.current ? ` · ${this.f(E.energy.current, 1)}` : ''}</span></div>
        ${devNodes}
      </div>
      <div class="spark" id="spark">${this._sparkSVG()}</div>
      ${this._eCardKpis()}
      ${this.s(E.forecast.today) ? `<div class="fc" data-act="more" data-id="${E.forecast.today}" data-id2="${E.forecast.tomorrow}">${ic('mdi:weather-sunny-alert')}
        <div><span>Solar Forecast</span><b>Today ${this.f(E.forecast.today, 1)} · Tomorrow ${this.f(E.forecast.tomorrow, 1)}</b>
        <em>${this.ok(E.forecast.remaining) ? `${this.f(E.forecast.remaining, 1)} still to come today` : ''}${this.ok(E.forecast.peak) ? ` · peak at ${new Date(this.v(E.forecast.peak)).toLocaleTimeString(this._hass?.locale?.language || 'en', { hour: '2-digit', minute: '2-digit' })}` : ''}</em></div></div>` : ''}
      <div class="cons">${cons.map(([n, i, w, id]) => `<div class="crow" data-act="more" data-id="${id}">${ic(i)}<span>${n}</span><div class="bar"><i style="width:${(w / max * 100).toFixed(1)}%"></i></div><b>${fmtW(w)}</b></div>`).join('')}
        ${E.energy.extra.filter(x => this.s(x.id)).map(x => `<div class="crow" data-act="more" data-id="${x.id}">${ic(x.icon)}<span>${esc(x.name)}</span><div class="bar"><i style="width:0"></i></div><b>${this.f(x.id, 2)}</b></div>`).join('')}
      </div>`;
  }
  _afterEnergy() {}

  /* ---------- System-tab "Needs Attention" card ---------- */
  // sections in priority order; each holds pre-rendered rows. Shared by the card and the System-tab badge.
  _alertSections() {
    const h = this._hass; if (!h) return [];
    const A = E.alerts, lang = h.locale?.language || 'en';
    const devName = id => { const d = h.devices?.[h.entities?.[id]?.device_id]; return d ? (d.name_by_user || d.name || '') : ''; };
    // excluded devices: by device ID (what the card editor writes) or by name
    const exDev = (id, extra = []) => { const l = [...A.excludeDevices, ...extra]; return l.includes(devName(id)) || l.includes(h.entities?.[id]?.device_id); };
    // admins get a button on each row to leave that device (or the entity, when it has none) out from now on
    // hiding a device from this list is part of editing the dashboard: the eye only shows in edit mode
    const hide = (id, kind = '') => (h.user?.is_admin && this._editing ? `<button class="hbtn edit-only" data-act="exclude" data-id="${id}" data-kind="${kind}" title="${esc(tr('Hide this device here'))}" aria-label="${esc(tr('Hide this device here'))}">${ic('mdi:eye-off-outline')}</button>` : '');
    const nm = st => tc(st.attributes.friendly_name || st.entity_id);
    // label = the main device (bold) with the entity under it; just the entity when it has no device
    const lab = (st, name = nm(st)) => {
      const dn = tc(devName(st.entity_id)); if (!dn) return `<span>${esc(name)}</span>`;
      const rest = name.toLowerCase().startsWith(dn.toLowerCase()) ? name.slice(dn.length).replace(/^[\s:·-]+/, '') : name;
      const e = h.entities?.[st.entity_id], ar = h.areas?.[e?.area_id || h.devices?.[e?.device_id]?.area_id]?.name;
      const sub = [rest && rest.toLowerCase() !== dn.toLowerCase() ? tc(rest) : '', ar ? tc(ar) : ''].filter(Boolean).join(' · ');
      return `<span class="m2">${esc(dn)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
    };
    const num = st => parseFloat(st.state);
    const all = Object.values(h.states);
    // CloudFlare tunnels that are not healthy — named by the tunnel only ("Cloudflare Tunnels Cloudflare Tunnel pbs" → "PBS")
    const tunName = st => (st.attributes.friendly_name || st.entity_id).replace(/^(\s*cloudflare\s+tunnels?\b)+\s*/i, '').replace(/[-_]+/g, ' ').trim()
      .split(/\s+/).map((w, i, a) => a.length === 1 && w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ') || nm(st);
    const tun = !A.tunnels ? [] : all.filter(st => /^sensor\..*tunnel/.test(st.entity_id) && h.entities?.[st.entity_id]?.platform === 'cloudflare_tunnel_monitor' || (/^sensor\..*cloudflare.*tunnel/.test(st.entity_id))).filter(st => st.state !== 'healthy' && !BAD.includes(st.state))
      .map(st => `<div class="mrow open" data-act="more" data-id="${st.entity_id}">${ic('mdi:cloud-alert')}<span>${esc(tunName(st))}</span><b>${esc(tc(pretty(st.state)))}</b></div>`);
    // unavailable switches / lights + entities of the watched integrations
    const DI = { switch: 'mdi:toggle-switch-off-outline', light: 'mdi:lightbulb-off-outline' };
    const unRaw = all.filter(st => st.state === 'unavailable' && !A.excludeEntities.includes(st.entity_id) && !exDev(st.entity_id)
      && (A.unavailDomains.includes(st.entity_id.split('.')[0]) || A.unavailPlatforms.includes(h.entities?.[st.entity_id]?.platform)))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
    // one row per device: "Front Door Lock" with "Auto Lock, Lock Sound" under it, not a row per entity
    const unG = new Map();
    for (const st of unRaw) { const dev = h.entities?.[st.entity_id]?.device_id, k = dev || st.entity_id; (unG.get(k) || unG.set(k, []).get(k)).push(st); }
    const un = [...unG.values()].map(g => {
      const st = g[0]; if (g.length === 1) return `<div class="mrow" data-act="more" data-id="${st.entity_id}">${ic(DI[st.entity_id.split('.')[0]] || 'mdi:lan-disconnect')}${lab(st)}<b data-ago="${st.last_changed}" data-pre="Offline" data-short="1">Offline · ${agoShort(st.last_changed, lang)}</b>${hide(st.entity_id)}</div>`;
      const dn = tc(devName(st.entity_id)), e = h.entities?.[st.entity_id], ar = h.areas?.[e?.area_id || h.devices?.[e?.device_id]?.area_id]?.name;
      const parts = g.map(x => { const n = nm(x); return tc(n.toLowerCase().startsWith(dn.toLowerCase()) ? n.slice(dn.length).replace(/^[\s:·-]+/, '') || n : n); });
      const sub = [parts.length <= 3 ? parts.join(', ') : `${parts.length} parts offline`, ar ? tc(ar) : ''].filter(Boolean).join(' · ');
      const since = g.map(x => x.last_changed).sort()[0];
      return `<div class="mrow" data-act="more" data-id="${st.entity_id}">${ic('mdi:lan-disconnect')}<span class="m2">${esc(dn)}<small>${esc(sub)}</small></span><b data-ago="${since}" data-pre="Offline" data-short="1">Offline · ${agoShort(since, lang)}</b>${hide(st.entity_id)}</div>`;
    });
    // low batteries
    const seenDev = new Set();
    const bat = all.filter(st => ((st.entity_id.startsWith('sensor.') && st.attributes.device_class === 'battery' && st.attributes.unit_of_measurement === '%' && !h.entities?.[st.entity_id]?.hidden && h.entities?.[st.entity_id]?.platform !== 'mobile_app') || A.batteryExtra[st.entity_id]) && !isNaN(num(st)) && num(st) <= A.batteryMax
      && (() => { const dv = h.entities?.[st.entity_id]?.device_id; if (!dv) return true; if (seenDev.has(dv)) return false; seenDev.add(dv); return true; })()
      && !A.batteryExclude.includes(st.entity_id) && !exDev(st.entity_id, A.batteryExcludeDevices)).sort((a, b) => num(a) - num(b))
      .map(st => `<div class="mrow open" data-act="more" data-id="${st.entity_id}">${ic('mdi:battery-alert-variant-outline')}${A.batteryExtra[st.entity_id] ? `<span>${esc(A.batteryExtra[st.entity_id])}</span>` : lab(st, nm(st).replace(/\s*Battery\+?$/i, ''))}<b>${Math.round(num(st))}%</b>${hide(st.entity_id, 'battery')}</div>`);
    // devices with a weak Wi-Fi signal, with their restart button
    const weak = all.filter(st => st.entity_id.startsWith('sensor.') && st.attributes.device_class === 'signal_strength' && /dBm/i.test(st.attributes.unit_of_measurement || '') && !isNaN(num(st)) && num(st) < A.rssiMin && !A.excludeEntities.includes(st.entity_id) && !exDev(st.entity_id))
      .sort((a, b) => num(a) - num(b)).map(st => {
        const dev = h.entities?.[st.entity_id]?.device_id, rb = dev && Object.keys(h.entities || {}).find(e => e.startsWith('button.') && h.entities[e].device_id === dev && h.states[e] && (h.states[e].attributes.device_class === 'restart' || /reboot|restart/.test(e)));
        return `<div class="mrow open wrow" data-act="more" data-id="${st.entity_id}">${ic('mdi:wifi-strength-1-alert')}${lab(st, nm(st).replace(/\s*(rssi|signal strength)$/i, ''))}<b>${Math.round(num(st))} dBm</b>${rb ? (Date.now() - (this._rbAt?.[rb] || 0) < 20e3 ? `<button class="rbtn busy" disabled>${ic('mdi:loading', 'spin')}Rebooting…</button>` : `<button class="rbtn" data-act="reboot" data-id="${rb}">${ic('mdi:restart')}Reboot</button>`) : ''}${hide(st.entity_id)}</div>`;
      });
    // pending updates, as on HA's Settings page: update entities that are on, can be installed and are not skipped
    const upd = all.filter(st => st.entity_id.startsWith('update.') && st.state === 'on' && (st.attributes.supported_features & 1)
      && st.attributes.skipped_version !== st.attributes.latest_version)
      .sort((a, b) => nm(a).localeCompare(nm(b))).map(st => {
        const a = st.attributes, name = tc(a.title || (a.friendly_name || st.entity_id).replace(/\s*update$/i, ''));
        const busy = a.in_progress !== false && a.in_progress != null;
        const ver = busy ? `Updating${typeof a.in_progress === 'number' ? ` · ${a.in_progress}%` : '…'}` : `${a.installed_version || '?'} → ${a.latest_version || '?'}`;
        return `<div class="mrow open wrow" data-act="more" data-id="${st.entity_id}">${ic(busy ? 'mdi:progress-download' : 'mdi:package-up')}<span class="m2">${esc(name)}<small>${esc(ver)}</small></span>${busy ? '' : `<button class="rbtn ubtn" data-act="install" data-id="${st.entity_id}">${ic('mdi:download')}Update</button>`}</div>`;
      });
    // HA Repairs: the same list as Settings → Repairs (ignored ones left out), loaded by _loadRepairs every 30 s;
    // "restart required" issues share one two-tap Restart Home Assistant button
    const reps = (this._repairs || []).filter(i => !i.ignored);
    const needRestart = reps.some(i => /restart_required/.test(i.translation_key || ''));
    const rep = reps.map(i => {
      const nm = i.translation_placeholders?.name || tc(pretty(i.issue_domain || i.domain || ''));
      const restart = /restart_required/.test(i.translation_key || '');
      const what = restart ? 'Restart required' : tc(pretty(String(i.translation_key || i.issue_id).replace(/_/g, ' ')));
      return `<div class="mrow ${i.severity === 'error' || i.severity === 'critical' ? 'open' : ''}" data-act="repairs">${ic(restart ? 'mdi:restart-alert' : 'mdi:wrench-outline')}<span class="m2">${esc(nm)}<small>${esc(what)}${i.domain && i.domain !== i.issue_domain ? ` · ${esc(tc(i.domain))}` : ''}</small></span></div>`;
    });
    if (needRestart && rep.length) rep[rep.length - 1] += (`<div class="mrow wrow"><span class="m2">Restart Home Assistant<small>to apply the changes above</small></span><button class="rbtn" data-act="harestart" data-id="homeassistant.restart">${ic('mdi:restart')}Restart</button></div>`); // attached to the last row so the count is the number of repairs
    return [['tun', 'Tunnels', 'mdi:cloud-alert', tun], ['rep', 'Repairs', 'mdi:wrench', rep], ['un', 'Unavailable', 'mdi:lan-disconnect', un], ['upd', 'Updates', 'mdi:package-up', upd], ['bat', 'Low Batteries', 'mdi:battery-alert', bat], ['wifi', 'Weak WiFi', 'mdi:wifi-alert', weak]].filter(x => x[3].length);
  }
  async _loadRepairs() {
    if (this._repBusy || !this._hass) return; this._repBusy = true;
    try { const r = await this._hass.callWS({ type: 'repairs/list_issues' }); this._repairs = r?.issues || []; } catch (e) { /* not an admin: no repairs */ }
    this._repBusy = false; this._repAt = Date.now(); this._rerender('alerts', 'tabs');
  }
  _rAlerts() {
    if (!this._repAt || Date.now() - this._repAt > 30e3) setTimeout(() => this._loadRepairs(), 0);
    const secs = this._alertSections(); this._alertCount = secs.reduce((n, x) => n + x[3].length, 0);
    if (!secs.length) return '';
    this._alOpen = this._alOpen || new Set();
    const LIM = 5;
    const body = secs.map(([k, title, icon, rows]) => {
      const open = this._alOpen.has(k), shown = open ? rows : rows.slice(0, LIM);
      const more = rows.length > LIM ? `<button class="almore" data-act="alexp" data-k="${k}">${open ? 'Show less' : `+${rows.length - LIM} more`}</button>` : '';
      return `<div class="dsec alsec">${ic(icon)}${title}<i>${rows.length}</i></div>${shown.join('')}${more}`;
    }).join('');
    return `<div class="card acard"><div class="ch">${ic('mdi:alert-circle-outline')}<h3>Needs Attention</h3><span class="pill" style="--c:#f43f5e">${this._alertCount}</span></div>${body}</div>`;
  }

  /* ---------- energy history (long-term statistics) ---------- */
  _ehRange(p, off) {
    const now = new Date(), Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
    const lang = this._hass?.locale?.language || 'en';
    const fd = (d, o) => d.toLocaleDateString(lang, o);
    let s, e, period, n, label;
    if (p === 'day') { s = new Date(Y, M, D + off); e = new Date(Y, M, D + off + 1); period = 'hour'; n = 24; label = off === 0 ? 'Today' : off === -1 ? 'Yesterday' : fd(s, { weekday: 'short', day: 'numeric', month: 'short' }); }
    else if (p === 'week') { const dow = (now.getDay() + 6) % 7; s = new Date(Y, M, D - dow + 7 * off); e = new Date(Y, M, D - dow + 7 * off + 7); period = 'day'; n = 7; label = off === 0 ? 'This Week' : off === -1 ? 'Last Week' : `${fd(s, { day: 'numeric', month: 'short' })} – ${fd(new Date(e - 864e5), { day: 'numeric', month: 'short' })}`; }
    else if (p === 'month') { s = new Date(Y, M + off, 1); e = new Date(Y, M + off + 1, 1); period = 'day'; n = Math.round((e - s) / 864e5); label = fd(s, { month: 'long', year: 'numeric' }); }
    else { s = new Date(Y + off, 0, 1); e = new Date(Y + off + 1, 0, 1); period = 'month'; n = 12; label = String(Y + off); }
    const idx = t => p === 'day' ? t.getHours() : p === 'week' ? Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - s) / 864e5) : p === 'month' ? t.getDate() - 1 : t.getMonth();
    const xl = i => {
      if (p === 'day') return i % 3 === 0 ? String(i).padStart(2, '0') : '';
      if (p === 'week') return fd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i), { weekday: 'short' });
      if (p === 'month') return i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : '';
      return fd(new Date(s.getFullYear(), i, 1), { month: 'short' });
    };
    const bl = i => p === 'day' ? `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00` : p === 'year' ? fd(new Date(s.getFullYear(), i, 1), { month: 'long' }) : fd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i), { weekday: 'short', day: 'numeric', month: 'short' });
    return { s, e, period, n, label, idx, xl, bl };
  }
  // ---------- HA Energy settings: devices, meters and totals come from energy/get_prefs ----------
  async _loadEPrefs() {
    try { this._eprefs = await this._hass.callWS({ type: 'energy/get_prefs' }); } catch (e) { this._eprefs = null; }
    // live power = the power sensors (stat_rate) of HA's Energy settings, unless the card config names others
    const P = this._eprefs?.energy_sources || [], g = P.find(x => x.type === 'grid'), so = P.find(x => x.type === 'solar');
    // live power: picked in the card (grid and / or solar) — then only those — else Home Assistant's Energy settings
    const own = !!(this._config?.panels?.energy?.grid_power || this._config?.panels?.energy?.solar_power);
    if (!E.energy.grid && !own) E.energy.grid = g?.stat_rate || g?.power?.[0]?.stat_rate || null;
    if (!E.energy.solar && !own) E.energy.solar = so?.stat_rate || null;
    const on = this._config?.panels?.energy !== false && !!(E.energy.grid || E.energy.solar || this._eSrc().gridIn);
    for (const sec of this._sections || []) {
      if (['energy', 'ehist'].includes(sec.el.id)) { sec.off = !on; sec.el.style.display = on ? '' : 'none'; }
      if (['energy', 'hdr', 'glance', 'tabs'].includes(sec.el.id)) sec.deps.push(...[E.energy.grid, E.energy.solar].filter(Boolean));
    }
    this._ehCache = {}; this._loadETotals(); this._rerender('energy', 'ehist');
  }
  // grid in / out and solar energy meters (HA energy sources, else E.ehist)
  _eSrc() {
    const P = this._eprefs?.energy_sources || [], g = P.find(x => x.type === 'grid'), so = P.find(x => x.type === 'solar');
    const H = E.ehist;
    return { gridIn: g?.stat_energy_from || g?.flow_from?.[0]?.stat_energy_from || H.gridIn, gridOut: g?.stat_energy_to || g?.flow_to?.[0]?.stat_energy_to || H.gridOut, solar: so?.stat_energy_from || H.solar };
  }
  // devices = HA energy "Individual devices" (the car charger is not one of them); names / icons / colours from E.ehist
  // when the meter is known there. The car is always left out (it is not behind the house meter).
  _eDevs() {
    const isCar = id => !!id && E.energy.exclude.includes(id); // left out of the energy card (e.g. a charger not behind the house meter)
    const pal = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#22d3ee', '#fb923c', '#60a5fa', '#2dd4bf', '#a3e635', '#fde047', '#e879f9'];
    const guess = n => /\bac\b|air.?con/i.test(n) ? 'mdi:air-conditioner' : /heater|boiler/i.test(n) ? 'mdi:water-boiler' : /pump/i.test(n) ? 'mdi:water-pump' : /server|pc\b/i.test(n) ? 'mdi:server' : /light/i.test(n) ? 'mdi:lightbulb' : /router/i.test(n) ? 'mdi:router-wireless' : 'mdi:power-plug';
    const D = this._eprefs?.device_consumption;
    if (!D) return E.ehist.devices.filter(d => !isCar(d[0])).map(([stat, n, i, c, cap]) => ({ stat, rate: null, n, i, c, cap }));
    return D.filter(d => !isCar(d.stat_consumption) && !isCar(d.stat_rate)).map((d, k) => {
      const m = E.ehist.devices.find(x => x[0] === d.stat_consumption);
      return { stat: d.stat_consumption, rate: d.stat_rate || null, n: m ? m[1] : tc(d.name || this.s(d.stat_consumption)?.attributes.friendly_name || d.stat_consumption), i: m ? m[2] : guess(d.name || ''), c: m ? m[3] : pal[k % pal.length], cap: m?.[4] };
    });
  }
  // live consumers (power sensors) for the Energy card / Power sheet: HA energy devices with a power sensor
  _eConsumers() {
    const devs = this._eDevs().filter(d => d.rate);
    if (devs.length) return devs.map(d => [d.rate, d.n, d.i]);
    return E.energy.consumers;
  }
  // Today / Month / Year net grid energy (in − out) from the same statistics as HA's Energy dashboard
  async _loadETotals() {
    if (!this._hass || this._etotBusy) return; this._etotBusy = true;
    try {
      const S = this._eSrc(), now = new Date(), y0 = new Date(now.getFullYear(), 0, 1), m0 = new Date(now.getFullYear(), now.getMonth(), 1), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const ids = [S.gridIn, S.gridOut], q = (start, period) => this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: start.toISOString(), end_time: now.toISOString(), statistic_ids: ids, period, types: ['change'], units: { energy: 'kWh' } });
      const r = await q(y0, 'hour');
      // hourly rows lag up to an hour: add the 5-minute rows after the last compiled hour so Today stays live
      const ts = row => typeof row.start === 'number' ? row.start : Date.parse(row.start);
      const lastH = Math.max(0, ...ids.flatMap(id => (r[id] || []).map(ts))) + 3600e3;
      const r5 = await q(new Date(Math.max(+d0, lastH)), '5minute').catch(() => ({}));
      const tot = from => { let v = 0; for (const [id, sg] of [[S.gridIn, 1], [S.gridOut, -1]]) {
        for (const row of r[id] || []) { const c = row.change || 0; if (c > 0 && c <= 25 && ts(row) >= +from) v += sg * c; }
        for (const row of r5[id] || []) { const c = row.change || 0; if (c > 0 && c <= 5 && ts(row) >= Math.max(+from, lastH)) v += sg * c; } } return v; };
      this._etot = { d: tot(d0), m: tot(m0), y: tot(y0), at: Date.now() };
    } catch (e) { console.warn('sweet-home energy totals', e); }
    this._etotBusy = false; this._rerender('energy', 'glance');
    if (this._info === 'power') this._renderInfo();
  }
  // Energy card + Power popup totals: Today from statistics, Month / Year from the user's template
  // sensors (sensor.total_energy_monthly / _yearly), Stored = sensor.energy_stored
  _eCardKpis() {
    const S = this._eSrc(), T = this._etot || {}, g = v => v != null && v < 0 ? 'green' : '';
    const tpl = (id, k, dp) => id ? `<b class="${g(this.n(id))}">${this.f(id, dp)}</b>` : `<b class="${g(T[k])}">${this._eKwh(k, dp)}</b>`;
    return `<div class="kpis ${E.energy.stored ? 'four e4' : ''}">
          <div data-act="more" data-id="${S.gridIn}" data-id2="${S.gridOut}"><span>Today</span><b class="${g(T.d)}">${this._eKwh('d', 2)}</b></div>
          <div data-act="more" data-id="${E.energy.monthly || S.gridIn}"><span>Month</span>${tpl(E.energy.monthly, 'm', 1)}</div>
          <div data-act="more" data-id="${E.energy.yearly || S.gridIn}"><span>Year</span>${tpl(E.energy.yearly, 'y', 0)}</div>
          ${E.energy.stored ? `<div data-act="more" data-id="${E.energy.stored}"><span>Stored</span><b class="${g(this.n(E.energy.stored))}">${this.f(E.energy.stored, 0)}</b></div>` : ''}
        </div>`;
  }
  _eKwh(k, dp) { const v = this._etot?.[k]; return v == null ? '—' : `${v.toFixed(dp)}<small>kWh</small>`; }

  async _ehLoad(key, R) {
    const H = this._eSrc(), DV = this._eDevs(), ids = [H.gridIn, H.gridOut, H.solar, ...DV.map(d => d.stat)];
    this._ehCache[key] = { loading: true };
    try {
      // year view reads daily rows (summed into months) so meter-reset spikes can be dropped per day
      const fp = R.period === 'month' ? 'day' : R.period, hrs = fp === 'hour' ? 1 : 24;
      const r = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: R.s.toISOString(), end_time: R.e.toISOString(), statistic_ids: ids, period: fp, types: ['change'], units: { energy: 'kWh' } });
      // kWh-per-hour ceiling: anything above it is a counter reset, not real use
      const cap = id => (id === H.gridIn || id === H.gridOut ? 25 : id === H.solar ? 15 : DV.find(d => d.stat === id)?.cap || 5) * hrs;
      const ser = id => { const a = new Array(R.n).fill(0), c = cap(id); for (const row of r[id] || []) { const v = row.change || 0; if (v <= 0 || v > c) continue; const t = new Date(typeof row.start === 'number' ? row.start : Date.parse(row.start)); if (t < R.s || t >= R.e) continue; /* HA also returns the row that starts at end_time (next day / month) */ const i = R.idx(t); if (i >= 0 && i < R.n) a[i] += v; } return a; };
      const gi = ser(H.gridIn), go = ser(H.gridOut), so = ser(H.solar);
      const dev = {}; for (const d of DV) dev[d.stat] = ser(d.stat);
      this._ehCache[key] = { gi, go, so, home: gi.map((v, i) => Math.max(0, v + so[i] - go[i])), dev };
    } catch (err) { console.warn('sweet-home energy history', err); this._ehCache[key] = { error: true }; }
    this._rerender('ehist');
  }
  // every device with use in the shown period
  _ehAll() {
    const d = this._ehCur; if (!d?.dev) return [];
    return this._eDevs().map(x => x.stat).filter(id => d.dev[id] && d.dev[id].reduce((a, b) => a + b, 0) > 0.005);
  }
  _ehTop3() {
    const d = this._ehCur; if (!d?.dev) return [];
    return this._eDevs().map(x => x.stat).filter(id => d.dev[id]).map(id => [id, d.dev[id].reduce((a, b) => a + b, 0)]).filter(x => x[1] > 0.01).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  }
  _rEHist() {
    this._eh = this._eh || { p: 'day', off: 0, sel: null, bar: null };
    this._ehCache = this._ehCache || {};
    const { p, off } = this._eh, R = this._ehRange(p, off), key = `${p}|${off}`;
    const d = this._ehCache[key];
    if (!d && this._hass) this._ehLoad(key, R);
    this._ehCur = d;
    const kwh = v => v == null ? '—' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    const seg = ['day', 'week', 'month', 'year'].map(k => `<button class="${p === k ? 'on' : ''}" data-act="ehp" data-p="${k}">${tc(k)}</button>`).join('');
    const head = `<div class="ch">${ic('mdi:chart-bar-stacked')}<h3>Energy History</h3><span class="pill" style="--c:#fbbf24">kWh</span></div>
      <div class="ehtop"><div class="seg ehseg">${seg}</div>
        <div class="ehnav"><button class="ehnow ${off < 0 ? '' : 'hide'}" data-act="ehnow" ${off < 0 ? '' : 'tabindex="-1" aria-hidden="true"'}>${ic('mdi:calendar-today')}${{ day: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' }[p]}</button><button class="ibtn" data-act="ehnav" data-d="-1" aria-label="Previous">${ic('mdi:chevron-left')}</button><b>${esc(R.label)}</b>
        <button class="ibtn" data-act="ehnav" data-d="1" aria-label="Next" ${off >= 0 ? 'disabled' : ''}>${ic('mdi:chevron-right')}</button></div></div>`;
    // while loading: keep the card's size — the last period's content stays, dimmed, under a spinner;
    // the first time there is nothing yet, a same-sized skeleton is shown instead
    if (!d || d.loading) {
      const sk = `<div class="kpis four">${'<div><span class="skl" style="width:60%"></span><b class="skl" style="width:45%;height:15px"></b></div>'.repeat(4)}</div>
        <div class="ehbal skel"><span class="skl" style="width:40%;height:16px"></span><span class="skl" style="width:100%;height:8px;margin-top:10px"></span></div>
        <div class="ehread"></div><div class="ehchart skel">${Array.from({ length: 16 }, (_, i) => `<i style="height:${25 + ((i * 37) % 60)}%"></i>`).join('')}</div>
        <div class="ehlg"><span class="skl" style="width:70%;height:22px"></span></div>
        <div class="dsec">Devices</div><div class="cons">${'<div class="crow ehrow skrow"><span class="skl" style="width:16px;height:16px"></span><span class="skl"></span><span class="skl" style="height:6px"></span><span class="skl"></span><span class="skl"></span></div>'.repeat(7)}</div>`;
      return head + `<div class="ehwrap ehbusy">${this._ehBody || sk}<div class="ehspin">${ic('mdi:loading', 'spin')}<span>Loading ${esc(R.label.toLowerCase())}…</span></div></div>`;
    }
    if (d.error) return head + `<div class="sk-empty eh-msg">Couldn't load energy history</div>`;
    const sum = a => a.reduce((x, y) => x + y, 0);
    const used = sum(d.home), H = this._eSrc();
    const devs = this._eDevs().filter(x => d.dev[x.stat]).map(({ stat: id, n, i, c }) => ({ id, n: tc(n), i, c, a: d.dev[id], t: sum(d.dev[id]) })).filter(x => x.t > 0.005).sort((a, b) => b.t - a.t);
    const sel = (this._eh.sel || devs.map(x => x.id)).filter(id => devs.some(x => x.id === id));
    const series = sel.map(id => devs.find(x => x.id === id));
    const other = d.home.map((v, i) => Math.max(0, v - series.reduce((a, x) => a + x.a[i], 0)));
    const stacks = d.home.map((v, i) => Math.max(v, series.reduce((a, x) => a + x.a[i], 0)));
    const raw = Math.max(0.1, ...stacks), mag = Math.pow(10, Math.floor(Math.log10(raw))), ymax = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= raw);
    const bw = 10, y = v => 100 - v / ymax * 100;
    const bars = d.home.map((_, i) => {
      let acc = 0; const parts = [...series.map(x => [x.a[i], x.c]), [other[i], '#475569']].map(([v, c]) => {
        if (v <= 0) return ''; const r = `<rect x="${i * bw + 1.5}" y="${y(acc + v).toFixed(2)}" width="${bw - 3}" height="${(v / ymax * 100).toFixed(2)}" fill="${c}"/>`; acc += v; return r;
      }).join('');
      return `<g class="${this._eh.bar === i ? 'sel' : ''}">${parts}<rect class="hit" x="${i * bw}" y="0" width="${bw}" height="100" data-act="ehbar" data-i="${i}"/></g>`;
    }).join('');
    const yl = [ymax, ymax / 2, 0].map(v => `<i style="top:${y(v)}%">${kwh(v)}</i>`).join('');
    const xl = Array.from({ length: R.n }, (_, i) => `<i>${esc(R.xl(i))}</i>`).join('');
    const b = this._eh.bar;
    const readout = b != null && b < R.n ? `<div class="ehread"><b>${esc(R.bl(b))}</b> · ${kwh(d.home[b])} kWh used · ${d.gi[b] - d.go[b] < 0 ? `<span style="color:var(--green)">net exported ${kwh(d.go[b] - d.gi[b])}</span>` : `<span style="color:#60a5fa">net imported ${kwh(d.gi[b] - d.go[b])}</span>`}${series.map(x => x.a[b] > 0.005 ? ` · <span style="color:${x.c}">${esc(x.n)} ${kwh(x.a[b])}</span>` : '').join('')}</div>` : `<div class="ehread mu">Tap a bar for details</div>`;
    const legend = [...series.map(x => `<span class="lg" data-act="ehdev" data-id="${x.id}"><i style="background:${x.c}"></i>${esc(x.n)}</span>`), `<span class="lg"><i style="background:#475569"></i>Other</span>`].join('')
      + (this._eh.sel ? `<button class="lg rst" data-act="ehreset">${ic('mdi:restore')}Show all</button>` : '');
    const mx = Math.max(0.01, ...devs.map(x => x.t)), tracked = sum(devs.map(x => x.t)), den = Math.max(used, tracked, 0.01);
    const rows = devs.map(x => { const on = sel.includes(x.id); return `<div class="crow ehrow ${on ? 'on' : ''}" data-act="ehdev" data-id="${x.id}" style="--c:${x.c}">${ic(x.i)}<span>${esc(x.n)}</span><div class="bar"><i style="width:${(x.t / mx * 100).toFixed(1)}%;background:${x.c}"></i></div><b>${kwh(x.t)}</b><em>${Math.round(x.t / den * 100)}%</em></div>`; }).join('')
      + (used - tracked > 0.05 ? `<div class="crow ehrow untr">${ic('mdi:home-outline')}<span>Untracked</span><div class="bar"><i style="width:${((used - tracked) / Math.max(mx, used - tracked) * 100).toFixed(1)}%;background:#475569"></i></div><b>${kwh(used - tracked)}</b><em>${Math.round((used - tracked) / den * 100)}%</em></div>` : '');
    this._ehBody = `
      <div class="kpis four">
        <div data-act="more" data-id="${E.energy.current}"><span>Used</span><b>${kwh(used)}</b></div>
        <div data-act="more" data-id="${H.gridIn}"><span>From Grid</span><b>${kwh(sum(d.gi))}</b></div>
        <div data-act="more" data-id="${H.solar}"><span>Solar</span><b class="amber">${kwh(sum(d.so))}</b></div>
        <div data-act="more" data-id="${H.gridOut}"><span>Exported</span><b class="green">${kwh(sum(d.go))}</b></div>
      </div>
      ${(() => { // grid balance, as HA's "Grid energy balance": imported − exported
        const gi = sum(d.gi), go = sum(d.go), net = gi - go, exp = net < 0, tot = Math.max(0.01, gi + go);
        return `<div class="ehbal ${exp ? 'exp' : 'imp'}" data-act="more" data-id="${exp ? H.gridOut : H.gridIn}">
          <div class="ehbal-t">${ic(exp ? 'mdi:transmission-tower-export' : 'mdi:transmission-tower-import')}<span>${exp ? 'Net Exported' : 'Net Imported'}</span><b>${kwh(Math.abs(net))}<small>kWh</small></b></div>
          <div class="ehbal-bar"><i class="in" style="width:${(gi / tot * 100).toFixed(1)}%"></i><i class="out" style="width:${(go / tot * 100).toFixed(1)}%"></i></div>
          <div class="ehbal-l"><span>${ic('mdi:arrow-down')}Imported ${kwh(gi)}</span><span>Exported ${kwh(go)}${ic('mdi:arrow-up')}</span></div></div>`;
      })()}
      ${readout}
      <div class="ehchart"><div class="ehy">${yl}</div><svg viewBox="0 0 ${R.n * bw} 100" preserveAspectRatio="none">
        ${[0, 50, 100].map(v => `<line x1="0" x2="${R.n * bw}" y1="${v}" y2="${v}" class="gl"/>`).join('')}${bars}</svg>
        <div class="ehx" style="grid-template-columns:repeat(${R.n},1fr)">${xl}</div></div>
      <div class="ehlg">${legend}</div>
      <div class="dsec">Devices · tap to show in chart</div>
      <div class="cons">${rows || '<div class="sk-empty">No device data for this period</div>'}</div>`;
    return head + `<div class="ehwrap">${this._ehBody}</div>`;
  }
  // Power chart under the live flow (Energy tab): today from midnight in 5-minute steps.
  // Above zero: solar used at home (amber) + grid import (blue), their top = home use (dashed line);
  // below zero: exported solar (green). Drag / hover to read values, tap a legend item to hide it.
  _sparkSVG() {
    const H = this._hist;
    if (!H) return `<div class="spk-load"><div class="spk-wrap"><div class="spk-y"></div><div class="spk skelchart">${Array.from({ length: 24 }, (_, i) => `<i style="height:${18 + ((i * 29) % 55)}%"></i>`).join('')}</div><div class="spk-x"></div></div>
      <div class="sk-lg">${skl('62%', 12)}</div>${skPill("Loading today's power…")}</div>`;
    const hide = this._spkHide || (this._spkHide = new Set());
    const B = H.grid.length, now = new Date(), day0 = H.day0;
    const nowI = clamp(Math.floor((now - day0) / 3e5), 0, B - 1);
    // series (W); the bucket for "now" follows the live sensors
    const gr = H.grid.slice(), so = H.solar.slice();
    const lg = this.n(E.energy.grid), ls = this.n(E.energy.solar);
    if (lg != null) gr[nowI] = lg; if (ls != null) so[nowI] = Math.max(0, ls);
    const S = [], I = [], X = [], Hm = [];
    for (let i = 0; i < B; i++) {
      if (i > nowI || gr[i] == null || so[i] == null) { S.push(null); I.push(null); X.push(null); Hm.push(null); continue; }
      const g = gr[i], sol = Math.max(0, so[i]), exp = Math.max(0, -g), imp = Math.max(0, g);
      S.push(Math.max(0, sol - exp)); I.push(imp); X.push(exp); Hm.push(Math.max(0, g + sol));
    }
    const vis = k => !hide.has(k);
    const top = i => (vis('solar') ? S[i] : 0) + (vis('import') ? I[i] : 0);
    let maxP = 0, minN = 0, pk = -1;
    for (let i = 0; i <= nowI; i++) {
      if (S[i] == null) continue;
      maxP = Math.max(maxP, top(i), vis('home') ? Hm[i] : 0);
      if (vis('export')) minN = Math.max(minN, X[i]);
      if (pk < 0 || Hm[i] > Hm[pk]) pk = i;
    }
    const nice = v => { const st = [250, 500, 1000, 2000, 2500, 5000, 10000]; return st.find(x => v / x <= 4) || 10000; };
    const step = nice(Math.max(maxP, minN, 500)), yMax = Math.max(step, Math.ceil(maxP / step) * step), yMin = minN > 0 ? Math.ceil(minN / step) * step : 0;
    const W = 1000, Ht = 120, y = v => Ht * (yMax - v) / (yMax + yMin), x = i => (i + 0.5) / B * W;
    // area between two edges for the drawn range, split at gaps
    const band = (lo, hi) => {
      let d = '', run = [];
      const flush = () => { if (run.length) { d += 'M' + run.map(i => `${x(i).toFixed(1)},${y(hi(i)).toFixed(1)}`).join('L') + 'L' + run.slice().reverse().map(i => `${x(i).toFixed(1)},${y(lo(i)).toFixed(1)}`).join('L') + 'Z'; run = []; } };
      for (let i = 0; i <= nowI; i++) { if (S[i] == null) flush(); else run.push(i); }
      flush(); return d;
    };
    const line = f => { let d = '', pen = false; for (let i = 0; i <= nowI; i++) { if (S[i] == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(i)).toFixed(1)}`; pen = true; } return d; };
    const sBase = () => 0, sTop = i => vis('solar') ? S[i] : 0;
    const grid = [];
    for (let v = -yMin; v <= yMax; v += step) grid.push(`<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === 0 ? 'z' : ''}"/>`);
    const kw = v => v === 0 ? '0' : String(+(v / 1000).toFixed(2));
    const yl = []; for (let v = -yMin; v <= yMax; v += step) yl.push(`<span style="top:${(y(v) / Ht * 100).toFixed(2)}%">${kw(v)}</span>`);
    const hh = h => `<span style="left:${(h / 24 * 100).toFixed(2)}%">${String(h).padStart(2, '0')}</span>`;
    const fmt = i => { const t = new Date(+day0 + i * 3e5); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
    const pct = i => ((i + 0.5) / B * 100).toFixed(2);
    // inspected point
    const ci = this._spkI != null && this._spkI <= nowI && S[this._spkI] != null ? this._spkI : null;
    const tip = ci == null ? '' : `<div class="spk-cur" style="left:${pct(ci)}%"></div>
      <div class="spk-tip ${ci > B * 0.6 ? 'l' : ''}" style="left:${pct(ci)}%"><b>${ci === nowI ? 'Now' : fmt(ci)}</b>
        <span><i style="background:#fbbf24"></i>Solar ${fmtW(S[ci] + X[ci])}</span><span><i style="background:#60a5fa"></i>Grid ${fmtW(I[ci])}</span>
        <span><i style="background:#34d399"></i>Exported ${fmtW(X[ci])}</span><span><i class="dash"></i>Home ${fmtW(Hm[ci])}</span></div>`;
    const leg = (k, col, name, cls = '') => `<button class="${hide.has(k) ? 'off' : ''}" data-act="spk" data-k="${k}"><i class="${cls}" style="background:${col}"></i>${name}</button>`;
    return `<div class="spk-wrap">
      <div class="spk-y"><i>${yl.map(t => t.replace(/<[^>]+>/g, '')).sort((a, b) => b.length - a.length)[0] || ''}</i>${yl.join('')}</div>
      <div class="spk" data-spk="1">
        <svg viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none">
          <g class="spk-g">${grid.join('')}</g>
          ${[6, 12, 18].map(h => `<line class="spk-v" x1="${h / 24 * W}" x2="${h / 24 * W}" y1="0" y2="${Ht}"/>`).join('')}
          ${vis('solar') ? `<path d="${band(sBase, sTop)}" fill="#fbbf24" fill-opacity=".8"/>` : ''}
          ${vis('import') ? `<path d="${band(sTop, i => sTop(i) + I[i])}" fill="#60a5fa" fill-opacity=".7"/>` : ''}
          ${vis('export') ? `<path d="${band(i => -X[i], sBase)}" fill="#34d399" fill-opacity=".65"/>` : ''}
          ${vis('home') ? `<path d="${line(i => Hm[i])}" fill="none" stroke="#e7ecf6" stroke-width="1.6" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>` : ''}
          <line class="spk-now" x1="${x(nowI)}" x2="${x(nowI)}" y1="0" y2="${Ht}"/>
        </svg>
        ${pk >= 0 && vis('home') ? `<div class="spk-pk" style="left:${pct(pk)}%;top:${(y(Hm[pk]) / Ht * 100).toFixed(2)}%"><em>${fmtW(Hm[pk])}</em></div>` : ''}
        ${tip}
      </div>
      <div class="spk-x">${[0, 6, 12, 18, 24].map(hh).join('')}</div>
    </div>
    <div class="sk-lg">${leg('solar', '#fbbf24', 'Solar')}${leg('import', '#60a5fa', 'Grid')}${leg('export', '#34d399', 'Exported')}${leg('home', 'transparent', 'Home', 'dash')}
      <span>${pk >= 0 ? `Peak ${fmtW(Hm[pk])} · ${fmt(pk)}` : ''}</span></div>`;
  }
  // Today's power chart from the SAME data as HA's Energy dashboard: the grid in / out and solar energy
  // meters' 5-minute statistics (kWh per 5 min × 12 = average kW). The live sensors fill the current step.
  async _loadHistory() {
    if (!this._hass) return;
    try {
      if (this._eprefs === undefined) { try { this._eprefs = await this._hass.callWS({ type: 'energy/get_prefs' }); } catch (e) { this._eprefs = null; } }
      const S = this._eSrc(), end = new Date(), day0 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const ids = [S.gridIn, S.gridOut, S.solar];
      const r = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: day0.toISOString(), end_time: end.toISOString(), statistic_ids: ids, period: '5minute', types: ['change'], units: { energy: 'kWh' } });
      const B = 288, nowI = Math.min(B - 1, Math.floor((end - day0) / 3e5));
      const ser = id => {
        const a = new Array(B).fill(null); let last = -1;
        for (const row of r[id] || []) {
          const t = typeof row.start === 'number' ? row.start : Date.parse(row.start), i = Math.floor((t - day0) / 3e5);
          if (i < 0 || i >= B) continue; const c = row.change || 0;
          a[i] = c < 0 || c > 3 ? 0 : c * 12000; last = Math.max(last, i); // W; >3 kWh in 5 min = meter reset
        }
        for (let i = 0; i <= last; i++) if (a[i] == null) a[i] = 0;  // no row inside the day = nothing counted
        for (let i = last + 1; i <= nowI; i++) a[i] = last >= 0 ? a[last] : null; // steps not compiled yet: hold the last one
        return a;
      };
      const gi = ser(S.gridIn), go = ser(S.gridOut), so = ser(S.solar);
      this._hist = { day0, grid: gi.map((v, i) => v == null || go[i] == null ? null : v - go[i]), solar: so.map(v => v == null ? 0 : v) };
      this._spkPaint();
    } catch (e) { console.warn('sweet-home power chart', e); }
  }
  // the chart appears on the Energy tab (#spark) and in the Power sheet (#spark2)
  _spkPaint() { const h = this._sparkSVG(); for (const id of ['spark', 'spark2']) { const sp = this.$?.(id); if (sp) sp.innerHTML = h; } }
  // drag / hover on the power chart → values at that time
  _spkInput() {
    const R = this.shadowRoot; let hideT = null;
    const at = e => {
      const el = e.target.closest?.('[data-spk]'); if (!el || !this._hist) return false;
      const b = el.getBoundingClientRect(), B = this._hist.grid.length;
      this._spkI = clamp(Math.floor((e.clientX - b.left) / b.width * B), 0, B - 1);
      clearTimeout(hideT); this._spkPaint(); return true;
    };
    const clear = ms => { clearTimeout(hideT); hideT = setTimeout(() => { this._spkI = null; this._spkPaint(); }, ms); };
    R.addEventListener('pointerdown', e => { if (at(e) && e.pointerType !== 'mouse') this._spkTouch = true; });
    R.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || this._spkTouch) { if (!at(e) && e.pointerType === 'mouse' && this._spkI != null) clear(0); } });
    for (const ev of ['pointerup', 'pointercancel']) R.addEventListener(ev, () => { if (this._spkTouch) { this._spkTouch = false; clear(2500); } });
  }

  _rWater() {
    const W = E.water;
    const lvl = clamp(this.n(W.tank) ?? 0, 0, 100);
    const col = lvl < 20 ? '#f43f5e' : lvl < 40 ? '#fbbf24' : '#38bdf8';
    const sw = (id, n, i, sub, id2) => this.s(id) ? `<button class="tile wide ${this.on(id) ? 'on' : ''}" data-act="${i.includes('pump') ? 'pump' : 'toggle'}" data-id="${id}"${id2 ? ` data-id2="${id2}"` : ''}>${ic(i, this.on(id) && i.includes('pump') ? 'pulse' : '')}<span>${n}</span><em class="sub">${sub || (this.on(id) ? 'On' : 'Off')}</em></button>` : '';
    if (W.tank && (!this._tankTr || Date.now() - this._tankTr.at > 5 * 60e3)) setTimeout(() => this._loadTankTrend(), 0);
    return `<div class="ch">${ic('mdi:water')}<h3>Water</h3>${W.tank ? this._tankPill(lvl) : ''}</div>
      <div class="water ${W.tank ? '' : 'notank'}">
        ${!W.tank ? '' : `<div class="tank" data-act="more" data-id="${W.tank}" data-id2="${W.quality}" style="--lvl:${lvl}%;--c:${col}">
          <div class="liquid"><svg class="wave" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V20 H0Z"/></svg></div>
          <div class="tank-lbl"><b>${lvl.toFixed(1)}<small>%</small></b><span>${[W.quality ? `Quality ${this.f(W.quality, 0)}` : '', W.temp ? this.f(W.temp, 0) : ''].filter(Boolean).join(' · ')}</span></div>
        </div>`}
        <div class="wtiles">
          ${W.pumps.map(p => sw(p.id, p.name, 'mdi:water-pump', this.on(p.id) && p.power ? `On · ${this.f(p.power, 0)}` : p.info && this.ok(p.info) ? this.v(p.info) : null, p.power || p.info)).join('')}
        </div>
      </div>
      ${W.entities.length ? `<div class="wents">${W.entities.map(e => this._entRow(e.id, e)).join('')}</div>` : ''}`;
  }

  // Water tag: instead of repeating the level, the trend over the last 2 h and the time left —
  // "↓ 1.1%/h · empty in ~28 h" (amber < 12 h, red < 4 h), "↑ 4%/h · full in 3 h", or "Steady".
  async _loadTankTrend() {
    if (this._tankBusy || !this._hass) return; this._tankBusy = true;
    const id = E.water.tank, now = Date.now(), win = 120 * 60e3;
    try {
      const r = await this._hass.callWS({ type: 'history/history_during_period', start_time: new Date(now - win).toISOString(), end_time: new Date(now).toISOString(), entity_ids: [id], minimal_response: true, no_attributes: true, significant_changes_only: false });
      const pts = (r[id] || []).map(p => [((p.lu ?? p.lc) * 1000), parseFloat(p.s)]).filter(p => !isNaN(p[1]));
      const cur = this.n(id); if (cur != null) pts.push([now, cur]);
      let rate = null;
      if (pts.length >= 2) { // least-squares slope, % per hour
        const t0 = pts[0][0], xs = pts.map(p => (p[0] - t0) / 36e5), ys = pts.map(p => p[1]), n = xs.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
        const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
        if (sxx > 0.01) rate = sxy / sxx;
      }
      this._tankTr = { at: Date.now(), rate };
    } catch (e) { this._tankTr = { at: Date.now(), rate: null }; }
    this._tankBusy = false; this._rerender('water');
  }
  _tankPill(lvl) {
    const r = this._tankTr?.rate, dur = h => h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.round(h)} h` : `${Math.max(1, Math.round(h * 60))} min`;
    const rt = v => `${Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}%/h`;
    let txt, col, icon;
    if (r == null) { txt = 'Trend…'; col = '#94a3b8'; icon = 'mdi:chart-line-variant'; }
    else if (Math.abs(r) < 0.2) { txt = 'Steady'; col = '#94a3b8'; icon = 'mdi:minus'; }
    else if (r < 0) { const h = lvl / -r; txt = `${rt(r)} · empty in ~${dur(h)}`; col = h < 4 ? '#f43f5e' : h < 12 ? '#fbbf24' : '#38bdf8'; icon = 'mdi:arrow-down-bold'; }
    else { const h = (100 - lvl) / r; txt = `${rt(r)} · full in ~${dur(h)}`; col = '#34d399'; icon = 'mdi:arrow-up-bold'; }
    return `<span class="pill tankpill" style="--c:${col}" data-act="more" data-id="${E.water.tank}">${ic(icon)}${txt}</span>`;
  }
  _rCar() {
    const C = E.car; const ch = this.on(C.charging);
    const p = this.n(C.power) ?? 0;
    const soc = this.n(C.battery), rng = C.range && this.ok(C.range) ? this.f(C.range, 0) : '';
    const color = Array.isArray(C.color) ? '#' + C.color.map(v => Number(v).toString(16).padStart(2, '0')).join('') : C.color;
    const kpi = (id, id2, label, d) => (id || id2 ? `<div data-act="more" data-id="${id || id2}"${id && id2 ? ` data-id2="${id2}"` : ''}><span>${tr(label)}</span><b>${this.f(id, d)}</b><em>${id2 ? this.f(id2, 2) : ''}</em></div>` : '');
    const kpis = [kpi(C.perCharge, C.costCharge, 'This charge', 1), kpi(C.month, C.costMonth, 'This month', 0), kpi(C.year, C.costYear, 'This year', 0)].filter(Boolean);
    return `<div class="ch">${ic('mdi:car-electric')}<h3>${esc(C.name || tr('Car'))}</h3><span class="pill" style="--c:${ch ? '#34d399' : '#94a3b8'}" ${C.parking ? `data-act="more" data-id="${C.parking}"` : ''}>${ch ? tr('Charging') : esc(tr(pretty(this.v(C.parking) || 'Idle')))}</span></div>
      <div class="car ${ch ? 'charging' : ''}">
        <div class="carviz" data-act="more" data-id="${C.power || C.charging}"${C.time ? ` data-id2="${C.time}"` : ''}>
          ${CAR_SVG(ch, color)}
          <div class="cpow"><b>${fmtW(p)}</b><span>${ch ? tr('charging') + (C.time && this.ok(C.time) ? ' · ' + esc(this.v(C.time)) : '') : tr('charger idle')}</span>
            ${soc != null ? `<div class="csoc" data-act="more" data-id="${C.battery}"${C.range ? ` data-id2="${C.range}"` : ''}><div class="bar"><i style="width:${clamp(soc, 0, 100)}%;background:${soc < 20 ? '#f43f5e' : soc < 40 ? '#fbbf24' : '#34d399'}"></i></div><em>${Math.round(soc)}%${rng ? ` · ${rng}` : ''}</em></div>` : rng ? `<div class="csoc"><em>${rng}</em></div>` : ''}
          </div>
        </div>
        ${kpis.length ? `<div class="kpis">${kpis.join('')}</div>` : ''}
      </div>`;
  }

  _rCams() {
    const tiles = E.cameras.map(c => {
      const person = this.on(c.person), car = this.on(c.car), mo = this.on(c.motion), dOpen = c.door && /^open$/i.test(this.v(c.door) || '');
      const face = this.ok(c.face) ? this.v(c.face) : null, plate = this.ok(c.plate) ? this.v(c.plate) : null;
      return `<div class="cam" data-act="cam" data-id="${c.id}"${(c.faceSet && c.face) || c.person ? ` data-id2="${(c.faceSet && c.face) || c.person}"` : ''}>
        <img data-cam="${c.id}" alt="">
        <div class="camlive" data-live="${c.id}"></div>
        <div class="cam-ov">
          <div class="cam-top"><span class="live ${mo ? 'mo' : ''}"><i></i>${mo ? 'MOTION' : 'LIVE'}</span>
            <span class="tags">${person ? `<i class="tag p">${ic('mdi:walk')}Person</i>` : ''}${car ? `<i class="tag c">${ic('mdi:car')}Car</i>` : ''}${dOpen ? `<i class="tag d">${ic('mdi:gate-open')}Gate Open</i>` : ''}</span></div>
          <div class="cam-bot"><b>${esc(c.name)}</b>
            ${face ? `<span>${ic('mdi:face-recognition')}${esc(face)}</span>` : ''}${plate ? `<span>${ic('mdi:card-text')}${esc(plate)}</span>` : ''}
            ${c.relay && this.s(c.relay) ? `<button class="relay" data-act="relay" data-id="${c.relay}">${ic('mdi:gate-open')}${c.relay === E.gate.relay ? 'Open Gate' : 'Open'}</button>` : ''}</div>
        </div></div>`;
    }).join('');
    // face recognition badge: panels.security.face, else the cameras' face sensors (Frigate); the newest name, or
    // "No face" while none has one (unknown / None / "No face"). No badge when nothing does face recognition.
    const fids = E.face ? [E.face] : [...new Set(E.cameras.map(c => c.face).filter(id => id && this.s(id)))];
    const named = fids.filter(id => this.ok(id) && !/^no.?faces?$/i.test(this.v(id))).sort((a, b) => new Date(this.s(b).last_changed) - new Date(this.s(a).last_changed))[0];
    const face = fids.length ? `<span class="pill tankpill"${named ? ' style="--c:#2dd4bf"' : ''} data-act="more" data-id="${named || fids[0]}">${ic(named ? 'mdi:face-recognition' : 'mdi:face-man-outline')}${esc(named ? this.v(named) : tr('No face'))}</span>` : '';
    return `<div class="ch">${ic('mdi:cctv')}<h3>Cameras</h3>${face}</div><div class="camgrid">${tiles}</div>`;
  }
  // Live view: HA's own picture-entity card in live mode (WebRTC / HLS, whatever the camera offers) inside each tile.
  // Only while the Security tab is open and the page is visible; snapshots stay underneath as a placeholder.
  async _mountCams() {
    if (!this._hass || !this.$ || this._tab !== 'security' || document.hidden) return this._unmountCams();
    for (const box of this.shadowRoot.querySelectorAll('.camlive')) {
      if (box.firstChild || box._pending) continue;
      const id = box.dataset.live; box._pending = true;
      try {
        let el;
        const helpers = await (this._helpers ||= window.loadCardHelpers ? window.loadCardHelpers() : Promise.resolve(null));
        if (helpers) {
          el = helpers.createCardElement({ type: 'picture-entity', entity: id, camera_view: 'live', show_name: false, show_state: false, aspect_ratio: '16:9', fit_mode: 'cover', tap_action: { action: 'none' }, hold_action: { action: 'none' } });
          el.hass = this._hass;
        } else { // fallback: MJPEG stream through HA's camera proxy
          const tok = this.s(id)?.attributes.access_token; if (!tok) continue;
          el = document.createElement('img'); el.src = `/api/camera_proxy_stream/${id}?token=${tok}`;
        }
        if (this._tab === 'security' && !document.hidden && !box.firstChild && box.isConnected) box.appendChild(el);
      } catch (err) { console.warn('sweet-home live camera', id, err); } finally { box._pending = false; }
    }
  }
  _unmountCams() { this.shadowRoot?.querySelectorAll('.camlive').forEach(b => b.replaceChildren()); }
  _refreshCams(force) {
    if (!this._hass || !this.$ || this._tab !== 'security' || (document.hidden && !force)) return;
    this._mountCams();
    this.shadowRoot.querySelectorAll('img[data-cam]').forEach(img => {
      const pic = this.s(img.dataset.cam)?.attributes.entity_picture; if (!pic) return;
      const live = img.parentElement?.querySelector('.camlive'); // snapshot hidden under a live view: refresh it only every 20 s
      if (!force && live?.firstChild && img._at && Date.now() - img._at < 20e3) return;
      img._at = Date.now();
      const url = `${pic}${pic.includes('?') ? '&' : '?'}t=${Date.now()}`;
      if (force && img._last) { img.src = img._last; }
      const pre = new Image(); pre.onload = () => { img.src = url; img._last = url; img.classList.add('ok'); }; pre.src = url;
    });
  }

  _rMedia() {
    const M = E.media; const tv = this.s(M.tv);
    const playing = tv?.state === 'playing';
    const a = tv?.attributes || {};
    const pic = a.entity_picture;
    const toSec = s => { const m = /^(\d+):(\d+):(\d+)$/.exec(s || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null; };
    const used = toSec(this.v(M.ytTimer)), lim = toSec(this.v(M.ytLimit));
    const pct = used != null && lim ? clamp(used / lim * 100, 0, 100) : 0;
    const q = M.qbt;
    return `<div class="ch">${ic('mdi:television-classic')}<h3>Media</h3><span class="pill" style="--c:${playing ? '#f472b6' : '#94a3b8'}">${esc(tv?.state || '—')}</span></div>
      <div class="np ${playing ? 'playing' : ''}" data-act="more" data-id="${M.tv}">
        <div class="art">${pic ? `<img src="${esc(pic)}">` : ic(a.app_name === 'YouTube' ? 'mdi:youtube' : 'mdi:television-play')}</div>
        <div class="npt"><b>${esc(a.media_title || a.app_name || tc(a.friendly_name || 'TV'))}</b><span>${esc([a.media_artist, a.app_name].filter(x => x && x !== (a.media_title || a.app_name)).join(' · ') || tc(a.friendly_name || 'TV'))}</span>
          <div class="eq"><i></i><i></i><i></i><i></i></div></div>
      </div>
      <div class="mctl">
        <button class="ibtn" data-act="media" data-svc="media_previous_track" data-id="${M.tv}">${ic('mdi:skip-previous')}</button>
        <button class="ibtn big" data-act="media" data-svc="media_play_pause" data-id="${M.tv}">${ic(playing ? 'mdi:pause' : 'mdi:play')}</button>
        <button class="ibtn" data-act="media" data-svc="media_next_track" data-id="${M.tv}">${ic('mdi:skip-next')}</button>
        <button class="ibtn" data-act="media" data-svc="volume_down" data-id="${M.tv}" aria-label="Volume down">${ic('mdi:volume-minus')}</button>
        <button class="ibtn" data-act="media" data-svc="volume_up" data-id="${M.tv}" aria-label="Volume up">${ic('mdi:volume-plus')}</button>
      </div>
      ${a.volume_level != null ? this.slider(M.tv, 'vol', Math.max(1, Math.round(a.volume_level * 100)), '#f472b6') : ''}
      <div class="picks col">${this.pickChip(M.tv, 'source', 'Source', 'mdi:import')}</div>
      ${!M.ytTimer ? '' : `<div class="yt">
        <div class="ytl" data-act="more" data-id="${M.ytTimer}" data-id2="${M.ytLimit}">${ic('mdi:youtube')}<span>Watched today</span><b>${esc(this.v(M.ytTimer) || '—')}</b></div>
        <div class="bar"><i style="width:${pct}%;background:${pct > 90 ? '#f43f5e' : pct > 70 ? '#fbbf24' : '#f472b6'}"></i></div>
        <div class="picks col">${this.pickChip(M.ytSelect, 'select', 'Daily limit', 'mdi:timer-sand')}</div>
        <div class="tiles two">
          <button class="tile ${this.on(M.ytBlock) ? 'on red' : ''}" data-act="toggle" data-id="${M.ytBlock}">${ic('mdi:cancel')}<span>Block</span></button>
          ${M.ytForce ? `<button class="tile ${this.on(M.ytForce) ? 'on' : ''}" data-act="toggle" data-id="${M.ytForce}">${ic('mdi:lock-open-variant')}<span>Force Unblock</span></button>` : ''}
        </div>
      </div>`}
`;
  }

  // ---------- Media Server card: Jellyfin now watching, downloads, coming up, library ----------
  _jfPlayers() {
    const ents = this._hass?.entities || {};
    return Object.keys(ents).filter(id => id.startsWith('media_player.') && ents[id].platform === 'jellyfin');
  }
  async _loadMCal() {
    if (this._mcalBusy) return; this._mcalBusy = true;
    try {
      const S = E.mserver, start = new Date(), end = new Date(Date.now() + 14 * 864e5);
      const q = `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const get = id => this.s(id) ? this._hass.callApi('GET', `calendars/${id}${q}`).catch(() => []) : Promise.resolve([]);
      const [tv, mv] = await Promise.all([get(S.sonarr.cal), get(S.radarr.cal)]);
      const when = ev => new Date(ev.start?.dateTime || (ev.start?.date + 'T00:00:00'));
      const items = [
        ...tv.map(ev => { const [show, ep, ...t] = String(ev.summary || '').split(' - '); return { k: 'tv', t: when(ev), show: show || ev.summary, ep: ep || '', title: t.join(' - ') }; }),
        ...mv.map(ev => ({ k: 'mv', t: when(ev), show: ev.summary, ep: '', title: '', rel: ev.release_type || '', allDay: !ev.start?.dateTime, desc: ev.description || '' })),
      ].filter(x => !isNaN(x.t) && x.t >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a.t - b.t); // HA can hand back older all-day releases
      this._mcal = { at: Date.now(), items };
    } catch (e) { this._mcal = { at: Date.now(), items: [] }; }
    this._mcalBusy = false; this._rerender('mserver');
    this._loadMMeta();
  }
  // posters / details for Coming Up from HA's own Sonarr / Radarr integrations (they hold the API keys):
  // sonarr.get_upcoming (series poster + fanart, episode overview, network, runtime) and radarr.get_movies (TMDB poster)
  async _loadMMeta() {
    if (this._mmetaBusy || !this._hass) return; this._mmetaBusy = true;
    const entry = async d => {
      const c = this._mEntry || (this._mEntry = {}); if (d in c) return c[d];
      try { const r = await this._hass.callWS({ type: 'config_entries/get', domain: d }); c[d] = (r || []).find(e => e.state === 'loaded')?.entry_id || null; } catch (e) { c[d] = null; }
      return c[d];
    };
    const svc = async (d, sv, data) => { const id = await entry(d); if (!id) return null; try { const r = await this._hass.callService(d, sv, { entry_id: id, ...data }, undefined, false, true); return r?.response || null; } catch (e) { return null; } };
    const [up, mv] = await Promise.all([svc('sonarr', 'get_upcoming', { days: 15 }), svc('radarr', 'get_movies', {})]);
    this._mmeta = { eps: up?.episodes || {}, movies: mv?.movies || {} };
    this._mmetaBusy = false; this._rerender('mserver'); if (this._info?.startsWith('mup:')) this._renderInfo();
  }
  _mupMeta(x) {
    const M = this._mmeta; if (!M || !x) return null;
    if (x.k === 'tv') {
      const eps = Object.values(M.eps), lc = String(x.show).toLowerCase();
      const ep = M.eps[`${x.show} ${x.ep}`] || eps.find(e => String(e.series_title).toLowerCase() === lc && e.episode_identifier === x.ep);
      const any = ep || eps.find(e => String(e.series_title).toLowerCase() === lc);
      return any ? { poster: any.images?.poster, fanart: any.images?.fanart, overview: ep?.overview, network: any.network, runtime: ep?.runtime || any.runtime, has: ep?.has_file, year: any.series_year, status: any.series_status } : null;
    }
    const lc = String(x.show).toLowerCase(), mv = M.movies[x.show] || Object.values(M.movies).find(m => String(m.title).toLowerCase() === lc);
    return mv ? { poster: mv.images?.poster, fanart: mv.images?.fanart, overview: x.desc, has: mv.has_file, year: mv.year, status: mv.status } : (x.desc ? { overview: x.desc } : null);
  }
  // smaller TMDB sizes for thumbnails (TVDB has one size)
  _img(u, w) { return u ? String(u).replace('/t/p/original/', `/t/p/w${w}/`) : ''; }
  _mupHTML(head) {
    const i = Number(this._info.slice(4)), x = this._mcal?.items?.[i];
    if (!x) return head('mdi:calendar', 'Coming Up', '') + '<div class="wxwait">Not found</div>';
    const lang = this._hass?.locale?.language || 'en', m = this._mupMeta(x) || {};
    const REL = { inCinemas: 'In cinemas', digitalRelease: 'Digital release', physicalRelease: 'Blu-ray release' };
    const when = x.t.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }) + (x.k === 'tv' ? ' · ' + x.t.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) : '');
    const chips = [x.k === 'mv' ? REL[x.rel] || 'Movie' : x.ep, m.network, m.year, m.runtime ? `${m.runtime} min` : '', m.has ? '✓ Downloaded' : x.k === 'tv' || m.status ? 'Not downloaded yet' : ''].filter(Boolean);
    const sub = x.k === 'tv' && x.title && x.title !== 'TBA' ? x.title : '';
    return `<div class="sh-h mup-h"><div></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="muph">${m.fanart ? `<div class="mupbg" style="background-image:url('${esc(this._img(m.fanart, 780))}')"></div>` : ''}
        <div class="muppo jfimg">${ic(x.k === 'tv' ? 'mdi:television-classic' : 'mdi:movie-open')}${m.poster ? `<img src="${esc(this._img(m.poster, 500))}" alt="">` : ''}</div>
        <div class="mupt"><b>${esc(x.show)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<em>${ic('mdi:calendar-clock')}${esc(when)}</em></div></div>
      <div class="mupchips">${chips.map(c => `<span>${esc(String(c))}</span>`).join('')}</div>
      ${m.overview ? `<p class="mupov">${esc(m.overview)}</p>` : (this._mmeta ? `<p class="mupov mu">No description yet.</p>` : `<p class="mupov">${skl('100%', 10)}${skl('92%', 10, 'margin-top:6px')}${skl('60%', 10, 'margin-top:6px')}</p>`)}`;
  }
  _rMServer() {
    const S = E.mserver, J = S.jellyfin, Q = S.qbt, SO = S.sonarr, RA = S.radarr, lang = this._hass?.locale?.language || 'en';
    if (!this._mcal || Date.now() - this._mcal.at > 30 * 60e3) setTimeout(() => this._loadMCal(), 0);
    // --- now watching: jellyfin players that are playing / paused
    const sessions = this._jfPlayers().map(id => [id, this.s(id)]).filter(([, st]) => st && ['playing', 'paused'].includes(st.state) && st.attributes.media_title);
    const watch = sessions.map(([id, st]) => {
      const a = st.attributes, play = st.state === 'playing';
      const dur = +a.media_duration || 0;
      let pos = +a.media_position || 0; if (play && a.media_position_updated_at) pos += (Date.now() - new Date(a.media_position_updated_at)) / 1000;
      const pct = dur ? clamp(pos / dur * 100, 0, 100) : 0, left = dur ? Math.max(0, Math.round((dur - pos) / 60)) : null;
      const series = a.media_series_title, se = a.media_season != null && a.media_episode != null ? `S${String(a.media_season).padStart(2, '0')}E${String(a.media_episode).padStart(2, '0')}` : '';
      const title = series || a.media_title, sub = series ? [se, a.media_title].filter(Boolean).join(' · ') : (a.media_content_type === 'movie' ? 'Movie' : tc(pretty(a.media_content_type || '')));
      return `<div class="jfs ${play ? 'play' : ''}" data-act="more" data-id="${id}">
        <div class="jfp">${a.entity_picture ? `<img src="${esc(a.entity_picture)}" alt="" loading="lazy">` : ic(series ? 'mdi:television-classic' : 'mdi:movie-open')}</div>
        <div class="jfi"><b>${esc(title)}</b><span>${esc(sub)}</span>
          <em>${ic(play ? 'mdi:play' : 'mdi:pause')}${esc(tc(a.friendly_name || id))}${left != null ? ` · ${left} min left` : ''}</em>
          <div class="jfbar"><i style="width:${pct.toFixed(1)}%"></i></div></div></div>`;
    }).join('');
    const clients = this.n(J.clients);
    // --- downloads
    const down = this.n(Q.down) ?? 0, up = this.n(Q.up) ?? 0, qst = this.v(Q.status), alt = this.on(Q.alt), err = this.n(Q.errored) ?? 0;
    const qOK = this.v(Q.conn) === 'connected';
    const queue = [];
    const sq = this.s(SO.queue)?.attributes || {};
    for (const [k, v] of Object.entries(sq)) if (!['unit_of_measurement', 'friendly_name', 'icon', 'state_class'].includes(k)) {
      const pct = parseFloat(v); queue.push(`<div class="mqr" data-act="more" data-id="${SO.queue}">${ic('mdi:television-classic')}<span>${esc(k)}</span><b>${isNaN(pct) ? esc(String(v)) : pct.toFixed(0) + '%'}</b><div class="jfbar"><i style="width:${isNaN(pct) ? 0 : pct}%"></i></div></div>`);
    }
    const rq = this.n(RA.queue) ?? 0;
    if (rq > 0) queue.push(`<div class="mqr" data-act="more" data-id="${RA.queue}">${ic('mdi:movie-open')}<span>${rq} movie${rq > 1 ? 's' : ''} in the Radarr queue</span><b></b></div>`);
    // --- coming up
    const items = (this._mcal?.items || []).slice(0, 6);
    const day = t => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - d0) / 864e5);
      return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 7 ? t.toLocaleDateString(lang, { weekday: 'long' }) : t.toLocaleDateString(lang, { day: 'numeric', month: 'short' }); };
    const REL = { inCinemas: 'In cinemas', digitalRelease: 'Digital', physicalRelease: 'Blu-ray' };
    const upcoming = items.map((x, n) => `<div class="mup m${x.k}" data-act="info" data-kind="mup:${n}" data-id="${x.k === 'tv' ? SO.cal : RA.cal}">
        <div class="mud"><b>${esc(day(x.t))}</b>${x.k === 'tv' ? `<span>${esc(x.t.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }))}</span>` : ''}</div>
        ${(() => { const po = this._mupMeta(x)?.poster; return po ? `<div class="mupth"><img src="${esc(this._img(po, 154))}" alt="" loading="lazy"></div>` : ic(x.k === 'tv' ? 'mdi:television-classic' : 'mdi:movie-open'); })()}
        <div class="mut"><b>${esc(x.show)}</b><span>${x.k === 'tv' ? esc([x.ep, x.title && x.title !== 'TBA' ? x.title : ''].filter(Boolean).join(' · ')) : esc(REL[x.rel] || 'Movie')}</span></div></div>`).join('');
    // --- library + disks
    const disks = [], byDisk = new Map();
    for (const [k, v] of Object.entries(this.s(SO.disk)?.attributes || {})) {
      const m = String(v).match(/^([\d.]+)\/([\d.]+)\s*([A-Za-z]+)/); if (!m || k === '/') continue;
      const key = m[1] + '/' + m[2], nm = k.replace(/^\//, ''), cur = byDisk.get(key);
      if (!cur || nm.length < cur.nm.length) byDisk.set(key, { nm, free: +m[1], tot: +m[2] });
    }
    for (const { nm: k, free, tot } of byDisk.values()) {
      const used = clamp(100 - free / tot * 100, 0, 100);
      const tb = x => x >= 1000 ? `${(x / 1000).toFixed(1)} TB` : `${Math.round(x)} GB`;
      disks.push(`<div class="mdk" data-act="more" data-id="${SO.disk}">${ic('mdi:harddisk')}<span>${esc(tc(k))}</span><div class="bar"><i style="width:${used.toFixed(1)}%;background:${used > 90 ? '#f43f5e' : used > 75 ? '#fbbf24' : '#a78bfa'}"></i></div><b>${tb(free)} free</b></div>`);
    }
    const pill = sessions.length ? [`${sessions.length} watching`, '#a78bfa'] : down > 0.05 ? ['Downloading', '#60a5fa'] : ['Idle', '#94a3b8'];
    return `<div class="ch">${ic('mdi:server-network')}<h3>Media Server</h3><span class="pill" style="--c:${pill[1]}">${pill[0]}</span></div>
      <div class="dsec">Now Watching${clients != null ? ` · ${clients} client${clients === 1 ? '' : 's'}` : ''}</div>
      ${watch || `<div class="mempty">${ic('mdi:sofa-outline')}Nobody is watching on Jellyfin</div>`}
      <div class="dsec">Library</div>
      <div class="mlib">
        <div class="go" data-act="info" data-kind="jflib:shows" data-id="${SO.shows}">${ic('mdi:television-classic')}<b>${this.v(SO.shows) ?? '—'}</b><span>Shows ›</span></div>
        <div class="go" data-act="info" data-kind="jflib:movies" data-id="${RA.movies}">${ic('mdi:movie-open')}<b>${this.v(RA.movies) ?? '—'}</b><span>Movies ›</span></div>
        <div data-act="info" data-kind="wanted" data-id="${SO.wanted}" class="go ${(this.n(SO.wanted) ?? 0) > 0 ? 'warn' : ''}">${ic('mdi:magnify')}<b>${this.v(SO.wanted) ?? '—'}</b><span>Wanted ›</span></div>
      </div>
      <div class="dsec">Coming Up</div>
      ${upcoming || (this._mcal ? `<div class="mempty">${ic('mdi:calendar-blank')}Nothing in the next two weeks</div>`
        : '<div class="mupskel">' + Array.from({ length: 6 }, () => `<div class="mup">${'<div class="mud">' + skl('70%', 12) + skl('45%', 9, 'margin-top:5px') + '</div>'}<div class="mupth skl"></div><div class="mut">${skl('80%', 13)}${skl('50%', 10, 'margin-top:6px')}</div></div>`).join('') + skPill('Loading the calendar…') + '</div>')}
      <div class="dsec">Downloads</div>
      <div class="mdl">
        <div data-act="more" data-id="${Q.down}" class="${down > 0.05 ? 'act' : ''}">${ic('mdi:arrow-down-bold')}<b>${down.toFixed(1)}<small>MB/s</small></b><span>Download</span></div>
        <div data-act="more" data-id="${Q.up}" class="${up > 0.05 ? 'act up' : ''}">${ic('mdi:arrow-up-bold')}<b>${up.toFixed(1)}<small>MB/s</small></b><span>Upload</span></div>
        <div data-act="more" data-id="${Q.active}" data-id2="${Q.all}">${ic(err ? 'mdi:alert-circle' : 'mdi:magnet')}<b>${this.v(Q.active) ?? '—'}<small>/ ${this.v(Q.all) ?? '—'}</small></b><span>${err ? `${err} errored` : esc(tc(pretty(qst || 'Torrents')))}</span></div>
        <button class="${alt ? 'on' : ''}" data-act="toggle" data-id="${Q.alt}">${ic(alt ? 'mdi:speedometer-slow' : 'mdi:speedometer')}<b>${alt ? 'Slow' : 'Full'}</b><span>Speed limit</span></button>
      </div>
      ${queue.length ? `<div class="mq">${queue.join('')}</div>` : ''}
      ${disks.length ? `<div class="dsec">Storage</div><div class="mdks">${disks.join('')}</div>` : ''}`;
  }

  _rTvLight() {
    const T = E.tvLight; const st = this.s(T.light); const on = st?.state === 'on';
    const dim = st && (st.attributes.supported_color_modes || []).some(m => m !== 'onoff');
    const pct = st?.attributes.brightness ? Math.max(1, Math.round(st.attributes.brightness / 2.55)) : 100;
    const echoes = E.media.echoes.filter(e => this.s(e)).map(e => {
      const es = this.s(e); const vol = es.attributes.volume_level;
      return `<div class="echo"><div class="mini" data-act="more" data-id="${e}">${ic('mdi:speaker')}<span>${esc(tc(es.attributes.friendly_name))}</span><b>${esc(pretty(es.state))}</b></div>
        ${vol != null ? this.slider(e, 'vol', Math.max(1, Math.round(vol * 100)), '#60a5fa') : ''}</div>`;
    }).join('');
    return `<div class="ch">${ic('mdi:television-ambient-light')}<h3>${E.tvLight.light ? 'TV Light &amp; Speakers' : 'Speakers'}</h3><span class="pill" style="--c:${on ? '#fbbf24' : '#94a3b8'}">${on ? 'Light on' : 'Light off'}</span></div>
      ${st ? `<div class="lwrap ${on ? 'on' : ''}"><button class="lrow ${on ? 'on' : ''}" data-act="toggle" data-id="${T.light}">${ic(on ? 'mdi:led-strip-variant' : 'mdi:led-strip-variant-off')}<span>TV Backlight</span><b>${on ? 'On' : 'Off'}</b></button>
        ${on && dim ? this.slider(T.light, 'bright', pct, '#fbbf24') : ''}</div>` : ''}
      <div class="picks col">${T.selects.map(([id, n, i]) => this.pickChip(id, 'select', n, i)).join('')}${on ? this.pickChip(T.light, 'effect', 'Effect', 'mdi:auto-fix') : ''}</div>
      ${echoes ? `<div class="dsec">Speakers</div>${echoes}` : ''}`;
  }

  _rLab() {
    const L = E.lab;
    const ring = (id, label, col, id2, dt) => {
      const v = clamp(this.n(id) ?? 0, 0, 100); const C = 2 * Math.PI * 26;
      return `<div class="ring" data-act="more" data-id="${id}"${id2 ? ` data-id2="${id2}"` : ''}${dt ? ` data-dt="${dt}"` : ''}><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="rb"/><circle cx="32" cy="32" r="26" class="rf" style="stroke:${col};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - v / 100)}"/></svg><b>${v.toFixed(0)}<small>%</small></b><span>${label}</span></div>`;
    };
    const h = this._hass;
    // a guest can have entities under two ids (renamed in Proxmox): read status / CPU / RAM from whichever key has them
    const row = (keys, n, i, gid) => {
      keys = [].concat(keys);
      const pick = suf => keys.map(k => `sensor.${k}_${suf}`).find(id => h.states[id] && !BAD.includes(h.states[id].state));
      const stId = pick('status'), up = stId ? this.v(stId) === 'running' : keys.some(k => this.on(`binary_sensor.${k}_status`));
      const cpuId = pick('cpu_used'), memId = pick('memory_used_percentage'), cpu = cpuId ? this.n(cpuId) : null, mem = memId ? this.n(memId) : null;
      const id1 = cpuId || stId || `binary_sensor.${keys[0]}_status`;
      const grip = this._editing && this._hass?.user?.is_admin ? `<b class="vmg" data-act="labgrip" title="${tr('Drag to reorder')}" aria-label="${tr('Drag to reorder')}">${ic('mdi:drag')}</b>` : ic(i);
      return `<div class="vm ${up ? '' : 'off'}" data-act="more" data-id="${id1}" data-gid="${esc(gid)}"${memId ? ` data-id2="${memId}"` : ''}>${grip}<span>${esc(n)}</span><i class="dot ${up ? 'green' : 'red'}"></i>${up ? `<em>CPU ${cpu != null ? cpu.toFixed(1) : '—'}%</em><em>RAM ${mem != null ? mem.toFixed(0) : '—'}%</em>` : '<em></em><em>Stopped</em>'}</div>`;
    };
    // every other Proxmox guest behind "Show more": running ones first, busiest memory first, stopped ones last
    // group every guest key by its Proxmox id; the pinned ones (by id) are left out
    const byId = new Map();
    for (const g of this._labGuestIds()) { const gi = guestInfo(h.states, g), k = gi.id || g, e = byId.get(k); if (!e) byId.set(k, { keys: [g], gi }); else { e.keys.push(g); if (h.states[`sensor.${g}_status`]) e.gi = gi; } }
    const pinnedIds = new Set(L.guests.map(g => guestInfo(h.states, g[0]).id || g[0]));
    const others = [...byId.entries()].filter(([k]) => !pinnedIds.has(k)).map(([, e]) => {
      const st = e.keys.map(k => this.v(`sensor.${k}_status`)).find(v => v && !BAD.includes(v)), up = st ? st === 'running' : e.keys.some(k => this.on(`binary_sensor.${k}_status`));
      const mem = e.keys.map(k => this.n(`sensor.${k}_memory_used_percentage`)).find(v => v != null) ?? -1;
      return { ...e, up, mem };
    }).sort((a, b) => (b.up - a.up) || (b.mem - a.mem) || a.gi.name.localeCompare(b.gi.name));
    // one list: pinned guests first, then the others; an order set by dragging the rows (panels.homelab.order, Proxmox
    // ids) comes before both, guests it doesn't name keep their place after it. The first rows are shown (as many as
    // are pinned, else 5), the rest behind "Show more".
    let list = [
      ...L.guests.map(([k, n, i]) => { const gi = guestInfo(h.states, k); return { gid: String(gi.id || k), keys: [k], name: n || gi.name, icon: i || gi.icon }; }),
      ...others.map(o => ({ gid: String(o.gi.id || o.keys[0]), keys: o.keys, name: o.gi.name, icon: o.gi.icon })),
    ];
    if (L.order.length) { const at = g => { const i = L.order.indexOf(g.gid); return i < 0 ? Infinity : i; }; list = list.map((g, i) => [g, i]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(x => x[0]); }
    this._labAll = list.map(g => g.gid);
    const shown = L.guests.length || 5, head = list.slice(0, shown), rest = list.slice(shown);
    const edit = this._editing && h.user?.is_admin;
    const more = head.map(g => row(g.keys, g.name, g.icon, g.gid)).join('') + (rest.length ? (this._labMore ? rest.map(g => row(g.keys, g.name, g.icon, g.gid)).join('') : '')
      + `<button class="vmmore" data-act="labmore">${this._labMore ? 'Show less' : `Show more · ${rest.length} servers`}${ic(this._labMore ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>` : '')
      + (edit && L.order.length ? `<button class="vmmore edit-only" data-act="labreset">${ic('mdi:sort')}${tr('Reset the order')}</button>` : '');
    const upd = this.n(L.updates);
    return `<div class="ch">${ic('mdi:server')}<h3>Home Lab</h3><span class="pill" style="--c:${this.on(L.status) ? '#34d399' : '#f43f5e'}">${this.on(L.status) ? 'Online' : 'Offline'}</span></div>
      <div class="rings r4">${ring(L.cpu, 'CPU', '#22d3ee')}${ring(L.mem, 'Memory', '#a78bfa')}${ring(L.disk, 'Disk', '#fbbf24')}${ring(L.swap, 'Swap', '#f472b6', L.swapUsed, 'swap')}</div>
      <div class="stats3 ${L.temp ? 's4' : ''}">
        ${L.temp ? `<div data-act="more" data-id="${L.temp}">${ic('mdi:thermometer')}<b>${this.f(L.temp, 0)}</b></div>` : ''}
        <div data-act="more" data-id="${L.cts}">${ic('mdi:docker')}<b>${esc(this.v(L.cts) || '—')}</b><span>containers</span></div>
        <div data-act="more" data-id="${L.vms}">${ic('mdi:monitor-multiple')}<b>${esc(this.v(L.vms) || '—')}</b><span>VMs</span></div>
        <div data-act="more" data-id="${L.updates}" data-id2="${L.update}"${upd > 0 ? ' style="color:#fbbf24"' : ''}>${ic('mdi:package-up')}<b>${upd != null ? upd.toFixed(0) : '—'}</b><span>updates</span></div>
      </div>
      <div class="vms">${more}</div>`;
  }
  // Home Lab rows: while the dashboard is edited, drag a row by its grip to move it; the new order is saved in the card's
  // config (panels.homelab.order, every guest's Proxmox id), through the card editor when it is open.
  _labDragSetup(R) {
    R.addEventListener('pointerdown', e => {
      const g = e.target.closest?.('[data-act="labgrip"]'); if (!g || !this._editing || e.button > 0) return;
      const row = g.closest('.vm'), box = row?.parentElement; if (!box) return;
      e.preventDefault(); e.stopPropagation();
      const rows = () => [...box.querySelectorAll('.vm[data-gid]')], start = rows().map(r => r.dataset.gid);
      this._labDrag = true; row.classList.add('drag'); this.haptic('medium');
      // followed on the window: moving the row in the page would drop a pointer capture on its grip
      const pid = e.pointerId;
      const move = ev => {
        if (ev.pointerId !== pid) return; ev.preventDefault();
        const others = rows().filter(r => r !== row);
        const over = others.find(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
        const ref = over || others[others.length - 1]?.nextElementSibling || null; // past the last row: before "Show more"
        if (ref !== row && row.nextElementSibling !== ref) { box.insertBefore(row, ref); this.haptic('selection'); }
      };
      const end = ev => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        row.classList.remove('drag'); this._labDrag = false;
        const now = rows().map(r => r.dataset.gid);
        if (now.join() === start.join()) { this._rerender('lab'); return; }
        // the shown rows in their new order, then every hidden guest as it was
        this._labSaveOrder([...now, ...(this._labAll || []).filter(x => !now.includes(x))]);
      };
      window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    });
  }
  async _labSaveOrder(order) {
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    const P = cfg.panels = cfg.panels || {}, hl = P.homelab && typeof P.homelab === 'object' ? P.homelab : {};
    if (order) P.homelab = { ...hl, order }; else if (P.homelab && typeof P.homelab === 'object') delete P.homelab.order;
    E.lab.order = order || []; // shown at once, also while the save is on its way
    this._rerender('lab');
    if (await this._applyConfig(cfg)) this.haptic('success');
  }
  _labGuestIds() {
    const set = new Set();
    for (const id of Object.keys(this._hass?.states || {})) { const m = id.match(/^(?:binary_)?sensor\.((?:lxc|qemu)_.+)_status$/); if (m) set.add(m[1]); }
    return [...set];
  }

  _rDevices() {
    const rows = E.devices.filter(d => this.s(d.bat)).map(d => {
      const b = clamp(this.n(d.bat) ?? 0, 0, 100);
      const chg = d.chg ? this.on(d.chg) : d.chgState ? /^charging|full/i.test(this.v(d.chgState) || '') : false;
      const col = b < 20 ? '#f43f5e' : b < 40 ? '#fbbf24' : '#34d399';
      const where = d.trk ? this.v(d.trk) : null;
      return `<div class="dev" data-act="more" data-id="${d.bat}"${d.trk || d.chg || d.chgState ? ` data-id2="${d.trk || d.chg || d.chgState}"` : ''}>${ic(d.icon)}<div class="dn"><b>${esc(d.name)}</b><span>${where ? esc(where) + ' · ' : ''}${chg ? 'charging' : 'on battery'}</span></div>
        <div class="batt" style="--b:${b}%;--c:${col}"><i></i>${chg ? ic('mdi:lightning-bolt') : ''}</div><em>${b.toFixed(0)}%</em></div>`;
    }).join('');
    return `<div class="ch">${ic('mdi:devices')}<h3>Devices</h3></div><div class="devs">${rows}</div>`;
  }

  _rIrrigation() {
    const I = E.irrigation;
    // a weekday only matters for weekly schedules: hide it for "N Days" intervals or when it reads "Set to days"
    const dayless = /set to days/i.test(this.v(I.day) || '') || /\bdays?\b/i.test(this.v(I.every) || '');
    const mins = id => { const s = this.n(id); return s == null ? null : Math.round(s / 60); };
    // a name given in the panel wins; else the entity's name (dashboard names included)
    const v = I.valves.map((x, i) => [...x, i]).filter(x => this.s(x[0])).map(([id, n, i]) => {
      const m = mins(I.durations[i]), cfgName = arr(this._config?.panels?.irrigation?.zones ?? this._config?.panels?.irrigation?.valves)[i]?.name;
      const nm = cfgName || this.s(id).attributes.friendly_name || n, bad = BAD.includes(this.v(id));
      return `<button class="valve ${this.on(id) ? 'on' : ''}" data-act="valve" data-id="${id}"${I.durations[i] ? ` data-id2="${I.durations[i]}"` : ''}>
      <div class="drops">${ic('mdi:sprinkler-variant')}</div><b>${esc(nm)}</b><span>${bad ? tr('Unavailable') : this.on(id) ? tr('Watering') : tr('Closed')}${m != null ? ` · ${m} min` : ''}</span></button>`;
    }).join('');
    const ok = id => this.ok(id) ? esc(this.v(id)) : '—';
    // v1.21.8: the header pill is the Water Tomorrow switch (the separate row is gone); long press = more-info
    return `<div class="ch">${ic('mdi:sprinkler')}<h3>Irrigation</h3>${!I.tomorrow ? '' : `<button class="pill pillsw ${this.on(I.tomorrow) ? 'on' : ''}" style="--c:${this.on(I.tomorrow) ? '#34d399' : '#94a3b8'}" data-act="toggle" data-id="${I.tomorrow}" aria-pressed="${this.on(I.tomorrow)}">${this.on(I.tomorrow) ? 'Watering tomorrow' : 'Scheduled'}</button>`}</div>
      ${v ? `<div class="valves">${v}</div>` : `<div class="empty">${ic('mdi:information-outline')} ${tr('No valves yet: add them in the card editor (Panels → Irrigation).')}</div>`}
      ${!(I.next || I.notify) ? '' : `<div class="nextirr">
        ${I.next ? `<div class="ni" data-act="more" data-id="${I.next}"${I.time ? ` data-id2="${I.time}"` : ''}>${ic('mdi:calendar-clock')}<div><span>${tr('Next watering')}</span><b>${ok(I.next)}</b></div></div>` : ''}
        ${I.notify ? `<div class="ni" data-act="more" data-id="${I.notify}">${ic('mdi:bell-ring-outline')}<div><span>${tr('Reminder notification')}</span><b>${ok(I.notify)}</b></div></div>` : ''}
      </div>`}
      ${!(I.every || I.day) ? '' : `<div class="dsec">${tr('Schedule')}</div>`}
      <div class="picks col">${this.pickChip(I.every, 'select', tr('Water every'), 'mdi:calendar-sync')}${dayless ? '' : this.pickChip(I.day, 'select', tr('Day of the week'), 'mdi:calendar-today')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* 3D                                                                  */
  /* ------------------------------------------------------------------ */
  // take the 3D view handed over by the card this one replaces (the editor's preview): see SHARED
  _adoptShared() {
    const S = SHARED, vp = this.$('viewport'); if (!S || !vp || !this.shadowRoot.contains(vp)) return false;
    clearTimeout(S.timer); SHARED = null;
    if (S.vp !== vp) vp.replaceWith(S.vp);
    const dr = this.$('drawer'); if (dr) { dr.className = 'drawer'; dr.innerHTML = ''; }
    const sc = this._three = S.scene; sc.card = this;
    const L = MODEL.levels || [{ level: 0 }];
    if (S.level != null && L.some(l => l.level === S.level) && S.level !== this._level) this._setLevel(S.level);
    if (S.mode && S.mode !== this._mode) this._setMode(S.mode); else this._renderLegend();
    if (S.tab && S.tab !== this._tab && this._tabOn(S.tab)) this._setTab(S.tab);
    if (S.sel && ROOM[S.sel]) setTimeout(() => this._select(S.sel), 0);
    sc.resume?.(); sc.sync(); sc._dirty = true;
    try { sc.renderer.render(sc.scene, sc.cam); } catch (e) { /* next frame */ }
    sc._wake?.();
    // the house itself changed: a new 3D view once the changes pause, seen from the same place
    if (sc._key !== this._houseJSON) { clearTimeout(this._rbT); this._rbT = setTimeout(() => { if (this.isConnected && this._three === sc) this._rebuild(false); }, 600); }
    return true;
  }
  async _init3d() {
    await new Promise(r => setTimeout(r, 0)); // the card this one replaces is removed just after: its 3D view may be handed over
    if (this._three || this._adoptShared()) return;
    let THREE;
    THREE = this._THREE || THREE_LIB; // tests swap in a renderer stub
    let scene;
    try { scene = new HouseScene(THREE, this); scene.arrange = !!this._arrange; await scene.ready; }
    catch (e) { console.warn('sweet-home: 3D view', e); this.$('loading').innerHTML = `<span>The 3D view needs WebGL, which this browser could not start. The other tabs work as usual.</span>`; return; }
    this._three = scene; scene._key = this._houseJSON; // the house it shows
    const V = this._view; this._view = null;
    if (V) { for (const k of ['orbit', 'goal']) { Object.assign(scene[k], { theta: V[k].theta, phi: V[k].phi, radius: V[k].radius }); scene[k].target.copy(V[k].target); } scene.vmode = V.vmode; scene._dirty = true; }
    if (!this.isConnected) scene.pause();
    this.$('loading').classList.add('gone');
    if (!MODEL.gltf && !ROOMS.length) { // no rooms yet: say how to get them instead of an empty 3D view
      const L = this.$('loading'); L.classList.remove('gone'); L.classList.add('noroom'); this.$('hint')?.classList.add('gone');
      L.innerHTML = `${ic('mdi:floor-plan')}<b>${tr('No rooms yet')}</b><span>${tr('Add areas in Home Assistant (Settings → Areas) and put your devices in them: each area becomes a room. Or draw your rooms yourself: edit the dashboard, then edit this card → Rooms.')}</span>`;
    }
    this._renderLegend();
    if (this._mode && this._mode !== 'lights') this._setMode(this._mode); // the view mode (Lights / Climate / Presence) stays as it was
    this._three.sync();
  }
}

/* ------------------------------------------------------------------ */
/* Three.js scene                                                      */
/* ------------------------------------------------------------------ */
class HouseScene {
  constructor(THREE, card) {
    this.T = THREE; this.card = card;
    const T = THREE;
    this.vp = card.$('viewport'); this.cv = card.$('cv'); this.lblLayer = card.$('labels');
    const r = this.renderer = new T.WebGLRenderer({ canvas: this.cv, antialias: true, alpha: true, powerPreference: 'high-performance', stencil: true }); // stencil: stairwells
    // battery: 1.5× resolution on touch devices (phones / tablets), 2× on a PC
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    // battery: the sun and the furniture never move, so shadows are drawn once and only redrawn while a door moves
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new T.Scene();
    this.cam = new T.PerspectiveCamera(38, 1, 0.1, 200);
    this.mode = 'lights'; this.sel = null; this.hover = null;
    this.rooms = {}; this.pick = []; this.doors = []; this.acs = []; this.stairDots = [];
    this.lv = {}; this.level = card._level ?? 0; this._cl = 0; // one group per floor; only the shown floor is visible
    // default camera: angled 3D view on a PC (mouse), top-down floor plan on phones / tablets (touch)
    this.vmode = card._defView ? card._defView() : 'top'; // Look → default view (per device type, or this device's own)
    this.orbit = { theta: 0, phi: 0.08, radius: 27, target: new T.Vector3(0, 0, 0) };
    this.goal = { theta: 0, phi: 0.08, radius: 27, target: new T.Vector3(0, 0, 0) };
    this.spin = false; this.lastInput = performance.now();
    this.running = true;
    this.ready = this._build();
  }
  // Builds the house in small steps with a pause between them, and compiles the GPU shaders in the background,
  // so the page (tabs, buttons) keeps reacting to taps while "Building your home…" is shown.
  async _build() {
    const T = this.T;
    const breathe = () => new Promise(res => setTimeout(res, 0));
    const steps = MODEL.gltf ? ['_lights', '_ground', '_buildRooms', '_buildGltf', '_buildDoors', '_buildACs', '_labels', '_input'] : ['_lights', '_ground', '_buildRooms', '_buildWalls', '_buildFurniture', '_buildDoors', '_buildACs', '_labels', '_input'];
    for (const step of steps) { await this[step](); await breathe(); }
    this.ro = new ResizeObserver(() => this._resize()); this.ro.observe(this.vp);
    this._resize();
    try { await this.renderer.compileAsync(this.scene, this.cam); } catch (e) { /* compiled on the first frame instead */ }
    await breathe();
    this.clock = new T.Clock();
    this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this._wake?.(); }, { threshold: 0 }); this.io.observe(this.vp);
    this.visible = true;
    this._visW = () => { if (!document.hidden) this._wake?.(); }; document.addEventListener('visibilitychange', this._visW);
    // battery: full frame rate only while the camera / lights / doors are changing or the user is touching the view;
    // ~30 fps for small looping effects (AC airflow, motion rings, pulses); 2 fps when nothing at all moves
    // CPU: the loop no longer asks for a frame 60× a second just to skip most of them — between frames it
    // sleeps on a timer (66 ms for looping effects on phones, 500 ms when idle) and stops completely while the view is
    // off screen, on another tab or the app is in the background. Anything that needs a redraw wakes it: `_dirty = true`,
    // touch input (`lastInput`), coming back into view / to the foreground, resume().
    let acc = 0, timer = null;
    const animDt = matchMedia('(pointer: coarse)').matches ? 1 / 15 : 1 / 30; // looping effects: 15 fps on phones / tablets
    const isActive = () => this._dirty || this._busy || this.spin || performance.now() - this.lastInput < 1500;
    const schedule = ms => {
      if (this.raf) return;
      // PC: back to a frame request every display frame (it skips frames as before) — timer sleeps only on phones
      if (ms <= 4 || !COARSE) { if (timer) { clearTimeout(timer); timer = null; } this.raf = requestAnimationFrame(loop); return; }
      if (!timer) timer = setTimeout(() => { timer = null; if (!this.raf) this.raf = requestAnimationFrame(loop); }, ms);
    };
    this._wake = () => { if (this.running) schedule(0); };
    const loop = () => {
      this.raf = null;
      const dt = this.clock.getDelta();
      if (!this.running || !this.visible || document.hidden) { this.__dirty = true; return; } // asleep until woken
      acc += dt;
      const need = isActive() ? 0 : this._anim ? animDt : 0.5;
      if (acc >= need - (need ? 0.012 : 0)) { this.__dirty = false; this._frame(Math.min(acc, 0.1)); acc = 0; } // up to 12 ms early is fine
      schedule(isActive() ? 0 : Math.max(0, ((this._anim ? animDt : 0.5) - acc) * 1000 - 17)); // wake one display frame early: the rAF after the timer adds ~16 ms
    };
    this.__dirty = true; this._wake();
  }
  get _dirty() { return this.__dirty; }
  set _dirty(v) { this.__dirty = v; if (v) this._wake?.(); }
  get lastInput() { return this.__lastInput || 0; }
  set lastInput(v) { this.__lastInput = v; this._wake?.(); }
  pause() { this.running = false; }
  resume() { this.running = true; this._wake?.(); }

  w(x, z) { return [x - CX, z - CZ]; }
  // the group of the floor that is being built (`_cl`)
  _at() {
    const l = this._cl ?? 0; let g = this.lv[l];
    if (!g) { g = this.lv[l] = new this.T.Group(); g.userData.level = l; g.visible = l === this.level; this.scene.add(g); }
    return g;
  }
  setLevel(l) {
    this.level = l; for (const k in this.lv) this.lv[k].visible = Number(k) === l;
    this.hover = null; this.hoverF = null; this.renderer.shadowMap.needsUpdate = true; this._dirty = true;
  }
  // a hit counts only when everything above it is shown (the other floors are hidden, not removed)
  _shown(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }

  _lights() {
    const T = this.T;
    this.hemi = new T.HemisphereLight(0xbfd4ff, 0x1a1f2e, 0.9); this.scene.add(this.hemi);
    const d = this.sun = new T.DirectionalLight(0xffffff, 2.2);
    const S = SPAN * 0.72 + 3; // sun and its shadow box follow the size of the house
    d.position.set(-S, S * 1.55, -S * 0.7); d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048); d.shadow.camera.left = -S; d.shadow.camera.right = S; d.shadow.camera.top = S; d.shadow.camera.bottom = -S;
    d.shadow.camera.near = 1; d.shadow.camera.far = S * 5; d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.shadow.radius = 4;
    this.scene.add(d);
  }

  _tex(kind) {
    const T = this.T; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (kind === 'marble') {
      g.fillStyle = '#e8dfcf'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(160,140,115,${rnd(.05, .14)})`; g.lineWidth = rnd(.5, 2); g.beginPath(); g.moveTo(rnd(0, 256), rnd(0, 256)); g.bezierCurveTo(rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256), rnd(0, 256)); g.stroke(); }
      g.strokeStyle = 'rgba(120,100,80,.18)'; g.lineWidth = 1.5;
      for (let i = 0; i <= 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    } else if (kind === 'carpet') {
      g.fillStyle = '#9097a1'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { const v = rnd(110, 175) | 0; g.fillStyle = `rgba(${v},${v + 4},${v + 10},.35)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.5, 1.5); }
    } else if (kind === 'wood') {
      g.fillStyle = '#b08a62'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) { g.fillStyle = `rgba(${rnd(90, 130) | 0},${rnd(60, 90) | 0},${rnd(30, 50) | 0},.25)`; g.fillRect(0, y, 256, 31); g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(0, y + 31, 256, 1); g.fillRect(rnd(0, 256), y, 1, 31); }
      for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(80,55,30,${rnd(.04, .1)})`; g.beginPath(); const yy = rnd(0, 256); g.moveTo(0, yy); g.lineTo(256, yy + rnd(-3, 3)); g.stroke(); }
    } else if (kind === 'grass') {
      g.fillStyle = '#4d7c3a'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${rnd(40, 110) | 0},${rnd(110, 170) | 0},${rnd(30, 70) | 0},.45)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.2, rnd(2, 5)); }
    } else if (kind === 'asphalt') {
      g.fillStyle = '#3a3f47'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { const v = rnd(40, 95) | 0; g.fillStyle = `rgba(${v},${v + 2},${v + 6},.5)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.4, 1.4); }
    } else if (kind === 'tile') {
      g.fillStyle = '#eef2f6'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(100,116,139,.25)'; g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    } else {
      g.fillStyle = '#b8b1a5'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) { const v = rnd(150, 200) | 0; g.fillStyle = `rgba(${v},${v - 5},${v - 12},.4)`; g.fillRect(rnd(0, 256), rnd(0, 256), 2, 2); }
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  _ground() {
    const T = this.T;
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 256, 30, 256, 256, 256);
    grd.addColorStop(0, 'rgba(60,90,150,0.55)'); grd.addColorStop(0.6, 'rgba(30,45,90,0.25)'); grd.addColorStop(1, 'rgba(10,15,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(140,170,255,0.08)'; g.lineWidth = 1;
    for (let i = 0; i <= 512; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const mask = g.createRadialGradient(256, 256, 120, 256, 256, 256); mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask; g.fillRect(0, 0, 512, 512);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(Math.max(64, SPAN * 4), Math.max(64, SPAN * 4)), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = -0.25; m.renderOrder = -3; this.scene.add(m);
    // base slab: drawn first and without depth, so a stairwell going down below the floor shows through it
    const slab = new T.Mesh(new T.BoxGeometry(PLAN_W + 0.6, 0.5, PLAN_D + 0.6), new T.MeshStandardMaterial({ color: 0x1b2337, roughness: 0.9, depthWrite: false }));
    slab.position.set(PLAN_W / 2 - CX, -0.27, PLAN_D / 2 - CZ); slab.receiveShadow = true; slab.renderOrder = -2; this.scene.add(slab);
    // shadow catcher
    const sc = new T.Mesh(new T.PlaneGeometry(PLAN_W + 24, PLAN_D + 24), new T.ShadowMaterial({ opacity: 0.35 }));
    sc.material.depthWrite = false; sc.renderOrder = -1;
    sc.rotation.x = -Math.PI / 2; sc.position.y = -0.02; sc.receiveShadow = true; this.scene.add(sc);
  }

  _buildRooms() {
    const T = this.T;
    const texCache = {};
    for (const r of ROOMS) {
      this._cl = r.level;
      const grp = new T.Group(); this._at().add(grp);
      const mats = [];
      let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9, area = 0, sx = 0, sz = 0;
      const rep = r.floor === 'marble' ? 1.6 : r.floor === 'tile' ? 1.2 : r.floor === 'wood' ? 2.2 : r.floor === 'asphalt' ? 4 : 2.5;
      const floorMat = map => new T.MeshStandardMaterial({ map, roughness: r.floor === 'marble' || r.floor === 'tile' ? 0.35 : r.floor === 'asphalt' ? 0.85 : 0.95, metalness: 0.0, emissive: 0x000000 });
      if (r.poly) { // an outline (slanted or bent edges): one floor slab cut to its shape, with a hole for each stairwell
        const P = r.poly.map(([x, z]) => this.w(x, z)), sh = new T.Shape(P.map(([x, z]) => new T.Vector2(x, -z)));
        for (const [x1, z1, x2, z2] of r.holes || []) { const [a, b] = this.w(x1, z1), [c, d] = this.w(x2, z2); sh.holes.push(new T.Path([new T.Vector2(a, -b), new T.Vector2(c, -b), new T.Vector2(c, -d), new T.Vector2(a, -d)])); }
        texCache[r.floor] = texCache[r.floor] || this._tex(r.floor);
        const map = texCache[r.floor].clone(); map.needsUpdate = true; map.repeat.set(1 / rep, 1 / rep);
        const mat = floorMat(map), m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }), mat);
        m.rotation.x = -Math.PI / 2; m.position.y = -0.1; m.receiveShadow = true; m.userData.room = r.id;
        grp.add(m); this.pick.push(m); mats.push(mat);
        let a2 = 0; // centroid of the outline
        r.poly.forEach(([x1, z1], i) => { const [x2, z2] = r.poly[(i + 1) % r.poly.length], c = x1 * z2 - x2 * z1; a2 += c; sx += (x1 + x2) * c; sz += (z1 + z2) * c; minx = Math.min(minx, x1); minz = Math.min(minz, z1); maxx = Math.max(maxx, x1); maxz = Math.max(maxz, z1); });
        area = 3 * a2;
      }
      for (const [x1, z1, x2, z2] of (r.poly ? [] : r.floorRects || r.rects)) {
        const w = x2 - x1, d = z2 - z1;
        texCache[r.floor] = texCache[r.floor] || this._tex(r.floor);
        const map = texCache[r.floor].clone(); map.needsUpdate = true;
        map.repeat.set(w / rep, d / rep);
        const mat = floorMat(map);
        const [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2);
        const yOff = r.id === 'stairs' ? 0 : 0;
        const m = new T.Mesh(new T.BoxGeometry(w - 0.02, 0.1, d - 0.02), mat);
        m.position.set(cx, -0.05 + yOff, cz); m.receiveShadow = true; m.userData.room = r.id;
        grp.add(m); this.pick.push(m); mats.push(mat);
        minx = Math.min(minx, x1); minz = Math.min(minz, z1); maxx = Math.max(maxx, x2); maxz = Math.max(maxz, z2);
        area += w * d; sx += (x1 + x2) / 2 * w * d; sz += (z1 + z2) / 2 * w * d;
      }
      const [ccx, ccz] = r.anchor ? this.w(...r.anchor) : this.w(sx / area, sz / area);
      // outline
      const pts = [];
      if (r.poly) r.poly.forEach(([x1, z1], i) => { const [x2, z2] = r.poly[(i + 1) % r.poly.length], a = this.w(x1, z1), b = this.w(x2, z2); pts.push(a[0], 0.02, a[1], b[0], 0.02, b[1]); });
      for (const [x1, z1, x2, z2] of r.poly ? [] : r.rects) {
        const a = this.w(x1 + 0.08, z1 + 0.08), b = this.w(x2 - 0.08, z2 - 0.08);
        pts.push(a[0], 0.02, a[1], b[0], 0.02, a[1], b[0], 0.02, a[1], b[0], 0.02, b[1], b[0], 0.02, b[1], a[0], 0.02, b[1], a[0], 0.02, b[1], a[0], 0.02, a[1]);
      }
      const og = new T.BufferGeometry(); og.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const outline = new T.LineSegments(og, new T.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0 }));
      grp.add(outline);
      // ceiling lamp + point light
      const lamp = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.05, 32), new T.MeshStandardMaterial({ color: 0x334155, emissive: 0xffc27a, emissiveIntensity: 0 }));
      lamp.position.set(ccx, 2.25, ccz); grp.add(lamp);
      const halo = new T.Mesh(new T.CircleGeometry(0.9, 32), new T.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(ccx, 2.22, ccz); grp.add(halo);
      const pl = new T.PointLight(0xffb86b, 0, Math.max(maxx - minx, maxz - minz) * 1.3 + 2, 1.4);
      pl.position.set(ccx, 1.9, ccz); grp.add(pl);
      // presence ring
      const ring = new T.Mesh(new T.RingGeometry(0.55, 0.7, 48), new T.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(ccx, 0.04, ccz); grp.add(ring);
      this.rooms[r.id] = { r, mats, outline, lamp, halo, pl, ring, cx: ccx, cz: ccz, lit: 0, litT: 0, motion: 0, temp: null, col: new T.Color(1, 1, 1), hl: 0 };
      if (r.lightFx) this._buildLightFx(this.rooms[r.id]);
    }
  }

  // Light effects for rooms with `lightFx`: LED strips (cove line at the wall tops + floor glow along those walls),
  // ceiling spot lights (ring in wide areas, single line in narrow corridors) and a TV backlight glow.
  // Works per rectangle so L-shaped rooms get the effect on every arm; `stripSides` is a string, or one string per rect.
  // soft gradient textures for light effects: 'v' = bright top → clear bottom (wall wash, top 65 %),
  // 'h' / 'w' = bright centre line → clear edges across the short side (halo ribbons, horizontal / vertical in plan)
  _grad(kind) {
    const T = this.T, k = this._gradTex || (this._gradTex = {}); if (k[kind]) return k[kind];
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    let gr;
    if (kind === 'v') { gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,.6)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); } // v1.21.12: shorter (was 65 %)
    else { gr = kind === 'h' ? g.createLinearGradient(0, 0, 0, 128) : g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return (k[kind] = t);
  }
  _buildLightFx(R) {
    const T = this.T; const r = R.r; const types = Object.values(r.lightFx);
    R.stripCol = new T.Color(0xffb86b); R.tvCol = new T.Color(0x7dd3fc);
    R.stripL = 0; R.tvL = 0; R.stripT = 0; R.tvT = 0; R.spotT = 0; R.spotL = 0;
    const span = Math.max(...r.rects.map(([a, b, c, d]) => Math.max(c - a, d - b)));
    if (types.includes('strip')) {
      const sidesOf = i => Array.isArray(r.stripSides) ? (r.stripSides[i] || '') : (r.stripSides || 'nesw');
      const lineMat = new T.MeshBasicMaterial({ color: R.stripCol, transparent: true, opacity: 0, toneMapped: false });
      const planes = [], washes = [], ribbons = [];
      if (r.poly) { // an outline: the strip follows every edge (slanted and bent ones too)
        const P = polyArea(r.poly) >= 0 ? r.poly : [...r.poly].reverse(), inset = 0.12;
        const glow = (len, wd, x, y, z, ang, tex) => { const m = new T.Mesh(new T.PlaneGeometry(len, wd), new T.MeshBasicMaterial({ map: this._grad(tex), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })); m.rotation.order = 'YXZ'; m.rotation.y = -ang; m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); this._at().add(m); return m; };
        P.forEach(([x1, z1], i) => {
          const [x2, z2] = P[(i + 1) % P.length], L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.05) return;
          const dx = (x2 - x1) / L, dz = (z2 - z1) / L, ix = -dz, iz = dx, ang = Math.atan2(dz, dx); // (ix, iz): into the room
          let runs = [[0, L]];
          if (r.stripMode === 'walls') { // only where a wall stands on this edge
            const me = lineOf(x1, z1, x2, z2), t0 = x1 * me.dx + z1 * me.dz, s = dx * me.dx + dz * me.dz;
            runs = WALLS.filter(q => (q[5] ?? 0) === r.level && q[4] !== 'rail').map(q => [q, lineOf(q[0], q[1], q[2], q[3])])
              .filter(([, l]) => l && Math.abs(l.ang - me.ang) < 2e-3 && Math.abs(l.c - me.c) < 0.03)
              .map(([, l]) => [(l.a - t0) * s, (l.b - t0) * s].sort((u, v) => u - v)).map(([a, b]) => [Math.max(0, a), Math.min(L, b)]).filter(([a, b]) => b - a > 0.05);
          }
          for (const [a, b] of runs) {
            const len = b - a, m = (a + b) / 2, cx = x1 + dx * m, cz = z1 + dz * m;
            const [fx, fz] = this.w(cx + ix * 0.3, cz + iz * 0.3); planes.push(glow(len, 0.6, fx, 0.025, fz, ang, 'v'));
            const [wx, wz] = this.w(cx + ix * inset, cz + iz * inset);
            const wash = new T.Mesh(new T.PlaneGeometry(len, WALL_H - 0.18), new T.MeshBasicMaterial({ map: this._grad('v'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
            wash.position.set(wx, (WALL_H - 0.18) / 2, wz); wash.rotation.y = -ang; this._at().add(wash); washes.push(wash);
            const [rx, rz] = this.w(cx + ix * 0.3, cz + iz * 0.3); ribbons.push(glow(len, 0.36, rx, WALL_H - 0.14, rz, ang, 'h'));
          }
        });
      }
      (r.poly ? [] : r.rects).forEach(([x1, z1, x2, z2], ri) => {
        const sides = sidesOf(ri); if (!sides) return;
        // floor glow: transparent in the middle, bright along the chosen edges (edge width kept ~0.9 m in world units)
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.globalCompositeOperation = 'lighter';
        const dx = Math.min(80, 256 * 0.6 / (x2 - x1)), dz = Math.min(80, 256 * 0.6 / (z2 - z1)); // v1.20.0: 0.6 m edge, was 0.9 m
        const edge = (ax, ay, bx, by, rx, ry, rw, rh) => { const gr = g.createLinearGradient(ax, ay, bx, by); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
        // where along each side the strip runs: the whole side, or (strip_mode: walls) only where there is a wall
        const runs = sd => {
          const horiz = sd === 'n' || sd === 's', lo = horiz ? x1 : z1, hi = horiz ? x2 : z2;
          if (r.stripMode !== 'walls') return [[lo, hi]];
          const line = { n: z1, s: z2, w: x1, e: x2 }[sd], on = v => Math.abs(v - line) < 0.03;
          const segs = WALLS.filter(q => (q[5] ?? 0) === r.level && q[4] !== 'rail' && (horiz ? on(q[1]) && on(q[3]) : on(q[0]) && on(q[2])))
            .map(q => (horiz ? [Math.min(q[0], q[2]), Math.max(q[0], q[2])] : [Math.min(q[1], q[3]), Math.max(q[1], q[3])]))
            .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b - a > 0.05).sort((u, v) => u[0] - v[0]);
          const out = []; for (const q of segs) { const l = out[out.length - 1]; if (l && q[0] <= l[1] + 0.02) l[1] = Math.max(l[1], q[1]); else out.push([...q]); }
          return out;
        };
        const px256 = (v, a, b) => (v - a) / (b - a) * 256;
        for (const [a, b] of sides.includes('n') ? runs('n') : []) { const u = px256(a, x1, x2), v = px256(b, x1, x2); edge(0, 0, 0, dz, u, 0, v - u, dz); }
        for (const [a, b] of sides.includes('s') ? runs('s') : []) { const u = px256(a, x1, x2), v = px256(b, x1, x2); edge(0, 256, 0, 256 - dz, u, 256 - dz, v - u, dz); }
        for (const [a, b] of sides.includes('w') ? runs('w') : []) { const u = px256(a, z1, z2), v = px256(b, z1, z2); edge(0, 0, dx, 0, 0, u, dx, v - u); }
        for (const [a, b] of sides.includes('e') ? runs('e') : []) { const u = px256(a, z1, z2), v = px256(b, z1, z2); edge(256, 0, 256 - dx, 0, 256 - dx, u, dx, v - u); }
        const plane = new T.Mesh(new T.PlaneGeometry(x2 - x1 - 0.1, z2 - z1 - 0.1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
        const [px, pz] = this.w((x1 + x2) / 2, (z1 + z2) / 2); plane.rotation.x = -Math.PI / 2; plane.position.set(px, 0.025, pz); this._at().add(plane); planes.push(plane);
        // the strip itself: thin glowing bars along the inside of the wall tops
        const bar = (ax, az, bx, bz) => {
          const len = Math.hypot(bx - ax, bz - az); const horiz = az === bz;
          const m = new T.Mesh(new T.BoxGeometry(horiz ? len : 0.04, 0.04, horiz ? 0.04 : len), lineMat);
          const [mx, mz] = this.w((ax + bx) / 2, (az + bz) / 2); m.position.set(mx, WALL_H - 0.12, mz); this._at().add(m); // v1.21.12: below the wall top (was -0.05)
        };
        const i = 0.1;
        // v1.21.13: the solid strip bars are no longer drawn  — the halo + wall glow show where the strip is.
        // `bar` is kept for reference; lineMat still carries the strip colour for the other parts.
        // v1.20.0 cove look: light washing down the inside of each wall (bright under the strip, fading towards the floor)
        // and a soft halo ribbon around the strip itself, so it reads as a glowing line from above as well
        for (const sd of sides) for (const [ra, rb] of 'nesw'.includes(sd) ? runs(sd) : []) {
          const horiz = sd === 'n' || sd === 's', lo = horiz ? x1 : z1, hi = horiz ? x2 : z2;
          const a = ra <= lo + 0.01 ? ra + i : ra, b = rb >= hi - 0.01 ? rb - i : rb, len = b - a; if (len < 0.08) continue;
          const mid = (a + b) / 2;
          const lx = sd === 'w' ? x1 + i + 0.02 : sd === 'e' ? x2 - i - 0.02 : mid, lz = sd === 'n' ? z1 + i + 0.02 : sd === 's' ? z2 - i - 0.02 : mid;
          const [wx, wz] = this.w(lx, lz), rotY = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[sd];
          const wash = new T.Mesh(new T.PlaneGeometry(len, WALL_H - 0.18), new T.MeshBasicMaterial({ map: this._grad('v'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
          wash.position.set(wx, (WALL_H - 0.18) / 2, wz); wash.rotation.y = rotY; this._at().add(wash); washes.push(wash);
          const ribbon = new T.Mesh(new T.PlaneGeometry(horiz ? len : 0.36, horiz ? 0.36 : len), new T.MeshBasicMaterial({ map: this._grad(horiz ? 'h' : 'w'), color: R.stripCol.clone(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
          const [rx, rz] = this.w(sd === 'w' ? x1 + i + 0.2 : sd === 'e' ? x2 - i - 0.2 : lx, sd === 'n' ? z1 + i + 0.2 : sd === 's' ? z2 - i - 0.2 : lz);
          ribbon.rotation.x = -Math.PI / 2; ribbon.position.set(rx, WALL_H - 0.14, rz); this._at().add(ribbon); ribbons.push(ribbon);
        }
      });
      const spl = new T.PointLight(R.stripCol, 0, span * 1.1, 1.2); spl.position.set(R.cx, WALL_H - 0.3, R.cz); this._at().add(spl);
      R.strip = { planes, washes, ribbons, lineMat, pl: spl };
    }
    if (types.includes('spots')) {
      const pts = [];
      for (const [x1, z1, x2, z2] of r.poly && r.rects.length > 4 ? r.rects.slice(0, 1) : r.rects) {
        const w = x2 - x1, d = z2 - z1;
        if (Math.min(w, d) < 3) { // narrow corridor: one line down the middle
          const alongX = w >= d, len = alongX ? w : d, n = Math.max(2, Math.round((len - 1.2) / 1.6) + 1);
          for (let k = 0; k < n; k++) { const t = 0.6 + (len - 1.2) * k / (n - 1); pts.push(alongX ? [x1 + t, (z1 + z2) / 2] : [(x1 + x2) / 2, z1 + t]); }
        } else { // wide room: a ring about a metre in from the edges
          const inset = 0.9, nx = Math.max(2, Math.round((w - 2 * inset) / 2.2) + 1), nz = Math.max(2, Math.round((d - 2 * inset) / 2.2) + 1);
          for (let k = 0; k < nx; k++) { const x = x1 + inset + (w - 2 * inset) * k / (nx - 1); pts.push([x, z1 + inset], [x, z2 - inset]); }
          for (let k = 1; k < nz - 1; k++) { const z = z1 + inset + (d - 2 * inset) * k / (nz - 1); pts.push([x1 + inset, z], [x2 - inset, z]); }
        }
      }
      const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d');
      const prg = pg.createRadialGradient(64, 64, 2, 64, 64, 64); prg.addColorStop(0, 'rgba(255,255,255,1)'); prg.addColorStop(0.5, 'rgba(255,255,255,0.35)'); prg.addColorStop(1, 'rgba(255,255,255,0)');
      pg.fillStyle = prg; pg.fillRect(0, 0, 128, 128);
      const discMat = new T.MeshStandardMaterial({ color: 0x334155, emissive: 0xffd9a8, emissiveIntensity: 0, roughness: 0.4 });
      const poolMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(pc), color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
      const beamMat = new T.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const discGeo = new T.CylinderGeometry(0.11, 0.11, 0.03, 20), poolGeo = new T.CircleGeometry(0.75, 28), beamGeo = new T.ConeGeometry(0.55, 2.2, 24, 1, true);
      for (const [x, z] of pts) {
        const [sx, sz] = this.w(x, z);
        const dsk = new T.Mesh(discGeo, discMat); dsk.position.set(sx, 2.25, sz); this._at().add(dsk);
        const pool = new T.Mesh(poolGeo, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(sx, 0.03, sz); this._at().add(pool);
        const beam = new T.Mesh(beamGeo, beamMat); beam.position.set(sx, 1.14, sz); this._at().add(beam); // apex at the spot, widening to the floor
      }
      const spotPl = new T.PointLight(0xffd2a0, 0, span * 1.2, 1.1); spotPl.position.set(R.cx, 2.0, R.cz); this._at().add(spotPl);
      R.spots = { discMat, poolMat, beamMat, pl: spotPl, n: pts.length };
    }
    // TV backlight: a glow on the wall behind the TV plus a little coloured light
    if (r.tvGlow) { // LED strip around the TV: a thin glowing frame on the TV's back edges + its wash on the wall
      const G = r.tvGlow, PW = G.w + 1.3, PH = G.h + 1.0;
      const tc = document.createElement('canvas'); tc.width = 512; tc.height = Math.round(512 * PH / PW); const tg = tc.getContext('2d');
      const rw = G.w / PW * tc.width, rh = G.h / PH * tc.height, rx = (tc.width - rw) / 2, ry = (tc.height - rh) / 2;
      tg.strokeStyle = '#fff'; tg.shadowColor = '#fff';
      for (const [blur, lw, a] of [[60, 18, 0.5], [30, 10, 0.7], [12, 5, 1]]) { tg.globalAlpha = a; tg.shadowBlur = blur; tg.lineWidth = lw; tg.strokeRect(rx, ry, rw, rh); }
      const tvPlane = new T.Mesh(new T.PlaneGeometry(PW, PH), new T.MeshBasicMaterial({ map: new T.CanvasTexture(tc), color: R.tvCol, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false }));
      const [tx, tz] = this.w(G.x, G.z), cy = G.y + G.h / 2;
      tvPlane.position.set(tx, cy, tz + 0.04); this._at().add(tvPlane);
      const sm = new T.MeshBasicMaterial({ color: R.tvCol, transparent: true, opacity: 0, toneMapped: false });
      const t = 0.03, strips = [[G.w + t, t, 0, G.h / 2], [G.w + t, t, 0, -G.h / 2], [t, G.h, -G.w / 2, 0], [t, G.h, G.w / 2, 0]].map(([w, h, ox, oy]) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, 0.02), sm); m.position.set(tx + ox, cy + oy, tz); this._at().add(m); return m;
      });
      const tpl = new T.PointLight(R.tvCol, 0, 6, 1.2); tpl.position.set(tx, cy, tz - 0.35); this._at().add(tpl);
      R.tv = { plane: tvPlane, pl: tpl, sm };
    }
  }

  _buildWalls() {
    const T = this.T;
    const wallMat = new T.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.85 });
    const capMat = new T.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const glassMat = new T.MeshPhysicalMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, emissive: 0x1d4ed8, emissiveIntensity: 0.15 });
    const frameMat = new T.MeshStandardMaterial({ color: 0x5b6472, roughness: 0.5, metalness: 0.4 });
    // a wall piece in any direction (slanted and bent walls too: a bent one is many short pieces that overlap a little)
    const add = (mat, x1, z1, x2, z2, y0, h, thick, cast = true, over = thick) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = new T.Mesh(new T.BoxGeometry(len + over, h, thick), mat);
      const [cx, cz] = this.w((x1 + x2) / 2, (z1 + z2) / 2);
      m.position.set(cx, y0 + h / 2, cz); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); m.castShadow = cast; m.receiveShadow = true; this._at().add(m); return m;
    };
    // an outer wall has no room on one of its sides: it is drawn thicker
    const inside = (x, z, l) => ROOMS.some(r => r.level === l && (r.poly ? inPoly(x, z, r.poly) : r.rects.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)));
    const glassWall = new T.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, emissive: 0x1d4ed8, emissiveIntensity: 0.08, depthWrite: false });
    for (const [x1, z1, x2, z2, type, lvl, o] of WALLS) {
      this._cl = lvl ?? 0;
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, nx = -(z2 - z1) / len * 0.3, nz = (x2 - x1) / len * 0.3, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const outer = !o && (!inside(mx + nx, mz + nz, lvl ?? 0) || !inside(mx - nx, mz - nz, lvl ?? 0));
      const t = o ? 0.1 : outer ? 0.22 : 0.12, over = o?.bent ? t * 0.6 : t;
      if (type === 'half') { // a low wall (kitchen bar, stair rail): `height`, else about two thirds of the wall
        const h = Math.min(WALL_H, o?.h ?? Math.max(0.5, WALL_H * 0.62));
        add(wallMat, x1, z1, x2, z2, 0, h, t, true, over); add(capMat, x1, z1, x2, z2, h, 0.04, t + 0.01, false, over);
      } else if (type === 'glass') { // a glass partition: a thin frame at the floor and the top, glass between
        const h = Math.min(WALL_H, o?.h ?? WALL_H);
        add(frameMat, x1, z1, x2, z2, 0, 0.06, 0.07, false, over); add(glassWall, x1, z1, x2, z2, 0.06, h - 0.1, 0.03, false, over); add(frameMat, x1, z1, x2, z2, h - 0.04, 0.04, 0.07, false, over);
      } else if (type === 'rail') {
        add(wallMat, x1, z1, x2, z2, 0, 0.18, 0.18);
        add(glassMat, x1, z1, x2, z2, 0.18, 0.72, 0.03, false);
        add(frameMat, x1, z1, x2, z2, 0.9, 0.05, 0.07, false);
      } else if (type === 'win') {
        add(wallMat, x1, z1, x2, z2, 0, 0.75, t);
        add(frameMat, x1, z1, x2, z2, 0.75, 0.04, t + 0.02);
        add(glassMat, x1, z1, x2, z2, 0.79, WALL_H - 0.79, 0.04, false);
        add(capMat, x1, z1, x2, z2, WALL_H, 0.04, t);
      } else {
        const h = o?.h ? Math.min(WALL_H, o.h) : WALL_H;
        add(wallMat, x1, z1, x2, z2, 0, h, t, true, over);
        add(capMat, x1, z1, x2, z2, h, 0.04, t + 0.005, false, over);
      }
    }
  }

  _buildFurniture() {
    const T = this.T;
    const mats = {};
    const M = (c, o = {}) => (mats[c + JSON.stringify(o)] ||= new T.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0, transparent: !!o.op, opacity: o.op ?? 1 }));
    let cur = null; // the piece being built, when it has entities: its meshes can be tapped
    let curIdx = null; // the piece being built (any piece): arrange mode drags it
    const tag = m => { if (curIdx != null) m.userData.fi = curIdx; if (cur) { m.userData.furn = cur.idx; cur.meshes.push(m); } return m; };
    this.fmov = {};
    const add = (room, geo, mat, x, y, z, shadow = true) => {
      const m = new T.Mesh(geo, mat); const [cx, cz] = this.w(x, z); m.position.set(cx, y, cz);
      m.castShadow = shadow; m.receiveShadow = true; m.userData.room = room; this._at().add(m); this.pick.push(m); return tag(m);
    };
    // axis-aligned box by center
    const box = (room, x, z, w, d, h, color, y = 0, o) => add(room, new T.BoxGeometry(w, h, d), M(color, o), x, y + h / 2, z);
    // box by extents
    const ext = (room, x0, z0, x1, z1, h, color, y = 0, o) => box(room, (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), h, color, y, o);
    const rug = (room, x, z, w, d, color) => box(room, x, z, w, d, 0.015, color, 0.002, { r: 1 });
    const cyl = (room, x, z, r, h, color, y = 0, o) => add(room, new T.CylinderGeometry(r, r, h, 28), M(color, o), x, y + h / 2, z);
    const ball = (room, x, z, r, color, y) => add(room, new T.SphereGeometry(r, 20, 16), M(color, { r: 0.9 }), x, y, z);
    // sofa: footprint extents, back side n/s/e/w, arms on the two ends
    const sofa = (room, x0, z0, x1, z1, back, color, cushion, pillow, arms = 'both', cornerBack = null) => {
      const seatH = 0.42, backT = 0.22, armT = 0.18;
      // cushions the same colour as the frame would melt into it: they are drawn a shade lighter, so the seats show
      const ch = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], [cr, cg, cb] = ch(cushion), [fr, fg, fb] = ch(color);
      if (Math.abs(cr - fr) + Math.abs(cg - fg) + Math.abs(cb - fb) < 60) cushion = (Math.round(cr + (255 - cr) * 0.28) << 16) | (Math.round(cg + (255 - cg) * 0.28) << 8) | Math.round(cb + (255 - cb) * 0.28);
      ext(room, x0, z0, x1, z1, 0.3, color);
      const horiz = back === 'n' || back === 's';
      // the corner of an L-shaped sofa: a back on its outer end too
      if (cornerBack && horiz) { if (cornerBack === 'start') ext(room, x0, z0, x0 + backT, z1, 0.86, color); else ext(room, x1 - backT, z0, x1, z1, 0.86, color); }
      if (back === 'n') ext(room, x0, z0, x1, z0 + backT, 0.86, color);
      if (back === 's') ext(room, x0, z1 - backT, x1, z1, 0.86, color);
      if (back === 'w') ext(room, x0, z0, x0 + backT, z1, 0.86, color);
      if (back === 'e') ext(room, x1 - backT, z0, x1, z1, 0.86, color);
      const a0 = arms === 'both' || arms === 'start', a1 = arms === 'both' || arms === 'end';
      if (horiz) { if (a0) ext(room, x0, z0, x0 + armT, z1, 0.62, color); if (a1) ext(room, x1 - armT, z0, x1, z1, 0.62, color); }
      else { if (a0) ext(room, x0, z0, x1, z0 + armT, 0.62, color); if (a1) ext(room, x0, z1 - armT, x1, z1, 0.62, color); }
      // seat cushions
      const len = horiz ? (x1 - x0) - (a0 ? armT : 0) - (a1 ? armT : 0) : (z1 - z0) - (a0 ? armT : 0) - (a1 ? armT : 0);
      const n = Math.max(1, Math.round(len / 0.85)); const seg = len / n;
      for (let i = 0; i < n; i++) {
        if (horiz) {
          const sx = x0 + (a0 ? armT : 0) + seg * i, zz0 = back === 'n' ? z0 + backT : z0, zz1 = back === 's' ? z1 - backT : z1;
          ext(room, sx + 0.02, zz0 + 0.02, sx + seg - 0.02, zz1 - 0.04, 0.13, cushion, 0.3, { r: 0.95 });
          if (pillow && i % 2 === 0) { const pz = back === 'n' ? zz0 + 0.1 : zz1 - 0.1; box(room, sx + seg / 2, pz, 0.42, 0.14, 0.38, pillow, 0.43, { r: 1 }); }
        } else {
          const sz = z0 + (a0 ? armT : 0) + seg * i, xx0 = back === 'w' ? x0 + backT : x0, xx1 = back === 'e' ? x1 - backT : x1;
          ext(room, xx0 + 0.02, sz + 0.02, xx1 - 0.04, sz + seg - 0.02, 0.13, cushion, 0.3, { r: 0.95 });
          if (pillow && i % 2 === 0) { const px = back === 'w' ? xx0 + 0.1 : xx1 - 0.1; box(room, px, sz + seg / 2, 0.14, 0.42, 0.38, pillow, 0.43, { r: 1 }); }
        }
      }
    };
    // bed: center, width (across), length, head side n/s/e/w
    const bed = (room, x, z, wd, ln, head, frame, duvet, headboard, opts = {}) => {
      const alongX = head === 'e' || head === 'w';
      const W = alongX ? ln : wd, D = alongX ? wd : ln;
      box(room, x, z, W, D, 0.3, frame, 0, { r: 0.6 });
      box(room, x, z, W - 0.06, D - 0.06, 0.2, 0xf8fafc, 0.3, { r: 1 });
      // duvet covers the foot 72%
      const f = 0.72; const dl = ln * f;
      const off = (ln - dl) / 2;
      const dx = head === 'w' ? off : head === 'e' ? -off : 0, dz = head === 'n' ? off : head === 's' ? -off : 0;
      box(room, x + dx, z + dz, alongX ? dl : wd + 0.04, alongX ? wd + 0.04 : dl, 0.1, duvet, 0.42, { r: 1 });
      // pillows
      const np = wd > 1.4 ? 2 : 1; const ph = (ln / 2) - 0.25;
      for (let i = 0; i < np; i++) {
        const t = np === 1 ? 0 : (i ? 0.25 : -0.25) * wd;
        const px = alongX ? x + (head === 'w' ? -ph : ph) : x + t, pz = alongX ? z + t : z + (head === 'n' ? -ph : ph);
        box(room, px, pz, alongX ? 0.32 : 0.55, alongX ? 0.55 : 0.32, 0.13, opts.pillow || 0xffffff, 0.5, { r: 1 });
      }
      // headboard
      const hx = alongX ? x + (head === 'w' ? -(ln / 2 + 0.06) : ln / 2 + 0.06) : x, hz = alongX ? z : z + (head === 'n' ? -(ln / 2 + 0.06) : ln / 2 + 0.06);
      const hb = box(room, hx, hz, alongX ? 0.12 : wd + 0.14, alongX ? wd + 0.14 : 0.12, opts.hbH || 1.0, headboard, 0, { r: 0.85 });
      if (opts.house) { // house-shaped headboard: a flat triangular gable sitting on top of the headboard
        const gw = wd + 0.14, gh = 0.42;
        const shape = new T.Shape(); shape.moveTo(-gw / 2, 0); shape.lineTo(gw / 2, 0); shape.lineTo(0, gh); shape.closePath();
        const geo = new T.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }); geo.translate(0, 0, -0.06);
        const roof = new T.Mesh(geo, M(0xf5f5f4, { r: 0.6 }));
        roof.position.set(hb.position.x, opts.hbH || 1.0, hb.position.z);
        if (alongX) roof.rotation.y = Math.PI / 2; // headboard runs along z for beds whose head is on an east/west wall
        roof.castShadow = true; roof.userData.room = room; this._at().add(roof); this.pick.push(roof); tag(roof);
        (this.roofs ||= []).push(roof);
      }
    };
    const chair = (room, x, z, face, color, seat) => { // face: direction the sitter looks (n/s/e/w)
      box(room, x, z, 0.46, 0.46, 0.46, seat || color, 0, { r: 0.9 });
      const bx = face === 'e' ? -0.21 : face === 'w' ? 0.21 : 0, bz = face === 's' ? -0.21 : face === 'n' ? 0.21 : 0;
      box(room, x + bx, z + bz, bx ? 0.05 : 0.46, bz ? 0.05 : 0.46, 0.52, color, 0.46, { r: 0.6 });
    };
    const table = (room, x, z, w, d, h, top, leg, o) => {
      box(room, x, z, w, d, 0.05, top, h - 0.05, o || { r: 0.35 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(room, x + sx * (w / 2 - 0.07), z + sz * (d / 2 - 0.07), 0.06, 0.06, h - 0.05, leg);
    };
    // a phone lying on its back on a charger: shown only while it charges (see _update); `ew` lays it east–west
    const phone = (room, x, z, y, ew, f) => {
      const [pw, pd] = ew ? [0.16, 0.08] : [0.08, 0.16];
      const body = box(room, x, z, pw, pd, 0.012, C(f.phone_color, 0x1f2937), y, { r: 0.35, m: 0.4 });
      const m = box(room, x, z, pw - 0.012, pd - 0.012, 0.002, 0x0b1020, y + 0.012, { r: 0.15, e: 0x34d399, ei: 0 }); m.material = m.material.clone();
      const glow = new T.Mesh(new T.CircleGeometry(0.28, 32), new T.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      const [gx, gz] = this.w(x, z); glow.rotation.x = -Math.PI / 2; glow.position.set(gx, y + 0.016, gz); this._at().add(glow);
      body.visible = m.visible = false;
      this.chargers.push({ m, glow, parts: [body, m], plug: f.plug || null, power: f.power || null, min: N(f.charging_w, 1.5), t: 0 });
    };
    const plant = (room, x, z, s = 1) => { cyl(room, x, z, 0.2 * s, 0.38 * s, 0xd6cfc4, 0, { r: 0.6 }); ball(room, x, z, 0.32 * s, 0x2f6b3a, 0.62 * s); ball(room, x + 0.12 * s, z - 0.08 * s, 0.22 * s, 0x3f8a4c, 0.85 * s); };

    // pieces from the config (house.furniture / room.furniture, or the automatic set for automatic rooms)
    this.tvs = []; this.chargers = []; this.lamps = []; this.fans = []; this.markers = []; this.fpieces = []; this.blinds = []; this.vacuums = []; this.cars = []; this.pools = []; this.sprinklers = []; this.washers = []; this.steams = [];
    const N = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));
    const C = (v, d) => toColor(v, d);
    const opt = f => ({ r: N(f.roughness, 0.75), m: N(f.metalness, 0), op: f.opacity != null ? N(f.opacity, 1) : undefined, e: f.emissive, ei: f.emissive ? N(f.emissive_intensity, 0.6) : 0 });
    const floorGlow = (x, z, r, color, y = 0.01) => {
      const g = new T.Mesh(new T.CircleGeometry(r, 32), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      const [gx, gz] = this.w(x, z); g.rotation.x = -Math.PI / 2; g.position.set(gx, y, gz); this._at().add(g); return g;
    };
    for (const f of FURN) {
      const rm = f.room || null;
      cur = f.entities?.length ? { idx: f.idx, f, meshes: [] } : null;
      this._cl = f.level ?? 0; curIdx = f.idx;
      const before = this._at().children.length;
      try {
        switch (f.type) {
          case 'box': box(rm, N(f.x, 0), N(f.z, 0), N(f.w, 0.5), N(f.d, 0.5), N(f.h, 0.5), C(f.color, 0x8b6b45), N(f.y, 0), opt(f)); break;
          case 'block': ext(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 1), N(f.z1, 1), N(f.h, 0.5), C(f.color, 0x8b6b45), N(f.y, 0), opt(f)); break;
          case 'rug': rug(rm, N(f.x, 0), N(f.z, 0), N(f.w, 2), N(f.d, 1.5), C(f.color, 0x9ca3af)); break;
          case 'cylinder': cyl(rm, N(f.x, 0), N(f.z, 0), N(f.radius, 0.2), N(f.h, 0.5), C(f.color, 0xd6cfc4), N(f.y, 0), opt(f)); break;
          case 'ball': ball(rm, N(f.x, 0), N(f.z, 0), N(f.radius, 0.2), C(f.color, 0xf9a8d4), N(f.y, 0.2)); break;
          case 'sofa': sofa(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 2), N(f.z1, 1), f.back || 'n', C(f.color, 0x475569), C(f.cushion, 0x64748b), f.pillow === false ? null : C(f.pillow, 0xe2e8f0), f.arms || 'both', f.cornerBack); break;
          case 'bed': bed(rm, N(f.x, 0), N(f.z, 0), N(f.width, 1.4), N(f.length, 2.0), f.head || 'n', C(f.frame, 0x7c5a3c), C(f.duvet, 0x93c5fd), C(f.headboard, 0xe8dcc8), { pillow: C(f.pillow, 0xffffff), house: !!f.house_headboard, hbH: f.headboard_height }); break;
          case 'chair': chair(rm, N(f.x, 0), N(f.z, 0), f.face || 'n', C(f.color, 0x334155), f.seat != null ? C(f.seat) : undefined); break;
          case 'table': table(rm, N(f.x, 0), N(f.z, 0), N(f.w, 1.2), N(f.d, 0.8), N(f.h, 0.76), C(f.top, 0xd8ccb2), C(f.leg, 0xb7a684), opt(f)); break;
          case 'plant': plant(rm, N(f.x, 0), N(f.z, 0), N(f.size, 1)); break;
          case 'tv': { // a screen that flickers while its media player plays; facing = the direction the screen looks
            const w = N(f.w, 1.6), hh = N(f.h, 0.9), y = N(f.y, 0.6), alongX = !['e', 'w'].includes(f.facing || 'n');
            const m = box(rm, N(f.x, 0), N(f.z, 0), alongX ? w : 0.05, alongX ? 0.05 : w, hh, 0x05070c, y, { r: 0.2, e: 0x3b82f6, ei: 0 });
            m.material = m.material.clone(); this.tvs.push({ m, entity: f.entities?.find(e => e.startsWith('media_player.')) || f.entity || null }); break;
          }
          case 'charger': { // a charging pad; the phone on it shows while it charges
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 0.55);
            cyl(rm, x, z, 0.05, 0.008, C(f.color, 0xe5e7eb), y, { r: 0.4 });
            phone(rm, x, z, y + 0.008, false, f); break;
          }
          case 'stairs': this._stairs(f); break;
          case 'nightstand': { // bedside table: drawers on its front (`facing`), a table lamp on top that glows with its light
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ew = fc === 'e' || fc === 'w', W = N(f.w, 0.5), D = N(f.d, 0.4), H = Math.max(0.25, N(f.h, 0.55));
            const [fw, fd] = [W, D], wood = C(f.color, 0x7c5a3c), top = f.top != null ? C(f.top) : wood, hnd = C(f.handle, 0xd4b483);
            const sx = fc === 'e' ? 1 : fc === 'w' ? -1 : 0, sz = fc === 's' ? 1 : fc === 'n' ? -1 : 0, front = ew ? fw / 2 : fd / 2, across = ew ? fd : fw;
            box(rm, x, z, fw - 0.06, fd - 0.06, 0.05, 0x2a1f16, 0, { r: 0.9 }); // plinth, set back
            box(rm, x, z, fw, fd, H - 0.08, wood, 0.05, { r: 0.7 });
            box(rm, x, z, fw + 0.03, fd + 0.03, 0.03, top, H - 0.03, { r: 0.45 });
            const n = Math.max(1, Math.min(4, Math.round(N(f.drawers, 2)))), gap = 0.025, bodyH = H - 0.08 - gap, dh = (bodyH - gap * (n - 1)) / n - gap;
            const fr = (c => { const r = Math.min(255, ((c >> 16) & 255) + 22), g = Math.min(255, ((c >> 8) & 255) + 18), b = Math.min(255, (c & 255) + 14); return (r << 16) | (g << 8) | b; })(wood);
            for (let k = 0; k < n; k++) {
              const y = 0.05 + gap + k * (dh + gap * 2), dx = x + sx * (front + 0.006), dz = z + sz * (front + 0.006);
              box(rm, dx, dz, ew ? 0.012 : across - 0.05, ew ? across - 0.05 : 0.012, dh, fr, y, { r: 0.6 });
              box(rm, x + sx * (front + 0.02), z + sz * (front + 0.02), ew ? 0.02 : Math.min(0.14, across * 0.3), ew ? Math.min(0.14, across * 0.3) : 0.02, 0.02, hnd, y + dh / 2 - 0.01, { r: 0.3, m: 0.7 });
            }
            if (f.plug) phone(rm, x + sx * front * 0.35 + (ew ? 0 : across * 0.25), z + sz * front * 0.35 + (ew ? across * 0.25 : 0), H, ew, f); // the phone, on top, while it charges
            if (f.lamp !== false) { // a small table lamp at the back of the top
              const lx = x - sx * fw * 0.12, lz = z - sz * fd * 0.12, s = Math.min(1, Math.min(fw, fd) / 0.4), y0 = H;
              cyl(rm, lx, lz, 0.06 * s, 0.02, 0xd6cfc4, y0, { r: 0.4, m: 0.3 });
              cyl(rm, lx, lz, 0.012, 0.2 * s, 0xb08d57, y0 + 0.02, { r: 0.3, m: 0.6 });
              const mat = new T.MeshStandardMaterial({ color: C(f.shade, 0xf5e6c8), emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.8, side: T.DoubleSide });
              const m = add(rm, new T.CylinderGeometry(0.07 * s, 0.11 * s, 0.14 * s, 24, 1, true), mat, lx, y0 + 0.2 * s + 0.05 * s, lz);
              this.lamps.push({ m, glow: floorGlow(lx, lz, 0.6, 0xffc27a), entity: f.entities.find(e => e.startsWith('light.') || e.startsWith('switch.')) || null, t: 0, col: new T.Color(0xffc27a) });
            }
            break;
          }
          case 'toilet': case 'sink': case 'shower': case 'bathtub': case 'washer': case 'towel': {
            // bathroom / laundry pieces: w × d is the x × z size; `facing` is their front. u runs along the front, v from the back (-) to the front (+)
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ew = fc === 'e' || fc === 'w', sg = fc === 's' || fc === 'e' ? 1 : -1;
            const DF = { toilet: [0.4, 0.65], sink: [0.8, 0.5], shower: [0.9, 0.9], bathtub: [1.7, 0.75], washer: [0.6, 0.6], towel: [0.5, 0.08] }[f.type];
            const W = N(f.w, ew ? DF[1] : DF[0]), D = N(f.d, ew ? DF[0] : DF[1]), A = ew ? D : W, Dp = ew ? W : D;
            const at = (u, v) => ew ? [x + sg * v, z + u] : [x + u, z + sg * v];
            const lb = (u, v, a, dp, h, col, y = 0, o) => { const [px, pz] = at(u, v); return box(rm, px, pz, ew ? dp : a, ew ? a : dp, h, col, y, o); };
            const lc = (u, v, r, h, col, y = 0, o) => { const [px, pz] = at(u, v); return cyl(rm, px, pz, r, h, col, y, o); };
            const white = C(f.color, 0xf8fafc), chrome = { r: 0.25, m: 0.8 }, ent = f.entities[0] || null;
            if (f.type === 'toilet') {
              lb(0, -Dp / 2 + 0.1, A * 0.92, 0.2, 0.4, white, 0.38, { r: 0.3 }); // tank
              lb(0, -Dp / 2 + 0.11, A * 0.95, 0.22, 0.03, white, 0.78, { r: 0.3 }); // its lid
              lc(0, -Dp / 2 + 0.11, 0.018, 0.012, 0xcbd5e1, 0.81, chrome); // flush button
              lb(0, -Dp / 2 + 0.25, A * 0.45, 0.12, 0.38, white, 0, { r: 0.3 }); // foot
              lc(0, Dp / 2 - Math.min(A, Dp) * 0.48, Math.min(A, Dp) * 0.46, 0.3, white, 0.08, { r: 0.3 }); // bowl
              lc(0, Dp / 2 - Math.min(A, Dp) * 0.48, Math.min(A, Dp) * 0.48, 0.03, C(f.seat, 0xffffff), 0.38, { r: 0.35 }); // seat
            } else if (f.type === 'sink') {
              const H = N(f.h, 0.85), wood = C(f.color, 0x8b6b45), top = C(f.top, 0xf8fafc), r = Math.min(A * 0.3, Dp * 0.32);
              lb(0, -0.01, A, Dp - 0.02, 0.1, 0x2a1f16, 0, { r: 0.9 }); // plinth
              lb(0, 0, A, Dp, H - 0.14, wood, 0.1, { r: 0.7 });
              for (const s2 of A > 0.55 ? [-1, 1] : [0]) lb(s2 * A / 4, Dp / 2 + 0.006, (s2 ? A / 2 : A) - 0.03, 0.012, H - 0.22, wood, 0.13, { r: 0.55 }); // doors
              lb(0, 0, A + 0.02, Dp + 0.02, 0.04, top, H - 0.04, { r: 0.25 });
              lc(0, 0.03, r, 0.006, 0xdbe4ee, H, { r: 0.2 }); lc(0, 0.03, r * 0.15, 0.007, 0x64748b, H, chrome); // basin, drain
              lc(0, -Dp / 2 + 0.07, 0.015, 0.16, 0xcbd5e1, H, chrome); lb(0, -Dp / 2 + 0.11, 0.025, 0.09, 0.02, 0xcbd5e1, H + 0.14, chrome); // tap
              const mat = new T.MeshStandardMaterial({ color: 0xc7d7e6, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.08, metalness: 0.6 });
              const [mx, mz] = at(0, -Dp / 2 + 0.012), m = add(rm, new T.BoxGeometry(ew ? 0.015 : A * 0.8, Math.min(0.6, WALL_H - H - 0.1), ew ? A * 0.8 : 0.015), mat, mx, H + 0.12 + Math.min(0.6, WALL_H - H - 0.1) / 2, mz);
              if (f.entities.some(e => e.startsWith('light.') || e.startsWith('switch.'))) this.lamps.push({ m, glow: floorGlow(...at(0, Dp / 2 + 0.3), 0.7, 0xffc27a), entity: f.entities.find(e => e.startsWith('light.') || e.startsWith('switch.')), t: 0, col: new T.Color(0xffc27a) });
            } else if (f.type === 'shower') {
              const H = Math.min(1.95, WALL_H), glass = { r: 0.05, m: 0.1, op: 0.22 };
              lb(0, 0, A, Dp, 0.06, white, 0, { r: 0.35 }); lc(0, 0, 0.04, 0.062, 0x64748b, 0, chrome); // tray, drain
              lb(0, Dp / 2 - 0.01, A * 0.6, 0.012, H - 0.06, 0xcfe8ff, 0.06, glass); // the glass door, half open
              lb(-A / 2 + 0.006, 0, 0.012, Dp, H - 0.06, 0xcfe8ff, 0.06, glass); // a glass side
              lb(A / 2 - 0.02, -Dp / 2 + 0.03, 0.02, 0.02, H - 0.3, 0xcbd5e1, 0.06, chrome); // riser
              lb(A / 2 - 0.1, -Dp / 2 + 0.1, 0.14, 0.14, 0.02, 0xcbd5e1, H - 0.27, chrome); // head
              if (ent) { // steam: a few soft puffs that rise while the shower runs
                const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
                const puffs = [0, 1, 2, 3, 4].map(k => { const [px, pz] = at((k % 3 - 1) * A * 0.2, (k % 2 - 0.5) * Dp * 0.3); const m = new T.Mesh(new T.SphereGeometry(0.16 + 0.04 * (k % 3), 12, 10), mat); const [gx, gz] = this.w(px, pz); m.position.set(gx, 0.3, gz); this._at().add(m); return m; });
                this.steams.push({ puffs, mat, entity: ent, H, t: 0, a: 0 });
              }
            } else if (f.type === 'bathtub') {
              lb(0, 0, A, Dp, 0.55, white, 0, { r: 0.3 });
              lb(0, 0, A - 0.12, Dp - 0.12, 0.004, 0xdbe4ee, 0.55, { r: 0.2 });
              if (f.water !== false) lb(0, 0, A - 0.14, Dp - 0.14, 0.004, 0x7dd3fc, 0.556, { r: 0.05, m: 0.1, op: 0.7 });
              const [tx, tz] = at(-A / 2 + 0.03, 0); cyl(rm, tx, tz, 0.015, 0.14, 0xcbd5e1, 0.55, chrome); // tap at one end
            } else if (f.type === 'washer') {
              const H = N(f.h, 0.85), r = Math.min(A, H) * 0.3;
              lb(0, 0, A, Dp, H, white, 0, { r: 0.35 });
              lb(0, Dp / 2 + 0.004, A * 0.92, 0.008, 0.11, 0xe5e7eb, H - 0.15, { r: 0.4 }); // control panel
              lc(A * 0.3, Dp / 2 + 0.01, 0.03, 0.02, 0x94a3b8, H - 0.12, chrome); // dial (laid flat as a knob)
              // the door: a ring and a glass, facing out, and the drum behind it that turns while it runs
              const [dx2, dz2] = at(0, Dp / 2 + 0.012), dy = (H - 0.15) / 2 + 0.03;
              const g = new T.Group(); const [gx, gz] = this.w(dx2, dz2); g.position.set(gx, dy, gz); g.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[fc]; this._at().add(g);
              const disc = (rad, th, col, o, zz) => { const m = new T.Mesh(new T.CylinderGeometry(rad, rad, th, 32), M(col, o)); m.rotation.x = Math.PI / 2; m.position.z = zz; m.userData.room = rm; g.add(m); this.pick.push(m); return tag(m); };
              disc(r * 1.12, 0.02, 0xcbd5e1, chrome, 0); disc(r, 0.022, 0x1e293b, { r: 0.1, m: 0.3 }, 0.002);
              const drum = new T.Group(); drum.position.z = 0.013; g.add(drum);
              for (const [k, col] of [[0, 0x60a5fa], [2.1, 0xf472b6], [4.2, 0xfbbf24]]) { const b = new T.Mesh(new T.BoxGeometry(r * 0.55, r * 0.35, 0.004), M(col, { r: 0.9 })); b.position.set(Math.cos(k) * r * 0.42, Math.sin(k) * r * 0.42, 0); b.rotation.z = k; drum.add(b); }
              this.washers.push({ drum, entity: ent, sp: 0 });
            } else { // towel warmer: two posts and rails that glow warm while it is on
              const y0 = N(f.y, 0.4), H = Math.min(0.9, WALL_H - y0 - 0.05), mat = new T.MeshStandardMaterial({ color: C(f.color, 0xe5e7eb), roughness: 0.25, metalness: 0.7, emissive: 0xff8a3d, emissiveIntensity: 0 });
              for (const s2 of [-1, 1]) { const [px, pz] = at(s2 * (A / 2 - 0.015), 0); add(rm, new T.CylinderGeometry(0.014, 0.014, H, 12), mat, px, y0 + H / 2, pz); }
              let first = null; const n = Math.max(3, Math.round(H / 0.12));
              for (let k = 0; k < n; k++) { const [px, pz] = at(0, 0); const m = add(rm, new T.BoxGeometry(ew ? 0.018 : A - 0.03, 0.018, ew ? A - 0.03 : 0.018), mat, px, y0 + 0.05 + k * (H - 0.1) / (n - 1), pz); first ||= m; }
              if (ent) this.lamps.push({ m: first, glow: floorGlow(...at(0, 0.3), 0.5, 0xff8a3d), entity: ent, t: 0, col: new T.Color(0xff8a3d) });
            }
            break;
          }
          case 'ac': { // an AC unit: on a wall (`style: wall`), in the ceiling (`cassette`) or standing on the floor (`floor`); `facing` = where it blows
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', st = f.style || 'wall', col = C(f.color, 0xf8fafc);
            const dx = fc === 'e' ? 1 : fc === 'w' ? -1 : 0, dz = fc === 's' ? 1 : fc === 'n' ? -1 : 0, ew = !!dx;
            const mat = new T.MeshStandardMaterial({ color: col, roughness: 0.4, emissive: 0x60a5fa, emissiveIntensity: 0 });
            let unit, y;
            if (st === 'cassette') { y = WALL_H - 0.02; unit = add(rm, new T.BoxGeometry(0.6, 0.05, 0.6), mat, x, y - 0.025, z); box(rm, x, z, 0.36, 0.36, 0.006, 0x94a3b8, y - 0.056, { r: 0.6 }); }
            else if (st === 'floor') {
              const H = Math.min(1.2, WALL_H * 0.85); y = H * 0.82;
              unit = add(rm, new T.BoxGeometry(ew ? 0.3 : 0.45, H, ew ? 0.45 : 0.3), mat, x, H / 2, z);
              box(rm, x + dx * 0.152, z + dz * 0.152, ew ? 0.006 : 0.36, ew ? 0.36 : 0.006, H * 0.18, 0x334155, H * 0.72, { r: 0.5 }); // the outlet
            } else {
              y = N(f.y, WALL_H - 0.23);
              unit = add(rm, new T.BoxGeometry(ew ? 0.22 : 0.9, 0.28, ew ? 0.9 : 0.22), mat, x, y + 0.07, z);
              box(rm, x + dx * 0.111, z + dz * 0.111, ew ? 0.006 : 0.8, ew ? 0.8 : 0.006, 0.05, 0xcbd5e1, y - 0.03, { r: 0.5 }); // the flap
            }
            const n = 60, pos = new Float32Array(n * 3), life = new Float32Array(n); for (let i = 0; i < n; i++) life[i] = Math.random();
            const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
            const pts = new T.Points(g, new T.PointsMaterial({ color: 0x93c5fd, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
            this._at().add(pts);
            const [cx, cz] = this.w(x, z);
            this.acs.push({ ent: f.entities.find(e => e.startsWith('climate.')) || f.entities[0] || null, unit, pts, life, cx, cz, dx, dz, y, cas: st === 'cassette', on: 0, onT: 0 });
            break;
          }
          case 'lamp': { // floor lamp: the shade glows (in the light's colour) while its light is on
            const x = N(f.x, 0), z = N(f.z, 0), hh = N(f.h, 1.5), sc = N(f.size, 1), metal = C(f.color, 0x334155);
            cyl(rm, x, z, 0.16 * sc, 0.03, metal, 0, { r: 0.4, m: 0.5 });
            cyl(rm, x, z, 0.018, hh - 0.25 * sc, metal, 0.03, { r: 0.4, m: 0.5 });
            const mat = new T.MeshStandardMaterial({ color: C(f.shade, 0xf5e6c8), emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.8, side: T.DoubleSide });
            const m = add(rm, new T.CylinderGeometry(0.12 * sc, 0.2 * sc, 0.25 * sc, 24, 1, true), mat, x, hh - 0.125 * sc, z);
            this.lamps.push({ m, glow: floorGlow(x, z, 0.9 * sc, 0xffc27a), entity: f.entities[0] || null, t: 0, col: new T.Color(0xffc27a) });
            break;
          }
          case 'fan': { // ceiling fan: the blades turn while the fan is on
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 2.1), rad = N(f.radius, 0.6);
            cyl(rm, x, z, 0.07, 0.08, C(f.color, 0xe5e7eb), y, { r: 0.5 });
            const g = new T.Group(); const [gx, gz] = this.w(x, z); g.position.set(gx, y + 0.03, gz); this._at().add(g);
            const bm = M(C(f.blade, 0x8b6b45), { r: 0.6 });
            for (let i = 0; i < 4; i++) {
              const a = i * Math.PI / 2, b = new T.Mesh(new T.BoxGeometry(rad, 0.015, 0.12), bm);
              b.position.set(Math.cos(a) * rad / 2, 0, Math.sin(a) * rad / 2); b.rotation.y = -a; b.userData.room = rm;
              g.add(b); this.pick.push(b); tag(b);
            }
            this.fans.push({ g, entity: f.entities[0] || null, on: 0, sp: 0 });
            break;
          }
          case 'marker': { // a device with no furniture of its own (a sensor, a plug, a speaker): a dot that lights up while it is on
            const x = N(f.x, 0), z = N(f.z, 0), y = N(f.y, 0.9), col = C(f.color, 0x2dd4bf);
            cyl(rm, x, z, 0.012, y, 0x64748b, 0, { r: 0.5 });
            const m = add(rm, new T.SphereGeometry(0.09, 20, 14), new T.MeshStandardMaterial({ color: 0x1f2937, emissive: col, emissiveIntensity: 0.15, roughness: 0.4 }), x, y, z);
            this.markers.push({ m, glow: floorGlow(x, z, 0.45, col), entity: f.entities[0] || null, t: 0 });
            break;
          }
          case 'blinds': { // a blind over a window: rolls down as the cover closes (follows its position)
            const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 1), z1 = N(f.z1, 0), alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
            const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), y0 = N(f.y, 0.75), hh = N(f.h, Math.max(0.3, WALL_H - y0 - 0.04));
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            box(rm, cx, cz, alongX ? len + 0.04 : 0.09, alongX ? 0.09 : len + 0.04, 0.06, C(f.color, 0x475569), y0 + hh, { r: 0.5 });
            const geo = new T.BoxGeometry(alongX ? len : 0.025, hh, alongX ? 0.025 : len); geo.translate(0, -hh / 2, 0);
            const m = add(rm, geo, M(C(f.shade, 0xe7e5e4), { r: 0.9 }), cx, y0 + hh, cz, false);
            m.scale.y = 0.04; this.blinds.push({ m, entity: f.entities[0] || null, t: 0.04, c: 0.04 });
            break;
          }
          case 'vacuum': { // a robot vacuum: drives around its room while it cleans, back to its dock after
            // `facing`: the side the robot leaves its dock to (s by default); the dock stands against the opposite side
            const x = N(f.x, 0), z = N(f.z, 0), fc = f.facing || 's', ns = fc === 'n' || fc === 's';
            const [ox, oz] = { s: [0, 0.24], n: [0, -0.24], e: [0.24, 0], w: [-0.24, 0] }[fc] || [0, 0.24];
            box(rm, x, z, ns ? 0.36 : 0.14, ns ? 0.14 : 0.36, 0.1, 0x1f2937, 0, { r: 0.4 }); // the dock
            const g = new T.Group(); const [gx, gz] = this.w(x + ox, z + oz); g.position.set(gx, 0, gz); this._at().add(g);
            const body = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.08, 28), M(C(f.color, 0xe5e7eb), { r: 0.35 })); body.position.y = 0.05; body.castShadow = true;
            const led = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.02, 16), new T.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x2dd4bf, emissiveIntensity: 0.2 })); led.position.y = 0.1;
            body.userData.room = rm; led.userData.room = rm; g.add(body, led); this.pick.push(body); tag(body);
            this.vacuums.push({ g, led, entity: f.entities[0] || null, dock: [gx, gz], room: rm, st: 'docked', goal: null });
            break;
          }
          case 'car': { // a parked car in its painted bay; with a sensor it is there only while the car is parked
            const x = N(f.x, 0), z = N(f.z, 0), L = N(f.length, 4.3), Wd = N(f.width, 1.8), face = f.facing || 'n';
            const ang = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 }[face] ?? 0;
            // the bay: painted lines on the floor, always there
            const bay = new T.Group(); const [bx, bz] = this.w(x, z); bay.position.set(bx, 0.012, bz); bay.rotation.y = ang; this._at().add(bay);
            const paint = M(0xe2e8f0, { r: 0.9 }), bw = Wd + 0.9, bl = L + 0.9;
            for (const [px, pz, sw, sd] of [[-bw / 2, 0, 0.08, bl], [bw / 2, 0, 0.08, bl], [0, bl / 2, bw + 0.08, 0.08]]) { const pm = new T.Mesh(new T.BoxGeometry(sw, 0.01, sd), paint); pm.position.set(px, 0, pz); pm.receiveShadow = true; bay.add(pm); }
            // the car, built facing -z (north) and turned
            const car = new T.Group(); car.position.set(bx, 0, bz); car.rotation.y = ang; this._at().add(car);
            const body = M(C(f.color, 0x2563eb), { r: 0.35, m: 0.45 }), glass = M(0x0f172a, { r: 0.1, m: 0.6 }), tyre = M(0x111827, { r: 0.9 });
            const part = (geo, mat, px, py, pz) => { const m = new T.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; m.userData.room = rm; car.add(m); this.pick.push(m); tag(m); return m; };
            part(new T.BoxGeometry(Wd, 0.5, L), body, 0, 0.5, 0);
            part(new T.BoxGeometry(Wd * 0.86, 0.42, L * 0.48), glass, 0, 0.96, L * 0.06);
            part(new T.BoxGeometry(Wd * 0.88, 0.05, L * 0.5), body, 0, 1.19, L * 0.06);
            for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) { const w = part(new T.CylinderGeometry(0.33, 0.33, 0.22, 20), tyre, sx2 * (Wd / 2 - 0.05), 0.33, sz2 * L * 0.32); w.rotation.z = Math.PI / 2; }
            const lamps = [];
            for (const sx2 of [-1, 1]) {
              lamps.push(part(new T.BoxGeometry(0.34, 0.1, 0.04), new T.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xfff7d6, emissiveIntensity: 0.4 }), sx2 * Wd * 0.32, 0.6, -L / 2 - 0.01));
              part(new T.BoxGeometry(0.34, 0.1, 0.04), new T.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xef4444, emissiveIntensity: 0.5 }), sx2 * Wd * 0.32, 0.6, L / 2 + 0.01);
            }
            this.cars.push({ g: car, entity: f.entities[0] || null, state: f.parked_state, t: 1, c: null, slide: 0, dir: [Math.sin(ang), Math.cos(ang)], base: [bx, bz] });
            break;
          }
          case 'tree': { // trunk and a round crown
            const x = N(f.x, 0), z = N(f.z, 0), sc = N(f.size, 1);
            cyl(rm, x, z, 0.1 * sc, 1.1 * sc, C(f.trunk, 0x6b4a2b), 0, { r: 0.9 });
            ball(rm, x, z, 0.75 * sc, C(f.color, 0x2f6b3a), 1.55 * sc);
            ball(rm, x + 0.35 * sc, z - 0.2 * sc, 0.5 * sc, 0x3f8a4c, 1.35 * sc);
            ball(rm, x - 0.3 * sc, z + 0.25 * sc, 0.45 * sc, 0x356f40, 1.25 * sc);
            break;
          }
          case 'hedge': ext(rm, N(f.x0, 0), N(f.z0, 0), N(f.x1, 1), N(f.z1, 0.4), N(f.h, 0.9), C(f.color, 0x2f6b3a), 0, { r: 1 }); break;
          case 'pool': { // water with a white edge
            const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 3), z1 = N(f.z1, 2), e = 0.18;
            for (const [a, b, c, d] of [[x0, z0, x1, z0 + e], [x0, z1 - e, x1, z1], [x0, z0 + e, x0 + e, z1 - e], [x1 - e, z0 + e, x1, z1 - e]]) ext(rm, a, b, c, d, 0.08, 0xf1f5f9, 0, { r: 0.5 });
            const water = ext(rm, x0 + e, z0 + e, x1 - e, z1 - e, 0.05, C(f.color, 0x22d3ee), 0, { r: 0.08, m: 0.1, op: 0.85, e: 0x0e7490, ei: 0.35 });
            water.castShadow = false; this.pools.push(water);
            break;
          }
          case 'sprinkler': { // a garden sprinkler: sprays water while its valve / switch is on
            const x = N(f.x, 0), z = N(f.z, 0), rad = N(f.radius, 2);
            cyl(rm, x, z, 0.06, 0.18, 0x334155, 0, { r: 0.5, m: 0.4 });
            const NP = 140, pos = new Float32Array(NP * 3), life = new Float32Array(NP), ang2 = new Float32Array(NP);
            for (let i = 0; i < NP; i++) { life[i] = Math.random(); ang2[i] = Math.random() * Math.PI * 2; }
            const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
            const pts = new T.Points(geo, new T.PointsMaterial({ color: 0x7dd3fc, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
            this._at().add(pts);
            const [cx2, cz2] = this.w(x, z);
            this.sprinklers.push({ pts, life, ang: ang2, cx: cx2, cz: cz2, rad, entity: f.entities[0] || null, on: 0, onT: 0 });
            break;
          }
          default: console.warn('sweet-home: unknown furniture type', f.type);
        }
      } catch (err) { console.warn('sweet-home: furniture', f, err); }
      this.fmov[f.idx] = this._at().children.slice(before); curIdx = null;
      if (cur && cur.meshes.length) { // where its badge floats: above the middle of the piece
        const bb = new T.Box3(); for (const m of cur.meshes) { m.updateWorldMatrix(true, false); bb.expandByObject(m); }
        const c = bb.getCenter(new T.Vector3());
        this.fpieces.push({ ...cur, x: c.x, z: c.z, y: bb.max.y + 0.15, dyn: f.type === 'vacuum' ? this.vacuums[this.vacuums.length - 1]?.g : null });
      }
    }
    this._furnBadges();
  }

  // stairs inside x0..x1 × z0..z1; axis = direction the steps climb; mode: up | down | split (one flight up, one down)
  _stairs(f) {
    const T = this.T, N = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));
    const stone = new T.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.7 }), edge = new T.MeshStandardMaterial({ color: 0x8b7f6e, roughness: 0.6 });
    // Below the floor (a flight going down, its stairwell) is drawn only where you look into it through the hole in the
    // floor: the hole writes 1 into the stencil buffer, and those parts draw only where the stencil is 1. From the side
    // or from below nothing hangs out of the house.
    const inWell = m => Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: T.EqualStencilFunc, stencilFail: T.KeepStencilOp, stencilZFail: T.KeepStencilOp, stencilZPass: T.KeepStencilOp });
    const stoneDown = inWell(stone.clone()), edgeDown = inWell(edge.clone());
    const rail = new T.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const x0 = N(f.x0, 0), z0 = N(f.z0, 0), x1 = N(f.x1, 2), z1 = N(f.z1, 1), alongX = (f.axis || 'x') === 'x', mode = f.mode || 'up';
    const n = N(f.steps, 10), len = alongX ? x1 - x0 : z1 - z0, wid = alongX ? z1 - z0 : x1 - x0, run = len / n, rise = N(f.rise, 0.13);
    const room = f.room || null;
    const step = (along, a0, a1, y) => { // along: position along the climb; a0..a1: across
      const geo = alongX ? new T.BoxGeometry(run, 0.16, a1 - a0) : new T.BoxGeometry(a1 - a0, 0.16, run);
      const below = y < 0, s = new T.Mesh(geo, below ? stoneDown : stone); if (below) s.renderOrder = 2; const [cx, cz] = alongX ? this.w(along, (a0 + a1) / 2) : this.w((a0 + a1) / 2, along);
      s.position.set(cx, y, cz); s.castShadow = s.receiveShadow = true; s.userData.room = room; if (f.idx != null) s.userData.fi = f.idx; this._at().add(s); this.pick.push(s);
      const nose = new T.Mesh(alongX ? new T.BoxGeometry(0.03, 0.16, a1 - a0) : new T.BoxGeometry(a1 - a0, 0.16, 0.03), below ? edgeDown : edge); if (below) nose.renderOrder = 2;
      nose.position.set(cx - (alongX ? run / 2 : 0), y, cz - (alongX ? 0 : run / 2)); this._at().add(nose);
    };
    const a0 = alongX ? z0 : x0, a1 = alongX ? z1 : x1, mid = (a0 + a1) / 2, s0 = alongX ? x0 : z0;
    for (let i = 0; i < n; i++) {
      const p = s0 + run * (i + 0.5);
      if (mode === 'split') { step(p, a0 + 0.1, mid - 0.07, 0.08 + i * rise); step(p, mid + 0.07, a1 - 0.1, -0.08 - i * rise); }
      else step(p, a0 + 0.05, a1 - 0.05, mode === 'down' ? -0.08 - i * rise : 0.08 + i * rise);
    }
    if (mode === 'split') {
      const [hx, hz] = alongX ? this.w(s0 + len / 2, mid) : this.w(mid, s0 + len / 2);
      const hr = new T.Mesh(alongX ? new T.BoxGeometry(len, 0.05, 0.05) : new T.BoxGeometry(0.05, 0.05, len), rail); hr.position.set(hx, 0.95, hz); this._at().add(hr);
      for (let i = 0; i <= 4; i++) { const q = s0 + len * i / 4; const [px, pz] = alongX ? this.w(q, mid) : this.w(mid, q); const pst = new T.Mesh(new T.BoxGeometry(0.04, 0.95, 0.04), rail); pst.position.set(px, 0.475, pz); this._at().add(pst); }
    }
    // the stairwell of a flight going down: an open dark shaft under the hole in the floor
    if (f.well) {
      const [wx0, wz0, wx1, wz1] = f.well, depth = n * rise + 0.25;
      const shaft = new T.Mesh(new T.BoxGeometry(wx1 - wx0, depth, wz1 - wz0), inWell(new T.MeshStandardMaterial({ color: 0x0b1020, roughness: 1, side: T.BackSide })));
      const [sxw, szw] = this.w((wx0 + wx1) / 2, (wz0 + wz1) / 2); shaft.position.set(sxw, -depth / 2, szw); shaft.renderOrder = 2; shaft.userData.room = room; if (f.idx != null) shaft.userData.fi = f.idx;
      this._at().add(shaft);
      // the opening: invisible, it only marks the stencil where the hole in the floor is seen
      const hole = new T.Mesh(new T.PlaneGeometry(wx1 - wx0, wz1 - wz0), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: T.AlwaysStencilFunc, stencilZPass: T.ReplaceStencilOp }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(sxw, 0.001, szw); hole.renderOrder = 1; this._at().add(hole);
    }
    // arrows on the flights: teal going up, amber going down
    const arrow = (across, y, up) => {
      const sh = new T.Shape(); sh.moveTo(0, 0.22); sh.lineTo(0.16, -0.06); sh.lineTo(0.06, -0.06); sh.lineTo(0.06, -0.22); sh.lineTo(-0.06, -0.22); sh.lineTo(-0.06, -0.06); sh.lineTo(-0.16, -0.06); sh.closePath();
      const mat = new T.MeshBasicMaterial({ color: up ? 0x2dd4bf : 0xfbbf24, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
      const m = new T.Mesh(new T.ShapeGeometry(sh), up ? mat : inWell(mat));
      const along = s0 + len / 2, [ax, az] = alongX ? this.w(along, across) : this.w(across, along);
      m.rotation.x = -Math.PI / 2; // lying flat; the shape's +y points along -z
      // both point the way you walk: up the rising flight, down the sinking one (both run along +x / +z)
      m.rotation.z = alongX ? -Math.PI / 2 : Math.PI;
      m.position.set(ax, y + 0.1, az); m.renderOrder = up ? 2 : 3; this._at().add(m);
    };
    const midY = (n / 2) * rise;
    if (mode === 'split') { arrow((a0 + mid) / 2, 0.08 + midY, true); arrow((mid + a1) / 2, -0.08 - midY, false); }
    else arrow(mid, mode === 'down' ? -0.08 - midY : 0.08 + midY, mode !== 'down');
    // motion dots: one per motion sensor of the stairs, spread along the flight
    const motion = f.motion ? [].concat(f.motion) : (ROOM[room]?.motion || []);
    motion.forEach((id, i) => {
      const t = (i + 0.5) / motion.length, along = s0 + len * t, y = mode === 'down' ? -t * n * rise : t * n * rise * (mode === 'split' && i % 2 ? -1 : 1);
      const across = mode === 'split' ? (i % 2 ? (mid + a1) / 2 : (a0 + mid) / 2) : mid;
      const m = new T.Mesh(new T.SphereGeometry(0.1, 16, 16), new T.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.15 }));
      const [cx, cz] = alongX ? this.w(along, across) : this.w(across, along); m.position.set(cx, y + 0.3, cz); this._at().add(m);
      this.stairDots.push({ id, m });
    });
  }

  // a 3D file (.glb / .gltf) instead of the drawn walls and furniture; rooms (rectangles) still give the labels, lights and taps
  async _buildGltf() {
    const T = this.T, G = MODEL.gltf;
    try {
      const gltf = await new GLTFLoader().loadAsync(G.url);
      const root = gltf.scene; root.scale.setScalar(G.scale || 1); root.rotation.y = (G.rotation || 0) * Math.PI / 180;
      const off = G.offset || [0, 0, 0]; root.position.set((off[0] || 0) - CX, off[1] || 0, (off[2] || 0) - CZ);
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const rid = G.rooms[o.name] || G.rooms[o.parent?.name] || (ROOM[o.name] ? o.name : ROOM[o.parent?.name] ? o.parent.name : null); if (rid) { o.userData.room = rid; this.pick.push(o); } } });
      this.scene.add(root); this.renderer.shadowMap.needsUpdate = true; this._dirty = true;
    } catch (err) { console.warn('sweet-home: could not load the 3D file', G.url, err); this.card._toast?.('Could not load the 3D file', true); }
  }

  _buildDoors() {
    const T = this.T;
    for (const d of DOORS) {
      this._cl = d.level ?? 0;
      const pivot = new T.Group(); const [px, pz] = this.w(d.x, d.z); pivot.position.set(px, 0, pz);
      if (d.axis === 'a') { // on a slanted wall: a base turned along the wall, the leaf swings inside it
        const base = new T.Group(); base.position.copy(pivot.position); base.rotation.y = -Math.atan2(d.vz, d.vx); pivot.position.set(0, 0, 0); base.add(pivot); this._at().add(base);
        const mat = new T.MeshStandardMaterial({ color: d.main ? 0x5b3a1e : 0x6b4423, roughness: 0.5, emissive: 0xff3355, emissiveIntensity: 0 });
        const dh = Math.max(0.5, WALL_H - 0.08), panel = new T.Mesh(new T.BoxGeometry(d.w - 0.04, dh, 0.06), mat); panel.castShadow = true;
        panel.position.set(d.w / 2, dh / 2, 0); pivot.add(panel);
        this.doors.push({ d, pivot, mat, a: 0, ang: -1.35 * d.side }); continue;
      }
      const mat = new T.MeshStandardMaterial({ color: d.main ? 0x5b3a1e : 0x6b4423, roughness: 0.5, emissive: 0xff3355, emissiveIntensity: 0 });
      const dh = Math.max(0.5, WALL_H - 0.08);
      const geo = d.axis === 'z' ? new T.BoxGeometry(0.06, dh, d.w - 0.04) : new T.BoxGeometry(d.w - 0.04, dh, 0.06);
      const panel = new T.Mesh(geo, mat); panel.castShadow = true;
      if (d.axis === 'z') panel.position.set(0, dh / 2, d.dir * d.w / 2); else panel.position.set(d.dir * d.w / 2, dh / 2, 0);
      pivot.add(panel); this._at().add(pivot);
      // open angle: leaf along +z rotates toward +x with +y rotation; leaf along +x rotates toward -z
      const ang = d.axis === 'z' ? 1.35 * d.side * d.dir : -1.35 * d.side * d.dir;
      this.doors.push({ d, pivot, mat, a: 0, ang });
    }
    // smart-lock badges (house.lock_badges): green while locked, pulsing red while unlocked
    this.badges = BADGES.map(b => {
      const m = new this.T.Mesh(b.axis === 'x' ? new this.T.BoxGeometry(0.13, 0.22, 0.05) : new this.T.BoxGeometry(0.05, 0.22, 0.13), new this.T.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.5, emissive: 0x34d399, emissiveIntensity: 0 }));
      const [bx, bz] = this.w(b.x, b.z); m.position.set(bx, b.y, bz); this._cl = b.level ?? 0; this._at().add(m);
      // its name above it: tap = the lock's details; while editing, a pencil renames the badge
      let el = null;
      if (b.label) { el = document.createElement('div'); el.className = 'blbl'; el.dataset.act = 'more'; el.dataset.id = b.lock; this.lblLayer.appendChild(el); }
      return { b, m, t: 0, el, x: bx, z: bz };
    });
    // (the floor glow under the badge was removed on request, v1.12.26: the badge alone shows the state)
  }

  _buildACs() {
    const T = this.T;
    for (const r of ROOMS) {
      if (!r.ac) continue;
      this._cl = r.level;
      const { x, z, dx, dz } = r.ac;
      const unit = new T.Mesh(new T.BoxGeometry(dx ? 0.22 : 0.9, 0.28, dx ? 0.9 : 0.22), new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, emissive: 0x60a5fa, emissiveIntensity: 0 }));
      const [cx, cz] = this.w(x, z); unit.position.set(cx, 1.12, cz); unit.castShadow = true; this._at().add(unit);
      const N = 60; const pos = new Float32Array(N * 3); const life = new Float32Array(N);
      for (let i = 0; i < N; i++) life[i] = Math.random();
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const pts = new T.Points(g, new T.PointsMaterial({ color: 0x93c5fd, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      this._at().add(pts);
      this.acs.push({ ent: r.climate, unit, pts, life, cx, cz, dx, dz, y: 1.05, on: 0, onT: 0 });
    }
  }

  _labels() {
    this.lbls = {};
    for (const r of ROOMS) {
      const el = document.createElement('div'); el.className = 'lbl'; el.dataset.act = 'room'; el.dataset.room = r.id;
      this.lblLayer.appendChild(el); this.lbls[r.id] = el;
    }
  }

  // small badges over furniture that has entities: a dot, or the entity's icon while it is on / its room is open
  _furnBadges() {
    for (const P of this.fpieces) {
      if (P.f.badge === false) continue;
      const el = document.createElement('div'); el.className = 'fb'; el.dataset.act = 'furn'; el.dataset.idx = P.idx; el.dataset.id = P.f.entities[0];
      el.title = furnName(P.f); this.lblLayer.appendChild(el); P.el = el;
    }
  }

  _input() {
    const T = this.T; const el = this.cv; const ptrs = new Map(); let drag = null; let pinch = null;
    const ray = new T.Raycaster(); const v2 = new T.Vector2();
    const pickAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const hit = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object)); return hit?.object.userData.room || null;
    };
    // a furniture piece with entities under the pointer (its index), or null
    const furnAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const u = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object))?.object.userData; return u && u.furn != null ? u.furn : null;
    };
    // arrange mode: a piece under the finger is dragged across the floor instead of turning the view
    const fiAt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); const u = ray.intersectObjects(this.pick, false).find(h => this._shown(h.object))?.object.userData; return u && u.fi != null ? u.fi : null;
    };
    const floorPt = (cx, cy) => {
      const b = el.getBoundingClientRect(); v2.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(v2, this.cam); return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    };
    let mv = null;
    el.addEventListener('pointerdown', e => {
      if (!this.arrange || !e.isPrimary) return;
      const fi = fiAt(e.clientX, e.clientY), p0 = fi != null && floorPt(e.clientX, e.clientY); if (fi == null || !p0) return;
      const objs = this.fmov[fi] || [];
      mv = { fi, p0, objs, orig: objs.map(o => o.position.clone()), dx: 0, dz: 0 };
      e.stopImmediatePropagation(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
      el.style.cursor = 'grabbing'; this.lastInput = performance.now();
    }, true);
    el.addEventListener('pointermove', e => {
      if (!mv) return; e.stopImmediatePropagation();
      const p = floorPt(e.clientX, e.clientY); if (!p) return;
      const snap = v => Math.round(v / 0.1) * 0.1; mv.dx = snap(p.x - mv.p0.x); mv.dz = snap(p.z - mv.p0.z);
      mv.objs.forEach((o, i) => { o.position.x = mv.orig[i].x + mv.dx; o.position.z = mv.orig[i].z + mv.dz; });
      this.renderer.shadowMap.needsUpdate = true; this.lastInput = performance.now(); this._dirty = true;
    }, true);
    const mvEnd = e => {
      if (!mv) return; e.stopImmediatePropagation(); const m = mv; mv = null; el.style.cursor = '';
      if (Math.abs(m.dx) < 0.05 && Math.abs(m.dz) < 0.05) return;
      const undo = () => { m.objs.forEach((o, i) => o.position.copy(m.orig[i])); this.renderer.shadowMap.needsUpdate = true; this._dirty = true; };
      this.card._arrangeMove(FURN[m.fi], Math.round(m.dx * 100) / 100, Math.round(m.dz * 100) / 100, undo);
    };
    el.addEventListener('pointerup', mvEnd, true); el.addEventListener('pointercancel', e => { if (mv) { mv.dx = mv.dz = 0; mvEnd(e); } }, true);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      // a new first finger means no other pointer is really down: drop any that never sent pointerup
      // (otherwise a stale one turned every later tap into a "pinch" and taps on the canvas did nothing)
      if (e.isPrimary) { ptrs.clear(); pinch = null; drag = null; }
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastInput = performance.now();
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), pan: e.button === 2 || e.shiftKey, moving: false, far: 0 };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.goal.radius, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; }
    });
    el.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.goal.radius = clamp(pinch.r * pinch.d / d, SPAN * 0.5, SPAN * 4.5);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; this._pan(mx - pinch.mx, my - pinch.my); pinch.mx = mx; pinch.my = my;
        this.lastInput = performance.now(); return;
      }
      if (drag) {
        // a finger jitters a few px during a tap: ignore movement until it clearly becomes a drag
        drag.far = Math.max(drag.far, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
        if (!drag.moving) { if (drag.far < (e.pointerType === 'touch' ? 14 : 6)) return; drag.moving = true; }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) this._pan(dx, dy);
        else { this.goal.theta -= dx * 0.006; this.goal.phi = clamp(this.goal.phi - dy * 0.005, 0.12, 1.32); }
        this.lastInput = performance.now();
      } else if (e.pointerType === 'mouse') {
        const now = performance.now(); if (now - (this._lh || 0) < 50) return; this._lh = now;
        const r = pickAt(e.clientX, e.clientY), fi = furnAt(e.clientX, e.clientY);
        if (r !== this.hover || fi !== this.hoverF) { this.hover = r; this.hoverF = fi; el.style.cursor = r || fi != null ? 'pointer' : 'grab'; this.sync(); }
        if (this.arrange) el.style.cursor = fiAt(e.clientX, e.clientY) != null ? 'move' : 'grab';
      }
    });
    const up = e => {
      if (!ptrs.delete(e.pointerId)) return;
      if (drag && !drag.moving && e.type === 'pointerup' && performance.now() - drag.t < 800) {
        const fi = furnAt(drag.sx, drag.sy); this.card._cvTap = performance.now(); this.card.haptic('selection');
        if (fi != null) this.card._selectFurn(fi);
        else { const r = pickAt(drag.sx, drag.sy); this.card._select(r && r === this.sel ? null : r); }
      }
      if (ptrs.size < 2) pinch = null; drag = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('pointerleave', () => { this.hover = null; this.hoverF = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.goal.radius = clamp(this.goal.radius * (1 + Math.sign(e.deltaY) * 0.09), SPAN * 0.5, SPAN * 4.5); this.lastInput = performance.now(); }, { passive: false });
  }
  _pan(dx, dy) {
    const T = this.T; const k = this.orbit.radius * 0.0016;
    const fwd = new T.Vector3(Math.sin(this.orbit.theta), 0, Math.cos(this.orbit.theta));
    const right = new T.Vector3(fwd.z, 0, -fwd.x);
    this.goal.target.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k); // the house follows the fingers (was reversed until v1.12.13)
    this.goal.target.x = clamp(this.goal.target.x, -SPAN * 0.8, SPAN * 0.8); this.goal.target.z = clamp(this.goal.target.z, -SPAN * 0.8, SPAN * 0.8);
  }

  view(v) {
    this._dirty = true;
    this.vmode = v === 'top' ? 'top' : '3d';
    this.card._select(null);
    if (v === 'top') Object.assign(this.goal, { phi: 0.08, radius: this._topR(), theta: 0 });
    else Object.assign(this.goal, { phi: 0.92, radius: this.baseR || 27, theta: this.defTheta ?? -0.55 });
    this.goal.target.set(0, 0, 0);
  }
  _topR() {
    const tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * this.cam.aspect;
    return clamp(Math.max((PLAN_D / 2 + 0.8) / tv, (PLAN_W / 2 + 0.8) / th), 8, SPAN * 5);
  }
  toggleSpin() { this.spin = !this.spin; this.lastInput = 0; return this.spin; }
  setMode(m) { this.mode = m; this._dirty = true; }
  select(id) {
    this._dirty = true;
    this.sel = id;
    if (id) { const R = this.rooms[id]; this.goal.target.set(R.cx, 0, R.cz); this.goal.radius = (this.baseR || 27) * (R.r.zoom || 0.62); this.goal.phi = Math.min(this.goal.phi, 0.95); }
    else if (this.vmode === 'top') { this.goal.target.set(0, 0, 0); this.goal.radius = this._topR(); }
    else { this.goal.target.set(0, 0, 0.5); this.goal.radius = this.baseR || 27; }
  }

  sync() {
    const c = this.card; const T = this.T;
    for (const id in this.rooms) {
      const R = this.rooms[id]; const r = R.r;
      R.motion = c.roomMotion(r) ? 1 : 0;
      if (r.lightFx) {
        const onOf = type => (r.lights || []).filter(l => (r.lightFx[l] || 'center') === type && c.v(l) === 'on');
        const level = id => { const b = c.s(id)?.attributes.brightness; return b ? 0.35 + 0.65 * b / 255 : 1; };
        const colOf = (id, dflt) => { const rc = c.s(id)?.attributes.rgb_color; return rc ? new T.Color(rc[0] / 255, rc[1] / 255, rc[2] / 255) : new T.Color(dflt); };
        const cen = onOf('center'), str = onOf('strip'), tv = onOf('tv'), spots = onOf('spots');
        R.spotT = spots.length ? level(spots[0]) : 0;
        R.litT = cen.length ? 1 : 0;
        R.stripT = str.length ? level(str[0]) : 0; if (str.length) R.stripCol.copy(colOf(str[0], 0xffb86b));
        R.tvT = tv.length ? level(tv[0]) : 0; if (tv.length) R.tvCol.copy(colOf(tv[0], 0x7dd3fc));
        R.anyLit = cen.length + str.length + tv.length + spots.length > 0 ? 1 : 0;
      } else { R.litT = c.roomLit(r) ? 1 : 0; R.anyLit = R.litT; }
      R.temp = r.temp ? c.n(r.temp) : null;
      const el = this.lbls[id]; const t = R.temp, h = r.hum ? c.n(r.hum) : null;
      const ac = r.climate && c.climOn(r.climate), acm = ac ? acMode(c.s(r.climate)) : '';
      const chg = (r.plugs || []).some(p => c.v(p.id) === 'on' && (c.n(p.power) ?? 0) > 1.5);
      const lk = (r.locks || []).map(l => c.v(l)); const unl = lk.includes('unlocked'), lkd = lk.length && lk.every(s => s === 'locked');
      const dOpen = (r.doors || []).some(d => c.v(d) === 'on');
      const sig = [t, h, R.anyLit, R.motion, acm, chg, unl, lkd, dOpen, this.mode, this.sel === id].join('|');
      if (el._sig !== sig) {
        el._sig = sig;
        el.className = `lbl ${R.anyLit ? 'lit' : ''} ${R.motion ? 'mo' : ''} ${this.sel === id ? 'sel' : ''} ${t == null ? 'nodata' : ''}`;
        el.innerHTML = `<b>${esc(r.name)}</b>${t != null ? `<span class="t" style="color:${rgb(tempRGB(t))}">${t.toFixed(1)}°</span>` : ''}${h != null ? `<span class="h">${Math.round(h)}%</span>` : ''}
          <span class="ics">${R.anyLit ? '<ha-icon icon="mdi:lightbulb-on"></ha-icon>' : ''}${ac ? acIcon(c.s(r.climate)) : ''}${R.motion ? '<ha-icon class="mo" icon="mdi:motion-sensor"></ha-icon>' : ''}${chg ? '<ha-icon class="chg" icon="mdi:battery-charging"></ha-icon>' : ''}${unl ? '<ha-icon class="unl" icon="mdi:lock-open-variant"></ha-icon>' : lkd ? '<ha-icon class="lkd" icon="mdi:lock"></ha-icon>' : ''}${dOpen ? '<ha-icon class="unl" icon="mdi:door-open"></ha-icon>' : ''}</span>`;
      }
    }
    for (const B of this.badges || []) {
      const v = c.v(B.b.lock); B.t = v === 'locked' ? 1 : v === 'unlocked' ? 2 : 0;
      if (B.el) {
        const nm = B.b.name || c.s(B.b.lock)?.attributes.friendly_name || B.b.lock, sig = `${nm}|${B.t}|${c._editing ? 1 : 0}`;
        if (B.el._sig !== sig) {
          B.el._sig = sig; B.el.className = `blbl ${B.t === 2 ? 'unl' : B.t === 1 ? 'lkd' : 'na'}`;
          B.el.innerHTML = `${ic(B.t === 2 ? 'mdi:lock-open-variant' : 'mdi:lock')}<span>${esc(nm)}</span>${c._editing && c._hass?.user?.is_admin ? `<button class="edit-only" data-act="rnbadge" data-i="${B.b.i}" title="${tr('Rename')}" aria-label="${tr('Rename')}">${ic('mdi:pencil-outline')}</button>` : ''}`;
        }
      }
    }
    // phones on chargers: 0 = plug off, 1 = plug on (idle), 2 = charging
    for (const P of this.chargers || []) P.t = !P.plug || c.v(P.plug) !== 'on' ? 0 : !P.power || !c.s(P.power) ? 2 : (c.n(P.power) ?? 0) > P.min ? 2 : 1; // no power reading: plug on = charging
    this.lockT = (this.badges || []).map(B => B.t).join(); this.phoneT = (this.chargers || []).map(P => P.t).join();
    for (const D of this.doors) D.openT = c.v(D.d.id) === 'on' ? 1 : 0;
    for (const A of this.acs) {
      const st = c.s(A.ent); A.onT = A.ent && c.climOn(A.ent) ? 1 : 0;
      const am = acMode(st), col = am === 'heat' ? 0xfb923c : am === 'dry' ? 0xfde68a : am === 'fan_only' ? 0xe0e7ff : am === 'auto' || am === 'heat_cool' ? 0x6ee7b7 : 0x93c5fd;
      A.pts.material.color.setHex(col); A.unit.material.emissive.setHex(col);
    }
    // washing machines turn their drum while they run (a plug that draws power, a status that is not idle); showers steam
    const runs = id => { const v = String(c.v(id) ?? '').toLowerCase(), n = c.n(id); return id.startsWith('sensor.') && n != null ? n > 5 : ['on', 'running', 'washing', 'wash', 'rinse', 'rinsing', 'spin', 'spinning', 'drying', 'heat', 'heating', 'active'].includes(v); };
    for (const W of this.washers || []) W.on = W.entity && runs(W.entity) ? 1 : 0;
    for (const S of this.steams || []) { const n = c.n(S.entity); S.t = S.entity.startsWith('sensor.') ? (n != null && n > 70 ? 1 : 0) : S.entity.startsWith('water_heater.') ? (['off', 'idle'].includes(c.v(S.entity)) || BAD.includes(c.v(S.entity) ?? '') ? 0 : 1) : runs(S.entity) ? 1 : 0; }
    for (const tv of this.tvs || []) tv.on = c.v(tv.entity || E.media.tv) === 'playing' ? 1 : 0;
    // lamps glow in their light's colour and brightness, fans turn at their speed, device dots light up
    for (const L of this.lamps || []) {
      const st = c.s(L.entity), on = st?.state === 'on';
      L.t = on ? (st.attributes.brightness ? 0.35 + 0.65 * st.attributes.brightness / 255 : 1) : 0;
      const rc = st?.attributes.rgb_color; L.col.setRGB(...(rc ? rc.map(x => x / 255) : [1, 0.76, 0.48]));
    }
    // blinds: how far down (0 open … 1 closed); robot vacuums: what they are doing
    for (const B of this.blinds || []) { const st = c.s(B.entity); if (!st) continue; const p = st.attributes.current_position; B.t = Math.max(0.04, p != null ? 1 - p / 100 : st.state === 'closed' ? 1 : st.state === 'closing' ? 0.6 : 0.04); }
    for (const V of this.vacuums || []) V.st = c.v(V.entity) || 'docked';
    for (const K of this.cars || []) { K.t = c.carParked(K.entity, K.state) ? 1 : 0; if (K.c == null) { K.c = K.t; K.g.visible = !!K.t; } }
    for (const S of this.sprinklers || []) S.onT = S.entity && ['on', 'open', 'opening'].includes(c.v(S.entity)) ? 1 : 0;
    for (const F of this.fans || []) { const st = c.s(F.entity); F.on = st?.state === 'on' ? 1 : 0; F.sp = F.on ? 0.5 + 1.5 * ((st.attributes.percentage ?? 60) / 100) : 0; }
    for (const P of this.markers || []) { const v = c.v(P.entity); P.t = BAD.includes(v ?? '') ? -1 : c.on(P.entity) || (P.entity.startsWith('climate.') && c.climOn(P.entity)) ? 1 : 0; }
    const ids0 = P => P.f.entities[0];
    // furniture badges: a dot; the entity's icon while it is on, its room is open or the pointer is over it
    for (const P of this.fpieces || []) {
      if (!P.el) continue;
      const car = P.f.type === 'car', parked = car && c.carParked(ids0(P), P.f.parked_state);
      const ids = P.f.entities, act = car ? parked : ids.some(id => c.on(id) || (id.startsWith('climate.') && c.climOn(id))), na = ids.every(id => BAD.includes(c.v(id) ?? ''));
      const big = act || this.sel === P.f.room || this.hoverF === P.idx;
      const st = c.s(ids[0]), icon = P.f.icon || (car ? (parked ? 'mdi:car' : 'mdi:car-off') : st ? st.attributes.icon || domIcon(ids[0].split('.')[0], st.state, st.attributes) : furnIcon(P.f));
      const sig = [act, na, big, icon].join('|');
      if (P.el._sig !== sig) { P.el._sig = sig; P.el.className = `fb ${act ? 'on' : ''} ${na ? 'na' : ''} ${big ? 'big' : ''}`; P.el.innerHTML = big ? ic(icon) : ''; }
    }
    this.tvOn = (this.tvs || []).some(tv => tv.on) ? 1 : 0;
    for (const s of this.stairDots) s.on = c.v(s.id) === 'on';
    // day / night from sun
    const el = c.s(E.sun)?.attributes.elevation; const day = el == null ? 0.6 : clamp((el + 6) / 24, 0, 1);
    this.day = day;
    const dv = day.toFixed(2); if (this._dayV !== dv) { this._dayV = dv; this.vp.style.setProperty('--day', dv); }
    // battery: HA pushes state changes all the time; redraw only when something the scene shows changed
    const sg = [Object.values(this.rooms).map(R => [R.litT, R.stripT || 0, R.spotT || 0, R.tvT || 0, R.stripCol ? R.stripCol.getHex() : 0, R.tvCol ? R.tvCol.getHex() : 0, R.motion, R.anyLit, R.temp]),
      this.lockT, this.phoneT, this.doors.map(D => D.openT), (this.lamps || []).map(L => [L.t, L.col.getHex()]), (this.fans || []).map(F => F.sp), (this.markers || []).map(P => P.t), (this.blinds || []).map(B => B.t), (this.vacuums || []).map(V => V.st), (this.cars || []).map(K => K.t), (this.sprinklers || []).map(S => S.onT), (this.washers || []).map(W => W.on), (this.steams || []).map(S => S.t), this.hoverF, this.acs.map(A => [A.onT, A.pts.material.color.getHex()]), this.tvOn, this.stairDots.map(x => x.on), dv, this.mode, this.sel].join();
    if (sg !== this._syncSig) { this._syncSig = sg; this._dirty = true; }
  }

  _resize() {
    this._dirty = true; if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    const w = this.vp.clientWidth, h = this.vp.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h;
    const a = w / h;
    this.cam.fov = a < 0.75 ? 46 : 38; this.cam.updateProjectionMatrix();
    const tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * a;
    const portrait = a < 0.9;
    const hw = PLAN_W / 2 + 1.1, hd = PLAN_D / 2 + 1.6, big = Math.max(PLAN_W, PLAN_D);
    const nb = portrait ? clamp(Math.max(hw / th, hd / tv) * 0.95, 8, SPAN * 4) : clamp(Math.max(big * 0.73 / th, big * 0.6 / tv) * 0.88, 8, SPAN * 4);
    const nt = portrait ? -0.2 : -0.55;
    const first = this.defTheta === undefined, top = this.vmode === 'top';
    if (top) {
      // keep the floor plan framed while the user hasn't moved the camera away from it
      if (!this.sel && (first || (Math.abs(this.goal.phi - 0.08) < 0.01 && Math.abs(this.goal.theta) < 0.01))) Object.assign(this.goal, { phi: 0.08, theta: 0, radius: this._topR() });
    } else if (first) {
      Object.assign(this.goal, { phi: 0.92, theta: nt, radius: nb });
    } else {
      if (!this.sel && Math.abs(this.goal.theta - this.defTheta) < 0.01) this.goal.theta = nt;
      if (!this.sel && Math.abs(this.goal.radius - (this.baseR || 27)) < 0.5) this.goal.radius = nb;
    }
    if (first) Object.assign(this.orbit, { theta: this.goal.theta, phi: this.goal.phi, radius: this.goal.radius });
    this.defTheta = nt;
    this.baseR = nb;
  }

  _frame(dt) {
    const T = this.T; const now = performance.now(); const tt = now / 1000;
    const k = 1 - Math.exp(-dt * 6);
    if (this.spin && now - this.lastInput > 2500) this.goal.theta += dt * 0.12;
    const o = this.orbit, g = this.goal;
    let mv = Math.abs(g.theta - o.theta) + Math.abs(g.phi - o.phi) + Math.abs(g.radius - o.radius) * 0.05 + o.target.distanceTo(g.target) * 0.05;
    let anim = false;
    o.theta += (g.theta - o.theta) * k; o.phi += (g.phi - o.phi) * k; o.radius += (g.radius - o.radius) * k; o.target.lerp(g.target, k);
    const sp = Math.sin(o.phi);
    this.cam.position.set(o.target.x + o.radius * sp * Math.sin(o.theta), o.target.y + o.radius * Math.cos(o.phi), o.target.z + o.radius * sp * Math.cos(o.theta));
    this.cam.lookAt(o.target);

    const day = this.day ?? 0.6;
    this.hemi.intensity = 1.05 + 0.5 * day;
    this.sun.intensity = 1.1 + 1.6 * day;
    this.sun.color.setRGB(0.65 + 0.35 * day, 0.72 + 0.26 * day, 1.0 - 0.12 * day);
    this.renderer.toneMappingExposure = 0.95 + 0.15 * day;

    const warm = new T.Color(0xffb86b);
    for (const id in this.rooms) {
      const R = this.rooms[id];
      mv += Math.abs(R.litT - R.lit) + Math.abs((R.stripT || 0) - (R.stripL || 0)) + Math.abs((R.spotT || 0) - (R.spotL || 0)) + Math.abs((R.tvT || 0) - (R.tvL || 0));
      R.lit += (R.litT - R.lit) * Math.min(1, dt * 4);
      const sel = this.sel === id, hov = this.hover === id;
      mv += Math.abs((sel ? 1 : hov ? 0.5 : 0) - R.hl);
      if (R.hl > 0.01 || R.motion) anim = true; // pulsing outline / motion ring
      R.hl += ((sel ? 1 : hov ? 0.5 : 0) - R.hl) * Math.min(1, dt * 8);
      // floor tint by mode
      let target, emis, ei = 0;
      if (this.mode === 'climate') {
        const c = tempRGB(R.temp); target = R.temp == null ? new T.Color(0.45, 0.48, 0.55) : new T.Color(c[0] / 255, c[1] / 255, c[2] / 255);
        emis = target; ei = R.temp == null ? 0 : 0.35;
      } else if (this.mode === 'presence') {
        target = R.motion ? new T.Color(0.4, 0.95, 0.85) : new T.Color(0.5, 0.55, 0.62); emis = new T.Color(0x14b8a6); ei = R.motion ? 0.35 + 0.2 * Math.sin(tt * 4) : 0;
      } else {
        target = new T.Color(1, 1, 1); emis = warm; ei = R.lit * 0.22 + (R.stripL || 0) * 0.06;
      }
      mv += Math.abs(R.col.r - target.r) + Math.abs(R.col.g - target.g) + Math.abs(R.col.b - target.b);
      R.col.lerp(target, Math.min(1, dt * 5));
      for (const m of R.mats) { m.color.copy(R.col); m.emissive.copy(emis).multiplyScalar(ei + R.hl * 0.12); }
      const lightsMode = this.mode === 'lights' ? 1 : 0.55;
      R.pl.intensity = R.lit * 9 * lightsMode;
      R.lamp.material.emissiveIntensity = R.lit * 2.5;
      R.halo.material.opacity = R.lit * 0.35;
      if (R.strip) { // LED strip along the walls
        R.stripL += (R.stripT - R.stripL) * Math.min(1, dt * 4);
        R.strip.lineMat.color.lerp(R.stripCol, Math.min(1, dt * 5)); R.strip.pl.color.copy(R.strip.lineMat.color);
        for (const p of R.strip.planes) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.4 * lightsMode; }
        for (const p of R.strip.washes) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.5 * lightsMode; } // v1.21.12: was 0.75
        for (const p of R.strip.ribbons) { p.material.color.copy(R.strip.lineMat.color); p.material.opacity = R.stripL * 0.65 * lightsMode; } // v1.21.12: was 0.9
        R.strip.lineMat.opacity = Math.min(1, R.stripL * 1.4);
        R.strip.pl.intensity = R.stripL * 1.2 * lightsMode; // v1.20.0: faint tint only (was 5 — it painted the whole room)
      }
      if (R.spots) { // side lights (ceiling spots)
        R.spotL += (R.spotT - R.spotL) * Math.min(1, dt * 4);
        R.spots.discMat.emissiveIntensity = R.spotL * 3;
        R.spots.poolMat.opacity = R.spotL * 0.55 * lightsMode;
        R.spots.beamMat.opacity = R.spotL * 0.07 * lightsMode;
        R.spots.pl.intensity = R.spotL * 7 * lightsMode;
      }
      if (R.tv) { // TV backlight
        R.tvL += (R.tvT - R.tvL) * Math.min(1, dt * 4);
        R.tv.plane.material.color.lerp(R.tvCol, Math.min(1, dt * 5)); R.tv.pl.color.copy(R.tv.plane.material.color);
        R.tv.plane.material.opacity = R.tvL; R.tv.sm.color.copy(R.tv.plane.material.color); R.tv.sm.opacity = Math.min(1, R.tvL * 1.4);
        R.tv.pl.intensity = R.tvL * 9 * lightsMode;
      }
      R.outline.material.opacity = R.hl * (0.6 + 0.4 * Math.sin(tt * 3));
      const showRing = R.motion && (this.mode !== 'lights' || true);
      const ph = (tt * 0.8) % 1;
      R.ring.material.opacity = showRing ? (1 - ph) * 0.8 : 0;
      R.ring.scale.setScalar(showRing ? 1 + ph * 2.5 : 1);
    }
    for (const D of this.doors) {
      const dd = Math.abs((D.openT || 0) - D.a); mv += dd; if (D.openT) anim = true;
      if (dd > 0.0005) this.renderer.shadowMap.needsUpdate = true; // a moving door changes its shadow
      D.a += ((D.openT || 0) - D.a) * Math.min(1, dt * 4);
      D.pivot.rotation.y = D.a * D.ang;
      D.mat.emissiveIntensity = D.a * (0.4 + 0.3 * Math.sin(tt * 5));
    }
    for (const A of this.acs) {
      mv += Math.abs(A.onT - A.on); if (A.on > 0.01) anim = true;
      A.on += (A.onT - A.on) * Math.min(1, dt * 3);
      A.unit.material.emissiveIntensity = A.on * 0.6;
      A.pts.material.opacity = A.on * 0.85;
      if (A.on > 0.01) {
        const p = A.pts.geometry.attributes.position.array;
        for (let i = 0; i < A.life.length; i++) {
          A.life[i] += dt * 0.45; if (A.life[i] > 1) A.life[i] -= 1;
          const l = A.life[i]; const spread = (((i * 7919) % 100) / 100 - 0.5) * 0.8;
          const dist = 0.2 + l * (A.cas ? 1.6 : 2.6);
          const [ddx, ddz] = A.cas ? [[1, 0], [-1, 0], [0, 1], [0, -1]][i % 4] : [A.dx, A.dz]; // a ceiling cassette blows out on its four sides
          p[i * 3] = A.cx + ddx * dist + (ddz ? spread * (1 + l) : 0);
          p[i * 3 + 1] = A.y - l * Math.min(0.9, A.y - 0.1) + Math.sin(l * 6 + i) * 0.05;
          p[i * 3 + 2] = A.cz + ddz * dist + (ddx ? spread * (1 + l) : 0);
        }
        A.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const B of this.badges || []) {
      const unl = B.t === 2; B.m.material.emissive.setHex(unl ? 0xfb7185 : 0x34d399);
      B.m.material.emissiveIntensity = (unl ? 0.7 + 0.5 * Math.sin(tt * 5) : B.t === 1 ? 0.8 : 0) * 1.6;
      if (unl) anim = true;
    }
    for (const P of this.chargers || []) {
      for (const q of P.parts) q.visible = P.t === 2; // the phone is there only while it is plugged in and charging
      const pt = P.t === 2 ? 1.1 + 0.6 * Math.sin(tt * 2.5) : 0;
      P.m.material.emissiveIntensity += (pt - P.m.material.emissiveIntensity) * Math.min(1, dt * 5);
      P.glow.material.opacity = Math.max(0, P.m.material.emissiveIntensity - 0.3) * 0.35;
      if (P.t === 2 || P.m.material.emissiveIntensity > 0.01) anim = true;
    }
    for (const tv of this.tvs || []) {
      const t = tv.on ? 0.9 + 0.25 * Math.sin(tt * 7) * Math.sin(tt * 2.3) : 0; tv.m.material.emissiveIntensity += (t - tv.m.material.emissiveIntensity) * Math.min(1, dt * 6);
      if (tv.on || tv.m.material.emissiveIntensity > 0.01) anim = true;
    }
    for (const L of this.lamps || []) {
      const d = L.t - L.m.material.emissiveIntensity / 1.6; mv += Math.abs(d);
      L.m.material.emissiveIntensity += d * 1.6 * Math.min(1, dt * 5);
      L.m.material.emissive.lerp(L.col, Math.min(1, dt * 5)); L.glow.material.color.copy(L.m.material.emissive);
      L.glow.material.opacity = (L.m.material.emissiveIntensity / 1.6) * 0.32 * (this.mode === 'lights' ? 1 : 0.55);
    }
    for (const F of this.fans || []) { if (F.sp) { F.g.rotation.y -= dt * F.sp * 6; anim = true; } }
    for (const W of this.washers || []) { W.sp += ((W.on ? 5 : 0) - W.sp) * Math.min(1, dt * 1.5); if (W.sp > 0.01) { W.drum.rotation.z -= dt * W.sp; anim = true; } }
    for (const S of this.steams || []) {
      S.a += (S.t - S.a) * Math.min(1, dt * 1.2); S.mat.opacity = S.a * 0.22; if (S.a < 0.01 && !S.t) continue; anim = true;
      S.puffs.forEach((m, k) => { const l = (tt * 0.25 + k / S.puffs.length) % 1; m.position.y = 0.4 + l * (S.H - 0.3); m.scale.setScalar(0.6 + l * 0.9); });
    }
    for (const K of this.cars || []) { // a car arriving drives into its bay from behind; one leaving drives off forwards
      if (K.c == null) { K.c = K.t; K.g.visible = !!K.t; K.slide = 0; } // the first state: no animation
      else if (K.t !== K.c) { K.c = K.t; K.slide = K.t ? 3.5 : 0; K.g.visible = true; }
      if (K.c && K.slide > 0.002) { K.slide += -K.slide * Math.min(1, dt * 2.5); anim = true; mv += 0.05; }
      else if (!K.c && K.g.visible) { K.slide += dt * 4; anim = true; mv += 0.05; if (K.slide > 3.5) K.g.visible = false; }
      const off = K.c ? K.slide : -K.slide; // + behind the car, − in front of it
      K.g.position.x = K.base[0] + K.dir[0] * off; K.g.position.z = K.base[1] + K.dir[1] * off;
    }
    for (const S of this.sprinklers || []) {
      S.on += (S.onT - S.on) * Math.min(1, dt * 3); S.pts.material.opacity = S.on * 0.85;
      if (S.on > 0.01) {
        anim = true; const p = S.pts.geometry.attributes.position.array;
        for (let i = 0; i < S.life.length; i++) {
          S.life[i] += dt * 0.7; if (S.life[i] > 1) { S.life[i] -= 1; S.ang[i] = Math.random() * Math.PI * 2; }
          const l = S.life[i], r = l * S.rad;
          p[i * 3] = S.cx + Math.cos(S.ang[i]) * r; p[i * 3 + 1] = 0.2 + Math.sin(l * Math.PI) * 0.7; p[i * 3 + 2] = S.cz + Math.sin(S.ang[i]) * r;
        }
        S.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const B of this.blinds || []) { const d = B.t - B.c; if (Math.abs(d) > 0.002) { B.c += d * Math.min(1, dt * 3); B.m.scale.y = B.c; mv += Math.abs(d); } }
    for (const V of this.vacuums || []) {
      const p = V.g.position, cleaning = V.st === 'cleaning';
      if (cleaning) { // wander: a new random spot in the room each time it gets there
        if (!V.goal || Math.hypot(V.goal[0] - p.x, V.goal[1] - p.z) < 0.05) {
          const rs = ROOM[V.room]?.rects || [[0, 0, 1, 1]], q = rs[Math.floor(Math.random() * rs.length)];
          V.goal = this.w(q[0] + 0.3 + Math.random() * Math.max(0, q[2] - q[0] - 0.6), q[1] + 0.3 + Math.random() * Math.max(0, q[3] - q[1] - 0.6));
        }
      } else V.goal = V.st === 'returning' || Math.hypot(V.dock[0] - p.x, V.dock[1] - p.z) > 0.02 ? V.dock : null;
      if (V.goal) {
        const dx = V.goal[0] - p.x, dz = V.goal[1] - p.z, d = Math.hypot(dx, dz), step = Math.min(d, dt * 0.45);
        if (d > 0.001) { p.x += dx / d * step; p.z += dz / d * step; V.g.rotation.y = Math.atan2(dx, dz); anim = true; mv += step; }
      }
      V.led.material.emissive.setHex(cleaning ? 0x2dd4bf : V.st === 'error' ? 0xf43f5e : V.st === 'returning' ? 0xfbbf24 : 0x64748b);
      V.led.material.emissiveIntensity = cleaning ? 1 + 0.6 * Math.sin(tt * 4) : 0.5; if (cleaning) anim = true;
    }
    for (const P of this.markers || []) {
      const t = P.t === 1 ? 1.1 + 0.4 * Math.sin(tt * 3) : P.t === -1 ? 0 : 0.15;
      P.m.material.emissiveIntensity += (t - P.m.material.emissiveIntensity) * Math.min(1, dt * 5);
      P.glow.material.opacity = P.t === 1 ? 0.25 : 0; if (P.t === 1) anim = true;
    }
    if (this.tvOn || this.stairDots.some(s => s.on) || this.mode === 'presence') anim = true;
    this._busy = mv > 0.002; this._anim = anim;
    for (const s of this.stairDots) { s.m.material.opacity = s.on ? 0.6 + 0.4 * Math.sin(tt * 6) : 0.12; s.m.scale.setScalar(s.on ? 1.6 : 1); }

    this.renderer.render(this.scene, this.cam);
    // labels
    const W = this.vp.clientWidth, H = this.vp.clientHeight; const v = new T.Vector3();
    for (const id in this.rooms) {
      const R = this.rooms[id]; const el = this.lbls[id];
      v.set(R.cx, R.r.labelY ?? 1.75, R.cz).project(this.cam);
      if (v.z > 1 || R.r.level !== this.level) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
    for (const B of this.badges || []) { // lock badge names, just above the badge
      if (!B.el) continue;
      v.set(B.x, B.b.y + 0.2, B.z).project(this.cam);
      if (v.z > 1 || (B.b.level ?? 0) !== this.level) { B.el.style.display = 'none'; continue; }
      B.el.style.display = '';
      B.el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
    for (const P of this.fpieces || []) {
      if (!P.el) continue;
      if (P.dyn) v.set(P.dyn.position.x, P.y, P.dyn.position.z); else v.set(P.x, P.y, P.z);
      v.project(this.cam);
      if (v.z > 1 || (P.f.level ?? 0) !== this.level) { P.el.style.display = 'none'; continue; }
      P.el.style.display = '';
      P.el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const CSS = `
:host{display:block;--bg:#060a14;--panel:rgba(17,24,43,.58);--panel2:rgba(255,255,255,.04);--line:rgba(255,255,255,.08);--tx:#e7ecf6;--mu:#8b97b2;--teal:#2dd4bf;--amber:#fbbf24;--rose:#fb7185;--violet:#a78bfa;--blue:#60a5fa;--green:#34d399;
  font-family:Inter,'Segoe UI',Roboto,system-ui,sans-serif;color:var(--tx);-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
ha-icon{--mdc-icon-size:20px;display:inline-flex}
small{font-size:.62em;font-weight:500;opacity:.7;margin-left:2px}
.app{position:relative;min-height:100vh;background:radial-gradient(1200px 700px at 15% -10%,#17305e 0%,transparent 60%),radial-gradient(900px 600px at 100% 10%,#3b1b52 0%,transparent 55%),radial-gradient(900px 700px at 50% 120%,#0d3b44 0%,transparent 60%),var(--bg);overflow:clip;padding:22px 26px 10px}
.aurora{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35;pointer-events:none;animation:drift 26s ease-in-out infinite alternate}
.a1{width:520px;height:520px;background:#2563eb;top:-160px;left:20%}
.a2{width:420px;height:420px;background:#9333ea;top:30%;right:-140px;animation-delay:-8s}
.a3{width:460px;height:460px;background:#0d9488;bottom:-200px;left:-120px;animation-delay:-16s}
@keyframes drift{to{transform:translate(80px,60px) scale(1.15)}}
@media (hover:none){.tile:active,.ibtn:active,.pick:active,.opt:active,.gl:active,.tb:active,.abtn:active{filter:brightness(1.3)}}
@media (pointer:coarse){.aurora{animation:none}.fl.act{animation-timing-function:steps(8)}.pulse,.valve.on .drops{animation-timing-function:steps(6)}.np.playing .eq i{animation-timing-function:steps(4)}.car.charging .cbarf{animation-timing-function:steps(12)}} /* battery: a drifting backdrop makes every card's backdrop blur recompute each frame, forever */
.top{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px;flex-wrap:wrap}
.greet{font-size:15px;color:var(--mu);font-weight:500;letter-spacing:.2px}
.clock{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.clock #time{font-size:52px;font-weight:700;letter-spacing:-2px;line-height:1.05;background:linear-gradient(120deg,#fff 30%,#a5b4fc 70%,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.clock .date{font-size:16px;color:var(--mu);font-weight:500}
.hdr-right{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.chip{display:flex;align-items:center;gap:8px;height:42px;box-sizing:border-box;padding:0 14px 0 7px;border-radius:999px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.chip>ha-icon{--mdc-icon-size:16px;width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;color:var(--c,var(--mu));background:color-mix(in srgb,var(--c,#94a3b8) 18%,transparent)}
.chip.big{padding:0 15px 0 7px;gap:8px}.chip.big>ha-icon{--mdc-icon-size:20px;--c:#fde68a}.chip.big div{display:flex;flex-direction:column;line-height:1.05}.chip.big b{font-size:14.5px}.chip.big span{font-size:10.5px;color:var(--mu);text-transform:capitalize}
.chip.warn{--c:var(--rose);border-color:rgba(251,113,133,.45);background:rgba(244,63,94,.14)}
.chip.good{--c:var(--green)}
.amber{color:var(--amber)!important}.green{color:var(--green)!important}.blue{color:var(--blue)!important}
.persons{display:flex;gap:-6px;margin-left:4px}
.person{position:relative;width:42px;height:42px;box-sizing:border-box;border-radius:50%;background:linear-gradient(135deg,#6366f1,#14b8a6);display:grid;place-items:center;font-weight:700;border:2px solid #0b1222;cursor:pointer;margin-left:-6px}
.person img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.person i{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;border:2px solid #0b1222;background:#64748b}
.person.home i{background:var(--green);box-shadow:0 0 8px var(--green)}
.person.away{filter:grayscale(.7);opacity:.75}

.app{container:app/inline-size}
/* tabs */
.tabs{position:sticky;top:8px;z-index:6;display:flex;gap:6px;padding:6px;margin:0 0 18px;border-radius:20px;background:rgba(13,19,36,.72);border:1px solid var(--line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow-x:auto;scrollbar-width:none;box-shadow:0 12px 30px -16px rgba(0,0,0,.7)}
.tabs::-webkit-scrollbar{display:none}
.tb{position:relative;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:14px;font-size:13px;font-weight:600;color:var(--mu);white-space:nowrap;transition:background .25s,color .25s;flex:none}
.tb ha-icon{--mdc-icon-size:19px}
@media (hover:hover){.tb:hover{color:var(--tx);background:rgba(255,255,255,.05)}}
.tb.on{color:#fff;background:linear-gradient(135deg,rgba(99,102,241,.42),rgba(20,184,166,.3));box-shadow:inset 0 0 0 1px rgba(255,255,255,.13),inset 0 1px 0 rgba(255,255,255,.1),0 2px 9px -4px rgba(99,102,241,.75)}
.tb .bd{font-style:normal;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:grid;place-items:center;font-size:10.5px;font-weight:700;color:#0b1222;background:#cbd5e1}
.tb .bd ha-icon{--mdc-icon-size:12px}
.bd.warn{background:var(--rose);color:#fff}.bd.info{background:var(--blue)}.bd.good{background:var(--green)}.bd.pink{background:#f472b6}
.tab{display:none;animation:tabin .35s ease}
.tab.on{display:block}
@keyframes tabin{from{opacity:0;transform:translateY(8px)}}
.tab.from-next{animation:tabnext .3s ease}.tab.from-prev{animation:tabprev .3s ease}
@keyframes tabnext{from{opacity:0;transform:translateX(40px)}}@keyframes tabprev{from{opacity:0;transform:translateX(-40px)}}
main{scroll-margin-top:84px}
.home-grid{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) 340px;align-items:start}
.tgrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));align-items:start}
.alerts{grid-column:1/-1}.alerts:empty{display:none}
.acard .ch>ha-icon{color:var(--rose)}.acard .mrow{cursor:pointer}
.alsec{display:flex;align-items:center;gap:6px}.alsec:first-of-type{margin-top:4px}.alsec ha-icon{--mdc-icon-size:14px}.alsec i{font-style:normal;margin-left:auto;font-size:10.5px;padding:1px 7px;border-radius:999px;background:rgba(244,63,94,.18);color:#fecdd3;letter-spacing:0}
.almore{width:100%;padding:7px;border-radius:10px;font-size:11.5px;color:var(--teal);background:var(--panel2);border:1px dashed var(--line);margin-bottom:6px}
.wrow .rbtn,.swr .rbtn{display:flex;align-items:center;gap:4px;margin-left:6px;padding:5px 9px;border-radius:9px;font-size:11px;font-weight:600;background:rgba(244,63,94,.18);border:1px solid rgba(244,63,94,.45);color:#fecdd3}
.wrow .rbtn ha-icon,.swr .rbtn ha-icon{--mdc-icon-size:14px;color:#fecdd3}
.wrow .ubtn{background:rgba(45,212,191,.16);border-color:rgba(45,212,191,.45);color:#99f6e4}.wrow .ubtn ha-icon{color:#99f6e4}.wrow .rbtn.confirm,.swr .rbtn.confirm{position:relative}
.tgrid.sec{grid-template-columns:minmax(300px,380px) minmax(0,1fr)}
.tgrid.wide1{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}
/* glance */
.glance{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gl{display:flex;align-items:center;gap:10px;padding:11px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);text-align:left;min-width:0;transition:transform .2s,border-color .2s,background .2s}
@media (hover:hover){.gl:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 8%,transparent)}}
.gl .gi{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.gl .gi ha-icon{--mdc-icon-size:18px}
.gl div{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.gl span{font-size:10.5px;color:var(--mu)}.gl b{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gl em{font-style:normal;font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* option chips + picker sheet */
.picks{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.picks.col{flex-direction:column;align-items:stretch;margin:8px 0;gap:8px} /* v1.21.7: the layout class .col (gap 18px) was leaking in */
.picks:empty{display:none}
.pick{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 11px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid var(--line);font-size:12px;color:var(--mu);transition:border-color .2s,background .2s;min-width:0}
@media (hover:hover){.pick:hover{border-color:rgba(45,212,191,.45);background:rgba(45,212,191,.08)}}
.pick ha-icon{--mdc-icon-size:16px}.pick b{color:#fff;font-weight:600;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pick .chev{opacity:.6}
.picks:not(.col) .pick b{margin-left:2px}
.sheet-bg{position:fixed;inset:0;overscroll-behavior:contain;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.55);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.sheet-bg.open{display:flex;animation:fade .2s}
.sheet{width:min(420px,calc(100% - 32px));max-height:72vh;overflow:auto;padding:16px;border-radius:22px;background:#0f172a;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overscroll-behavior:contain;animation:pop .22s cubic-bezier(.2,.8,.2,1)}
@keyframes pop{from{opacity:0;transform:scale(.96) translateY(10px)}}
.sh-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}.sh-h div{flex:1;display:flex;flex-direction:column}.sh-h b{font-size:16px}.sh-h span{font-size:12px;color:var(--mu)}
.opts{display:flex;flex-direction:column;gap:6px}
[data-act],[data-lp]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
[data-act].lp,[data-lp].lp{transform:scale(.97);transition:transform .12s}[data-lp] img{pointer-events:none}
.phbtns{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px}
.phbtn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:14px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer}
.phbtn ha-icon{color:var(--teal);--mdc-icon-size:18px}.phbtn:active{transform:scale(.97)}
.sh-h img{width:34px;height:34px;border-radius:50%;object-fit:cover}
.sh-h>ha-icon{color:var(--teal)}.sheet .dsec:first-of-type{margin-top:4px}
.trow em{font-style:normal;font-size:11.5px;color:var(--mu)}.trow b{font-size:13px;min-width:44px;text-align:right}.trow ha-icon.ac{color:var(--blue);--mdc-icon-size:15px}
.opt{display:flex;align-items:center;gap:10px;width:100%;padding:13px 14px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:14px;text-align:left;transition:background .15s}
@media (hover:hover){.opt:hover{background:rgba(255,255,255,.08)}}.opt span{flex:1}
.opt.on{border-color:var(--teal);background:rgba(45,212,191,.14)}.opt.on ha-icon{color:var(--teal)}
/* alarm keypad + toast */
.keypad{width:min(340px,calc(100% - 32px))}
.pin-dots{height:34px;display:flex;align-items:center;justify-content:center;gap:12px;margin:6px 0 2px}
.pin-dots i{width:14px;height:14px;border-radius:50%;background:var(--teal);box-shadow:0 0 10px var(--teal)}
.pin-dots span{letter-spacing:6px;color:rgba(255,255,255,.15);font-size:22px}
.pin-dots.shake{animation:shake .4s}
@keyframes shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
.pin-msg{min-height:18px;text-align:center;font-size:12px;color:var(--mu);margin-bottom:8px}.pin-msg.bad{color:var(--rose)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.key{height:58px;border-radius:18px;font-size:22px;font-weight:600;background:var(--panel2);border:1px solid var(--line);transition:background .15s,transform .1s}
@media (hover:hover){.key:hover{background:rgba(255,255,255,.09)}}.key:active{transform:scale(.95)}
.key ha-icon{--mdc-icon-size:22px}
.key.k-ok{background:linear-gradient(135deg,#14b8a6,#6366f1);border:0}.key.k-del{color:var(--mu)}
.toast{position:fixed;left:50%;bottom:28px;z-index:70;transform:translate(-50%,20px);opacity:0;pointer-events:none;padding:11px 18px;border-radius:14px;font-size:13px;font-weight:600;background:#0f172a;border:1px solid rgba(45,212,191,.5);color:#fff;box-shadow:0 16px 40px -10px rgba(0,0,0,.7);transition:opacity .25s,transform .25s}
.toast.show{opacity:1;transform:translate(-50%,0)}.toast.bad{border-color:rgba(251,113,133,.6)}
.lbl ha-icon.chg{color:var(--green)}.lbl ha-icon.lkd{color:var(--green)}.lbl ha-icon.unl{color:var(--rose)}
.lockrow.good ha-icon,.lockrow.good b{color:var(--green)}
.lockrow.bad{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.12)}.lockrow.bad ha-icon,.lockrow.bad b{color:var(--rose)}
.mrow.open{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.12)}.mrow.open ha-icon,.mrow.open b{color:var(--rose)}
/* sliders */
.slrow{display:flex;align-items:center;gap:10px;padding:4px 12px 8px}
.slrow ha-icon{--mdc-icon-size:16px;color:var(--mu)}.slrow em{font-style:normal;font-size:11.5px;font-weight:600;width:36px;text-align:right;color:var(--tx)}
.sl{-webkit-appearance:none;appearance:none;flex:1;height:6px;border-radius:3px;outline:none;background:linear-gradient(90deg,var(--c) var(--p),rgba(255,255,255,.1) var(--p));cursor:pointer}
.sl::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--c);box-shadow:0 2px 8px rgba(0,0,0,.4)}
.sl::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--c)}
.sl:focus-visible{box-shadow:0 0 0 3px rgba(45,212,191,.4)}
.lwrap{border-radius:12px;margin-bottom:6px}.lwrap .lrow{margin-bottom:0}
.lwrap.on{background:rgba(251,191,36,.06)}
.swrow{display:flex;align-items:center;gap:10px;padding:2px 12px 10px}.swrow>ha-icon{--mdc-icon-size:16px;color:var(--mu);flex:none}
.sws{display:flex;flex-wrap:wrap;gap:7px}
.sw{position:relative;width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.18);background:var(--sw);cursor:pointer;padding:0;flex:none;transition:transform .15s}
@media (hover:hover){.sw:hover{transform:scale(1.1)}}.sw.swcur{border-color:#fff;box-shadow:0 0 0 2px var(--sw),0 0 10px var(--sw)}
.sw.cust{display:grid;place-items:center;background:conic-gradient(red,#ff0,lime,cyan,blue,#f0f,red)}
.sw.cust ha-icon{--mdc-icon-size:14px;color:#fff;filter:drop-shadow(0 0 2px #000)}
.sw.cust input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}
.lwrap .picks.col,.lwrap>.pick{margin:0 10px 8px}
.echo{margin-bottom:6px;border-radius:12px;background:var(--panel2)}
/* AC extras */
.xsw{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.xs{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:11.5px;color:var(--mu);background:rgba(255,255,255,.05);border:1px solid var(--line)}
.xs ha-icon{--mdc-icon-size:15px}.xs b{font-weight:600}
.xs.on{color:#fff;border-color:rgba(45,212,191,.5);background:rgba(45,212,191,.15)}.xs.on ha-icon{color:var(--teal)}
.rtemps{display:flex;gap:8px;overflow-x:auto;margin-bottom:14px;padding-bottom:4px;scrollbar-width:thin}
.rtemp{flex:none;display:flex;align-items:center;gap:7px;padding:9px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:12px}
.rtemp ha-icon{--mdc-icon-size:16px;color:var(--c)}.rtemp b{color:var(--c);font-size:14px}.rtemp em{font-style:normal;color:var(--blue);font-size:11px}
.fc{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:8px;border-radius:14px;cursor:pointer;background:linear-gradient(110deg,rgba(251,191,36,.14),transparent);border:1px solid rgba(251,191,36,.25)}
.fc>ha-icon{color:var(--amber)}.fc div{display:flex;flex-direction:column}.fc span{font-size:10.5px;color:var(--mu)}.fc b{font-size:13px}.fc em{font-style:normal;font-size:10.5px;color:var(--mu)}
.col{display:flex;flex-direction:column;gap:18px;min-width:0}
.card.flash{animation:cflash 1.5s ease-out}@keyframes cflash{0%,30%{box-shadow:0 0 0 2px var(--teal),0 0 28px -4px rgba(45,212,191,.6)}100%{box-shadow:0 0 0 0 transparent}}
.tv.pend b,.dac-l span.pend{color:var(--teal);animation:pendp 1s ease-in-out infinite}@keyframes pendp{50%{opacity:.55}}
.card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:18px;backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);box-shadow:0 20px 50px -20px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05);min-width:0}
.ch{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.ch>ha-icon{--mdc-icon-size:20px;color:var(--teal);background:rgba(45,212,191,.12);padding:7px;border-radius:12px}
.ch h3{margin:0;font-size:15px;font-weight:600;flex:1;letter-spacing:.2px}
.pill{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;color:var(--c,#cbd5e1);background:color-mix(in srgb,var(--c,#94a3b8) 16%,transparent);border:1px solid color-mix(in srgb,var(--c,#94a3b8) 35%,transparent);white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
.ibtn{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);transition:.2s}
@media (hover:hover){.ibtn:hover{background:rgba(255,255,255,.1)}}.ibtn.on{background:rgba(45,212,191,.2);border-color:rgba(45,212,191,.5);color:var(--teal)}
.ibtn.big{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#ec4899,#8b5cf6);border:0}

/* security */
.alarm{display:flex;align-items:center;gap:14px;padding:12px;border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,transparent),transparent);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);margin-bottom:12px}
.shield{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--c);cursor:pointer;flex:none;box-shadow:0 0 30px -6px var(--c)}
.shield ha-icon{--mdc-icon-size:32px}.blink{animation:blink .6s infinite}
@keyframes blink{50%{opacity:.3}}
.abtns{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1}
.abtn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border-radius:12px;background:var(--panel2);border:1px solid var(--line);font-size:10.5px;color:var(--mu);transition:.2s}
.abtn ha-icon{--mdc-icon-size:18px}@media (hover:hover){.abtn:hover{color:var(--tx)}}
.abtn.on{background:color-mix(in srgb,var(--c) 25%,transparent);color:#fff;border-color:var(--c)}
.locks{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin-bottom:12px}
.lock{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 4px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.2s}
.lk-ic{position:relative;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;margin-bottom:4px}
.lk-b{position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--panel2,#1e293b);border:1.5px solid currentColor;font-style:normal}.lk-b ha-icon{--mdc-icon-size:11px}
.lock b{font-size:12px;font-weight:600}.lock span{font-size:11px;color:var(--mu);text-transform:capitalize}
.lock.good .lk-ic{background:rgba(52,211,153,.15);color:var(--green)}
.lock.bad{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.1)}.lock.bad .lk-ic{background:rgba(244,63,94,.2);color:var(--rose);box-shadow:0 0 18px -4px var(--rose)}
.lock.warn .lk-ic{background:rgba(251,191,36,.18);color:var(--amber)}
.na{opacity:.45}
.confirm{outline:2px solid var(--amber);animation:blink .8s infinite}.tile.confirm{position:relative} /* anchor the tip to the tile, not the card */
.confirm::after{content:attr(data-tip);position:absolute;left:50%;top:-30px;transform:translateX(-50%);background:#fbbf24;color:#111;font-size:11px;font-weight:700;padding:4px 8px;border-radius:8px;white-space:nowrap;z-index:5}
.doors{display:flex;flex-wrap:wrap;gap:6px}
.door{display:flex;align-items:center;gap:5px;padding:6px 10px 6px 7px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);font-size:11.5px;color:var(--mu);cursor:pointer}
.door ha-icon{--mdc-icon-size:16px;color:var(--green)}
.door.open{color:#fff;background:rgba(244,63,94,.18);border-color:rgba(251,113,133,.5)}.door.open ha-icon{color:var(--rose)}

/* climate */
.acs{display:flex;flex-direction:column;gap:8px}
.acs.full{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px;align-items:start}
.ac{border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.25s;overflow:hidden}
.ac.on{border-color:color-mix(in srgb,var(--c) 45%,transparent);background:linear-gradient(100deg,color-mix(in srgb,var(--c) 16%,transparent),transparent 70%)}
.acrow{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 10px;cursor:pointer}
.acic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.05);color:var(--c);flex:none}
.ac.on .acic{background:color-mix(in srgb,var(--c) 22%,transparent)}
.spin-fan_only ha-icon,.spin-cool ha-icon{animation:spin 4s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.acn{flex:1;min-width:0;display:flex;flex-direction:column}.acn b{font-size:13px;font-weight:600}.acn span{font-size:11px;color:var(--mu);text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.act{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15}.act b{font-size:16px;font-weight:700}.act span{font-size:11px;color:var(--mu);display:flex;align-items:center}.act span ha-icon{--mdc-icon-size:12px;color:var(--blue)}
.pow{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.06);color:var(--mu);flex:none;transition:.2s}
.pow ha-icon{--mdc-icon-size:17px}.pow.on{background:var(--c,var(--teal));color:#0b1222;box-shadow:0 0 16px -2px var(--c,var(--teal))}
.acctl{padding:4px 12px 12px;display:flex;flex-direction:column;gap:10px;animation:fade .25s}
@keyframes fade{from{opacity:0;transform:translateY(-4px)}}
.tgt{display:flex;align-items:center;justify-content:center;gap:16px}.tv{display:flex;flex-direction:column;align-items:center;min-width:70px}.tv b{font-size:30px;font-weight:700;letter-spacing:-1px}.tv span{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:1px}
.tgt.sm{gap:6px}
.modes{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.mbtn{min-width:52px;padding:6px 6px 5px;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--panel2);border:1px solid var(--line);color:var(--mu)}
.mbtn ha-icon{--mdc-icon-size:18px}.mbtn em{font-style:normal;font-size:9.5px;white-space:nowrap}
.mbtn.on{background:color-mix(in srgb,var(--c) 25%,transparent);border-color:var(--c);color:var(--c)}
.fans{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}.fbtn{font-size:11px;padding:5px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);text-transform:capitalize}.fbtn.on{color:#fff;border-color:var(--c);background:color-mix(in srgb,var(--c) 22%,transparent)}

/* weather sheet */
.wxnow{display:flex;align-items:center;gap:14px;padding:16px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(135deg,rgba(251,191,36,.18),rgba(96,165,250,.08));cursor:pointer}
.wxnow.night{background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(15,23,42,.2))}.wxnow.cloud{background:linear-gradient(135deg,rgba(148,163,184,.22),rgba(96,165,250,.08))}
.wxnow.rain{background:linear-gradient(135deg,rgba(59,130,246,.28),rgba(30,58,138,.15))}.wxnow.snow{background:linear-gradient(135deg,rgba(226,232,240,.22),rgba(147,197,253,.1))}
.wxnow .wxbig{--mdc-icon-size:54px;color:#fbbf24;filter:drop-shadow(0 0 14px rgba(251,191,36,.45))}
.wxnow.night .wxbig{color:#c7d2fe;filter:drop-shadow(0 0 12px rgba(165,180,252,.4))}.wxnow.cloud .wxbig,.wxnow.snow .wxbig{color:#e2e8f0;filter:none}.wxnow.rain .wxbig{color:#93c5fd;filter:none}
.wxt{flex:1;display:flex;flex-direction:column}.wxt b{font-size:34px;font-weight:700;line-height:1.05}.wxt span{font-size:13px;color:var(--mu)}
.wxhl{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}.wxhl span{display:flex;align-items:center;gap:2px}.wxhl ha-icon{--mdc-icon-size:15px;color:var(--mu)}
.wxstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.wxs{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);min-width:0}
.wxs ha-icon{--mdc-icon-size:17px;color:var(--teal)}.wxs span{font-size:10.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px}
.wxs b{font-size:16px}.wxs b small{font-size:10px;color:var(--mu);margin-left:2px;font-weight:600}.wxs>small{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wxarrow{position:absolute;top:9px;right:9px;font-style:normal;display:flex}.wxarrow ha-icon{--mdc-icon-size:16px;color:#93c5fd}
.wxh{overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px;overscroll-behavior-x:contain}.wxh::-webkit-scrollbar{display:none}
.wxhin{position:relative;display:flex;padding-top:4px}
.wxcurve{position:absolute;left:0;top:68px;pointer-events:none}
.wxhc{flex:none;width:54px;display:flex;flex-direction:column;align-items:center;gap:4px}
.wxhc span{font-size:11px;color:var(--mu);white-space:nowrap}.wxhc ha-icon{--mdc-icon-size:22px;color:#e2e8f0}
.wxhc b{font-size:13px;margin-bottom:36px}.wxhc em{font-style:normal;font-size:10.5px;color:#60a5fa;min-height:14px}.wxhc em small{font-size:9px}
.wxdays{display:flex;flex-direction:column;gap:6px}
.wxd{display:grid;grid-template-columns:44px 24px 46px 34px 1fr 34px;align-items:center;gap:8px;padding:9px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:13px}
.wxd>span{font-weight:600}.wxd>ha-icon{--mdc-icon-size:21px;color:#e2e8f0}
.wxd em{font-style:normal;font-size:11px;color:#60a5fa;display:flex;align-items:center;white-space:nowrap}.wxd em ha-icon{--mdc-icon-size:12px}.wxd em small{font-size:9px;margin-left:1px}
.wxd b{text-align:right}.wxd b.lo{color:var(--mu);font-weight:500}
.wxbar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.07)}.wxbar i{position:absolute;top:0;bottom:0;border-radius:3px}
.wxbar .wxnowdot{width:10px;height:10px;top:-2px;margin-left:-5px;border-radius:50%;background:#fff;border:2px solid #0f172a;box-shadow:0 0 6px rgba(255,255,255,.6)}
.wxwait{padding:20px;text-align:center;color:var(--mu);font-size:12px}
.wxfoot{margin-top:12px;font-size:10.5px;color:var(--mu);text-align:center;opacity:.7}

/* power sheet */
.pwbig{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pwb{display:flex;flex-direction:column;gap:2px;padding:12px 10px;border-radius:16px;cursor:pointer;min-width:0;border:1px solid color-mix(in srgb,var(--c) 35%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c) 16%,transparent),transparent)}
.pwb ha-icon{--mdc-icon-size:20px;color:var(--c)}.pwb span{font-size:10.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px;margin-top:4px}
.pwb b{font-size:20px;font-weight:700}.pwb b small{font-size:11px;color:var(--mu);margin-left:2px}.pwb small{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pwmix{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-top:12px;background:rgba(255,255,255,.06)}.pwmix i{display:block;height:100%}
.pwmixl{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--mu)}.pwmixl span{display:flex;align-items:center;gap:5px}.pwmixl i{width:8px;height:8px;border-radius:50%}
.spark.pwspark{margin:18px 0 10px}
.pwgo{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:14px;padding:11px;border-radius:14px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:#99f6e4;font-size:13px;font-weight:600}
.pwgo ha-icon{--mdc-icon-size:17px}

/* media server card */
.jfs{display:flex;gap:12px;padding:10px;border-radius:16px;background:linear-gradient(120deg,rgba(167,139,250,.16),rgba(96,165,250,.08));border:1px solid var(--line);cursor:pointer;margin-bottom:8px}
.jfp{flex:none;width:58px;height:84px;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.06);display:grid;place-items:center}.jfp img{width:100%;height:100%;object-fit:cover}.jfp ha-icon{--mdc-icon-size:26px;color:var(--mu)}
.jfi{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.jfi b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jfi span{font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jfi em{font-style:normal;font-size:11px;color:#c4b5fd;display:flex;align-items:center;gap:3px}.jfi em ha-icon{--mdc-icon-size:13px}
.jfbar{height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:4px}.jfbar i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,#a78bfa,#60a5fa)}
.mempty{display:flex;align-items:center;gap:8px;padding:12px;border-radius:14px;background:var(--panel2);border:1px dashed var(--line);font-size:12px;color:var(--mu)}.mempty ha-icon{--mdc-icon-size:18px}
.mdl{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mdl>*{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;text-align:center;color:var(--tx);font:inherit;min-width:0}
.mdl ha-icon{--mdc-icon-size:18px;color:var(--mu)}.mdl b{font-size:14px;white-space:nowrap}.mdl b small{font-size:9.5px;color:var(--mu);margin-left:2px;font-weight:600}.mdl span{font-size:10px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mdl .act ha-icon{color:#60a5fa}.mdl .act.up ha-icon{color:#34d399}.mdl button.on{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.1)}.mdl button.on ha-icon{color:#fbbf24}
.mq{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.mqr{display:grid;grid-template-columns:18px 1fr auto;align-items:center;gap:4px 8px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);font-size:12px;cursor:pointer}
.mqr ha-icon{--mdc-icon-size:16px;color:#60a5fa}.mqr span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mqr b{font-size:12px;color:#93c5fd}.mqr .jfbar{grid-column:1/-1;margin-top:0}
.mup{display:grid;grid-template-columns:74px 34px 1fr;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px;cursor:pointer}
.mud{display:flex;flex-direction:column}.mud b{font-size:12px}.mud span{font-size:10.5px;color:var(--mu)}
.mup>ha-icon{--mdc-icon-size:18px;color:#60a5fa}.mup.mmv>ha-icon{color:#f472b6}
.mut{min-width:0;display:flex;flex-direction:column}.mut b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mut span{font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlib{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.mlib div{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.mlib ha-icon{--mdc-icon-size:17px;color:var(--mu)}.mlib b{font-size:15px}.mlib span{font-size:10px;color:var(--mu)}.mlib .warn ha-icon,.mlib .warn b{color:#fbbf24}
.mdks{display:flex;flex-direction:column;gap:2px}
.mdk{display:grid;grid-template-columns:18px 70px 1fr auto;align-items:center;gap:8px;font-size:12px;padding:4px 2px;cursor:pointer}
.mdk ha-icon{--mdc-icon-size:16px;color:var(--mu)}.mdk span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mdk b{font-size:11.5px;color:var(--mu);font-weight:600}
.msvs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.msv{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--mu)}
.msv ha-icon{--mdc-icon-size:14px}.msv::before{content:'';width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}
.msv.bad{color:var(--rose);border-color:rgba(251,113,133,.45)}.msv.bad::before{background:#f43f5e;box-shadow:0 0 6px #f43f5e}

/* jellyfin library browser */
.mlib div.go{position:relative}.mlib div.go span{color:#c4b5fd}
.jfwait{margin:0 0 12px;padding:12px;border-radius:14px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.35);font-size:13px}.jfwm{display:flex;gap:10px;align-items:flex-start}.jfwm span{flex:1;line-height:1.4}.jfwm ha-icon{--mdc-icon-size:18px;color:var(--teal)}.jfwait .spin{animation:spin 1s linear infinite}.jfwb{display:flex;gap:8px;margin-top:10px}.jfwh{margin-top:8px;font-size:11px;color:var(--mu)}
.jfgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.jfpo{position:relative;display:flex;flex-direction:column;gap:5px;padding:0;background:none;border:0;color:var(--tx);font:inherit;text-align:left;cursor:pointer;min-width:0}
.jfpo span{font-size:11.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jfimg{position:relative;width:100%;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center}
.jfimg ha-icon{--mdc-icon-size:26px;color:var(--mu)}.jfimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.jfplayi{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(15,23,42,.75);font-style:normal}.jfplayi ha-icon{--mdc-icon-size:16px;color:#fff}
.jfpo:active .jfimg{transform:scale(.97)}
.jfback{display:inline-flex;align-items:center;gap:2px;margin:-4px 0 10px;padding:5px 10px 5px 4px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.jfback ha-icon{--mdc-icon-size:18px}
.jfshowh{display:flex;gap:12px;align-items:center;margin-bottom:10px}.jfshowh .jfimg{width:74px;flex:none}
.jfshowh>div:last-child{display:flex;flex-direction:column;gap:3px;min-width:0}.jfshowh b{font-size:15px}.jfshowh span{font-size:12px;color:var(--mu)}.jfshowh em{font-style:normal;font-size:11px;color:#c4b5fd}
.jfseas{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 10px;padding:0 16px}.jfseas::-webkit-scrollbar{display:none}
.jfseas button{flex:none;padding:6px 12px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.jfseas button.on{color:#fff;border-color:rgba(167,139,250,.6);background:rgba(167,139,250,.18)}
.jfep{display:flex;align-items:center;gap:10px;width:100%;padding:6px;margin-bottom:6px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);color:var(--tx);font:inherit;text-align:left;cursor:pointer}
.jfep .jfimg{width:96px;flex:none;aspect-ratio:16/9;border-radius:8px}.jfep>div:not(.jfimg){flex:1;min-width:0}.jfep b{font-size:12.5px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jfep .jfepp{--mdc-icon-size:18px;color:#a78bfa;flex:none;margin-right:4px}

/* coming up posters + details */
.mupth{width:34px;height:50px;border-radius:6px;overflow:hidden;background:var(--panel2)}.mupth img{width:100%;height:100%;object-fit:cover;display:block}
.mup>ha-icon{justify-self:center}
.sh-h.mup-h{margin-bottom:0;position:relative;z-index:2}
.muph{position:relative;display:flex;gap:14px;align-items:flex-end;margin:-6px -16px 0;padding:0 16px 12px;min-height:150px}
.mupbg{position:absolute;inset:-46px 0 0;background-size:cover;background-position:center 25%;opacity:.35;-webkit-mask-image:linear-gradient(#000 40%,transparent);mask-image:linear-gradient(#000 40%,transparent);pointer-events:none}
.muppo{position:relative;width:110px;flex:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.8)}
.mupt{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0}.mupt b{font-size:18px;line-height:1.2}.mupt span{font-size:13px;color:#e2e8f0}
.mupt em{font-style:normal;font-size:12px;color:var(--mu);display:flex;align-items:center;gap:5px}.mupt em ha-icon{--mdc-icon-size:15px}
.mupchips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.mupchips span{font-size:11px;padding:4px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:#cbd5e1}
.mupov{font-size:13px;line-height:1.5;color:#cbd5e1;margin:0 0 4px}.mupov.mu{color:var(--mu)}

/* energy history grid balance */
.ehbal{margin:2px 0 10px;padding:10px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.ehbal.exp{border-color:rgba(52,211,153,.4);background:linear-gradient(120deg,rgba(52,211,153,.12),transparent)}.ehbal.imp{border-color:rgba(96,165,250,.4);background:linear-gradient(120deg,rgba(96,165,250,.12),transparent)}
.ehbal-t{display:flex;align-items:center;gap:8px}.ehbal-t ha-icon{--mdc-icon-size:20px}.ehbal.exp .ehbal-t ha-icon,.ehbal.exp .ehbal-t b{color:var(--green)}.ehbal.imp .ehbal-t ha-icon,.ehbal.imp .ehbal-t b{color:#60a5fa}
.ehbal-t span{flex:1;font-size:13px;font-weight:600}.ehbal-t b{font-size:18px}.ehbal-t b small{font-size:11px;margin-left:3px;color:var(--mu);font-weight:600}
.ehbal-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:8px 0 6px;background:rgba(255,255,255,.06);gap:2px}.ehbal-bar i{display:block;height:100%}.ehbal-bar .in{background:#60a5fa}.ehbal-bar .out{background:#34d399}
.ehbal-l{display:flex;justify-content:space-between;font-size:11px;color:var(--mu)}.ehbal-l span{display:flex;align-items:center;gap:3px}.ehbal-l ha-icon{--mdc-icon-size:13px}

/* swap sheet */
.swnode{margin:-4px 0 6px}.swnode .bar,.swn .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}.swnode .bar i,.swn .bar i{display:block;height:100%;border-radius:3px}
.swr{display:grid;grid-template-columns:16px 18px 1fr auto auto;align-items:center;gap:8px;padding:9px 10px;margin-bottom:6px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.swr>em{font-style:normal;font-size:11px;color:var(--mu);text-align:center}.swr>ha-icon{--mdc-icon-size:17px;color:#f472b6}
.swn{min-width:0;display:flex;flex-direction:column;gap:3px}.swn b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.swn span{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swr strong{font-size:13px;white-space:nowrap}.swr strong small{font-size:9.5px;color:var(--mu);margin-left:2px}
.swr .rbtn{position:relative}.swnr{width:0}
.rbtn.busy{opacity:.7;background:rgba(148,163,184,.12)!important;border-color:var(--line)!important;color:var(--mu)!important}.rbtn.busy ha-icon{color:var(--mu)!important}
.rbtn.busy .spin{animation:spin 1s linear infinite}
.swnote{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:10px;border-radius:12px;border:1px dashed var(--line);font-size:11.5px;color:var(--mu);line-height:1.4}.swnote ha-icon{--mdc-icon-size:16px;flex:none}

/* wanted sheet */
.wtg{margin-bottom:14px}
.wth{position:relative;display:flex;gap:12px;align-items:flex-end;margin:0 -16px 8px;padding:10px 16px 6px;min-height:118px;overflow:hidden}
.wth .mupbg{inset:0}.wth .muppo{width:74px}
.wte{padding:9px 11px;margin-bottom:6px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
.wtei{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:baseline}.wtei b{font-size:12px;color:#fbbf24}.wtei span{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtei em{grid-column:1/-1;font-style:normal;font-size:11px;color:var(--mu)}
.wte p{margin:6px 0 0;font-size:12px;line-height:1.45;color:#cbd5e1}

/* energy history loading state */
.ehwrap{position:relative}
.ehwrap.ehbusy>*:not(.ehspin){opacity:.35;pointer-events:none;transition:opacity .2s}
.ehspin{position:absolute;left:50%;top:150px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(15,23,42,.92);border:1px solid var(--line);font-size:12px;color:#e2e8f0;box-shadow:0 10px 30px -10px rgba(0,0,0,.8);white-space:nowrap;z-index:2}
.ehspin ha-icon{--mdc-icon-size:18px;color:var(--teal)}.ehspin .spin{animation:spin 1s linear infinite}
.skl{display:block;height:11px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));background-size:200% 100%;animation:skl 1.3s ease-in-out infinite}
.kpis .skl+.skl{margin-top:6px}
@keyframes skl{0%{background-position:100% 0}100%{background-position:-100% 0}}
.ehbal.skel{cursor:default}
.ehchart.skel{display:flex;align-items:flex-end;gap:6px;height:150px;padding-left:30px;margin-bottom:22px}.ehchart.skel i{flex:1;border-radius:3px 3px 0 0;background:rgba(255,255,255,.08);animation:skl 1.3s ease-in-out infinite;background-image:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));background-size:200% 100%}
.cons .crow .skl{width:100%}.crow.skrow{min-height:44px;cursor:default}

/* loading placeholders */
.spk-load{position:relative}.spk-load .ehspin{top:46px}
.spk.skelchart{display:flex;align-items:flex-end;gap:3px;cursor:default}.spk.skelchart i{flex:1;border-radius:2px 2px 0 0;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));background-size:200% 100%;animation:skl 1.3s ease-in-out infinite}
.mupskel{position:relative}.mupskel .ehspin{top:120px}.mupskel .mup{cursor:default}.mupth.skl{display:block;width:34px;height:50px;border-radius:6px}
.wxskh{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;text-align:center}.wxskh>div{display:flex;flex-direction:column;align-items:center}
.jfimg.skl{border:0;height:auto}.muppo.skl{height:auto;aspect-ratio:2/3}.wth .mupt{flex:1}

/* energy history: back to the current period */
.ehnow.hide{visibility:hidden;pointer-events:none}
.ehnow{display:inline-flex;align-items:center;gap:4px;margin-right:4px;padding:6px 11px;border-radius:999px;background:rgba(45,212,191,.14);border:1px solid rgba(45,212,191,.45);color:#99f6e4;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.ehnow ha-icon{--mdc-icon-size:15px}

/* tiles */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tiles.two{grid-template-columns:1fr 1fr}
.tile{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:11px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);font-size:12px;font-weight:500;color:var(--mu);transition:.2s;text-align:left;min-width:0}
.tile span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.tile ha-icon{--mdc-icon-size:20px}
@media (hover:hover){.tile:hover{background:rgba(255,255,255,.08)}}
.tile.on{color:#fff;background:linear-gradient(135deg,rgba(45,212,191,.28),rgba(96,165,250,.14));border-color:rgba(45,212,191,.45)}.tile.on ha-icon{color:var(--teal)}
.tile.on.red{background:linear-gradient(135deg,rgba(244,63,94,.3),rgba(244,63,94,.1));border-color:rgba(251,113,133,.5)}.tile.on.red ha-icon{color:var(--rose)}
.tile em.sub{font-style:normal;font-size:10.5px;color:var(--mu)}
.tile.wide{flex-direction:row;align-items:center;flex-wrap:wrap}.tile.wide span{flex:1}.tile.wide em.sub{width:100%;padding-left:28px;margin-top:-4px}

/* stage */
.stage{display:flex;flex-direction:column;padding:14px}
.stage-top{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.title{display:flex;align-items:center;gap:10px;flex:1;min-width:160px}
.title>ha-icon{--mdc-icon-size:24px;color:#fff;background:linear-gradient(135deg,#6366f1,#14b8a6);padding:8px;border-radius:14px;box-shadow:0 8px 24px -6px #6366f1}
.title div{display:flex;flex-direction:column}.title b{font-size:17px}.title span{font-size:12px;color:var(--mu)}
.seg{display:flex;padding:4px;border-radius:14px;background:rgba(0,0,0,.25);border:1px solid var(--line)}
.seg button{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;font-size:12.5px;color:var(--mu);transition:.2s}
.seg button ha-icon{--mdc-icon-size:17px}
.seg button.on{background:rgba(255,255,255,.1);color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.tools{display:flex;gap:6px}
.viewport{--day:.6;position:relative;flex:none;width:100%;height:clamp(440px,calc(100vh - 280px),900px);border-radius:18px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 0%,color-mix(in srgb,#1e3a8a calc(var(--day)*100%),#0b1020) 0%,#070b16 70%);border:1px solid var(--line)}
.viewport canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
.labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lbl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:12px;background:rgba(8,12,24,.72);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:11.5px;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.4);transition:border-color .3s,background .3s;will-change:transform}
.lbl::after{content:'';position:absolute;left:50%;bottom:-5px;width:8px;height:8px;background:inherit;border-right:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);transform:translateX(-50%) rotate(45deg)}
.lbl b{font-weight:600}.lbl .t{font-weight:700}.lbl .h{color:var(--blue);font-size:10.5px}
.lbl .ics{display:flex;gap:2px}.lbl ha-icon{--mdc-icon-size:14px;color:var(--amber)}.lbl ha-icon.ac{color:var(--blue)}.lbl ha-icon.mo{color:var(--teal)}
.lbl.lit{border-color:rgba(251,191,36,.55);box-shadow:0 0 22px -6px rgba(251,191,36,.7)}
.lbl.mo{border-color:rgba(45,212,191,.6)}
.lbl.sel{background:rgba(45,212,191,.25);border-color:var(--teal)}
.lbl.nodata{opacity:.75;font-size:10.5px}
.legend{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(8,12,24,.65);font-size:11px;color:var(--mu);pointer-events:none}
.lg-bar{width:120px;height:6px;border-radius:3px;background:linear-gradient(90deg,#3b82f6,#22d3ee,#34d399,#fbbf24,#f43f5e)}
.legend:has(.lg-bar){flex-direction:column;align-items:stretch;gap:3px}.lg-lbl{display:flex;justify-content:space-between;font-size:10px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.dot.amber{background:var(--amber);box-shadow:0 0 8px var(--amber)}.dot.gray{background:#475569}.dot.teal{background:var(--teal)}.dot.green{background:var(--green);box-shadow:0 0 6px var(--green)}.dot.red{background:var(--rose)}
.pulse{animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(45,212,191,.7)}100%{box-shadow:0 0 0 10px rgba(45,212,191,0)}}
.loading.noroom{padding:24px;text-align:center;gap:8px}.loading.noroom ha-icon{--mdc-icon-size:40px;color:var(--teal)}.loading.noroom b{color:var(--tx);font-size:16px}.loading.noroom span{max-width:420px;line-height:1.5}
.loading{position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;color:var(--mu);font-size:13px;transition:opacity .6s}
.loading.gone,.hint.gone{opacity:0;pointer-events:none}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.1);border-top-color:var(--teal);animation:spin 1s linear infinite}
.drawer{position:absolute;top:12px;right:12px;bottom:12px;width:290px;max-width:calc(100% - 24px);padding:16px;border-radius:18px;background:rgba(10,15,30,.82);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);transform:translateX(calc(100% + 20px));transition:transform .35s cubic-bezier(.2,.8,.2,1);overflow:auto;box-shadow:-20px 0 50px -20px rgba(0,0,0,.6)}
.drawer.open{transform:none}
.dh{display:flex;align-items:center;gap:10px;margin:-16px -16px 14px;padding:20px 16px 10px;position:sticky;top:-16px;z-index:3;background:rgba(10,15,30,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:18px 18px 0 0;touch-action:none;cursor:grab}
.dh::before{content:'';position:absolute;top:7px;left:50%;width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.28);transform:translateX(-50%)}
.drawer{overscroll-behavior:contain}
@media (pointer:coarse){.dh>[data-act=close]{display:none}}.dh>ha-icon{color:var(--teal)}.dh h3{flex:1;margin:0;font-size:16px}
.dstats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.dstats div{padding:12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;display:flex;flex-direction:column}
.dstats b{font-size:26px;font-weight:700;letter-spacing:-1px}.dstats span{font-size:11px;color:var(--mu)}
.dac{border-radius:14px;background:var(--panel2);border:1px solid var(--line);margin-bottom:12px;overflow:hidden;transition:border-color .25s}
.dac.on{border-color:color-mix(in srgb,var(--c) 50%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent)}
.dac-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;cursor:pointer}
.dac-l{display:flex;align-items:center;gap:8px;font-size:12px;min-width:0}.dac-l span{color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dac .tgt.sm{gap:6px}.dac .ibtn{width:30px;height:30px}.dac .pow{width:30px;height:30px}
.dac-chev{--mdc-icon-size:18px;color:var(--mu);margin-left:2px}
.dac.open .acctl{padding-top:2px;border-top:1px solid var(--line)}
.blbl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;background:rgba(8,12,24,.72);border:1px solid rgba(52,211,153,.5);color:var(--tx);backdrop-filter:blur(6px);will-change:transform}
.blbl ha-icon{--mdc-icon-size:13px;color:var(--green)}.blbl.unl{border-color:rgba(251,113,133,.7)}.blbl.unl ha-icon{color:var(--rose)}.blbl.na{border-color:var(--line)}.blbl.na ha-icon{color:var(--mu)}
.blbl button{display:inline-flex;margin-inline-start:2px;color:var(--mu)}.blbl button ha-icon{color:inherit}
.fb{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;width:10px;height:10px;border-radius:50%;background:rgba(148,163,184,.85);border:2px solid rgba(8,12,24,.8);box-shadow:0 2px 8px rgba(0,0,0,.5);display:grid;place-items:center;will-change:transform;transition:width .2s,height .2s,background .2s}
.fb::before{content:'';position:absolute;inset:-12px;border-radius:50%} /* a bigger tap area than the dot */
.fb.big{width:26px;height:26px;background:rgba(8,12,24,.8);border:1px solid rgba(255,255,255,.18)}.fb ha-icon{--mdc-icon-size:15px;color:var(--mu)}
.fb.on{background:var(--amber);box-shadow:0 0 12px -2px var(--amber)}.fb.on.big{background:rgba(251,191,36,.22);border-color:rgba(251,191,36,.7)}.fb.on ha-icon{color:var(--amber)}
.fb.na{background:var(--rose)}.fb.na.big{background:rgba(244,63,94,.18);border-color:rgba(251,113,133,.6)}.fb.na ha-icon{color:var(--rose)}
[dir=rtl] .drawer{right:auto;left:12px;transform:translateX(calc(-100% - 20px));box-shadow:20px 0 50px -20px rgba(0,0,0,.6)}[dir=rtl] .drawer.open{transform:none}
[dir=rtl] .lvls{right:auto;left:12px}[dir=rtl] .legend{left:auto;right:12px}[dir=rtl] .lrow,[dir=rtl] .mrow{text-align:right}
[dir=rtl] #cv,[dir=rtl] .labels{direction:ltr}[dir=rtl] .lbl,[dir=rtl] .fb{direction:rtl}
[dir=rtl]{font-family:'Noto Kufi Arabic','SF Arabic','Noto Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif}
.lvls{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:4px;padding:4px;border-radius:14px;background:rgba(8,12,24,.72);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:1}
.lvls button{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;font-size:12px;font-weight:600;color:var(--mu);min-height:36px}
.lvls button.on{background:rgba(45,212,191,.2);color:var(--teal)}.lvls ha-icon{--mdc-icon-size:16px}
.viewport:has(.drawer.open) .lvls{display:none}
@media (pointer:coarse){.lvls button{min-height:44px}}
.hint{position:absolute;left:50%;top:12px;transform:translate(-50%,-8px);max-width:min(460px,calc(100% - 24px));display:none;align-items:center;gap:8px;padding:8px 6px 8px 12px;border-radius:14px;background:rgba(8,12,24,.85);border:1px solid rgba(45,212,191,.45);font-size:12.5px;line-height:1.35;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);z-index:2;opacity:0;transition:opacity .4s,transform .4s}
.hint.on{display:flex;opacity:1;transform:translate(-50%,0)}.hint>ha-icon{color:var(--teal);flex:none}.hint span{flex:1}.hint .ibtn{flex:none;width:32px;height:32px}
.ch .rnbtn{flex:none}.rnsave{width:100%;display:flex;justify-content:center;gap:8px;margin-top:10px}.rnsave span{flex:none}
.rnrow{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:10px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px}
.rnrow ha-icon{color:var(--mu);grid-row:span 2}.rnrow small{grid-column:2;font-size:10.5px;color:var(--mu);margin:2px 0 0;opacity:.8}
.rnrow input{font:inherit;font-size:13px;color:var(--tx);background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:8px;padding:7px 9px;min-width:0;width:100%}
.rnrow input:focus{outline:none;border-color:var(--teal);background:rgba(45,212,191,.08)}.rnrow.na{opacity:.6}
.wents{margin-top:12px}
:host(:not([editing])) .edit-only{display:none!important}
.hbtn{flex:none;display:grid;place-items:center;width:32px;height:32px;margin:-6px -6px -6px 2px;border-radius:9px;color:var(--mu);opacity:.65}
@media (hover:hover){.hbtn:hover{opacity:1;background:rgba(255,255,255,.08)}}.hbtn ha-icon{--mdc-icon-size:17px}.hbtn.confirm{opacity:1;color:var(--rose);background:rgba(244,63,94,.15);position:relative}
.hbtn.confirm::after{left:auto;right:0;transform:none} /* the tip sits over the eye button, kept inside the card at the right edge */
@media (pointer:coarse){.hbtn{width:40px;height:40px}}
.fgrp{border-radius:14px;margin-bottom:8px}.fgrp .lrow:last-child,.fgrp .mrow:last-child{margin-bottom:0}
.fhd{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--mu);margin:2px 2px 6px}.fhd ha-icon{--mdc-icon-size:16px}
.fgrp.focus{padding:10px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.45);margin-bottom:12px}.fgrp.focus .fhd{color:var(--tx);font-size:13px}.fgrp.focus .fhd ha-icon{color:var(--teal)}
.dfold{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;padding:8px;margin-bottom:6px;border-radius:10px;font-size:12px;color:var(--mu);border:1px dashed var(--line)}
.mrow.na{opacity:.6}.mrow.na b{color:var(--rose)}
@media (pointer:coarse){.lrow,.mrow{min-height:48px;padding:12px 14px;font-size:13.5px}.dfold{min-height:44px}.lbl{padding:7px 11px;font-size:12.5px}.drawer .ibtn{min-width:44px;min-height:44px}.fb.big{width:32px;height:32px}}
.dsec{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:var(--mu);margin:12px 0 6px}
.lrow,.mrow{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px;font-size:12.5px;text-align:left;cursor:pointer}
.lrow span,.mrow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lrow b,.mrow b{font-size:11.5px;color:var(--mu);font-weight:600}
.lrow ha-icon,.mrow ha-icon{color:var(--mu)}
.lrow.on{background:linear-gradient(100deg,rgba(251,191,36,.25),rgba(251,191,36,.05));border-color:rgba(251,191,36,.5)}.lrow.on ha-icon{color:var(--amber);filter:drop-shadow(0 0 6px var(--amber))}.lrow.on b{color:var(--amber)}
.lrow.on.cool{background:linear-gradient(100deg,rgba(96,165,250,.25),transparent);border-color:rgba(96,165,250,.5)}.lrow.on.cool ha-icon{color:var(--blue);filter:none}
.mrow .m2 small{display:block;font-size:10.5px;color:var(--mu);margin-top:1px;font-weight:400}.mrow.on .m2 small{color:color-mix(in srgb,var(--teal) 70%,var(--mu))}
.mrow.on{border-color:rgba(45,212,191,.5);background:rgba(45,212,191,.12)}.mrow.on ha-icon,.mrow.on b{color:var(--teal)}
ha-icon.spin{animation:spin 1.2s linear infinite}
.empty{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--mu);padding:10px}
.roomstrip{display:flex;gap:8px;margin-top:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.rchip{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:12px;white-space:nowrap;flex:none;transition:.2s}
.rchip ha-icon{--mdc-icon-size:16px;color:var(--mu)}.rchip b{font-size:12px}
.rchip.lit{border-color:rgba(251,191,36,.35)}.rchip.lit ha-icon{color:var(--amber)}
.rchip.sel{background:rgba(45,212,191,.18);border-color:var(--teal)}

/* energy */
.flow{position:relative;height:170px;width:300px;max-width:100%;margin:-4px auto 8px}
.flowsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fl{fill:none;stroke:rgba(255,255,255,.08);stroke-width:3;stroke-linecap:round}
.fl.act{stroke-dasharray:2 12;stroke-width:4;animation:dash 1s linear infinite}
.fl.act.sun{stroke:#fbbf24;filter:drop-shadow(0 0 4px #fbbf24)}.fl.act.grid{stroke:#60a5fa;filter:drop-shadow(0 0 4px #60a5fa)}.fl.act.exp{stroke:#34d399;filter:drop-shadow(0 0 4px #34d399)}
.fl.act.dev{stroke:#a78bfa;stroke-width:3;filter:drop-shadow(0 0 3px #a78bfa)}
.n-dev{top:212px;width:92px;transform:translateX(-50%)}.n-dev ha-icon{--mdc-icon-size:18px;width:36px;height:36px;background:rgba(167,139,250,.14);color:#c4b5fd}
.n-dev b{font-size:13px}.n-dev span{max-width:92px;overflow:hidden;text-overflow:ellipsis}
.fl.s1{animation-duration:.45s}.fl.s2{animation-duration:.8s}.fl.s3{animation-duration:1.4s}.fl.s4{animation-duration:2.2s}
@keyframes dash{to{stroke-dashoffset:-28}}
.node{position:absolute;display:flex;flex-direction:column;align-items:center;width:96px;cursor:pointer;line-height:1.15}
.node ha-icon{--mdc-icon-size:24px;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;margin-bottom:4px}
.node b{font-size:15px;font-weight:700}.node span{font-size:10.5px;color:var(--mu);white-space:nowrap}
.n-sun{left:50%;top:-4px;transform:translateX(-50%)}.n-sun ha-icon{background:rgba(251,191,36,.16);color:var(--amber);box-shadow:0 0 24px -6px var(--amber)}
.n-grid{left:6px;top:96px}.n-grid ha-icon{background:rgba(96,165,250,.16);color:var(--blue)}.n-grid.exp ha-icon{background:rgba(52,211,153,.18);color:var(--green)}
.n-home{right:6px;top:96px}.n-home ha-icon{background:rgba(167,139,250,.18);color:var(--violet);box-shadow:0 0 24px -6px var(--violet)}
.spark{margin:26px 0 12px;min-height:150px}
.spk-wrap{display:grid;grid-template-columns:max-content 1fr;column-gap:6px;grid-template-rows:120px 16px}
.spk-y{position:relative;font-size:9.5px;font-variant-numeric:tabular-nums}.spk-y i{display:block;visibility:hidden;height:0;font-style:normal}.spk-y::before{content:'kW';position:absolute;top:-15px;left:0;font-size:9px;color:var(--mu);opacity:.7}.spk-y span{position:absolute;right:0;transform:translateY(-50%);line-height:1;color:var(--mu)}
.spk{position:relative;touch-action:pan-y;cursor:crosshair}.spk svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
.spk-g line{stroke:rgba(255,255,255,.07);stroke-width:1;vector-effect:non-scaling-stroke}.spk-g line.z{stroke:rgba(255,255,255,.28)}
.spk-v{stroke:rgba(255,255,255,.05);stroke-width:1;vector-effect:non-scaling-stroke}
.spk-now{stroke:rgba(45,212,191,.7);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.spk-x{grid-column:2;position:relative}.spk-x span{position:absolute;top:3px;transform:translateX(-50%);font-size:9.5px;color:var(--mu)}.spk-x span:first-child{transform:none}.spk-x span:last-child{transform:translateX(-100%)}
.spk-pk{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.18);pointer-events:none}
.spk-pk em{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);font-style:normal;font-size:9.5px;font-weight:700;white-space:nowrap;color:#fff;background:rgba(8,12,24,.75);padding:1px 5px;border-radius:6px}
.spk-cur{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.55);pointer-events:none}
.spk-tip{position:absolute;top:2px;margin-left:8px;padding:6px 8px;border-radius:10px;background:rgba(8,12,24,.92);border:1px solid var(--line);font-size:10.5px;display:flex;flex-direction:column;gap:2px;white-space:nowrap;pointer-events:none;z-index:2}
.spk-tip.l{transform:translateX(-100%);margin-left:-8px}.spk-tip b{font-size:11px}.spk-tip span{display:flex;align-items:center;gap:5px;color:var(--mu)}.spk-tip i{width:8px;height:8px;border-radius:2px}
.sk-lg i.dash,.spk-tip i.dash{background:none!important;border-top:2px dashed #e7ecf6;height:0;width:12px;border-radius:0}
.sk-lg button{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--mu);padding:2px 0}.sk-lg button.off{opacity:.35;text-decoration:line-through}
.ehtop{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ehseg button{padding:6px 11px}
.ehnav{display:flex;align-items:center;gap:6px}.ehnav b{font-size:13px;min-width:92px;text-align:center}.ehnav .ibtn{width:32px;height:32px}.ehnav .ibtn[disabled]{opacity:.3;pointer-events:none}
.kpis.four{grid-template-columns:repeat(4,1fr)}.kpis.one{grid-template-columns:1fr}.kpis b.amber{color:var(--amber)}.kpis b.green{color:var(--green)}
.ehread{font-size:11.5px;margin:2px 0 6px;min-height:16px;line-height:1.5}.ehread.mu{color:var(--mu)}
.ehchart{position:relative;padding-left:30px}.ehchart svg{display:block;width:100%;height:150px;overflow:visible}
.ehchart .gl{stroke:rgba(255,255,255,.08);stroke-width:1;vector-effect:non-scaling-stroke}
.ehchart .hit{fill:transparent;cursor:pointer}.ehchart g.sel rect:not(.hit){filter:brightness(1.35)}.ehchart g.sel .hit{fill:rgba(255,255,255,.07)}
.ehy{position:absolute;left:0;top:0;height:150px;width:26px}.ehy i{position:absolute;right:0;transform:translateY(-50%);font-style:normal;font-size:9.5px;color:var(--mu)}
.ehx{display:grid;margin-top:4px}.ehx i{font-style:normal;font-size:9.5px;color:var(--mu);text-align:center;white-space:nowrap;overflow:visible}
.ehlg{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}.ehlg .lg{display:flex;align-items:center;gap:5px;font-size:11px;padding:4px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.ehlg .lg i{width:9px;height:9px;border-radius:3px}.ehlg .rst{color:var(--teal)}.ehlg .rst ha-icon{--mdc-icon-size:13px}
.crow.ehrow{grid-template-columns:20px minmax(70px,110px) 1fr 52px 34px;padding:5px 6px;border-radius:10px;border:1px solid transparent}
.crow.ehrow em{font-style:normal;font-size:10.5px;color:var(--mu);text-align:right}
.crow.ehrow.on{background:color-mix(in srgb,var(--c) 12%,transparent);border-color:color-mix(in srgb,var(--c) 45%,transparent)}.crow.ehrow.on ha-icon{color:var(--c)}
.crow.untr{cursor:default}.eh-msg{padding:40px 0;text-align:center}
.sk-lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;color:var(--mu);margin:6px 0 0}.sk-lg span{display:flex;align-items:center;gap:4px}.sk-lg span:last-child{margin-left:auto}.sk-lg i{width:8px;height:8px;border-radius:2px}
.sk-empty{font-size:11px;color:var(--mu);padding:20px 0;text-align:center}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.kpis div{padding:9px 10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);display:flex;flex-direction:column;cursor:pointer;min-width:0}
.kpis span{font-size:10.5px;color:var(--mu)}.kpis b{font-size:15px;font-weight:700;white-space:nowrap}.kpis em{font-style:normal;font-size:11px;color:var(--green)}
.kpis.small b{font-size:12.5px}
.pill.pillsw{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font:inherit;font-size:11px;font-weight:600}.pill.pillsw ha-icon{--mdc-icon-size:16px}
.pill.tankpill{display:inline-flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap}.pill.tankpill ha-icon{--mdc-icon-size:13px}
.kpis.e4 div{padding:8px 8px}.kpis.e4 b{white-space:normal;line-height:1.15}.kpis.e4 b small{white-space:nowrap}
.cons{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.crow{display:grid;grid-template-columns:20px 84px 1fr 62px;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.crow ha-icon{--mdc-icon-size:16px;color:var(--mu)}.crow span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.crow b{text-align:right;font-size:12px}
.bar{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden}.bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#8b5cf6,#22d3ee);transition:width .6s}

/* water */
.water{display:flex;gap:12px}
.tank{position:relative;width:104px;flex:none;height:180px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid var(--line);overflow:hidden;cursor:pointer}
.liquid{position:absolute;left:0;right:0;bottom:0;height:var(--lvl);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 75%,transparent),color-mix(in srgb,var(--c) 35%,#0b1222));transition:height 1s}
.wave{position:absolute;left:0;top:-9px;width:200%;height:10px;fill:color-mix(in srgb,var(--c) 75%,transparent);animation:wave 3s linear infinite}
@keyframes wave{to{transform:translateX(-50%)}}
.tank-lbl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.tank-lbl b{font-size:26px;font-weight:800}.tank-lbl span{font-size:10px;color:#dbeafe;padding:0 6px}
.wtiles{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.wtiles .tile{padding:8px 10px}
ha-icon.pulse{animation:none;color:var(--teal)}

/* car */
.csoc{margin-top:8px;cursor:pointer;min-width:110px}.csoc .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}.csoc .bar i{display:block;height:100%;border-radius:3px}
.csoc em{display:block;font-style:normal;font-size:11.5px;color:var(--mu);margin-top:4px}
.carviz{position:relative;display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer}
.carviz svg{width:62%;max-width:270px;flex:none;overflow:visible}
.carviz .body{fill:url(#cbody);stroke:rgba(255,255,255,.32);stroke-width:.9;transition:stroke .3s}
.carviz .glass{fill:url(#cglass);stroke:none}.carviz .pillar{fill:#07090c}.carviz .cpil{fill:#52575e}
.carviz .chrome{fill:none;stroke:#cfd5dc;stroke-width:.8;stroke-linejoin:round;opacity:.85}
.carviz .rail{fill:none;stroke:#c6ccd4;stroke-width:1.5;stroke-linecap:round}.carviz .rail.feet{stroke-width:1.2}
.carviz .spoiler{fill:#2a2e33}.carviz .clad{fill:#0a0b0d}
.carviz .accent{fill:none;stroke:#38bdf8;stroke-width:1.3;stroke-linecap:round;filter:drop-shadow(0 0 2px rgba(56,189,248,.9))}
.carviz .tail{fill:#ef4444;filter:drop-shadow(0 0 2.5px rgba(239,68,68,.9))}.carviz .head{fill:#e0f2fe;filter:drop-shadow(0 0 2.5px rgba(224,242,254,.9))}.carviz .drl{fill:#f1f5f9;opacity:.9}
.carviz .line{fill:none;stroke:rgba(255,255,255,.18);stroke-width:.7}.carviz .handle{fill:rgba(255,255,255,.32)}.carviz .mirror{fill:#3e4248;stroke:rgba(255,255,255,.3);stroke-width:.6}
.carviz .tire{fill:#040506;stroke:#1f2937;stroke-width:1.4}.carviz .rim{fill:#30353d}.carviz .lip{fill:none;stroke:#aab2bd;stroke-width:.7}.carviz .spoke{stroke:#d7dde4;stroke-width:1.4;stroke-linecap:round}.carviz .hub{fill:#15181c;stroke:#c7cdd5;stroke-width:.8}
.carviz .cbar{fill:rgba(255,255,255,.08)}.carviz .cbarf{fill:url(#cg)}
.car.charging .cbarf{animation:charge 2s ease-in-out infinite}.car.charging .body{stroke:var(--green);filter:drop-shadow(0 0 6px rgba(52,211,153,.5))}
@keyframes charge{0%{width:0}100%{width:64px}}
.cpow{display:flex;flex-direction:column}.cpow b{font-size:22px;font-weight:700}.cpow span{font-size:11px;color:var(--mu)}

/* bottom */
.camgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.cam{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#0b1222 linear-gradient(135deg,#0f172a,#111827);cursor:pointer;border:1px solid var(--line)}
.cam img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .5s}.cam img.ok{opacity:1}
.camlive{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.camlive>*{display:block;width:100%;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none;--ha-card-background:transparent}
.camlive>img{object-fit:cover}
.cam-ov{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:9px;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 35%,transparent 55%,rgba(0,0,0,.75))}
.cam-top{display:flex;justify-content:space-between;align-items:center}
.live{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:1px;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.45)}
.live i{width:7px;height:7px;border-radius:50%;background:var(--green)}.live.mo{background:rgba(244,63,94,.85)}.live.mo i{background:#fff;animation:blink .8s infinite}
.tags{display:flex;gap:4px}.tag{display:flex;align-items:center;gap:3px;font-style:normal;font-size:10px;font-weight:600;padding:3px 7px;border-radius:6px}
.tag ha-icon{--mdc-icon-size:12px}.tag.p{background:rgba(251,191,36,.9);color:#111}.tag.c{background:rgba(96,165,250,.9);color:#0b1222}.tag.d{background:rgba(244,63,94,.92);color:#fff}
.cam-bot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cam-bot b{font-size:13px;margin-right:auto}
.cam-bot span{display:flex;align-items:center;gap:3px;font-size:10.5px;color:#e2e8f0;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:6px}.cam-bot span ha-icon{--mdc-icon-size:12px}
.relay{position:relative;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(45,212,191,.85);color:#0b1222}.relay ha-icon{--mdc-icon-size:14px}
.np{display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:linear-gradient(120deg,rgba(236,72,153,.16),rgba(139,92,246,.1));border:1px solid var(--line);cursor:pointer;margin-bottom:10px}
.art{width:56px;height:56px;border-radius:14px;flex:none;overflow:hidden;display:grid;place-items:center;background:rgba(0,0,0,.3)}.art img{width:100%;height:100%;object-fit:cover}.art ha-icon{--mdc-icon-size:30px;color:#f43f5e}
.npt{min-width:0;flex:1;display:flex;flex-direction:column}.npt b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.npt span{font-size:11.5px;color:var(--mu)}
.eq{display:flex;gap:3px;align-items:flex-end;height:14px;margin-top:5px}.eq i{width:3px;height:3px;border-radius:2px;background:#f472b6}
.np.playing .eq i{animation:eq .9s ease-in-out infinite alternate}.np.playing .eq i:nth-child(2){animation-delay:-.3s}.np.playing .eq i:nth-child(3){animation-delay:-.6s}.np.playing .eq i:nth-child(4){animation-delay:-.15s}
@keyframes eq{from{height:3px}to{height:14px}}
.mctl{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:12px}
.yt{padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);margin-bottom:8px}
.ytl{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px}.ytl ha-icon{color:#ef4444}.ytl span{flex:1;color:var(--mu)}
.yt .bar{margin-bottom:10px}
.sel{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--mu)}.sel b{color:#fff}.sel ha-icon{--mdc-icon-size:15px}
.sel.on{border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.14)}
.mini{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 4px;cursor:pointer}.mini span{flex:1;color:var(--mu)}.mini ha-icon{--mdc-icon-size:16px;color:var(--mu)}.mini b{font-size:11px;text-transform:capitalize}
.stats3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.stats3 div{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;text-align:center}
.stats3 ha-icon{--mdc-icon-size:17px;color:var(--mu)}.stats3 b{font-size:13px}.stats3 span{font-size:10px;color:var(--mu)}
.rings{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ring{position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer}
.ring svg{width:84px;height:84px;transform:rotate(-90deg);overflow:visible} /* let the glow spill past the SVG box */.rb{fill:none;stroke:rgba(255,255,255,.07);stroke-width:6}.rf{fill:none;stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset 1s;filter:drop-shadow(0 0 4px currentColor)}
.ring b{position:absolute;top:0;left:0;right:0;height:84px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;pointer-events:none}.ring b small{font-size:10px;font-weight:600;color:var(--mu);margin-left:1px} /* number + % centred together */.ring span{font-size:11px;color:var(--mu);margin-top:-2px}
.rings.r4{grid-template-columns:repeat(4,1fr);gap:2px}.r4 .ring svg{width:68px;height:68px}.r4 .ring b{height:68px;font-size:15px}
.stats3.s4{grid-template-columns:repeat(4,1fr)}.s4 div[style] ha-icon{color:#fbbf24}
.vms{display:flex;flex-direction:column;gap:5px;margin-top:10px}
.vm{display:grid;grid-template-columns:20px 1fr 10px 64px 60px;align-items:center;gap:8px;font-size:12px;padding:6px 8px;border-radius:10px;background:var(--panel2);cursor:pointer}
.vm ha-icon{--mdc-icon-size:16px;color:var(--violet)}.vm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vm.off{opacity:.55}
.vmg{display:flex;align-items:center;justify-content:center;width:28px;height:26px;margin:-4px -4px -4px -6px;cursor:grab;touch-action:none;color:var(--mu)}.vmg ha-icon{color:var(--mu)!important}.vm.drag{outline:2px solid var(--teal);background:color-mix(in srgb,var(--teal) 14%,var(--panel2));cursor:grabbing;position:relative;z-index:1}
.vmmore{display:flex;align-items:center;justify-content:center;gap:4px;padding:7px;border-radius:10px;background:none;border:1px dashed var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.vmmore ha-icon{--mdc-icon-size:16px}.vm em{font-style:normal;font-size:10.5px;color:var(--mu);text-align:right}
.devs{display:flex;flex-direction:column;gap:8px}
.dev{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.dev>ha-icon{color:var(--blue)}
.dn{flex:1;display:flex;flex-direction:column;min-width:0}.dn b{font-size:12.5px}.dn span{font-size:10.5px;color:var(--mu);text-transform:capitalize}
.batt{position:relative;width:40px;height:18px;border-radius:5px;border:2px solid rgba(255,255,255,.3);padding:1px;display:flex;align-items:center;justify-content:center}
.batt::after{content:'';position:absolute;right:-5px;top:4px;width:3px;height:6px;border-radius:0 2px 2px 0;background:rgba(255,255,255,.3)}
.batt i{position:absolute;left:1px;top:1px;bottom:1px;width:calc(var(--b) - 2px);border-radius:2px;background:var(--c)}
.batt ha-icon{--mdc-icon-size:12px;position:relative;color:#fff;filter:drop-shadow(0 0 2px #000)}
.dev em{font-style:normal;font-size:12px;font-weight:600;width:36px;text-align:right}
.valves{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
.valve{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 6px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.2s}
.valve .drops{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.05);color:var(--mu)}
.valve b{font-size:12.5px}.valve span{font-size:10.5px;color:var(--mu)}
.valve.on{border-color:rgba(56,189,248,.55);background:linear-gradient(180deg,rgba(56,189,248,.22),transparent)}.valve.on .drops{background:rgba(56,189,248,.25);color:#38bdf8;animation:pulseb 1.6s infinite}
@keyframes pulseb{0%{box-shadow:0 0 0 0 rgba(56,189,248,.6)}100%{box-shadow:0 0 0 14px rgba(56,189,248,0)}}
.sched{display:flex;flex-wrap:wrap;gap:6px}
.nextirr{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px;margin-bottom:4px}
.ni{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;cursor:pointer;background:linear-gradient(110deg,rgba(56,189,248,.14),transparent);border:1px solid rgba(56,189,248,.28)}
.ni>ha-icon{color:#38bdf8;--mdc-icon-size:22px}.ni:last-child{background:linear-gradient(110deg,rgba(251,191,36,.12),transparent);border-color:rgba(251,191,36,.28)}.ni:last-child>ha-icon{color:var(--amber)}
.ni div{display:flex;flex-direction:column;min-width:0}.ni span{font-size:10.5px;color:var(--mu)}.ni b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ni em{font-style:normal;font-size:10.5px;color:var(--mu)}
.foot{position:relative;text-align:center;font-size:10.5px;color:rgba(139,151,178,.5);padding:16px 0 4px}

/* responsive */
@container app (max-width:1180px){
  .home-grid{grid-template-columns:minmax(0,1fr)}
  .home-grid>.col{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
  .tgrid.sec,.tgrid.wide1{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:860px){ .app{padding:14px 12px 8px} .sheet-bg{align-items:flex-end}.sheet{width:100%;max-width:none;border-radius:22px 22px 0 0;max-height:75vh} }
@container app (max-width:820px){
  .tgrid{gap:14px}.home-grid{gap:14px}
  .tb{padding:9px 12px;font-size:12px}
  .viewport{height:max(360px,60vh)}
  .lbl{font-size:10px;padding:3px 7px;gap:4px;border-radius:9px}.lbl .h{display:none}.lbl ha-icon{--mdc-icon-size:12px}
  .lbl.nodata:not(.lit):not(.mo):not(.sel){display:none!important}
  .tools .ibtn{width:32px;height:32px}
  .top{gap:12px;margin-bottom:14px}
  .clock{gap:4px 10px}.clock #time{font-size:36px;letter-spacing:-1.5px}.clock .date{font-size:13px}
  .greet{font-size:13px;padding-right:96px}
  /* header chips: one swipeable row, edge to edge */
  .hdr-right{width:calc(100% + 24px);margin:0 -12px;padding:2px 12px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-padding:0 12px}
  .hdr-right::-webkit-scrollbar{display:none}
  .chip{height:38px;flex:none;font-size:12.5px;padding:0 12px 0 6px;gap:7px}.chip>ha-icon{width:26px;height:26px;--mdc-icon-size:15px}
  .chip.big{padding:0 13px 0 6px}.chip.big b{font-size:13.5px}.chip.big span{font-size:10px}
  /* avatars: top-right corner of the header */
  .hdr-right .persons{position:absolute;top:0;right:0;margin:0}.person{width:38px;height:38px}
  .seg button span{display:none}
  .drawer{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:calc(100% - 16px);transform:translateY(calc(100% + 20px))}
  .camgrid{grid-template-columns:1fr;gap:10px} /* phones: cameras stacked, full width */
}
`;

// every method of the card and the scene works on its own instance's model (several cards / the editor preview)
for (const [cls, own] of [[SweetHomeCard, o => o._model], [HouseScene, o => o.card?._model]]) {
  for (const k of Object.getOwnPropertyNames(cls.prototype)) {
    const d = Object.getOwnPropertyDescriptor(cls.prototype, k);
    if (k === 'constructor' || typeof d.value !== 'function') continue;
    const f = d.value;
    cls.prototype[k] = function (...a) { const m = own(this); if (m && MODEL !== m) useModel(m); return f.apply(this, a); };
  }
}
if (!customElements.get('sweet-home-card')) customElements.define('sweet-home-card', SweetHomeCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'sweet-home-card')) window.customCards.push({ type: 'sweet-home-card', name: 'Sweet Home', description: 'Your home as an interactive 3D model, with tabs for security, climate, energy, media and more', preview: true, documentationURL: 'https://github.com/mousawm/sweet-home' });
console.info(`%c SWEET HOME %c v${VERSION} `, 'background:#2dd4bf;color:#04342c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#1e293b;color:#e2e8f0;border-radius:0 4px 4px 0;padding:2px 6px');
