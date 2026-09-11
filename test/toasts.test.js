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
const { default: ToastSystem, showItemCollectedToast, showToast } = await import('../src/ToastSystem.js');
const { default: HealthItem } = await import('../src/HealthItem.js');
const { default: Chalice } = await import('../src/Chalice.js');
const { chaliceProgress, resetChalices } = await import('../src/chaliceProgress.js');
const { TAG_PLAYER } = await import('../src/tags.js');

afterEach(() => {
  clear();
  soundStarts = 0;
  canvas.width = 800;
  canvas.height = 600;
});

function draw(toasts) {
  const result = { text: [], panels: [] };
  const saved = [];
  toasts.hud({
    globalAlpha: 1,
    save() { saved.push(this.globalAlpha); },
    restore() { this.globalAlpha = saved.pop(); },
    strokeRect() {},
    measureText: (text) => ({ width: text.length * 12 }),
    fillRect(...args) { result.panels.push(args); },
    fillText(text, x, y) { result.text.push({ text, x, y, alpha: this.globalAlpha }); },
  });
  return result;
}

test('an item toast shows bottom-center for 3.5 seconds with one chime', () => {
  const toasts = add(ToastSystem());
  assert.equal(draw(toasts).text.length, 0);
  showItemCollectedToast('Health Potion');
  assert.equal(soundStarts, 1);
  toasts.tick(0.2);
  assert.deepEqual(draw(toasts).text, [
    { text: 'Health Potion Collected', x: 400, y: 554, alpha: 1 },
  ]);
  toasts.tick(3.2);
  assert.equal(draw(toasts).text.length, 1);
  assert.equal(soundStarts, 1);
  toasts.tick(0.11);
  assert.equal(draw(toasts).text.length, 0);
  assert.equal(soundStarts, 1);
});

test('new pickups immediately replace the toast and restart its duration with one chime', () => {
  const toasts = add(ToastSystem());
  showItemCollectedToast('Health Potion');
  assert.equal(soundStarts, 1);
  assert.equal(draw(toasts).text[0].text, 'Health Potion Collected');
  toasts.tick(3);
  showItemCollectedToast('Pegacorn Blood Chalice');
  assert.equal(soundStarts, 2);
  assert.equal(draw(toasts).text[0].text, 'Pegacorn Blood Chalice Collected');
  toasts.tick(3.4);
  assert.equal(draw(toasts).text.length, 1);
  toasts.tick(0.11);
  assert.equal(draw(toasts).text.length, 0);
  assert.equal(soundStarts, 2);
  toasts.tick(10);
  assert.equal(draw(toasts).text.length, 0, 'replaced toasts never reappear');
});

test('a new run starts without the previous run\'s toast', () => {
  add(ToastSystem());
  showItemCollectedToast('First');
  clear();
  const next = add(ToastSystem());
  assert.equal(draw(next).text.length, 0);
  showItemCollectedToast('New Run');
  assert.equal(soundStarts, 2);
  assert.equal(draw(next).text[0].text, 'New Run Collected');
});

test('long item names fit inside a narrow screen', () => {
  canvas.width = 320;
  const toasts = add(ToastSystem());
  showItemCollectedToast('Pegacorn Blood Chalice');
  toasts.tick(0.2);
  const result = draw(toasts);
  assert.deepEqual(result.panels, [[24, 532, 272, 44]]);
  assert.equal(result.text[0].x, 160);
});

test('health pickup toasts once after spawn protection, including at full health', () => {
  const toasts = add(ToastSystem());
  const player = add({
    x: 0, y: 0, r: 20, hp: 3, tags: [TAG_PLAYER],
    heal(amount) {
      const healed = Math.min(amount, 5 - this.hp);
      this.hp += healed;
      return healed;
    },
  });
  const item = HealthItem(0, 0);
  assert.equal(item.tick(0.1), false);
  assert.equal(draw(toasts).text.length, 0);
  assert.equal(item.tick(0.21), true);
  assert.equal(player.hp, 5);
  assert.equal(draw(toasts).text[0].text, 'Health Potion Collected');
  assert.equal(soundStarts, 1);
  assert.equal(HealthItem(0, 0).tick(0.31), true);
  assert.equal(player.hp, 5);
  assert.equal(soundStarts, 2);
});

test('chalice pickup toasts once and uses only the toast chime', () => {
  const toasts = add(ToastSystem());
  add({ x: 0, y: 0, r: 20, tags: [TAG_PLAYER] });
  resetChalices(2);
  const item = Chalice(0, 0);
  assert.equal(item.tick(0.1), true);
  assert.equal(draw(toasts).text[0].text, 'Pegacorn Blood Chalice Collected');
  assert.equal(chaliceProgress().collected, 1);
  assert.equal(soundStarts, 1);
});

test('generic and pickup toasts replace each other immediately without replaying old messages', () => {
  const toasts = add(ToastSystem());
  showItemCollectedToast('Health Potion');
  showItemCollectedToast('Pegacorn Blood Chalice');
  showToast('Defeat all enemies to exit room');
  assert.equal(draw(toasts).text[0].text, 'Defeat all enemies to exit room');
  assert.equal(soundStarts, 2);
  showItemCollectedToast('Bubble Shield');
  assert.equal(draw(toasts).text[0].text, 'Bubble Shield Collected');
  assert.equal(soundStarts, 3);
  toasts.tick(3.5);
  assert.equal(draw(toasts).text.length, 0);
});
