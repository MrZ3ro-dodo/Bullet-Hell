const fs = require('fs');
const vm = require('vm');
let depth = 0, maxDepth = 0, minDepthEnd = 0, bad = null;
const ctxProxy = new Proxy({}, { get: (t, p) => {
  if (p === 'canvas') return { width: 1280, height: 720 };
  if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: () => {} });
  if (p === 'measureText') return () => ({ width: 10 });
  if (p === 'save') return () => { depth++; if (depth > maxDepth) maxDepth = depth; };
  if (p === 'restore') return () => { depth--; if (depth < minDepthEnd) minDepthEnd = depth; if (depth < 0 && !bad) bad = 'underflow'; };
  return () => {};
}, set: () => true });
const mkEl = () => ({ width: 1280, height: 720, style: {}, getContext: () => ctxProxy, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), appendChild: () => {}, setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } });
const els = {}; const document = { getElementById: id => els[id] || (els[id] = mkEl()), createElement: () => mkEl(), body: { appendChild: () => {}, style: {} }, addEventListener: () => {} };
const window = { innerWidth: 1280, innerHeight: 720, addEventListener: () => {} };
const sb = { document, window, performance: { now: () => Date.now() }, requestAnimationFrame: () => 0, console, Math, Date, JSON, Array, Object, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat, Infinity, NaN, undefined };
sb.globalThis = sb; sb.window = window; window.localStorage = { getItem: () => null, setItem: () => {} }; sb.localStorage = window.localStorage; sb.navigator = { userAgent: 'node' };
vm.createContext(sb);
vm.runInContext(fs.readFileSync('script.js', 'utf8') + ';globalThis.__d={enterConstruction,constructions,get player(){return player;},gameLoop};', sb, { filename: 'script.js' });
const D = sb.__d;
const cons = D.constructions.find(c => c.type === 'mansion'); cons.locked = false; D.enterConstruction(cons.id);
for (let f = 0; f < 3; f++) { depth = 0; D.gameLoop(); console.log('frame', f, 'end depth', depth, 'max', maxDepth); }
console.log('underflow?', bad);
