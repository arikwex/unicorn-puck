import assert from 'node:assert/strict';
import { test } from 'node:test';
import { widenedDungeon } from './helpers/dungeon.js';
import Pillar from '../src/Pillar.js';
import placePillars from '../src/placePillars.js';

test('seeded rooms use either classic pillars or candelabras, with one look per room', () => {
  const variants = new Set();
  for (const seed of [1, 2, 42]) {
    const dungeon = widenedDungeon(seed);
    const pillars = placePillars(dungeon, seed + 1);
    assert.deepEqual(placePillars(dungeon, seed + 1), pillars);
    for (const room of dungeon.rooms) {
      const props = pillars.filter(({ x, y }) => x >= room.x && x < room.x + room.w
        && y >= room.y && y < room.y + room.h);
      assert.ok(new Set(props.map(({ variant }) => variant)).size <= 1);
      if (room.w >= 12 || room.h >= 12) assert.ok(props.length > 0);
      props.forEach(({ variant }) => variants.add(variant));
    }
  }
  assert.deepEqual(variants, new Set([0, 3]));
});

test('candelabras animate three flames and keep the classic pillar collision geometry', () => {
  const pillar = Pillar(20, 30);
  const candelabra = Pillar(20, 30, { variant: 3 });
  assert.deepEqual([candelabra.x, candelabra.y, candelabra.r, candelabra.z, candelabra.tags],
    [pillar.x, pillar.y, pillar.r, pillar.z, pillar.tags]);
  const draw = (prop) => {
    const calls = [];
    prop.render(new Proxy({}, {
      get: (target, method) => target[method] ?? ((...args) => calls.push({ method, args, color: target.fillStyle })),
    }));
    return calls;
  };
  const before = draw(candelabra);
  candelabra.tick(0.2);
  const after = draw(candelabra);
  const flames = (calls) => calls.filter(({ method, color }) => method === 'fill' && color === '#f60');
  assert.equal(flames(before).length, 3);
  assert.equal(flames(after).length, 3);
  const paths = (calls) => calls.filter(({ method }) => method === 'quadraticCurveTo');
  assert.notDeepEqual(paths(before), paths(after));
  assert.equal(flames(draw(pillar)).length, 0);
  assert.ok(draw(pillar).some(({ color }) => color === '#a99'));
});
