import assert from 'node:assert/strict';
import { test } from 'node:test';

const listeners = new Map();
const canvas = {
  getContext: () => ({}),
  addEventListener: (event, callback, options) => listeners.set(event, options?.once
    ? () => { listeners.delete(event); callback(); }
    : callback),
};
globalThis.document = { querySelector: () => canvas };
globalThis.window = {};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.screen = { width: 800 };
globalThis.addEventListener = () => {};

const { default: MainMenu } = await import('../src/MainMenu.js');
const { getObjects } = await import('../src/engine.js');

function render(menu) {
  const calls = [];
  const context = new Proxy({
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 20 }),
    createLinearGradient: (...args) => ({
      endpoints: args,
      stops: [],
      addColorStop(offset, color) { this.stops.push([offset, color]); },
    }),
  }, {
    get(target, key) {
      return key in target ? target[key] : (...args) => calls.push({
        method: key, args, color: target.fillStyle, font: target.font, alpha: target.globalAlpha,
      });
    },
  });
  menu.hud(context);
  return calls;
}

test('menu keeps a gradient title, centered unicorn and larger start prompt across screen sizes', () => {
  const menu = MainMenu(() => {});
  for (const [width, height, deviceWidth = width] of [[800, 600], [320, 640], [390, 844], [980, 1800, 390], [1200, 500], [1920, 1080]]) {
    canvas.width = width;
    canvas.height = height;
    screen.width = deviceWidth;
    const calls = render(menu);
    const text = calls.filter(({ method }) => method === 'fillText');
    assert.deepEqual(text.map(({ args }) => args[0]), ['PEGACORN', 'BLOOD', '[Click to Start]']);
    assert.equal(text[0].color, text[1].color, 'both title lines share a gradient');
    assert.deepEqual(text[0].color.stops, [[0, '#f66'], [0.5, '#ff6'], [1, '#6cf']]);
    const [left, top, right, bottom] = text[0].color.endpoints;
    assert.equal((left + right) / 2, width / 2, 'gradient is centered on the title');
    assert.ok(left < right);
    assert.equal(top, bottom, 'gradient runs horizontally');
    assert.ok(text.every(({ args }) => args[1] === width / 2));
    const mobile = Math.min(width, deviceWidth) < 600;
    const titleSize = Math.max(34, Math.min(104, width * 0.115)) * (mobile ? 2.25 : 1);
    assert.equal(text[0].font, `900 ${titleSize}px sans-serif`);
    assert.equal(text[1].font, text[0].font);
    assert.equal(text[0].args[3], width - 32, 'enlarged title fits narrow screens');
    assert.equal(text[1].args[3], width - 32, 'second title line also fits');
    assert.equal(text[2].font, 'bold 56px sans-serif');
    assert.equal(text[2].args[3], width - 32, 'prompt fits narrow screens');
    assert.equal(text[2].args[2], height - (mobile ? height * 0.12 : 48), 'mobile prompt has more bottom clearance');
    const character = calls.findIndex(({ method, args }) => method === 'translate'
      && args[0] === width / 2 && args[1] === height * 0.58);
    assert.ok(character >= 0, 'unicorn remains centered');
    const scale = Math.max(1.6, Math.min(3.2, Math.min(width, height) * 0.006));
    assert.equal(calls[character + 1].method, 'scale');
    assert.deepEqual(calls[character + 1].args, [scale, scale]);
    assert.ok(calls.some(({ method }) => method === 'fill'), 'character art is drawn');
    assert.ok(!calls.some(({ method, color }) => method === 'fillRect'
      && ['#766', '#445'].includes(color)), 'no background walls');
    assert.ok(!calls.some(({ color }) => ['#a13', '#eb4', '#f60'].includes(color)), 'no chalice or candelabra');
    assert.equal(getObjects().length, 0, 'menu does not add gameplay objects');
  }
});

test('unicorn and start prompt animate without starting gameplay', () => {
  const menu = MainMenu(() => assert.fail('animation must not start the game'));
  const before = render(menu);
  menu.tick(0.2);
  const after = render(menu);
  const paths = (calls) => calls.filter(({ method }) => method === 'quadraticCurveTo');
  assert.notDeepEqual(paths(before), paths(after), 'unicorn keeps its idle animation');
  const promptAlpha = (calls) => calls.find(({ method, args }) => method === 'fillText'
    && args[0] === '[Click to Start]').alpha;
  assert.notEqual(promptAlpha(before), promptAlpha(after), 'prompt still pulses');
});

test('click anywhere starts once and the listener removes itself', () => {
  let starts = 0;
  MainMenu(() => starts++);
  listeners.get('pointerdown')();
  assert.equal(listeners.has('pointerdown'), false);
  assert.equal(starts, 1);
});
