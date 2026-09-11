import assert from 'node:assert/strict';
import { test } from 'node:test';
import CubeObstacle from '../src/CubeObstacle.js';
import { applyCollisionResponse, circleBoxContact, collisionResponses, sweptCircleHitTime } from '../src/physics.js';

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
      assert.ok(left.order < below.order, 'nearer tops cover internal front faces');
    }
  }
});

test('cube dimensions stay exact for physics and props follow width/height', () => {
  const cube = CubeObstacle(12.5, -8, 91.7, 43.2, { height: 12, topColor: '#abc', sideColor: '#456' });
  const body = cube.puck();
  assert.equal(body.x, 12.5);
  assert.equal(body.y, -8);
  assert.equal(body.halfWidth, 91.7 / 2);
  assert.equal(body.halfHeight, 43.2 / 2);
  assert.equal(body.shape, 'box');
  assert.equal(body.mass, Infinity);
  const draws = rectangles(cube, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  assert.deepEqual(draws.map(({ color }) => color), ['#456', '#abc']);
  assert.equal(draws[0].bounds[3], 12);
});

test('axis-aligned contacts handle faces, corners, tangency and misses', () => {
  const box = CubeObstacle(0, 0, 20, 20).puck();
  for (const [x, y, nx, ny] of [[14, 0, -1, 0], [-14, 0, 1, 0], [0, 14, 0, -1], [0, -14, 0, 1]]) {
    assert.deepEqual(circleBoxContact({ x, y, radius: 5 }, box), { nx, ny, penetration: 1 });
  }
  const corner = circleBoxContact({ x: 13, y: 13, radius: 5 }, box);
  assert.ok(Math.abs(corner.nx + Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(corner.ny + Math.SQRT1_2) < 1e-9);
  assert.equal(circleBoxContact({ x: 15, y: 0, radius: 5 }, box), null);
  assert.equal(circleBoxContact({ x: 14, y: 14, radius: 5 }, box), null);
});

test('embedded circles resolve through the nearest face', () => {
  const box = CubeObstacle(0, 0, 20, 20).puck();
  for (const [x, y, expectedX, expectedY] of [[9, 0, 15, 0], [-9, 0, -15, 0], [0, 9, 0, 15], [0, -9, 0, -15]]) {
    const circle = { x, y, radius: 5, mass: 1, vx: 0, vy: 0, omega: 0, bounciness: 0.4 };
    const { nx, ny, penetration } = circleBoxContact(circle, box);
    const [response] = collisionResponses(circle, box, nx, ny, penetration);
    applyCollisionResponse(circle, response);
    assert.equal(circle.x, expectedX);
    assert.equal(circle.y, expectedY);
  }
});

test('projectile sweeps stop at box faces without rotation or tunneling', () => {
  const box = CubeObstacle(0, 0, 20, 20).puck();
  for (const [x, y] of [[100, 0], [-100, 0], [0, 100], [0, -100]]) {
    const time = sweptCircleHitTime({ x, y, radius: 5 }, { x: -x, y: -y }, box);
    assert.equal(time, 0.425);
  }
  assert.equal(sweptCircleHitTime({ x: 14, y: 14, radius: 5 }, { x: 16, y: 16 }, box), Infinity);
});
