import Camera from './camera.js';
import CubeObstacle from './CubeObstacle.js';
import { add } from './engine.js';
import DragController from './input.js';
import PhysicsWorld from './PhysicsWorld.js';
import PlayerCharacter from './PlayerCharacter.js';

// Plain axis-aligned grid -- no isometric basis, so the playpen comes out
// as a normal rectangular room (straight walls along x and y) instead of a
// diamond. Makes wall bounces easy to reason about while debugging
// reflection/collision: a hit on the left/right wall should only ever flip
// vx, a hit on the top/bottom wall should only ever flip vy.
const HALF_EXTENT = 30;
// At angle = PI/4 a CubeObstacle renders (and collides) as a plain
// axis-aligned square with half-width halfExtent * sqrt(2) -- see
// CubeObstacle.js -- so that's the full width needed to tile edge-to-edge.
const TILE = HALF_EXTENT * 2 * Math.SQRT2;

function gridToWorld(i, j) {
  return { x: i * TILE, y: j * TILE };
}

// A square ring (in grid-index space) of cube obstacles, arranged on the
// plain grid above -- a straight-walled rectangular room. Every cube uses
// angle = PI/4 so its footprint renders upright (axis-aligned, not a
// diamond) and tiles seamlessly with its neighbors.
function buildPlaypen(radius) {
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (Math.abs(i) !== radius && Math.abs(j) !== radius) continue;
      const { x, y } = gridToWorld(i, j);
      add(CubeObstacle(x, y, Math.PI / 4, { halfExtent: HALF_EXTENT }));
    }
  }
}

// Entry point for specifying everything in the scene: the player, camera,
// obstacles, and input. Swap or extend this module to build different
// maps.
function createMap() {
  const player = add(PlayerCharacter(0, 0));
  add(Camera().follow(player));
  add(DragController(player));
  add(PhysicsWorld());
  buildPlaypen(5);
  return { player };
}

export default createMap;
