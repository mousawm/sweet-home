// Sweet Home — Renaming devices and badges (this dashboard only).
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { arr } from '../model.js';
import { t as tr } from '../i18n.js';
import { E, BADGES, esc, ic, NAMED_DOMAINS, SMART, nameIcon, domIcon } from '../core.js';

export class RenameTools {
  // Rename view of the room popup (admins): every entity of the room with its name in a text field. A new name is saved
  // in Home Assistant itself (entity registry), so it changes everywhere; an empty field goes back to the default name.
  // Rename view of the room popup (edit mode): every entity of the room with its name in a text field. Names are for
  // this dashboard only (room `names`, or the card's `names` for the house built from areas); Home Assistant is not
  // changed. They are saved together with ✓ (Done); an empty field goes back to the entity's own name.
  // every entity of a room that its rename view lists (none: the room popup gets no pencil)
  _roomRnIds(r) {
    return [...new Set([...(r.lights || []), r.climate, r.temp, r.hum, ...(r.motion || []), ...(r.doors || []), ...(r.locks || []), ...(r.plugs || []).map(p => p.id), r.fan, r.media, ...(r.entities || []).map(e => e.id), ...(r.furnEnts || [])].filter(id => id && this.s(id)))];
  }
  _rRename(r) {
    const ids = this._roomRnIds(r);
    const raw = this._hass._raw || this._hass, pend = this._pendNames || {};
    const rows = ids.map(id => {
      const st = this.s(id), d = id.split('.')[0], own = raw.states[id]?.attributes.friendly_name || id;
      const cur = pend[id] ?? st.attributes.friendly_name ?? id;
      return `<label class="rnrow">${ic((SMART && NAMED_DOMAINS.concat('scene').includes(d) && nameIcon(id, cur)) || st.attributes.icon || domIcon(d, st.state, st.attributes))}<input data-rename="${id}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', id))}" enterkeyhint="done"><small>${esc(id)}</small></label>`;
    }).join('');
    return `<div class="dh">${ic('mdi:pencil-outline')}<h3>${tr('Rename · {0}', esc(r.name))}</h3><button class="ibtn on" data-act="names" title="${tr('Done')}" aria-label="${tr('Done')}">${ic('mdi:check')}</button></div>
      <div class="sub" style="margin-bottom:10px;font-size:12px;color:var(--mu)">${tr('Names change on this dashboard only. Clear a name to go back to the default.')}</div>
      ${rows || `<div class="empty">${ic('mdi:information-outline')} ${tr('Nothing to rename here.')}</div>`}`;
  }
  // Rename sheet of a panel (edit mode): every entity the panel shows, with its name in a text field. Like the room
  // popup: names are for this dashboard only, saved together with Done; an empty field goes back to the entity's own name.
  _rnSheet(head, sid) {
    const el = this.$(sid), title = (this._rnIds?.sid === sid && this._rnIds.title) || el?.querySelector('.ch h3')?.textContent?.trim() || tr('Panel');
    if (!this._rnIds || this._rnIds.sid !== sid) { // the entities on the panel when renaming started (the list stays put)
      this._rnIds = { sid, ids: this._rnPanelIds(sid, el) };
    }
    const raw = this._hass._raw || this._hass, pend = this._pendNames || {};
    const rows = this._rnIds.ids.map(id => {
      const st = this.s(id), d = id.split('.')[0], dv = sid === 'devices' ? E.devices.find(x => x.bat === id) : null;
      const own = dv ? this._devDefaultName(id) : raw.states[id]?.attributes.friendly_name || id;
      const cur = pend[id] ?? (sid === 'modes' ? E.modes.find(m => m[0] === id)?.[1] : null) ?? dv?.name ?? st.attributes.friendly_name ?? id;
      return `<label class="rnrow">${ic(dv?.icon || (SMART && NAMED_DOMAINS.concat('scene').includes(d) && nameIcon(id, cur)) || st.attributes.icon || domIcon(d, st.state, st.attributes))}<input data-rename="${id}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', id))}" enterkeyhint="done"><small>${esc(id)}</small></label>`;
    }).join('');
    return head('mdi:pencil-outline', tr('Rename · {0}', title), tr('Names change on this dashboard only. Clear a name to go back to the default.'))
      + (rows ? `${rows}<button class="lrow on rnsave" data-act="rnsave">${ic('mdi:check')}<span>${tr('Done')}</span></button>` : `<div class="empty">${ic('mdi:information-outline')} ${tr('Nothing to rename here.')}</div>`);
  }
  // What a panel's rename sheet lists — also whether the panel gets its pencil at all (none when this is empty).
  // `root`: the panel's element, or its freshly rendered HTML as a fragment. Only entities whose name can be seen on the
  // panel (a temperature shown under its room's name is renamed in the room).
  _rnPanelIds(sid, root) {
    if (sid === 'modes') return E.modes.map(m => m[0]).filter(id => this.s(id));
    if (sid === 'devices') return E.devices.filter(d => this.s(d.bat)).map(d => d.bat); // a device row shows its device's name: renamed on its battery sensor
    const text = (root?.textContent || '').toLowerCase(), seen = id => { const n = String(this.s(id).attributes.friendly_name || id).toLowerCase(); return text.includes(n) || text.includes(n.replace(/^shelly\s*/, '')); };
    return [...new Set([...(root?.querySelectorAll('[data-id],[data-id2]') || [])].flatMap(n => [n.dataset.id, n.dataset.id2]).filter(id => id && id.includes('.') && this.s(id) && seen(id)))];
  }
  // Rename sheet of a lock badge (edit mode, pencil on its label in 3D): the name shown above the badge
  _rnBadgeSheet(head, i) {
    const b = BADGES.find(x => x.i === i); if (!b) return head('mdi:lock', tr('Lock badge'), '');
    const own = this.s(b.lock)?.attributes.friendly_name || b.lock, cur = this._pendNames?.['badge:' + i] ?? b.name ?? own;
    return head('mdi:pencil-outline', tr('Rename · {0}', tr('Lock badge')), tr('The name above the badge in the 3D view, on this dashboard only. Clear it to show the lock’s name.'))
      + `<label class="rnrow">${ic('mdi:lock')}<input data-rename="badge:${i}" value="${esc(cur)}" placeholder="${esc(own)}" aria-label="${esc(tr('Name of {0}', b.lock))}" enterkeyhint="done"><small>${esc(b.lock)}</small></label>
      <button class="lrow on rnsave" data-act="rnbsave" data-i="${i}">${ic('mdi:check')}<span>${tr('Done')}</span></button>`;
  }
  async _saveBadgeName(i, v) {
    const cfg = JSON.parse(JSON.stringify(this._config || {})), b = cfg.house?.lock_badges?.[i]; if (!b) return;
    const own = (this._hass._raw || this._hass).states[b.lock || b.entity]?.attributes.friendly_name;
    if (!v || v === own) delete b.name; else b.name = v;
    if (JSON.stringify(cfg) === JSON.stringify(this._config)) return;
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Names saved')); }
  }
  // the name a Devices row has without a name given on this dashboard (same rule as the model's batDevice)
  _devDefaultName(id) {
    const h = this._hass, raw = h._raw || h, dev = h.devices?.[h.entities?.[id]?.device_id];
    return dev?.name_by_user || dev?.name || String(raw.states[id]?.attributes.friendly_name || id).replace(/\s*battery( level)?$/i, '');
  }
  // a name typed in a rename view: kept until ✓ (Done)
  _rename(id, name) { (this._pendNames ||= {})[id] = name.trim(); }
  // Names for this dashboard: each one is kept in one place only — the room it was renamed in (`ci`), else where it
  // already was, else the card's own `names` — so the same entity shows the same name on every panel.
  _storeNames(cfg, pend, ci) {
    const raw = this._hass._raw || this._hass, rooms = cfg.house?.rooms || [], holders = [cfg, ...rooms].filter(Boolean);
    for (const [id, v] of Object.entries(pend)) {
      const home = (ci != null && rooms[ci]) || holders.find(h => h.names?.[id] != null) || cfg;
      for (const h of holders) for (const k of ['names', 'light_names']) if (h[k]?.[id] != null) { delete h[k][id]; if (!Object.keys(h[k]).length) delete h[k]; }
      const dev = E.devices.some(d => d.bat === id); // a Devices row: its default is the device's name, not the sensor's
      if (v && v !== raw.states[id]?.attributes.friendly_name && !(dev && v === this._devDefaultName(id))) (home.names ||= {})[id] = v;
      for (const m of arr(cfg.modes)) if (m && typeof m === 'object' && m.entity === id) delete m.name; // a mode shows the name given here
      for (const list of [cfg.panels?.devices?.entities, cfg.devices]) for (const d of arr(list)) if (d && typeof d === 'object' && d.battery === id) delete d.name; // so does a device
    }
  }
  async _saveNames(r) {
    const pend = this._pendNames || {}; this._pendNames = null;
    if (!Object.keys(pend).length) return;
    const cfg = JSON.parse(JSON.stringify(this._config || {}));
    this._storeNames(cfg, pend, r?.ci ?? null);
    if (JSON.stringify(cfg) === JSON.stringify(this._config)) return;
    if (r) this._reselect = r.id; // open the room again after the card is rebuilt with the new names
    if (await this._applyConfig(cfg)) { this.haptic('success'); this._toast(tr('Names saved')); } else this._reselect = null;
  }
}
