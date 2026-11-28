// Sweet Home — Media and Media Server (Jellyfin, Plex, Sonarr, Radarr, qBittorrent), TV light.
// Methods of the card (installed on SweetHomeCard.prototype in card.js): `this` is the card.
import { t as tr } from '../i18n.js';
import { E, tc, esc, ic, clamp, BAD, skl, skPill, pretty, bidi } from '../core.js';

export class MediaPanels {
  // ---------- Jellyfin library browser ----------
  // Shows / Movies tiles → poster grid (media_source/browse_media on media-source://jellyfin); a movie or an episode
  // plays on the TV (panels.media_server.jellyfin_tv) through the Jellyfin app's session player; a show opens its seasons and episodes.
  _jfBrowse(id) {
    const c = this._jfc || (this._jfc = {}); if (!this._jfcAt || !Object.keys(c).length) this._jfcAt = Date.now();
    if (c[id]) return c[id].data;
    c[id] = { data: null };
    // the same tree as Home Assistant's Media browser (media-source://jellyfin, or JellyHA's media-source://jellyha)
    this._hass.callWS({ type: 'media_source/browse_media', media_content_id: id })
      .then(r => { c[id].data = r; }, () => { c[id].data = { children: [], error: true }; })
      .then(() => { if (this._info?.startsWith('jf')) this._renderInfo(); });
    return null;
  }
  // ---- playing on the TV: works with no setup ----
  // 1. The TV: `jellyfin_tv.app_player` if set, else any media player (not Jellyfin's own) whose source list has
  //    Jellyfin — Android TV / Google TV / Fire TV over ADB first, then Android TV Remote, then webOS, Tizen, Roku ….
  // 2. The Jellyfin app is opened there. Over ADB it is force-stopped first: the Jellyfin Android TV app crashes when
  //    play_media reaches it while it sits idle after a video was closed, and plays fine right after a fresh start.
  // 3. The TV's Jellyfin session is the one that becomes playable after that (Jellyfin's session entity ids change
  //    with every app start, so they are never stored). A configured name (`jellyfin_tv.session`) and TV-type clients
  //    (device model "Jellyfin for Android TV", Roku, webOS …) only rank the candidates.
  // 4. While waiting, Jellyfin's session list is refreshed every 4 s; after 15 s the sheet shows what is going on,
  //    with Reconnect (reloads the Jellyfin integration — admins) for when Home Assistant has stopped seeing sessions.
  _jfLauncher() {
    const T = E.mserver.jellyfin.tv || {}, ents = this._hass?.entities || {};
    const plat = id => ents[id]?.platform || '';
    const src = st => (st?.attributes.source_list || []).find(s => /jellyfin/i.test(s));
    if (T.app_player) { const st = this.s(T.app_player); return st ? { id: T.app_player, plat: plat(T.app_player), source: T.source || src(st) || 'Jellyfin' } : null; }
    const rank = p => p === 'androidtv' ? 0 : p === 'androidtv_remote' ? 1 : 2;
    const c = Object.keys(this._hass?.states || {}).filter(id => id.startsWith('media_player.') && !['jellyfin', 'jellyha'].includes(plat(id)))
      .map(id => this.s(id)).filter(st => !BAD.includes(st.state) && src(st))
      .sort((a, b) => rank(plat(a.entity_id)) - rank(plat(b.entity_id)) || (a.state === 'off') - (b.state === 'off'));
    return c[0] ? { id: c[0].entity_id, plat: plat(c[0].entity_id), source: src(c[0]) } : null;
  }
  // Jellyfin players that can be sent a video now (available + PLAY_MEDIA, bit 512), best first:
  // configured name, then TV apps, then the most recently updated. Playing always goes through the official Jellyfin
  // integration (also with "Jellyfin + JellyHA", where JellyHA only shows Now Watching, the clients and the library).
  _jfSessions() {
    const h = this._hass, ents = h?.entities || {}, T = E.mserver.jellyfin.tv || {};
    const re = T.session ? new RegExp(T.session.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return this._jfPlayers('jellyfin')
      .map(id => this.s(id)).filter(st => st && !BAD.includes(st.state) && (st.attributes.supported_features & 512))
      .map(st => {
        const dev = h.devices?.[ents[st.entity_id]?.device_id] || {}, a = st.attributes;
        const what = `${dev.model || ''} ${a.client || ''} ${a.device_name || ''}`;
        const tv = /\btv\b|android ?tv|google ?tv|roku|webos|tizen|kodi|xbox|playstation|fire|shield|nvidia|chromecast|apple ?tv|tvos/i.test(what);
        // a phone or tablet app (Jellyfin Android / iOS / mobile web): never the TV
        const mobile = !tv && /\bios\b|iphone|ipad|android|mobile|phone|tablet/i.test(what);
        return { st, mobile, score: (re && re.test(a.friendly_name || st.entity_id) ? 4 : 0) + (tv ? 2 : 0) - (mobile ? 3 : 0) };
      })
      .sort((a, b) => b.score - a.score || new Date(b.st.last_updated) - new Date(a.st.last_updated));
  }
  // "Living Room TV" from the TV's own name, without an IP address the integration put in it
  _jfTvName(L) {
    const n = (this.s(L?.id)?.attributes.friendly_name || '').replace(/\s*\d{1,3}(\.\d{1,3}){3}\s*/g, ' ').trim();
    return n && !/^android tv$/i.test(n) ? n : 'your TV';
  }
  _jfPlayable() { return new Set(this._jfSessions().map(x => x.st.entity_id)); }
  // where a video may go: with a TV to open Jellyfin on, never a phone or tablet app
  _jfTargets(L) { const all = this._jfSessions(); return L ? all.filter(x => !x.mobile) : all; }
  async _jfPlay(item, kind, title) {
    if (!item || this._jfBusy) return;
    this._jfBusy = true; this._jfCancel = false;
    const T = E.mserver.jellyfin.tv || {}, name = title || 'it';
    let tvName = tc(T.name || 'your TV');
    const send = async st => {
      if (await this.call('media_player', 'play_media', { entity_id: st.entity_id, media_content_id: item, media_content_type: kind || 'video' })) {
        this.haptic('success'); this._toast(`Playing ${name} on ${tvName}`); this._closeSheet();
      }
    };
    try {
      const L = this._jfLauncher(), all = this._jfTargets(L);
      if (L && !T.name) tvName = this._jfTvName(L);
      const best = all[0], live = all.find(x => x.score > 0 && ['playing', 'paused'].includes(x.st.state));
      // something already plays on the TV's Jellyfin app: send it straight there
      if (live) return await send(live.st);
      // no TV to open Jellyfin on: use a Jellyfin app that is open now
      if (!L) {
        if (best) return await send(best.st);
        this.haptic('failure'); this._toast(`Open the Jellyfin app on ${tvName} first`, true); return;
      }
      // a TV we can't restart Jellyfin on, with its Jellyfin app already open: play there
      if (L.plat !== 'androidtv' && best && best.score > 0) return await send(best.st);
      const before = this._jfPlayable();
      this._toast(`Starting Jellyfin on ${tvName}…`);
      let t0 = Date.now();
      if (this.v(L.id) === 'off' && !(await this.call('media_player', 'turn_on', { entity_id: L.id }))) return;
      if (L.plat === 'androidtv') {
        await this.call('androidtv', 'adb_command', { entity_id: L.id, command: `am force-stop ${T.package || 'org.jellyfin.androidtv'}` });
        await new Promise(r => setTimeout(r, 800));
      }
      const listed = (this.s(L.id)?.attributes.source_list || []).includes(L.source);
      const opened = L.plat === 'androidtv_remote' && !listed
        ? await this.call('media_player', 'play_media', { entity_id: L.id, media_content_type: 'app', media_content_id: T.package || 'org.jellyfin.androidtv' })
        : await this.call('media_player', 'select_source', { entity_id: L.id, source: L.source });
      if (!opened) return;
      // Quick Connect: the TV's Jellyfin starts on its sign-in screen with a code to approve; wait until the user says
      // they are signed in (tap Play in the banner), then look for the TV's session and send the video as below
      if (T.quick_connect) {
        this._jfQcDone = false;
        this._jfWait = { qc: true, msg: tr('Sign in to Jellyfin on {0} with Quick Connect, then tap Play to start {1}.', tvName, name) }; this._renderInfo();
        await this._waitFn(() => this._jfQcDone || this._jfCancel, 900e3);
        this._jfWait = null; this._renderInfo();
        if (this._jfCancel) { this._toast(tr("Stopped")); return; }
        if (!this._jfQcDone) { this._toast(`Jellyfin did not connect on ${tvName}`, true); return; }
        this._toast(`Opening ${name} on ${tvName}…`);
      }
      // the TV's session: one that became playable after the app was opened (or after a reconnect)
      let ses = null, after = t0;
      const fresh = () => {
        if (this._jfCancel) return true;
        const c = this._jfTargets(L).filter(x => !before.has(x.st.entity_id) || new Date(x.st.last_updated) > after && x.score > 0);
        ses = c[0]?.st || null; return !!ses;
      };
      const ref = E.mserver.jellyfin.playClients || this._jfPlayers('jellyfin')[0];
      const nudge = setInterval(() => { if (ref) this._hass.callService('homeassistant', 'update_entity', { entity_id: ref }).catch(() => {}); }, 4e3);
      this._jfReconnect = async () => {
        this._jfWait = { msg: 'Reconnecting Home Assistant to Jellyfin…', busy: true }; this._renderInfo();
        try {
          const [entry] = await this._hass.callWS({ type: 'config_entries/get', domain: 'jellyfin' });
          if (entry) { after = Date.now(); before.clear(); await this._hass.callService('homeassistant', 'reload_config_entry', { entry_id: entry.entry_id }); }
        } catch (e) { this._toast(e?.message || 'Reconnect failed', true); }
        this._jfWait = { msg: 'Reconnected — waiting for Jellyfin on the TV…', busy: true }; this._renderInfo();
      };
      let ok;
      try {
        ok = await this._waitFn(fresh, 15e3);
        if (!ok) {
          const front = /jellyfin/i.test(`${this.s(L.id)?.attributes.app_id || ''} ${this.s(L.id)?.attributes.source || ''}`);
          this._jfWait = { msg: front
            ? `Jellyfin is open on ${tvName}, but Home Assistant can't see it yet. If it asks who's watching, pick a user there — ${name} starts after that.`
            : `Waiting for Jellyfin on ${tvName}… If it asks who's watching, pick a user there — ${name} starts after that.` };
          this._renderInfo();
          ok = await this._waitFn(fresh, 180e3);
        }
      } finally { clearInterval(nudge); this._jfWait = null; this._jfReconnect = null; this._renderInfo(); }
      if (this._jfCancel) { this._toast(tr("Stopped")); return; }
      if (!ok) { this.haptic('failure'); this._toast(`Jellyfin did not connect on ${tvName}`, true); return; }
      this._toast(`Opening ${name}…`);
      await new Promise(r => setTimeout(r, 2500)); // let the app finish loading its home screen
      await send(ses);
    } finally { this._jfBusy = false; }
  }
  // the waiting banner at the top of the Jellyfin sheets
  _jfWaitHTML() {
    const w = this._jfWait; if (!w) return '';
    const admin = this._hass?.user?.is_admin;
    // Quick Connect (jellyfin_tv.quick_connect): the TV's Jellyfin asks for a code; Play once it is signed in
    if (w.qc) return `<div class="jfwait jfqc" role="status"><div class="jfwm">${ic('mdi:account-key')}<span>${esc(w.msg)}</span></div>
      <div class="jfwb"><button class="pill on" data-act="jfqc">${ic('mdi:play')}<span>${tr("I've signed in · Play")}</span></button><button class="pill" data-act="jfcancel"><span>${tr('Cancel')}</span></button></div>
      <div class="jfwh">${tr('Approve the code shown on the TV in Jellyfin on your phone or in a browser: Settings → Quick Connect.')}</div></div>`;
    return `<div class="jfwait" role="status"><div class="jfwm">${ic('mdi:loading', 'spin')}<span>${esc(w.msg)}</span></div>
      ${w.busy ? '' : `<div class="jfwb">${admin && this._jfReconnect ? `<button class="pill" data-act="jfreconnect">${ic('mdi:refresh')}<span>${tr("Reconnect")}</span></button>` : ''}<button class="pill" data-act="jfcancel"><span>${tr("Cancel")}</span></button></div>
      <div class="jfwh">${admin ? 'Reconnect reloads the Jellyfin integration, for when Home Assistant has stopped seeing Jellyfin apps.' : tr("Still nothing? Ask an admin to reload the Jellyfin integration.")}</div>`}</div>`;
  }
  _waitFn(pred, ms) {
    return new Promise(res => { const t0 = Date.now(); const chk = () => { if (pred()) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(chk, 300); }; chk(); });
  }
  _jfHTML(head) {
    // ids in data-item: the Jellyfin item id to play; in data-kind (jfshow:): the show to open.
    // JellyHA's media source ids (media-source://jellyha/<entry>/item/<id> …): the item id is the Jellyfin GUID in it,
    // a show is kept as its whole id (encoded)
    const ha = E.mserver.jellyfin.view === 'jellyha'; // Jellyfin + JellyHA: the library comes from JellyHA
    const guid = x => (String(x || '').match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi) || []).pop() || String(x || '');
    const k = this._info, id8 = x => ha ? guid(x) : String(x || '').replace('media-source://jellyfin/', '');
    const showKey = x => ha ? encodeURIComponent(x) : id8(x);
    const tt = x => ha ? String(x || '').replace(/\s*\(\)$/, '') : x; // JellyHA titles: "Name (2020)", "Name ()" with no year
    const wait = `<div class="jfgrid">${Array.from({ length: 9 }, () => `<div class="jfpo"><div class="jfimg skl"></div>${skl('75%', 10)}</div>`).join('')}</div>`;
    const img = (src, icon) => `<div class="jfimg">${ic(icon)}${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</div>`;
    if (k === 'jflib:movies' || k === 'jflib:shows') {
      const movies = k.endsWith('movies');
      // JellyHA: JellyHA → a folder per server ("JellyHA (name)") → 📽️ Movies / 📺 TV Series (also Recently Added, Favorites…)
      const isLib = c => movies ? /movie|film/i.test(c.title) : /series|shows?\b|\btv\b/i.test(c.title) && !/live/i.test(c.title);
      const haLibs = () => {
        const top = this._jfBrowse('media-source://jellyha'); if (!top) return null;
        const kids = top.children || []; if (kids.some(isLib)) return { children: kids.filter(isLib) };
        const out = []; let busy = false;
        for (const e of kids.filter(c => c.can_expand)) { const d = this._jfBrowse(e.media_content_id); if (!d) busy = true; else out.push(...(d.children || []).filter(isLib)); }
        return busy ? null : { children: out };
      };
      const root = ha ? haLibs() : this._jfBrowse('media-source://jellyfin');
      const H = t => head(movies ? 'mdi:movie-open' : 'mdi:television-classic', movies ? tr("Movies") : tr("Shows"), t);
      if (!root) return H('Jellyfin') + wait;
      const libs = ha ? root.children : (root.children || []).filter(l => /movie/i.test(l.title) === movies);
      let n = 0, loading = false;
      const secs = libs.map(l => {
        const d = this._jfBrowse(l.media_content_id); if (!d) { loading = true; return ''; }
        const items = (d.children || []).slice().sort((a, b) => a.title.localeCompare(b.title)); n += items.length;
        const grid = items.map(c => {
          const play = c.can_play && !c.can_expand;
          return `<button class="jfpo" ${play ? `data-act="jfplay" data-mk="${c.media_class === 'episode' ? 'episode' : 'movie'}"` : `data-act="info" data-kind="jfshow:${showKey(c.media_content_id)}"`} data-item="${id8(c.media_content_id)}" data-title="${esc(tt(c.title))}">
            ${img(c.thumbnail, movies ? 'mdi:movie-open' : 'mdi:television-classic')}${play ? `<i class="jfplayi">${ic('mdi:play')}</i>` : ''}<span>${esc(tt(c.title))}</span></button>`;
        }).join('');
        return `${libs.length > 1 ? `<div class="dsec">${esc(tc(l.title))} · ${items.length}</div>` : ''}<div class="jfgrid">${grid}</div>`;
      }).join('');
      return H(`${loading ? tr("Loading…") : `${n} in Jellyfin`} · ${movies ? `tap to play on ${tc(E.mserver.jellyfin.tv?.name || this._jfTvName(this._jfLauncher()))}` : 'tap a show for its episodes'}`) + (secs || wait);
    }
    if (k.startsWith('jfshow:')) {
      const sid = k.slice(7), show = this._jfBrowse(ha ? decodeURIComponent(sid) : 'media-source://jellyfin/' + sid);
      const back = `<button class="jfback" data-act="info" data-kind="jflib:shows">${ic('mdi:chevron-left')}${tr("Shows")}</button>`;
      if (!show) return head('mdi:television-classic', tr("Show"), 'Loading…') + back + wait;
      const kids = show.children || [];
      const direct = kids.filter(c => c.can_play && !c.can_expand), seasons = kids.filter(c => c.can_expand);
      const si = clamp(this._jfSeason?.[sid] ?? 0, 0, Math.max(0, seasons.length - 1));
      let eps = direct, loading = false;
      if (!direct.length && seasons.length) { const d = this._jfBrowse(seasons[si].media_content_id); if (d) eps = d.children || []; else loading = true; }
      const top = `<div class="jfshowh">${img(show.thumbnail, 'mdi:television-classic')}<div><b>${esc(tt(show.title))}</b><span>${seasons.length ? `${seasons.length} season${seasons.length > 1 ? 's' : ''}` : ''}${eps.length ? `${seasons.length ? ' · ' : ''}${eps.length} episodes${seasons.length > 1 ? ' in this season' : ''}` : ''}</span><em>${tr("Tap an episode to play it on")} ${esc(tc(E.mserver.jellyfin.tv?.name || 'your TV'))}</em></div></div>`;
      const chips = seasons.length > 1 ? `<div class="jfseas">${seasons.map((c, i) => `<button class="${i === si ? 'on' : ''}" data-act="jfseason" data-show="${sid}" data-i="${i}">${esc(c.title)}</button>`).join('')}</div>` : '';
      const epT = c => ha ? String(c.title || '').replace(/^\d+\.\s*/, '') : c.title; // JellyHA numbers its episodes itself ("3. Name")
      const list = eps.map((c, i) => `<button class="jfep" data-act="jfplay" data-mk="episode" data-item="${id8(c.media_content_id)}" data-title="${esc(epT(c))}">
          ${img(c.thumbnail, 'mdi:play-circle-outline')}<div><b>${i + 1}. ${esc(epT(c))}</b></div>${ic('mdi:play', 'jfepp')}</button>`).join('');
      return head('mdi:television-classic', tt(show.title), 'Jellyfin') + back + top + chips + (loading ? wait : list || '<div class="wxwait">No episodes</div>');
    }
    return head('mdi:jellyfish', 'Jellyfin', '') + wait;
  }
  // every loaded config entry of Sonarr / Radarr (one per server), and a service of each, with its response
  async _arrEntries(d) {
    const c = this._arrE || (this._arrE = {}); if (c[d]?.length) return c[d];
    try { const r = await this._hass.callWS({ type: 'config_entries/get', domain: d }); c[d] = (r || []).filter(e => e.state === 'loaded').map(e => e.entry_id); } catch (e) { c[d] = []; }
    return c[d];
  }
  async _arrAll(d, sv, data = {}) {
    const ids = await this._arrEntries(d); if (!ids.length) return null;
    const out = await Promise.all(ids.map(id => this._hass.callService(d, sv, { entry_id: id, ...data }, undefined, false, true).then(r => r?.response || null).catch(() => null)));
    return out.some(Boolean) ? out.filter(Boolean) : null;
  }
  // the items of a service's response: { shows: { key: {…} } } / { movies: {…} } / { episodes: {…} }, whatever its key
  _arrItems(res) {
    const lists = r => { const k = ['episodes', 'movies', 'shows', 'queue', 'items'].find(x => r?.[x] && typeof r[x] === 'object'); return k ? [r[k]] : Object.values(r || {}).filter(v => v && typeof v === 'object'); };
    return (res || []).flatMap(r => lists(r)
      .flatMap(v => Array.isArray(v) ? v : Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? { _key: k, ...x } : { _key: k, progress: x }))));
  }
  // Radarr's wanted (missing) movies: monitored, out (released, or available as Radarr says) and with no file yet
  _radarrWanted(movies) {
    return Object.values(movies || {}).filter(m => m && m.monitored !== false && !m.has_file && (m.is_available ?? m.isAvailable ?? /^released$/i.test(String(m.status || ''))));
  }
  // the Wanted tile: Sonarr's wanted sensor and Radarr's missing movies (from radarr.get_movies), together
  _wantedCount() {
    const S = E.mserver, so = [S.sonarr.wanted, ...(S.sonarr.more || []).map(m => m.wanted)].filter(Boolean).map(id => this.n(id)).filter(x => x != null);
    const tv = so.length ? so.reduce((a, b) => a + b, 0) : null;
    const mvList = this._wanted?.mv || (this._mmeta && S.radarr.movies ? this._radarrWanted(this._mmeta.movies) : null);
    const mv = mvList ? mvList.length : null;
    return { tv, mv, all: tv == null && mv == null ? null : (tv || 0) + (mv || 0) };
  }
  // Wanted sheet: the Library "Wanted ›" tile → Shows (Sonarr's missing episodes, from sonarr.get_wanted, by show) and
  // Movies (Radarr's missing movies, from radarr.get_movies); a tab only shows when it has something
  async _loadWanted() {
    if (this._wantedBusy) return; this._wantedBusy = true;
    const S = E.mserver, n = String(this._wantedCount().tv);
    this._wanted = { at: Date.now(), n, eps: this._wanted?.eps || null, mv: this._wanted?.mv || null };
    const [tv, mv] = await Promise.all([
      S.sonarr.wanted ? this._arrAll('sonarr', 'get_wanted', { max_items: 100 }) : Promise.resolve([]),
      S.radarr.movies ? this._arrAll('radarr', 'get_movies') : Promise.resolve([]),
    ]);
    this._wanted = { at: Date.now(), n, eps: tv ? this._arrItems(tv) : [], mv: mv ? this._radarrWanted(Object.assign({}, ...mv.map(r => r.movies || {}))) : [], err: { tv: !tv && !!S.sonarr.wanted, mv: !mv && !!S.radarr.movies } };
    this._wantedBusy = false;
    if (this._info?.startsWith('wanted')) this._renderInfo();
    this._rerender('mserver');
  }
  // the Shows / Movies tabs of the Wanted and Queue sheets: only the kinds that have something; none when only one does
  _mTabs(sheet, counts, pick) {
    const ks = ['tv', 'mv'].filter(k => counts[k] > 0);
    const cur = ks.includes(this._mTab?.[sheet]) ? this._mTab[sheet] : ks.includes(pick) ? pick : ks[0] || 'tv';
    const bar = ks.length > 1 ? `<div class="jfseas mtabs" role="tablist">${ks.map(k => `<button class="${k === cur ? 'on' : ''}" role="tab" aria-selected="${k === cur}" data-act="mtab" data-s="${sheet}" data-k="${k}">${ic(k === 'tv' ? 'mdi:television-classic' : 'mdi:movie-open')}${k === 'tv' ? tr('Shows') : tr('Movies')} <b>${counts[k]}</b></button>`).join('')}</div>` : '';
    return { cur, bar, ks };
  }
  _wantedHTML(head) {
    const W = this._wanted, lang = this._hass?.locale?.language || 'en', pick = this._info.split(':')[1];
    const H = sub => head('mdi:magnify', tr("Wanted"), sub);
    const wait = `<div class="wtg"><div class="wth"><div class="muppo jfimg skl"></div><div class="mupt">${skl('70%', 16)}${skl('45%', 11, 'margin-top:6px')}</div></div>${Array.from({ length: 2 }, () => `<div class="wte">${skl('60%', 12)}${skl('100%', 10, 'margin-top:8px')}${skl('85%', 10, 'margin-top:5px')}</div>`).join('')}</div>`;
    if (!W?.eps || !W?.mv) return H(tr('Loading…')) + wait;
    const groups = new Map();
    for (const e of W.eps) { const k = e.series_title || 'Unknown'; (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    const nTv = W.eps.length, nMv = W.mv.length;
    if (!nTv && !nMv) {
      const err = W.err?.tv || W.err?.mv;
      return H(err ? tr("Couldn't reach Sonarr / Radarr") : tr("Nothing missing")) + `<div class="mempty">${ic('mdi:check-circle-outline')}${err ? tr("Sonarr / Radarr did not answer.") : tr("Everything monitored that is out is downloaded.")}</div>`;
    }
    const { cur, bar } = this._mTabs('wanted', { tv: nTv, mv: nMv }, pick);
    const day = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }); };
    const sub = [nTv ? (nTv === 1 ? tr('1 episode') : tr('{0} episodes', nTv)) : '', nMv ? (nMv === 1 ? tr('1 movie') : tr('{0} movies', nMv)) : ''].filter(Boolean).join(' · ');
    if (cur === 'mv') {
      const body = W.mv.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title))).map(m => {
        const po = m.images?.poster, rel = m.digital_release || m.physical_release || m.in_cinemas;
        return `<div class="wtg wmv"><div class="wth">${m.images?.fanart ? `<div class="mupbg" style="background-image:url('${esc(this._img(m.images.fanart, 780))}')"></div>` : ''}
          <div class="muppo jfimg">${ic('mdi:movie-open')}${po ? `<img src="${esc(this._img(po, 342))}" alt="" loading="lazy">` : ''}</div>
          <div class="mupt"><b>${esc(m.title || '')}</b><span>${tr('Not downloaded yet')}</span><em>${esc([m.year, m.studio, rel ? day(rel) : '', m.runtime ? tr('{0} min', m.runtime) : ''].filter(Boolean).join(' · '))}</em></div></div>
          ${m.overview ? `<div class="wte"><p>${esc(m.overview)}</p></div>` : ''}</div>`;
      }).join('');
      return H(sub) + bar + body + `<div class="swnote">${ic('mdi:information-outline')}${tr("Released, monitored movies Radarr hasn't downloaded yet. Radarr keeps searching for them automatically.")}</div>`;
    }
    const body = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([show, eps]) => {
      const f = eps[0], po = f.images?.poster;
      eps.sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
      return `<div class="wtg">
        <div class="wth">${f.images?.fanart ? `<div class="mupbg" style="background-image:url('${esc(this._img(f.images.fanart, 780))}')"></div>` : ''}
          <div class="muppo jfimg">${ic('mdi:television-classic')}${po ? `<img src="${esc(this._img(po, 342))}" alt="" loading="lazy">` : ''}</div>
          <div class="mupt"><b>${esc(show)}</b><span>${eps.length === 1 ? tr('1 missing episode') : tr('{0} missing episodes', eps.length)}</span><em>${esc([f.network, f.series_year, f.series_status ? tc(f.series_status) : ''].filter(Boolean).join(' · '))}</em></div></div>
        ${eps.map(e => `<div class="wte"><div class="wtei"><b>${esc(e.episode_identifier || '')}</b><span>${esc(e.title || 'TBA')}</span><em>${e.air_date ? tr('Aired {0}', esc(day(e.air_date_utc || e.air_date))) : ''}${e.runtime ? ` · ${bidi(tr('{0} min', e.runtime))}` : ''}${e.monitored === false ? ` · ${tr('not monitored')}` : ''}</em></div>
          ${e.overview ? `<p>${esc(e.overview)}</p>` : ''}</div>`).join('')}
      </div>`;
    }).join('');
    return H(sub) + bar + body + `<div class="swnote">${ic('mdi:information-outline')}${tr("Aired, monitored episodes Sonarr hasn't downloaded yet. Sonarr keeps searching for them automatically.")}</div>`;
  }
  // Download queue sheet: the queue rows → what Sonarr (Shows) and Radarr (Movies) are downloading, from
  // sonarr.get_queue / radarr.get_queue (each server); the queue sensors' own list when those aren't there
  async _loadQueue() {
    if (this._mqBusy) return; this._mqBusy = true;
    const S = E.mserver, each = (o, k) => [o[k], ...(o.more || []).map(m => m[k])].filter(Boolean);
    const fromSensor = o => each(o, 'queue').flatMap(id => Object.entries(this.s(id)?.attributes || {})
      .filter(([k]) => !['unit_of_measurement', 'friendly_name', 'icon', 'state_class', 'device_class'].includes(k)).map(([k, v]) => ({ _key: k, progress: v })));
    const [tv, mv] = await Promise.all([
      S.sonarr.queue ? this._arrAll('sonarr', 'get_queue') : Promise.resolve(null),
      S.radarr.queue ? this._arrAll('radarr', 'get_queue') : Promise.resolve(null),
    ]);
    this._mq = { at: Date.now(), tv: tv ? this._arrItems(tv) : fromSensor(S.sonarr), mv: mv ? this._arrItems(mv) : fromSensor(S.radarr), live: { tv: !!tv, mv: !!mv } };
    this._mqBusy = false;
    if (this._info?.startsWith('queue')) this._renderInfo();
  }
  _queueHTML(head) {
    const S = E.mserver, Q = this._mq, pick = this._info.split(':')[1];
    if (!Q || Date.now() - Q.at > 30e3) setTimeout(() => this._loadQueue());
    const H = sub => head('mdi:download', tr('Download queue'), sub);
    if (!Q) return H(tr('Loading…')) + Array.from({ length: 3 }, () => `<div class="mqi"><div class="muppo jfimg skl"></div><div>${skl('70%', 13)}${skl('45%', 10, 'margin-top:6px')}${skl('100%', 5, 'margin-top:10px')}</div></div>`).join('');
    const sum = o => [o.queue, ...(o.more || []).map(m => m.queue)].filter(Boolean).map(id => this.n(id)).filter(x => x != null).reduce((a, b) => a + b, 0);
    // a queue sensor counts more than its list shows (the list can be empty): the count stands for the tab
    const nTv = Math.max(Q.tv.length, Q.live.tv ? 0 : sum(S.sonarr)), nMv = Math.max(Q.mv.length, Q.live.mv ? 0 : sum(S.radarr));
    if (!nTv && !nMv) return H(tr('Nothing downloading')) + `<div class="mempty">${ic('mdi:check-circle-outline')}${tr('The Sonarr and Radarr queues are empty.')}</div>`;
    const { cur, bar } = this._mTabs('queue', { tv: nTv, mv: nMv }, pick);
    const list = cur === 'mv' ? Q.mv : Q.tv;
    const pct = x => { const p = parseFloat(x.progress); if (!isNaN(p)) return clamp(p, 0, 100); const sz = +x.size, sl = +(x.size_left ?? x.sizeleft); return sz > 0 && !isNaN(sl) ? clamp((1 - sl / sz) * 100, 0, 100) : null; };
    const left = v => { const m = /^(?:(\d+)\.)?(\d+):(\d+)(?::(\d+))?/.exec(String(v || '')); if (!m) return ''; const min = (+(m[1] || 0)) * 1440 + (+m[2]) * 60 + (+m[3]);
      return min < 1 ? tr('{0} min left', '<1') : min < 60 ? tr('{0} min left', min) : tr('{0} left', `${tr('{0} h', Math.floor(min / 60))}${min % 60 ? ` ${tr('{0} min', min % 60)}` : ''}`); };
    const gb = b => { b = +b; return !b ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`; };
    const ep = x => x.episode_identifier || (x.season_number != null && x.episode_number != null ? `S${String(x.season_number).padStart(2, '0')}E${String(x.episode_number).padStart(2, '0')}` : '');
    const rows = list.map(x => ({ x, p: pct(x) })).sort((a, b) => (b.p ?? -1) - (a.p ?? -1)).map(({ x, p }) => {
      const tv = cur === 'tv', po = x.images?.poster;
      const title = tv ? (x.series_title || x.series?.title || x.title || x._key) : (x.title || x.movie?.title || x._key);
      const sub = tv ? [ep(x), x.episode_title || x.episode?.title].filter(Boolean).join(' · ') : [x.year, x.quality?.name || x.quality].filter(v => v && typeof v !== 'object').join(' · ');
      const st = String(x.tracked_download_state || x.status || '').toLowerCase(), warn = /warn|fail|error|stalled/.test(`${st} ${x.tracked_download_status || ''}`);
      const info = [p != null ? `${p.toFixed(0)}%` : '', st ? tc(pretty(st)) : '', left(x.time_left || x.timeleft), x.size ? gb(x.size) : ''].filter(Boolean).join(' · ');
      return `<div class="mqi ${warn ? 'warn' : ''}"><div class="muppo jfimg">${ic(tv ? 'mdi:television-classic' : 'mdi:movie-open')}${po ? `<img src="${esc(this._img(po, 154))}" alt="" loading="lazy">` : ''}</div>
        <div><b>${esc(title || '')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<div class="jfbar"><i style="width:${(p ?? 0).toFixed(1)}%"></i></div><em>${esc(info)}</em></div></div>`;
    }).join('') || `<div class="mempty">${ic('mdi:information-outline')}${tr('{0} in the queue, but Home Assistant does not list them.', cur === 'mv' ? nMv : nTv)}</div>`;
    const sub = [nTv ? (nTv === 1 ? tr('1 episode') : tr('{0} episodes', nTv)) : '', nMv ? (nMv === 1 ? tr('1 movie') : tr('{0} movies', nMv)) : ''].filter(Boolean).join(' · ');
    return H(sub) + bar + rows;
  }
  _rMedia() {
    const M = E.media; const tv = this.s(M.tv);
    const playing = tv?.state === 'playing';
    const a = tv?.attributes || {};
    const pic = a.entity_picture;
    const toSec = s => { const m = /^(\d+):(\d+):(\d+)$/.exec(s || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null; };
    const used = toSec(this.v(M.ytTimer)), lim = toSec(this.v(M.ytLimit));
    const pct = used != null && lim ? clamp(used / lim * 100, 0, 100) : 0;
    const q = M.qbt;
    return `<div class="ch">${ic('mdi:television-classic')}<h3>${tr("Media")}</h3><span class="pill" style="--c:${playing ? '#f472b6' : '#94a3b8'}">${esc(tv?.state ? tr(pretty(tv.state)) : '—')}</span></div>
      <div class="np ${playing ? 'playing' : ''}" data-act="more" data-id="${M.tv}">
        <div class="art">${pic ? `<img src="${esc(pic)}">` : ic(a.app_name === 'YouTube' ? 'mdi:youtube' : 'mdi:television-play')}</div>
        <div class="npt"><b>${esc(a.media_title || a.app_name || tc(a.friendly_name || 'TV'))}</b><span>${esc([a.media_artist, a.app_name].filter(x => x && x !== (a.media_title || a.app_name)).join(' · ') || tc(a.friendly_name || 'TV'))}</span>
          <div class="eq"><i></i><i></i><i></i><i></i></div></div>
      </div>
      <div class="mctl">
        <button class="ibtn" data-act="media" data-svc="media_previous_track" data-id="${M.tv}">${ic('mdi:skip-previous')}</button>
        <button class="ibtn big" data-act="media" data-svc="media_play_pause" data-id="${M.tv}">${ic(playing ? 'mdi:pause' : 'mdi:play')}</button>
        <button class="ibtn" data-act="media" data-svc="media_next_track" data-id="${M.tv}">${ic('mdi:skip-next')}</button>
        <button class="ibtn" data-act="media" data-svc="volume_down" data-id="${M.tv}" aria-label="Volume down">${ic('mdi:volume-minus')}</button>
        <button class="ibtn" data-act="media" data-svc="volume_up" data-id="${M.tv}" aria-label="Volume up">${ic('mdi:volume-plus')}</button>
      </div>
      ${a.volume_level != null ? this.slider(M.tv, 'vol', Math.max(1, Math.round(a.volume_level * 100)), '#f472b6') : ''}
      <div class="picks col">${this.pickChip(M.tv, 'source', 'Source', 'mdi:import')}</div>
      ${!M.ytTimer ? '' : `<div class="yt">
        <div class="ytl" data-act="more" data-id="${M.ytTimer}" data-id2="${M.ytLimit}">${ic('mdi:youtube')}<span>${tr("Watched today")}</span><b>${esc(this.v(M.ytTimer) || '—')}</b></div>
        <div class="bar"><i style="width:${pct}%;background:${pct > 90 ? '#f43f5e' : pct > 70 ? '#fbbf24' : '#f472b6'}"></i></div>
        <div class="picks col">${this.pickChip(M.ytSelect, 'select', 'Daily limit', 'mdi:timer-sand')}</div>
        <div class="tiles two">
          <button class="tile ${this.on(M.ytBlock) ? 'on red' : ''}" data-act="toggle" data-id="${M.ytBlock}">${ic('mdi:cancel')}<span>${tr("Block")}</span></button>
          ${M.ytForce ? `<button class="tile ${this.on(M.ytForce) ? 'on' : ''}" data-act="toggle" data-id="${M.ytForce}">${ic('mdi:lock-open-variant')}<span>${tr("Force Unblock")}</span></button>` : ''}
        </div>
      </div>`}
`;
  }

  // ---------- Media Server card: Jellyfin now watching, downloads, coming up, library ----------
  // the Jellyfin media players of one integration: 'jellyfin' (official: playing on the TV) or, by default, the one the
  // Media Server card shows (Now Watching): JellyHA with "Jellyfin + JellyHA"
  _jfPlayers(platform) {
    const ents = this._hass?.entities || {}, p = platform || E.mserver.jellyfin.view || 'jellyfin';
    return Object.keys(ents).filter(id => id.startsWith('media_player.') && ents[id].platform === p);
  }
  async _loadMCal() {
    if (this._mcalBusy) return; this._mcalBusy = true;
    try {
      const S = E.mserver, start = new Date(), end = new Date(Date.now() + 14 * 864e5);
      const q = `?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const get = id => this.s(id) ? this._hass.callApi('GET', `calendars/${id}${q}`).catch(() => []) : Promise.resolve([]);
      const cals = o => [o.cal, ...(o.more || []).map(m => m.cal)].filter(Boolean); // every Sonarr / Radarr instance
      const [tv, mv] = (await Promise.all([cals(S.sonarr), cals(S.radarr)].map(ids => Promise.all(ids.map(get))))).map(r => r.flat());
      const when = ev => new Date(ev.start?.dateTime || (ev.start?.date + 'T00:00:00'));
      const items = [
        ...tv.map(ev => { const [show, ep, ...t] = String(ev.summary || '').split(' - '); return { k: 'tv', t: when(ev), show: show || ev.summary, ep: ep || '', title: t.join(' - ') }; }),
        ...mv.map(ev => ({ k: 'mv', t: when(ev), show: ev.summary, ep: '', title: '', rel: ev.release_type || '', allDay: !ev.start?.dateTime, desc: ev.description || '' })),
      ].filter(x => !isNaN(x.t) && x.t >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a.t - b.t); // HA can hand back older all-day releases
      this._mcal = { at: Date.now(), items };
    } catch (e) { this._mcal = { at: Date.now(), items: [] }; }
    this._mcalBusy = false; this._rerender('mserver');
    this._loadMMeta();
  }
  // posters / details for Coming Up from HA's own Sonarr / Radarr integrations (they hold the API keys):
  // sonarr.get_upcoming (series poster + fanart, episode overview, network, runtime) and radarr.get_movies (TMDB poster)
  async _loadMMeta() {
    if (this._mmetaBusy || !this._hass) return; this._mmetaBusy = true;
    const entry = async d => {
      const c = this._mEntry || (this._mEntry = {}); if (d in c) return c[d];
      try { const r = await this._hass.callWS({ type: 'config_entries/get', domain: d }); c[d] = (r || []).find(e => e.state === 'loaded')?.entry_id || null; } catch (e) { c[d] = null; }
      return c[d];
    };
    const svc = async (d, sv, data) => { const id = await entry(d); if (!id) return null; try { const r = await this._hass.callService(d, sv, { entry_id: id, ...data }, undefined, false, true); return r?.response || null; } catch (e) { return null; } };
    const [up, mv] = await Promise.all([svc('sonarr', 'get_upcoming', { days: 15 }), svc('radarr', 'get_movies', {})]);
    this._mmeta = { eps: up?.episodes || {}, movies: mv?.movies || {} };
    this._mmetaBusy = false; this._rerender('mserver'); if (this._info?.startsWith('mup:')) this._renderInfo();
  }
  _mupMeta(x) {
    const M = this._mmeta; if (!M || !x) return null;
    if (x.k === 'tv') {
      const eps = Object.values(M.eps), lc = String(x.show).toLowerCase();
      const ep = M.eps[`${x.show} ${x.ep}`] || eps.find(e => String(e.series_title).toLowerCase() === lc && e.episode_identifier === x.ep);
      const any = ep || eps.find(e => String(e.series_title).toLowerCase() === lc);
      return any ? { poster: any.images?.poster, fanart: any.images?.fanart, overview: ep?.overview, network: any.network, runtime: ep?.runtime || any.runtime, has: ep?.has_file, year: any.series_year, status: any.series_status } : null;
    }
    const lc = String(x.show).toLowerCase(), mv = M.movies[x.show] || Object.values(M.movies).find(m => String(m.title).toLowerCase() === lc);
    return mv ? { poster: mv.images?.poster, fanart: mv.images?.fanart, overview: x.desc, has: mv.has_file, year: mv.year, status: mv.status } : (x.desc ? { overview: x.desc } : null);
  }
  // smaller TMDB sizes for thumbnails (TVDB has one size)
  _img(u, w) { return u ? String(u).replace('/t/p/original/', `/t/p/w${w}/`) : ''; }
  _mupHTML(head) {
    const i = Number(this._info.slice(4)), x = this._mcal?.items?.[i];
    if (!x) return head('mdi:calendar', tr("Coming Up"), '') + '<div class="wxwait">Not found</div>';
    const lang = this._hass?.locale?.language || 'en', m = this._mupMeta(x) || {};
    const REL = { inCinemas: 'In cinemas', digitalRelease: 'Digital release', physicalRelease: 'Blu-ray release' };
    const when = x.t.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }) + (x.k === 'tv' ? ' · ' + x.t.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) : '');
    const chips = [x.k === 'mv' ? REL[x.rel] || 'Movie' : x.ep, m.network, m.year, m.runtime ? tr('{0} min', m.runtime) : '', m.has ? `✓ ${tr('Downloaded')}` : x.k === 'tv' || m.status ? tr("Not downloaded yet") : ''].filter(Boolean);
    const sub = x.k === 'tv' && x.title && x.title !== 'TBA' ? x.title : '';
    return `<div class="sh-h mup-h"><div></div><button class="ibtn" data-act="sheetclose" aria-label="Close">${ic('mdi:close')}</button></div>
      <div class="muph">${m.fanart ? `<div class="mupbg" style="background-image:url('${esc(this._img(m.fanart, 780))}')"></div>` : ''}
        <div class="muppo jfimg">${ic(x.k === 'tv' ? 'mdi:television-classic' : 'mdi:movie-open')}${m.poster ? `<img src="${esc(this._img(m.poster, 500))}" alt="">` : ''}</div>
        <div class="mupt"><b>${esc(x.show)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<em>${ic('mdi:calendar-clock')}${esc(when)}</em></div></div>
      <div class="mupchips">${chips.map(c => `<span>${esc(String(c))}</span>`).join('')}</div>
      ${m.overview ? `<p class="mupov">${esc(m.overview)}</p>` : (this._mmeta ? `<p class="mupov mu">${tr("No description yet.")}</p>` : `<p class="mupov">${skl('100%', 10)}${skl('92%', 10, 'margin-top:6px')}${skl('60%', 10, 'margin-top:6px')}</p>`)}`;
  }
  _rMServer() {
    const S = E.mserver, J = S.jellyfin, PX = S.plex, Q = S.qbt, SO = S.sonarr, RA = S.radarr, lang = this._hass?.locale?.language || 'en';
    if (!this._mcal || Date.now() - this._mcal.at > 30 * 60e3) setTimeout(() => this._loadMCal(), 0);
    // --- now watching: jellyfin players that are playing / paused
    const haJ = J.view === 'jellyha', seen = new Set();
    // JellyHA has a player per user and per device for the same session: one row per session (the device's), no library browser
    const sessions = (J.off ? [] : this._jfPlayers()).filter(id => !haJ || !/library_browser/.test(id))
      .sort((a, b) => haJ ? /jellyha_device_/.test(b) - /jellyha_device_/.test(a) : 0)
      .map(id => [id, this.s(id)]).filter(([, st]) => st && ['playing', 'paused'].includes(st.state) && st.attributes.media_title)
      .filter(([id, st]) => { const k = haJ ? st.attributes.session_id || id : id; if (seen.has(k)) return false; seen.add(k); return true; });
    // Plex: one player per client that is playing (the official integration names them "Plex (<app> - <device>)")
    const ents = this._hass?.entities || {};
    const plex = PX.off ? [] : Object.keys(ents).filter(id => id.startsWith('media_player.') && ents[id].platform === 'plex')
      .map(id => [id, this.s(id)]).filter(([, st]) => st && ['playing', 'paused'].includes(st.state) && st.attributes.media_title);
    // Jellyfin counts as there unless Plex is and Jellyfin has no entities (a Plex-only home: no Jellyfin labels or browser)
    const jfOn = !J.off && (PX.off || !!(J.clients || this._jfPlayers().length || this._jfPlayers('jellyfin').length)), both = jfOn && !PX.off;
    sessions.push(...plex.map(([id, st]) => [id, st, 'Plex']));
    const watch = sessions.map(([id, st, from]) => {
      const a = st.attributes, play = st.state === 'playing';
      const dur = +a.media_duration || 0;
      let pos = +a.media_position || 0; if (play && a.media_position_updated_at) pos += (Date.now() - new Date(a.media_position_updated_at)) / 1000;
      const pct = dur ? clamp(pos / dur * 100, 0, 100) : 0, left = dur ? Math.max(0, Math.round((dur - pos) / 60)) : null;
      const series = a.media_series_title, se = a.media_season != null && a.media_episode != null ? `S${String(a.media_season).padStart(2, '0')}E${String(a.media_episode).padStart(2, '0')}` : '';
      const title = series || a.media_title, sub = series ? [se, a.media_title].filter(Boolean).join(' · ') : (a.media_content_type === 'movie' ? tr("Movie") : tc(pretty(a.media_content_type || '')));
      return `<div class="jfs ${play ? 'play' : ''}" data-act="more" data-id="${id}">
        <div class="jfp">${a.entity_picture ? `<img src="${esc(a.entity_picture)}" alt="" loading="lazy">` : ic(series ? 'mdi:television-classic' : 'mdi:movie-open')}</div>
        <div class="jfi"><b>${esc(title)}</b><span>${esc(sub)}</span>
          <em>${ic(play ? 'mdi:play' : 'mdi:pause')}${esc(tc(String(a.friendly_name || id).replace(/^JellyHA (Device|User)\s+/i, '').replace(/^Plex \((.*)\)$/, '$1')))}${both ? ` · ${from || 'Jellyfin'}` : ''}${left != null ? ` · ${tr('{0} min left', left)}` : ''}</em>
          <div class="jfbar"><i style="width:${pct.toFixed(1)}%"></i></div></div></div>`;
    }).join('');
    const clients = this.n(J.clients);
    // --- downloads
    // several Sonarr / Radarr / qBittorrent instances (one per config entry): their numbers add up
    const each = (o, k) => [o[k], ...(o.more || []).map(m => m[k])].filter(Boolean);
    const sum = (o, k) => { const v = each(o, k).map(id => this.n(id)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const down = sum(Q, 'down') ?? 0, up = sum(Q, 'up') ?? 0, alt = this.on(Q.alt), err = sum(Q, 'errored') ?? 0;
    const qOK = each(Q, 'conn').some(id => this.v(id) === 'connected');
    const queue = [];
    for (const qid of each(SO, 'queue')) for (const [k, v] of Object.entries(this.s(qid)?.attributes || {})) if (!['unit_of_measurement', 'friendly_name', 'icon', 'state_class', 'device_class'].includes(k)) {
      const pct = parseFloat(v); queue.push(`<div class="mqr" data-act="info" data-kind="queue:tv" data-id="${qid}">${ic('mdi:television-classic')}<span>${esc(k)}</span><b>${isNaN(pct) ? esc(String(v)) : pct.toFixed(0) + '%'}</b><div class="jfbar"><i style="width:${isNaN(pct) ? 0 : pct}%"></i></div></div>`);
    }
    const sq = sum(SO, 'queue') ?? 0;
    if (sq > 0 && !queue.length) queue.push(`<div class="mqr" data-act="info" data-kind="queue:tv" data-id="${SO.queue}">${ic('mdi:television-classic')}<span>${sq === 1 ? tr('1 episode in the Sonarr queue') : tr('{0} episodes in the Sonarr queue', sq)}</span><b>${ic('mdi:chevron-right')}</b></div>`);
    const rq = sum(RA, 'queue') ?? 0;
    if (rq > 0) queue.push(`<div class="mqr" data-act="info" data-kind="queue:mv" data-id="${RA.queue}">${ic('mdi:movie-open')}<span>${rq === 1 ? tr('1 movie in the Radarr queue') : tr('{0} movies in the Radarr queue', rq)}</span><b>${ic('mdi:chevron-right')}</b></div>`);
    // --- coming up
    const items = (this._mcal?.items || []).slice(0, 6);
    const day = t => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - d0) / 864e5);
      return d === 0 ? tr("Today") : d === 1 ? tr("Tomorrow") : d < 7 ? t.toLocaleDateString(lang, { weekday: 'long' }) : t.toLocaleDateString(lang, { day: 'numeric', month: 'short' }); };
    const REL = { inCinemas: 'In cinemas', digitalRelease: 'Digital', physicalRelease: 'Blu-ray' };
    const upcoming = items.map((x, n) => `<div class="mup m${x.k}" data-act="info" data-kind="mup:${n}" data-id="${x.k === 'tv' ? SO.cal : RA.cal}">
        <div class="mud"><b>${esc(day(x.t))}</b>${x.k === 'tv' ? `<span>${esc(x.t.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }))}</span>` : ''}</div>
        ${(() => { const po = this._mupMeta(x)?.poster; return po ? `<div class="mupth"><img src="${esc(this._img(po, 154))}" alt="" loading="lazy"></div>` : ic(x.k === 'tv' ? 'mdi:television-classic' : 'mdi:movie-open'); })()}
        <div class="mut"><b>${esc(x.show)}</b><span>${x.k === 'tv' ? esc([x.ep, x.title && x.title !== 'TBA' ? x.title : ''].filter(Boolean).join(' · ')) : esc(REL[x.rel] || 'Movie')}</span></div></div>`).join('');
    // --- library + disks
    const disks = [], byDisk = new Map();
    for (const did of each(SO, 'disk')) for (const [k, v] of Object.entries(this.s(did)?.attributes || {})) {
      const m = String(v).match(/^([\d.]+)\/([\d.]+)\s*([A-Za-z]+)/); if (!m || k === '/') continue;
      const key = m[1] + '/' + m[2], nm = k.replace(/^\//, ''), cur = byDisk.get(key);
      if (!cur || nm.length < cur.nm.length) byDisk.set(key, { nm, free: +m[1], tot: +m[2] });
    }
    for (const { nm: k, free, tot } of byDisk.values()) {
      const used = clamp(100 - free / tot * 100, 0, 100);
      const tb = x => x >= 1000 ? `${(x / 1000).toFixed(1)} TB` : `${Math.round(x)} GB`;
      disks.push(`<div class="mdk" data-act="more" data-id="${SO.disk}">${ic('mdi:harddisk')}<span>${esc(tc(k))}</span><div class="bar"><i style="width:${used.toFixed(1)}%;background:${used > 90 ? '#f43f5e' : used > 75 ? '#fbbf24' : '#a78bfa'}"></i></div><b>${tb(free)} free</b></div>`);
    }
    // the library tiles: Shows / Movies open the Jellyfin library (counts from Sonarr / Radarr); each one shows when its
    // integration is on (the "Found from" switches in the editor)
    const tile = (kind, id, icon, label, cls = '', val) => `<div class="go ${cls}" data-act="${kind ? 'info' : 'more'}"${kind ? ` data-kind="${kind}"` : ''} data-id="${id || ''}">${ic(icon)}<b>${esc(val ?? this.v(id) ?? '—')}</b><span>${label} ›</span></div>`;
    // with no Sonarr / Radarr, Plex's library sensors give the counts, but only with no Jellyfin: with Jellyfin the
    // tiles open Jellyfin's library, so a Plex number would not match what they open
    const pxn = ids => { const v = ids.map(id => this.n(id)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const pxS = PX.off || jfOn ? [] : PX.shows, pxM = PX.off || jfOn ? [] : PX.movies;
    const lib = [(SO.shows || jfOn || pxS.length) && tile(jfOn ? 'jflib:shows' : null, SO.shows || pxS[0], 'mdi:television-classic', tr('Shows'), '', sum(SO, 'shows') ?? pxn(pxS)),
      (RA.movies || jfOn || pxM.length) && tile(jfOn ? 'jflib:movies' : null, RA.movies || pxM[0], 'mdi:movie-open', tr('Movies'), '', sum(RA, 'movies') ?? pxn(pxM)),
      (SO.wanted || RA.movies) && (() => { const w = this._wantedCount(); return tile('wanted', SO.wanted || RA.movies, 'mdi:magnify', tr('Wanted'), (w.all ?? 0) > 0 ? 'warn' : '', w.all); })()].filter(Boolean);
    const pill = sessions.length ? [tr('{0} watching', sessions.length), '#a78bfa'] : down > 0.05 ? [tr("Downloading"), '#60a5fa'] : [tr("Idle"), '#94a3b8'];
    return `<div class="ch">${ic('mdi:server-network')}<h3>${tr("Media Server")}</h3><span class="pill" style="--c:${pill[1]}">${pill[0]}</span></div>
      ${!jfOn && PX.off ? '' : `<div class="dsec">${tr("Now Watching")}${clients != null && jfOn ? ` · ${both ? (clients === 1 ? tr('1 Jellyfin client') : tr('{0} Jellyfin clients', clients)) : clients === 1 ? tr('1 client') : tr('{0} clients', clients)}` : ''}</div>
      ${watch || `<div class="mempty">${ic('mdi:sofa-outline')}${tr(both ? "Nobody is watching" : !jfOn ? "Nobody is watching on Plex" : "Nobody is watching on Jellyfin")}</div>`}`}
      ${lib.length ? `<div class="dsec">${tr("Library")}</div><div class="mlib">${lib.join('')}</div>` : ''}
      ${!SO.cal && !RA.cal ? '' : `<div class="dsec">${tr("Coming Up")}</div>
      ${upcoming || (this._mcal ? `<div class="mempty">${ic('mdi:calendar-blank')}${tr("Nothing in the next two weeks")}</div>`
        : '<div class="mupskel">' + Array.from({ length: 6 }, () => `<div class="mup">${'<div class="mud">' + skl('70%', 12) + skl('45%', 9, 'margin-top:5px') + '</div>'}<div class="mupth skl"></div><div class="mut">${skl('80%', 13)}${skl('50%', 10, 'margin-top:6px')}</div></div>`).join('') + skPill('Loading the calendar…') + '</div>')}`}
      ${!Q.down ? '' : `<div class="dsec">${tr("Downloads")}</div>
      <div class="mdl">
        <div data-act="more" data-id="${Q.down}" class="${down > 0.05 ? 'act' : ''}">${ic('mdi:arrow-down-bold')}<b>${down.toFixed(1)}<small>MB/s</small></b><span>${tr("Download")}</span></div>
        <div data-act="more" data-id="${Q.up}" class="${up > 0.05 ? 'act up' : ''}">${ic('mdi:arrow-up-bold')}<b>${up.toFixed(1)}<small>MB/s</small></b><span>${tr("Upload")}</span></div>
        <div data-act="more" data-id="${Q.active}" data-id2="${Q.all}">${ic(err ? 'mdi:alert-circle' : 'mdi:magnet')}<b>${esc(sum(Q, 'active') ?? '—')}<small>/ ${esc(sum(Q, 'all') ?? '—')}</small></b><span>${err ? tr('{0} errored', err) : tr('Active torrents')}</span></div>
        <button class="${alt ? 'on' : ''}" data-act="toggle" data-id="${Q.alt}">${ic(alt ? 'mdi:speedometer-slow' : 'mdi:speedometer')}<b>${alt ? tr("Slow") : tr("Full")}</b><span>${tr("Speed limit")}</span></button>
      </div>`}
      ${queue.length ? `<div class="mq">${queue.join('')}</div>` : ''}
      ${disks.length ? `<div class="dsec">${tr("Storage")}</div><div class="mdks">${disks.join('')}</div>` : ''}`;
  }

  _rTvLight() {
    const T = E.tvLight; const st = this.s(T.light); const on = st?.state === 'on';
    const dim = st && (st.attributes.supported_color_modes || []).some(m => m !== 'onoff');
    const pct = st?.attributes.brightness ? Math.max(1, Math.round(st.attributes.brightness / 2.55)) : 100;
    const echoes = E.media.echoes.filter(e => this.s(e)).map(e => {
      const es = this.s(e); const vol = es.attributes.volume_level;
      return `<div class="echo"><div class="mini" data-act="more" data-id="${e}">${ic('mdi:speaker')}<span>${esc(tc(es.attributes.friendly_name))}</span><b>${esc(pretty(es.state))}</b></div>
        ${vol != null ? this.slider(e, 'vol', Math.max(1, Math.round(vol * 100)), '#60a5fa') : ''}</div>`;
    }).join('');
    return `<div class="ch">${ic('mdi:television-ambient-light')}<h3>${E.tvLight.light ? tr("TV Light &amp; Speakers") : tr("Speakers")}</h3><span class="pill" style="--c:${on ? '#fbbf24' : '#94a3b8'}">${on ? tr("Light on") : tr("Light off")}</span></div>
      ${st ? `<div class="lwrap ${on ? 'on' : ''}"><button class="lrow ${on ? 'on' : ''}" data-act="toggle" data-id="${T.light}">${ic(on ? 'mdi:led-strip-variant' : 'mdi:led-strip-variant-off')}<span>${tr("TV Backlight")}</span><b>${on ? 'On' : tr("Off")}</b></button>
        ${on && dim ? this.slider(T.light, 'bright', pct, '#fbbf24') : ''}</div>` : ''}
      <div class="picks col">${T.selects.map(([id, n, i]) => this.pickChip(id, 'select', n, i)).join('')}${on ? this.pickChip(T.light, 'effect', 'Effect', 'mdi:auto-fix') : ''}</div>
      ${echoes ? `<div class="dsec">${tr("Speakers")}</div>${echoes}` : ''}`;
  }
}
