import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

let calls = [];
let icon;
let iconCanvas;
const links = new Set();
const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, {
  get(target, key) {
    return target[key] ?? ((...args) => calls.push({ method: key, args, color: target.fillStyle }));
  },
});
globalThis.document = {
  querySelector: (selector) => selector === 'canvas' ? { getContext: () => ({}) } : icon,
  createElement(tag) {
    if (tag === 'link') return {};
    assert.equal(tag, 'canvas');
    iconCanvas = { getContext: () => context, toDataURL: () => 'data:image/png;base64,portrait' };
    return iconCanvas;
  },
  head: { appendChild(link) { icon = link; links.add(link); } },
};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};

const { default: setFavicon } = await import('../src/favicon.js');
const { renderPlayerPortrait } = await import('../src/PlayerCharacter.js');

test('favicon renders the exact HUD head and horn into an embedded PNG', () => {
  setFavicon();
  assert.equal(iconCanvas.width, 64);
  assert.equal(iconCanvas.height, 64);
  assert.equal(icon.rel, 'icon');
  assert.equal(icon.href, 'data:image/png;base64,portrait');
  const faviconDrawing = calls;
  calls = [];
  delete context.fillStyle;
  renderPlayerPortrait(context, 28, 38, 0.8);
  assert.deepEqual(faviconDrawing, calls);
  assert.ok(calls.some(({ method }) => method === 'clip'), 'striped horn is included');
  assert.equal(links.size, 1);
});

test('HTML build template uses the game title', () => {
  const build = readFileSync(new URL('../tools/build.js', import.meta.url), 'utf8');
  assert.ok(build.includes('<title>PEGACORN BLOOD</title>'));
  assert.ok(!build.includes('<title>Unicorn Puck</title>'));
});
