import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const canvas = { getContext: () => ({}) };
globalThis.document = { querySelector: () => canvas };
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
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
  createBufferSource() {
    return { playbackRate: { value: 1 }, connect() {}, start() { soundStarts++; } };
  }
};

const { add, clear } = await import('../src/engine.js');
const bus = await import('../src/bus.js');
const { default: ToastSystem } = await import('../src/ToastSystem.js');
const { default: HealthItem } = await import('../src/HealthItem.js');
const { default: Chalice } = await import('../src/Chalice.js');
const { chaliceProgress, resetChalices } = await import('../src/chaliceProgress.js');
const { TAG_PLAYER } = await import('../src/tags.js');

afterEach(() => {
  clear();
  bus.clear();
  soundStarts = 0;
  canvas.width = 800;
  canvas.height = 600;
});

function draw(toasts) {
  const result = { text: [], panels: [] };
  toasts.renderHUD({
    save() {}, restore() {}, strokeRect() {},
    measureText: (text) => ({ width: text.length * 12 }),
    fillRect(...args) { result.panels.push(args); },
    fillText(text, x, y) { result.text.push({ text, x, y, alpha: this.globalAlpha }); },
  });
  return result;
}

test('an item event shows a bottom-center toast for 3.5 seconds with one chime', () => {
  const toasts = add(ToastSystem());
  assert.equal(draw(toasts).text.length, 0);
  bus.emit('item-collected', { name: 'Health Potion' });
  assert.equal(soundStarts, 1);
  toasts.update(0.2);
  assert.deepEqual(draw(toasts).text, [
    { text: 'Health Potion Collected', x: 400, y: 554, alpha: 1 },
  ]);
  toasts.update(3.2);
  assert.equal(draw(toasts).text.length, 1);
  assert.equal(soundStarts, 1);
  toasts.update(0.11);
  assert.equal(draw(toasts).text.length, 0);
  assert.equal(soundStarts, 1);
});

test('rapid pickups queue, pairing each displayed toast with exactly one sound', () => {
  const toasts = add(ToastSystem());
  bus.emit('item-collected', { name: 'Health Potion' });
  bus.emit('item-collected', { name: 'Pegacorn Blood Chalice' });
  assert.equal(soundStarts, 1);
  assert.equal(draw(toasts).text[0].text, 'Health Potion Collected');
  toasts.update(3.5);
  assert.equal(soundStarts, 2);
  assert.equal(draw(toasts).text[0].text, 'Pegacorn Blood Chalice Collected');
  toasts.update(3.4);
  assert.equal(draw(toasts).text.length, 1);
  toasts.update(0.11);
  assert.equal(draw(toasts).text.length, 0);
  assert.equal(soundStarts, 2);
});

test('clearing a scene removes its subscription and pending notifications', () => {
  const previous = add(ToastSystem());
  bus.emit('item-collected', { name: 'First' });
  bus.emit('item-collected', { name: 'Queued' });
  clear();
  bus.emit('item-collected', { name: 'While Cleared' });
  assert.equal(soundStarts, 1);
  assert.equal(draw(previous).text.length, 0);
  const next = add(ToastSystem());
  bus.emit('item-collected', { name: 'New Run' });
  assert.equal(soundStarts, 2);
  assert.equal(draw(next).text[0].text, 'New Run Collected');
});

test('long item names fit inside a narrow screen', () => {
  canvas.width = 320;
  const toasts = add(ToastSystem());
  bus.emit('item-collected', { name: 'Pegacorn Blood Chalice' });
  toasts.update(0.2);
  const result = draw(toasts);
  assert.deepEqual(result.panels, [[24, 532, 272, 44]]);
  assert.equal(result.text[0].x, 160);
});

test('health pickup emits once after spawn protection, including at full health', () => {
  add(ToastSystem());
  const player = add({
    x: 0, y: 0, radius: 20, hp: 3, tags: [TAG_PLAYER],
    heal(amount) {
      const healed = Math.min(amount, 5 - this.hp);
      this.hp += healed;
      return healed;
    },
  });
  const events = [];
  bus.on('item-collected', (event) => events.push(event));
  const item = HealthItem(0, 0);
  assert.equal(item.update(0.1), false);
  assert.equal(events.length, 0);
  assert.equal(item.update(0.21), true);
  assert.equal(player.hp, 5);
  assert.equal(item.update(0.1), true);
  assert.deepEqual(events, [{ name: 'Health Potion' }]);
  assert.equal(soundStarts, 1);
  assert.equal(HealthItem(0, 0).update(0.31), true);
  assert.equal(player.hp, 5);
  assert.equal(events.length, 2);
});

test('chalice pickup emits once and uses only the toast chime', () => {
  add(ToastSystem());
  add({ x: 0, y: 0, radius: 20, tags: [TAG_PLAYER] });
  resetChalices(2);
  const events = [];
  bus.on('item-collected', (event) => events.push(event));
  const item = Chalice(0, 0);
  assert.equal(item.update(0.1), true);
  assert.equal(item.update(0.1), true);
  assert.deepEqual(events, [{ name: 'Pegacorn Blood Chalice' }]);
  assert.equal(chaliceProgress().collected, 1);
  assert.equal(soundStarts, 1);
});

test('combat instructions appear immediately without a pickup chime or losing queued pickups', () => {
  const toasts = add(ToastSystem());
  bus.emit('item-collected', { name: 'Health Potion' });
  bus.emit('item-collected', { name: 'Pegacorn Blood Chalice' });
  bus.emit('toast', { message: 'Defeat all enemies to exit room', priority: true });
  assert.equal(draw(toasts).text[0].text, 'Defeat all enemies to exit room');
  assert.equal(soundStarts, 1);
  toasts.update(3.5);
  assert.equal(draw(toasts).text[0].text, 'Health Potion Collected');
  assert.equal(soundStarts, 1, 'resuming a pickup never repeats its chime');
  toasts.update(3.5);
  assert.equal(draw(toasts).text[0].text, 'Pegacorn Blood Chalice Collected');
  assert.equal(soundStarts, 2);
  clear();
  bus.emit('toast', { message: 'After teardown' });
  assert.equal(draw(toasts).text.length, 0);
});
