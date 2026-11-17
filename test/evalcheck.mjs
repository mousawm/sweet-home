// Evaluates the built bundle once with stubbed browser globals (catches top-level errors that a syntax check misses).
globalThis.HTMLElement = class {}; globalThis.customElements = { define() {}, get() {} }; globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, querySelector: () => null, addEventListener() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} }); globalThis.customCards = []; globalThis.localStorage = { getItem() {}, setItem() {} };
try {
  await import(new URL('../dist/sweet-home-card.js', import.meta.url));
  const { buildModel } = await import(new URL('../src/model.js', import.meta.url));
  const m = buildModel({}, { states: {}, entities: {}, devices: {}, areas: {}, floors: {} });
  if (!m.rooms || !m.E) throw new Error('empty model');
  console.log('EVAL-OK', window.customCards.map(c => c.type).join());
} catch (e) { console.log('EVAL-FAIL', e.stack); process.exit(1); }
