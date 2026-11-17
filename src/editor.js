/*
 * Sweet Home — visual card editor.
 * Steps: Rooms (areas + a drawing grid for the floor plan) → Panels → Look. Everything it writes is plain YAML, so
 * anything the editor doesn't cover can still be added in the code editor and is kept untouched.
 */
const STEPS = [['rooms', 'Rooms', 'mdi:floor-plan'], ['panels', 'Panels', 'mdi:view-dashboard-outline'], ['look', 'Look', 'mdi:palette-outline']];
const PANELS = [
  ['security', 'Security', 'Alarm, locks, doors and cameras'],
  ['climate', 'Climate', 'Air conditioners, temperatures'],
  ['energy', 'Energy', 'Live power, history (from HA’s Energy settings)'],
  ['water', 'Water', 'Tank and pumps'],
  ['irrigation', 'Irrigation', 'Valves and schedule'],
  ['media', 'Media', 'TV, speakers'],
  ['media_server', 'Media Server', 'Jellyfin, Sonarr, Radarr, qBittorrent'],
  ['homelab', 'Home Lab', 'Proxmox VE node and guests'],
  ['attention', 'Needs Attention', 'Unavailable devices, low batteries, repairs, updates'],
];
const clone = o => JSON.parse(JSON.stringify(o || {}));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#2dd4bf', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#fb923c', '#f87171', '#38bdf8', '#c084fc'];

class SweetHomeCardEditor extends HTMLElement {
  constructor() { super(); this._step = 'rooms'; this._sel = 0; this._grid = 0.5; }
  setConfig(config) { this._config = clone(config); this._render(); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first) this._render(); else this.querySelectorAll('ha-form').forEach(f => { f.hass = h; }); }

  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: clone(this._config) }, bubbles: true, composed: true }));
  }
  get _rooms() { this._config.house = this._config.house || {}; this._config.house.rooms = this._config.house.rooms || []; return this._config.house.rooms; }

  _form(schema, data, onChange, labels = {}) {
    const f = document.createElement('ha-form');
    f.hass = this._hass; f.data = data; f.schema = schema;
    f.computeLabel = s => labels[s.name] || s.label || s.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    f.addEventListener('value-changed', e => { e.stopPropagation(); onChange(e.detail.value); });
    return f;
  }

  _render() {
    if (!this._config || !this._hass) return;
    this.innerHTML = `<style>
      .sh-ed{display:flex;flex-direction:column;gap:14px}
      .sh-steps{display:flex;gap:6px;flex-wrap:wrap}
      .sh-steps button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;border-radius:10px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;cursor:pointer}
      .sh-steps button.on{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .sh-steps ha-icon{--mdc-icon-size:18px}
      .sh-hint{font-size:13px;color:var(--secondary-text-color);line-height:1.45}
      .sh-rooms{display:flex;flex-wrap:wrap;gap:6px}
      .sh-rooms button{padding:6px 10px;border-radius:999px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px}
      .sh-rooms button.on{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color) inset}
      .sh-rooms i{width:10px;height:10px;border-radius:3px;display:inline-block}
      .sh-plan{width:100%;touch-action:none;background:var(--secondary-background-color);border-radius:12px;cursor:crosshair;user-select:none}
      .sh-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sh-row button,.sh-btn{padding:7px 12px;border-radius:8px;border:1px solid var(--divider-color);background:none;color:var(--primary-text-color);font:inherit;font-size:13px;cursor:pointer}
      .sh-btn.del{color:var(--error-color)}
      .sh-panel{border:1px solid var(--divider-color);border-radius:12px;padding:10px 12px}
      .sh-panel summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center;list-style:none}
      .sh-panel summary small{color:var(--secondary-text-color)}
      .sh-panel[open] summary{margin-bottom:8px}
    </style>
    <div class="sh-ed">
      <div class="sh-steps">${STEPS.map(([k, n, i]) => `<button data-step="${k}" class="${this._step === k ? 'on' : ''}"><ha-icon icon="${i}"></ha-icon>${n}</button>`).join('')}</div>
      <div class="sh-body"></div>
    </div>`;
    this.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { this._step = b.dataset.step; this._render(); }));
    const body = this.querySelector('.sh-body');
    ({ rooms: () => this._rRooms(body), panels: () => this._rPanels(body), look: () => this._rLook(body) })[this._step]();
  }

  /* ---------------- rooms + floor plan drawing ---------------- */
  _rRooms(body) {
    const rooms = this._rooms;
    body.innerHTML = `<div class="sh-ed">
      <div class="sh-hint">${rooms.length ? 'Pick a room, then drag on the grid to draw it (one square = ' + this._grid + ' m). Drag again to add another rectangle to the same room (L-shapes). Its lights, sensors, doors and climate come from the linked Home Assistant area.' : 'No rooms yet: the card builds a simple house from your Home Assistant areas. Add rooms to draw your real floor plan.'}</div>
      <div class="sh-rooms">${rooms.map((r, i) => `<button data-room="${i}" class="${i === this._sel ? 'on' : ''}"><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(r.name || this._hass.areas?.[r.area]?.name || 'Room ' + (i + 1))}</button>`).join('')}
        <button data-add>+ Add room</button>${rooms.length ? '' : '<button data-import>Add all my areas</button>'}</div>
      ${rooms.length ? '<svg class="sh-plan"></svg>' : ''}
      <div class="sh-room"></div>
    </div>`;
    body.querySelector('[data-add]').addEventListener('click', () => { rooms.push({ name: `Room ${rooms.length + 1}`, rects: [] }); this._sel = rooms.length - 1; this._emit(); this._render(); });
    body.querySelector('[data-import]')?.addEventListener('click', () => {
      const areas = Object.values(this._hass.areas || {});
      areas.forEach((a, i) => rooms.push({ area: a.area_id, rects: [[(i % 3) * 4, Math.floor(i / 3) * 4, (i % 3) * 4 + 4, Math.floor(i / 3) * 4 + 4]] }));
      this._sel = 0; this._emit(); this._render();
    });
    body.querySelectorAll('[data-room]').forEach(b => b.addEventListener('click', () => { this._sel = +b.dataset.room; this._render(); }));
    if (!rooms.length) return;
    if (this._sel >= rooms.length) this._sel = 0;
    this._plan(body.querySelector('.sh-plan'));
    const r = rooms[this._sel], box = body.querySelector('.sh-room');
    const data = { name: r.name || '', area: r.area || '', icon: r.icon || '', floor: r.floor || '', outdoor: !!r.outdoor };
    box.appendChild(this._form([
      { name: 'area', selector: { area: {} } },
      { name: 'name', selector: { text: {} } },
      { type: 'grid', name: '', schema: [
        { name: 'icon', selector: { icon: {} } },
        { name: 'floor', selector: { select: { mode: 'dropdown', options: [['', 'Automatic'], ['wood', 'Wood'], ['tile', 'Tiles'], ['marble', 'Marble'], ['carpet', 'Carpet'], ['grass', 'Grass']].map(([value, label]) => ({ value, label })) } } },
      ] },
      { name: 'outdoor', selector: { boolean: {} } },
    ], data, v => {
      for (const k of ['name', 'area', 'icon', 'floor']) { if (v[k]) r[k] = v[k]; else delete r[k]; }
      if (v.outdoor) r.outdoor = true; else delete r.outdoor;
      this._emit();
      const chip = this.querySelector(`[data-room="${this._sel}"]`); if (chip) chip.lastChild.textContent = r.name || this._hass.areas?.[r.area]?.name || 'Room';
    }, { area: 'Home Assistant area (devices are found automatically)', outdoor: 'Outdoor (balcony, garden: no ceiling lights, glass railing)' }));
    const row = document.createElement('div'); row.className = 'sh-row'; row.style.marginTop = '10px';
    row.innerHTML = `<span class="sh-hint">${(r.rects || []).length} rectangle(s)</span><button data-undo>Remove last rectangle</button><button class="sh-btn del" data-del>Delete room</button>
      <span style="flex:1"></span><span class="sh-hint">Grid</span><button data-grid>${this._grid} m</button>`;
    box.appendChild(row);
    row.querySelector('[data-undo]').addEventListener('click', () => { (r.rects || []).pop(); this._emit(); this._render(); });
    row.querySelector('[data-del]').addEventListener('click', () => { rooms.splice(this._sel, 1); this._sel = 0; this._emit(); this._render(); });
    row.querySelector('[data-grid]').addEventListener('click', () => { this._grid = this._grid === 0.5 ? 0.25 : this._grid === 0.25 ? 1 : 0.5; this._render(); });
  }

  _plan(svg) {
    const rooms = this._rooms, all = rooms.flatMap(r => r.rects || []);
    const maxX = Math.max(12, ...all.map(q => Math.max(q[0], q[2])) ) + 2, maxZ = Math.max(9, ...all.map(q => Math.max(q[1], q[3]))) + 2;
    const s = 40, g = this._grid;
    svg.setAttribute('viewBox', `0 0 ${maxX * s} ${maxZ * s}`);
    let h = '';
    for (let x = 0; x <= maxX + 1e-6; x += g) h += `<line x1="${x * s}" y1="0" x2="${x * s}" y2="${maxZ * s}" stroke="var(--divider-color)" stroke-width="${Math.abs(x - Math.round(x)) < 1e-6 ? 1.2 : 0.4}"/>`;
    for (let z = 0; z <= maxZ + 1e-6; z += g) h += `<line x1="0" y1="${z * s}" x2="${maxX * s}" y2="${z * s}" stroke="var(--divider-color)" stroke-width="${Math.abs(z - Math.round(z)) < 1e-6 ? 1.2 : 0.4}"/>`;
    rooms.forEach((r, i) => (r.rects || []).forEach(([x1, z1, x2, z2]) => {
      const c = COLORS[i % COLORS.length], on = i === this._sel;
      h += `<rect x="${Math.min(x1, x2) * s}" y="${Math.min(z1, z2) * s}" width="${Math.abs(x2 - x1) * s}" height="${Math.abs(z2 - z1) * s}" fill="${c}" fill-opacity="${on ? 0.45 : 0.2}" stroke="${c}" stroke-width="${on ? 3 : 1.5}"/>`;
    }));
    rooms.forEach((r, i) => { const q = (r.rects || [])[0]; if (q) h += `<text x="${(q[0] + q[2]) / 2 * s}" y="${(q[1] + q[3]) / 2 * s}" text-anchor="middle" dominant-baseline="middle" font-size="${s * 0.42}" fill="var(--primary-text-color)">${esc(r.name || this._hass.areas?.[r.area]?.name || '')}</text>`; });
    h += '<rect class="sh-draw" fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-dasharray="8 6" width="0" height="0"/>';
    svg.innerHTML = h;
    const pt = e => { const b = svg.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width * maxX, z = (e.clientY - b.top) / b.height * maxZ; return [Math.round(x / g) * g, Math.round(z / g) * g]; };
    const draw = svg.querySelector('.sh-draw');
    let a = null, b = null;
    const show = () => { if (!a || !b) return; draw.setAttribute('x', Math.min(a[0], b[0]) * s); draw.setAttribute('y', Math.min(a[1], b[1]) * s); draw.setAttribute('width', Math.abs(b[0] - a[0]) * s); draw.setAttribute('height', Math.abs(b[1] - a[1]) * s); };
    svg.addEventListener('pointerdown', e => { a = pt(e); b = a; svg.setPointerCapture(e.pointerId); show(); });
    svg.addEventListener('pointermove', e => { if (a) { b = pt(e); show(); } });
    svg.addEventListener('pointerup', () => {
      if (a && b && Math.abs(b[0] - a[0]) >= g && Math.abs(b[1] - a[1]) >= g) {
        const r = rooms[this._sel]; r.rects = r.rects || [];
        const f = v => +v.toFixed(2);
        r.rects.push([f(Math.min(a[0], b[0])), f(Math.min(a[1], b[1])), f(Math.max(a[0], b[0])), f(Math.max(a[1], b[1]))]);
        this._emit(); this._render();
      }
      a = b = null;
    });
  }

  /* ---------------- panels ---------------- */
  _rPanels(body) {
    const P = this._config.panels = this._config.panels || {};
    body.innerHTML = `<div class="sh-ed"><div class="sh-hint">Panels show up when Home Assistant has something for them (found by integration and device class). Switch off what you don't want, or pick the entities yourself.</div><div class="sh-pl sh-ed"></div></div>`;
    const list = body.querySelector('.sh-pl');
    const set = (k, v) => { if (v === undefined || (typeof v === 'object' && !Object.keys(v).length)) delete P[k]; else P[k] = v; if (!Object.keys(P).length) delete this._config.panels; this._emit(); };
    const schemas = {
      security: [{ name: 'alarm', selector: { entity: { domain: 'alarm_control_panel' } } }, { name: 'locks', selector: { entity: { domain: 'lock', multiple: true } } }, { name: 'doors', selector: { entity: { domain: 'binary_sensor', device_class: ['door', 'garage_door'], multiple: true } } }, { name: 'cameras', selector: { entity: { domain: 'camera', multiple: true } } }],
      climate: [{ name: 'entities', selector: { entity: { domain: 'climate', multiple: true } } }],
      energy: [{ name: 'grid_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'solar_power', selector: { entity: { domain: 'sensor', device_class: 'power' } } }, { name: 'month_sensor', selector: { entity: { domain: 'sensor' } } }, { name: 'year_sensor', selector: { entity: { domain: 'sensor' } } }],
      water: [{ name: 'tank', selector: { entity: { domain: 'sensor' } } }, { name: 'quality', selector: { entity: { domain: 'sensor' } } }, { name: 'temperature', selector: { entity: { domain: 'sensor' } } }],
      irrigation: [{ name: 'interval', selector: { entity: { domain: ['select', 'input_select'] } } }, { name: 'weekday', selector: { entity: { domain: ['select', 'input_select'] } } }, { name: 'tomorrow', selector: { entity: { domain: ['input_boolean', 'switch'] } } }, { name: 'next', selector: { entity: {} } }],
      media: [{ name: 'player', selector: { entity: { domain: 'media_player' } } }, { name: 'speakers', selector: { entity: { domain: 'media_player', multiple: true } } }],
      media_server: [],
      homelab: [{ name: 'temperature', selector: { entity: { domain: 'sensor', device_class: 'temperature' } } }],
      attention: [{ name: 'battery_threshold', selector: { number: { min: 1, max: 50, unit_of_measurement: '%', mode: 'slider' } } }, { name: 'wifi_threshold', selector: { number: { min: -95, max: -50, unit_of_measurement: 'dBm', mode: 'slider' } } }, { name: 'tunnels', selector: { boolean: {} } }],
    };
    for (const [k, n, d] of PANELS) {
      const det = document.createElement('details'); det.className = 'sh-panel';
      const on = P[k] !== false;
      det.innerHTML = `<summary><span><b>${n}</b><br><small>${d}</small></span></summary>`;
      const sw = document.createElement('ha-switch'); sw.checked = on;
      sw.addEventListener('click', e => e.stopPropagation());
      sw.addEventListener('change', () => { set(k, sw.checked ? undefined : false); this._render(); });
      det.querySelector('summary').appendChild(sw);
      if (on && schemas[k].length) {
        const data = typeof P[k] === 'object' ? P[k] : {};
        det.appendChild(this._form(schemas[k], data, v => { const o = {}; for (const [kk, vv] of Object.entries(v)) if (vv !== '' && vv != null && !(Array.isArray(vv) && !vv.length)) o[kk] = vv; set(k, { ...(typeof P[k] === 'object' ? P[k] : {}), ...o }); }));
      } else if (on) det.insertAdjacentHTML('beforeend', '<div class="sh-hint">Found automatically from the integrations.</div>');
      list.appendChild(det);
    }
  }

  /* ---------------- look ---------------- */
  _rLook(body) {
    const C = this._config, H = C.house = C.house || {};
    const data = { title: C.title || '', weather: C.weather || '', start_tab: C.start_tab || 'home', type: H.type === 'gltf' ? 'gltf' : 'floorplan', url: H.url || '', wall_height: H.wall_height ?? 1.35, auto_furniture: !!H.auto_furniture };
    body.innerHTML = '';
    body.appendChild(this._form([
      { name: 'title', selector: { text: {} } },
      { name: 'weather', selector: { entity: { domain: 'weather' } } },
      { name: 'start_tab', selector: { select: { mode: 'dropdown', options: ['home', 'security', 'climate', 'energy', 'water', 'media', 'system'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) } } },
      { name: 'type', selector: { select: { mode: 'list', options: [{ value: 'floorplan', label: 'Drawn floor plan (rooms)' }, { value: 'gltf', label: '3D file (.glb) from /config/www' }] } } },
      ...(data.type === 'gltf' ? [{ name: 'url', selector: { text: {} } }] : [{ name: 'wall_height', selector: { number: { min: 0.4, max: 3, step: 0.05, unit_of_measurement: 'm', mode: 'slider' } } }, { name: 'auto_furniture', selector: { boolean: {} } }]),
    ], data, v => {
      for (const k of ['title', 'weather']) { if (v[k]) C[k] = v[k]; else delete C[k]; }
      if (v.start_tab && v.start_tab !== 'home') C.start_tab = v.start_tab; else delete C.start_tab;
      const was = H.type;
      if (v.type === 'gltf') { H.type = 'gltf'; if (v.url) H.url = v.url; else delete H.url; } else { delete H.type; delete H.url; }
      if (v.wall_height != null && v.wall_height !== 1.35) H.wall_height = v.wall_height; else delete H.wall_height;
      if (v.auto_furniture) H.auto_furniture = true; else delete H.auto_furniture;
      if (!Object.keys(H).length) delete C.house;
      this._emit();
      if (was !== H.type) this._render();
    }, { url: '3D file URL (e.g. /local/home.glb)', wall_height: 'Wall height', auto_furniture: 'Add furniture automatically (bedrooms, kitchen, living room…)' }));
  }
}
if (!customElements.get('sweet-home-card-editor')) customElements.define('sweet-home-card-editor', SweetHomeCardEditor);
