import assert from 'node:assert/strict';
import { test } from 'node:test';
import CubeObstacle from '../src/CubeObstacle.js';
import contact from '../src/physics.js';

function rectangles(cube, transform) {
  const draws = [];
  let saved;
  const context = {
    transform,
    getTransform() { return this.transform; },
    save() { saved = this.transform; },
    setTransform(a, b, c, d, e, f) { this.transform = { a, b, c, d, e, f }; },
    restore() { this.transform = saved; },
    fillRect(...bounds) {
      assert.deepEqual(this.transform, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      draws.push({ bounds, color: this.fillStyle });
    },
  };
  cube.render(context);
  assert.deepEqual(context.transform, transform);
  assert.equal(draws.length, 2);
  assert.ok(draws.every(({ bounds }) => bounds.every(Number.isInteger)));
  return draws;
}

test('walls keep their full height with a 25% upward overhang and unchanged collisions', () => {
  const cube = CubeObstacle(0, 0);
  const [front, top] = rectangles(cube, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  assert.equal(cube.height, 26 * 2.5);
  assert.deepEqual(front.bounds, [-30, 14, 60, 65]);
  assert.deepEqual(top.bounds, [-30, -46, 60, 60]);
  assert.equal(top.bounds[1], Math.round(cube.y - cube.h / 2 - cube.height * 0.25));
  assert.equal(front.bounds[1] + front.bounds[3], Math.round(cube.y + cube.h / 2 + cube.height * 0.75));
  assert.equal(cube.z, cube.y + cube.h / 2, 'depth stays anchored to the ground');
  assert.equal(cube.h / 2, 30, 'visual overhang does not enlarge collisions');
  const behindY = -40;
  assert.ok(behindY < -cube.h / 2);
  assert.ok(behindY >= top.bounds[1] && behindY < top.bounds[1] + top.bounds[3]);
  assert.ok(behindY < cube.z, 'objects behind the wall draw before its overhanging top');
});

test('adjacent cubes share exact pixel edges at fractional camera zooms and positions', () => {
  const tile = 60 * Math.SQRT2;
  const left = CubeObstacle(0, 0, tile, tile);
  const right = CubeObstacle(tile, 0, tile * 1, tile);
  const below = CubeObstacle(0, tile, tile, tile);
  for (const zoom of [0.25, 0.63, 1, 1.375, 2.1]) {
    for (const offset of [0, 0.25, -17.6, 431.9]) {
      const transform = { a: zoom, b: 0, c: 0, d: zoom, e: offset, f: offset / 3 };
      const a = rectangles(left, transform);
      const b = rectangles(right, transform);
      const c = rectangles(below, transform);
      for (let face = 0; face < 2; face++) {
        assert.equal(a[face].bounds[0] + a[face].bounds[2], b[face].bounds[0]);
        assert.equal(a[face].bounds[1], b[face].bounds[1]);
        assert.equal(a[face].color, b[face].color);
      }
      assert.equal(a[1].bounds[1] + a[1].bounds[3], c[1].bounds[1]);
      assert.equal(a[1].bounds[1] + a[1].bounds[3], a[0].bounds[1]);
      assert.ok(left.z < below.z, 'nearer tops cover internal front faces');
    }
  }
});

test('cube dimensions stay exact for physics and props follow width/height', () => {
  const cube = CubeObstacle(12.5, -8, 91.7, 43.2, { height: 12, topColor: '#abc', sideColor: '#456' });
  assert.equal(cube.x, 12.5);
  assert.equal(cube.y, -8);
  assert.equal(cube.w, 91.7);
  assert.equal(cube.h, 43.2);
  const draws = rectangles(cube, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  assert.deepEqual(draws.map(({ color }) => color), ['#456', '#abc']);
  assert.equal(draws[0].bounds[3], 12);
});

test('axis-aligned contacts handle faces, corners, tangency and misses', () => {
  const box = CubeObstacle(0, 0, 20, 20);
  for (const [x, y, nx, ny] of [[14, 0, -1, 0], [-14, 0, 1, 0], [0, 14, 0, -1], [0, -14, 0, 1]]) {
    assert.deepEqual(contact({ x, y, r: 5 }, box), [nx, ny, 1]);
  }
  const [cornerX, cornerY] = contact({ x: 13, y: 13, r: 5 }, box);
  assert.ok(Math.abs(cornerX + Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(cornerY + Math.SQRT1_2) < 1e-9);
  assert.ok(!contact({ x: 15, y: 0, r: 5 }, box));
  assert.ok(!contact({ x: 14, y: 14, r: 5 }, box));
});

test('circle obstacles contact along the line between centers', () => {
  const [nx, ny, penetration] = contact({ x: 0, y: 0, r: 5 }, { x: 6, y: 8, r: 7 });
  assert.ok(Math.abs(nx - 0.6) < 1e-9 && Math.abs(ny - 0.8) < 1e-9);
  assert.equal(penetration, 2);
  assert.ok(!contact({ x: 0, y: 0, r: 5 }, { x: 6, y: 8, r: 5 }));
});

test('embedded circles resolve through the nearest face', () => {
  const box = CubeObstacle(0, 0, 20, 20);
  for (const [x, y, expectedX, expectedY] of [[9, 0, 15, 0], [-9, 0, -15, 0], [0, 9, 0, 15], [0, -9, 0, -15]]) {
    const circle = { x, y, r: 5 };
    const [nx, ny, penetration] = contact(circle, box);
    circle.x -= nx * penetration;
    circle.y -= ny * penetration;
    assert.equal(circle.x, expectedX);
    assert.equal(circle.y, expectedY);
  }
});
