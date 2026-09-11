import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

let calls = [];
const context = new Proxy({
  createLinearGradient() { return { addColorStop() {} }; },
}, {
  get(target, key) {
    return target[key] ?? ((...args) => {
      for (const value of args) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value));
      }
      calls.push({ method: key, args, color: target.fillStyle, stroke: target.strokeStyle });
    });
  },
});
globalThis.document = { querySelector: () => ({ getContext: () => context }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
let nextFrame;
globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; };

const { add, clear, start, stop } = await import('../src/engine.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: PlayerHealthHUD } = await import('../src/PlayerHealthHUD.js');

afterEach(() => { stop(); clear(); calls = []; });

test('player health starts full, supports custom HP and clamps damage at zero', () => {
  const player = PlayerCharacter();
  assert.equal(player.hp, 5);
  assert.equal(player.maxHp, 5);
  player.takeDamage();
  assert.equal(player.hp, 4);
  player.takeDamage(-2);
  assert.equal(player.hp, 4);
  player.takeDamage(100);
  assert.equal(player.hp, 0);
  const custom = PlayerCharacter(0, 0, 0, { maxHp: 10, hp: 7 });
  assert.equal(custom.hp, 7);
  assert.equal(custom.maxHp, 10);
});

test('HUD reflects live HP with shared colors, white outline and padded segments', () => {
  const player = PlayerCharacter();
  const hud = PlayerHealthHUD(player);
  for (const [hp, color] of [[5, '#4c5'], [4, '#4c5'], [3, '#ed4'], [2, '#e93'], [1, '#d33'], [0, '#d33']]) {
    player.hp = hp;
    calls = [];
    hud.renderHUD(context);
    const rectangles = calls.filter((call) => call.method === 'fillRect');
    const outline = calls.find((call) => call.method === 'strokeRect');
    assert.equal(rectangles.length, hp + 1);
    assert.equal(outline.stroke, '#fff');
    assert.equal(outline.args[3], 30);
    for (const tick of rectangles.slice(1)) {
      assert.equal(tick.color, color);
      assert.equal(tick.args[1] - outline.args[1] - context.lineWidth / 2, 2);
      assert.equal(outline.args[3] - tick.args[3] - context.lineWidth, 4);
    }
  }
});

test('portrait stays fixed when the player moves, turns or charges', () => {
  const player = PlayerCharacter();
  const hud = PlayerHealthHUD(player);
  const geometry = () => calls.map(({ method, args }) => [method, args]);
  hud.renderHUD(context);
  const initial = geometry();
  Object.assign(player, { x: 1000, y: -400, angle: Math.PI, charge: 1 });
  calls = [];
  hud.renderHUD(context);
  assert.deepEqual(geometry(), initial);
  assert.ok(calls.some((call) => call.method === 'arc'), 'portrait draws the head');
  assert.ok(calls.some((call) => call.method === 'clip'), 'portrait draws the horn stripes');
});

test('HUD runs after world rendering with the screen transform restored', () => {
  let hudCalled = false;
  add({ order: -1000, renderHUD(ctx) {
    hudCalled = true;
    const lastTransform = calls.filter((call) => call.method === 'setTransform').at(-1);
    assert.deepEqual(lastTransform.args, [1, 0, 0, 1, 0, 0]);
    assert.ok(calls.some((call) => call.method === 'world'));
    PlayerHealthHUD(PlayerCharacter()).renderHUD(ctx);
  } });
  add({ order: 1e6, render(ctx) {
    ctx.setTransform(3, 0, 0, 3, -200, 100);
    calls.push({ method: 'world' });
  } });
  start();
  nextFrame(performance.now());
  stop();
  assert.equal(hudCalled, true);
});
