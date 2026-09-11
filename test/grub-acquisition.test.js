import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

globalThis.document = { querySelector: () => ({ getContext: () => ({}) }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};

const { add, clear } = await import('../src/engine.js');
const { default: Grub } = await import('../src/Grub.js');
const { TAG_PLAYER } = await import('../src/tags.js');

afterEach(clear);

function encounter() {
  const player = add({ x: 2000, y: 0, hp: 5, tags: [TAG_PLAYER] });
  const room = { x: 0, y: 0, w: 600, h: 600 };
  const grubs = Array.from({ length: 6 }, (_, i) => Grub(i * 20 - 50, 0, room, 123 + i));
  return { player, grubs };
}

function firstAimTimes(grubs) {
  const times = new Map();
  for (let frame = 0; frame <= 82; frame++) {
    for (const grub of grubs) {
      if (times.has(grub)) continue; // Observe acquisition without firing.
      grub.update(0.05);
      if (grub.state === 'aiming') times.set(grub, frame * 0.05);
    }
  }
  assert.equal(times.size, grubs.length);
  const values = [...times.values()];
  assert.ok(values.every((time) => time >= 2 && time <= 4.05));
  assert.ok(new Set(values).size > 1, 'grubs start aiming on different frames');
  assert.ok(Math.max(...values) - Math.min(...values) >= 0.5, 'first attacks are spread out');
}

test('entering a room after a long absence gives each grub a fresh random reaction delay', () => {
  const { player, grubs } = encounter();
  for (let frame = 0; frame < 400; frame++) grubs.forEach((grub) => grub.update(0.05));
  assert.ok(grubs.every((grub) => grub.state === 'patrol'));
  player.x = 0;
  firstAimTimes(grubs);
});

test('grubs also stagger their attacks when the player starts in their room', () => {
  const { player, grubs } = encounter();
  player.x = 0;
  firstAimTimes(grubs);
});

test('leaving and re-entering restarts reaction delays instead of synchronizing attacks', () => {
  const { player, grubs } = encounter();
  player.x = 0;
  firstAimTimes(grubs);
  player.x = 2000;
  for (let frame = 0; frame < 400; frame++) grubs.forEach((grub) => grub.update(0.05));
  player.x = 0;
  firstAimTimes(grubs);
});
