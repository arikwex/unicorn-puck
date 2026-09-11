import './helpers/audio.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

// The engine imports canvas at module load; rendering is incidental here.
const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
globalThis.document = { querySelector: () => ({ getContext: () => context }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
let nextFrame;
globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; };

const { add, clear, getObjects, start, stop } = await import('../src/engine.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: Grub } = await import('../src/Grub.js');
const { TAG_OBSTACLE } = await import('../src/tags.js');

afterEach(() => { stop(); clear(); });

function playerAt(x = 0, y = 0) {
  const player = PlayerCharacter(x, y);
  player.vx = 800;
  player.charge = 1;
  player.render = () => {};
  return player;
}

function grubAt(x = 60, y = 0) {
  const grub = Grub(x, y, { x, y, w: 500, h: 500 }, 123);
  grub.render = () => {};
  return grub;
}

function frame() {
  start();
  nextFrame(performance.now());
  stop();
}

test('grub damage and player bounce do not depend on insertion or drawing order', () => {
  for (const reverse of [false, true]) {
    for (const depth of [-1000, 1000]) {
      clear();
      const player = playerAt(0, depth);
      const grub = grubAt(60, depth);
      let grubCalls = 0;
      const hit = grub.hit;
      grub.hit = function (body) {
        grubCalls++;
        assert.ok(body.vx > 0, 'grub receives incoming velocity');
        return hit.call(this, body);
      };
      const objects = [player, grub];
      (reverse ? objects.reverse() : objects).forEach(add);
      frame();
      assert.equal(grub.hp, 3);
      assert.ok(player.vx < 0);
      assert.equal(grubCalls, 1);
    }
  }
});

test('motion is integrated before detecting newly reached contacts', () => {
  const player = add(playerAt(-20));
  const grub = add(grubAt());
  player.update(0.025);
  assert.equal(grub.hp, 3);
  assert.ok(player.vx < 0);
  assert.ok(Math.abs(player.x + 4) < 1e-9);
  assert.equal(player.order, player.y);
});

test('drag is five times stronger above charging speed', () => {
  const slow = playerAt();
  slow.vx = 300;
  slow.update(1);
  assert.ok(Math.abs(slow.vx - 300 * Math.exp(-0.6)) < 1e-9);
  const fast = playerAt();
  fast.update(0.1);
  assert.ok(Math.abs(fast.vx - 800 * Math.exp(-0.3)) < 1e-9);
});

test('a killing blow removes the grub but still bounces the player', () => {
  const player = add(playerAt());
  const grub = add(grubAt());
  grub.hp = 1;
  player.update(0);
  assert.equal(grub.hp, 0);
  assert.ok(!getObjects().includes(grub));
  assert.equal(player.vx, -320);
});

test('objects added during update do not repeat or skip existing updates', () => {
  const calls = [];
  add({ order: 0, update() {
    calls.push('first');
    add({ order: -100, update() { calls.push('new'); } });
  } });
  add({ order: 1, update() { calls.push('second'); } });
  frame();
  assert.deepEqual(calls, ['first', 'second']);
});

test('box walls bounce the player and see its pre-bounce state once', () => {
  const player = add(playerAt());
  let wallCalls = 0;
  const wall = add({
    tags: [TAG_OBSTACLE], x: 45, y: 0, w: 20, h: 200,
    hit(body) {
      wallCalls++;
      assert.equal(body.vx, 800);
    },
  });
  player.update(0);
  assert.equal(wallCalls, 1);
  assert.equal(player.vx, -320);
  assert.equal(player.x, -3);
  assert.equal(wall.x, 45);
});

test('simultaneous contacts survive separation without doubling the bounce', () => {
  const player = add(playerAt());
  const first = add(grubAt());
  const second = add(grubAt());
  player.update(0);
  assert.equal(first.hp, 3);
  assert.equal(second.hp, 3);
  assert.equal(player.vx, -320);
  assert.equal(player.x, -4);
});

test('an embedded player leaves a box through its nearest face', () => {
  const player = add(playerAt(40, 5));
  player.vx = 0;
  add({ tags: [TAG_OBSTACLE], x: 45, y: 0, w: 20, h: 200 });
  player.update(0);
  assert.equal(player.x, 55 - 38 - 20);
  assert.equal(player.y, 5);
});

test('pinball momentum reboosts enemy bounces past the incoming speed', () => {
  const player = add(playerAt());
  player.pinballMomentum = true;
  add(grubAt());
  player.update(0);
  assert.ok(Math.abs(player.vx + 800 * 1.08) < 1e-9);
});

test('damage thresholds, cooldown and killing-blow removal remain intact', () => {
  const player = add(playerAt());
  const grub = add(grubAt());
  function hit(charge) {
    Object.assign(player, { x: grub.x - 60, y: grub.y, vx: 800, charge });
    player.update(0);
  }
  hit(0.1);
  assert.equal(grub.hp, 5);
  hit(0.5);
  assert.equal(grub.hp, 4);
  hit(1);
  assert.equal(grub.hp, 4, 'cooldown suppresses repeat damage');
  grub.update(0.6);
  hit(1);
  assert.equal(grub.hp, 2);
  grub.update(0.6);
  hit(1);
  assert.equal(grub.hp, 0);
  assert.ok(player.vx < 0);
  assert.ok(!getObjects().includes(grub));
  assert.equal(getObjects().filter((object) => !object.tags).length, 23,
    'three callouts, nine hit splats and eleven death splats survive');
});

test('hits transfer incoming momentum in every direction and it decays while moving', () => {
  for (const [vx, vy] of [[800, 0], [-800, 0], [0, 800], [0, -800], [480, 640]]) {
    clear();
    const player = add(playerAt(-vx / 800 * 60, -vy / 800 * 60));
    Object.assign(player, { vx, vy });
    const grub = add(grubAt(0, 0));
    player.update(0);
    const initialVx = grub.vx;
    const initialVy = grub.vy;
    assert.ok(initialVx * vx + initialVy * vy > 0, 'push follows incoming velocity');
    assert.ok(Math.abs(initialVx * vy - initialVy * vx) < 1e-9);
    grub.update(0.1);
    assert.ok(grub.x * vx + grub.y * vy > 0, 'grub moves away from the hit');
    assert.ok(Math.hypot(grub.vx, grub.vy) < Math.hypot(initialVx, initialVy));
    assert.equal(grub.order, grub.y);
  }
});

test('knockback stays within room bounds while it decays', () => {
  const grub = Grub(19, -19, { x: 0, y: 0, w: 100, h: 100 }, 123);
  Object.assign(grub, { vx: 800, vy: -800 });
  grub.update(0.1);
  assert.equal(grub.x, 20);
  assert.equal(grub.y, -20);
  assert.equal(grub.vx, 440);
  assert.equal(grub.vy, -440);
});

test('splats keep the incoming hit direction after the player bounces', (t) => {
  t.mock.method(Math, 'random', () => 0.4); // 0.4-second flight.
  function burst(vx) {
    clear();
    const player = add(playerAt());
    player.vx = vx;
    add(grubAt());
    player.update(0);
    const landings = [];
    for (const effect of getObjects().filter((object) => !object.tags)) {
      effect.update(0.4);
      effect.render(new Proxy({ ellipse(x, y) { landings.push([x, y]); } }, {
        get: (target, key) => target[key] ?? (() => {}),
      }));
    }
    return landings.sort((a, b) => a[1] - b[1]);
  }
  const baseline = burst(0);
  const biased = burst(800);
  assert.equal(biased.length, 3);
  biased.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - baseline[i][0] - 80) < 1e-9);
    assert.equal(y, baseline[i][1]);
  });
});

test('ordinary box contacts keep normal-speed launches inside grates on all four sides', async () => {
  const { default: MetalGrate } = await import('../src/MetalGrate.js');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    clear();
    const player = add(playerAt());
    Object.assign(player, { vx: dx * 1800, vy: dy * 1800 });
    add(MetalGrate({ x: dx * 400, y: dy * 400, w: dx ? 80 : 240, h: dy ? 80 : 240 }));
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    assert.ok(player.vx * dx + player.vy * dy < 0, 'launch bounces inward');
    assert.ok(player.x * dx + player.y * dy <= 322, 'player stays inside the gate');
  }
});
