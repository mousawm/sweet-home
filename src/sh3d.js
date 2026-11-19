/*
 * Sweet Home — import a floor plan drawn in Sweet Home 3D (www.sweethome3d.com).
 *
 * A .sh3d file is a ZIP. Since Sweet Home 3D 5.3 it holds a `Home.xml` entry that describes the home: levels, walls,
 * rooms (outlines), doors and windows, and furniture, in centimetres with y running down the plan. This reads that
 * entry (no library: the browser unzips it) and turns it into the card's own `house` settings: rooms with their
 * outline, doors, windows, openings, separate walls, furniture and floors. Nothing else in the card changes: the
 * result is the same YAML you could type by hand or draw in the editor.
 *
 * What maps to what:
 *   room (outline + name)      → a room with `points` (or `rects` when it is a plain rectangle), linked to the
 *                                Home Assistant area with the same name
 *   wall                       → room edges are moved onto the wall's centre line, so two rooms share one wall;
 *                                a wall that is not on a room edge becomes a separate wall (`extra_walls`); where two
 *                                rooms meet with no wall between them, an opening
 *   door / window / door frame → `doors` / `windows` / `openings`, on the wall they sit in
 *   furniture                  → the card's nearest piece (bed, sofa, table…; anything else a cabinet), in its room
 *   level                      → `level` on everything, and the floor names
 */
import { inPoly, polyArea } from './model.js';

export class ImportError extends Error {
  // code: not-sh3d | old-version | damaged | browser | empty
  constructor(code) { super(code); this.code = code; }
}

/* ------------------------------------------------------------------ */
/* the ZIP: find Home.xml and inflate it                               */
/* ------------------------------------------------------------------ */
const utf8 = u8 => new TextDecoder('utf-8').decode(u8);
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new ImportError('browser');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// the text of Home.xml in a .sh3d file (or the file itself when it is that XML already)
export async function sh3dXml(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (utf8(u8.subarray(0, 64)).replace(/^﻿/, '').trimStart().startsWith('<')) return utf8(u8);
  if (u8.length < 22 || u8[0] !== 0x50 || u8[1] !== 0x4b) throw new ImportError('not-sh3d');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = -1; // end of central directory: the last 22 bytes, plus a comment of up to 64 KB
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 0xffff); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new ImportError('damaged');
  const count = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true), sawHome = false;
  for (let k = 0; k < count && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
    const loc = dv.getUint32(p + 42, true), name = utf8(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    if (name === 'Home') sawHome = true;
    if (name !== 'Home.xml') continue;
    if (loc + 30 > u8.length || dv.getUint32(loc, true) !== 0x04034b50) throw new ImportError('damaged');
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true), data = u8.subarray(start, start + size);
    if (method === 0) return utf8(data);
    if (method === 8) { try { return utf8(await inflateRaw(data)); } catch (e) { if (e instanceof ImportError) throw e; throw new ImportError('damaged'); } }
    throw new ImportError('damaged');
  }
  // a home saved before Sweet Home 3D 5.3 only has the Java "Home" entry, which a browser can't read
  throw new ImportError(sawHome ? 'old-version' : 'not-sh3d');
}

/* ------------------------------------------------------------------ */
/* the XML: a small reader for the plain XML Sweet Home 3D writes      */
/* ------------------------------------------------------------------ */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
export function parseXml(xml) {
  const root = { tag: '#root', a: {}, kids: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:'[^']*'|"[^"]*"))*)\s*(\/?)>/g;
  for (const m of String(xml).matchAll(re)) {
    if (m[1]) { while (stack.length > 1 && stack.pop().tag !== m[1]); continue; }
    if (!m[2]) continue;
    const a = {};
    for (const q of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) a[q[1]] = unesc(q[2] ?? q[3]);
    const el = { tag: m[2], a, kids: [] }; stack[stack.length - 1].kids.push(el);
    if (!m[4]) stack.push(el);
  }
  return root;
}

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
// Home.xml → plain lists, in metres (x to the east, z = Sweet Home 3D's y, to the south)
export function readHome(xml) {
  const home = parseXml(xml).kids.find(k => k.tag === 'home');
  if (!home) throw new ImportError('not-sh3d');
  const out = { wallHeight: num(home.a.wallHeight, 250) / 100, levels: [], walls: [], rooms: [], pieces: [] };
  const walk = (list, inherit) => {
    for (const { tag, a, kids } of list) {
      const level = a.level ?? inherit.level, visible = inherit.visible && a.visible !== 'false';
      if (tag === 'level') out.levels.push({ id: a.id, name: (a.name || '').trim(), elevation: num(a.elevation) / 100, index: num(a.elevationIndex, -1), height: num(a.height, 250) / 100 });
      else if (tag === 'wall') out.walls.push({ level, a: [num(a.xStart) / 100, num(a.yStart) / 100], b: [num(a.xEnd) / 100, num(a.yEnd) / 100], t: num(a.thickness, 10) / 100, h: a.height != null ? num(a.height) / 100 : null, arc: num(a.arcExtent, 0) });
      else if (tag === 'room') out.rooms.push({ level, name: (a.name || '').trim(), points: kids.filter(k => k.tag === 'point').map(k => [num(k.a.x) / 100, num(k.a.y) / 100]) });
      else if (tag === 'furnitureGroup') walk(kids, { level, visible }); // the pieces of a group carry their own position
      else if (tag === 'pieceOfFurniture' || tag === 'doorOrWindow' || tag === 'light') {
        out.pieces.push({
          kind: tag === 'doorOrWindow' || a.doorOrWindow === 'true' ? 'door' : tag, level, visible,
          name: (a.name || '').trim(), catalog: a.catalogId || '', x: num(a.x) / 100, z: num(a.y) / 100, angle: num(a.angle),
          w: num(a.widthInPlan ?? a.width) / 100, d: num(a.depthInPlan ?? a.depth) / 100, h: num(a.heightInPlan ?? a.height) / 100,
          elev: num(a.elevation) / 100, color: /^[0-9a-f]{8}$/i.test(a.color || '') ? '#' + a.color.slice(2).toLowerCase() : null, stairs: !!a.staircaseCutOutShape,
        });
      }
    }
  };
  walk(home.kids, { level: undefined, visible: true });
  return out;
}

/* ------------------------------------------------------------------ */
/* geometry helpers (metres)                                            */
/* ------------------------------------------------------------------ */
const r2 = v => Math.round(v * 100) / 100 || 0; // centimetres (and no -0)
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const unit = (p, q) => { const L = dist(p, q); return L < 1e-9 ? null : [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; };
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const PAR = 0.035; // ~2°: two lines run the same way
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const lineDist = (p, a, u) => Math.abs((p[0] - a[0]) * u[1] - (p[1] - a[1]) * u[0]);
const proj = (p, a, u) => { const t = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]; return [a[0] + u[0] * t, a[1] + u[1] * t]; };
const meet = (p1, u1, p2, u2) => { const den = cross(u1, u2); if (Math.abs(den) < 1e-6) return null; const t = cross([p2[0] - p1[0], p2[1] - p1[1]], u2) / den; return [p1[0] + u1[0] * t, p1[1] + u1[1] * t]; };
// the stretches of a → b (as [from, to] points) at least `min` long where covered(point, direction) is false
function gaps(a, b, covered, min = 0.3) {
  const L = dist(a, b), u = unit(a, b); if (!u || L < min) return [];
  const n = Math.max(2, Math.ceil(L / 0.05)), at = t => [a[0] + u[0] * t, a[1] + u[1] * t], out = [];
  let s = null;
  for (let i = 0; i < n; i++) {
    const t0 = (L * i) / n, t1 = (L * (i + 1)) / n, open = !covered(at((t0 + t1) / 2), u);
    if (open && s == null) s = t0;
    if ((!open || i === n - 1) && s != null) { const e = open ? t1 : t0; if (e - s >= min - 1e-6) out.push([at(s), at(e)]); s = null; }
  }
  return out;
}
// a Sweet Home 3D arc wall: how far its middle bows off the straight line, signed the card's way (positive: towards
// (dz, −dx) of from → to, the side Sweet Home 3D bulges to for a positive arcExtent)
const arcBow = (a, b, arc) => Math.sign(arc) * (dist(a, b) / 2) * Math.tan(Math.abs(arc) / 4);
function arcPoints(a, b, bow, k = 8) {
  const c = dist(a, b), s = Math.abs(bow), u = unit(a, b); if (!u || !s) return [];
  const n = [u[1] * Math.sign(bow), -u[0] * Math.sign(bow)], R = (c * c / 4 + s * s) / (2 * s), Phi = 4 * Math.atan(2 * s / c);
  const ctr = [(a[0] + b[0]) / 2 + n[0] * (s - R), (a[1] + b[1]) / 2 + n[1] * (s - R)], out = [];
  for (let i = 1; i < k; i++) { const f = -Phi / 2 + (Phi * i) / k; out.push([ctr[0] + R * (Math.cos(f) * n[0] + Math.sin(f) * u[0]), ctr[1] + R * (Math.cos(f) * n[1] + Math.sin(f) * u[1])]); }
  return out;
}

/* ------------------------------------------------------------------ */
/* furniture: Sweet Home 3D pieces → the card's pieces                 */
/* ------------------------------------------------------------------ */
// matched against the piece's name and catalogue id (any language Sweet Home 3D ships, plus Arabic); the first rule wins
const W = s => `(?<![a-z])(?:${s})(?![a-z])`;
const RULES = [
  [`human|people|person|${W('man|woman|men|women|boy|girl|child|baby|kid')}|personnage|mensch`, null],
  ['stair|escalier|treppe|escalera|scala|درج|سلم', 'stairs'],
  ['bedside|night ?stand|night ?table|chevet|nachttisch|mesita|comodino|كومودينو', 'nightstand'],
  ['sofa|couch|settee|canap|armchair|fauteuil|sessel|sill[oó]n|divano|poltrona|كنبة|أريكة|كنب', 'sofa'],
  [`${W('bed|beds|bunk|crib|cot|lit|bett|cama|letto')}|سرير`, 'bed'],
  [`toilet|${W('wc')}|bidet|toilette|inodoro|water ?closet|مرحاض|حمام افرنجي`, 'toilet'],
  [`bath ?tub|${W('bath')}|baignoire|badewanne|ba[nñ]era|vasca|بانيو|حوض استحمام`, 'bathtub'],
  ['shower|douche|dusche|ducha|doccia|دش|دوش', 'shower'],
  ['dish ?washer|lave-vaisselle|sp[uü]lmaschine|lavavajillas|غسالة صحون', 'box'],
  [`washing ?machine|${W('washer')}|dryer|lave-linge|s[eè]che-linge|waschmaschine|lavadora|lavatrice|غسالة|نشافة`, 'washer'],
  ['kitchen ?sink|[eé]vier|sp[uü]le|fregadero|lavello', 'block'],
  [`wash ?basin|${W('sink')}|lavabo|vanity|waschbecken|lavandino|مغسلة`, 'sink'],
  ['towel|serviette|handtuch|toalla|منشفة', 'towel'],
  [`${W('tv')} ?(?:unit|stand|cabinet|table|bench|furniture)|meuble ?tv|tv-?m[oö]bel|mueble ?tv`, 'box'],
  [`${W('tv')}|television|t[eé]l[eé]vis|fernseh|televisor|${W('screen')}|تلفاز|تلفزيون|شاشة`, 'tv'],
  ['ceiling ?fan|ventilateur|ventilator|ventilador|مروحة', 'fan'],
  [`air ?cond|${W('a/?c')}|climatiseur|klimaanlage|aire acondicionado|condizionatore|split unit|مكيف`, 'ac'],
  ['vacuum|roomba|aspirateur|staubsauger|aspiradora|مكنسة', 'vacuum'],
  [`${W('car|cars|vehicle|suv|sedan|voiture|auto|coche|automobile')}|سيارة`, 'car'],
  ['hedge|haie|hecke|seto|سياج', 'hedge'],
  [`${W('pool')}|swimming|piscine|schwimmbad|piscina|مسبح`, 'pool'],
  [`tree|arbre|baum|[aá]rbol|albero|${W('palm|pine|oak|fir|birch')}|شجرة|نخلة`, 'tree'],
  ['plant|flower|cactus|ficus|bamboo|plante|pflanze|planta|pianta|fleur|blume|نبتة|نبات|زهور|ورد', 'plant'],
  ['lamp|lampe|l[aá]mpara|lampada|leuchte|floor ?light|standing ?light|مصباح|أباجورة|اباجورة', 'lamp'],
  [`${W('rug|rugs|carpet|tapis|teppich|alfombra|tappeto|mat')}|سجادة|سجاد`, 'rug'],
  ['chair|stool|chaise|tabouret|stuhl|hocker|silla|sedia|bench|banc|كرسي|مقعد', 'chair'],
  ['table|desk|bureau|tisch|mesa|tavolo|scrivania|طاولة|طاوله|مكتب', 'table'],
  ['counter|worktop|kitchen|cuisine|k[uü]che|cocina|cucina|plan de travail|مطبخ', 'block'],
].map(([re, type]) => [new RegExp(re, 'i'), type]);
const CEILING = /ceiling|pendant|chandelier|(?<![a-z])spots?(?![a-z])|plafonnier|plafond|suspension|lustre|downlight|recessed|sconce|applique|wall ?light|kronleuchter|deckenleuchte|ثريا|نجفة|سبوت/i;
const APPLIANCE = /fridge|refrigerator|freezer|oven|cooker|stove|microwave|r[eé]frig[eé]rateur|frigo|four|cuisini[eè]re|k[uü]hlschrank|herd|nevera|horno|ثلاجة|فرن|موقد/i;

const DIR = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : dz > 0 ? 's' : 'n');
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const TURN = { n: 'e', e: 's', s: 'w', w: 'n' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// what kind of card piece a Sweet Home 3D piece becomes (null: left out, with the reason)
function pieceType(p, levelHeight) {
  const text = `${p.name} ${p.catalog.replace(/[#_]/g, ' ')}`;
  const isLight = p.kind === 'light' || /lamp|lampe|light|leuchte|l[aá]mpara|lampada|مصباح|إضاءة/i.test(text);
  // ceiling and wall lights: the card draws a room's lights itself (glowing, from Home Assistant)
  if (isLight && (CEILING.test(text) || p.elev >= Math.min(1.6, levelHeight * 0.7))) return { skip: 'light' };
  for (const [re, type] of RULES) if (re.test(text)) return type ? { type } : { skip: 'person' };
  return { type: p.kind === 'light' ? 'lamp' : 'box' };
}
function cardPiece(p, type) {
  const a = p.angle, f = DIR(-Math.sin(a), Math.cos(a)); // the side its front looks to (its front faces down the plan at angle 0)
  const odd = Math.round(a / (Math.PI / 2)) % 2 !== 0, fw = r2(odd ? p.d : p.w), fd = r2(odd ? p.w : p.d); // footprint along x / z
  const at = { type, x: r2(p.x), z: r2(p.z) }, W2 = r2(p.w), D2 = r2(p.d), H = r2(p.h), y = r2(p.elev);
  const span = () => ({ type, from: [r2(p.x - fw / 2), r2(p.z - fd / 2)], to: [r2(p.x + fw / 2), r2(p.z + fd / 2)] });
  switch (type) {
    case 'bed': return { ...at, width: W2, length: D2, head: OPP[f] };
    case 'sofa': return { ...at, w: fw, d: fd, back: OPP[f] };
    case 'chair': return { ...at, face: f };
    case 'tv': return { ...at, w: W2, h: H, y, facing: f };
    case 'lamp': return { ...at, h: clamp(H, 0.3, 2.5) };
    case 'plant': return { ...at, size: r2(clamp(Math.max(p.w, p.d) / 0.8, 0.3, 3)) };
    case 'tree': return { ...at, size: r2(clamp(Math.max(p.w, p.d) / 1.6, 0.3, 4)) };
    case 'fan': return { ...at, radius: r2(clamp(Math.max(p.w, p.d) / 2, 0.2, 1)) };
    case 'ac': return { ...at, facing: f, style: y >= 1.2 ? 'wall' : 'floor' };
    case 'vacuum': return { ...at, facing: f };
    case 'car': return { ...at, facing: p.d >= p.w ? f : TURN[f], length: r2(Math.max(p.w, p.d)), width: r2(Math.min(p.w, p.d)) };
    case 'toilet': case 'shower': case 'bathtub': return { ...at, w: fw, d: fd, facing: f };
    case 'sink': case 'washer': case 'nightstand': return { ...at, w: fw, d: fd, h: H, facing: f };
    case 'towel': return { ...at, w: W2, y, facing: f };
    case 'table': return { ...at, w: fw, d: fd, h: H };
    case 'rug': return { ...at, w: fw, d: fd };
    case 'stairs': return { ...span(), axis: odd ? 'x' : 'z' }; // a Sweet Home 3D staircase climbs along its depth
    case 'hedge': return { ...span(), h: H };
    case 'pool': return span();
    case 'block': return { ...at, w: fw, d: fd, h: H, ...(y > 0.05 ? { y } : {}), ...(p.color ? { color: p.color } : {}) };
    default: { // a cabinet: wardrobes, shelves, the fridge…
      const color = p.color || (APPLIANCE.test(`${p.name} ${p.catalog}`) ? '#e5e7eb' : null);
      return { ...at, type: 'box', name: p.name || undefined, w: fw, d: fd, h: H, ...(y > 0.05 ? { y } : {}), ...(color ? { color } : {}) };
    }
  }
}

/* ------------------------------------------------------------------ */
/* the home → the card's `house`                                       */
/* ------------------------------------------------------------------ */
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const OPENING = /door ?frame|doorway|opening|(?<![a-z])arch|passage|durchgang|ouverture|encadrement|hueco|فتحة|ممر/i;
const WINDOW = /window|fen[eê]tre|fenster|ventana|finestra|janela|raam|okno|نافذة|شباك|شباك/i;
const DOOR = /door|porte|t[uü]r|puerta|porta|باب/i;
const MAIN = /front|entr|main|(?<![a-z])entry|haust[uü]r|principal|eingang|رئيسي|مدخل/i;
// room settings that describe its shape or place: they come from the file; everything else (lights, names, floor…)
// is kept from the room it replaces
const SHAPE_KEYS = ['rects', 'rect', 'points', 'level', 'floor_rects', 'anchor', 'furniture', 'tv_glow', 'name', 'area', 'id'];
// house settings that the file replaces (the rest, such as wall_height or auto_furniture, is kept)
const HOUSE_GEOMETRY = ['rooms', 'doors', 'windows', 'openings', 'walls', 'extra_walls', 'furniture', 'lock_badges', 'open_plan', 'doorways', 'type', 'url', 'scale', 'rotation', 'offset', 'mesh_rooms'];

/**
 * home: from readHome(). opts.areas: Home Assistant areas ({area_id: {name}}); opts.house: the card's current `house`.
 * → { house, summary } where house is the new `house` setting.
 */
export function toHouse(home, opts = {}) {
  const areas = Object.values(opts.areas || {}), old = opts.house || {};
  /* floors: by elevation; the one nearest the ground is level 0 */
  const lv = [...home.levels].sort((p, q) => p.elevation - q.elevation || p.index - q.index);
  let g = 0; lv.forEach((l, i) => { if (Math.abs(l.elevation) < Math.abs(lv[g].elevation) - 1e-6) g = i; });
  const levelOf = id => { const i = lv.findIndex(l => l.id === id); return i < 0 ? 0 : i - g; };
  const heightOf = l => lv[l + g]?.height || home.wallHeight || 2.5;

  const walls = home.walls.map(w => ({ ...w, l: levelOf(w.level) })).filter(w => dist(w.a, w.b) >= 0.05);
  const straight = walls.filter(w => !w.arc);

  /* rooms: outlines moved onto the centre line of the walls they run along */
  const fitWall = (a, b, l) => {
    const u = unit(a, b); if (!u) return null;
    const L = dist(a, b), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let best = null;
    for (const w of straight) {
      if (w.l !== l) continue;
      const v = unit(w.a, w.b); if (Math.abs(cross(u, v)) > PAR) continue;
      const dd = lineDist(mid, w.a, v); if (dd > w.t / 2 + 0.05) continue;
      const ta = (a[0] - w.a[0]) * v[0] + (a[1] - w.a[1]) * v[1], tb = (b[0] - w.a[0]) * v[0] + (b[1] - w.a[1]) * v[1];
      const over = Math.min(Math.max(ta, tb), dist(w.a, w.b) + w.t / 2) - Math.max(Math.min(ta, tb), -w.t / 2);
      if (over < Math.min(0.3, L * 0.5)) continue;
      if (!best || dd < best.dd) best = { dd, p: w.a, u: v };
    }
    return best;
  };
  const tidy = pts => { // no repeated corners, no corner in the middle of a straight edge
    let P = pts.filter((p, i) => dist(p, pts[(i + 1) % pts.length]) > 0.01);
    for (let again = true; again && P.length > 3;) {
      again = false;
      for (let i = 0; i < P.length; i++) {
        const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length], u = unit(a, b), v = unit(b, c);
        if (u && v && Math.abs(cross(u, v)) < 1e-3 && u[0] * v[0] + u[1] * v[1] > 0) { P.splice(i, 1); again = true; break; }
      }
    }
    return P;
  };
  const rooms = [];
  for (const rm of home.rooms) {
    const l = levelOf(rm.level);
    let P = tidy(rm.points);
    if (P.length < 3 || Math.abs(polyArea(P)) < 0.25) continue;
    const lines = P.map((a, i) => { const b = P[(i + 1) % P.length], fit = fitWall(a, b, l); return fit ? { p: fit.p, u: fit.u, on: true } : { p: a, u: unit(a, b), on: false }; });
    P = P.map((q, i) => {
      const L1 = lines[(i + P.length - 1) % P.length], L2 = lines[i];
      let s = L1.on || L2.on ? meet(L1.p, L1.u, L2.p, L2.u) : q;
      if (!s || dist(s, q) > 0.6) s = L2.on ? proj(q, L2.p, L2.u) : L1.on ? proj(q, L1.p, L1.u) : q;
      return s;
    });
    P = tidy(P);
    if (P.length >= 3 && Math.abs(polyArea(P)) >= 0.25) rooms.push({ name: rm.name, l, P });
  }
  if (!rooms.length) throw new ImportError('empty');
  const edges = l => rooms.filter(r => r.l === l).flatMap(r => r.P.map((a, i) => [a, r.P[(i + 1) % r.P.length]]));
  const edgeCache = new Map(), edgesOn = l => edgeCache.get(l) || edgeCache.set(l, edges(l)).get(l);
  const onRoomEdge = (p, u, l, tol = 0.04) => edgesOn(l).some(([a, b]) => { const v = unit(a, b); return v && Math.abs(cross(u, v)) < PAR && segDist(p, a, b) < tol; });
  const inWall = (p, u, l) => straight.some(w => { // beside the wall's centre line, between its two ends
    if (w.l !== l) return false; const v = unit(w.a, w.b); if (Math.abs(cross(u, v)) > PAR) return false;
    const t = (p[0] - w.a[0]) * v[0] + (p[1] - w.a[1]) * v[1]; return t >= -1e-3 && t <= dist(w.a, w.b) + 1e-3 && lineDist(p, w.a, v) <= w.t / 2 + 0.04;
  });

  /* separate walls: wall stretches that are not on a room edge */
  const extra = [];
  for (const w of walls) {
    const half = w.h != null && w.h < heightOf(w.l) * 0.6 ? 'half' : null;
    if (w.arc) {
      const bow = arcBow(w.a, w.b, w.arc), pts = arcPoints(w.a, w.b, bow);
      const along = pts.filter(p => edgesOn(w.l).some(([a, b]) => segDist(p, a, b) <= w.t / 2 + 0.05)).length;
      if (along < pts.length * 0.8) extra.push({ from: w.a, to: w.b, bow, l: w.l, type: half });
      continue;
    }
    for (const [a, b] of gaps(w.a, w.b, (p, u) => onRoomEdge(p, u, w.l))) extra.push({ from: a, to: b, l: w.l, type: half });
  }
  /* openings: where two rooms meet with no wall between them (only on floors that have walls at all) */
  const openings = [];
  for (const l of [...new Set(rooms.map(r => r.l))]) {
    if (!straight.some(w => w.l === l)) continue;
    const rs = rooms.filter(r => r.l === l);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      for (const [a1, b1] of rs[i].P.map((a, k) => [a, rs[i].P[(k + 1) % rs[i].P.length]])) {
        const u = unit(a1, b1); if (!u) continue;
        for (const [a2, b2] of rs[j].P.map((a, k) => [a, rs[j].P[(k + 1) % rs[j].P.length]])) {
          const v = unit(a2, b2); if (!v || Math.abs(cross(u, v)) > PAR || lineDist(a2, a1, u) > 0.03 || lineDist(b2, a1, u) > 0.03) continue;
          const t = q => (q[0] - a1[0]) * u[0] + (q[1] - a1[1]) * u[1];
          const lo = Math.max(0, Math.min(t(a2), t(b2))), hi = Math.min(dist(a1, b1), Math.max(t(a2), t(b2)));
          if (hi - lo < 0.3) continue;
          const s = [a1[0] + u[0] * lo, a1[1] + u[1] * lo], e = [a1[0] + u[0] * hi, a1[1] + u[1] * hi];
          for (const [p, q] of gaps(s, e, (pt, dir) => inWall(pt, dir, l))) openings.push({ from: p, to: q, l });
        }
      }
    }
  }

  /* doors, windows, door frames: onto the room edge they sit in */
  const snap = (a, b, l) => {
    const u = unit(a, b), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let best = null;
    if (u) for (const [p, q] of edgesOn(l)) { const v = unit(p, q); if (!v || Math.abs(cross(u, v)) > PAR) continue; const dd = segDist(mid, p, q); if (dd <= 0.4 && (!best || dd < best.dd)) best = { dd, p, v }; }
    return best ? [proj(a, best.p, best.v), proj(b, best.p, best.v)] : [a, b];
  };
  const doors = [], windows = [], skipped = { light: 0, person: 0, hidden: 0 }, pieces = [];
  let mainSet = false;
  for (const p of home.pieces) {
    if (!p.visible) { skipped.hidden++; continue; }
    const l = levelOf(p.level);
    if (p.kind !== 'door') { pieces.push({ ...p, l }); continue; }
    const half = [Math.cos(p.angle) * p.w / 2, Math.sin(p.angle) * p.w / 2];
    const [a, b] = snap([p.x - half[0], p.z - half[1]], [p.x + half[0], p.z + half[1]], l);
    const text = `${p.name} ${p.catalog}`;
    if (p.elev >= 0.3 || (WINDOW.test(text) && !DOOR.test(text))) windows.push({ a, b, l });
    else if (OPENING.test(text)) openings.push({ from: a, to: b, l });
    else { const main = !mainSet && MAIN.test(text); mainSet ||= main; doors.push({ a, b, l, main }); }
  }

  /* furniture: into the room it stands in */
  const furniture = new Map(), loose = [];
  let nFurn = 0;
  for (const p of pieces) {
    if (Math.max(p.w, p.d) < 0.08) continue;
    const k = p.stairs ? { type: 'stairs' } : pieceType(p, heightOf(p.l));
    if (k.skip) { skipped[k.skip]++; continue; }
    const piece = cardPiece(p, k.type); nFurn++;
    const room = rooms.find(r => r.l === p.l && inPoly(p.x, p.z, r.P));
    if (room) (furniture.get(room) || furniture.set(room, []).get(room)).push(piece); else loose.push({ piece, l: p.l });
  }

  /* everything moved so that the plan starts at (0, 0) */
  const xs = rooms.flatMap(r => r.P.map(q => q[0])), zs = rooms.flatMap(r => r.P.map(q => q[1]));
  const ox = Math.min(...xs), oz = Math.min(...zs);
  const X = v => r2(v - ox), Z = v => r2(v - oz), pt = q => [X(q[0]), Z(q[1])];
  const movePiece = f => { const o = { ...f }; if (o.x != null) { o.x = X(o.x); o.z = Z(o.z); } if (o.from) { o.from = pt(o.from); o.to = pt(o.to); } return o; };
  const seg = (a, b, l) => [X(a[0]), Z(a[1]), X(b[0]), Z(b[1]), ...(l ? [l] : [])];

  /* areas: a room takes the Home Assistant area with the same name (or, failing that, the only area whose name holds it or is held in it) */
  const used = new Set(), byName = n => areas.find(a => !used.has(a.area_id) && (norm(a.name) === n || norm(a.area_id) === n));
  const named = rooms.map(r => norm(r.name)), match = new Map();
  rooms.forEach((r, i) => { const n = named[i]; if (!n) return; const a = byName(n); if (a) { used.add(a.area_id); match.set(r, a.area_id); } });
  rooms.forEach((r, i) => {
    const n = named[i]; if (!n || match.has(r) || n.length < 3) return;
    const c = areas.filter(a => !used.has(a.area_id) && norm(a.name).length >= 3 && (norm(a.name).includes(n) || n.includes(norm(a.name))));
    if (c.length === 1) { used.add(c[0].area_id); match.set(r, c[0].area_id); }
  });
  // what the rooms it replaces had set (lights, names, floor…), by area or by name
  const oldRooms = Array.isArray(old.rooms) ? old.rooms : [];
  const keep = (area, name) => {
    const o = oldRooms.find(x => (area && x.area === area) || (!area && name && norm(x.name) === norm(name)));
    return o ? Object.fromEntries(Object.entries(o).filter(([k, v]) => !SHAPE_KEYS.includes(k) && !(k === 'ac' && v && typeof v === 'object'))) : {};
  };

  const outRooms = rooms.map((r, i) => {
    const area = match.get(r) || null, P = r.P.map(pt);
    const xsR = [...new Set(P.map(q => q[0]))], zsR = [...new Set(P.map(q => q[1]))];
    const rect = P.length === 4 && xsR.length === 2 && zsR.length === 2;
    const o = { ...(area ? { area } : { name: r.name || `Room ${i + 1}` }), ...keep(area, r.name) };
    if (area && r.name && norm(r.name) !== norm(areas.find(a => a.area_id === area)?.name)) o.name = r.name; // "Master bedroom" on the "Bedroom" area keeps its name
    if (rect) o.rects = [[Math.min(...xsR), Math.min(...zsR), Math.max(...xsR), Math.max(...zsR)]]; else o.points = P;
    if (r.l) o.level = r.l;
    const f = furniture.get(r); if (f?.length) o.furniture = f.map(movePiece);
    return o;
  });

  const house = Object.fromEntries(Object.entries(old).filter(([k]) => !HOUSE_GEOMETRY.includes(k)));
  house.rooms = outRooms;
  if (doors.length) house.doors = doors.map(d => ({ from: pt(d.a), to: pt(d.b), ...(d.main ? { main: true } : {}), ...(d.l ? { level: d.l } : {}) }));
  if (windows.length) house.windows = windows.map(w => seg(w.a, w.b, w.l));
  if (openings.length) house.openings = openings.map(o => seg(o.from, o.to, o.l));
  if (extra.length) house.extra_walls = extra.map(w => ({ from: pt(w.from), to: pt(w.to), ...(w.bow ? { bow: r2(w.bow) } : {}), ...(w.type ? { type: w.type } : {}), ...(w.l ? { level: w.l } : {}) }));
  if (loose.length) house.furniture = loose.map(({ piece, l }) => ({ ...movePiece(piece), ...(l ? { level: l } : {}) }));
  const lvUsed = [...new Set(outRooms.map(r => r.level || 0))].sort((a, b) => a - b);
  if (lv.length > 1) {
    const names = lvUsed.map(l => ({ level: l, name: lv[l + g]?.name })).filter(x => x.name);
    if (names.length) house.levels = names; else delete house.levels;
  }

  const summary = {
    rooms: outRooms.length, linked: match.size, unlinked: outRooms.filter(r => !r.area).map(r => r.name),
    floors: lvUsed.length, doors: doors.length, windows: windows.length, openings: openings.length, walls: extra.length,
    furniture: nFurn, lights: skipped.light, people: skipped.person, hidden: skipped.hidden,
    replaced: oldRooms.length, wasGltf: old.type === 'gltf', badgesDropped: Array.isArray(old.lock_badges) ? old.lock_badges.length : 0,
    sensorsDropped: (Array.isArray(old.doors) ? old.doors : []).filter(d => d && d.entity).length,
  };
  return { house, summary };
}

// the whole import: file contents → { house, summary }
export async function importSh3d(buffer, opts) {
  return toHouse(readHome(await sh3dXml(buffer)), opts);
}
