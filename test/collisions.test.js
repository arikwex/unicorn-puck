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
const { default: PhysicsWorld } = await import('../src/PhysicsWorld.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: Grub } = await import('../src/Grub.js');
const { TAG_OBSTACLE, TAG_PUCK } = await import('../src/tags.js');

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
      let playerCalls = 0;
      let grubCalls = 0;
      const playerCollision = player.onCollision;
      const grubCollision = grub.onCollision;
      player.onCollision = function (other, collision) {
        playerCalls++;
        return playerCollision.call(this, other, collision);
      };
      grub.onCollision = function (other, collision) {
        grubCalls++;
        assert.ok(other.vx < 0, 'player has already bounced');
        assert.ok(collision.otherBody.vx > 0, 'grub receives incoming velocity');
        return grubCollision.call(this, other, collision);
      };
      const objects = [player, grub, PhysicsWorld()];
      (reverse ? objects.reverse() : objects).forEach(add);
      frame();
      assert.equal(grub.hp, 3);
      assert.ok(player.vx < 0);
      assert.equal(playerCalls, 1);
      assert.equal(grubCalls, 1);
    }
  }
});

test('all ordinary updates finish before collision detection', () => {
  const world = add(PhysicsWorld());
  world.order = -10000;
  const player = add(playerAt(-200));
  const grub = add(grubAt());
  add({ order: 10000, update() { player.x = 0; } });
  frame();
  assert.equal(grub.hp, 3);
  assert.ok(player.vx < 0);
});

test('motion is integrated before detecting newly reached contacts', () => {
  const player = add(playerAt(-20));
  const grub = add(grubAt());
  PhysicsWorld().physicsUpdate(0.025);
  assert.equal(grub.hp, 3);
  assert.ok(player.vx < 0);
  assert.ok(Math.abs(player.x + 4) < 1e-9);
});

test('removal requested by the first callback waits for the other reaction', () => {
  const player = add(playerAt());
  const grub = add(grubAt());
  const bounce = player.onCollision;
  player.onCollision = function (other, collision) {
    bounce.call(this, other, collision);
    return true;
  };
  const takeHit = grub.onCollision;
  grub.onCollision = function (other, collision) {
    assert.ok(getObjects().includes(player));
    return takeHit.call(this, other, collision);
  };
  PhysicsWorld().physicsUpdate(0);
  assert.equal(grub.hp, 3);
  assert.ok(!getObjects().includes(player));
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

test('box-wall collision delegates bounce and notifies both participants once', () => {
  const player = add(playerAt());
  let bounces = 0;
  const bounce = player.bounce;
  player.bounce = function (response) { bounces++; bounce.call(this, response); };
  let wallCalls = 0;
  const wall = add({
    tags: [TAG_OBSTACLE],
    puck: () => ({
      x: 45, y: 0, angle: 0, halfWidth: 10, halfHeight: 100,
      shape: 'box', mass: Infinity, vx: 0, vy: 0, omega: 0, bounciness: 0.4,
    }),
    onCollision(other, collision) {
      wallCalls++;
      assert.equal(other, player);
      assert.equal(collision.nx, -1);
      assert.equal(collision.otherBody.vx, 800);
    },
  });
  PhysicsWorld().physicsUpdate(0);
  assert.equal(bounces, 1);
  assert.equal(wallCalls, 1);
  assert.equal(player.vx, -320);
  assert.equal(player.x, -3);
  assert.equal(wall.puck().x, 45);
});

test('simultaneous contacts survive separation without doubling the bounce', () => {
  const player = add(playerAt());
  const first = add(grubAt());
  const second = add(grubAt());
  PhysicsWorld().physicsUpdate(0);
  assert.equal(first.hp, 3);
  assert.equal(second.hp, 3);
  assert.equal(player.vx, -320);
  assert.equal(player.x, -4);
});

test('puck pairs receive opposite normals once, including objects with both tags', () => {
  const a = add(playerAt(0));
  const b = playerAt(70);
  b.vx = -800;
  b.tags.push(TAG_OBSTACLE);
  add(b);
  const contacts = [];
  for (const player of [a, b]) {
    const onCollision = player.onCollision;
    player.onCollision = function (other, collision) {
      contacts.push([this, other, collision.nx, collision.otherBody.vx]);
      onCollision.call(this, other, collision);
    };
  }
  PhysicsWorld().physicsUpdate(0);
  assert.deepEqual(contacts, [[a, b, 1, -800], [b, a, -1, 800]]);
  assert.equal(a.vx, -440);
  assert.equal(b.vx, 440);
  assert.equal(a.x, -3);
  assert.equal(b.x, 73);
  assert.ok(a.tags.includes(TAG_PUCK));
});

test('damage thresholds, cooldown and killing-blow removal remain intact', () => {
  const player = add(playerAt());
  const grub = add(grubAt());
  const world = PhysicsWorld();
  function hit(charge) {
    Object.assign(player, { x: 0, vx: 800, charge });
    world.physicsUpdate(0);
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
  let receivedKillingCollision = false;
  const onCollision = player.onCollision;
  player.onCollision = function (other, collision) {
    receivedKillingCollision = other === grub;
    onCollision.call(this, other, collision);
  };
  hit(1);
  assert.equal(grub.hp, 0);
  assert.equal(receivedKillingCollision, true);
  assert.ok(player.vx < 0);
  assert.ok(!getObjects().includes(grub));
  assert.equal(getObjects().filter((object) => !object.tags).length, 23,
    'three callouts, nine hit splats and eleven death splats survive');
});

test('splats keep the incoming hit direction after the player bounces', (t) => {
  t.mock.method(Math, 'random', () => 0.4); // 0.4-second flight.
  function burst(vx) {
    clear();
    const player = add(playerAt());
    player.vx = vx;
    add(grubAt());
    PhysicsWorld().physicsUpdate(0);
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
