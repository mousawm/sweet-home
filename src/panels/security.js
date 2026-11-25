// Sweet Home — Security, the alarm keypad, cameras.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, esc, ic, pretty, ALARM, alarmInfo, agoShort } from '../core.js';

export class SecurityPanels {
  _openKeypad(svc) {
    const label = { alarm_disarm: 'turn the alarm off', alarm_arm_away: 'arm away', alarm_arm_night: 'arm night', alarm_arm_vacation: 'arm for a trip', alarm_arm_home: 'arm home' }[svc] || 'continue';
    this._pin = ''; this._pinSvc = svc; this._pick = null;
    const sh = this.$('sheet');
    sh.innerHTML = `<div class="sheet keypad" role="dialog" aria-label="Alarm code">
      <div class="sh-h"><div><b>${tr("Enter alarm code")}</b><span>to ${esc(label)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="pin-dots" id="pinDots" aria-live="polite"></div><div class="pin-msg" id="pinMsg"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => `<button class="key k-${k}" data-act="pin" data-k="${k}" aria-label="${k === 'del' ? tr("Delete") : k === 'ok' ? tr("Submit") : k}">${k === 'del' ? ic('mdi:backspace-outline') : k === 'ok' ? ic('mdi:check-bold') : k}</button>`).join('')}</div></div>`;
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
    if (ok) { this.haptic('success'); this._closeSheet(); this._toast(svc === 'alarm_disarm' ? tr("Alarm turned off") : tr("Alarm armed")); }
    else { this.haptic('failure'); this._renderPin('Wrong code, try again', true); const d = this.$('pinDots'); d?.classList.remove('shake'); void d?.offsetWidth; d?.classList.add('shake'); }
  }
  _rSecurity() {
    const st = this.v(E.alarm);
    const al = alarmInfo(st);
    const btn = (svc, icon, label, match) => (label = tr(label), `<button class="abtn ${st === match ? 'on' : ''}" data-act="alarm" data-svc="${svc}" title="${label}">${ic(icon)}<span>${label}</span></button>`);
    // a lock shows what it locks (door, gate, garage…) with a small padlock that tells its state; a plain lock is a padlock
    const locks = E.locks.map(l => {
      const s = this.v(l.id); const locked = s === 'locked'; const bad = !this.ok(l.id);
      const cls = bad ? 'na' : locked ? 'good' : s === 'unlocked' ? 'bad' : 'warn';
      const pad = locked ? 'mdi:lock' : s === 'unlocked' ? 'mdi:lock-open-variant' : s === 'jammed' ? 'mdi:lock-alert' : 'mdi:lock-clock';
      return `<button class="lock ${cls}" data-act="lock" data-id="${l.id}" data-kind="${l.kind || 'padlock'}">
        <div class="lk-ic">${l.icon ? `${ic(l.icon)}<i class="lk-b">${ic(pad)}</i>` : ic(pad)}</div>
        <b>${esc(l.name)}</b><span>${esc(s ? pretty(s) : '—')}</span></button>`;
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
    const doors = this._rDoors();
    return `<div class="ch">${ic('mdi:shield-home')}<h3>${tr("Security")}</h3>${E.alarm ? `<span class="pill" style="--c:${al[2]}">${al[0]}</span>` : ''}</div>
      ${!E.alarm ? '' : `<div class="alarm" style="--c:${al[2]}">
        <div class="shield ${st === 'triggered' ? 'blink' : ''}" data-act="more" data-id="${E.alarm}">${ic(al[1])}</div>
        <div class="abtns">${btn('alarm_disarm', 'mdi:shield-off-outline', 'Off', 'disarmed')}${btn('alarm_arm_away', 'mdi:lock', 'Away', 'armed_away')}${btn('alarm_arm_night', 'mdi:weather-night', 'Night', 'armed_night')}${btn('alarm_arm_vacation', 'mdi:airplane', 'Trip', 'armed_vacation')}</div>
      </div>`}
      ${locks || gate ? `<div class="locks">${locks}${gate}</div>` : ''}
      ${doors}`;
  }

  /* ---------- Doors: a 24-hour timeline, and a detailed list (the `doors_view` option: both, timeline or list) ---------- */
  // every door the Doors block shows: door sensors, and gates / doors with an open / closed sensor (the sensor is the source)
  _doorItems() {
    const open = (g, raw) => { // one reading of an entrance's sensor, as entState() reads it
      const v = String(raw ?? '').toLowerCase().trim();
      if (g.openWords?.includes(v)) return true; if (g.closedWords?.includes(v)) return false;
      return /^(on|open|opened|opening|unlocked|ajar|partially[ _]?open|half[ _]?open)$/.test(v);
    };
    return [...E.doors.map(d => ({ id: d.id, name: d.name, o: this.doorOpen(d), na: !this.ok(d.id), icons: ['mdi:door-closed', 'mdi:door-open'],
      isOpen: v => (d.open ? String(v || '').toLowerCase() === d.open.toLowerCase() : v === 'on') })),
    ...E.entrances.filter(g => this.s(g.id) && (g.sensors?.length || g.sensor)).filter(g => !(g.sensors || [g.sensor]).some(x => E.doors.some(d => d.id === x))).map(g => {
      const st = this.entState(g), src = g.sensors?.find(x => this.ok(x)) || g.sensors?.[0] || g.sensor;
      return { id: src, name: g.cfgName || this.s(g.id).attributes.friendly_name || g.name, o: st === 'open' || st === 'moving', na: st === 'bad',
        icons: [g.icons?.[0] || 'mdi:door-closed', g.icons?.[1] || 'mdi:door-open'], isOpen: v => open(g, v) };
    })];
  }
  // the last 24 h of each door from Home Assistant's history (refreshed every 5 minutes); the current state is laid
  // over it when drawn, so a door that just opened shows at once, before the recorder has written it
  async _loadDoorHist(items) {
    if (this._dhBusy || !this._hass?.callWS) return; this._dhBusy = true;
    const now = Date.now(), from = now - 864e5, ev = {};
    try {
      const r = await this._hass.callWS({ type: 'history/history_during_period', start_time: new Date(from).toISOString(), end_time: new Date(now).toISOString(), entity_ids: items.map(x => x.id), minimal_response: true, no_attributes: true, significant_changes_only: false });
      for (const x of items) {
        const list = []; let cur = null;
        for (const p of r?.[x.id] || []) {
          const t = ((p.lc ?? p.lu) || 0) * 1000, o = x.isOpen(p.s);
          if (o && !cur) list.push(cur = { t: Math.max(t, from), end: null, cut: t <= from + 5e3 }); // cut: already open when the day began
          else if (!o && cur) { cur.end = t; cur = null; }
        }
        ev[x.id] = list;
      }
      this._dh = { at: now, ev };
    } catch (e) { console.warn('sweet-home door history', e); this._dh = { at: now, ev: {}, error: true }; }
    this._dhBusy = false; this._rerender('security');
  }
  _rDoors() {
    const items = this._doorItems(); if (!items.length) return '';
    const now = Date.now(), from = now - 864e5, lang = this._hass?.locale?.language, mode = E.doorsView || 'both';
    if (!this._dh || now - this._dh.at > 5 * 60e3) setTimeout(() => this._loadDoorHist(items));
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const hm = t => new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    const D = items.map(x => {
      const lc = Date.parse(this.s(x.id)?.last_changed || '') || 0, evs = (this._dh?.ev[x.id] || []).map(e => ({ ...e }));
      const last = evs[evs.length - 1];
      if (x.o && !x.na && (!last || last.end != null) && lc) evs.push({ t: Math.max(lc, from), end: null, cut: lc < from }); // opened since the history was read
      else if (!x.o && last && last.end == null) last.end = Math.max(lc, last.t); // closed since
      const cur = evs[evs.length - 1], since = x.o && cur?.end == null ? (cur.cut ? lc : cur.t) : null;
      const lastOpen = since || (evs.length ? evs[evs.length - 1].t : null);
      return { ...x, evs, since, lastOpen, lc, today: evs.filter(e => !e.cut && e.t >= +day0).length, n24: evs.filter(e => !e.cut).length };
    }).sort((a, b) => (b.o - a.o) || ((b.lastOpen || 0) - (a.lastOpen || 0)) || ((b.lc || 0) - (a.lc || 0)));
    this._dD = D; // for the list of openings (_doorLog)
    const marks = d => d.evs.map(e => { const a = Math.max(e.t, from), b = e.end ?? now;
      return `<i class="${e.end == null ? 'now' : ''}" data-s="${e.t}" data-e="${e.end ?? ''}"${e.cut ? ' data-c="1"' : ''} title="${esc(this._dmText(e.t, e.end, e.cut))}" style="inset-inline-start:${((a - from) / 864e5 * 100).toFixed(2)}%;width:${Math.max(0, (b - a) / 864e5 * 100).toFixed(2)}%"></i>`; }).join('');
    const ago = (t, pre = '') => `<span data-ago="${new Date(t).toISOString()}" data-pre="${esc(pre)}" data-short="1">${pre ? `${esc(pre)} · ` : ''}${agoShort(new Date(t).toISOString(), lang)}</span>`;
    const icon = d => ic(d.o ? d.icons[1] : d.icons[0]), cls = d => d.na ? 'na' : d.o ? 'open' : '';
    // one set of rows for both views: Show details opens a second line in each row (today's openings, when it last
    // opened), turns the rows into cards and shows the Open now / Last hour / Earlier titles, all with CSS transitions
    // on the same elements (nothing is redrawn), so it stays smooth on slow phones
    const det = mode === 'list' || (mode === 'both' && !!this._doorsExp), aligned = E.doorsTimeline === 'aligned';
    const tot = D.reduce((s, d) => s + d.n24, 0), busy = D.reduce((b, d) => (d.n24 > (b?.n24 || 0) ? d : b), null), nOpen = D.filter(d => d.o).length;
    const night = D.reduce((s, d) => s + d.evs.filter(e => !e.cut && new Date(e.t).getHours() < 5).length, 0);
    // the counts open the list of openings: all of them, the busiest door's, or the ones at night
    const sum = `<div class="dsum">${nOpen ? `<span class="bad"><b>${nOpen}</b> ${tr('open now')}</span>` : ''}<button data-act="dlog" data-f="all"><b>${tot}</b> ${tr(tot === 1 ? 'opening' : 'openings')}</button>${busy ? `<button data-act="dlog" data-f="door" data-door="${esc(busy.id)}">${tr('Busiest')}: <b>${esc(busy.name)}</b></button>` : ''}${night ? `<button class="warn" data-act="dlog" data-f="night">${tr('At night')}: <b>${night}</b></button>` : ''}</div>`;
    const grpOf = d => (d.o ? 0 : d.lastOpen && now - d.lastOpen < 36e5 ? 1 : 2), GRP = ['Open now', 'Last hour', 'Earlier'];
    const rows = D.map((d, i) => {
      const g = grpOf(d), hd = !i || grpOf(D[i - 1]) !== g ? `<div class="dgrp"><div>${tr(GRP[g])}</div></div>` : '';
      const left = d.na ? tr('Unavailable') : d.today === 1 ? tr('1 opening today') : d.today ? tr('{0} openings today', d.today) : tr('No openings today');
      const right = d.since ? tr('since {0}', hm(d.since)) : d.lastOpen ? tr('last opened {0}', hm(d.lastOpen)) : d.lc ? tr('last change {0}', hm(d.lc)) : '';
      return `${hd}<div class="dtl ${cls(d)}" data-act="more" data-id="${d.id}" data-k="${d.id}">
        <div class="dnm">${icon(d)}<span>${esc(d.name)}</span>${d.o ? `<i class="dbadge">${tr('Open')}</i>` : ''}</div>
        <div class="dtrack" data-t="${d.id}" data-act="dmark">${marks(d)}</div>
        <div class="dago">${d.na ? tr('Unavailable') : d.since ? ago(d.since, tr('Open')) : d.lastOpen ? ago(d.lastOpen) : d.lc ? ago(d.lc) : '—'}</div>
        <div class="dext"><div><span>${esc(left)}</span><span>${esc(right)}</span></div></div></div>`;
    }).join('');
    const axis = aligned ? `<div class="daxis"><span></span><div><span>-24 h</span><span>-12 h</span><span>${tr('now')}</span></div><span></span></div>` : '';
    const more = mode === 'both' ? `<button class="vmmore dmore" data-act="doorsview" aria-expanded="${det}"><span>${det ? tr('Show less') : tr('Show details · {0} doors', D.length)}</span>${ic('mdi:chevron-down')}</button>` : '';
    return `<div class="dv ${det ? 'det' : ''} ${aligned ? 'aligned' : 'fill'}"><div class="dsec dhead"><span>${tr('Doors')} · ${tr('last 24 h')}</span></div>${sum}<div class="dtls">${rows}${axis}</div>${more}</div>`;
  }
  // what a door's opening says: "14:32 · 4 min", "14:32 · open now", "until 06:10" (open since before the 24 hours)
  _dmDur(ms) { const m = Math.round(ms / 60e3); return m < 1 ? tr('{0} min', '<1') : m < 60 ? tr('{0} min', m) : `${tr('{0} h', Math.floor(m / 60))}${m % 60 ? ` ${tr('{0} min', m % 60)}` : ''}`; }
  _dmText(s, e, cut) {
    const lang = this._hass?.locale?.language, hm = t => new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    if (cut) return e ? tr('until {0}', hm(e)) : tr('open now');
    return `${hm(s)} · ${e ? this._dmDur(e - s) : tr('open now')}`;
  }
  // the list of openings in the last 24 hours (newest first, by day): every door's, one door's, or the ones at night
  _doorLog(f, door) {
    const D = this._dD || [], lang = this._hass?.locale?.language, now = Date.now();
    const hm = t => new Date(t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    let list = D.flatMap(d => d.evs.filter(e => !e.cut).map(e => ({ d, e })));
    if (f === 'night') list = list.filter(x => new Date(x.e.t).getHours() < 5);
    if (f === 'door') list = list.filter(x => x.d.id === door);
    list.sort((a, b) => b.e.t - a.e.t);
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const dayOf = t => (t >= +d0 ? tr('Today') : t >= +d0 - 864e5 ? tr('Yesterday') : new Date(t).toLocaleDateString(lang, { weekday: 'long' }));
    const title = f === 'door' ? D.find(d => d.id === door)?.name || tr('Openings') : f === 'night' ? tr('At night') : tr('Openings');
    const sub = `${list.length === 1 ? tr('1 opening') : tr('{0} openings', list.length)} · ${tr('last 24 h')}`;
    let day = null;
    const rows = list.map(({ d, e }) => {
      const k = dayOf(e.t), hd = k !== day ? `<div class="dsec">${esc(k)}</div>` : ''; day = k;
      const open = e.end == null, nightTag = new Date(e.t).getHours() < 5 && f !== 'night';
      return `${hd}<div class="dlog ${open ? 'open' : ''}"><span class="dlog-ic">${ic(open ? d.icons[1] : d.icons[0])}</span><b>${esc(d.name)}</b>${nightTag ? ic('mdi:weather-night', 'dlog-n') : ''}<span class="dlog-t">${hm(e.t)}</span><span class="dlog-d">${open ? `${tr('open now')} · ${this._dmDur(now - e.t)}` : this._dmDur(e.end - e.t)}</span></div>`;
    }).join('');
    const sh = this.$('sheet'); if (!sh) return;
    sh.innerHTML = `<div class="sheet dlogs" role="dialog" aria-label="${esc(title)}">
      <div class="sh-h">${ic(f === 'night' ? 'mdi:weather-night' : 'mdi:door-open')}<div><b>${esc(title)}</b><span>${esc(sub)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      ${rows || `<div class="sk-empty">${tr('No openings in 24 h')}</div>`}</div>`;
    sh.classList.add('open');
  }
  // a tap on a door's 24-hour bar: the opening nearest the tap is lit and a line opens under that door's own bar
  // ("11:52 PM · 4 min"), its pointer under the opening, for a few seconds. It opens inside the row (the rows below move
  // down), so it never covers another door's bar and can't be read as that door's
  _doorMark(trk, e) {
    const row = trk.closest('.dtl'); if (!row) return;
    const box = row.parentElement;
    clearTimeout(this._dtipT); box.querySelectorAll('.dtipw').forEach(x => x.remove()); box.querySelectorAll('.dtrack i.hit').forEach(x => x.classList.remove('hit')); box.querySelectorAll('.dtrack.sel').forEach(x => x.classList.remove('sel'));
    const r = trk.getBoundingClientRect(), x = e?.clientX || r.right;
    let best = null, bd = Infinity;
    for (const m of trk.querySelectorAll('i')) { const b = m.getBoundingClientRect(), d = x < b.left ? b.left - x : x > b.right ? x - b.right : 0; if (d < bd) { bd = d; best = m; } }
    const wrap = document.createElement('div'), tip = document.createElement('div'); wrap.className = 'dtipw'; tip.className = 'dtip'; wrap.appendChild(tip);
    let ax = x;
    if (best) { const b = best.getBoundingClientRect(); ax = (b.left + b.right) / 2; best.classList.add('hit');
      tip.textContent = this._dmText(+best.dataset.s, best.dataset.e ? +best.dataset.e : null, !!best.dataset.c); }
    else tip.textContent = tr('No openings in 24 h');
    row.insertBefore(wrap, row.querySelector('.dext')); trk.classList.add('sel'); // under the bar, above the details line
    const wr = wrap.getBoundingClientRect(), cx = ax - wr.left;
    const left = Math.max(0, Math.min(wr.width - tip.offsetWidth, cx - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.setProperty('--ax', `${Math.max(10, Math.min(tip.offsetWidth - 10, cx - left))}px`);
    this._dtipT = setTimeout(() => { wrap.classList.add('out'); best?.classList.remove('hit'); trk.classList.remove('sel'); setTimeout(() => wrap.remove(), 200); }, 4000);
  }
  // Show details / Show less: the same rows open (or close) their second line; CSS does the animation
  _doorsFlip() {
    this._doorsExp = !this._doorsExp;
    const box = this.$('security')?.querySelector('.dv'); if (!box) return;
    box.classList.toggle('det', this._doorsExp);
    const b = box.querySelector('.dmore'); if (!b) return;
    b.setAttribute('aria-expanded', String(this._doorsExp));
    b.querySelector('span').textContent = this._doorsExp ? tr('Show less') : tr('Show details · {0} doors', box.querySelectorAll('.dtl').length);
  }

  _rCams() {
    const tiles = E.cameras.map(c => {
      const person = this.on(c.person), car = this.on(c.car), mo = this.on(c.motion), dOpen = c.door && /^open$/i.test(this.v(c.door) || '');
      const face = this.ok(c.face) ? this.v(c.face) : null, plate = this.ok(c.plate) ? this.v(c.plate) : null;
      return `<div class="cam" data-act="cam" data-id="${c.id}"${(c.faceSet && c.face) || c.person ? ` data-id2="${(c.faceSet && c.face) || c.person}"` : ''}>
        <img data-cam="${c.id}" alt="">
        <div class="camlive" data-live="${c.id}"></div>
        <div class="cam-ov">
          <div class="cam-top"><span class="live ${mo ? 'mo' : ''}"><i></i>${mo ? tr('MOTION') : tr('LIVE')}</span>
            <span class="tags">${person ? `<i class="tag p">${ic('mdi:walk')}${tr("Person")}</i>` : ''}${car ? `<i class="tag c">${ic('mdi:car')}${tr("Car")}</i>` : ''}${dOpen ? `<i class="tag d">${ic('mdi:gate-open')}${tr("Gate Open")}</i>` : ''}</span></div>
          <div class="cam-bot"><b>${esc(c.name)}</b>
            ${face ? `<span>${ic('mdi:face-recognition')}${esc(face)}</span>` : ''}${plate ? `<span>${ic('mdi:card-text')}${esc(plate)}</span>` : ''}
            ${c.relay && this.s(c.relay) ? `<button class="relay" data-act="relay" data-id="${c.relay}">${ic('mdi:gate-open')}${c.relay === E.gate.relay ? tr("Open Gate") : tr("Open")}</button>` : ''}</div>
        </div></div>`;
    }).join('');
    // face recognition badge: panels.security.face, else the cameras' face sensors (Frigate); the newest name, or
    // "No face" while none has one (unknown / None / "No face"). No badge when nothing does face recognition.
    const fids = E.face ? [E.face] : [...new Set(E.cameras.map(c => c.face).filter(id => id && this.s(id)))];
    const named = fids.filter(id => this.ok(id) && !/^no.?faces?$/i.test(this.v(id))).sort((a, b) => new Date(this.s(b).last_changed) - new Date(this.s(a).last_changed))[0];
    const face = fids.length ? `<span class="pill tankpill"${named ? ' style="--c:#2dd4bf"' : ''} data-act="more" data-id="${named || fids[0]}">${ic(named ? 'mdi:face-recognition' : 'mdi:face-man-outline')}${esc(named ? this.v(named) : tr('No face'))}</span>` : '';
    return `<div class="ch">${ic('mdi:cctv')}<h3>${tr("Cameras")}</h3>${face}</div><div class="camgrid">${tiles}</div>`;
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
}
