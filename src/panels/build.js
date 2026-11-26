// Sweet Home — Build mode (the card side): the toolbar over the 3D view, and every build step written into the card's
// config (with undo). The scene side (grid, ghosts, pointer) is src/build.js.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { arr, enclosedAreas, splitRoom, uncovered, extraWalls, inPoly, roomOutline, autoFurnitureConfig, FURN_TYPES, furnEntities } from '../model.js';
import { NEW_PIECE, PALETTE, r2, turnPiece } from '../pieces.js';
import { applyShape } from '../build.js';
import { movePiece } from '../model.js';
import { t as tr } from '../i18n.js';
import { MODEL, ROOMS, ROOM, FURN, esc, ic } from '../core.js';

const TOOLS = [['select', 'Select', 'mdi:cursor-default-click-outline'], ['room', 'Room', 'mdi:vector-square'], ['wall', 'Wall', 'mdi:wall'], ['door', 'Door', 'mdi:door'], ['window', 'Window', 'mdi:window-closed-variant'],
  ['paint', 'Paint', 'mdi:format-paint'], ['furniture', 'Furniture', 'mdi:sofa-outline'], ['delete', 'Knock down', 'mdi:hammer']];
const PAPERS = ['#f0dcc4', '#eccaa3', '#f5dc96', '#c6dbb2', '#b5e0d6', '#b9cdee', '#e6d5ec', '#f2c4d2', '#eee5d4', '#d8d6cf', '#ffffff', '#9bb0c9'];
const FLOORS = [['wood', 'Wood', '#b08a62'], ['tile', 'Tiles', '#eef2f6'], ['marble', 'Marble', '#e8dfcf'], ['carpet', 'Carpet', '#9097a1'], ['stone', 'Stone', '#b8b1a5'], ['asphalt', 'Asphalt', '#3a3f47']];
const WALL_MODES = { up: ['mdi:wall', 'Walls up'], cut: ['mdi:box-cutter', 'Walls cut away in front'], down: ['mdi:arrow-collapse-down', 'Walls down'] };
const WIDTHS = { door: [0.8, 0.9, 1.2, 1.6], window: [0.8, 1.2, 1.8, 2.4] };
// the entities a piece is most likely to show
const DOMAINS = { lamp: ['light'], fan: ['fan', 'switch'], tv: ['media_player'], ac: ['climate'], vacuum: ['vacuum'], blinds: ['cover'], charger: ['switch', 'sensor'], washer: ['switch', 'sensor'],
  sprinkler: ['switch', 'valve'], car: ['device_tracker', 'binary_sensor', 'sensor'], marker: ['light', 'switch', 'sensor', 'binary_sensor', 'lock', 'camera', 'climate', 'cover'] };

export class BuildTools {
  _bT(s, ...a) { return tr(s, ...a); }
  _bCan() { return !!this._hass?.user?.is_admin && !MODEL.gltf; }
  // Build mode on, or off. Build steps change only this card while you build; the dashboard is saved once, when
  // Build mode closes (Done, or leaving edit mode). `save: false` (Cancel) puts the house back as it was.
  async _bToggle(on = !this._building, save = true) {
    if (on && !this._bCan()) return;
    if (!on && this._building && this._bDirty()) {
      if (save) {
        if (!this._viaEditor()) { this._bSaving = true; this._bRender(); const ok = await this._saveCardConfig(this._config, this._bOrig); this._bSaving = false; if (!ok) { this._bRender(); return; } }
        this._toast(tr('House saved'));
      } else {
        const orig = JSON.parse(this._bOrig); this._bOrig = this._cfgJSON; // not dirty while it goes back
        if (this._viaEditor()) window.__sweetHomeEditor.applyExternal(orig); else this.setConfig(orig);
        this._toast(tr('Changes discarded'));
      }
    }
    this._building = on; this._bSel = null; this._bNew = null;
    if (on && this._arrange) { this._arrange = false; this.$('arrBtn')?.classList.remove('on'); }
    if (on) { this._select(null); this._bTool ||= 'room'; this._bUndo = []; this._bOrig = this._cfgJSON; }
    this._bKeys(on);
    this.$('viewport')?.classList.toggle('building', on); this.$('buildBtn')?.classList.toggle('on', on);
    this._bScene(); this._bRender(); this._noRoomsMsg();
    if (on) this._toast(tr('Build mode: draw on the grid. Two fingers or the right mouse button turn the view.'));
  }
  // Walls: Up (every wall stands), Cutaway (the outer walls facing you are lowered) or Down (every wall low), like
  // a life-sim game. Remembered on this device; by default Cutaway in the Dollhouse style, Up in the classic one.
  _wallMode() {
    if (this._walls === undefined) { try { this._walls = localStorage.getItem('sweet-home-walls'); } catch (e) { this._walls = null; } }
    return ['up', 'cut', 'down'].includes(this._walls) ? this._walls : MODEL.style === 'dollhouse' ? 'cut' : 'up';
  }
  _wallBtn() {
    const m = this._wallMode(), [icon, name] = WALL_MODES[m];
    return `<button class="ibtn ${m !== 'up' ? 'on' : ''}" data-act="walls" id="wallBtn" title="${tr(name)}" aria-label="${tr(name)}">${ic(icon)}</button>`;
  }
  _wallCycle() {
    const m = this._walls = { up: 'cut', cut: 'down', down: 'up' }[this._wallMode()];
    try { localStorage.setItem('sweet-home-walls', m); } catch (e) { /* storage blocked: for this visit */ }
    this.$('wallBtn')?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: this._wallBtn() }).content.firstChild);
    this._toast(tr(WALL_MODES[m][1]));
    if (this._three) { this._three._dirty = true; this._three.lastInput = performance.now(); }
  }
  // ---------- Select: the settings of what was tapped (the card editor's forms, in a panel over the 3D view) ----------
  async _bPick(what) {
    if (!what) return this._bInspect(null);
    if (what.k === 'room') {
      const r = ROOM[what.id]; if (!r) return;
      if (r.ci == null) await this._bEdit(() => {}); // the house built from the areas becomes your own first
      return this._bInspect({ k: 'room', i: r.ci ?? ROOMS.indexOf(r) });
    }
    if (what.k === 'piece') {
      const P = FURN[what.fi]; if (!P) return;
      if (P.src) return this._bInspect(P.src.house != null ? { k: 'piece', room: null, i: P.src.house } : { k: 'piece', room: P.src.room, i: P.src.i });
      let sel = null; // a piece of a room's automatic set: the room's set becomes its own first
      await this._bEdit(H => { const f = this._bPieceRef(H, what.fi), r = ROOM[P.room]; if (!f || !r) return false; const ri = r.ci ?? ROOMS.indexOf(r); sel = { k: 'piece', room: ri, i: H.rooms[ri].furniture.indexOf(f) }; });
      return sel ? this._bInspect(sel) : this._toast(tr('These stairs come with the room: change them in the card editor'), true);
    }
    return this._bInspect({ k: what.k, i: what.i });
  }
  async _bInspect(sel) {
    this._bInsFlush();
    this._bInsSel = sel || null;
    this._three?.builder?.setSel?.(this._bInsSel);
    if (!sel) { this._bInsWrap?.remove(); return; }
    if (!customElements.get('sweet-home-inspector')) {
      try { await this.constructor.getConfigElement(); } catch (e) { this._toast(e?.message || String(e), true); return; }
      if (this._bInsSel !== sel) return;
    }
    const W = this._bInsWrap ||= this._bInsMake(), el = W.querySelector('sweet-home-inspector');
    W.querySelector('.bins-t').textContent = this._bInsTitle(sel);
    el.hass = this._hass?._raw || this._hass; el.setConfig(this._config); el.sel = sel;
    this._bInsPlace();
    requestAnimationFrame(() => this._bInsReveal());
  }
  // what was picked slides out from under the panel: the view moves until it is in the free part of the 3D view
  _bInsReveal() {
    const S = this._three, B = S?.builder, W = this._bInsWrap, vp = this.$('viewport'); if (!B?.selG?.children.length || !W?.isConnected || !vp) return;
    const T = S.T, box = new T.Box3().setFromObject(B.selG), r = vp.getBoundingClientRect(), w = W.getBoundingClientRect();
    // the picked thing's extent on screen (its box's 8 corners)
    const pts = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const v = new T.Vector3(x, y, z).project(S.cam); pts.push([r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]); }
    const x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
    if (w.width > r.width * 0.7) { // a bottom sheet (phones): up from under it
      if (y1 > w.top - 20) S._pan(0, -Math.min(y1 - (w.top - 30), Math.max(0, y0 - (r.top + 60))));
    } else if (x1 > w.left - 20) S._pan(-Math.min(x1 - (w.left - 30), Math.max(0, x0 - (r.left + 20))), 0); // a side panel: to its left, as far as there is room
    S.lastInput = performance.now();
  }
  _bInsTitle(sel) {
    const H = this._config?.house || {};
    if (sel.k === 'room') { const rc = arr(H.rooms)[sel.i], r = ROOMS.find(x => x.ci === sel.i); return rc?.name || r?.name || tr('Room'); }
    if (sel.k === 'piece') { const f = arr(sel.room == null ? H.furniture : arr(H.rooms)[sel.room]?.furniture)[sel.i]; return f?.name || tr(FURN_TYPES[f?.type]?.[0] || 'Furniture'); }
    if (sel.k === 'door') return tr(arr(H.doors)[sel.i]?.gate ? 'Gate' : 'Door');
    return tr({ window: 'Window', opening: 'Open passage', badge: 'Lock badge', wall: 'Wall' }[sel.k] || '');
  }
  _bInsMake() {
    const W = document.createElement('div'); W.className = 'binsp';
    W.innerHTML = `<div class="bins-h"><b class="bins-t"></b><button class="bb" data-insmin title="${tr('Fold')}" aria-label="${tr('Fold')}">${ic('mdi:chevron-up')}</button><button class="bb" data-insx title="${tr('Close')}" aria-label="${tr('Close')}">${ic('mdi:close')}</button></div><div class="bins-b"></div>`;
    W.querySelector('[data-insmin]').addEventListener('click', e => { e.stopPropagation(); W.classList.toggle('mini'); });
    const el = document.createElement('sweet-home-inspector'); W.querySelector('.bins-b').appendChild(el);
    W.querySelector('[data-insx]').addEventListener('click', e => { e.stopPropagation(); this._bInspect(null); });
    el.addEventListener('sh-inspect-change', e => this._bInsChange(e.detail));
    el.addEventListener('sh-inspect-close', () => this._bInspect(null));
    W.addEventListener('focusout', () => setTimeout(() => { if (!W.contains(W.getRootNode().activeElement)) this._bInsFlush(); }, 0));
    return W;
  }
  // the panel sits in the toolbar's column, between the tool's options and Undo / Save
  _bInsPlace() {
    const W = this._bInsWrap, bar = this.$('buildbar'); if (!W || !this._bInsSel || !bar) return;
    const act = bar.querySelector('.bact'); if (W.parentNode !== bar || W.nextSibling !== act) bar.insertBefore(W, act);
    const el = W.querySelector('sweet-home-inspector'); if (el && el._config && el._last !== JSON.stringify(this._config)) el.setConfig(this._config);
  }
  // a typed change waits until typing stops (or the field is left): each change rebuilds the house
  _bInsChange({ config, typing }) {
    this._bInsPending = config; clearTimeout(this._bInsT);
    if (typing) this._bInsT = setTimeout(() => this._bInsFlush(), 1500); else this._bInsFlush();
  }
  _bInsFlush() { clearTimeout(this._bInsT); const c = this._bInsPending; this._bInsPending = null; if (c) { this._bCommit(c); const W = this._bInsWrap; if (W && this._bInsSel) W.querySelector('.bins-t').textContent = this._bInsTitle(this._bInsSel); } }
  _viaEditor() { return !!window.__sweetHomeEditor?.isConnected && !!window.__sweetHomeEditor.applyExternal; }
  // changes not saved yet (with the card editor open, each step already went through it)
  _bDirty() { return !!this._building && !this._viaEditor() && this._bOrig != null && this._cfgJSON !== this._bOrig; }
  // keyboard while building: Esc (stop / done), Ctrl+Z (undo), R (turn the piece), Delete (remove it), 1–7 (tools)
  _bKeys(on) {
    if (this._bKeyFn) { window.removeEventListener('keydown', this._bKeyFn); window.removeEventListener('beforeunload', this._bLeave); this._bKeyFn = null; }
    if (!on) return;
    this._bLeave = e => { if (this._bDirty()) { e.preventDefault(); e.returnValue = ''; } }; // unsaved build steps: the browser asks first
    this._bKeyFn = e => {
      if (!this._building || !this.isConnected) return;
      const path = e.composedPath?.() || [];
      if (path.some(n => n?.tagName && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) || n?.isContentEditable)) return; // typing a name
      const k = e.key, B = this._three?.builder;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); this._bAct({ dataset: { b: 'undo' } }); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'Escape') { e.preventDefault(); if (this._bInsSel) this._bInspect(null); else if (B?.op) { B.op = null; B._clear(); B.S._dirty = true; } else if (this._bSel != null || this._bPiece) { this._bSel = null; this._bPiece = null; this._bRender(); } else this._bToggle(false); }
      else if ((k === 'r' || k === 'R') && this._bSel != null) { e.preventDefault(); this._bAct({ dataset: { b: 'turn' } }); }
      else if ((k === 'Delete' || k === 'Backspace') && this._bSel != null) { e.preventDefault(); this._bAct({ dataset: { b: 'delpiece' } }); }
      else if (new RegExp(`^[1-${TOOLS.length}]$`).test(k)) { e.preventDefault(); this._bAct({ dataset: { b: 'tool', v: TOOLS[Number(k) - 1][0] } }); }
    };
    window.addEventListener('keydown', this._bKeyFn); window.addEventListener('beforeunload', this._bLeave);
  }
  // the 3D view follows: the builder (grid, tools) on or off, and pieces can be dragged with the Furniture tool
  _bScene() {
    const S = this._three; if (!S) return;
    S.setBuild?.(!!this._building);
    S.arrange = !!this._arrange || (!!this._building && ['furniture', 'select'].includes(this._bTool));
    S.builder?.setSel?.(this._building ? this._bInsSel : null);
  }
  _bInfo(s) { const el = this.$('bInfo'); if (el) el.textContent = s; }
  _bWidth(tool) { return (this._bW ||= { door: 0.9, window: 1.2 })[tool]; }

  _bRender() {
    const el = this.$('buildbar'); if (!el) return;
    if (!this._building) { el.innerHTML = ''; el.classList.remove('open'); if (this._bInsSel) this._bInspect(null); return; }
    el.classList.add('open');
    const tool = this._bTool, b = (act, v, label, icon, on, extra = '') => `<button class="bb ${on ? 'on' : ''}" data-act="b" data-b="${act}" data-v="${esc(v)}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon ? ic(icon) : ''}<span>${esc(label)}</span></button>`;
    const tools = TOOLS.map(([k, n, i]) => b('tool', k, tr(n), i, tool === k)).join('');
    let opts = '';
    if (tool === 'select') opts = `<span class="bh">${tr('Tap anything to see and change all its settings: a room (its name, area, shape, devices), a piece, a door, a window, a wall. Drag a piece to move it.')}</span>`;
    else if (tool === 'room') opts = `<span class="bh">${tr('Drag on the grid to draw a room: its walls go up around it.')}</span>`;
    else if (tool === 'wall') opts = `<span class="bh">${tr('Drag to draw a wall (straight or at 45°). Walls that close an area make a new room.')}</span>`;
    else if (tool === 'door' || tool === 'window') opts = `<span class="bh">${tr(tool === 'door' ? 'Tap a wall to put a door in it (a gate in a fence).' : 'Tap an outer wall to put a window in it.')}</span>${WIDTHS[tool].map(w => b('width', w, `${w} m`, '', this._bWidth(tool) === w)).join('')}`;
    else if (tool === 'paint') {
      const br = this._bBrush ||= { k: 'wall', v: PAPERS[0] };
      opts = `<span class="bh">${tr('Pick a wallpaper or a floor, then tap a room.')}</span>
        <span class="bsw">${PAPERS.map(c => `<button class="sw ${br.k === 'wall' && br.v === c ? 'on' : ''}" data-act="b" data-b="brush" data-k="wall" data-v="${c}" style="background:${c}" title="${tr('Wallpaper')} ${c}" aria-label="${tr('Wallpaper')} ${c}"></button>`).join('')}</span>
        <span class="bsw">${FLOORS.map(([k, n, c]) => `<button class="sw fl ${br.k === 'floor' && br.v === k ? 'on' : ''}" data-act="b" data-b="brush" data-k="floor" data-v="${k}" style="background:${c}" title="${tr(n)}" aria-label="${tr(n)}"><span>${tr(n)}</span></button>`).join('')}</span>
        ${MODEL.style !== 'dollhouse' ? b('style', 'dollhouse', tr('Dollhouse look (shows wallpaper)'), 'mdi:home-heart', false) : ''}`;
    } else if (tool === 'furniture') {
      const P = this._bSel != null ? FURN[this._bSel] : null;
      if (P) {
        const t = String(P.type), ents = furnEntities(P), doms = DOMAINS[t] || ['light', 'switch', 'sensor', 'binary_sensor', 'media_player', 'climate', 'cover', 'fan'];
        const list = Object.keys(this._hass?.states || {}).filter(id => doms.includes(id.split('.')[0])).sort();
        opts = `<b class="bsel">${ic(FURN_TYPES[t]?.[1] || 'mdi:shape-outline')} ${esc(P.name || tr(FURN_TYPES[t]?.[0] || t))}</b>
          ${b('turn', '', tr('Turn'), 'mdi:rotate-right', false)}
          <label class="blink">${ic('mdi:link-variant')}<input data-blink list="bEnts" value="${esc(ents[0] || '')}" placeholder="${tr('Link to an entity')}" aria-label="${tr('Link to an entity')}"><datalist id="bEnts">${list.map(id => `<option value="${id}">${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join('')}</datalist></label>
          ${b('delpiece', '', tr('Remove'), 'mdi:delete-outline', false)}${b('unsel', '', tr('Done'), 'mdi:check', false)}`;
      } else opts = `<span class="bh">${tr(this._bPiece ? 'Tap the floor to place it. Drag a piece to move it, tap it to turn or link it.' : 'Pick a piece, then tap the floor. Drag a piece to move it, tap it to turn or link it.')}</span>
        <span class="bcat">${PALETTE.map(k => b('piece', k, tr(FURN_TYPES[k]?.[0] || k), FURN_TYPES[k]?.[1] || 'mdi:shape-outline', this._bPiece === k)).join('')}</span>`;
    } else if (tool === 'delete') opts = `<span class="bh">${tr('Tap a piece, a door, a wall you drew or a room to remove it.')}</span>`;
    const nr = this._bNew != null && this._config?.house?.rooms?.[this._bNew];
    const areas = Object.values(this._hass?.areas || {}).sort((a, c) => String(a.name).localeCompare(c.name));
    const naming = nr ? `<div class="brow bname">${ic('mdi:tag-outline')}<input data-bname value="${esc(nr.name || '')}" placeholder="${tr('Room name')}" aria-label="${tr('Room name')}">
        <select data-barea aria-label="${tr('Home Assistant area')}"><option value="">${tr('No area')}</option>${areas.map(a => `<option value="${esc(a.area_id)}" ${nr.area === a.area_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        ${b('named', '', tr('OK'), 'mdi:check', true)}</div>` : '';
    // top: the tools (and the view's turn / grid buttons), then the new room's name, then the tool's options;
    // bottom left: undo, cancel and save / done
    el.innerHTML = `<div class="brow btools">${tools}<span class="bsp"></span>
        <span class="bturn">${b('turnv', '-1', tr('Turn left'), 'mdi:rotate-left', false)}${b('turnv', '1', tr('Turn right'), 'mdi:rotate-right', false)}</span>
        ${b('grid', '', `${this._bGrid || 0.5} m`, 'mdi:grid', false)}</div>
      ${naming}<div class="brow bopts">${opts}<span class="binfo" id="bInfo"></span></div>
      <div class="brow bact">${b('undo', '', tr('Undo'), 'mdi:undo', false, (this._bUndo || []).length ? '' : 'disabled')}
        ${this._bDirty() ? b('cancel', '', tr('Cancel'), 'mdi:close', false) : ''}
        ${b('done', '', this._bSaving ? tr('Saving…') : this._bDirty() ? tr('Save') : tr('Done'), this._bDirty() ? 'mdi:content-save' : 'mdi:check', true, this._bSaving ? 'disabled' : '')}</div>`;
    this._bInsPlace();
  }

  _bAct(t) {
    const v = t.dataset.v;
    switch (t.dataset.b) {
      case 'tool': this._bTool = v; this._bSel = null; this._bNew = null; if (v !== 'select' && this._bInsSel) this._bInspect(null); if (v !== 'furniture') this._bPiece = null; this._three?.builder?.setTool(v); this._bScene(); break;
      case 'width': this._bW[this._bTool] = Number(v); break;
      case 'brush': this._bBrush = { k: t.dataset.k, v }; break;
      case 'piece': this._bPiece = this._bPiece === v ? null : v; break;
      case 'grid': this._bGrid = (this._bGrid || 0.5) === 0.5 ? 0.25 : (this._bGrid || 0.5) === 0.25 ? 1 : 0.5; this._three?.builder?.setGrid(); break;
      case 'turnv': if (this._three) { this._three.goal.theta += Number(v) * Math.PI / 4; this._three.lastInput = performance.now(); } return;
      case 'undo': { const prev = this._bUndo?.pop(); if (prev) { this._bSel = null; this._bNew = null; this._bApply(JSON.parse(prev)); } break; }
      case 'done': if (!this._bSaving) this._bToggle(false); return;
      case 'cancel': this._bToggle(false, false); return;
      case 'turn': this._bPieceEdit(f => turnPiece(f)); return;
      case 'delpiece': this._bOp('delete', { k: 'piece', fi: this._bSel }); this._bSel = null; break;
      case 'unsel': this._bSel = null; break;
      case 'style': this._bEdit(H => { H.style = 'dollhouse'; }); break;
      case 'named': this._bName(); return;
    }
    this._bRender();
  }
  _bChange(el) {
    if (el.matches('[data-blink]')) { const id = el.value.trim(); if (id && !this._hass?.states[id]) { this._toast(tr('No entity {0}', id), true); return; } this._bPieceEdit(f => { delete f.entity; if (id) f.entities = [id]; else delete f.entities; }); return true; }
    if (el.matches('[data-bname], [data-barea]')) { if (el.matches('[data-barea]')) this._bName(); return true; }
    return false;
  }
  _bName() {
    const name = this.$('buildbar')?.querySelector('[data-bname]')?.value.trim(), area = this.$('buildbar')?.querySelector('[data-barea]')?.value, i = this._bNew;
    if (i == null) return;
    this._bEdit(H => { const r = H.rooms?.[i]; if (!r) return; if (name) r.name = name; if (area) r.area = area; else delete r.area; });
    if (area || name) this._bNew = null;
    this._bRender();
  }
  _bSelect(fi) {
    const ok = fi != null && this._bCanEdit(fi);
    this._bSel = ok ? fi : null; if (fi != null && !ok) this._toast(tr('These stairs come with the room: change them in the card editor'), true);
    this._bRender();
  }
  // a piece Build mode can change: one of your own, or one of a room's automatic set (it becomes the room's own first)
  _bCanEdit(fi) { const P = FURN[fi]; return !!P && (!!P.src || (!!P.room && !!ROOM[P.room] && !('byFloors' in P))); }
  // the config object of piece `fi` in house H. A room's automatic set is copied into the room's own furniture first,
  // so its pieces can be moved, turned, linked and removed (the house built from the areas becomes your own too).
  _bPieceRef(H, fi) {
    const P = FURN[fi]; if (!P) return null;
    if (P.src) return P.src.house != null ? H.furniture?.[P.src.house] : H.rooms?.[P.src.room]?.furniture?.[P.src.i];
    const r = P.room && ROOM[P.room]; if (!r || 'byFloors' in P) return null;
    const rc = H.rooms?.[r.ci ?? ROOMS.indexOf(r)]; if (!rc) return null;
    const autos = FURN.filter(f => f.room === r.id && !f.src && !('byFloors' in f)), k = autos.indexOf(P);
    if (!Array.isArray(rc.furniture)) rc.furniture = autoFurnitureConfig({ ...rc, media: rc.media ?? r.media ?? undefined }, r.name);
    return rc.furniture[k] || null;
  }
  // the selected piece, changed in the config
  _bPieceEdit(fn) {
    const fi = this._bSel; if (fi == null) return;
    this._bEdit(H => { const f = this._bPieceRef(H, fi); if (!f) return false; fn(f); });
  }

  // a change to the house: the config is copied, changed by `fn(house, cfg)` and applied (through the open card editor,
  // else saved into the dashboard). The house built from the Home Assistant areas becomes your own first, so building
  // on it keeps its rooms.
  async _bEdit(fn) {
    const before = JSON.stringify(this._config || {}), cfg = JSON.parse(before), H = cfg.house ||= {};
    this._bOwnHouse(H);
    if (fn(H, cfg) === false) return false;
    return this._bCommit(cfg, before);
  }
  // a new config while building: undo remembers the one before; it changes this card only (or goes through the open
  // card editor); the dashboard is saved when Build mode closes
  _bCommit(cfg, before = JSON.stringify(this._config || {})) {
    (this._bUndo ||= []).push(before); if (this._bUndo.length > 50) this._bUndo.shift();
    this._bApply(cfg); this._bRender();
    return true;
  }
  _bApply(cfg) { if (this._viaEditor()) window.__sweetHomeEditor.applyExternal(cfg); else this.setConfig(cfg); }
  // the house built from the Home Assistant areas becomes your own first, so building on it keeps its rooms
  _bOwnHouse(H) {
    if (!arr(H.rooms).length && ROOMS.length && MODEL.auto) {
      const { ox = 0, oz = 0 } = MODEL.plan;
      H.rooms = ROOMS.map(r => ({ ...(r.area ? { area: r.area } : { name: r.name }), rects: r.rects.map(([a, b, c, d]) => [r2(a + ox), r2(b + oz), r2(c + ox), r2(d + oz)]), ...(r.level ? { level: r.level } : {}) }));
      if (H.auto_furniture == null) H.auto_furniture = true;
    }
  }

  // one build step from the 3D view (in the config's own coordinates)
  _bOp(op, a) {
    const X = r2, Z = r2, lv = o => (a.level ? { ...o, level: a.level } : o);
    if (op === 'room') return this._bEdit(H => {
      const rooms = H.rooms ||= [], [x1, z1, x2, z2] = a.rect;
      rooms.push(lv({ name: `${tr('Room')} ${rooms.length + 1}`, rects: [[X(x1), Z(z1), X(x2), Z(z2)]], furniture: [] })); this._bNew = rooms.length - 1; // a new room starts empty
    });
    if (op === 'wall') return this._bEdit(H => {
      (H.extra_walls ||= []).push(lv({ from: [X(a.from[0]), Z(a.from[1])], to: [X(a.to[0]), Z(a.to[1])] }));
      const { made, split } = this._bWallRooms(H, a.level || 0);
      if (split) this._toast(split > 1 ? tr('{0} rooms split', split) : tr('Room split in two'));
      else if (made) this._toast(made > 1 ? tr('{0} new rooms', made) : tr('New room'));
    });
    if (op === 'door' || op === 'window') return this._bEdit(H => {
      const [x1, z1, x2, z2] = a.seg;
      if (op === 'door') (H.doors ||= []).push(lv({ from: [X(x1), Z(z1)], to: [X(x2), Z(z2)], ...(a.gate ? { gate: true } : {}) }));
      else { if (!Array.isArray(H.windows)) H.windows = []; H.windows.push([X(x1), Z(z1), X(x2), Z(z2), ...(a.level ? [a.level] : [])]); }
    });
    if (op === 'paint') {
      const r = ROOM[a.room], br = this._bBrush || {};
      if (!r) return;
      return this._bEdit(H => {
        const rc = H.rooms?.[r.ci ?? ROOMS.indexOf(r)]; if (!rc) return false;
        if (br.k === 'floor') rc.floor = br.v; else rc.wall_color = br.v;
      });
    }
    if (op === 'piece') return this._bEdit(H => {
      const o = JSON.parse(JSON.stringify(NEW_PIECE[a.type] || {})), span = o._span; delete o._span;
      const x = X(a.x), z = Z(a.z), f = span ? { type: a.type, from: [r2(x - span[0]), r2(z - span[1])], to: [r2(x + span[0]), r2(z + span[1])], ...o } : { type: a.type, x, z, ...o };
      const r = a.room && ROOM[a.room], rc = r && H.rooms?.[r.ci ?? ROOMS.indexOf(r)];
      if (rc) { if (!Array.isArray(rc.furniture)) rc.furniture = []; rc.furniture.push(f); }
      else (H.furniture ||= []).push(lv(f));
    });
    if (op === 'shape') return this._bEdit(H => {
      const rc = arr(H.rooms)[a.room]; if (!rc) return false;
      if (a.ch.move) { // the room moves with what is in it and on its walls: furniture, doors, windows, passages, badges
        const poly = roomOutline(rc) || arr(rc.rects).flatMap(([x1, z1, x2, z2]) => [[x1, z1], [x2, z1], [x2, z2], [x1, z2]]), lv = Number(rc.level) || 0;
        const box = poly.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
        const mine = (x, z) => x >= box[0] - 0.05 && x <= box[2] + 0.05 && z >= box[1] - 0.05 && z <= box[3] + 0.05, lvOf = o => Number(Array.isArray(o) ? o[4] : o?.level) || 0;
        for (const f of arr(rc.furniture)) movePiece(f, a.ch.dx, a.ch.dz);
        for (const d of arr(H.doors)) if (lvOf(d) === lv && d.from && d.to && mine(...d.from) && mine(...d.to)) { d.from = [r2(d.from[0] + a.ch.dx), r2(d.from[1] + a.ch.dz)]; d.to = [r2(d.to[0] + a.ch.dx), r2(d.to[1] + a.ch.dz)]; }
        for (const k of ['windows', 'openings']) for (const w of arr(H[k])) if (Array.isArray(w) && lvOf(w) === lv && mine(w[0], w[1]) && mine(w[2], w[3])) { w[0] = r2(w[0] + a.ch.dx); w[1] = r2(w[1] + a.ch.dz); w[2] = r2(w[2] + a.ch.dx); w[3] = r2(w[3] + a.ch.dz); }
        for (const b of arr(H.lock_badges)) if (lvOf(b) === lv && mine(Number(b.x), Number(b.z))) { b.x = r2(Number(b.x) + a.ch.dx); b.z = r2(Number(b.z) + a.ch.dz); }
      }
      applyShape(rc, a.ch);
    });
    if (op === 'delete') return this._bEdit(H => {
      if (a.k === 'piece') {
        const f = this._bPieceRef(H, a.fi); if (!f) return false;
        for (const list of [H.furniture, ...arr(H.rooms).map(r => r.furniture)]) { const i = Array.isArray(list) ? list.indexOf(f) : -1; if (i >= 0) { list.splice(i, 1); break; } }
      } else if (a.k === 'door') { H.doors?.splice(a.i, 1); if (!H.doors?.length) delete H.doors; }
      else if (a.k === 'window') H.windows?.splice(a.i, 1); // an empty list: no windows (deleting the list: automatic windows again)
      else if (a.k === 'opening') { H.openings?.splice(a.i, 1); if (!H.openings?.length) delete H.openings; }
      else if (a.k === 'badge') { H.lock_badges?.splice(a.i, 1); if (!H.lock_badges?.length) delete H.lock_badges; }
      else if (a.k === 'wall') { H.extra_walls?.splice(a.i, 1); if (!H.extra_walls?.length) delete H.extra_walls; }
      else if (a.k === 'room') {
        const r = ROOM[a.id]; if (!r) return false;
        if (this._bArm !== a.id) { this._bArm = a.id; setTimeout(() => { if (this._bArm === a.id) this._bArm = null; }, 2500); this._toast(tr('Tap {0} again to remove it', r.name)); return false; }
        this._bArm = null; H.rooms?.splice(r.ci ?? ROOMS.indexOf(r), 1);
      }
    });
  }
  // walls first: the areas that walls on this floor now close in become rooms, and a room a wall now runs across
  // becomes two (or more). A separate wall keeps only the parts no new room edge covers (rooms draw their own walls).
  // Returns { made, split }: how many rooms were made, and how many were split.
  _bWallRooms(H, level) {
    const lvOf = o => Number(Array.isArray(o) ? o[4] : o?.level) || 0;
    const shape = r => { const poly = roomOutline(r); return poly ? [poly.map(p => [p[0], p[1]])] : arr(r.rects).map(([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]]); };
    const here = arr(H.rooms).map((r, i) => ({ r, i })).filter(o => lvOf(o.r) === level);
    const outlines = here.flatMap(o => shape(o.r));
    // the walls that make rooms: plain straight walls on this floor (not fences, glass, low walls or bent ones)
    const mine = arr(H.extra_walls).map((w, i) => ({ w, i, s: extraWalls([w]) }))
      .filter(o => o.s.length && lvOf(o.w) === level && (Array.isArray(o.w) || (!o.w.bow && !['fence', 'glass', 'half', 'low'].includes(o.w.type))));
    const wallSegs = mine.flatMap(o => o.s.map(s => s.slice(0, 4)));
    const changed = []; // outlines of the rooms made or changed now
    // 1. closed areas outside the rooms: new rooms
    const segs = [...outlines.flatMap(p => p.map(([x, z], i) => [x, z, ...p[(i + 1) % p.length]])), ...wallSegs];
    const found = enclosedAreas(segs, outlines);
    for (const pts of found) {
      const all = H.rooms ||= [], rc = { name: `${tr('Room')} ${all.length + 1}`, points: pts.map(([x, z]) => [r2(x), r2(z)]), furniture: [] };
      if (level) rc.level = level; all.push(rc); this._bNew = all.length - 1; changed.push(pts);
    }
    // 2. rooms a wall now runs right across: split, the biggest part keeps the room (its name, area, devices…)
    let split = 0;
    for (const { r, i } of here) {
      const parts = splitRoom(shape(r), wallSegs); if (!parts.length) continue;
      split++; changed.push(...parts);
      const pts = p => p.map(([x, z]) => [r2(x), r2(z)]);
      for (const k of ['rects', 'rect', 'floor_rects', 'floorRects', 'anchor']) delete r[k];
      r.points = pts(parts[0]);
      const at = f => (f.from && f.to ? [(f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2] : [Number(f.x), Number(f.z)]);
      const all = H.rooms;
      for (const part of parts.slice(1)) {
        const rc = { name: `${tr('Room')} ${all.length + 1}`, points: pts(part), furniture: [] };
        for (const k of ['level', 'floor', 'wall_color', 'outdoor']) if (r[k] != null) rc[k] = r[k];
        // the pieces standing in this part go with it
        if (Array.isArray(r.furniture)) r.furniture = r.furniture.filter(f => { const [x, z] = at(f); if (inPoly(x, z, part)) { rc.furniture.push(f); return false; } return true; });
        all.push(rc); this._bNew = all.length - 1;
      }
    }
    if (!changed.length) return { made: 0, split: 0 };
    // 3. separate walls where the new rooms now have their own walls keep only what sticks out
    const keep = [];
    arr(H.extra_walls).forEach((w, i) => {
      const o = mine.find(m => m.i === i); if (!o) { keep.push(w); return; }
      const seg = Array.isArray(w) ? w.slice(0, 4) : [...w.from, ...w.to], rest = uncovered(seg, changed);
      for (const [x1, z1, x2, z2] of rest) keep.push(Array.isArray(w) ? [x1, z1, x2, z2, ...w.slice(4)] : { ...w, from: [x1, z1], to: [x2, z2] });
    });
    if (keep.length) H.extra_walls = keep; else delete H.extra_walls;
    return { made: found.length, split };
  }
}
