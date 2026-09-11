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
const { default: Grub } = await import('../src/Grub.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: CombatRoom } = await import('../src/CombatRoom.js');
const { TAG_PROJECTILE } = await import('../src/tags.js');

afterEach(() => { clear(); soundStarts = 0; });
const room = { x: 0, y: 0, w: 1000, h: 1000 };
function make(type) { return Grub(0, 0, room, 123, { type }); }
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

test('large type has 40% larger collision geometry, three extra HP, and costs two slots', () => {
  const small = make('small');
  const large = make('large');
  assert.equal(large.hp, small.hp + 3);
  assert.equal(large.maxHp, 8);
  assert.equal(large.puck().radius, small.puck().radius * 1.4);
  assert.equal(small.enemyCost, 1);
  assert.equal(large.enemyCost, 2);
  assert.equal(Grub(0, 0, room, 1).type, 'small');
});

test('body, face, tell, and recovery scale together; large grubs add orange eyes and three spikes', () => {
  const small = make('small'); const large = make('large');
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const state of ['patrol', 'aiming', 'recovering']) {
      for (const grub of [small, large]) Object.assign(grub, { angle, anim: 0, state, aimProgress: 0.75 });
      const smallCalls = draw(small); const largeCalls = draw(large);
      const arcs = (calls) => calls.filter(({ method }) => method === 'arc').map(({ args }) => args);
      const a = arcs(smallCalls); const b = arcs(largeCalls);
      assert.equal(a.length, b.length);
      a.forEach((circle, i) => {
        for (let field = 0; field < 3; field++) assert.ok(Math.abs(b[i][field] - circle[field] * 1.4) < 1e-8);
      });
      assert.equal(largeCalls.filter(({ method }) => method === 'lineTo').length, 6, 'three triangular spikes');
      assert.equal(smallCalls.filter(({ method }) => method === 'lineTo').length, 0);
      assert.ok(!largeCalls.some(({ method, color }) => method === 'fill' && color === '#5f5'));
      if (angle === 0) {
        const faceDots = smallCalls.filter(({ method, color }) => method === 'fill' && color === '#5f5').length;
        assert.equal(largeCalls.filter(({ method, color }) => method === 'fill' && color === '#ff9a32').length, faceDots + 3,
          'three orange spikes plus all visible face features');
      }
    }
  }
});

test('large grubs fire a symmetric three-shot forward fan from their enlarged mouth, once per tell', () => {
  for (const type of ['small', 'large']) {
    clear(); soundStarts = 0;
    const player = add(PlayerCharacter(200, 0));
    const grub = add(make(type));
    for (let frame = 0; frame < 100 && grub.state !== 'aiming'; frame++) grub.update(0.05);
    assert.equal(grub.state, 'aiming');
    const position = [grub.x, grub.y];
    grub.update(1.99);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, 0);
    grub.aimProgress = 1;
    const mouth = draw(grub).filter(({ method, args }) => method === 'arc' && args[2] === 4 * grub.size).at(-1).args;
    grub.update(0.01);
    const shots = getObjectsByTag(TAG_PROJECTILE);
    assert.equal(shots.length, type === 'large' ? 3 : 1);
    assert.equal(soundStarts, 1, 'one shot sound per volley');
    assert.deepEqual([grub.x, grub.y], position);
    const heading = Math.atan2(player.y - mouth[1], player.x - mouth[0]);
    shots.forEach((shot, i) => {
      assert.equal(shot.x, mouth[0]); assert.equal(shot.y, mouth[1]);
      assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - 340) < 1e-8);
      const offset = type === 'large' ? (i - 1) * Math.PI / 12 : 0;
      assert.ok(Math.abs(Math.atan2(shot.vy, shot.vx) - heading - offset) < 1e-8);
      assert.deepEqual(draw(shot).filter(({ method }) => method === 'fill').map(({ color }) => color),
        type === 'large' ? ['#ff9a32', '#ffe1b3'] : ['#3dff5c', '#d9ffde']);
    });
    assert.equal(grub.state, 'recovering');
    grub.update(0.1);
    assert.equal(getObjectsByTag(TAG_PROJECTILE).length, shots.length);
    const before = new Set(getObjects());
    shots[0].x += 100;
    shots[0].afterPhysics();
    const splats = getObjects().filter((object) => !before.has(object));
    assert.ok(splats.length > 0);
    for (const splat of splats) {
      const color = type === 'large' ? '#ff9a32' : '#3dff5c';
      assert.ok(draw(splat).some((call) => call.method === 'stroke' && call.stroke === color));
      splat.update(1);
      assert.ok(draw(splat).some((call) => call.method === 'fill' && call.color === color));
    }
  }
});

test('large grub hit and death splashes are orange while small grub colors are unchanged', () => {
  for (const type of ['small', 'large']) {
    clear();
    const grub = make(type);
    const player = PlayerCharacter();
    player.charge = 1;
    player.impactDamageBonus = 100;
    assert.equal(grub.onCollision(player, { otherBody: player }), true);
    const colors = getObjects().flatMap((effect) => draw(effect)
      .filter(({ method }) => method === 'stroke').map(({ stroke }) => stroke));
    assert.equal(colors.length, 14);
    assert.deepEqual(new Set(colors), new Set(type === 'large' ? ['#ff9a32'] : ['#3dff5c', '#8b4fe0']));
  }
});

test('large grubs retain hit cooldown, white outline flash and an eight-slot health bar', () => {
  const grub = make('large');
  const player = PlayerCharacter();
  player.charge = 0.5;
  grub.onCollision(player, { otherBody: player });
  assert.equal(grub.hp, 7);
  grub.onCollision(player, { otherBody: player });
  assert.equal(grub.hp, 7, 'same-hit cooldown still applies');
  grub.update(0.1);
  const calls = draw(grub);
  const healthTicks = calls.filter(({ method, color }) => method === 'fillRect' && color === '#46c45c');
  assert.equal(healthTicks.length, 7);
  assert.equal(grub.maxHp, 8);
  assert.ok(calls.some(({ method, stroke, alpha }) => method === 'stroke' && stroke === '#fff' && alpha > 0));
});

test('a large grub keeps combat locked until it dies, then clears once despite its two-slot cost', () => {
  add(PlayerCharacter());
  const small = make('small'); const large = make('large');
  const encounter = add(CombatRoom(room, [{ x: -550, y: 0, w: 100, h: 200 }], [small, large]));
  encounter.update();
  assert.equal(encounter.state, 'active');
  small.hp = 0;
  large.hp = 1;
  encounter.update();
  assert.equal(encounter.state, 'active');
  large.hp = 0;
  encounter.update();
  assert.equal(encounter.state, 'cleared');
  assert.equal(soundStarts, 2, 'one start cue and one clear cue');
});
