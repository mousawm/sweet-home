// Sweet Home — Zigbee (System tab): the Summary, Device list and Network map cards, the Zigbee sheet (every device,
// with filters, and the map), and the Zigbee rows of Needs Attention. The network itself is worked out in ../zigbee.js.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, ROOMS, esc, ic, agoShort, ago, bidi, tc } from '../core.js';
import { zigbeeModel, zbStatus, zbSummary, zbRoute, z2mMap } from '../zigbee.js';

const RANK = { off: 0, weak: 1, orphan: 2, ok: 3 };
const MAP_KEY = base => `sweet-home-zbmap:${base}`; // the last network map, kept in this browser
const ROLE_ICON = { R: 'mdi:router-wireless', E: 'mdi:radiobox-marked' };
const ROLE_NAME = { R: 'Router', E: 'End device' };
const SRC_NAME = { z2m: 'Zigbee2MQTT', zha: 'ZHA' };
const lqiCol = (l, min) => (l == null ? 'rgba(148,163,184,.5)' : l >= 120 ? '#34d399' : l >= min ? '#fbbf24' : '#f43f5e');
const iso = ms => new Date(ms).toISOString();
const timeOf = v => { if (v == null || v === '') return null; const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); return isFinite(t) ? t : null; };

export class ZigbeePanels {
  // the network: worked out again when Home Assistant changed or something new was heard on MQTT / from ZHA
  _zb() {
    const h = this._hass, Z = E.zigbee; if (!h || !Z?.on) return null;
    const M = this._zbM, v = this._zbV || 0;
    if (M && M.h === h && M.v === v && M.z === Z) return M.m;
    const m = zigbeeModel(h, { source: Z.source }, this._zbLive || {});
    this._zbM = { h, v, z: Z, m };
    if (m.source) this._zbListen(m.source, Z.base);
    return m;
  }
  // the entities the Zigbee cards and alerts follow
  _zbEnts() { const m = this._zb(); return m ? [...m.devices.flatMap(d => d.entities), m.bridge.entity].filter(Boolean) : []; }
  // the devices left out of Needs Attention (eye button / card editor): by device id or name
  _zbHidden(d) { const l = E.alerts.excludeDevices; return l.includes(d.id) || l.includes(d.name); }

  // What only Zigbee2MQTT / ZHA know (router or end device, link quality as devices report it, availability, the
  // coordinator): asked once per card. Both need an admin; for anyone else the card goes by the entities alone.
  _zbListen(src, base) {
    const h = this._hass, conn = h?.connection;
    if (src === 'z2m') {
      if (this._zbSubs && this._zbBase === base) return;
      if (!conn?.subscribeMessage) return;
      this._zbStop(); this._zbBase = base;
      const L = this._zbLive = { avail: {}, seen: {} };
      try { const mp = JSON.parse(localStorage.getItem(MAP_KEY(base)) || 'null'); if (mp?.entries) L.map = mp; } catch (e) { /* no storage */ }
      this._zbNoMqtt = false;
      const on = (topic, f) => conn.subscribeMessage(msg => {
        let p = msg?.payload; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* plain text */ } }
        try { f(p, String(msg?.topic || ''), msg); } catch (e) { /* a message it can't read */ }
      }, { type: 'mqtt/subscribe', topic }).catch(() => { if (!this._zbNoMqtt) { this._zbNoMqtt = true; this._zbBump(); } return null; }); // not an admin, or no MQTT: the entities are enough
      const name = (t, end = '') => t.slice(base.length + 1, end ? -end.length : undefined);
      const avail = (p, t) => { const s = p && typeof p === 'object' ? p.state : p; if (s === 'online' || s === 'offline') { L.avail[name(t, '/availability')] = s === 'online'; this._zbBump(); } };
      this._zbSubs = [
        on(`${base}/bridge/devices`, p => { if (Array.isArray(p)) { L.devices = p; this._zbBump(); } }),
        on(`${base}/bridge/info`, p => { if (p && typeof p === 'object') { L.info = p; this._zbBump(); } }),
        on(`${base}/bridge/state`, p => { const s = p && typeof p === 'object' ? p.state : p; if (s === 'online' || s === 'offline') { L.state = s; this._zbBump(); } }),
        on(`${base}/+/availability`, avail), on(`${base}/+/+/availability`, avail),
        // the answer to Scan network: the links, kept in this browser for next time
        on(`${base}/bridge/response/networkmap`, p => {
          const mp = p?.status === 'ok' || p?.data ? z2mMap(p) : null;
          if (!this._zbScanning && !mp) return;
          this._zbScanning = 0; clearTimeout(this._zbScanT);
          if (mp) { L.map = mp; try { localStorage.setItem(MAP_KEY(base), JSON.stringify(mp)); } catch (e) { /* full or blocked */ } this._toast(tr('Network map updated')); }
          else this._toast(tr('Zigbee2MQTT could not draw the map: {0}', String(p?.error || '?')));
          this._zbBump();
        }),
        // each device's own messages: its link quality, and the time it last spoke (a kept, retained message is old news)
        on(`${base}/+`, (p, t, msg) => {
          const n = name(t); if (!n || n === 'bridge' || !p || typeof p !== 'object' || Array.isArray(p)) return;
          const at = timeOf(p.last_seen) ?? (msg?.retain ? null : Date.now()), was = L.seen[n];
          L.seen[n] = { lqi: typeof p.linkquality === 'number' ? p.linkquality : was?.lqi ?? null, at: Math.max(at || 0, was?.at || 0) || null };
          this._zbBump(true);
        }),
      ];
    } else if (src === 'zha') { // ZHA's own device list, again every minute while it is looked at
      if (this._zhaBusy || this._zhaNo || Date.now() - (this._zhaAt || 0) < 60e3 || !h?.callWS) return;
      this._zhaBusy = true;
      h.callWS({ type: 'zha/devices' }).then(r => { const L = this._zbLive ||= {}; L.zha = Array.isArray(r) ? r : null; if (this._zhaScanned) { L.zhaAt = this._zhaScanned; this._zhaScanned = 0; } }, () => { this._zhaNo = true; })
        .finally(() => { this._zhaBusy = false; this._zhaAt = Date.now(); this._zbBump(); });
    }
  }
  _zbStop() {
    const s = this._zbSubs; this._zbSubs = null;
    for (const p of s || []) p?.then?.(u => { try { u?.(); } catch (e) { /* gone */ } }).catch(() => {});
  }
  // something new was heard: the cards, Needs Attention and the tab counter are drawn again (at most every few seconds
  // for the devices' own chatter)
  _zbBump(chatter) {
    if (this._zbT) return;
    this._zbT = setTimeout(() => {
      this._zbT = null; this._zbV = (this._zbV || 0) + 1; this._alertCount = null;
      if (this._sections?.length) this._rerender('zigbee', 'zblist', 'zbmap', 'alerts', 'tabs');
      if (this._info === 'zigbee') this._renderInfo();
      if (this._mode === 'zigbee' && this._tab === 'home') { this._three?.sync(); this._renderLegend(); }
    }, chatter ? 3000 : 400);
  }

  /* ---------- rows ---------- */
  // one device: icon by how it is doing, name, kind · area · battery, link quality and when it was last heard from
  _zbRowHTML(d, act, open) {
    const Z = E.zigbee, st = zbStatus(d, Z.lqiMin), lang = this._hass?.locale?.language || 'en';
    const icon = st === 'off' ? 'mdi:lan-disconnect' : st === 'weak' ? 'mdi:signal-cellular-1' : st === 'orphan' ? 'mdi:link-variant-off' : ROLE_ICON[d.role];
    const sub = [tr(ROLE_NAME[d.role]), d.area ? tc(d.area) : '', d.battery != null ? `${Math.round(d.battery)}%` : ''].filter(Boolean).join(' · ');
    const pre = st === 'off' ? tr('Offline') : st === 'orphan' ? tr('Router offline') : d.lqi != null ? `LQI ${Math.round(d.lqi)}` : '';
    const when = d.lastSeen ? `<b data-ago="${iso(d.lastSeen)}" data-pre="${esc(pre)}" data-short="1">${pre ? `${esc(pre)} · ` : ''}${agoShort(iso(d.lastSeen), lang)}</b>` : `<b>${esc(pre || '—')}</b>`;
    const bar = `<i class="zbbar"><i style="width:${st === 'off' || d.lqi == null ? 0 : Math.max(3, Math.round(d.lqi / 255 * 100))}%;background:${lqiCol(d.lqi, Z.lqiMin)}"></i></i>`;
    return `<button class="mrow zbrow ${st === 'off' ? 'open' : st === 'ok' ? '' : 'zbw'}" data-act="${act}" data-dev="${esc(d.id)}"${open != null ? ` aria-expanded="${open}"` : ''}>${ic(icon)}<span class="m2">${esc(d.name)}<small>${esc(sub)}</small></span><span class="zbr">${when}${bar}</span></button>`;
  }
  _zbDetHTML(d) {
    const Z = E.zigbee, lang = this._hass?.locale?.language || 'en', st = zbStatus(d, Z.lqiMin);
    const cell = (k, v) => `<div><small>${tr(k)}</small><b>${v}</b></div>`;
    const role = tr(ROLE_NAME[d.role]) + (d.roleKnown ? '' : ` <i>${tr('(from its power source)')}</i>`);
    const seen = d.lastSeen ? `${esc(ago(iso(d.lastSeen), lang))}` : '—';
    const par = d.parent === 'coord' ? tr('Coordinator') : this._zb()?.devices.find(x => x.id === d.parent)?.name;
    const btns = [this._zb()?.map || d.parent ? `<button class="rbtn ubtn" data-act="zbshow" data-dev="${esc(d.id)}">${ic('mdi:graph-outline')}${tr('Show on map')}</button>` : '', d.entity ? `<button class="rbtn ubtn" data-act="more" data-id="${esc(d.entity)}">${ic('mdi:information-outline')}${tr('Details')}</button>` : '',
      st !== 'ok' && d.entity && this._hass?.user?.is_admin && this._editing ? `<button class="rbtn edit-only" data-act="exclude" data-id="${esc(d.entity)}">${ic('mdi:eye-off-outline')}${tr('Hide from Needs Attention')}</button>` : ''].join('');
    return `<div class="zbdet">${cell('Kind', role)}${cell('Area', esc(d.area ? tc(d.area) : '—'))}${cell('Power', d.power === 'battery' ? `${tr('Battery')}${d.battery != null ? ` · ${bidi(`${Math.round(d.battery)}%`)}` : ''}` : tr('Mains'))}
      ${cell('Link quality', d.lqi != null ? bidi(`${Math.round(d.lqi)}${d.rssi != null ? ` · ${Math.round(d.rssi)} dBm` : ''}`) : '—')}${cell(d.exact ? 'Last seen' : 'Last change', seen)}${cell('Model', esc([d.maker, d.model].filter(Boolean).join(' ') || '—'))}${par ? cell('Connected through', esc(par)) : ''}
      ${cell('IEEE address', `<bdi>${esc(d.ieee)}</bdi>`).replace('<div>', '<div class="zbwide">')}${btns ? `<div class="zbacts">${btns}</div>` : ''}</div>`;
  }
  _zbSorted(m) { const Z = E.zigbee; return [...m.devices].sort((a, b) => RANK[zbStatus(a, Z.lqiMin)] - RANK[zbStatus(b, Z.lqiMin)] || (a.lqi ?? 999) - (b.lqi ?? 999) || a.name.localeCompare(b.name)); }
  _zbHead(m, title, icon) {
    const B = m.bridge, n = SRC_NAME[m.source];
    const pill = B.online === false ? `<span class="pill" style="--c:#f43f5e">${n} · ${tr('Offline')}</span>` : `<span class="pill" style="--c:#34d399">${n}${B.online ? ` · ${tr('Online')}` : ''}</span>`;
    return `<div class="ch">${ic(icon)}<h3>${tr(title)}</h3>${pill}</div>`;
  }

  /* ---------- System tab: Summary ---------- */
  _rZigbee() {
    const m = this._zb(); if (!m?.source) return '';
    const Z = E.zigbee, S = zbSummary(m, Z.lqiMin), B = m.bridge, lang = this._hass?.locale?.language || 'en';
    const C = 2 * Math.PI * 26;
    const ring = (v, max, col, label, k) => `<div class="ring" data-act="zbopen" data-f="${k}" role="button" tabindex="0"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="rb"/><circle cx="32" cy="32" r="26" class="rf" style="stroke:${col};stroke-dasharray:${C};stroke-dashoffset:${max ? C * (1 - v / max) : C}"/></svg><b>${v}<small>/${max}</small></b><span>${tr(label)}</span></div>`;
    const okCol = (v, max, good = '#34d399') => (v === max ? good : v / Math.max(1, max) >= 0.75 ? '#fbbf24' : '#f43f5e');
    const fact = (label, val, sub, dev) => `<button class="zbfact" data-act="zbopen"${dev ? ` data-dev="${esc(dev.id)}"` : ''}><small>${tr(label)}</small><b>${val}${sub ? ` <i>${sub}</i>` : ''}</b></button>`;
    const coord = B.coordinator || (m.source === 'z2m' && B.version ? `Zigbee2MQTT ${B.version}` : null);
    const hints = [];
    if (B.online === false) hints.push(tr('{0} is offline: the devices can’t be reached until it is back.', SRC_NAME[m.source]));
    else {
      if (m.source === 'z2m' && !S.hasExact) hints.push(tr('Times show the last change. Turn on Last seen in Zigbee2MQTT (Settings → Advanced) for exact check-ins.'));
      if (S.total && !S.hasLqi) hints.push(tr('Signal strength shows once the devices’ link quality (LQI) entities are enabled in Home Assistant.'));
    }
    return this._zbHead(m, 'Zigbee', 'mdi:zigbee')
      + hints.map(x => `<div class="zbhint">${ic('mdi:information-outline')}<span>${esc(x)}</span></div>`).join('')
      + `<div class="rings">${ring(S.online, S.total, okCol(S.online, S.total), 'Online', 'all')}${ring(S.routersOnline, S.routers, okCol(S.routersOnline, S.routers, '#a78bfa'), 'Routers', 'routers')}${ring(S.healthy, S.total, okCol(S.healthy, S.total), 'Healthy', 'problems')}</div>`
      + `<div class="zbfacts">
        ${fact('Coordinator', esc(coord || '—'), B.channel != null ? esc(tr('ch {0}', B.channel)) : '')}
        ${fact('Weakest link', S.weakest ? esc(S.weakest.name) : '—', S.weakest ? `· ${Math.round(S.weakest.lqi)}` : '', S.weakest)}
        ${fact('Quietest device', S.quietest ? esc(S.quietest.name) : '—', S.quietest ? `· ${esc(agoShort(iso(S.quietest.lastSeen), lang))}` : '', S.quietest)}
        ${fact('Lowest battery', S.lowestBattery ? esc(S.lowestBattery.name) : '—', S.lowestBattery ? `· ${Math.round(S.lowestBattery.battery)}%` : '', S.lowestBattery)}
      </div>`
      + `<button class="zbgo" data-act="zbopen">${tr('Open Zigbee')}<span>${tr('{0} devices · {1} routers', S.total, S.routers)}</span></button>`;
  }

  /* ---------- System tab: Device list (problems first) ---------- */
  _rZbList() {
    const m = this._zb(); if (!m?.source) return '';
    const Z = E.zigbee, list = this._zbSorted(m), probs = list.filter(d => zbStatus(d, Z.lqiMin) !== 'ok').length;
    const shown = list.slice(0, Math.max(5, probs));
    return this._zbHead(m, 'Zigbee Devices', 'mdi:format-list-bulleted')
      + (list.length ? shown.map(d => this._zbRowHTML(d, 'zbopen')).join('') : `<div class="wxwait">${tr('No Zigbee devices found yet')}</div>`)
      + (list.length > shown.length ? `<button class="almore" data-act="zbopen">${tr('Show all {0} devices', list.length)}</button>` : '');
  }

  /* ---------- the Zigbee sheet: every device, with filters ---------- */
  _zbOpen(dev, f) {
    this._zbF = { f: f || 'all', sort: this._zbF?.sort || 'status', room: '', open: dev || null, view: f === 'map' ? 'map' : 'list' };
    this._openInfo('zigbee');
    if (dev) setTimeout(() => this.$('sheet')?.querySelector(`[data-act="zbrow"][data-dev="${CSS.escape(dev)}"]`)?.scrollIntoView({ block: 'center' }), 60);
  }
  _zbSheet(head) {
    const m = this._zb(); if (!m?.source) return head('mdi:zigbee', tr('Zigbee'), tr('No Zigbee devices found yet'));
    const Z = E.zigbee, F = this._zbF ||= { f: 'all', sort: 'status', room: '', open: null };
    const st = d => zbStatus(d, Z.lqiMin);
    const FIL = { all: () => true, problems: d => st(d) !== 'ok', routers: d => d.role === 'R', battery: d => d.power === 'battery' };
    const SORT = { status: null, seen: (a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0), lqi: (a, b) => (a.lqi ?? 999) - (b.lqi ?? 999), name: (a, b) => a.name.localeCompare(b.name) };
    let list = this._zbSorted(m).filter(FIL[F.f] || FIL.all).filter(d => !F.room || d.area === F.room);
    if (SORT[F.sort]) list = list.sort(SORT[F.sort]);
    const probs = m.devices.filter(d => st(d) !== 'ok').length;
    const tabs = [['all', 'All', m.devices.length], ['problems', 'Problems', probs], ['routers', 'Routers', m.devices.filter(FIL.routers).length], ['battery', 'Battery', m.devices.filter(FIL.battery).length]]
      .map(([k, l, n]) => `<button class="${F.f === k ? 'on' : ''}" role="tab" aria-selected="${F.f === k}" data-act="zbf" data-k="${k}">${tr(l)}<b>${n}</b></button>`).join('');
    const rooms = [...new Set(m.devices.map(d => d.area).filter(Boolean))].sort();
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    const sels = `<div class="zbsels">${rooms.length ? `<select data-zbsel="room" aria-label="${tr('Area')}">${opt('', tr('All areas'), F.room)}${rooms.map(r => opt(r, tc(r), F.room)).join('')}</select>` : ''}
      <select data-zbsel="sort" aria-label="${tr('Sort by')}">${[['status', 'Problems first'], ['seen', 'Quietest first'], ['lqi', 'Weakest signal first'], ['name', 'Name']].map(([k, l]) => opt(k, tr(l), F.sort)).join('')}</select></div>`;
    const rows = list.map(d => `<div class="zbitem ${F.open === d.id ? 'on' : ''}">${this._zbRowHTML(d, 'zbrow', F.open === d.id)}${F.open === d.id ? this._zbDetHTML(d) : ''}</div>`).join('');
    const seg = `<div class="seg zbseg">${[['list', 'Devices', 'mdi:format-list-bulleted'], ['map', 'Map', 'mdi:graph-outline']].map(([k, l, i]) => `<button class="${(F.view || 'list') === k ? 'on' : ''}" data-act="zbview" data-v="${k}">${ic(i)}${tr(l)}</button>`).join('')}</div>`;
    return head('mdi:zigbee', tr('Zigbee'), `${SRC_NAME[m.source]} · ${tr('{0} devices', m.devices.length)}${probs ? ` · ${tr('{0} need a look', probs)}` : ''}`) + seg
      + (F.view === 'map' ? this._zbMapHTML(m) : `<div class="jfseas mtabs zbtabs" role="tablist">${tabs}</div>${sels}`
      + (rows || `<div class="wxwait">${tr('Nothing matches these filters.')}</div>`));
  }

  /* ---------- Needs Attention: Zigbee Offline / Weak Zigbee ---------- */
  // [offline rows, weak rows, the device ids they cover (left out of the plain Unavailable list)]
  _zbAlerts(hide) {
    const m = this._zb(), Z = E.zigbee; if (!m?.source) return [[], [], new Set()];
    const lang = this._hass?.locale?.language || 'en', B = m.bridge, covered = new Set();
    const offOn = Z.alerts.includes('offline'), weakOn = Z.alerts.includes('weak');
    if (offOn) for (const d of m.devices) covered.add(d.id);
    const off = [], weak = [];
    if (offOn && B.online === false)
      off.push(`<div class="mrow open" data-act="${B.entity ? 'more' : 'zbopen'}"${B.entity ? ` data-id="${esc(B.entity)}"` : ''}>${ic('mdi:zigbee')}<span class="m2">${esc(SRC_NAME[m.source])}<small>${tr('Bridge offline: no Zigbee device can be reached')}</small></span><b>${tr('Offline')}</b></div>`);
    const row = (d, cls, icon, right, sub) => `<div class="mrow ${cls}" data-act="zbopen" data-dev="${esc(d.id)}">${ic(icon)}<span class="m2">${esc(d.name)}<small>${esc(sub)}</small></span>${right}${d.entity ? hide(d.entity) : ''}</div>`;
    const where = d => [tr(ROLE_NAME[d.role]), d.area ? tc(d.area) : ''].filter(Boolean).join(' · ');
    for (const d of m.devices) {
      if (this._zbHidden(d)) continue;
      const st = zbStatus(d, Z.lqiMin);
      if (st === 'off' && offOn) off.push([d.role === 'R' ? 0 : 1, -(d.lastSeen || 0), row(d, 'open', d.role === 'R' ? 'mdi:router-wireless' : 'mdi:lan-disconnect', d.lastSeen ? `<b data-ago="${iso(d.lastSeen)}" data-pre="${tr('Offline')}" data-short="1">${tr('Offline')} · ${agoShort(iso(d.lastSeen), lang)}</b>` : `<b>${tr('Offline')}</b>`, where(d))]);
      if (st === 'weak' && weakOn) weak.push([d.lqi, row(d, 'zbw', 'mdi:signal-cellular-1', `<b>${bidi(`LQI ${Math.round(d.lqi)}`)}</b>`, where(d))]);
      if (st === 'orphan' && offOn) off.push([2, 0, row(d, 'zbw', 'mdi:link-variant-off', `<b>${tr('Router offline')}</b>`, where(d))]); // after the routers: its router is down
    }
    // routers first (the devices behind them depend on them), then the most recent; weakest signal first
    const offRows = off.map(x => (typeof x === 'string' ? [-1, 0, x] : x)).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    return [offRows, weak.sort((a, b) => a[0] - b[0]).map(x => x[1]), covered];
  }

  /* ---------- the network map ---------- */
  // System tab card (views: map), full width
  _rZbMap() {
    const m = this._zb(); if (!m?.source) return '';
    return this._zbHead(m, 'Zigbee Network', 'mdi:graph-outline') + this._zbMapHTML(m);
  }
  // Scan network: Zigbee2MQTT draws a new map (raw, without routes; takes up to a minute or two and keeps the mesh
  // busy, so only when asked); ZHA scans its neighbour tables in the background and its device list is read again
  async _zbScan() {
    const m = this._zb(); if (!m?.source || this._zbScanning) return;
    if (!this._mayAct('system')) return this._gate('system', () => this._zbScan()); // view only: the PIN first
    this._zbScanning = Date.now(); this._zbBump();
    clearTimeout(this._zbScanT);
    if (m.source === 'z2m') {
      this.call('mqtt', 'publish', { topic: `${E.zigbee.base}/bridge/request/networkmap`, payload: JSON.stringify({ type: 'raw', routes: false }) });
      this._zbScanT = setTimeout(() => { if (!this._zbScanning) return; this._zbScanning = 0; this._toast(tr('No answer from Zigbee2MQTT. Try again in a minute.')); this._zbBump(); }, 180e3);
    } else {
      try { await this._hass.callWS({ type: 'zha/topology/update' }); } catch (e) { /* not an admin */ }
      this._zbScanT = setTimeout(() => { this._zbScanning = 0; this._zhaAt = 0; this._zhaScanned = Date.now(); this._zbListen('zha'); }, 60e3);
    }
  }
  // where each node goes: mesh (coordinator in the middle, routers around it with their subtrees next to each other,
  // end devices outside, by their router) or by area (one box per Home Assistant area)
  _zbLayout(m, mode) {
    const W = 600, P = {}, D = m.devices;
    if (mode === 'areas') {
      const groups = new Map([[tr('Coordinator'), ['coord']]]);
      for (const d of [...D].sort((a, b) => (a.role > b.role ? -1 : a.role < b.role ? 1 : a.name.localeCompare(b.name)))) { const k = d.area ? tc(d.area) : tr('No area'); (groups.get(k) || groups.set(k, []).get(k)).push(d.id); }
      const list = [...groups.entries()].sort((a, b) => (a[1][0] === 'coord' ? -1 : b[1][0] === 'coord' ? 1 : b[1].length - a[1].length || a[0].localeCompare(b[0])));
      const cols = 3, bw = 190, gap = 5, per = 4, boxes = [];
      let y = 6;
      for (let i = 0; i < list.length; i += cols) {
        const row = list.slice(i, i + cols), h = 34 + Math.max(...row.map(([, ids]) => Math.ceil(ids.length / per))) * 44;
        row.forEach(([name, ids], j) => {
          const x = 6 + j * (bw + gap); boxes.push({ name, x, y, w: bw, h });
          ids.forEach((id, k) => { P[id] = [x + 24 + (k % per) * ((bw - 48) / (per - 1)), y + 40 + Math.floor(k / per) * 44]; });
        });
        y += h + gap;
      }
      return { P, boxes, W, H: Math.max(y + 2, 200) };
    }
    const H = 560, cx = W / 2, cy = H / 2, byId = new Map(D.map(d => [d.id, d]));
    P.coord = [cx, cy];
    // routers in tree order (each router's sub-routers right after it), then end devices around their router
    const kids = p => D.filter(d => d.role === 'R' && d.parent === p).sort((a, b) => a.name.localeCompare(b.name));
    const order = [], walk = p => { for (const r of kids(p)) if (!order.includes(r.id)) { order.push(r.id); walk(r.id); } };
    walk('coord'); for (const r of D) if (r.role === 'R' && !order.includes(r.id)) order.push(r.id);
    const ends = new Map();
    for (const d of D) if (d.role !== 'R') { const k = d.parent && (d.parent === 'coord' || byId.has(d.parent)) ? d.parent : '-'; (ends.get(k) || ends.set(k, []).get(k)).push(d.id); }
    const slots = [...order, ...['coord', '-'].filter(k => ends.has(k))];
    const total = Math.max(1, D.filter(d => d.role !== 'R').length), step = Math.min(0.26, (2 * Math.PI) / total);
    const rR = order.length > 14 ? 150 : 130, rE = 240;
    slots.forEach((k, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / slots.length;
      if (k !== 'coord' && k !== '-') P[k] = [cx + rR * Math.cos(a), cy + rR * Math.sin(a)];
      const list = ends.get(k) || [];
      list.forEach((id, j) => { const b = a + (j - (list.length - 1) / 2) * step; P[id] = [cx + rE * Math.cos(b), cy + rE * Math.sin(b)]; });
    });
    return { P, boxes: [], W, H };
  }
  _zbMapHTML(m) {
    const Z = E.zigbee, mode = this._zbMode || 'mesh', { P, boxes, W, H } = this._zbLayout(m, mode), lang = this._hass?.locale?.language || 'en';
    const byId = new Map(m.devices.map(d => [d.id, d])), st = d => zbStatus(d, Z.lqiMin);
    const sel = this._zbSel && (this._zbSel === 'coord' || byId.has(this._zbSel)) ? this._zbSel : null;
    const route = sel ? zbRoute(m, sel) : [], onRoute = new Set(route), rk = (a, b) => [a, b].sort().join('|');
    const routeEdges = new Set(route.slice(0, -1).map((id, i) => rk(id, route[i + 1])));
    const off = id => id !== 'coord' && byId.get(id)?.online === false;
    const parentEdges = new Set(m.devices.filter(d => d.parent).map(d => rk(d.id, d.parent)));
    const links = (this._zbAll !== false ? m.links : m.links.filter(l => parentEdges.has(rk(l.a, l.b)))).filter(l => P[l.a] && P[l.b]);
    const lk = links.map(l => {
      const k = rk(l.a, l.b), hl = routeEdges.has(k), dead = off(l.a) || off(l.b), par = parentEdges.has(k);
      const [x1, y1] = P[l.a], [x2, y2] = P[l.b];
      return `<line class="zblk ${hl ? 'hl' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${dead ? 'rgba(148,163,184,.7)' : lqiCol(l.lqi, Z.lqiMin)}" stroke-width="${hl ? 3.2 : par ? 1.8 : 1.1}" stroke-opacity="${hl ? 1 : par ? 0.85 : 0.4}"${dead ? ' stroke-dasharray="4 4"' : ''}/>`;
    }).join('');
    const node = (id, d) => {
      const s = d ? st(d) : 'ok', r = !d ? 14 : d.role === 'R' ? 9.5 : 6.5, [x, y] = P[id];
      const fill = !d ? '#2dd4bf' : s === 'off' ? 'var(--sheet)' : d.role === 'R' ? '#a78bfa' : '#60a5fa';
      const ring = s === 'off' ? '#f43f5e' : s !== 'ok' ? '#fbbf24' : 'rgba(var(--ink),.25)';
      const name = d ? d.name : tr('Coordinator'), show = !d || d.role === 'R' || s !== 'ok' || onRoute.has(id);
      const ly = mode === 'areas' ? r + 12 : y > H / 2 + 60 ? -r - 6 : r + 13;
      return `<g class="zbn ${show ? 'show' : ''} ${onRoute.has(id) ? 'hl' : ''}" data-act="zbnode" data-dev="${esc(id)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" role="button" tabindex="0" aria-label="${esc(name)}">
        <title>${esc(name)}${d ? ` · ${s === 'off' ? tr('Offline') : d.lqi != null ? `LQI ${Math.round(d.lqi)}` : tr(ROLE_NAME[d.role])}` : ''}</title>
        ${!d ? `<circle r="${r + 6}" fill="none" stroke="#2dd4bf" stroke-opacity=".35" stroke-width="2"/>` : ''}<circle r="${r + 7}" fill="transparent"/>
        <circle class="zbc" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="${s === 'ok' ? 1.5 : 2.5}"${s === 'off' ? ' stroke-dasharray="3 2"' : ''}/>
        <text text-anchor="middle" y="${ly}">${esc(name.length > 20 ? name.slice(0, 19) + '…' : name)}</text></g>`;
    };
    const nodes = [...m.devices.filter(d => P[d.id]).map(d => node(d.id, d)), node('coord', null)].join('');
    const areas = boxes.map(b => `<g class="zbarea"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/><text x="${b.x + 10}" y="${b.y + 16}">${esc(b.name)}</text></g>`).join('');
    // the bar above the map: layout, all links or the routes only, Scan network and how old the map is
    const can = m.source === 'zha' ? !this._zhaNo : !this._zbNoMqtt;
    const age = this._zbScanning ? tr('Scanning… this can take a minute or two') : m.map?.at ? tr('Map from {0}', ago(iso(m.map.at), lang)) : m.map ? tr('From ZHA’s last scan') : tr('No map yet');
    const bar = `<div class="zbmbar"><div class="seg zbseg">${[['mesh', 'Mesh'], ['areas', 'By area']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="zbmode" data-v="${k}">${tr(l)}</button>`).join('')}</div>
      <button class="zbchip ${this._zbAll !== false ? 'on' : ''}" data-act="zball" aria-pressed="${this._zbAll !== false}">${tr('All links')}</button><span class="zbsp"></span>
      ${can ? `<button class="rbtn ubtn zbscan" data-act="zbscan"${this._zbScanning ? ' disabled' : ''}>${ic(this._zbScanning ? 'mdi:loading' : 'mdi:radar', this._zbScanning ? 'spin' : '')}${tr(this._zbScanning ? 'Scanning…' : 'Scan network')}</button>` : ''}</div>`;
    const note = !can ? tr('The links come from {0}, which needs an admin account.', SRC_NAME[m.source]) : !m.map && !this._zbScanning ? tr('Scan the network to draw its links. Until then the devices are placed by kind.') : '';
    const legend = `<div class="zbleg"><span><i style="background:#34d399"></i>LQI 120+</span><span><i style="background:#fbbf24"></i>${Z.lqiMin}–119</span><span><i style="background:#f43f5e"></i>&lt; ${Z.lqiMin}</span>
      <span><u style="background:#2dd4bf"></u>${tr('Coordinator')}</span><span><u style="background:#a78bfa"></u>${tr('Router')}</span><span><u style="background:#60a5fa"></u>${tr('End device')}</span><span class="zbsp"></span><span>${esc(age)}</span></div>`;
    // the device tapped: what is wrong, and its way to the coordinator with the link quality of each hop
    let det = `<div class="zbroute"><b>${tr('Tap a device')}</b><span>${tr('See its way to the coordinator and the signal on each hop. Dashed lines lead to offline devices.')}</span></div>`;
    if (sel) {
      const d = byId.get(sel), s = d ? st(d) : 'ok', nm = id => (id === 'coord' ? tr('Coordinator') : byId.get(id)?.name || '?');
      const via = d ? m.devices.filter(x => x.parent === d.id).length : m.devices.filter(x => x.parent === 'coord').length;
      const msg = !d ? tr('{0} devices talk to it directly.', via)
        : s === 'off' ? (d.role === 'R' && via ? tr('{0} reports this router offline, so the {1} devices that go through it must find another way. Check its power, or the wall switch in front of it.', SRC_NAME[m.source], via) : tr('{0} reports it offline.', SRC_NAME[m.source]))
        : s === 'weak' ? tr('LQI {0} is below your limit of {1}. A router (a mains-powered plug or bulb) nearer to it would help.', Math.round(d.lqi), Z.lqiMin)
        : s === 'orphan' ? tr('The router it goes through is offline. It should find another one; until then its reports may not arrive.')
        : d.hops != null ? tr('{0} hops to the coordinator.', d.hops) : tr('Not in the last network map.');
      const hops = route.map((id, i) => { const nx = route[i + 1]; const l = nx && m.links.find(x => rk(x.a, x.b) === rk(id, nx)); const dead = nx && (off(id) || off(nx));
        return `<span class="zbhop">${esc(nm(id))}</span>${nx ? `<em style="color:${dead ? '#f43f5e' : lqiCol(l?.lqi, Z.lqiMin)}">${dead ? '✕' : l?.lqi != null ? Math.round(l.lqi) : ''} →</em>` : ''}`; }).join('');
      det = `<div class="zbroute"><b>${esc(nm(sel))}</b><span>${esc(msg)}</span>${route.length > 1 ? `<div class="zbhops">${hops}</div>` : ''}${d && this._info !== 'zigbee' ? `<button class="rbtn ubtn" data-act="zbopen" data-dev="${esc(d.id)}">${ic('mdi:information-outline')}${tr('Details')}</button>` : ''}</div>`;
    }
    return bar + (note ? `<div class="zbhint">${ic('mdi:information-outline')}<span>${esc(note)}</span></div>` : '')
      + `<div class="zbmap">${this._zbScanning ? '<i class="zbscanbar"></i>' : ''}<svg class="${sel ? 'dim' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Zigbee network map')}">${areas}<g>${lk}</g><g>${nodes}</g></svg></div>`
      + legend + det;
  }

  /* ---------- Zigbee mode on the 3D house ---------- */
  // what the 3D view draws (scene.js zbSet): each device in the room of its Home Assistant area, the coordinator in the
  // room most of its direct devices are in (else the middle of the house), each device's link to its parent, and the
  // worst state of each room. null: no Zigbee devices in any room (no Zigbee button).
  _zb3d() {
    const m = this._zb(); if (!m?.source || !m.devices.length) return null;
    const Z = E.zigbee, roomOfArea = new Map(ROOMS.filter(r => r.area).map(r => [r.area, r.id]));
    const st = d => zbStatus(d, Z.lqiMin), nodes = [], rooms = {};
    let missing = 0;
    for (const d of m.devices) {
      const room = d.areaId ? roomOfArea.get(d.areaId) : null; if (!room) { missing++; continue; }
      const s = st(d); nodes.push({ id: d.id, room, st: s === 'orphan' ? 'weak' : s, role: d.role, name: d.name });
      if (s === 'off') rooms[room] = 'off'; else if (s !== 'ok' && rooms[room] !== 'off') rooms[room] = 'weak';
    }
    if (!nodes.length) return null;
    const placed = new Map(nodes.map(n => [n.id, n.room])), votes = {};
    for (const d of m.devices) if (d.parent === 'coord' && placed.has(d.id)) votes[placed.get(d.id)] = (votes[placed.get(d.id)] || 0) + 1;
    const cRoom = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    nodes.push({ id: 'coord', room: cRoom, st: m.bridge.online === false ? 'off' : 'ok', role: 'C', name: tr('Coordinator') });
    const byId = new Map(m.devices.map(d => [d.id, d])), lq = (a, b) => m.links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))?.lqi ?? null;
    const links = m.devices.filter(d => d.parent && placed.has(d.id)).map(d => ({ a: d.id, b: d.parent, lqi: lq(d.id, d.parent) ?? d.lqi, min: Z.lqiMin, dead: d.online === false || byId.get(d.parent)?.online === false }));
    const sig = JSON.stringify([nodes.map(n => [n.id, n.room, n.st]), links.map(l => [l.a, l.b, l.lqi, l.dead]), Z.lqiMin]);
    return { sig, nodes, links, rooms, missing };
  }
}
