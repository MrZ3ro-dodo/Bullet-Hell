// Minimal harness to load script.js with DOM stubs and test bow firing inside interiors.
const fs = require('fs');
const vm = require('vm');

function makeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return { width: 1280, height: 720 };
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getImageData') return () => ({ data: [] });
      if (p === 'putImageData') return noop;
      if (p === 'save' || p === 'restore' || p === 'translate' || p === 'scale' || p === 'rotate' ||
          p === 'beginPath' || p === 'moveTo' || p === 'lineTo' || p === 'arc' || p === 'rect' ||
          p === 'fill' || p === 'stroke' || p === 'closePath' || p === 'fillRect' || p === 'strokeRect' ||
          p === 'fillText' || p === 'clearRect' || p === 'clip' || p === 'setTransform' || p === 'drawImage' ||
          p === 'save') return noop;
      return noop;
    },
    set() { return true; }
  });
}

const listeners = {};
function makeEl() {
  return {
    width: 1280, height: 720,
    style: {},
    getContext: () => makeCtx(),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    appendChild: () => {},
    setAttribute: () => {},
    classList: { add: () => {}, remove: () => {} },
  };
}

const elements = {};
const document = {
  getElementById: (id) => { return elements[id] || (elements[id] = makeEl()); },
  createElement: () => makeEl(),
  body: { appendChild: () => {}, style: {} },
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};

const window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};

const sandbox = {
  document, window,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {},
  console,
  Math, Date, JSON, Array, Object, String, Number, Boolean, isFinite, isNaN,
  parseInt, parseFloat, Infinity, NaN, undefined,
};
sandbox.globalThis = sandbox;
sandbox.window = window;
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
window.performance = sandbox.performance;
window.localStorage = { getItem: () => null, setItem: () => {} };
sandbox.localStorage = window.localStorage;
sandbox.navigator = { userAgent: 'node' };
vm.createContext(sandbox);

const code = fs.readFileSync('script.js', 'utf8') + `
;globalThis.__exp = {
  get player(){return player;},
  get projectiles(){return projectiles;},
  get weapons(){return weapons;},
  get constructions(){return constructions;},
  getPlayerInteriorScale, enterConstruction, exitConstruction,
  getCurrentInteriorEnemies, getNearestInteriorEnemy,
  spawnCastleInteriorWave, attemptAttack, selectWeapon,
  spawnMansionGhost, initializeMapDecor, updateProjectiles,
  dungeonReset, dungeonRooms, dungeonWallGhosts, dungeonTryOpenNextRoom, dungeonUpdateWallGhosts
};
`;
try {
  vm.runInContext(code, sandbox, { filename: 'script.js' });
  console.log('LOADED OK');
} catch (e) {
  console.log('LOAD ERROR:', e.message);
  console.log(e.stack.split('\n').slice(0,5).join('\n'));
  process.exit(1);
}

// Now drive the simulation.
const E = sandbox.__exp;
function findBowIndex() {
  return E.weapons.findIndex(w => w.type === 'bow');
}

function testInterior(type) {
  E.selectWeapon(findBowIndex());
  const player = E.player;
  if (!E.constructions.length) E.initializeMapDecor();
  let cons = E.constructions.find(c => c.type === type);
  if (!cons) {
    cons = { id: 0, x: 0, y: 0, scale: 2.8, width: 120, height: 100, type, interiorX: 0, interiorY: 200, zone: 'upgrade', locked: false };
    E.constructions.push(cons);
  }
  cons.locked = false;
  E.enterConstruction(cons.id);
  const enemies = E.getCurrentInteriorEnemies();
  if (!enemies.length) {
    if (type === 'castle') E.spawnCastleInteriorWave();
    else E.spawnMansionGhost();
  }
  const before = E.projectiles.length;
  player.attackCooldown = 0;
  const en = E.getNearestInteriorEnemy();
  if (en) {
    player.swordAimAngle = Math.atan2((en.y + en.height/2) - (player.y + player.height/2), (en.x + en.width/2) - (player.x + player.width/2));
  } else {
    player.swordAimAngle = 0;
  }
  E.attemptAttack('mouse');
  const after = E.projectiles.length;
  const scale = E.getPlayerInteriorScale();
  console.log(`\n=== ${type.toUpperCase()} (interiorScale=${scale}) ===`);
  console.log(`player.x=${player.x.toFixed(1)} player.y=${player.y.toFixed(1)} w=${player.width} h=${player.height}`);
  console.log(`projectiles spawned: ${after - before}`);
  for (let i = before; i < after; i++) {
    const p = E.projectiles[i];
    if (!p) continue;
    const speed = Math.hypot(p.vx, p.vy);
    console.log(`  [${i}] style=${p.style} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} size=${p.size} speed=${speed.toFixed(2)} maxDist=${p.maxDistance} homing=${p.homing} ricochet=${p.ricochetActive}`);
  }
  E.exitConstruction();
}

function testHit(type, ricochet) {
  E.selectWeapon(findBowIndex());
  const player = E.player;
  if (!E.constructions.length) E.initializeMapDecor();
  let cons = E.constructions.find(c => c.type === type);
  if (!cons) {
    cons = { id: 0, x: 0, y: 0, scale: 2.8, width: 120, height: 100, type, interiorX: 0, interiorY: 200, zone: 'upgrade', locked: false };
    E.constructions.push(cons);
  }
  cons.locked = false;
  E.enterConstruction(cons.id);
  // wipe enemies and add one directly to the right
  const enemies = E.getCurrentInteriorEnemies();
  enemies.length = 0;
  const ex = player.x + player.width + 120;
  const ey = player.y;
  enemies.push({ id: 999, type: 'test', x: ex, y: ey, width: 40, height: 40, health: 100, maxHealth: 100,
    isDying: false, flashTimer: 0, stunTimer: 0, isInvisible: false, isElite: false });
  player.attackCooldown = 0;
  player.swordAimAngle = 0; // aim right
  if (ricochet) player.bowRicochet = 2; else player.bowRicochet = 0;
  E.attemptAttack('mouse');
  const scale = E.getPlayerInteriorScale();
  const count = E.projectiles.length;
  let dmg = 0;
  for (let f = 0; f < 120; f++) {
    const before = enemies[0] ? enemies[0].health : 0;
    E.updateProjectiles();
    if (enemies[0] && !enemies[0].isDying) dmg = 100 - enemies[0].health;
    if (enemies[0] && enemies[0].isDying) { dmg = 100; break; }
  }
  console.log(`\n=== ${type.toUpperCase()} hit test (ricochet=${ricochet}, scale=${scale}) ===`);
  console.log(`projectiles fired: ${count}, enemy damage dealt: ${dmg}, enemies remaining: ${enemies.length}`);
  if (E.projectiles.length) {
    const p = E.projectiles[0];
    console.log(`  remaining proj[0]: style=${p.style} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} size=${p.size} traveled=${p.traveled.toFixed(1)} maxDist=${p.maxDistance}`);
  }
  player.bowRicochet = 0;
  E.exitConstruction();
}

console.log('LOADED OK');
try { testHit('castle', false); } catch (e) { console.log('CASTLE ERR:', e.message, '\n', e.stack.split('\n').slice(0,5).join('\n')); }
try { testHit('mansion', false); } catch (e) { console.log('MANSION ERR:', e.message, '\n', e.stack.split('\n').slice(0,5).join('\n')); }
try { testHit('castle', true); } catch (e) { console.log('CASTLE RICO ERR:', e.message, '\n', e.stack.split('\n').slice(0,5).join('\n')); }
try { testHit('mansion', true); } catch (e) { console.log('MANSION RICO ERR:', e.message, '\n', e.stack.split('\n').slice(0,5).join('\n')); }


