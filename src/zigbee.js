// Sweet Home — Zigbee: the devices of Zigbee2MQTT or ZHA as one list, whichever runs the network. Pure (no DOM, no
// Home Assistant calls): the card hands it hass and what it heard live (Zigbee2MQTT's MQTT topics, ZHA's device list),
// and the unit tests (test/model.test.mjs) hand it made-up ones.
//
// What comes from where:
// - Home Assistant's device registry: which devices are Zigbee (Zigbee2MQTT: identifier `zigbee2mqtt_0x…`, ZHA: `zha`),
//   their name, area, model; their entities: link quality (`…_linkquality`, unit `lqi`), last seen (`…_last_seen`),
//   battery. A device whose entities are all `unavailable` is offline: that is how Zigbee2MQTT's availability and ZHA
//   show it in Home Assistant.
// - Zigbee2MQTT over MQTT (admins only): `bridge/devices` (router or end device, mains or battery), `bridge/info`
//   (coordinator, channel, availability and last_seen settings), `bridge/state`, each device's `availability`, and the
//   devices' own messages (link quality, and the time they last spoke).
// - ZHA's `zha/devices` (admins only): role, power, LQI / RSSI, last seen and availability, as ZHA has them.

// Zigbee2MQTT's own availability timeouts (its defaults): a mains device is pinged after 10 min of silence and is offline
// when it doesn't answer; a battery device is offline after 25 h of silence. With availability switched off in Zigbee2MQTT
// nothing is pinged, so the card can only go by silence: every device it knows the last word of is offline after 25 h
// (a quiet plug is not offline after 10 min).
export const ZB_PASSIVE_MIN = 1500;
export const ZB_LQI_MIN = 60;
export const ZB_VIEWS = ['summary', 'list', 'map'];
export const ZB_ALERTS = ['offline', 'weak'];

const Z2M_ID = /^zigbee2mqtt_(0x[0-9a-f]{16})$/i, Z2M_BRIDGE = /^zigbee2mqtt_bridge_(0x[0-9a-f]{16})$/i;
// one form for an IEEE address: Zigbee2MQTT writes 0x00158d0001a2b3c4, ZHA 00:15:8d:00:01:a2:b3:c4
export const ieeeKey = s => String(s ?? '').toLowerCase().replace(/^0x/, '').replace(/[^0-9a-f]/g, '');
const numOf = st => { const n = st && !['unavailable', 'unknown', ''].includes(st.state) ? parseFloat(st.state) : NaN; return isFinite(n) ? n : null; };
const timeOf = v => { if (v == null || v === '') return null; const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); return isFinite(t) ? t : null; };
const ids = dev => (dev?.identifiers || []).map(i => (Array.isArray(i) ? i : [null, i]));

// which integration runs the network: the one asked for, else the one whose devices Home Assistant has
export function zbSource(hass, want) {
  if (want === 'z2m' || want === 'zha') return want;
  const devs = Object.values(hass?.devices || {});
  if (devs.some(d => ids(d).some(([dom, v]) => dom === 'mqtt' && (Z2M_ID.test(v) || Z2M_BRIDGE.test(v))))) return 'z2m';
  if (devs.some(d => ids(d).some(([dom]) => dom === 'zha'))) return 'zha';
  return null;
}

// the Zigbee panel's settings (`panels.zigbee`), with their defaults
export function zbConfig(P) {
  const z = P && typeof P === 'object' ? P : {}, arr = v => (Array.isArray(v) ? v : v == null || v === '' ? null : [v]);
  const pick = (v, all) => { const a = arr(v); return a ? a.filter(x => all.includes(x)) : [...all]; };
  const n = Number(z.lqi_min);
  return {
    on: P !== false,
    source: ['z2m', 'zha'].includes(z.source) ? z.source : null,
    base: String(z.base_topic || 'zigbee2mqtt').replace(/^\/+|\/+$/g, '') || 'zigbee2mqtt',
    views: pick(z.views, ZB_VIEWS), alerts: pick(z.alerts, ZB_ALERTS),
    autoScan: z.auto_scan !== false, // a new network map when the map opens and the last one is 10 min old or more
    lqiMin: z.lqi_min != null && z.lqi_min !== '' && isFinite(n) ? Math.max(0, Math.min(255, n)) : ZB_LQI_MIN,
  };
}

// Zigbee2MQTT's availability setting from bridge/info: on (true), off (false; its default), or null when not known
function z2mAvail(info) {
  const v = info?.config?.availability; if (!info) return null;
  return v && typeof v === 'object' ? v.enabled !== false : !!v;
}

/**
 * The network as one model.
 * @param hass  Home Assistant (states, entities, devices, areas)
 * @param opts  { source: 'z2m' | 'zha' | null (found on its own) }
 * @param live  what the card heard: Zigbee2MQTT { devices, info, state, avail: {name: bool}, seen: {name: {lqi, at}} },
 *              ZHA { zha: [...] }
 * @returns { source, bridge: { online, coordinator, channel, version, lastSeenOff, entity }, devices: [...] }
 *   each device: { id, ieee, name, area, model, maker, role ('R' router / 'E' end device / null), roleKnown, power
 *   ('mains' / 'battery'), battery, lqi, rssi, lastSeen (ms), exact (lastSeen is when it last spoke, not just when an
 *   entity last changed), online (true / false / null: not known), entity (for its details), entities }
 */
export function zigbeeModel(hass, opts = {}, live = {}, now = Date.now()) {
  const src = zbSource(hass, opts.source);
  const out = { source: src, bridge: { online: null, coordinator: null, channel: null, version: null, lastSeenOff: false, entity: null }, devices: [], links: [], map: null };
  if (!src) return out;
  const states = hass?.states || {}, ents = hass?.entities || {}, areas = hass?.areas || {};
  const byKey = new Map(); // ieee → device
  let bridgeDev = null;
  for (const dev of Object.values(hass?.devices || {})) {
    let ieee = null;
    for (const [dom, v] of ids(dev)) {
      if (src === 'z2m' && dom === 'mqtt') { const m = String(v).match(Z2M_ID); if (m) ieee = m[1]; else if (Z2M_BRIDGE.test(v)) bridgeDev = dev; }
      if (src === 'zha' && dom === 'zha') ieee = v;
    }
    if (!ieee) continue;
    byKey.set(ieeeKey(ieee), { id: dev.id, ieee: String(ieee), name: dev.name_by_user || dev.name || String(ieee), areaId: dev.area_id || null,
      model: dev.model || null, maker: dev.manufacturer || null, role: null, roleKnown: false, power: null, battery: null, lqi: null, rssi: null,
      lastSeen: null, exact: false, online: null, entity: null, entities: [] });
  }
  // each device's entities (the ones Home Assistant has a state for)
  const devIdx = new Map([...byKey.values()].map(d => [d.id, d]));
  const bridgeEnts = [];
  for (const [eid, e] of Object.entries(ents)) {
    if (!states[eid] || !e?.device_id) continue;
    const d = devIdx.get(e.device_id); if (d) d.entities.push(eid); else if (bridgeDev && e.device_id === bridgeDev.id) bridgeEnts.push(eid);
  }
  for (const d of byKey.values()) {
    const sts = d.entities.sort().map(id => states[id]);
    const lq = sts.find(s => /_(linkquality|lqi)$/.test(s.entity_id) || s.attributes?.unit_of_measurement === 'lqi');
    const rs = sts.find(s => /_rssi$/.test(s.entity_id) && s.entity_id.startsWith('sensor.'));
    const seen = sts.find(s => s.entity_id.startsWith('sensor.') && /_last_seen$/.test(s.entity_id));
    const bat = sts.find(s => s.entity_id.startsWith('sensor.') && s.attributes?.device_class === 'battery' && s.attributes?.unit_of_measurement === '%');
    d.lqi = numOf(lq); d.rssi = numOf(rs); d.battery = numOf(bat);
    d.power = bat ? 'battery' : 'mains';
    const ex = seen ? timeOf(seen.state) : null;
    // last seen: its own sensor when it has one; else the last time any of its entities changed (not exact)
    d.lastSeen = ex ?? (sts.reduce((m, s) => Math.max(m, timeOf(s.last_updated) ?? timeOf(s.last_changed) ?? 0), 0) || null); d.exact = ex != null;
    if (sts.length) d.online = !sts.every(s => s.state === 'unavailable');
    d.entity = (lq || bat || sts.find(s => !/^(update|button|select|number)\./.test(s.entity_id)) || sts[0])?.entity_id || null;
    d.area = d.areaId ? areas[d.areaId]?.name || null : null;
  }

  const B = out.bridge;
  if (src === 'z2m') {
    // the bridge in Home Assistant: its connection state and version
    const conn = bridgeEnts.find(id => /connection_state$/.test(id));
    if (conn) { B.entity = conn; const s = states[conn].state; B.online = s === 'on' ? true : s === 'off' ? false : null; }
    const ver = bridgeEnts.find(id => /^sensor\..*_version$/.test(id) && !/coordinator/.test(id));
    if (ver && !['unavailable', 'unknown', ''].includes(states[ver].state)) B.version = states[ver].state;
    const info = live.info || null;
    if (info) {
      B.coordinator = [info.coordinator?.type, info.coordinator?.meta?.revision].filter(x => x != null && x !== '').join(' ') || null;
      B.channel = info.network?.channel ?? null; B.version = info.version || B.version;
      B.lastSeenOff = String(info.config?.advanced?.last_seen ?? 'disable') === 'disable';
    }
    if (live.state === 'online' || live.state === 'offline') B.online = live.state === 'online';
    // bridge/devices: role and power as Zigbee2MQTT has them; a device Home Assistant doesn't have is added
    for (const z of live.devices || []) {
      if (!z?.ieee_address) continue;
      const k = ieeeKey(z.ieee_address);
      if (z.type === 'Coordinator') { if (!B.coordinator && z.model_id) B.coordinator = z.model_id; continue; }
      if (z.disabled) { byKey.delete(k); continue; }
      let d = byKey.get(k);
      if (!d) { d = { id: z.ieee_address, ieee: z.ieee_address, name: z.friendly_name || z.ieee_address, areaId: null, area: null, model: null, maker: null, role: null, roleKnown: false, power: null, battery: null, lqi: null, rssi: null, lastSeen: null, exact: false, online: null, entity: null, entities: [] }; byKey.set(k, d); }
      d.friendly = z.friendly_name || null;
      if (z.type === 'Router' || z.type === 'EndDevice') { d.role = z.type === 'Router' ? 'R' : 'E'; d.roleKnown = true; }
      if (z.power_source) d.power = /battery/i.test(z.power_source) ? 'battery' : 'mains';
      d.model = d.model || z.definition?.model || z.model_id || null; d.maker = d.maker || z.definition?.vendor || z.manufacturer || null;
    }
    // what the devices said on MQTT: availability, link quality, when they last spoke
    const byName = new Map([...byKey.values()].map(d => [d.friendly || d.name, d]));
    for (const [n, on] of Object.entries(live.avail || {})) { const d = byName.get(n); if (d && typeof on === 'boolean') d.online = on; }
    for (const [n, s] of Object.entries(live.seen || {})) {
      const d = byName.get(n); if (!d || !s) continue;
      if (s.lqi != null && isFinite(s.lqi)) d.lqi = Number(s.lqi);
      if (s.at && (!d.exact || s.at > d.lastSeen)) { d.lastSeen = d.exact ? Math.max(d.lastSeen, s.at) : s.at; d.exact = true; }
    }
    // availability switched off in Zigbee2MQTT: offline after 25 h of silence, when the card knows when a device last spoke
    if (z2mAvail(info) === false) for (const d of byKey.values()) if (d.exact && d.lastSeen) d.online = now - d.lastSeen <= ZB_PASSIVE_MIN * 60e3;
  } else {
    // ZHA's own list (admins): role, power, LQI / RSSI, last seen and availability; its neighbour tables make the map
    const zmap = live.zha ? { coord: null, at: live.zhaAt || null, entries: [] } : null;
    for (const z of live.zha || []) {
      if (!z?.ieee) continue;
      const k = ieeeKey(z.ieee);
      for (const n of z.neighbors || []) if (n?.ieee) zmap.entries.push({ reporter: z.ieee, neighbor: n.ieee, lqi: Number(n.lqi), rel: REL[n.relationship] || 'other' });
      if (z.device_type === 'Coordinator') { zmap.coord = z.ieee; B.coordinator = [z.manufacturer, z.model].filter(Boolean).join(' ') || null; B.online = z.available !== false; continue; }
      let d = byKey.get(k);
      if (!d) { d = { id: z.device_reg_id || z.ieee, ieee: z.ieee, name: z.user_given_name || z.name || z.ieee, areaId: z.area_id || null, area: z.area_id ? areas[z.area_id]?.name || null : null, model: z.model || null, maker: z.manufacturer || null, role: null, roleKnown: false, power: null, battery: null, lqi: null, rssi: null, lastSeen: null, exact: false, online: null, entity: null, entities: [] }; byKey.set(k, d); }
      if (z.device_type === 'Router' || z.device_type === 'EndDevice') { d.role = z.device_type === 'Router' ? 'R' : 'E'; d.roleKnown = true; }
      if (z.power_source) d.power = /^mains/i.test(z.power_source) ? 'mains' : 'battery';
      if (z.lqi != null && isFinite(z.lqi)) d.lqi = Number(z.lqi);
      if (z.rssi != null && isFinite(z.rssi)) d.rssi = Number(z.rssi);
      const t = timeOf(z.last_seen); if (t) { d.lastSeen = t; d.exact = true; }
      if (typeof z.available === 'boolean') d.online = z.available;
    }
    if (B.online == null && byKey.size) B.online = true; // ZHA runs inside Home Assistant
    if (zmap?.entries.length) out.map = zmap;
  }
  if (src === 'z2m' && live.map?.entries) out.map = live.map;
  // not told whether it is a router: mains devices route, battery devices don't (true for nearly every Zigbee device)
  for (const d of byKey.values()) { if (!d.power) d.power = 'mains'; if (!d.role) d.role = d.power === 'battery' ? 'E' : 'R'; }
  // the bridge is down: nothing is known about the devices
  if (B.online === false) for (const d of byKey.values()) d.online = null;
  // a device with nothing to go by (no entity and not in the live list) is left out: a coordinator, or one removed
  out.devices = [...byKey.values()].filter(d => d.entities.length || d.roleKnown || d.lqi != null).sort((a, b) => a.name.localeCompare(b.name));
  if (out.map) zbApplyMap(out);
  return out;
}

// relationships in a neighbour table, as the reporting device sees its neighbour (Zigbee2MQTT: numbers, ZHA: names)
const REL = { 0: 'parent', 1: 'child', 2: 'sibling', Parent: 'parent', Child: 'child', Sibling: 'sibling' };

// Zigbee2MQTT's network map (bridge/response/networkmap, type raw) → { coord, entries: [{reporter, neighbor, lqi, rel}] }.
// Each link is one row of a router's neighbour table: `target` is the router that reported it, `source` its neighbour.
export function z2mMap(resp, at = Date.now()) {
  const v = resp?.data?.value || resp?.value; if (!v || !Array.isArray(v.nodes) || !Array.isArray(v.links)) return null;
  const ie = x => x?.ieeeAddr || x?.ieee_address || null;
  return {
    coord: ie(v.nodes.find(n => n.type === 'Coordinator')), at,
    entries: v.links.map(l => ({ reporter: ie(l.target), neighbor: ie(l.source), lqi: Number(l.linkquality ?? l.lqi), rel: REL[l.relationship] || 'other' })).filter(e => e.reporter && e.neighbor),
  };
}

// the map on the devices: the links (one per pair, its best link quality), each device's parent (the router or the
// coordinator it goes through), its hops to the coordinator, and whether its parent is offline. Routers find their way
// to the coordinator through the routers nearest to it (fewest hops, best link quality first).
function zbApplyMap(out) {
  const M = out.map, byKey = new Map(out.devices.map(d => [ieeeKey(d.ieee), d])), byId = new Map(out.devices.map(d => [d.id, d]));
  const cKey = M.coord ? ieeeKey(M.coord) : null;
  const idOf = ie => { const k = ieeeKey(ie); return k === cKey ? 'coord' : byKey.get(k)?.id || null; };
  const links = new Map(), told = new Map(), adj = new Map();
  for (const e of M.entries) {
    const a = idOf(e.reporter), b = idOf(e.neighbor); if (!a || !b || a === b) continue;
    const lqi = isFinite(e.lqi) ? e.lqi : null, k = [a, b].sort().join('|'), was = links.get(k);
    if (!was) links.set(k, { a, b, lqi }); else if (lqi != null && (was.lqi == null || lqi > was.lqi)) was.lqi = lqi;
    (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    // a parent named in a neighbour table: "child" means the neighbour hangs off the reporter, "parent" the other way
    const [kid, par] = e.rel === 'child' ? [b, a] : e.rel === 'parent' ? [a, b] : [null, null];
    if (kid && (!told.has(kid) || (lqi ?? 0) > told.get(kid).lqi)) told.set(kid, { par, lqi: lqi ?? 0 });
  }
  out.links = [...links.values()];
  const lq = (a, b) => links.get([a, b].sort().join('|'))?.lqi ?? -1;
  const routes = id => id === 'coord' || byId.get(id)?.role === 'R';
  // hops from the coordinator, through routers only (end devices don't pass messages on)
  const hops = new Map([['coord', 0]]), q = ['coord'];
  while (q.length) { const x = q.shift(); if (!routes(x)) continue; for (const y of adj.get(x) || []) if (!hops.has(y)) { hops.set(y, hops.get(x) + 1); q.push(y); } }
  for (const d of out.devices) {
    const nb = [...(adj.get(d.id) || [])].filter(routes);
    let par = told.get(d.id)?.par;
    if (!par || !routes(par)) {
      const h = hops.get(d.id), up = nb.filter(n => hops.has(n) && (h == null || hops.get(n) < h));
      par = (up.length ? up : nb).sort((a, b) => (hops.get(a) ?? 99) - (hops.get(b) ?? 99) || lq(d.id, b) - lq(d.id, a))[0] || null;
    }
    d.parent = par || null; d.hops = hops.get(d.id) ?? null;
    if (d.lqi == null && par && lq(d.id, par) >= 0) d.lqi = lq(d.id, par);
  }
  for (const d of out.devices) d.parentOff = !!d.parent && d.parent !== 'coord' && byId.get(d.parent)?.online === false && d.online !== false;
}

// the way from a device to the coordinator: [device id, its parent, …, 'coord'] (stops if it goes round in a circle)
export function zbRoute(m, id) {
  const byId = new Map(m.devices.map(d => [d.id, d])), r = [id];
  for (let x = byId.get(id); x?.parent && !r.includes(x.parent); x = byId.get(x.parent)) r.push(x.parent);
  return r;
}

// how a device is doing: off (offline), weak (link quality below the limit), orphan (the router it goes through is
// offline), ok
export const zbStatus = (d, lqiMin = ZB_LQI_MIN) => d.online === false ? 'off' : d.lqi != null && d.lqi < lqiMin ? 'weak' : d.parentOff ? 'orphan' : 'ok';

// the numbers the Summary shows
export function zbSummary(m, lqiMin = ZB_LQI_MIN) {
  const D = m.devices, st = D.map(d => zbStatus(d, lqiMin));
  const R = D.filter(d => d.role === 'R');
  const live = D.filter((d, i) => st[i] !== 'off');
  const withLqi = live.filter(d => d.lqi != null).sort((a, b) => a.lqi - b.lqi);
  const quiet = live.filter(d => d.lastSeen).sort((a, b) => a.lastSeen - b.lastSeen);
  const bats = live.filter(d => d.battery != null).sort((a, b) => a.battery - b.battery);
  return {
    total: D.length, online: st.filter(s => s !== 'off').length, healthy: st.filter(s => s === 'ok').length,
    routers: R.length, routersOnline: R.filter(d => zbStatus(d, lqiMin) !== 'off').length,
    offline: st.filter(s => s === 'off').length, weak: st.filter(s => s === 'weak').length,
    weakest: withLqi[0] || null, quietest: quiet[0] || null, lowestBattery: bats[0] || null,
    hasLqi: D.some(d => d.lqi != null), hasExact: D.some(d => d.exact),
  };
}
