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

// Index of the first/last call matching a predicate.
const indexOf = (calls, test) => calls.findIndex(test);
const lastIndexOf = (calls, test) => calls.length - 1 - [...calls].reverse().findIndex(test);

test('medium orbs are a teal sphere with one foreshortened blue eye and four depth-sorted crystal winglets', () => {
  const medium = make(MEDIUM);
  const body = ({ method, color }) => method === 'arc' && color === '#154';
  const winglet = ({ method, color }) => method === 'fill' && (color === '#9fe' || color === '#4bc');
  const eye = ({ method, color, alpha }) => method === 'ellipse' && color === '#39f' && alpha === 1;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    Object.assign(medium, { a, state: PATROL, aimT: 0 });
    const calls = draw(medium);
    assert.equal(calls.find(body).args[2], 24 * 1.4, 'body sphere scales with size');
    assert.equal(calls.filter(winglet).length, 4, 'two big and two small winglets');
    assert.equal(calls.filter(eye).length, a === Math.PI / 2 ? 0 : 1, 'the eye hides round the back');
  }
  // Side-on the eye is a sliver at the silhouette; facing the camera, round.
  Object.assign(medium, { a: 0 });
  let [, , rx, ry] = draw(medium).find(eye).args;
  assert.ok(rx < ry * 0.5);
  Object.assign(medium, { a: -Math.PI / 2 });
  [, , rx, ry] = draw(medium).find(eye).args;
  assert.ok(Math.abs(rx - ry) < 1e-9);
  // Facing the camera the back-mounted winglets all sit behind the body;
  // facing away, all in front.
  let calls = draw(medium);
  assert.ok(lastIndexOf(calls, winglet) < indexOf(calls, body));
  Object.assign(medium, { a: Math.PI / 2 });
  calls = draw(medium);
  assert.ok(indexOf(calls, winglet) > indexOf(calls, body));
  // The charge-up shakes the whole orb, harder toward the end of the tell.
  const center = (aimT) => { Object.assign(medium, { state: AIMING, aimT }); return draw(medium).find(body).args.slice(0, 2); };
  const [x0, y0] = center(0);
  const [x1, y1] = center(0.9);
  assert.ok(Math.hypot(x1 - x0, y1 - y0) > 0.5);
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
    // Small grubs spit from the mouth, medium orbs shoot from the eye, large orbs from their center.
    const calls = draw(grub);
    const mouth = [
      () => calls.filter(({ method, args }) => method === 'arc' && args[2] === 4 * grub.size).at(-1).args,
      () => calls.filter(({ method, color, alpha }) => method === 'ellipse' && color === '#39f' && alpha === 1).at(-1).args,
      () => calls.find(({ method, color }) => method === 'arc' && color === '#321').args,
    ][type]();
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
        [['#4f5', '#dfd'], ['#3de', '#dff'], ['#f93', '#fe9']][type]);
    });
    assert.equal(grub.state, RECOVERING);
    grub.tick(0.1);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, shots.length);
    const before = new Set(getObjects());
    shots[0].tick(100 / 340);
    const splats = getObjects().filter((object) => !before.has(object));
    assert.ok(splats.length > 0);
    for (const splat of splats) {
      const color = ['#4f5', '#3de', '#f93'][type];
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
    assert.deepEqual(new Set(colors), new Set([['#4f5', '#85d'], ['#3de'], ['#f93']][type]));
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

test('large orbs have four diamond eyes (far ones hidden) and five orbiters circling around and behind them', () => {
  const large = make(LARGE);
  const body = ({ method, color }) => method === 'arc' && color === '#321';
  const orbiter = ({ method, color }) => method === 'arc' && color === '#fb5';
  // Diamond eyes: the outer orange fill after a moveTo/lineTo path.
  const eyes = (calls) => calls.filter(({ method, color, alpha }, i) => method === 'fill' && color === '#f93' && alpha === 1
    && calls[i - 1]?.method === 'lineTo');
  let sawOrbitersOnBothSides = false;
  for (let k = 0; k < 16; k++) {
    Object.assign(large, { a: k * Math.PI / 8, orbit: k * 0.7, state: PATROL, aimT: 0 });
    const calls = draw(large);
    assert.equal(calls.find(body).args[2], 24 * 2.1, 'body sphere scales with size');
    const visible = eyes(calls).length;
    assert.ok(visible >= 2 && visible <= 3, 'eyes round the back are hidden');
    assert.equal(calls.filter(orbiter).length, 5);
    const bodyAt = indexOf(calls, body);
    sawOrbitersOnBothSides ||= indexOf(calls, orbiter) < bodyAt && lastIndexOf(calls, orbiter) > bodyAt;
  }
  assert.ok(sawOrbitersOnBothSides, 'orbiters pass behind and in front of the body');
  // The ring drifts slowly, and spins up while charging a volley.
  Object.assign(large, { orbit: 0, state: PATROL, aimT: 0 });
  large.tick(0.1);
  const idleSpin = large.orbit;
  Object.assign(large, { orbit: 0, state: AIMING, aimT: 0.9 });
  large.tick(0.1);
  assert.ok(idleSpin > 0 && large.orbit > idleSpin * 2);
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
