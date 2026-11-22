// Sweet Home — Security, the alarm keypad, cameras.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, esc, ic, pretty, ALARM, alarmInfo } from '../core.js';

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
    const doors = E.doors.map(d => {
      const o = this.doorOpen(d); const bad = !this.ok(d.id);
      return `<div class="door ${bad ? 'na' : o ? 'open' : ''}" data-act="more" data-id="${d.id}">${ic(o ? 'mdi:door-open' : 'mdi:door-closed')}<span>${esc(d.name)}</span></div>`;
    }).join('') + E.entrances.filter(g => this.s(g.id) && (g.sensors?.length || g.sensor)).filter(g => !(g.sensors || [g.sensor]).some(x => E.doors.some(d => d.id === x))).map(g => {
      // a gate / door with an open / closed sensor (a contact, or a camera's classification) is listed with the doors too
      const st = this.entState(g), src = g.sensors?.find(x => this.ok(x)) || g.sensors?.[0] || g.sensor, o = st === 'open' || st === 'moving';
      return `<div class="door ${st === 'bad' ? 'na' : o ? 'open' : ''}" data-act="more" data-id="${src}">${ic(o ? g.icons?.[1] || 'mdi:door-open' : g.icons?.[0] || 'mdi:door-closed')}<span>${esc(g.cfgName || this.s(g.id).attributes.friendly_name || g.name)}</span></div>`;
    }).join('');
    return `<div class="ch">${ic('mdi:shield-home')}<h3>${tr("Security")}</h3>${E.alarm ? `<span class="pill" style="--c:${al[2]}">${al[0]}</span>` : ''}</div>
      ${!E.alarm ? '' : `<div class="alarm" style="--c:${al[2]}">
        <div class="shield ${st === 'triggered' ? 'blink' : ''}" data-act="more" data-id="${E.alarm}">${ic(al[1])}</div>
        <div class="abtns">${btn('alarm_disarm', 'mdi:shield-off-outline', 'Off', 'disarmed')}${btn('alarm_arm_away', 'mdi:lock', 'Away', 'armed_away')}${btn('alarm_arm_night', 'mdi:weather-night', 'Night', 'armed_night')}${btn('alarm_arm_vacation', 'mdi:airplane', 'Trip', 'armed_vacation')}</div>
      </div>`}
      ${locks || gate ? `<div class="locks">${locks}${gate}</div>` : ''}
      ${doors ? `<div class="dsec">${tr("Doors")}</div><div class="doors">${doors}</div>` : ''}`;
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
