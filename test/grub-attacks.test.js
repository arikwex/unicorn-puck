import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

function drawingContext() {
  const calls = [];
  const stack = [];
  const context = new Proxy({
    calls,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() {
      stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, fillStyle: this.fillStyle });
    },
    restore() { Object.assign(this, stack.pop()); },
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, key) {
      return target[key] ?? ((...args) => calls.push({
        method: key, args, color: target.fillStyle,
        alpha: target.globalAlpha, composite: target.globalCompositeOperation,
      }));
    },
  });
  return context;
}

const screenContext = drawingContext();
const tintContexts = [];
globalThis.document = {
  querySelector: () => ({ getContext: () => screenContext }),
  createElement() {
    const context = drawingContext();
    tintContexts.push(context);
    return { getContext: () => context };
  },
};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};

const { add, clear, getObjects, getObjectsByTag } = await import('../src/engine.js');
const { default: Grub } = await import('../src/Grub.js');
const { default: GrubProjectile } = await import('../src/GrubProjectile.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: PhysicsWorld } = await import('../src/PhysicsWorld.js');
const { sweptCircleHitTime } = await import('../src/physics.js');
const { TAG_OBSTACLE, TAG_PROJECTILE } = await import('../src/tags.js');

afterEach(() => { clear(); tintContexts.length = 0; screenContext.calls.length = 0; });

const room = { x: 0, y: 0, w: 1000, h: 1000 };
function startAiming() {
  const player = add(PlayerCharacter(200, 0));
  const grub = add(Grub(0, 0, room, 123));
  for (let i = 0; i < 100 && grub.state !== 'aiming'; i++) grub.update(0.05);
  assert.equal(grub.state, 'aiming');
  return { player, grub };
}

function wall(x, shape = 'box') {
  return {
    tags: [TAG_OBSTACLE],
    puck: () => ({
      x, y: 0, shape, halfWidth: 1, halfHeight: 100, radius: 20,
      mass: Infinity, vx: 0, vy: 0, omega: 0, bounciness: 0.4,
    }),
  };
}

test('grub stays still and tracks the player for two seconds before firing once', () => {
  const { player, grub } = startAiming();
  const position = [grub.x, grub.y];
  grub.update(1);
  player.y = 100;
  grub.update(0.99);
  assert.deepEqual([grub.x, grub.y], position);
  assert.equal(grub.vx, 0);
  assert.equal(grub.vy, 0);
  assert.equal(grub.angle, Math.atan2(grub.y - player.y, player.x - grub.x));
  assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
  const tellContext = drawingContext();
  grub.render(tellContext);
  assert.ok(tellContext.calls.filter((call) => call.method === 'arc')
    .every((call) => call.args[3] === 0 && call.args[4] === Math.PI * 2), 'tell has no progress arcs');
  grub.update(0.01);
  const shots = getObjectsByTag(TAG_PROJECTILE);
  assert.equal(shots.length, 1);
  const shot = shots[0];
  assert.ok(Math.abs(shot.vx * (player.y - shot.y) - shot.vy * (player.x - shot.x)) < 1e-8);
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - 340) < 1e-9);
  assert.equal(grub.state, 'patrol');
  grub.update(0.5);
  assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 1);
});

test('aiming raises an S-shaped body and pulls it backward while the tail stays planted', () => {
  const grub = Grub(0, 0, room, 123);
  const segments = () => {
    const context = drawingContext();
    grub.render(context);
    return context.calls.filter((call) => call.method === 'arc').slice(0, 4).map((call) => call.args);
  };
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    grub.angle = angle;
    grub.state = 'patrol';
    const resting = segments();
    grub.state = 'aiming';
    let previous = resting;
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      grub.aimProgress = progress;
      const pose = segments();
      assert.ok(pose[0][1] < resting[0][1], 'head rises for every facing direction');
      assert.deepEqual(pose[3], resting[3], 'tail remains planted');
      if (Math.abs(Math.cos(angle)) > 0.5) {
        for (let i = 0; i < 3; i++) {
          assert.ok((pose[i][0] - previous[i][0]) * Math.cos(angle) < 0, 'pullback follows local -x');
        }
      }
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.hypot(pose[i][0] - pose[i + 1][0], pose[i][1] - pose[i + 1][1])
          < pose[i][2] + pose[i + 1][2], 'adjacent body segments stay connected');
      }
      previous = pose;
    }
    if (angle === 0) {
      assert.ok(previous[0][0] > previous[1][0]);
      assert.ok(previous[1][0] < previous[2][0]);
      assert.ok(previous[2][0] > previous[3][0], 'alternating bends form the S profile');
    }
  }
});

test('losing the player cancels the tell; a charging hit also interrupts it', () => {
  const { player, grub } = startAiming();
  player.x = 2000;
  grub.update(2);
  assert.equal(grub.state, 'patrol');
  assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
  clear();
  const next = startAiming();
  Object.assign(next.player, { x: next.grub.x - 60, y: next.grub.y, vx: 800, charge: 1 });
  PhysicsWorld().physicsUpdate(0);
  assert.equal(next.grub.state, 'patrol');
  assert.equal(next.grub.aimProgress, 0);
  assert.ok(next.grub.vx > 0);
  assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
});

test('projectiles deal exactly one damage and push along their motion axis', () => {
  for (const [vx, vy] of [[1000, 0], [-1000, 0], [0, 1000], [0, -1000], [600, 800]]) {
    clear();
    const player = add(PlayerCharacter());
    const shot = add(GrubProjectile(-vx * 0.1, -vy * 0.1, vx, vy));
    const world = PhysicsWorld();
    world.physicsUpdate(0.2);
    assert.equal(player.hp, 4);
    assert.ok(Math.abs(player.vx - vx / 1000 * 120) < 1e-9);
    assert.ok(Math.abs(player.vy - vy / 1000 * 120) < 1e-9);
    assert.ok(!getObjects().includes(shot));
    world.physicsUpdate(0);
    assert.equal(player.hp, 4);
  }
});

test('thin walls and circular obstacles block shots before a player', () => {
  for (const shape of ['box', 'circle']) {
    for (const reverse of [false, true]) {
      clear();
      const player = PlayerCharacter(200, 0);
      const obstacle = wall(70, shape);
      const shot = GrubProjectile(0, 0, 4000, 0);
      let wallHits = 0;
      obstacle.onCollision = () => { wallHits++; };
      const objects = [player, obstacle, shot];
      (reverse ? objects.reverse() : objects).forEach(add);
      PhysicsWorld().physicsUpdate(0.1);
      assert.equal(player.hp, 5);
      assert.equal(wallHits, 1);
      assert.ok(!getObjects().includes(shot));
      assert.ok(shot.x < 70);
    }
  }
});

test('shots pass through other enemies and then hit the player', () => {
  const enemy = add(Grub(70, 0, room, 123));
  const player = add(PlayerCharacter(200, 0));
  const shot = add(GrubProjectile(0, 0, 3000, 0));
  let enemyHits = 0;
  enemy.onCollision = () => { enemyHits++; };
  PhysicsWorld().physicsUpdate(0.1);
  assert.equal(enemyHits, 0);
  assert.equal(enemy.hp, 5);
  assert.equal(player.hp, 4);
  assert.ok(!getObjects().includes(shot));
});

test('one shot only hits the nearest player even if it crosses two', () => {
  const far = add(PlayerCharacter(250, 0));
  const near = add(PlayerCharacter(100, 0));
  add(GrubProjectile(0, 0, 4000, 0));
  PhysicsWorld().physicsUpdate(0.1);
  assert.equal(near.hp, 4);
  assert.equal(far.hp, 5);
});

test('sweeps detect moving players crossing a shot and respect rounded box corners', () => {
  const player = add(PlayerCharacter(0, -100, 0, { viscosity: 0 }));
  player.vy = 2000;
  add(GrubProjectile(-100, 0, 2000, 0));
  PhysicsWorld().physicsUpdate(0.1);
  assert.equal(player.hp, 4);

  const box = { x: 0, y: 0, angle: 0, shape: 'box', halfWidth: 10, halfHeight: 10 };
  assert.equal(sweptCircleHitTime({ x: 14, y: 14, radius: 5 }, { x: 16, y: 16 }, box), Infinity);
  assert.ok(Number.isFinite(sweptCircleHitTime({ x: 20, y: 20, radius: 5 }, { x: 10, y: 10 }, box)));
});

test('a miss keeps moving, and unused projectiles expire', () => {
  const shot = add(GrubProjectile(0, 0, 340, 0));
  PhysicsWorld().physicsUpdate(0.1);
  assert.equal(shot.x, 34);
  assert.ok(getObjects().includes(shot));
  assert.equal(shot.update(5), false);
  assert.equal(shot.update(1), true);
});

function slimeSamples() {
  return getObjects().filter((object) => !object.tags).flatMap((effect) => {
    const context = drawingContext();
    effect.render(context);
    const origin = context.calls.find((call) => call.method === 'moveTo')?.args;
    effect.update(0.55);
    effect.render(context);
    return context.calls.filter((call) => call.method === 'ellipse').map((call) => ({ origin, landing: call.args }));
  });
}

test('larger trail splats scatter randomly with 30–70 unit spacing independent of frame size', (t) => {
  let seed;
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  let baseline;
  for (const steps of [[1], [0.1, 0.2, 0.3, 0.4]]) {
    clear();
    seed = 123;
    const shot = add(GrubProjectile(0, 0, 1000, 0));
    assert.equal(shot.radius, 17.5);
    const context = drawingContext();
    shot.render(context);
    assert.equal(context.calls.find((call) => call.method === 'arc').args[2], 17.5);
    const world = PhysicsWorld();
    steps.forEach((dt) => world.physicsUpdate(dt));
    const splats = slimeSamples().sort((a, b) => a.origin[0] - b.origin[0]);
    const gaps = splats.map(({ origin: [x, y] }, i) => {
      assert.equal(y, 0);
      return x - (i ? splats[i - 1].origin[0] : 0);
    });
    assert.ok(gaps.every((gap) => gap >= 30 && gap <= 70));
    assert.ok(new Set(gaps).size > 1);
    assert.ok(splats.every(({ landing: [, , size] }) => size >= 6 && size <= 9));
    for (const axis of [0, 1]) {
      const offsets = splats.map(({ origin, landing }) => landing[axis] - origin[axis]);
      assert.ok(offsets.some((offset) => offset > 0));
      assert.ok(offsets.some((offset) => offset < 0));
    }
    if (baseline) {
      assert.equal(splats.length, baseline.length);
      splats.forEach((splat, i) => {
        assert.ok(Math.abs(splat.origin[0] - baseline[i].origin[0]) < 1e-9);
        assert.ok(Math.abs(splat.landing[0] - baseline[i].landing[0]) < 1e-9);
      });
    } else baseline = splats;
  }
});

test('slime trail emission stops at the collision point and survives projectile removal', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  add(wall(170));
  const shot = add(GrubProjectile(0, 0, 4000, 0));
  PhysicsWorld().physicsUpdate(0.1);
  assert.ok(!getObjects().includes(shot));
  assert.deepEqual(slimeSamples().map(({ origin }) => origin), [[50, 0], [100, 0], [150, 0]]);
});

test('damage produces a bright red silhouette pulse that ends after 0.6 seconds', () => {
  const player = PlayerCharacter(0, 0, -Math.PI / 4);
  player.takeDamage(1);
  player.render(screenContext);
  assert.equal(tintContexts.length, 1);
  const tintContext = tintContexts[0];
  const tintPasses = () => tintContext.calls.filter((call) => call.method === 'fillRect' && call.color === '#ff2020');
  assert.equal(tintPasses().at(-1).alpha, 1);
  assert.equal(tintPasses().at(-1).composite, 'source-atop');
  assert.ok(screenContext.calls.some((call) => call.method === 'drawImage'));
  player.update(0.3);
  player.render(screenContext);
  assert.ok(tintPasses().at(-1).alpha > 0 && tintPasses().at(-1).alpha < 1);
  assert.equal(tintContexts.length, 1, 'reuse the tint canvas');
  player.update(0.3);
  screenContext.calls.length = 0;
  player.render(screenContext);
  assert.ok(!screenContext.calls.some((call) => call.method === 'drawImage'));
  assert.equal(screenContext.globalCompositeOperation, 'source-over');
});
