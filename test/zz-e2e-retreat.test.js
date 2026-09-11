import './helpers/audio.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const canvas = { style: {}, getContext: () => ({}), addEventListener() {}, removeEventListener() {} };
globalThis.document = { querySelector: () => canvas };
globalThis.window = {};
globalThis.innerWidth = 800; globalThis.innerHeight = 600;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
const { clear, getObjectsByTag } = await import('../src/engine.js');
const { default: createMap } = await import('../src/mapCreator.js');
const { TAG_COMBAT_ROOM, TAG_OBSTACLE } = await import('../src/tags.js');
test('e2e: triggering the lock while backing out of a doorway', () => {
  let tries = 0; let lockouts = 0;
  for (const seed of [1, 42, 2026, 7, 99]) {
    clear();
    createMap(seed);
    const player = getObjectsByTag(1)[0];
    for (const room of getObjectsByTag(TAG_COMBAT_ROOM)) {
      const { x, y, w, h } = room.bounds;
      const open = new Set(getObjectsByTag(TAG_OBSTACLE));
      player.x = x; player.y = y; room.update();
      const doors = getObjectsByTag(TAG_OBSTACLE).filter((o) => !open.has(o)).map(({ x: dx, y: dy }) => [dx, dy]);
      for (const [dx, dy] of doors) {
        const horizontal = Math.abs(Math.abs(dx - x) - w / 2) < Math.abs(Math.abs(dy - y) - h / 2);
        const nx = horizontal ? Math.sign(x - dx) : 0; const ny = horizontal ? 0 : Math.sign(y - dy);
        const edgeX = x - nx * w / 2; const edgeY = y - ny * h / 2;
        for (const depth of [55, 60, 70]) for (const lateral of [-30, 0, 30]) for (const speed of [300, 900, 1600]) for (const dt of [1 / 60, 1 / 20]) {
          room.destroy(); room.state = 0;
          Object.assign(player, {
            x: horizontal ? edgeX + nx * depth : dx + lateral,
            y: horizontal ? dy + lateral : edgeY + ny * depth,
            vx: -nx * speed, vy: -ny * speed, hp: 5,
          });
          room.update();
          if (room.state !== 1) continue;
          tries++;
          for (let f = 0; f < 20; f++) player.update(dt);
          if (Math.abs(player.x - x) > w / 2 || Math.abs(player.y - y) > h / 2) lockouts++;
        }
      }
      room.destroy(); room.state = 0;
      room.enemies.forEach((e) => { e.hp = 0; }); room.update();
    }
  }
  console.log(JSON.stringify({ tries, lockouts }));
  assert.equal(lockouts, 0);
});
