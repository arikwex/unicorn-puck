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
globalThis.addEventListener = () => {};

const { default: MainMenu } = await import('../src/MainMenu.js');
const { getObjects } = await import('../src/engine.js');

function render(menu) {
  const calls = [];
  const context = new Proxy({
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 20 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, key) {
      return key in target ? target[key] : (...args) => calls.push({
        method: key, args, color: target.fillStyle,
      });
    },
  });
  menu.renderHUD(context);
  return calls;
}

test('menu reuses wall, pillar and chalice art without adding gameplay objects', () => {
  const menu = MainMenu(() => {});
  for (const [width, height] of [[800, 600], [320, 640], [1200, 500]]) {
    canvas.width = width;
    canvas.height = height;
    const calls = render(menu);
    const walls = calls.filter(({ method, color }) => method === 'fillRect'
      && ['#766', '#445'].includes(color));
    assert.equal(walls.length, 6, 'three walls, two faces each');
    assert.ok(calls.indexOf(walls.at(-1)) < calls.findIndex(({ method }) => method === 'fillText'));
    assert.ok(calls.some(({ method, args }) => method === 'translate'
      && args[0] === width * 0.2 && args[1] === height * 0.73), 'pillar on the left');
    assert.ok(calls.some(({ method, args }) => method === 'translate'
      && args[0] === width * 0.8 && args[1] === height * 0.65), 'chalice on the right');
    assert.ok(calls.some(({ method, color }) => method === 'fill' && color === '#a13'), 'blood in chalice');
    assert.ok(calls.some(({ color }) => color === '#a99'), 'pillar stone');
    assert.equal(getObjects().length, 0, 'scenery is not registered with the game engine');
  }
});

test('menu scenery animates without starting gameplay', () => {
  const menu = MainMenu(() => assert.fail('animation must not start the game'));
  const before = render(menu);
  menu.update(0.2);
  const after = render(menu);
  const flamePaths = (calls) => calls.filter(({ method }) => method === 'quadraticCurveTo');
  assert.notDeepEqual(flamePaths(before), flamePaths(after));
  const chalicePosition = (calls) => calls.find(({ method, args }) => method === 'translate'
    && args[0] === canvas.width * 0.8).args;
  assert.notDeepEqual(chalicePosition(before), chalicePosition(after));
});

test('staggered left walls have a visible gap, including their raised tops and front faces', () => {
  const menu = MainMenu(() => {});
  for (const [width, height] of [[800, 600], [320, 640], [1200, 500], [1920, 1080], [600, 600]]) {
    canvas.width = width;
    canvas.height = height;
    const walls = render(menu).filter(({ method, color }) => method === 'fillRect'
      && ['#766', '#445'].includes(color));
    const upperFront = walls[2].args;
    const lowerTop = walls[5].args;
    assert.ok(upperFront[1] + upperFront[3] < lowerTop[1], `${width}x${height}: walls must not overlap`);
    for (const face of walls.slice(0, 2)) {
      assert.ok(face.args[0] + face.args[2] > width, 'right wall extends off screen');
    }
    for (const face of walls.slice(2)) {
      assert.ok(face.args[0] < 0, 'left walls extend off screen');
    }
  }
});

test('mobile props are larger while desktop sizing is unchanged', () => {
  const menu = MainMenu(() => {});
  for (const [width, height] of [[320, 640], [390, 844], [800, 600], [1200, 500], [1920, 1080]]) {
    canvas.width = width;
    canvas.height = height;
    const calls = render(menu);
    const scaleAt = (x, y) => {
      const index = calls.findIndex(({ method, args }) => method === 'translate' && args[0] === x && args[1] === y);
      assert.equal(calls[index + 1].method, 'scale');
      return calls[index + 1].args[0];
    };
    const oldScale = Math.min(width / 800, height / 600, 1.5);
    const expected = width < 600 ? 0.75 : oldScale;
    assert.equal(scaleAt(width * 0.2, height * 0.73), expected * 1.35);
    assert.equal(scaleAt(width * 0.8, height * 0.65), expected * 3.4);
    if (width < 600) assert.ok(expected > oldScale);
  }
});

test('click anywhere starts once and the listener removes itself', () => {
  let starts = 0;
  MainMenu(() => starts++);
  listeners.get('pointerdown')();
  assert.equal(listeners.has('pointerdown'), false);
  assert.equal(starts, 1);
});
