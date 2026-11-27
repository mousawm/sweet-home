// Sweet Home — View only: chosen users (or everyone who is not an admin) can look but not control, except the kinds of
// devices allowed to them; an optional PIN unlocks the controls until nobody has touched the card for a while.
// This is a lock on the card only: Home Assistant itself still lets those users control their devices elsewhere (its
// app, other dashboards), as Home Assistant has no per-device permissions.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { esc, ic, tc, pretty, ago } from '../core.js';

// the kinds of devices `view_allow` names, by the domain of the entity a control acts on
export const VIEW_KINDS = {
  lights: ['light'], switches: ['switch', 'input_boolean'], climate: ['climate', 'fan', 'humidifier', 'water_heater'], media: ['media_player', 'remote'],
  covers: ['cover', 'valve'], locks: ['lock'], alarm: ['alarm_control_panel'], scenes: ['scene', 'script', 'automation'], buttons: ['button', 'input_button'],
  system: ['update', 'homeassistant', 'mqtt', 'zha', 'hassio'],
};
const KIND_OF = Object.fromEntries(Object.entries(VIEW_KINDS).flatMap(([k, ds]) => ds.map(d => [d, k])));
const MAX_TRIES = 5; // wrong PINs in a row before a 30 s pause

export class AccessPanels {
  // view only for the user looking at the card now? (never while the dashboard is being edited)
  _viewOnly() {
    const v = this._config?.view_only, u = this._hass?.user; if (!v || this._editing) return false;
    if (v === 'non_admins') return !u?.is_admin;
    if (v === 'all' || v === true) return true;
    const names = (Array.isArray(v) ? v : [v]).map(x => String(x).toLowerCase());
    return !!u && (names.includes(String(u.id).toLowerCase()) || names.includes(String(u.name || '').toLowerCase()));
  }
  _viewAllow() { const a = this._config?.view_allow; return (Array.isArray(a) ? a : a ? [a] : []).map(String); }
  _viewPin() { const p = this._config?.view_pin; return p != null && String(p).trim() !== '' ? String(p).trim() : null; }
  _viewSecs() { const n = Number(this._config?.view_pin_seconds); return n > 0 ? Math.min(3600, n) : 30; }
  // the PIN pad closes by itself after this long without a key pressed (view_pin_close_seconds, 15 by default)
  _viewPadSecs() { const n = Number(this._config?.view_pin_close_seconds); return n > 0 ? Math.min(600, n) : 15; }
  _voIdle() { clearTimeout(this._voT); if (this._vo) this._voT = setTimeout(() => { if (this._vo) this._voCancel(); }, this._viewPadSecs() * 1000); }
  _unlocked() { return Date.now() < (this._unlockUntil || 0); }
  // the kind of device a service call acts on (null: nothing to guard, e.g. a refresh)
  _viewKind(domain, service, data) {
    const id = [].concat(data?.entity_id || [])[0], d = id ? String(id).split('.')[0] : domain;
    if (d === 'button' && id && (this._hass?.states?.[id]?.attributes?.device_class === 'restart' || /reboot|restart/.test(id))) return 'system';
    if (!id && domain === 'homeassistant') return /update_entity|reload/.test(service) ? null : 'system';
    return KIND_OF[d] || 'other';
  }
  _mayAct(kind) { return !kind || !this._viewOnly() || this._viewAllow().includes(kind) || this._unlocked(); }
  // run `fn` when the user may: at once, after the PIN, or not at all ("View only")
  _gate(kind, fn) {
    if (this._mayAct(kind)) return Promise.resolve(fn());
    if (!this._viewPin()) { this.haptic('failure'); this._toast(tr('View only: ask an admin to change this'), true); return Promise.resolve(false); }
    return new Promise(res => this._openViewPin(ok => res(ok ? fn() : false)));
  }
  // long press: Home Assistant's own pop-up has controls, so a locked user gets the card's read-only details instead
  _moreGuard(id) {
    const d = String(id).split('.')[0], kind = KIND_OF[d];
    if (!kind || this._mayAct(kind)) return false;
    this._openInfo('ro:' + id); return true;
  }
  _roSheet(head, id) {
    const st = this._hass?.states?.[id]; if (!st) return head('mdi:eye-outline', id, '');
    const lang = this._hass?.locale?.language || 'en', a = st.attributes || {};
    const skip = /^(friendly_name|icon|entity_picture|supported_features|supported_color_modes|.*_list|.*_modes|min_.*|max_.*|.*_step|attribution|device_class|unit_of_measurement|state_class|restored|editable|id)$/;
    const rows = Object.entries(a).filter(([k, v]) => !skip.test(k) && v != null && v !== '' && typeof v !== 'object').slice(0, 10)
      .map(([k, v]) => `<div class="mrow"><span>${esc(tc(pretty(k)))}</span><b>${esc(String(v))}</b></div>`).join('');
    return head('mdi:eye-outline', tc(a.friendly_name || id), tr('View only'))
      + `<div class="mrow"><span>${tr('State')}</span><b>${esc(tc(pretty(this._hass.formatEntityState?.(st) ?? st.state)))}</b></div>`
      + `<div class="mrow"><span>${tr('Changed')}</span><b>${esc(ago(st.last_changed, lang))}</b></div>` + rows
      + (this._viewPin() ? `<button class="almore" data-act="vounlock">${ic('mdi:lock-open-variant-outline')} ${tr('Unlock with the PIN')}</button>` : '');
  }

  /* ---------- the PIN pad ---------- */
  _openViewPin(done) {
    const back = this._info && !this._info.startsWith('ro:') ? this._info : null; // a sheet the PIN pad covers comes back after it
    this._closeSheet();
    this._vo = { pin: '', done, back };
    const sh = this.$('sheet');
    sh.innerHTML = `<div class="sheet keypad" role="dialog" aria-label="${tr('Enter the PIN')}">
      <div class="sh-h"><div><b>${tr('Enter the PIN')}</b><span>${tr('This dashboard is view only')}</span></div><button class="ibtn" data-act="vocancel" aria-label="${tr('Close')}">${ic('mdi:close')}</button></div>
      <div class="pin-dots" id="voDots" aria-live="polite"></div><div class="pin-msg" id="voMsg"></div>
      <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => `<button class="key k-${k}" data-act="vopin" data-k="${k}" aria-label="${k === 'del' ? tr('Delete') : k === 'ok' ? tr('Submit') : k}">${k === 'del' ? ic('mdi:backspace-outline') : k === 'ok' ? ic('mdi:check') : k}</button>`).join('')}</div></div>`;
    sh.classList.add('open');
    this._voRender(); this._voIdle();
    this._keyH = e => {
      if (/^[0-9]$/.test(e.key)) this._voKey(e.key); else if (e.key === 'Backspace') this._voKey('del');
      else if (e.key === 'Enter') this._voKey('ok'); else if (e.key === 'Escape') this._voCancel(); else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this._keyH);
  }
  _voRender(msg, bad) {
    const d = this.$('voDots'); if (!d || !this._vo) return;
    d.innerHTML = this._vo.pin.length ? '<i></i>'.repeat(this._vo.pin.length) : '<span>••••</span>';
    const m = this.$('voMsg'); if (m) { m.textContent = msg || ''; m.className = `pin-msg ${bad ? 'bad' : ''}`; }
  }
  _voKey(k) {
    const V = this._vo; if (!V) return;
    this._voIdle(); // a key pressed: the pad stays a while longer
    if (Date.now() < (this._voWaitUntil || 0)) { this._voRender(tr('Too many tries: wait {0} s', Math.ceil((this._voWaitUntil - Date.now()) / 1000)), true); return; }
    if (k === 'del') V.pin = V.pin.slice(0, -1);
    else if (k !== 'ok') { if (V.pin.length < 12) V.pin += k; }
    if (k !== 'ok' && V.pin.length < this._viewPin().length) return this._voRender();
    // checked when OK is pressed, or as soon as as many digits as the PIN has are in
    if (V.pin === this._viewPin()) {
      this._voTries = 0; this._unlockUntil = Date.now() + this._viewSecs() * 1000; this.haptic('success');
      const { done, back } = V; this._vo = null; this._closeSheet(); if (back) this._openInfo(back);
      this._toast(tr('Unlocked for {0} s after your last tap', this._viewSecs())); this._rerender('hdr');
      done?.(true);
    } else if (k === 'ok' || V.pin.length >= this._viewPin().length) {
      this._voTries = (this._voTries || 0) + 1; V.pin = ''; this.haptic('failure');
      if (this._voTries >= MAX_TRIES) { this._voTries = 0; this._voWaitUntil = Date.now() + 30e3; }
      this._voRender(tr('Wrong PIN, try again'), true);
      const d = this.$('voDots'); d?.classList.remove('shake'); void d?.offsetWidth; d?.classList.add('shake');
    } else this._voRender();
  }
  _voCancel() { clearTimeout(this._voT); const V = this._vo; this._vo = null; this._closeSheet(); if (V?.back) this._openInfo(V.back); V?.done?.(false); }
  // every tap on the card while unlocked keeps it unlocked; locked again once the time runs out
  _voTouch() { if (this._unlocked()) this._unlockUntil = Date.now() + this._viewSecs() * 1000; }
  _voTick() {
    const el = this.$?.('voChip'); if (!el) return;
    const left = Math.ceil(((this._unlockUntil || 0) - Date.now()) / 1000), on = left > 0;
    if ((el.dataset.on === '1') !== on) { this._rerender('hdr'); return; }
    if (on) { const s = el.querySelector('span'); const txt = tr('Unlocked · {0} s', left); if (s && s.textContent !== txt) s.textContent = txt; }
  }
  // the header chip for a view-only user: "View only" (tap: the PIN) or "Unlocked · 25 s" (tap: lock again)
  _voChip() {
    if (!this._viewOnly()) return '';
    const left = Math.ceil(((this._unlockUntil || 0) - Date.now()) / 1000), on = left > 0;
    return `<button class="chip ${on ? 'good' : ''}" id="voChip" data-on="${on ? 1 : 0}" data-act="${on ? 'volock' : 'vounlock'}" title="${tr(on ? 'Lock again' : 'View only')}">${ic(on ? 'mdi:lock-open-variant-outline' : 'mdi:eye-lock-outline')}<span>${on ? tr('Unlocked · {0} s', left) : tr('View only')}</span></button>`;
  }
}
