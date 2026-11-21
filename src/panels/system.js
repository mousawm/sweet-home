// Sweet Home — Needs Attention, Home Lab, Devices.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, tc, ago, agoShort, esc, ic, clamp, BAD, guestInfo, pretty } from '../core.js';

export class SystemPanels {
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
  // Leaves a device out of "Needs Attention" (or only out of the low-battery list): saved in the card config
  async _excludeDevice(id, kind) {
    const dev = this._hass.entities?.[id]?.device_id;
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    const P = (cfg.panels ||= {}), A = (P.attention = typeof P.attention === 'object' && P.attention ? P.attention : {});
    const key = dev ? (kind === 'battery' ? 'battery_exclude_devices' : 'exclude_devices') : (kind === 'battery' ? 'battery_exclude' : 'exclude_entities');
    const list = A[key] = [...(A[key] || [])]; if (!list.includes(dev || id)) list.push(dev || id);
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Hidden. Show it again in the card editor (Panels → Needs Attention).')); }
  }
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
    // auto_guests off: only the pinned (chosen) guests
    const others = (L.auto ? [...byId.entries()] : []).filter(([k]) => !pinnedIds.has(k)).map(([, e]) => {
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
    return `<div class="ch">${ic('mdi:server')}<h3>Home Lab</h3>${L.status ? `<span class="pill" style="--c:${this.on(L.status) ? '#34d399' : '#f43f5e'}">${this.on(L.status) ? 'Online' : 'Offline'}</span>` : ''}</div>
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
}
