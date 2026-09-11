import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

let draws = [];
let coarse = false;
let nextFrame;
const stack = [];
const context = new Proxy({
  transform: [1, 0, 0, 1, 0, 0],
  save() { stack.push({ transform: [...this.transform], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, font: this.font }); },
  restore() { Object.assign(this, stack.pop()); },
  setTransform(...matrix) { this.transform = matrix; },
  translate(x, y) { this.transform[4] += x * this.transform[0]; this.transform[5] += y * this.transform[3]; },
  scale(x, y) { this.transform[0] *= x; this.transform[3] *= y; },
  createLinearGradient: () => ({ addColorStop() {} }),
  measureText: (text) => ({ width: text.length * 10 }),
}, {
  get(target, key) {
    return target[key] ?? ((...args) => draws.push({
      method: key, args, transform: [...target.transform], color: target.fillStyle, font: target.font,
    }));
  },
});
const canvas = { getContext: () => context };
globalThis.document = { querySelector: () => canvas };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: coarse });
globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; };

const { hudScale, renderScreenHUD } = await import('../src/hud.js');
const { add, clear, start, stop } = await import('../src/engine.js');
const { default: MiniMap } = await import('../src/MiniMap.js');
const { default: CubeObstacle } = await import('../src/CubeObstacle.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: PlayerHealthHUD } = await import('../src/PlayerHealthHUD.js');
const { default: ChaliceHUD } = await import('../src/ChaliceHUD.js');
const { default: ItemAbilityHUD } = await import('../src/ItemAbilityHUD.js');
const { default: ToastSystem, showToast } = await import('../src/ToastSystem.js');
const { default: StatusCard } = await import('../src/StatusCard.js');

afterEach(() => {
  stop(); clear(); draws = []; coarse = false;
  canvas.width = 800; canvas.height = 600;
});

function screenRect(call) {
  const [x, y, w, h] = call.args;
  const [sx, , , sy, tx, ty] = call.transform;
  return [x * sx + tx, y * sy + ty, w * sx, h * sy];
}

test('HUD uses 0.65 scale on narrow screens and coarse-pointer devices, updating on resize', () => {
  assert.equal(hudScale(), 1);
  canvas.width = 390;
  assert.equal(hudScale(), 0.65);
  canvas.width = 1024; coarse = true;
  assert.equal(hudScale(), 0.65, 'landscape phones and tablets remain mobile-sized');
  coarse = false;
  assert.equal(hudScale(), 1);
});

test('minimap is bottom-left on desktop and mobile, with a white player dot', () => {
  add(CubeObstacle(0, 0, 100, 100));
  const player = PlayerCharacter();
  const map = MiniMap(player);
  renderScreenHUD(map, context);
  assert.equal(draws.length, 0, 'Oracle Eyes still controls visibility');
  player.oracleEyes = true;
  for (const [width, height, scale] of [[800, 600, 1], [390, 844, 0.65]]) {
    canvas.width = width; canvas.height = height; draws = [];
    renderScreenHUD(map, context);
    const panel = draws.find(({ method }) => method === 'fillRect');
    const expected = [10 * scale, height - 170 * scale, 160 * scale, 160 * scale];
    screenRect(panel).forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-8));
    const dot = draws.find(({ method }) => method === 'arc');
    assert.equal(dot.color, '#fff');
    assert.equal(dot.args[2] * dot.transform[0], 4 * scale);
  }
});

test('health, counter, abilities, toasts and status cards all opt into anchored mobile scaling', () => {
  canvas.width = 390; canvas.height = 844;
  const huds = [
    PlayerHealthHUD(PlayerCharacter()), ChaliceHUD(), ItemAbilityHUD(),
    add(ToastSystem()), StatusCard(() => {}),
  ];
  showToast('Defeat all enemies to exit room');
  for (const hud of huds) {
    const original = hud.renderHUD;
    let observed;
    hud.renderHUD = function (ctx) {
      observed = [...ctx.transform];
      original.call(this, ctx);
    };
    renderScreenHUD(hud, context);
    const [ax, ay] = hud.hudAnchor;
    assert.deepEqual(observed, [0.65, 0, 0, 0.65, canvas.width * ax * 0.35, canvas.height * ay * 0.35]);
    assert.deepEqual(context.transform, [1, 0, 0, 1, 0, 0], 'HUD scaling cannot leak to the next object');
  }
  const healthOutline = draws.find(({ method }) => method === 'strokeRect');
  assert.deepEqual(screenRect(healthOutline), [88 * 0.65, 33 * 0.65, 180 * 0.65, 30 * 0.65]);
  const toast = draws.find(({ method, args }) => method === 'fillText' && args[0] === 'Defeat all enemies to exit room');
  assert.equal(toast.args[1] * toast.transform[0] + toast.transform[4], canvas.width / 2);
});

test('engine applies scaling only to anchored UI, leaving aim overlays and world rendering unscaled', () => {
  canvas.width = 390;
  let worldTransform; let hudTransform; let aimTransform;
  add({
    render(ctx) { worldTransform = [...ctx.transform]; },
    renderHUD(ctx) { aimTransform = [...ctx.transform]; },
  });
  add({ hudAnchor: [0, 0], renderHUD(ctx) { hudTransform = [...ctx.transform]; } });
  start();
  nextFrame(performance.now());
  stop();
  assert.deepEqual(worldTransform, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(aimTransform, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(hudTransform, [0.65, 0, 0, 0.65, 0, 0]);
});
