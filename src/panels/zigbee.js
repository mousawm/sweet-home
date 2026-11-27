// Sweet Home — Zigbee (System tab): the Summary and Device list cards, the Zigbee sheet (every device, with filters),
// and the Zigbee rows of Needs Attention. The network itself is worked out in ../zigbee.js.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, esc, ic, agoShort, ago, bidi, tc } from '../core.js';
import { zigbeeModel, zbStatus, zbSummary } from '../zigbee.js';

const RANK = { off: 0, weak: 1, ok: 2 };
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
      const on = (topic, f) => conn.subscribeMessage(msg => {
        let p = msg?.payload; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* plain text */ } }
        try { f(p, String(msg?.topic || ''), msg); } catch (e) { /* a message it can't read */ }
      }, { type: 'mqtt/subscribe', topic }).catch(() => null); // not an admin, or no MQTT: the entities are enough
      const name = (t, end = '') => t.slice(base.length + 1, end ? -end.length : undefined);
      const avail = (p, t) => { const s = p && typeof p === 'object' ? p.state : p; if (s === 'online' || s === 'offline') { L.avail[name(t, '/availability')] = s === 'online'; this._zbBump(); } };
      this._zbSubs = [
        on(`${base}/bridge/devices`, p => { if (Array.isArray(p)) { L.devices = p; this._zbBump(); } }),
        on(`${base}/bridge/info`, p => { if (p && typeof p === 'object') { L.info = p; this._zbBump(); } }),
        on(`${base}/bridge/state`, p => { const s = p && typeof p === 'object' ? p.state : p; if (s === 'online' || s === 'offline') { L.state = s; this._zbBump(); } }),
        on(`${base}/+/availability`, avail), on(`${base}/+/+/availability`, avail),
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
      h.callWS({ type: 'zha/devices' }).then(r => { (this._zbLive ||= {}).zha = Array.isArray(r) ? r : null; }, () => { this._zhaNo = true; })
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
      if (this._sections?.length) this._rerender('zigbee', 'zblist', 'alerts', 'tabs');
      if (this._info === 'zigbee') this._renderInfo();
    }, chatter ? 3000 : 400);
  }

  /* ---------- rows ---------- */
  // one device: icon by how it is doing, name, kind · area · battery, link quality and when it was last heard from
  _zbRowHTML(d, act, open) {
    const Z = E.zigbee, st = zbStatus(d, Z.lqiMin), lang = this._hass?.locale?.language || 'en';
    const icon = st === 'off' ? 'mdi:lan-disconnect' : st === 'weak' ? 'mdi:signal-cellular-1' : ROLE_ICON[d.role];
    const sub = [tr(ROLE_NAME[d.role]), d.area ? tc(d.area) : '', d.battery != null ? `${Math.round(d.battery)}%` : ''].filter(Boolean).join(' · ');
    const pre = st === 'off' ? tr('Offline') : d.lqi != null ? `LQI ${Math.round(d.lqi)}` : '';
    const when = d.lastSeen ? `<b data-ago="${iso(d.lastSeen)}" data-pre="${esc(pre)}" data-short="1">${pre ? `${esc(pre)} · ` : ''}${agoShort(iso(d.lastSeen), lang)}</b>` : `<b>${esc(pre || '—')}</b>`;
    const bar = `<i class="zbbar"><i style="width:${st === 'off' || d.lqi == null ? 0 : Math.max(3, Math.round(d.lqi / 255 * 100))}%;background:${lqiCol(d.lqi, Z.lqiMin)}"></i></i>`;
    return `<button class="mrow zbrow ${st === 'off' ? 'open' : st === 'weak' ? 'zbw' : ''}" data-act="${act}" data-dev="${esc(d.id)}"${open != null ? ` aria-expanded="${open}"` : ''}>${ic(icon)}<span class="m2">${esc(d.name)}<small>${esc(sub)}</small></span><span class="zbr">${when}${bar}</span></button>`;
  }
  _zbDetHTML(d) {
    const Z = E.zigbee, lang = this._hass?.locale?.language || 'en', st = zbStatus(d, Z.lqiMin);
    const cell = (k, v) => `<div><small>${tr(k)}</small><b>${v}</b></div>`;
    const role = tr(ROLE_NAME[d.role]) + (d.roleKnown ? '' : ` <i>${tr('(from its power source)')}</i>`);
    const seen = d.lastSeen ? `${esc(ago(iso(d.lastSeen), lang))}` : '—';
    const btns = [d.entity ? `<button class="rbtn ubtn" data-act="more" data-id="${esc(d.entity)}">${ic('mdi:information-outline')}${tr('Details')}</button>` : '',
      st !== 'ok' && d.entity && this._hass?.user?.is_admin && this._editing ? `<button class="rbtn edit-only" data-act="exclude" data-id="${esc(d.entity)}">${ic('mdi:eye-off-outline')}${tr('Hide from Needs Attention')}</button>` : ''].join('');
    return `<div class="zbdet">${cell('Kind', role)}${cell('Area', esc(d.area ? tc(d.area) : '—'))}${cell('Power', d.power === 'battery' ? `${tr('Battery')}${d.battery != null ? ` · ${bidi(`${Math.round(d.battery)}%`)}` : ''}` : tr('Mains'))}
      ${cell('Link quality', d.lqi != null ? bidi(`${Math.round(d.lqi)}${d.rssi != null ? ` · ${Math.round(d.rssi)} dBm` : ''}`) : '—')}${cell(d.exact ? 'Last seen' : 'Last change', seen)}${cell('Model', esc([d.maker, d.model].filter(Boolean).join(' ') || '—'))}
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
    this._zbF = { f: f || 'all', sort: this._zbF?.sort || 'status', room: '', open: dev || null };
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
    return head('mdi:zigbee', tr('Zigbee'), `${SRC_NAME[m.source]} · ${tr('{0} devices', m.devices.length)}${probs ? ` · ${tr('{0} need a look', probs)}` : ''}`)
      + `<div class="jfseas mtabs zbtabs" role="tablist">${tabs}</div>${sels}`
      + (rows || `<div class="wxwait">${tr('Nothing matches these filters.')}</div>`);
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
    }
    // routers first (the devices behind them depend on them), then the most recent; weakest signal first
    const offRows = off.map(x => (typeof x === 'string' ? [-1, 0, x] : x)).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    return [offRows, weak.sort((a, b) => a[0] - b[0]).map(x => x[1]), covered];
  }
}
