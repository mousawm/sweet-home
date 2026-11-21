// Sweet Home — Energy, Energy History, the car.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, tc, esc, ic, clamp, skl, skPill, CAR_SVG, pretty, fmtW } from '../core.js';

export class EnergyPanels {
  // Power sheet: from the header "… now" chip, instead of HA's more-info of the grid sensor
  // (long press still opens that; double tap = solar). Live split, today's chart (same as the Energy tab), top devices.
  _powerHTML(head) {
    const g = this.n(E.energy.grid) ?? 0, sol = Math.max(0, this.n(E.energy.solar) ?? 0), home = Math.max(0, g + sol), exp = g < 0;
    const selfUse = home > 0 ? Math.round(Math.min(sol, home) / home * 100) : 0;
    const cons = this._eConsumers().map(([id, n, i]) => [n, i, this.n(id), id]).filter(c => c[2] != null && c[2] >= 6).sort((a, b) => b[2] - a[2]).slice(0, 6);
    const max = Math.max(1, ...cons.map(c => c[2]));
    const big = (id, icon, label, w, col, sub) => `<div class="pwb" data-act="more" data-id="${id}" style="--c:${col}">${ic(icon)}<span>${label}</span><b>${fmtW(w)}</b><small>${sub}</small></div>`;
    return head('mdi:flash', tr("Power Now"), exp ? `Sending ${fmtW(-g).replace(/<\/?small>/g, ' ').trim()} to the grid` : sol > 1 ? `Solar covers ${selfUse}% of the home` : tr("All from the grid"))
      + `<div class="pwbig">
          ${big(E.energy.current, 'mdi:home-lightning-bolt', 'Home', home, '#e7ecf6', this.ok(E.energy.current) ? this.f(E.energy.current, 1) : 'using now')}
          ${big(E.energy.solar, 'mdi:solar-panel-large', 'Solar', sol, '#fbbf24', sol > 1 ? 'producing' : 'idle')}
          ${big(E.energy.grid, 'mdi:transmission-tower', exp ? tr("To Grid") : tr("From Grid"), Math.abs(g), exp ? '#34d399' : '#60a5fa', exp ? 'exporting' : 'importing')}
        </div>
        ${home > 0 ? `<div class="pwmix"><i style="width:${selfUse}%;background:#fbbf24"></i><i style="width:${100 - selfUse}%;background:#60a5fa"></i></div>
          <div class="pwmixl"><span><i style="background:#fbbf24"></i>${tr("Solar")} ${selfUse}%</span><span><i style="background:#60a5fa"></i>${tr("Grid")} ${100 - selfUse}%</span></div>` : ''}
        <div class="dsec">${tr("Today")}</div>
        <div class="spark pwspark" id="spark2">${this._sparkSVG()}</div>
        ${this._eCardKpis()}
        ${cons.length ? `<div class="dsec">${tr("Using Power Now")}</div><div class="cons">${cons.map(([n, i, w, id]) => `<div class="crow" data-act="more" data-id="${id}">${ic(i)}<span>${esc(n)}</span><div class="bar"><i style="width:${(w / max * 100).toFixed(1)}%"></i></div><b>${fmtW(w)}</b></div>`).join('')}</div>` : ''}
        <button class="pwgo" data-act="tab" data-tab="energy" data-to="energy">${ic('mdi:lightning-bolt')}${tr("Open Energy Tab")}${ic('mdi:chevron-right')}</button>`;
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
    return `<div class="ch">${ic('mdi:solar-power-variant')}<h3>${tr("Energy")}</h3><span class="pill" style="--c:${exporting ? '#34d399' : '#fbbf24'}">${exporting ? tr("Exporting") : tr("Importing")}</span></div>
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
        <div class="node n-sun" ${this.s(E.energy.solar) ? `data-act="more" data-id="${E.energy.solar}"` : ''}>${ic('mdi:solar-panel-large')}<b>${fmtW(s)}</b><span>${tr("Solar")}</span></div>
        <div class="node n-grid ${exporting ? 'exp' : ''}" ${this.s(E.energy.grid) ? `data-act="more" data-id="${E.energy.grid}"` : ''}>${ic('mdi:transmission-tower')}<b>${fmtW(Math.abs(g))}</b><span>${exporting ? tr("To Grid") : tr("From Grid")}</span></div>
        <div class="node n-home" ${this.s(E.energy.current) ? `data-act="more" data-id="${E.energy.current}"` : ''}>${ic('mdi:home-lightning-bolt')}<b>${fmtW(home)}</b><span>${tr("Home")}${E.energy.current ? ` · ${this.f(E.energy.current, 1)}` : ''}</span></div>
        ${devNodes}
      </div>
      <div class="spark" id="spark">${this._sparkSVG()}</div>
      ${this._eCardKpis()}
      ${this.s(E.forecast.today) ? `<div class="fc" data-act="more" data-id="${E.forecast.today}" data-id2="${E.forecast.tomorrow}">${ic('mdi:weather-sunny-alert')}
        <div><span>${tr("Solar Forecast")}</span><b>${tr("Today")} ${this.f(E.forecast.today, 1)} · Tomorrow ${this.f(E.forecast.tomorrow, 1)}</b>
        <em>${this.ok(E.forecast.remaining) ? `${this.f(E.forecast.remaining, 1)} still to come today` : ''}${this.ok(E.forecast.peak) ? ` · peak at ${new Date(this.v(E.forecast.peak)).toLocaleTimeString(this._hass?.locale?.language || 'en', { hour: '2-digit', minute: '2-digit' })}` : ''}</em></div></div>` : ''}
      <div class="cons">${cons.map(([n, i, w, id]) => `<div class="crow" data-act="more" data-id="${id}">${ic(i)}<span>${esc(n)}</span><div class="bar"><i style="width:${(w / max * 100).toFixed(1)}%"></i></div><b>${fmtW(w)}</b></div>`).join('')}
        ${E.energy.extra.filter(x => this.s(x.id)).map(x => `<div class="crow" data-act="more" data-id="${x.id}">${ic(x.icon)}<span>${esc(x.name)}</span><div class="bar"><i style="width:0"></i></div><b>${this.f(x.id, 2)}</b></div>`).join('')}
      </div>`;
  }
  _afterEnergy() {}

  /* ---------- System-tab "Needs Attention" card ---------- */
  _ehRange(p, off) {
    const now = new Date(), Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
    const lang = this._hass?.locale?.language || 'en';
    const fd = (d, o) => d.toLocaleDateString(lang, o);
    let s, e, period, n, label;
    if (p === 'day') { s = new Date(Y, M, D + off); e = new Date(Y, M, D + off + 1); period = 'hour'; n = 24; label = off === 0 ? tr("Today") : off === -1 ? tr("Yesterday") : fd(s, { weekday: 'short', day: 'numeric', month: 'short' }); }
    else if (p === 'week') { const dow = (now.getDay() + 6) % 7; s = new Date(Y, M, D - dow + 7 * off); e = new Date(Y, M, D - dow + 7 * off + 7); period = 'day'; n = 7; label = off === 0 ? tr("This Week") : off === -1 ? tr("Last Week") : `${fd(s, { day: 'numeric', month: 'short' })} – ${fd(new Date(e - 864e5), { day: 'numeric', month: 'short' })}`; }
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
  // Energy card + Power popup totals: Today, Month and Year from Home Assistant's Energy statistics (net grid, like
  // Energy History); Month / Year from the user's own sensors only with energy_dashboard_totals off. Stored = stored_sensor
  _eCardKpis() {
    const S = this._eSrc(), T = this._etot || {}, g = v => v != null && v < 0 ? 'green' : '';
    const tpl = (id, k, dp) => id ? `<b class="${g(this.n(id))}">${this.f(id, dp)}</b>` : `<b class="${g(T[k])}">${this._eKwh(k, dp)}</b>`;
    const st = this.s(E.energy.stored) ? E.energy.stored : null; // Stored: only with a stored-energy sensor that exists
    return `<div class="kpis ${st ? 'four e4' : ''}">
          <div data-act="more" data-id="${S.gridIn}" data-id2="${S.gridOut}"><span>${tr("Today")}</span><b class="${g(T.d)}">${this._eKwh('d', 2)}</b></div>
          <div data-act="more" data-id="${E.energy.monthly || S.gridIn}"><span>${tr("Month")}</span>${tpl(E.energy.monthly, 'm', 1)}</div>
          <div data-act="more" data-id="${E.energy.yearly || S.gridIn}"><span>${tr("Year")}</span>${tpl(E.energy.yearly, 'y', 0)}</div>
          ${st ? `<div data-act="more" data-id="${st}"><span>${tr("Stored")}</span><b class="${g(this.n(st))}">${this.f(st, 0)}</b></div>` : ''}
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
    const head = `<div class="ch">${ic('mdi:chart-bar-stacked')}<h3>${tr("Energy History")}</h3><span class="pill" style="--c:#fbbf24">kWh</span></div>
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
        <div class="dsec">${tr("Devices")}</div><div class="cons">${'<div class="crow ehrow skrow"><span class="skl" style="width:16px;height:16px"></span><span class="skl"></span><span class="skl" style="height:6px"></span><span class="skl"></span><span class="skl"></span></div>'.repeat(7)}</div>`;
      return head + `<div class="ehwrap ehbusy">${this._ehBody || sk}<div class="ehspin">${ic('mdi:loading', 'spin')}<span>${tr("Loading")} ${esc(R.label.toLowerCase())}…</span></div></div>`;
    }
    if (d.error) return head + `<div class="sk-empty eh-msg">${tr("Couldn't load energy history")}</div>`;
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
    const readout = b != null && b < R.n ? `<div class="ehread"><b>${esc(R.bl(b))}</b> · ${kwh(d.home[b])} kWh used · ${d.gi[b] - d.go[b] < 0 ? `<span style="color:var(--green)">net exported ${kwh(d.go[b] - d.gi[b])}</span>` : `<span style="color:#60a5fa">net imported ${kwh(d.gi[b] - d.go[b])}</span>`}${series.map(x => x.a[b] > 0.005 ? ` · <span style="color:${x.c}">${esc(x.n)} ${kwh(x.a[b])}</span>` : '').join('')}</div>` : `<div class="ehread mu">${tr("Tap a bar for details")}</div>`;
    // "Show all" (only while some devices are picked) comes first: always on the top row, never wrapped onto a line of its own
    const legend = (this._eh.sel ? `<button class="lg rst" data-act="ehreset">${ic('mdi:restore')}${tr("Show all")}</button>` : '')
      + [...series.map(x => `<span class="lg" data-act="ehdev" data-id="${x.id}"><i style="background:${x.c}"></i>${esc(x.n)}</span>`), `<span class="lg"><i style="background:#475569"></i>${tr("Other")}</span>`].join('');
    const mx = Math.max(0.01, ...devs.map(x => x.t)), tracked = sum(devs.map(x => x.t)), den = Math.max(used, tracked, 0.01);
    const rows = devs.map(x => { const on = sel.includes(x.id); return `<div class="crow ehrow ${on ? 'on' : ''}" data-act="ehdev" data-id="${x.id}" style="--c:${x.c}">${ic(x.i)}<span>${esc(x.n)}</span><div class="bar"><i style="width:${(x.t / mx * 100).toFixed(1)}%;background:${x.c}"></i></div><b>${kwh(x.t)}</b><em>${Math.round(x.t / den * 100)}%</em></div>`; }).join('')
      + (used - tracked > 0.05 ? `<div class="crow ehrow untr">${ic('mdi:home-outline')}<span>${tr("Untracked")}</span><div class="bar"><i style="width:${((used - tracked) / Math.max(mx, used - tracked) * 100).toFixed(1)}%;background:#475569"></i></div><b>${kwh(used - tracked)}</b><em>${Math.round((used - tracked) / den * 100)}%</em></div>` : '');
    this._ehBody = `
      <div class="kpis four">
        <div data-act="more" data-id="${E.energy.current}"><span>${tr("Used")}</span><b>${kwh(used)}</b></div>
        <div data-act="more" data-id="${H.gridIn}"><span>${tr("From Grid")}</span><b>${kwh(sum(d.gi))}</b></div>
        <div data-act="more" data-id="${H.solar}"><span>${tr("Solar")}</span><b class="amber">${kwh(sum(d.so))}</b></div>
        <div data-act="more" data-id="${H.gridOut}"><span>${tr("Exported")}</span><b class="green">${kwh(sum(d.go))}</b></div>
      </div>
      ${(() => { // grid balance, as HA's "Grid energy balance": imported − exported
        const gi = sum(d.gi), go = sum(d.go), net = gi - go, exp = net < 0, tot = Math.max(0.01, gi + go);
        return `<div class="ehbal ${exp ? 'exp' : 'imp'}" data-act="more" data-id="${exp ? H.gridOut : H.gridIn}">
          <div class="ehbal-t">${ic(exp ? 'mdi:transmission-tower-export' : 'mdi:transmission-tower-import')}<span>${exp ? tr("Net Exported") : tr("Net Imported")}</span><b>${kwh(Math.abs(net))}<small>kWh</small></b></div>
          <div class="ehbal-bar"><i class="in" style="width:${(gi / tot * 100).toFixed(1)}%"></i><i class="out" style="width:${(go / tot * 100).toFixed(1)}%"></i></div>
          <div class="ehbal-l"><span>${ic('mdi:arrow-down')}${tr("Imported")} ${kwh(gi)}</span><span>${tr("Exported")} ${kwh(go)}${ic('mdi:arrow-up')}</span></div></div>`;
      })()}
      ${readout}
      <div class="ehchart"><div class="ehy">${yl}</div><svg viewBox="0 0 ${R.n * bw} 100" preserveAspectRatio="none">
        ${[0, 50, 100].map(v => `<line x1="0" x2="${R.n * bw}" y1="${v}" y2="${v}" class="gl"/>`).join('')}${bars}</svg>
        <div class="ehx" style="grid-template-columns:repeat(${R.n},1fr)">${xl}</div></div>
      <div class="ehlg">${legend}</div>
      <div class="dsec">${tr("Devices · tap to show in chart")}</div>
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
      <div class="spk-tip ${ci > B * 0.6 ? 'l' : ''}" style="left:${pct(ci)}%"><b>${ci === nowI ? tr("Now") : fmt(ci)}</b>
        <span><i style="background:#fbbf24"></i>${tr("Solar")} ${fmtW(S[ci] + X[ci])}</span><span><i style="background:#60a5fa"></i>${tr("Grid")} ${fmtW(I[ci])}</span>
        <span><i style="background:#34d399"></i>${tr("Exported")} ${fmtW(X[ci])}</span><span><i class="dash"></i>${tr("Home")} ${fmtW(Hm[ci])}</span></div>`;
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
}
