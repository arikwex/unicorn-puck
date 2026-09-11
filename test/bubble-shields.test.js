import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

let draws = [];
const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, {
  get(target, key) {
    return target[key] ?? ((...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      draws.push({ method: key, args, color: target.fillStyle, stroke: target.strokeStyle });
    });
  },
});
const canvas = { getContext: () => context };
globalThis.document = { querySelector: () => canvas, createElement: () => ({ getContext: () => context }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
let sounds = 0;
globalThis.AudioContext = class {
  sampleRate = 1000;
  state = 'running';
  destination = {};
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    return { playbackRate: { value: 1 }, connect() {}, start() { sounds++; } };
  }
};

const { add, clear, getObjects } = await import('../src/engine.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: PlayerHealthHUD } = await import('../src/PlayerHealthHUD.js');
const { default: BubbleShieldItem } = await import('../src/BubbleShieldItem.js');
const { default: TreasureChest } = await import('../src/TreasureChest.js');
const { default: GrubProjectile } = await import('../src/GrubProjectile.js');
const { default: PhysicsWorld } = await import('../src/PhysicsWorld.js');
const { default: ToastSystem } = await import('../src/ToastSystem.js');
const { SHIELD_COLOR } = await import('../src/bubbleShield.js');
const { collectItemAbility, resetItemAbilities } = await import('../src/ItemAbility.js');
const bus = await import('../src/bus.js');
const originalRandom = Math.random;

afterEach(() => {
  clear(); bus.clear(); resetItemAbilities();
  draws = []; sounds = 0; canvas.width = 800;
  Math.random = originalRandom;
});

test('each shield absorbs exactly one whole damaging hit, then is permanently consumed', () => {
  const player = PlayerCharacter();
  assert.equal(player.bubbleShields, 0);
  player.addBubbleShield(); player.addBubbleShield();
  player.takeDamage(0); player.takeDamage(-1);
  assert.equal(player.bubbleShields, 2);
  player.takeDamage(100);
  assert.equal(player.bubbleShields, 1);
  assert.equal(player.hp, 5);
  player.takeDamage();
  assert.equal(player.bubbleShields, 0);
  assert.equal(player.hp, 5);
  player.update(100); player.heal(100);
  assert.equal(player.bubbleShields, 0, 'time and healing do not regenerate shields');
  player.takeDamage(2);
  assert.equal(player.hp, 3);
  assert.equal(player.maxHp, 5);
});

test('pickup respects spawn protection and distance, stacks at full HP, and emits once', () => {
  const player = add(PlayerCharacter());
  add(ToastSystem());
  const events = [];
  bus.on('item-collected', (event) => events.push(event));
  const pickup = BubbleShieldItem(0, 0);
  assert.equal(pickup.update(0.1), false);
  player.x = 300;
  assert.equal(pickup.update(0.21), false);
  player.x = 0;
  assert.equal(pickup.update(0), true);
  assert.equal(pickup.update(0), true);
  assert.equal(player.bubbleShields, 1);
  assert.equal(player.hp, 5);
  assert.deepEqual(events, [{ name: 'Bubble Shield' }]);
  assert.equal(sounds, 1, 'one pickup chime for the toast');
  assert.equal(BubbleShieldItem(0, 0).update(0.31), true);
  assert.equal(player.bubbleShields, 2);
});

test('shields stack without a gameplay cap and cannot revive a dead player', () => {
  const player = add(PlayerCharacter());
  for (let i = 0; i < 1000; i++) player.addBubbleShield();
  assert.equal(player.bubbleShields, 1000);
  player.hp = 0;
  player.addBubbleShield(); player.takeDamage();
  assert.equal(player.bubbleShields, 1000);
  assert.equal(BubbleShieldItem(0, 0).update(1), false);
  assert.equal(PlayerCharacter().bubbleShields, 0, 'new runs start without old shields');
});

test('exactly one translucent bubble is rendered regardless of stack size, disappearing at zero', () => {
  const player = PlayerCharacter();
  for (const count of [0, 1, 7, 100, 0]) {
    player.bubbleShields = count;
    draws = [];
    player.render(context);
    const bubbles = draws.filter(({ method, color }) => method === 'fill' && color === SHIELD_COLOR);
    assert.equal(bubbles.length, count > 0 ? 1 : 0);
  }
  player.addBubbleShield(); player.takeDamage();
  draws = [];
  player.render(context);
  assert.ok(!draws.some(({ method }) => method === 'drawImage'), 'absorbed hits do not trigger the red damage flash');
});

test('blue HUD ticks use empty health slots before expanding, without changing max HP or HP colors', () => {
  const player = PlayerCharacter();
  const hud = PlayerHealthHUD(player);
  for (const [hp, shields, width, color] of [[2, 2, 180, '#e93'], [5, 3, 288, '#4c5'], [5, 0, 180, '#4c5']]) {
    player.hp = hp; player.bubbleShields = shields; draws = [];
    hud.renderHUD(context);
    const ticks = draws.filter(({ method }) => method === 'fillRect').slice(1);
    assert.deepEqual(ticks.map(({ color: tickColor }) => tickColor), [
      ...Array(hp).fill(color), ...Array(shields).fill(SHIELD_COLOR),
    ]);
    const outline = draws.find(({ method }) => method === 'strokeRect');
    assert.equal(outline.args[0], 88, 'left edge remains fixed');
    assert.equal(outline.args[2], width);
    assert.equal(outline.stroke, '#fff');
    assert.equal(player.maxHp, 5);
  }
});

test('large stacks fit a mobile screen with positive-width blue ticks and padded white outline', () => {
  canvas.width = 320;
  const player = PlayerCharacter(0, 0, 0, { bubbleShields: 1000 });
  PlayerHealthHUD(player).renderHUD(context);
  const ticks = draws.filter(({ method, color }) => method === 'fillRect' && color === SHIELD_COLOR);
  const outline = draws.find(({ method }) => method === 'strokeRect');
  assert.equal(ticks.length, 1000);
  assert.ok(ticks.every(({ args }) => args[2] > 0));
  assert.ok(outline.args[0] + outline.args[2] <= canvas.width - 16);
  const last = ticks.at(-1).args;
  assert.ok(last[0] + last[2] <= outline.args[0] + outline.args[2] - 3 + 1e-8);
});

test('projectiles consume one shield once, still knock back, and damage HP only after charges run out', () => {
  const player = add(PlayerCharacter(0, 0, 0, { bubbleShields: 1 }));
  const physics = PhysicsWorld();
  const shot = add(GrubProjectile(-100, 0, 1000, 0));
  physics.physicsUpdate(0.1);
  assert.equal(player.bubbleShields, 0);
  assert.equal(player.hp, 5);
  assert.ok(player.vx > 0);
  assert.ok(!getObjects().includes(shot));
  add(GrubProjectile(player.x - 100, player.y, 1000, 0));
  physics.physicsUpdate(0.1);
  assert.equal(player.hp, 4);
});

test('battle armor and healing preserve shield charges without making them permanent max health', () => {
  const player = PlayerCharacter(0, 0, 0, { hp: 2, bubbleShields: 3 });
  collectItemAbility('battleArmor', player);
  assert.equal(player.hp, 4); assert.equal(player.maxHp, 7);
  player.heal(100);
  assert.equal(player.hp, 7); assert.equal(player.bubbleShields, 3);
  for (let i = 0; i < 3; i++) player.takeDamage();
  assert.equal(player.maxHp, 7); assert.equal(player.hp, 7);
});

test('chests can drop either a bubble shield or the existing health pickup', () => {
  for (const roll of [0.1, 0.9]) {
    clear();
    Math.random = () => roll;
    const player = add(PlayerCharacter(0, 0, 0, { hp: 1 }));
    player.charge = 1;
    const chest = TreasureChest(0, 0);
    chest.onCollision(player, { otherBody: player });
    chest.update(0.7);
    assert.equal(chest.onCollision(player, { otherBody: player }), true);
    const pickup = getObjects().find((object) => object !== player && object.x === 0 && object.y === 0);
    assert.ok(pickup);
    assert.equal(pickup.update(0.31), true);
    assert.equal(player.bubbleShields, roll < 0.5 ? 1 : 0);
    assert.equal(player.hp, roll < 0.5 ? 1 : 3);
  }
});
