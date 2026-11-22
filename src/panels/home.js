// Sweet Home — Header, tabs, At a glance, Climate, Modes, the room panel.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, ROOMS, ROOM, DOOR_INFO, FURN, tc, ago, agoShort, esc, ic, BAD, FAHR, tempRGB, rgb, skl, pretty, TOGGLE_DOMAINS, BIN_LABEL, DC_ICON, NAMED_DOMAINS, SMART, nameIcon, plugCharger, plugIcon, domIcon, furnName, furnIcon, fmtW, wxName, WEATHER_ICON, HVAC_ICON, HVAC_COLOR, ALARM, alarmInfo } from '../core.js';

export class HomePanels {
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
    const w = this.s(E.weather); if (!w) return head('mdi:weather-partly-cloudy', tr("Weather"), 'Not available');
    const a = w.attributes, lang = this._hass?.locale?.language || 'en';
    const daily = this._wx?.daily || [], hourly = (this._wx?.hourly || []).slice(0, 24);
    const icon = c => WEATHER_ICON[c] || 'mdi:weather-partly-cloudy';
    const deg = t => t == null || isNaN(t) ? '—' : `${Math.round(t)}°`;
    const col = t => t == null ? 'inherit' : rgb(tempRGB(t));
    const today = daily[0], night = w.state === 'clear-night' || this.v(E.sun) === 'below_horizon';
    const mood = /rain|pour|lightning|hail/.test(w.state) ? 'rain' : /snow/.test(w.state) ? 'snow' : /cloud|fog/.test(w.state) ? 'cloud' : night ? 'night' : 'sun';
    const compass = b => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16];
    const uvLvl = u => u < 3 ? tr("Low") : u < 6 ? tr("Moderate") : u < 8 ? tr("High") : u < 11 ? tr("Very High") : tr("Extreme");
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
        ${hourly.map((h, i) => `<div class="wxhc"><span>${i ? esc(new Date(h.datetime).toLocaleTimeString(lang, { hour: 'numeric' })) : tr("Now")}</span>${ic(icon(h.condition))}<b style="color:${col(h.temperature)}">${deg(h.temperature)}</b><em>${h.precipitation > 0 ? `${h.precipitation}<small>mm</small>` : ''}</em></div>`).join('')}
      </div></div>`;
    }
    // daily rows with a range bar on one shared scale
    let days = '';
    if (daily.length) {
      const lo = Math.min(...daily.map(d => d.templow ?? d.temperature)), hi = Math.max(...daily.map(d => d.temperature)), span = Math.max(1, hi - lo);
      days = daily.map((d, i) => {
        const l = d.templow ?? d.temperature, h = d.temperature, x0 = (l - lo) / span * 100, x1 = (h - lo) / span * 100;
        const now = i === 0 && a.temperature != null ? `<i class="wxnowdot" style="left:${Math.min(100, Math.max(0, (a.temperature - lo) / span * 100))}%"></i>` : '';
        return `<div class="wxd"><span>${i ? esc(new Date(d.datetime).toLocaleDateString(lang, { weekday: 'short' })) : tr("Today")}</span>${ic(icon(d.condition))}
          <em>${d.precipitation > 0 ? `${ic('mdi:water')}${d.precipitation}<small>mm</small>` : ''}</em>
          <b class="lo">${deg(l)}</b><div class="wxbar"><i style="left:${x0}%;width:${Math.max(2, x1 - x0)}%;background:linear-gradient(90deg,${col(l)},${col(h)})"></i>${now}</div><b>${deg(h)}</b></div>`;
      }).join('');
    }
    return head(icon(w.state), tr("Weather"), `${tc(a.friendly_name || 'Outside')} · now`)
      + `<div class="wxnow ${mood}" data-act="more" data-id="${E.weather}">${ic(icon(w.state), 'wxbig')}
          <div class="wxt"><b style="color:${col(a.temperature)}">${a.temperature != null ? Number(a.temperature).toFixed(1) : '—'}°</b><span>${esc(wxName(w.state))}</span></div>
          ${today ? `<div class="wxhl"><span>${ic('mdi:arrow-up')}${deg(today.temperature)}</span><span>${ic('mdi:arrow-down')}${deg(today.templow)}</span></div>` : ''}</div>`
      + `<div class="wxstats">${stats}</div>`
      + (hours ? `<div class="dsec">${tr("Next 24 Hours")}</div>${hours}` : '')
      + (days ? `<div class="dsec">${daily.length}-Day Forecast</div><div class="wxdays">${days}</div>` : (hours ? '' : `<div class="dsec">${tr("Next 24 Hours")}</div><div class="wxskh">${Array.from({ length: 6 }, () => `<div>${skl('60%', 9)}${skl('22px', 22, 'border-radius:50%;margin:6px auto')}${skl('70%', 12)}</div>`).join('')}</div>
        <div class="dsec">${tr("Forecast")}</div><div class="wxdays">${Array.from({ length: 5 }, () => `<div class="wxd">${skl('80%', 12)}${skl('20px', 20, 'border-radius:50%')}<span></span>${skl('100%', 11)}${skl('100%', 6)}${skl('100%', 11)}</div>`).join('')}</div>`))
      + (a.attribution ? `<div class="wxfoot">${esc(a.attribution)}</div>` : '');
  }
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
    const al = alarmInfo(this.v(E.alarm));
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
    const al = alarmInfo(this.v(E.alarm));
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
        <div class="tv ${this._acPend?.[id] ? 'pend' : ''}"><b>${this._acT(id) ?? '—'}<small>°</small></b><span>${tr('target')} · ${a.min_temp ?? (FAHR ? 61 : 16)}–${a.max_temp ?? (FAHR ? 86 : 30)}°</span></div>
        <button class="ibtn" data-act="actemp" data-id="${id}" data-d="1" aria-label="Raise temperature">${ic('mdi:plus')}</button></div>
      <div class="modes">${modes.map(m => `<button class="mbtn ${mode === m ? 'on' : ''}" style="--c:${m === 'off' ? '#94a3b8' : HVAC_COLOR[m] || '#60a5fa'}" data-act="acmode" data-id="${id}" data-mode="${m}">${ic(HVAC_ICON[m] || 'mdi:thermostat')}<em>${esc(pretty(m))}</em></button>`).join('')}</div>
      <div class="picks">${this.pickChip(id, 'fan', 'Fan', 'mdi:fan')}${this.pickChip(id, 'swing', 'Swing ↕', 'mdi:arrow-up-down')}${this.pickChip(id, 'swingh', 'Swing ↔', 'mdi:arrow-left-right')}${this.pickChip(id, 'preset', 'Preset', 'mdi:star-four-points-outline')}</div>
      ${extras.length ? `<div class="xsw">${extras.map(e => `<button class="xs ${this.on(e) ? 'on' : ''}" data-act="toggle" data-id="${e}">${ic(/jet/.test(e) ? 'mdi:weather-windy' : /display/.test(e) ? 'mdi:monitor' : 'mdi:toggle-switch-outline')}<span>${esc(pretty(e.split('.')[1].slice(obj.length + 1)))}</span><b>${this.on(e) ? 'On' : tr("Off")}</b></button>`).join('')}</div>` : ''}
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
          <div class="acn"><b>${esc(a.name)}</b><span>${on ? `${esc((m => { const x = tr(tc(m)); return x === tc(m) ? m : x; })(mode.replace(/_/g, ' ')))} → ${this._acT(a.id) ?? '—'}°` : tr("Off")}${p != null && p > 0 ? ` · ${Math.round(p)} W` : ''}</span></div>
          <div class="act"><b style="color:${rgb(tempRGB(t))}">${t != null ? Number(t).toFixed(1) + '°' : '—'}</b>${h != null ? `<span>${ic('mdi:water-percent')}${Math.round(h)}%</span>` : ''}</div>
          <button class="pow ${on ? 'on' : ''}" data-act="acpow" data-id="${a.id}">${ic('mdi:power')}</button>
        </div>${ctl}</div>`;
    }).join('');
    const rooms = ROOMS.filter(r => r.temp && this.s(r.temp)).map(r => {
      const t = this.n(r.temp), h = r.hum ? this.n(r.hum) : null;
      return `<button class="rtemp" data-act="more" data-id="${r.temp}"${r.hum ? ` data-id2="${r.hum}"` : ''} style="--c:${rgb(tempRGB(t))}">${ic(r.icon)}<span>${esc(r.name)}</span><b>${t != null ? t.toFixed(1) + '°' : '—'}</b>${h != null ? `<em>${Math.round(h)}%</em>` : ''}</button>`;
    }).join('');
    return `<div class="ch">${ic('mdi:air-conditioner')}<h3>${tr("Climate")}</h3><span class="pill">${tr('{0} running', E.acs.filter(a => this.climOn(a.id)).length)}</span></div>
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
      // a dimmable light that is on: its % shows once, on the row (the slider under it moves that number)
      const slid = !simple && dim && on;
      return `<div class="lwrap ${on ? 'on' : ''}"><button class="lrow ${on ? 'on' : ''}" data-act="toggle" data-id="${l}">${ic(icon)}<span>${esc(lname)}</span><b${slid ? ` id="${this.sliderLabel(l, 'bright')}"` : ''}>${esc(br)}</b></button>
        ${simple ? '' : `${slid ? this.slider(l, 'bright', pct, '#fbbf24', false) : ''}${on && (fx === 'strip' || r.colorLights?.includes(l)) ? this.colorRow(l) : ''}${on ? this.pickChip(l, 'effect', 'Effect', 'mdi:auto-fix') : ''}`}</div>`;
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
      const on = this.on(p.id); const w = this.n(p.power); const drawing = on && (w ?? 0) > 1.5, chg = drawing && plugCharger(p);
      const val = !on ? tr('Off') : chg ? tr('Charging · {0} W', w.toFixed(1)) : drawing ? tr('On · {0} W', w < 10 ? w.toFixed(1) : Math.round(w)) : p.power ? tr('On · idle') : tr('On');
      return `<button class="lrow ${on ? 'on cool' : ''}" data-act="toggle" data-id="${p.id}"${p.power ? ` data-id2="${p.power}"` : ''}>${ic(chg ? 'mdi:battery-charging' : plugIcon(this, p), on && SMART && nameIcon(p.id, p.name) === 'mdi:fan' ? 'spin' : '')}<span>${esc(p.name)}</span><b>${val}</b></button>`;
    });
    if (r.count && this.ok(r.count)) extra.push(`<div class="mrow"><ha-icon icon="mdi:account-multiple"></ha-icon><span>${tr('People Detected')}</span><b>${esc(this.v(r.count))}</b></div>`);
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
      ${sec(r.locks?.length ? tr("Entrance") : tr("Doors"), 'd', entry)}
      ${sec('Plugs', 'p', plugs)}
      ${sec('Furniture', 'f', furn)}
      ${sec('Devices', 'v', devs)}
      ${sec('Sensors', 's', [...motion, ...extra, ...sensors])}
      ${sec('Other', 'o', other)}
      ${empty ? `<div class="empty">${ic('mdi:information-outline')} ${tr('No devices mapped to this room yet. Link it to an area, or add entities in the card editor (Rooms → Entities).')}</div>` : ''}`;
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
    if (d === 'script' || d === 'scene') return `<button class="lrow ${v === 'on' ? 'on cool' : ''}" data-act="run" data-id="${id}">${ic(icon)}<span>${name}</span><b>${tr(d === 'scene' ? tr("Activate") : v === 'on' ? tr("Running") : tr("Run"))}</b></button>`;
    if (d === 'button' || d === 'input_button') return `<button class="lrow" data-act="press" data-id="${id}">${ic(icon)}<span>${name}</span><b>${tr('Press')}</b></button>`;
    let val;
    if (d === 'binary_sensor') val = tr(BIN_LABEL[a.device_class]?.[v === 'on' ? 0 : 1] || (v === 'on' ? 'On' : tr("Off")));
    else if (!isNaN(parseFloat(v)) && isFinite(v)) { const x = parseFloat(v); val = `${Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10}${a.unit_of_measurement ? ' ' + a.unit_of_measurement : ''}`; }
    else val = tr(pretty(v));
    const active = this.on(id) || (d === 'climate' && this.climOn(id));
    return `<div class="mrow ${active ? 'on' : ''}" data-act="more" data-id="${id}">${ic(icon)}<span>${name}</span><b>${esc(val)}</b></div>`;
  }
}
