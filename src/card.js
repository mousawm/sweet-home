/*
 * Sweet Home — an interactive 3D home dashboard card for Home Assistant.
 * MIT licence. Use: `type: custom:sweet-home-card` (best in a panel view). Configure it in the card editor or YAML;
 * without any configuration the house is built from your Home Assistant areas.
 */
import { THREE_LIB } from './three.js'; // the parts of three.js the scene uses
import INTER from './fonts/inter-latin-wght-normal.woff2'; // Inter (SIL Open Font License 1.1, see src/fonts/OFL-Inter.txt)
import { buildModel, cleanConfig, movePiece } from './model.js';
import { t as tr, setLang, isRTL } from './i18n.js';
import { VERSION, MODEL, E, ROOMS, ROOM, DOOR_INFO, FURN, useModel, RN_SECS, TAB_SECS, tc, ago, agoShort, esc, ic, clamp, BAD, FAHR, tempRGB, rgb, morph, COLORS, COARSE, pumpTime, WHITES, PICK, pretty, devType, devGet, devSet, SHARED, dropShared, SMART, btnIcon, cleanLabel, domIcon, ALL_TABS, wxName, WEATHER_ICON, acIcon, HVAC_ICON, setFahr, setShared, setSmart, bidi } from './core.js';
import { HouseScene } from './scene.js';
import { CSS } from './styles.js';
import { MediaPanels } from './panels/media.js';
import { EnergyPanels } from './panels/energy.js';
import { SecurityPanels } from './panels/security.js';
import { SystemPanels } from './panels/system.js';
import { WaterPanels } from './panels/water.js';
import { RenameTools } from './panels/rename.js';
import { HomePanels } from './panels/home.js';
import './strategy.js';

// The card editor is its own file (sweet-home-editor.js, next to this one): only someone editing the card downloads it.
// Its address carries the version, so a browser never keeps an editor from another version.
let editorLoad = null;
function loadEditor() {
  if (customElements.get('sweet-home-card-editor')) return Promise.resolve();
  return (editorLoad ||= import(new URL(`./sweet-home-editor.js?v=${VERSION}`, import.meta.url).href).catch(e => {
    editorLoad = null;
    throw new Error(`Sweet Home: could not load sweet-home-editor.js, which must sit next to sweet-home-card.js (${e.message})`);
  }));
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
export class SweetHomeCard extends HTMLElement {
  static get THREE() { return THREE_LIB; }
  static TYPE = 'sweet-home-card';
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
    setSmart(this._config.smart_icons !== false);
    this._applyLook();
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
  static async getConfigElement() { await loadEditor(); return document.createElement('sweet-home-card-editor'); }
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
    setFahr(String(h?.config?.unit_system?.temperature || '').toUpperCase().includes('F'));
    this._applyLook();
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
    if (this._popKey) { window.removeEventListener('keydown', this._popKey); this._popKey = null; }
    clearInterval(this._clockT); clearInterval(this._camT); clearInterval(this._histT);
    if (this._repSub) { const p = this._repSub; this._repSub = null; p.then(u => u?.()).catch(() => {}); } // the repairs listener
    this._unmountCams(); if (this._visH) { document.removeEventListener('visibilitychange', this._visH); this._visH = null; }
    if (this._three) this._three.pause();
    // while the dashboard or this card is being edited: the 3D view is kept for the card that replaces this one
    if (this._three && (this._previewProp || this._editModeProp || window.__sweetHomeEditor?.isConnected) && this.$('viewport')) {
      if (SHARED && SHARED.scene !== this._three) dropShared();
      setShared({ scene: this._three, vp: this.$('viewport'), owner: this, mode: this._mode, level: this._level, sel: this._sel, tab: this._tab, timer: setTimeout(dropShared, 5000) });
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
    return bidi(`${x.toFixed(d)}${u ? `<small>${esc(u)}</small>` : ''}`);
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
  _waitState(id, pred, ms) {
    return new Promise(res => { const t0 = Date.now(); const chk = () => { if (pred(this.v(id))) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(chk, 150); }; chk(); });
  }
  // HA's details dialog; nothing for a tile with no entity behind it (no "null" dialog with "Invalid entity_ids")
  more(entityId) { if (!entityId || entityId === 'null' || entityId === 'undefined' || !this._hass?.states?.[entityId]) return; this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })); }

  /* ---------- build ---------- */
  _build() {
    this._built = true;
    if (!document.getElementById('h3d-font')) { // Inter, bundled with the card: nothing is loaded from outside (works offline, no third party)
      const l = document.createElement('style'); l.id = 'h3d-font';
      l.textContent = `@font-face{font-family:'Inter';font-style:normal;font-display:swap;font-weight:100 900;src:url(${INTER}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
      document.head.appendChild(l);
    }
    // Arabic uses the device's own Arabic font (SF Arabic on Apple, Noto on Android, Segoe UI on Windows): nothing loaded from outside
    // card-mod puts its own <card-mod> element (the card_mod styles) inside the card: kept through the redraw, in its place
    const cmods = [...this.shadowRoot.children].filter(el => el.localName === 'card-mod').map(el => [el, el === this.shadowRoot.firstElementChild]);
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
    ${this._solo ? '<ha-card class="sh-card">' : ''}<div class="app${this._solo ? ' solo' : ''}" dir="${isRTL() ? 'rtl' : 'ltr'}" lang="${esc(this._hass?.locale?.language || 'en')}">
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
            ${!this._solo && this._config?.room_backdrop !== false ? '<div class="rback" id="rback" data-act="roomclose"></div>' : ''}
            ${this._solo ? '' : '<aside class="drawer" id="drawer"></aside>'}
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
    </div>${this._solo ? '</ha-card>' : ''}
    ${this._solo ? `<div class="rpop" id="rpop" data-act="roomclose" dir="${isRTL() ? 'rtl' : 'ltr'}"><aside class="drawer" id="drawer" role="dialog" aria-modal="true"></aside></div>` : ''}
    <div class="sheet-bg" id="sheet" data-act="sheetclose" dir="${isRTL() ? 'rtl' : 'ltr'}"></div>
    <div class="toast" id="toast" role="status" aria-live="polite" dir="${isRTL() ? 'rtl' : 'ltr'}"></div>`;
    if (this._solo) { // Sweet Home 3D: only the 3D view; `height` sets it outside a sections grid
      const hh = this._config?.height, px = typeof hh === 'number' || /^\d+$/.test(String(hh ?? '')) ? `${hh}px` : hh;
      this.toggleAttribute('solo', true);
      if (px && /^[\d.]+(px|vh|em|rem)$/.test(px)) this.style.setProperty('--solo-h', px); else this.style.removeProperty('--solo-h');
    }
    for (const [el, first] of cmods) { if (first) this.shadowRoot.prepend(el); else this.shadowRoot.appendChild(el); }
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
      { el: $('mserver'), deps: all(Object.values(E.mserver).map(o => [Object.values(o).filter(v => typeof v === 'string'), (o.more || []).map(m => Object.values(m))]), this._jfPlayers()), render: () => this._rMServer() },
      { el: $('lab'), deps: all(Object.values(E.lab).filter(x => typeof x === 'string'), Object.values(E.lab.byNode || {}).map(o => Object.values(o)), this._labGuestIds().map(g => [`binary_sensor.${g}_status`, `sensor.${g}_status`, `sensor.${g}_cpu_used`, `sensor.${g}_memory_used_percentage`])), render: () => this._rLab() },
      { el: $('devices'), deps: all(E.devices.map(d => [d.bat, d.chg, d.trk, d.chgState]), E.persons), render: () => this._rDevices() },
      { el: $('irrigation'), deps: all(E.irrigation.valves.map(v => v[0]), E.irrigation.every, E.irrigation.day, E.irrigation.tomorrow, E.irrigation.next, E.irrigation.notify, E.irrigation.time, E.irrigation.durations), render: () => this._rIrrigation() },
    ];
    const offP = k => this._config?.panels?.[k] === false; // a panel switched off in the card editor
    const off = {
      security: offP('security') || !(E.alarm || E.locks.length || E.doors.length || E.entrances.length), cams: offP('security') || offP('cameras') || !E.cameras.length, climate: offP('climate') || !MODEL.has.climate,
      modes: offP('modes') || !E.modes.length, tvlight: offP('tv_light') || !(E.tvLight.light || E.media.echoes.length), car: !(E.car.charging || E.car.power || E.car.battery) || this._config?.panels?.car === false,
      water: offP('water') || !(E.water.tank || E.water.pumps.length || E.water.entities.length), irrigation: offP('irrigation') || !(E.irrigation.valves.length || E.irrigation.every || E.irrigation.day || E.irrigation.tomorrow || E.irrigation.next), media: !E.media.tv || MODEL.E && this._config?.panels?.media === false,
      mserver: !MODEL.hasMS || this._config?.panels?.media_server === false, lab: !E.lab.cpu || this._config?.panels?.homelab === false, devices: offP('devices') || !E.devices.length,
      energy: true, ehist: true, alerts: this._config?.panels?.attention === false,
    };
    if (this._solo) for (const sec of this._sections) if (sec.el.id !== 'drawer') off[sec.el.id] = true; // Sweet Home 3D: the room pop-up only
    for (const sec of this._sections) if (off[sec.el.id]) { sec.off = true; sec.el.style.display = 'none'; }
    const kt = this._keepTab; this._keepTab = null;
    this._setTab(this._solo ? 'home' : kt && this._tabOn(kt) ? kt : MODEL.startTab && this._tabOn(MODEL.startTab) ? MODEL.startTab : 'home');
    const L = MODEL.levels || [{ level: 0 }];
    this._focus = this._focusId();
    if (this._focus) this._level = ROOM[this._focus].level; // zoomed on one room: its floor
    else if (this._level == null || !L.some(l => l.level === this._level)) this._level = this._defFloor(L);
    this._tick();
    const K = this._keep3d;
    const defsNow = JSON.stringify([this._config?.default_view, this._config?.default_floor]); this._keep3d = null;
    if (K) { // the 3D view moved in above goes on as it was
      this._three = K.scene;
      // a new start view / floor picked in Look: shown right away
      const defs = JSON.stringify([this._config?.default_view, this._config?.default_floor]);
      if (this._defsJSON != null && defs !== this._defsJSON) { this._three.view(this._defView()); const L = MODEL.levels || [{ level: 0 }]; this._setLevel(this._focus ? ROOM[this._focus].level : this._defFloor(L)); if (ROOM[this._reselect]?.level !== this._level) this._reselect = null; }
      if (this._three._focusWas !== this._focus) { // Sweet Home 3D: another room picked (or none): frame it, on its floor
        this._three._focusWas = this._focus;
        if (this._three.level !== this._level) this._three.setLevel(this._level);
        this._three.select(null);
      }
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

  get _solo() { return this.constructor.SOLO === true; }
  // light or dark look: `appearance` dark (default) / light / auto (Home Assistant's light or dark theme). Sweet Home 3D
  // always follows the theme, like the cards around it.
  _applyLook() {
    const a = this._solo ? 'auto' : this._config?.appearance || 'dark';
    const light = a === 'light' || (a === 'auto' && this._hass?.themes?.darkMode === false);
    if (this.getAttribute('look') !== (light ? 'light' : 'dark')) this.setAttribute('look', light ? 'light' : 'dark');
  }
  // Sweet Home 3D `room`: the room it is zoomed on (its id, Home Assistant area or name)
  _focusId() {
    const v = this._solo ? String(this._config?.room ?? '').trim().toLowerCase() : ''; if (!v) return null;
    return (ROOMS.find(r => [r.id, r.area, r.name].some(x => x != null && String(x).toLowerCase() === v)) || {}).id || null;
  }
  // Sweet Home 3D: the room's controls open as a pop-up over the dashboard (Escape or a tap beside it closes it)
  _roomPop(open) {
    const p = this.$('rpop'); if (!p) return;
    p.classList.toggle('open', open);
    if (open && !this._popKey) { this._popKey = e => { if (e.key === 'Escape') this._select(null); }; window.addEventListener('keydown', this._popKey); }
    if (!open && this._popKey) { window.removeEventListener('keydown', this._popKey); this._popKey = null; }
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
      <div class="sh-h"><div><b>${esc(tr(P.title))}</b><span>${esc(name)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="opts">${opts.map((o, i) => `<button class="opt ${o === cur ? 'on' : ''}" data-act="pickopt" data-i="${i}">
        ${kind === 'hvac' ? ic(HVAC_ICON[o] || 'mdi:thermostat') : ''}<span>${bidi(esc(pretty(o)))}</span>${o === cur ? ic('mdi:check') : ''}</button>`).join('')}</div></div>`;
    sh.classList.add('open');
  }
  // Info sheets opened from the header chips ("N lights on", "xx° inside"); they refresh live while open
  _openInfo(kind) {
    this._closeSheet();
    this._info = kind;
    const sh = this.$('sheet'); sh.innerHTML = `<div class="sheet" role="dialog" aria-label="${kind.startsWith('rename:') ? tr('Rename devices') : kind === 'lights' ? tr("Lights") : kind === 'temps' ? tr("Temperatures") : kind === 'weather' ? tr("Weather") : kind === 'power' ? tr("Power") : kind.startsWith('jf') ? tr("Jellyfin library") : kind.startsWith('mup:') ? tr("Coming up") : kind === 'swap' ? tr("Swap usage") : kind === 'wanted' ? tr("Wanted episodes") : tr("Phone")}"></div>`;
    sh.classList.add('open');
    if (kind === 'weather') this._wxSub();
    if (kind === 'wanted' && (!this._wanted || Date.now() - this._wanted.at > 5 * 60e3 || String(this._wanted.n) !== String(this.v(E.mserver.sonarr.wanted)))) this._loadWanted();
    if (kind.startsWith('jf') && this._jfc && Date.now() - (this._jfcAt || 0) > 10 * 60e3) this._jfc = null; // library cache: 10 min
    this._renderInfo();
  }
  _renderInfo() {
    const box = this.$('sheet')?.querySelector('.sheet'); if (!box || !this._info) return;
    // title and sub are plain text (entity, TV and show names among them): escaped here, never passed in as HTML
    const head = (icon, title, sub) => `<div class="sh-h">${ic(icon)}<div><b>${esc(title)}</b><span>${esc(sub)}</span></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>`;
    let html;
    if (this._info.startsWith('rename:')) html = this._rnSheet(head, this._info.slice(7));
    else if (this._info.startsWith('rnbadge:')) html = this._rnBadgeSheet(head, Number(this._info.slice(8)));
    else if (this._info === 'lights') {
      const rooms = ROOMS.filter(r => (r.lights || []).some(l => this.s(l)));
      const all = rooms.flatMap(r => r.lights.filter(l => this.s(l))), on = all.filter(l => this.v(l) === 'on').length;
      html = head('mdi:lightbulb-group', tr("Lights"), `${on} of ${all.length} on · tap to switch`) + rooms.map(r => {
        const rows = r.lights.filter(l => this.s(l)).map(l => {
          const st = this.s(l), isOn = st.state === 'on', fx = r.lightFx?.[l];
          const lv = isOn && st.attributes.brightness ? Math.round(st.attributes.brightness / 2.55) + '%' : isOn ? tr('On') : st.state === 'off' ? tr("Off") : pretty(st.state);
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
        + row(P.wifi, 'mdi:wifi', 'Wi-Fi', this.ok(P.wifi) && this.v(P.wifi) !== '<not connected>' ? this.v(P.wifi) : tr("Not connected"))
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
      const out = w ? `<div class="dsec">${tr("Outside")}</div><div class="mrow trow" data-act="info" data-kind="weather" data-id="${E.weather}">${ic(WEATHER_ICON[w.state] || 'mdi:weather-partly-cloudy')}<span>${esc(wxName(w.state))}</span>${w.attributes.humidity != null ? `<em>${Math.round(w.attributes.humidity)}%</em>` : ''}${isFinite(parseFloat(w.attributes.temperature)) ? `<b style="color:${rgb(tempRGB(Number(w.attributes.temperature)))}">${Number(w.attributes.temperature).toFixed(1)}°</b>` : '<b>—</b>'}</div>` : '';
      html = head('mdi:home-thermometer', tr("Temperatures"), avg != null ? `Average ${avg.toFixed(1)}° · ${Math.min(...inside).toFixed(1)}° – ${Math.max(...inside).toFixed(1)}°` : tr("No readings"))
        + `<div class="dsec">${tr("Rooms")}</div>${rows}${out}`;
    }
    if (box._html === html) return; box._html = html;
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    if (!box.firstChild) box.replaceChildren(tpl.content); else morph(box, tpl.content, /^(rename|rnbadge):/.test(this._info) ? this._dragging : null); // keeps the name being typed
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
    const P = PICK[kind]; const opts = P.list(st) || []; if (!opts.length) return ''; label = tr(label) !== label ? tr(label) : tr(tc(label));
    return `<button class="pick" data-act="pick" data-id="${id}" data-kind="${kind}">${icon ? ic(icon) : ''}<span>${esc(label)}</span><b>${bidi(esc(pretty(P.cur(st))))}</b>${ic('mdi:chevron-down', 'chev')}</button>`;
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
  // the label that shows the slider's % while it moves; ownLabel false: the row above already shows it (a room's lights),
  // and that label (id: sliderLabel(id, kind)) is the one kept up to date
  sliderLabel(id, kind) { return `sl-${kind}-${id.replace(/\W/g, '_')}`; }
  slider(id, kind, pct, color, ownLabel = true) {
    const lid = this.sliderLabel(id, kind);
    return `<div class="slrow">${ic(kind === 'vol' ? 'mdi:volume-high' : 'mdi:brightness-6')}<input type="range" class="sl" min="1" max="100" value="${pct}" style="--p:${pct}%;--c:${color}"
      data-${kind === 'vol' ? 'vol' : 'bright'}="${id}" data-lbl="${lid}" aria-label="${kind === 'vol' ? tr("Volume") : tr("Brightness")}">${ownLabel ? `<em id="${lid}">${pct}%</em>` : ''}</div>`;
  }

  _update() {
    const h = this._hass; if (!h) return;
    // a change to an entity Needs Attention watches: redraw it (and the tab counter) on the next clock tick
    const ad = this._alDeps; if (ad) { const p = this._alPrev; let ch = !p || p.length !== ad.length; for (let i = 0; !ch && i < ad.length; i++) ch = h.states[ad[i]] !== p[i];
      if (ch) { this._alPrev = ad.map(id => h.states[id]); if (p) this._alDirty = true; } }
    { const n = Object.keys(h.states).length; if (n !== this._alN) { if (this._alN != null) this._alDirty = true; this._alN = n; } } // an entity added or removed
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
      const fwd = isRTL() ? dx > 0 : dx < 0; // right to left: the next tab is to the left, reached with a swipe to the right
      const ids = this._tabList().map(t => t[0]), i = ids.indexOf(this._tab || 'home'), j = i + (fwd ? 1 : -1);
      if (j < 0 || j >= ids.length) return;
      this._setTab(ids[j], fwd ? 'next' : 'prev');
    }, { passive: true });
    el.addEventListener('touchcancel', e => { g = null; this._touchDown = e.touches.length > 0; });
  }
  _rerender(...ids) { for (const s of this._sections) if (!ids.length || ids.includes(s.el.id)) s.force = true; this._update(); }

  _tick() {
    if (this._tab === 'water') this.shadowRoot?.querySelectorAll('.ptime[data-since]').forEach(el => { const t = pumpTime(Date.now() - Number(el.dataset.since)); if (el.textContent !== t) el.textContent = t; });
    if (!this.$) return;
    const d = new Date();
    const lang = this._hass?.locale?.language || 'en';
    const put = (id, txt) => { const el = this.$(id); if (el && el.textContent !== txt) el.textContent = txt; };
    put('time', d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }));
    put('date', d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }));
    const hr = d.getHours();
    const g = tr(hr < 5 ? tr("Good night") : hr < 12 ? tr("Good morning") : hr < 17 ? tr("Good afternoon") : tr("Good evening"));
    put('greet', this.name() ? tr('{0}, {1}', g, this.name()) : g);
    // Needs Attention and the System tab's counter: redrawn within a second of a change to an entity they watch (an update's
    // progress, a battery, a device going offline…: _update marks it), at most once a second; and every 30 s (repairs, times)
    if (d.getSeconds() % 30 === 0 || this._alDirty) { this._alDirty = false; this._alertCount = null; this._rerender('alerts', 'tabs'); }
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
      case 'roomclose': if (e.target !== t) return; this._select(null); break; // a tap beside the room pop-up
      case 'furn': if (performance.now() - (this._cvTap || 0) < 600) break; this._selectFurn(Number(t.dataset.idx)); break;
      case 'run': this.call('homeassistant', 'turn_on', { entity_id: id }); this._toast(tr(id.startsWith('scene.') ? tr("Scene activated") : tr("Script started"))); break;
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
        if (svc === 'alarm_disarm' && st?.state === 'disarmed') { this._toast(tr("The alarm is already off")); return; }
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
      case 'relay': if (!this._armConfirm(t, id, id === E.gate.relay ? tr("Tap again to open the gate") : tr("Tap again to open"))) return; this.call('switch', 'turn_on', { entity_id: id }); this._toast(id === E.gate.relay ? tr("Opening the gate") : tr("Opening")); break;
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
      case 'pump': { // water pumps: a second tap to start (unless set to one press), one tap to stop; double tap / long press still open more-info
        const on = this.on(id), confirm = E.water.pumps.find(p => p.id === id)?.confirm !== false;
        if (!on && confirm && !this._armConfirm(t, id, 'Tap again to start')) return;
        this.call('switch', on ? 'turn_off' : 'turn_on', { entity_id: id }); break;
      }
      case 'valve': { // irrigation zones need a second tap, like the locks
        const on = this.on(id);
        if (!this._armConfirm(t, id, on ? tr("Tap again to stop") : tr("Tap again to water"))) return;
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
      case 'jfqc': this._jfQcDone = true; break;
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
      case 'alexp': { const k = t.dataset.k; this._alOpen.has(k) ? this._alOpen.delete(k) : this._alOpen.add(k); this._rerender('alerts'); break; }
      case 'repairs': history.pushState(null, '', '/config/repairs'); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); break;
      case 'harestart': if (!this._armConfirm(t, id, 'Tap again to restart Home Assistant')) return; this.call('homeassistant', 'restart', {}); this._toast(tr("Restarting Home Assistant…")); break;
      case 'install': if (!this._armConfirm(t, id, 'Tap again to update')) return; this.call('update', 'install', { entity_id: id }); this._toast(tr("Update started")); setTimeout(() => this._rerender('alerts'), 3000); break;
      case 'reboot': if (!this._armConfirm(t, id, 'Tap again to reboot')) return; this.call('button', 'press', { entity_id: id }); this._toast(tr("Reboot sent")); (this._rbAt ||= {})[id] = Date.now(); setTimeout(() => { if (this._info) this._renderInfo(); this._rerender('alerts'); }, 20e3); if (this._info) this._renderInfo(); this._rerender('alerts'); break;
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
      case 'labnode': this._labNode = t.dataset.node === E.lab.node ? null : t.dataset.node; this._rerender('lab'); break; // Home Lab: another Proxmox node
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
      if ((a === 'lock' && this.v(t.dataset.id) !== 'locked') || (a === 'pump' && (this.on(t.dataset.id) || E.water.pumps.find(p => p.id === t.dataset.id)?.confirm === false))) this.haptic('light');
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
    el.classList.add('confirm'); el.dataset.tip = tr(msg);
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
    if (L.length < 2 || this._focus) { el.innerHTML = ''; el.style.display = 'none'; return; } // one room: no floor buttons
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
    const name = kind === 'floor' ? (() => { const l = (MODEL.levels || []).find(x => String(x.level) === String(v)); return l ? (l.name.startsWith('Floor ') ? tr('Floor {0}', l.level) : tr(l.name)) : v; })() : tr(v === 'top' ? tr("Floor plan") : '3D view');
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
    if (this._solo) this._roomPop(!!id);
    this._three?.select(id);
    this._rerender('drawer');
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
    if (!piece) { undo(); this._toast(tr("Could not find this piece in the configuration"), true); return; }
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
          if (o.type === `custom:${this.constructor.TYPE}` && JSON.stringify(o) === mine) { hits++; return JSON.parse(JSON.stringify(cfg)); }
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
  // take the 3D view handed over by the card this one replaces (the editor's preview): see SHARED
  _adoptShared() {
    const S = SHARED, vp = this.$('viewport'); if (!S || !vp || !this.shadowRoot.contains(vp)) return false;
    if (S.owner?.constructor !== this.constructor) return false; // the full card and Sweet Home 3D keep their room popup in different places
    clearTimeout(S.timer); setShared(null);
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
    catch (e) { console.warn('sweet-home: 3D view', e); this.$('loading').innerHTML = `<span>${tr("The 3D view needs WebGL, which this browser could not start. The other tabs work as usual.")}</span>`; return; }
    this._three = scene; scene._key = this._houseJSON; // the house it shows
    scene._focusWas = this._focus;
    const V = this._view; this._view = null;
    if (V) { for (const k of ['orbit', 'goal']) { Object.assign(scene[k], { theta: V[k].theta, phi: V[k].phi, radius: V[k].radius }); scene[k].target.copy(V[k].target); } scene.vmode = V.vmode; scene._dirty = true; }
    if (V && this._focus) scene._goFocus(true); // zoomed on one room: framed again after the house changed
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

// the panels and tools, kept in src/panels/: their methods become the card's own
for (const P of [MediaPanels, EnergyPanels, SecurityPanels, SystemPanels, WaterPanels, RenameTools, HomePanels])
  for (const k of Object.getOwnPropertyNames(P.prototype)) if (k !== 'constructor') Object.defineProperty(SweetHomeCard.prototype, k, Object.getOwnPropertyDescriptor(P.prototype, k));

// every method of the card and the scene works on its own instance's model (several cards / the editor preview)
for (const [cls, own] of [[SweetHomeCard, o => o._model], [HouseScene, o => o.card?._model]]) {
  for (const k of Object.getOwnPropertyNames(cls.prototype)) {
    const d = Object.getOwnPropertyDescriptor(cls.prototype, k);
    if (k === 'constructor' || typeof d.value !== 'function') continue;
    const f = d.value;
    cls.prototype[k] = function (...a) { const m = own(this); if (m && MODEL !== m) useModel(m); return f.apply(this, a); };
  }
}
// Sweet Home 3D: the same card with only its 3D view (no tabs or panels), to sit among other cards on a dashboard.
// Tapping a room opens its controls as a pop-up. Built from the same `house` settings as the full card.
export class SweetHome3DCard extends SweetHomeCard {
  static TYPE = 'sweet-home-3d-card';
  static SOLO = true;
  static getStubConfig() { return {}; }
  static async getConfigElement() { await loadEditor(); const e = document.createElement('sweet-home-card-editor'); e.solo = true; return e; }
  getCardSize() { const h = parseInt(this._config?.height, 10); return Math.max(4, Math.round((h || 480) / 50)); }
  getGridOptions() { return { columns: 12, rows: 8, min_columns: 4, min_rows: 4 }; }
  // Home Assistant sets layout "grid" on cards in a sections view: the 3D view then fills the size picked there
  set layout(v) { this._layout = v; if (v) this.setAttribute('layout', v); else this.removeAttribute('layout'); }
  get layout() { return this._layout; }
}
if (!customElements.get('sweet-home-card')) customElements.define('sweet-home-card', SweetHomeCard);
if (!customElements.get('sweet-home-3d-card')) customElements.define('sweet-home-3d-card', SweetHome3DCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'sweet-home-card')) window.customCards.push({ type: 'sweet-home-card', name: 'Sweet Home', description: 'Your home as an interactive 3D model, with tabs for security, climate, energy, media and more', preview: true, documentationURL: 'https://github.com/mousawm/sweet-home' });
if (!window.customCards.find(c => c.type === 'sweet-home-3d-card')) window.customCards.push({ type: 'sweet-home-3d-card', name: 'Sweet Home 3D', description: 'Only the 3D view of your home, to place among your other cards. Tap a room for its controls.', preview: true, documentationURL: 'https://github.com/mousawm/sweet-home' });
console.info(`%c SWEET HOME %c v${VERSION} `, 'background:#2dd4bf;color:#04342c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#1e293b;color:#e2e8f0;border-radius:0 4px 4px 0;padding:2px 6px');
