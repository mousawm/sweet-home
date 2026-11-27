/*
 * Sweet Home — shared helpers and the current model (rooms, walls, furniture, entity map) for the card, its panels
 * and the 3D scene.
 */
import { FURN_TYPES } from './model.js';
import { t as tr, uiLang as cardLang } from './i18n.js';

export const VERSION = typeof __SH_VERSION__ !== 'undefined' ? __SH_VERSION__ : 'dev';

/* ------------------------------------------------------------------ */
/* the current model (rooms, walls, furniture, entity map). Each card instance has its own model; the methods of
/* the card and the scene switch these module variables to their own model when they run (see `bindModel` below).  */
/* ------------------------------------------------------------------ */
export let MODEL = null, E = null, ROOMS = [], ROOM = {}, DOOR_INFO = {}, WALLS = [], DOORS = [], FURN = [], BADGES = [];
export let CX = 5, CZ = 4, PLAN_W = 10, PLAN_D = 8, WALL_H = 1.35, SPAN = 12;
export function useModel(m) {
  if (!m || MODEL === m) return;
  MODEL = m; E = m.E; ROOMS = m.rooms; ROOM = Object.fromEntries(ROOMS.map(r => [r.id, r]));
  DOOR_INFO = m.doorInfo || {}; WALLS = m.walls; DOORS = m.doors; FURN = m.furniture; BADGES = m.badges;
  CX = m.plan.CX; CZ = m.plan.CZ; PLAN_W = m.plan.W; PLAN_D = m.plan.D; WALL_H = m.wallH; SPAN = Math.max(PLAN_W, PLAN_D, 6);
}
// sections shown on each tab
// panels whose entities can be renamed for this dashboard (pencil in edit mode)
export const RN_SECS = ['glance', 'modes', 'security', 'cams', 'climate', 'energy', 'car', 'ehist', 'water', 'irrigation', 'media', 'mserver', 'tvlight', 'alerts', 'lab', 'devices'];
export const TAB_SECS = { home: ['glance'], security: ['security', 'cams'], climate: ['climate'], energy: ['energy', 'car', 'ehist'], water: ['water', 'irrigation'], media: ['media', 'mserver', 'tvlight'], system: ['alerts', 'zigbee', 'zblist', 'zbmap', 'lab', 'devices'] };

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
// Title Case for names: capitalise each word that is all lowercase (keeps LED, TV, iPad, LocalAI as they are)
export const tc = s => String(s ?? '').replace(/(^|[\s(/&-])(\p{Ll}[\p{Ll}\d']*)(?=$|[\s),./&-])/gu, (m, a, w) => a + w[0].toUpperCase() + w.slice(1));
// "just now", "5 min ago", "2 h 10 min ago", "yesterday 21:40", "Sat 14:05", "12 Nov 09:30". In the card's language:
// English as written here; any other language through the browser's own formatting (Intl), so "15 min ago" reads
// "قبل 15 دقيقة" in Arabic and is right in every language, with no word list to keep up.
const relFmt = L => { try { return new Intl.RelativeTimeFormat(L, { numeric: 'auto' }); } catch (e) { return null; } };
const unitFmt = (L, unit) => { try { return new Intl.NumberFormat(L, { style: 'unit', unit, unitDisplay: 'long' }); } catch (e) { return null; } };
const uiLang = () => cardLang(); // times in the language the card is shown in, like the rest of its text
// a date / time a sensor gives as text ("27 Nov at 4:00 AM", an ISO timestamp): in English as it is; in another
// language read and written again in that language ("27 نوفمبر، 4:00 ص"), else kept as it is in its own direction
export const whenText = s => {
  const x = String(s ?? '').trim(), L = uiLang();
  if (!x || /^en\b/.test(L)) return x;
  let d = /^\d{4}-\d{2}-\d{2}/.test(x) ? new Date(x) : null;
  if (!d || isNaN(d)) {
    const t = x.replace(/\s+at\s+/i, ' ').replace(/,/g, ' ');
    const y = /\b\d{4}\b/.test(t) ? '' : ` ${new Date().getFullYear()}`;
    const m = t.match(/^(.*?)(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)?$/);
    d = m && /[A-Za-z]{3}/.test(m[1]) && /\d/.test(m[1]) ? new Date(`${m[1].trim()}${y} ${m[2] || ''}`.trim()) : null;
    if (d && !isNaN(d) && y && d < Date.now() - 180 * 864e5) d.setFullYear(d.getFullYear() + 1); // "2 Jan" seen in December: next year
    if (d && !isNaN(d) && !m[2]) return d.toLocaleDateString(L, { weekday: 'short', day: 'numeric', month: 'long' });
  }
  if (!d || isNaN(d)) return null;
  return d.toLocaleString(L, { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
};
export const ago = (iso, lang = 'en') => {
  const t = new Date(iso), s = (Date.now() - t) / 1000; if (isNaN(s)) return '';
  const L = uiLang(lang), rel = !/^en\b/.test(L) && relFmt(L);
  if (s < 45) return rel ? rel.format(0, 'second') : 'just now';
  if (s < 3600) return rel ? rel.format(-Math.round(s / 60), 'minute') : `${Math.round(s / 60)} min ago`;
  if (s < 6 * 3600) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return rel ? rel.format(-Math.round(s / 3600), 'hour') : `${h} h${m ? ` ${m} min` : ''} ago`; }
  const hm = t.toLocaleTimeString(L, { hour: '2-digit', minute: '2-digit' }), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (days === 0) return `${rel ? rel.format(0, 'day') : 'today'} ${hm}`;
  if (days === 1) return `${rel ? rel.format(-1, 'day') : 'yesterday'} ${hm}`;
  if (days < 7) return `${t.toLocaleDateString(L, { weekday: 'short' })} ${hm}`;
  return `${t.toLocaleDateString(L, { day: 'numeric', month: 'short' })} ${hm}`;
};
// short form for one-line rows: "now", "5 min", "2 h", "yesterday", "Sat", "12 Nov" (other languages: Intl, as above)
export const agoShort = (iso, lang = 'en') => {
  const t = new Date(iso), s = (Date.now() - t) / 1000; if (isNaN(s)) return '';
  const L = uiLang(lang), en = /^en\b/.test(L), rel = !en && relFmt(L), unit = (n, u) => (!en && unitFmt(L, u)?.format(n)) || `${n} ${u === 'minute' ? 'min' : 'h'}`;
  if (s < 45) return rel ? rel.format(0, 'second') : 'now'; if (s < 3600) return unit(Math.round(s / 60), 'minute'); if (s < 12 * 3600) return unit(Math.round(s / 3600), 'hour');
  const now = new Date(), days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (days <= 0) return unit(Math.round(s / 3600), 'hour'); if (days === 1) return rel ? rel.format(-1, 'day') : 'yesterday';
  return days < 7 ? t.toLocaleDateString(L, { weekday: 'short' }) : t.toLocaleDateString(L, { day: 'numeric', month: 'short' });
};
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
export const ic = (i, cls = '') => `<ha-icon class="${cls}" icon="${i}"></ha-icon>`;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BAD = ['unavailable', 'unknown', 'none', 'None', ''];
export const TEMP_STOPS = [[16, [59, 130, 246]], [19.5, [34, 211, 238]], [22.5, [52, 211, 153]], [25.5, [251, 191, 36]], [29, [244, 63, 94]]];
// the colour of a temperature (cold blue → comfortable green → hot red); in a °F home it is read as °F
export let FAHR = false;
export function tempRGB(t) {
  if (t == null || isNaN(t)) return [120, 130, 150];
  if (FAHR) t = (t - 32) * 5 / 9;
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) { const [t0, c0] = TEMP_STOPS[i - 1]; const k = (t - t0) / (t1 - t0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * k)); }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}
export const rgb = a => `rgb(${a.join(',')})`;
// Patch `oldP` in place to match `newP` so existing nodes (buttons, sliders, camera images, animations) survive updates.
export function morph(oldP, newP, skip) {
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
export const COLORS = [
  { n: 'Warm white', k: 2700, css: '#ffd29a' }, { n: 'Cool white', k: 6000, css: '#eef4ff' },
  { n: 'Red', rgb: [255, 0, 0] }, { n: 'Orange', rgb: [255, 110, 0] }, { n: 'Amber', rgb: [255, 180, 40] },
  { n: 'Green', rgb: [0, 255, 60] }, { n: 'Cyan', rgb: [0, 220, 255] }, { n: 'Blue', rgb: [0, 60, 255] },
  { n: 'Purple', rgb: [150, 0, 255] }, { n: 'Pink', rgb: [255, 0, 150] },
];
export const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // phone / tablet
// Loading placeholders: shimmer blocks (`.skl`) shaped like the content that is coming, so cards keep their size
export const skl = (w = '100%', h = 11, extra = '') => `<span class="skl" style="width:${w};height:${h}px;${extra}"></span>`;
// a pump's running time: 4:05, 1:02:09
export const pumpTime = ms => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };
export const skPill = label => `<div class="ehspin">${ic('mdi:loading', 'spin')}<span>${esc(label)}</span></div>`;
// Proxmox guests (Home Lab "Show more", v1.19.0): a nicer name and an icon per server, from the name Proxmox reports
export const GUEST_NAMES = { adguard: 'AdGuard', npmplus: 'NPMplus', nginxproxymanager: 'Nginx Proxy Manager', vaultwarden: 'Vaultwarden', pihole: 'Pi-hole',
  esphome: 'ESPHome', qbittorrent: 'qBittorrent', localai: 'LocalAI', haos: 'Home Assistant', libretranslate: 'LibreTranslate',
  'proxmox-backup-server': 'Proxmox Backup Server', nextcloud: 'Nextcloud', frigate: 'Frigate', mariadb: 'MariaDB', jellyfin: 'Jellyfin', immich: 'Immich' };
export const GUEST_ICONS = [[/adguard/, 'mdi:shield-check'], [/pihole|pi-hole/, 'mdi:pi-hole'], [/cloudflared/, 'mdi:cloud-lock'], [/bazarr/, 'mdi:subtitles'],
  [/sonarr/, 'mdi:television-classic'], [/radarr/, 'mdi:movie-open'], [/qbittorrent|torrent/, 'mdi:download-network'], [/prowlarr/, 'mdi:radar'],
  [/seerr/, 'mdi:movie-search'], [/lingarr|translate/, 'mdi:translate'], [/flaresolverr/, 'mdi:fire'], [/immich/, 'mdi:image-multiple'],
  [/esphome/, 'mdi:chip'], [/mariadb|mysql|postgres/, 'mdi:database'], [/vaultwarden|bitwarden|-bw/, 'mdi:shield-key'], [/nginx|npm/, 'mdi:web'],
  [/notifiarr/, 'mdi:bell-ring'], [/double-take/, 'mdi:face-recognition'], [/frigate|camera/, 'mdi:cctv'], [/backup/, 'mdi:backup-restore'],
  [/supabase/, 'mdi:database-cog'], [/agent|llm|\bai\b/, 'mdi:robot'], [/games/, 'mdi:gamepad-variant'], [/tasks/, 'mdi:calendar-check'],
  [/pulse/, 'mdi:pulse'], [/localai|ollama/, 'mdi:robot'], [/nextcloud/, 'mdi:cloud'], [/jellyfin/, 'mdi:filmstrip'],
  [/haos|home.?assistant/, 'mdi:home-assistant'], [/grafana|influx|prometheus/, 'mdi:chart-box']];
export const guestInfo = (states, g) => {
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
export const carGrad = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return ['#7a8089', '#5a5f67', '#3a3e44', '#202327'];
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = f => '#' + c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, '0')).join('');
  return [mix(0.32), mix(0), mix(-0.38), mix(-0.68)];
};
export const CAR_SVG = (ch, color) => {
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
export const WHITES = [
  { n: 'Candle', k: 2200, css: '#ffb46b' }, { n: 'Warm', k: 2700, css: '#ffc98f' }, { n: 'Soft', k: 3000, css: '#ffd6aa' },
  { n: 'Natural', k: 3500, css: '#ffe4c6' }, { n: 'Neutral', k: 4000, css: '#fff0de' }, { n: 'Daylight', k: 5000, css: '#fff8f2' },
  { n: 'Cool', k: 6500, css: '#eef3ff' },
];
// option pickers: attribute that lists the options, how to read the current one, and the service that sets it
export const PICK = {
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
export const pretty = o => {
  if (o == null) return '—';
  let s = String(o).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
  if (s === s.toUpperCase()) s = s.toLowerCase();
  return tr(s.charAt(0).toUpperCase() + s.slice(1)); // a state shown to the user: in the card's language
};
// entities a tap switches on / off
export const TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'siren', 'humidifier', 'cover', 'valve', 'automation', 'remote', 'vacuum'];
// binary sensor wording by device class: [on, off]
export const BIN_LABEL = { door: ['Open', 'Closed'], window: ['Open', 'Closed'], garage_door: ['Open', 'Closed'], opening: ['Open', 'Closed'], motion: ['Detected', 'Clear'],
  occupancy: ['Detected', 'Clear'], presence: ['At home', 'Away'], moisture: ['Wet', 'Dry'], smoke: ['Smoke', 'Clear'], gas: ['Gas', 'Clear'], battery: ['Low', 'Normal'],
  plug: ['Plugged in', 'Unplugged'], power: ['Power', 'No power'], problem: ['Problem', 'OK'], connectivity: ['Connected', 'Disconnected'], lock: ['Unlocked', 'Locked'], vibration: ['Vibration', 'Still'] };
export const DOM_ICON = { light: ['mdi:lightbulb-on', 'mdi:lightbulb-outline'], switch: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'], fan: ['mdi:fan', 'mdi:fan-off'],
  input_boolean: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'], cover: ['mdi:window-shutter-open', 'mdi:window-shutter'], valve: ['mdi:valve-open', 'mdi:valve-closed'],
  media_player: ['mdi:cast-connected', 'mdi:cast'], climate: ['mdi:thermostat', 'mdi:thermostat'], lock: ['mdi:lock-open-variant', 'mdi:lock'], script: ['mdi:script-text-play', 'mdi:script-text'],
  scene: ['mdi:palette', 'mdi:palette'], button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'], input_button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'],
  camera: ['mdi:cctv', 'mdi:cctv'], vacuum: ['mdi:robot-vacuum', 'mdi:robot-vacuum'], humidifier: ['mdi:air-humidifier', 'mdi:air-humidifier-off'], siren: ['mdi:bullhorn', 'mdi:bullhorn-outline'],
  automation: ['mdi:robot', 'mdi:robot-off'], remote: ['mdi:remote', 'mdi:remote-off'], person: ['mdi:account', 'mdi:account-outline'], device_tracker: ['mdi:map-marker', 'mdi:map-marker-off'] };
export const DC_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', power: 'mdi:flash', energy: 'mdi:lightning-bolt', battery: 'mdi:battery', illuminance: 'mdi:brightness-5',
  motion: 'mdi:motion-sensor', occupancy: 'mdi:home-account', door: 'mdi:door', window: 'mdi:window-closed-variant', moisture: 'mdi:water-alert', carbon_dioxide: 'mdi:molecule-co2',
  pm25: 'mdi:blur', smoke: 'mdi:smoke-detector', opening: 'mdi:square-outline', plug: 'mdi:power-plug', outlet: 'mdi:power-socket-eu', signal_strength: 'mdi:wifi', voltage: 'mdi:sine-wave', current: 'mdi:current-ac' };
// An icon that says what a button does, from its name and id (when it has no icon of its own)
export const BTN_ICONS = [[/ring|bell|alert|chime/, 'mdi:bell-ring'], [/locat|gps|find|where|track/, 'mdi:crosshairs-gps'], [/update|refresh|sync|reload/, 'mdi:refresh'],
  [/flash|torch/, 'mdi:flashlight'], [/unlock/, 'mdi:lock-open-variant'], [/lock/, 'mdi:lock'], [/garage/, 'mdi:garage'], [/gate/, 'mdi:gate'], [/door/, 'mdi:door'],
  [/restart|reboot/, 'mdi:restart'], [/shut ?down|power ?off/, 'mdi:power'], [/notif|message|send/, 'mdi:message-text'], [/speak|tts|say|announce/, 'mdi:account-voice'],
  [/mute|silen/, 'mdi:volume-off'], [/vibrat/, 'mdi:vibrate'], [/volume/, 'mdi:volume-high'], [/wi-?fi/, 'mdi:wifi'], [/bluetooth/, 'mdi:bluetooth'], [/camera|photo|snap/, 'mdi:camera'],
  [/light|lamp/, 'mdi:lightbulb'], [/alarm/, 'mdi:alarm'], [/dnd|do not disturb/, 'mdi:minus-circle'], [/battery|charg/, 'mdi:battery-charging'], [/car/, 'mdi:car'], [/clean|vacuum/, 'mdi:robot-vacuum'], [/water|valve/, 'mdi:water'], [/fan/, 'mdi:fan'], [/tv|media|play/, 'mdi:play-circle']];
// icons for switches, fans, plugs… from their name, when the entity has no icon of its own ("Bathroom Fan" → a fan)
export const NAME_ICONS = [[/exhaust|ventilat|extract|\bfans?\b|مروحة|شفاط/, 'mdi:fan'], [/charger|charging|شاحن/, 'mdi:cellphone-charging'], [/water ?heater|boiler|geyser|سخان/, 'mdi:water-boiler'],
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
export const NAMED_DOMAINS = ['switch', 'input_boolean', 'fan', 'button', 'input_button', 'script', 'automation', 'valve', 'humidifier'];
// the kind of device the card runs on: a phone or tablet (touch first; a tablet has a screen side of 600 px or more) or a PC
export const devType = () => {
  if (!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) return 'pc';
  return Math.min(screen.width || 0, screen.height || 0) >= 600 ? 'tablet' : 'phone';
};
// a default kept by this browser only (long press on a floor or view button): sweet-home:<dashboard>:<kind>
export const devKey = k => `sweet-home:${location.pathname.split('/')[1] || 'lovelace'}:${k}`;
export const devGet = k => { try { return localStorage.getItem(devKey(k)); } catch (e) { return null; } };
export const devSet = (k, v) => { try { if (v == null) localStorage.removeItem(devKey(k)); else localStorage.setItem(devKey(k), String(v)); } catch (e) { /* storage off */ } };
// The card editor's preview: Home Assistant makes a NEW card for every change typed or picked in the editor (hui-card
// rebuilds its element in preview mode). The card it removes hands its 3D view (canvas, labels, camera) over here, and
// the new card takes it instead of building the house again. Not taken within a few seconds: it is thrown away.
export let SHARED = null;
export const dropShared = () => { const S = SHARED; SHARED = null; if (!S) return; clearTimeout(S.timer); try { S.scene.pause(); S.scene.renderer?.dispose(); S.scene.ro?.disconnect(); S.scene.io?.disconnect(); } catch (e) { /* gone */ } };
export let SMART = true; // `smart_icons` (Look): icons picked from names; off: the icon set in Home Assistant
export const nameIcon = (id, name) => { const t = `${name || ''} ${String(id).split('.')[1] || ''}`.toLowerCase().replace(/_/g, ' '); return (NAME_ICONS.find(([re]) => re.test(t)) || [])[1] || null; };
// plugs: only a charger (its icon, id or name says so) means a phone charging; any other plug (a fan, a heater…) shows its own icon
export const plugCharger = p => /charg/i.test(`${p.icon} ${p.id} ${p.name}`);
export const plugIcon = (c, p) => (p.icon && !['mdi:power-socket-eu', 'mdi:cellphone-charging'].includes(p.icon) ? p.icon : (SMART && nameIcon(p.id, p.name)) || c.s(p.id)?.attributes.icon || p.icon) || 'mdi:power-socket-eu';
export const btnIcon = (id, name) => { const t = `${name || ''} ${String(id).split('.')[1] || ''}`.toLowerCase().replace(/_/g, ' '); return (BTN_ICONS.find(([re]) => re.test(t)) || [])[1] || (String(id).startsWith('script.') ? 'mdi:script-text-play' : 'mdi:gesture-tap-button'); };
// a button's label without the noise: "button Areen phone ring mod" → "Ring Mod" (the word "button" and the phone / person's name go)
export const cleanLabel = (name, strip = []) => { let s = ` ${String(name || '')} `; for (const w of ['button', ...strip.filter(Boolean)]) s = s.replace(new RegExp(`\\s${String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']s?/g, "[’']?s?")}(?=\\s)`, 'gi'), ' '); s = s.trim().replace(/\s+/g, ' '); return s ? s.replace(/(^|\s)\S/g, c => c.toUpperCase()) : String(name || ''); };
export const domIcon = (d, v, a = {}) => {
  const on = ['on', 'open', 'opening', 'playing', 'unlocked', 'home'].includes(v) || (d === 'climate' && v && v !== 'off');
  if (a.device_class && DC_ICON[a.device_class]) return DC_ICON[a.device_class];
  return DOM_ICON[d]?.[on ? 0 : 1] || (d === 'sensor' ? 'mdi:eye' : d === 'binary_sensor' ? (on ? 'mdi:checkbox-marked-circle' : 'mdi:checkbox-blank-circle-outline') : 'mdi:shape-outline');
};
export const furnName = f => f.name || tr(FURN_TYPES[f.type]?.[0] || pretty(f.type));
export const furnIcon = f => f.icon || FURN_TYPES[f.type]?.[1] || 'mdi:shape-outline';
export const ALL_TABS = [
  ['home', 'Home', 'mdi:home-modern'], ['security', 'Security', 'mdi:shield-home'], ['climate', 'Climate', 'mdi:air-conditioner'],
  ['energy', 'Energy', 'mdi:lightning-bolt'], ['water', 'Water & Garden', 'mdi:water'], ['media', 'Media', 'mdi:television-play'], ['system', 'System', 'mdi:server'],
];
// a value shown inside text (numbers with units, English option names): <bdi> lays it out by its own direction, so in
// Arabic "-75 dBm" and "2 hours" don't come out as "dBm 75-" and "hours 2"
export const bidi = h => `<bdi>${h}</bdi>`;
export const fmtW = w => { if (w == null || isNaN(w)) return '—'; const a = Math.abs(w); return bidi(a >= 1000 ? `${(w / 1000).toFixed(2)}<small>kW</small>` : `${Math.round(w)}<small>W</small>`); };
export const wxName = st => tr(tc(String(st || '').replace('partlycloudy', 'partly cloudy').replace(/-/g, ' ')));
export const WEATHER_ICON = { 'clear-night': 'mdi:weather-night', cloudy: 'mdi:weather-cloudy', fog: 'mdi:weather-fog', hail: 'mdi:weather-hail', lightning: 'mdi:weather-lightning', 'lightning-rainy': 'mdi:weather-lightning-rainy', partlycloudy: 'mdi:weather-partly-cloudy', pouring: 'mdi:weather-pouring', rainy: 'mdi:weather-rainy', snowy: 'mdi:weather-snowy', 'snowy-rainy': 'mdi:weather-snowy-rainy', sunny: 'mdi:weather-sunny', windy: 'mdi:weather-windy', 'windy-variant': 'mdi:weather-windy-variant', exceptional: 'mdi:alert-circle-outline' };
export const ACT_MODE = { heating: 'heat', cooling: 'cool', drying: 'dry', fan: 'fan_only' };
export const acMode = st => !st || st.state === 'off' ? 'off' : ACT_MODE[st.attributes?.hvac_action] || st.state;
export const acIcon = st => { const m = acMode(st); return `<ha-icon class="ac" icon="${HVAC_ICON[m] || 'mdi:air-conditioner'}" style="color:${HVAC_COLOR[m] || '#60a5fa'}" title="${m.replace('_', ' ')}"></ha-icon>`; };
export const HVAC_ICON = { off: 'mdi:power', cool: 'mdi:snowflake', heat: 'mdi:fire', auto: 'mdi:thermostat-auto', dry: 'mdi:water-percent', fan_only: 'mdi:fan', heat_cool: 'mdi:sun-snowflake-variant' };
export const HVAC_COLOR = { cool: '#60a5fa', heat: '#fb923c', auto: '#34d399', dry: '#fbbf24', fan_only: '#a5b4fc', heat_cool: '#c084fc' };
export const ALARM = {
  disarmed: ['Disarmed', 'mdi:shield-off-outline', '#94a3b8'], armed_away: ['Armed away', 'mdi:shield-lock', '#f43f5e'],
  armed_home: ['Armed home', 'mdi:shield-home', '#fbbf24'], armed_night: ['Armed night', 'mdi:shield-moon', '#a78bfa'],
  armed_vacation: ['Vacation', 'mdi:shield-airplane', '#38bdf8'], arming: ['Arming…', 'mdi:shield-sync', '#fbbf24'],
  pending: ['Pending…', 'mdi:shield-alert', '#fb923c'], triggered: ['TRIGGERED', 'mdi:bell-ring', '#ef4444'],
};
// an alarm state's label (in the card's language), icon and colour
export const alarmInfo = st => { const a = ALARM[st] || [st || '—', 'mdi:shield', '#94a3b8']; return [tr(a[0]), a[1], a[2]]; };


// the shared settings the card changes (an imported binding cannot be assigned from another module)
export const setFahr = v => { FAHR = v; };
export const setShared = v => { SHARED = v; };
export const setSmart = v => { SMART = v; };
