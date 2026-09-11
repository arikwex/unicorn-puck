import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

globalThis.document = { querySelector: () => ({ getContext: () => ({}) }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
let soundStarts = 0;
globalThis.AudioContext = class {
  sampleRate = 1000;
  state = 'running';
  destination = {};
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() { return { playbackRate: { value: 1 }, connect() {}, start() { soundStarts++; } }; }
};

const { add, clear, getObjects, getObjectsByTag } = await import('../src/engine.js');
const { default: Grub, SMALL, MEDIUM, LARGE } = await import('../src/Grub.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: CombatRoom } = await import('../src/CombatRoom.js');
const { TAG_PROJECTILE } = await import('../src/tags.js');

afterEach(() => { clear(); soundStarts = 0; });
const room = { x: 0, y: 0, w: 1000, h: 1000 };
function make(type) { return Grub(0, 0, room, 123, type); }
// Grub.js/CombatRoom.js numeric state ids.
const [PATROL, AIMING, RECOVERING] = [0, 1, 2];
const [ACTIVE, CLEARED] = [1, 2];
function draw(grub) {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      return target[key] ?? ((...args) => calls.push({
        method: key, args, color: target.fillStyle, stroke: target.strokeStyle, alpha: target.globalAlpha,
      }));
    },
  });
  grub.render(context);
  return calls;
}

test('numeric types have scaled collision geometry, 5/8/13 HP, and cost 1/2/3 slots', () => {
  const small = make(SMALL);
  const medium = make(MEDIUM);
  const large = make(LARGE);
  assert.deepEqual([SMALL, MEDIUM, LARGE], [0, 1, 2]);
  assert.equal(medium.hp, small.hp + 3);
  assert.equal(medium.maxHp, 8);
  assert.equal(medium.r, small.r * 1.4);
  assert.equal(small.enemyCost, 1);
  assert.equal(medium.enemyCost, 2);
  assert.equal(large.hp, medium.hp + 5);
  assert.equal(large.maxHp, 13);
  assert.ok(Math.abs(large.r - medium.r * 1.5) < 1e-8);
  assert.equal(large.enemyCost, 3);
  assert.equal(Grub(0, 0, room, 1).type, SMALL);
});

test('body, face, tell, and recovery scale together; medium grubs add orange eyes and three spikes', () => {
  const small = make(SMALL); const medium = make(MEDIUM);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const state of [PATROL, AIMING, RECOVERING]) {
      for (const grub of [small, medium]) Object.assign(grub, { a: angle, anim: 0, state, aimT: 0.75 });
      const smallCalls = draw(small); const mediumCalls = draw(medium);
      const arcs = (calls) => calls.filter(({ method }) => method === 'arc').map(({ args }) => args);
      const a = arcs(smallCalls); const b = arcs(mediumCalls);
      assert.equal(a.length, b.length);
      a.forEach((circle, i) => {
        for (let field = 0; field < 3; field++) assert.ok(Math.abs(b[i][field] - circle[field] * 1.4) < 1e-8);
      });
      assert.equal(mediumCalls.filter(({ method }) => method === 'lineTo').length, 6, 'three triangular spikes');
      assert.equal(smallCalls.filter(({ method }) => method === 'lineTo').length, 0);
      assert.ok(!mediumCalls.some(({ method, color }) => method === 'fill' && color === '#5f5'));
      if (angle === 0) {
        const faceDots = smallCalls.filter(({ method, color }) => method === 'fill' && color === '#5f5').length;
        assert.equal(mediumCalls.filter(({ method, color }) => method === 'fill' && color === '#f93').length, faceDots + 3,
          'three orange spikes plus all visible face features');
      }
    }
  }
});

test('all types fire their colored volley once per tell and leave matching ooze trails', () => {
  for (const type of [SMALL, MEDIUM, LARGE]) {
    clear(); soundStarts = 0;
    const player = add(PlayerCharacter(200, 0));
    const grub = add(make(type));
    for (let frame = 0; frame < 100 && grub.state !== AIMING; frame++) grub.tick(0.05);
    assert.equal(grub.state, AIMING);
    const position = [grub.x, grub.y];
    grub.tick(1.99);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
    grub.aimT = 1;
    const mouth = draw(grub).filter(({ method, args }) => method === 'arc' && args[2] === 4 * grub.size).at(-1).args;
    grub.tick(0.01);
    const shots = getObjectsByTag(TAG_PROJECTILE);
    assert.equal(shots.length, [1, 3, 8][type]);
    assert.equal(soundStarts, 1, 'one shot sound per volley');
    assert.deepEqual([grub.x, grub.y], position);
    const heading = Math.atan2(player.y - mouth[1], player.x - mouth[0]);
    shots.forEach((shot, i) => {
      assert.equal(shot.x, mouth[0]); assert.equal(shot.y, mouth[1]);
      assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - 340) < 1e-8);
      const offset = type === MEDIUM ? (i - 1) * Math.PI / 12 : 0;
      const angle = type === LARGE ? i * Math.PI / 4 : heading + offset;
      assert.ok(Math.abs(shot.vx - Math.cos(angle) * 340) < 1e-8);
      assert.ok(Math.abs(shot.vy - Math.sin(angle) * 340) < 1e-8);
      assert.deepEqual(draw(shot).filter(({ method }) => method === 'fill').map(({ color }) => color),
        [['#4f5', '#dfd'], ['#f93', '#fdb'], ['#f22', '#fbb']][type]);
    });
    assert.equal(grub.state, RECOVERING);
    grub.tick(0.1);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, shots.length);
    const before = new Set(getObjects());
    shots[0].tick(100 / 340);
    const splats = getObjects().filter((object) => !before.has(object));
    assert.ok(splats.length > 0);
    for (const splat of splats) {
      const color = ['#4f5', '#f93', '#f22'][type];
      assert.ok(draw(splat).some((call) => call.method === 'stroke' && call.stroke === color));
      splat.tick(1);
      assert.ok(draw(splat).some((call) => call.method === 'fill' && call.color === color));
    }
  }
});

test('hit and death splashes use each type’s ooze color', () => {
  for (const type of [SMALL, MEDIUM, LARGE]) {
    clear();
    const grub = make(type);
    const player = PlayerCharacter();
    player.chg = 1;
    player.horn = 100;
    assert.equal(grub.hit(player), true);
    const colors = getObjects().flatMap((effect) => draw(effect)
      .filter(({ method }) => method === 'stroke').map(({ stroke }) => stroke));
    assert.equal(colors.length, 14);
    assert.deepEqual(new Set(colors), new Set([['#4f5', '#85d'], ['#f93'], ['#f22']][type]));
  }
});

test('medium grubs retain hit cooldown, white outline flash and an eight-slot health bar', () => {
  const grub = make(MEDIUM);
  const player = PlayerCharacter();
  player.chg = 0.5;
  grub.hit(player);
  assert.equal(grub.hp, 7);
  grub.hit(player);
  assert.equal(grub.hp, 7, 'same-hit cooldown still applies');
  grub.tick(0.1);
  const calls = draw(grub);
  const healthTicks = calls.filter(({ method, color }) => method === 'fillRect' && color === '#4c5');
  assert.equal(healthTicks.length, 7);
  assert.equal(grub.maxHp, 8);
  assert.ok(calls.some(({ method, stroke, alpha }) => method === 'stroke' && stroke === '#fff' && alpha > 0));
});

test('a medium grub keeps combat locked until it dies, then clears once despite its two-slot cost', () => {
  add(PlayerCharacter());
  const small = make(SMALL); const medium = make(MEDIUM);
  const encounter = add(CombatRoom(room, [{ x: -550, y: 0, w: 100, h: 200 }], [small, medium]));
  encounter.tick();
  assert.equal(encounter.state, ACTIVE);
  small.hp = 0;
  medium.hp = 1;
  encounter.tick();
  assert.equal(encounter.state, ACTIVE);
  medium.hp = 0;
  encounter.tick();
  assert.equal(encounter.state, CLEARED);
  assert.equal(soundStarts, 2, 'one start cue and one clear cue');
});

test('large body and tell scale by 1.5 with red face features and two dots per back segment', () => {
  const medium = make(MEDIUM); const large = make(LARGE);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const state of [PATROL, AIMING, RECOVERING]) {
      for (const grub of [medium, large]) Object.assign(grub, { a, anim: 0, state, aimT: 0.75 });
      const mediumCalls = draw(medium); const calls = draw(large);
      const bodies = (draws) => draws.filter(({ method }) => method === 'arc').slice(0, 4);
      const segments = bodies(calls);
      bodies(mediumCalls).forEach(({ args }, i) => {
        for (let field = 0; field < 3; field++) {
          assert.ok(Math.abs(segments[i].args[field] - args[field] * 1.5) < 1e-8);
        }
      });
      assert.equal(calls.filter(({ method }) => method === 'lineTo').length, 0, 'no spikes');
      const red = calls.filter(({ method, color }) => method === 'arc' && color === '#f22');
      const dots = red.filter(({ args }) => args[2] < 4 * large.size);
      assert.equal(dots.length, 6);
      for (const { args: [x, y, r] } of segments.slice(1)) {
        const pair = dots.filter(({ args }) => Math.abs(args[2] - r * 0.2) < 1e-8);
        assert.equal(pair.length, 2, 'each back segment has its own pair');
        assert.ok(pair[0].args[0] < x && pair[1].args[0] > x);
        assert.ok(pair.every(({ args }) => Math.hypot(args[0] - x, args[1] - y) + args[2] < r));
      }
      const mediumFace = mediumCalls.filter(({ method, color }) => method === 'arc' && color === '#f93');
      assert.equal(red.length - dots.length, mediumFace.length, 'all visible face features turn red');
    }
  }
});

test('large grubs track moving players but always fire the same eight compass directions', () => {
  const diagonal = Math.SQRT1_2;
  const directions = [[1, 0], [diagonal, diagonal], [0, 1], [-diagonal, diagonal],
    [-1, 0], [-diagonal, -diagonal], [0, -1], [diagonal, -diagonal]];
  for (const [x, y] of [[180, 90], [-150, 210], [-200, -130], [120, -230]]) {
    clear(); soundStarts = 0;
    const player = add(PlayerCharacter(200, 0));
    const grub = add(make(LARGE));
    for (let frame = 0; frame < 100 && grub.state !== AIMING; frame++) grub.tick(0.05);
    assert.equal(grub.state, AIMING);
    grub.tick(1);
    player.x = x; player.y = y;
    grub.tick(0.99);
    assert.equal(grub.a, Math.atan2(grub.y - y, x - grub.x));
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
    grub.tick(0.01);
    const shots = getObjectsByTag(TAG_PROJECTILE);
    assert.equal(shots.length, 8);
    shots.forEach((shot, i) => {
      assert.ok(Math.abs(shot.vx / 340 - directions[i][0]) < 1e-8);
      assert.ok(Math.abs(shot.vy / 340 - directions[i][1]) < 1e-8);
    });
    grub.tick(0.1);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 8);
    assert.equal(soundStarts, 1);
  }
});

test('large grubs show thirteen HP slots, retain hit cooldown, and hold combat until death', () => {
  const player = add(PlayerCharacter());
  const grub = make(LARGE);
  const encounter = add(CombatRoom(room, [], [grub]));
  encounter.tick();
  assert.equal(encounter.state, ACTIVE);
  player.chg = 0.5;
  grub.hit(player);
  grub.hit(player);
  assert.equal(grub.hp, 12);
  grub.tick(0.1);
  const calls = draw(grub);
  const ticks = calls.filter(({ method, color }) => method === 'fillRect' && color === '#4c5');
  assert.equal(ticks.length, 12);
  assert.ok(ticks.every(({ args }) => args[2] > 0));
  assert.ok(calls.some(({ method, stroke, alpha }) => method === 'stroke' && stroke === '#fff' && alpha > 0));
  grub.hp = 1;
  encounter.tick();
  assert.equal(encounter.state, ACTIVE);
  grub.tick(0.6);
  assert.equal(grub.hit(player), true);
  encounter.tick();
  assert.equal(encounter.state, CLEARED);
});
