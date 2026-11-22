// Sweet Home — Water and irrigation.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { arr } from '../model.js';
import { t as tr } from '../i18n.js';
import { E, esc, ic, clamp, BAD, pumpTime, bidi, whenText } from '../core.js';

export class WaterPanels {
  _rWater() {
    const W = E.water;
    const lvl = clamp(this.n(W.tank) ?? 0, 0, 100);
    const col = lvl < 20 ? '#f43f5e' : lvl < 40 ? '#fbbf24' : '#38bdf8';
    const sw = (id, n, i, sub, id2) => this.s(id) ? `<button class="tile wide ${this.on(id) ? 'on' : ''}" data-act="${i.includes('pump') ? 'pump' : 'toggle'}" data-id="${id}"${id2 ? ` data-id2="${id2}"` : ''}>${ic(i, this.on(id) && i.includes('pump') ? 'pulse' : '')}<span>${esc(n)}</span><em class="sub">${sub || (this.on(id) ? 'On' : tr("Off"))}</em></button>` : '';
    if (W.tank && (!this._tankTr || Date.now() - this._tankTr.at > 5 * 60e3)) setTimeout(() => this._loadTankTrend(), 0);
    return `<div class="ch">${ic('mdi:water')}<h3>${tr("Water")}</h3>${W.tank ? this._tankPill(lvl) : ''}</div>
      <div class="water ${W.tank ? '' : 'notank'}">
        ${!W.tank ? '' : `<div class="tank" data-act="more" data-id="${W.tank}" data-id2="${W.quality}" style="--lvl:${lvl}%;--c:${col}">
          <div class="liquid"><svg class="wave" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V20 H0Z"/></svg></div>
          <div class="tank-lbl ${lvl >= 58 ? 'wet' : 'dry'}"><b>${lvl.toFixed(1)}<small>%</small></b><span>${[W.quality ? `${tr('Quality')} ${this.f(W.quality, 0)}` : '', W.temp ? this.f(W.temp, 0) : ''].filter(Boolean).join(' · ')}</span></div>
        </div>`}
        <div class="wtiles">
          ${W.pumps.map(p => sw(p.id, p.name, 'mdi:water-pump', this.on(p.id) ? this._pumpOn(p) : p.info && this.ok(p.info) ? esc(this.v(p.info)) : null, p.power || p.info)).join('')}
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
  // what a running pump shows (its `show` option): how long it has been on (a live timer, from when it turned on),
  // its power, or both
  _pumpOn(p) {
    const parts = [];
    if (p.show !== 'power') { const since = Date.parse(this.s(p.id)?.last_changed || ''); if (since) parts.push(`<span class="ptime" data-since="${since}">${pumpTime(Date.now() - since)}</span>`); }
    if (p.show !== 'time' && p.power && this.ok(p.power)) parts.push(this.f(p.power, 0));
    return [tr('On'), ...parts].join(' · ');
  }
  _tankPill(lvl) {
    const r = this._tankTr?.rate, dur = h => bidi(h >= 48 ? tr('{0} days', Math.round(h / 24)) : h >= 1 ? tr('{0} h', Math.round(h)) : tr('{0} min', Math.max(1, Math.round(h * 60))));
    const rt = v => bidi(tr('{0}%/h', Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)));
    let txt, col, icon;
    if (r == null) { txt = tr('Trend…'); col = '#94a3b8'; icon = 'mdi:chart-line-variant'; }
    else if (Math.abs(r) < 0.2) { txt = tr('Steady'); col = '#94a3b8'; icon = 'mdi:minus'; }
    else if (r < 0) { const h = lvl / -r; txt = `${rt(r)} · ${tr('empty in ~{0}', dur(h))}`; col = h < 4 ? '#f43f5e' : h < 12 ? '#fbbf24' : '#38bdf8'; icon = 'mdi:arrow-down-bold'; }
    else { const h = (100 - lvl) / r; txt = `${rt(r)} · ${tr('full in ~{0}', dur(h))}`; col = '#34d399'; icon = 'mdi:arrow-up-bold'; }
    return `<span class="pill tankpill" style="--c:${col}" data-act="more" data-id="${E.water.tank}">${ic(icon)}${txt}</span>`;
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
      <div class="drops">${ic('mdi:sprinkler-variant')}</div><b>${esc(nm)}</b><span>${bad ? tr('Unavailable') : this.on(id) ? tr('Watering') : tr('Closed')}${m != null ? ` · ${bidi(tr('{0} min', m))}` : ''}</span></button>`;
    }).join('');
    const ok = id => { if (!this.ok(id)) return '—'; const v = this.v(id), w = tr(v); return w !== v ? esc(w) : (x => x ? esc(x) : bidi(esc(v)))(whenText(v)); }; // a weekday such as "Friday" is translated; a date in the card's language
    // v1.21.8: the header pill is the Water Tomorrow switch (the separate row is gone); long press = more-info
    return `<div class="ch">${ic('mdi:sprinkler')}<h3>${tr("Irrigation")}</h3>${!I.tomorrow ? '' : `<button class="pill pillsw ${this.on(I.tomorrow) ? 'on' : ''}" style="--c:${this.on(I.tomorrow) ? '#34d399' : '#94a3b8'}" data-act="toggle" data-id="${I.tomorrow}" aria-pressed="${this.on(I.tomorrow)}">${this.on(I.tomorrow) ? tr("Watering tomorrow") : tr("Scheduled")}</button>`}</div>
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
}
