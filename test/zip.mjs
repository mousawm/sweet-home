// A tiny ZIP writer for the tests: [[name, text, method (8 = deflate, 0 = stored)], …] → ArrayBuffer
import { deflateRawSync } from 'node:zlib';

export function zip(entries) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const [name, text, method = 8] of entries) {
    const raw = enc.encode(text), data = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw, nm = enc.encode(name);
    const loc = new DataView(new ArrayBuffer(30)); loc.setUint32(0, 0x04034b50, true); loc.setUint16(8, method, true); loc.setUint32(18, data.length, true); loc.setUint32(22, raw.length, true); loc.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(10, method, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(loc.buffer), nm, data); cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length;
  }
  const size = cen.reduce((n, x) => n + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, x) => n + x.length, 0)); let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out.buffer;
}
