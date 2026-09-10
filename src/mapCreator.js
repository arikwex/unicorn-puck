import Camera from './camera.js';
import CubeObstacle, { ISO_U, ISO_V } from './CubeObstacle.js';
import { add } from './engine.js';
import DragController from './input.js';
import PhysicsWorld from './PhysicsWorld.js';
import PlayerCharacter from './PlayerCharacter.js';

// World-space spacing between playpen cubes, in units of the isometric
// basis vectors (1, -1) / (1, 1). Kept in step with CubeObstacle's default
// halfExtent (TILE / 2) so a ring of obstacles at angle = PI/4 tiles
// edge-to-edge with no gaps or overlaps.
const TILE = 60;

function gridToWorld(i, j) {
  return {
    x: (i * ISO_U.x + j * ISO_V.x) * TILE,
    y: (i * ISO_U.y + j * ISO_V.y) * TILE,
  };
}

// A square ring (in grid-index space) of cube obstacles, which maps
// through the isometric basis to a diamond-shaped playpen wall in world
// space. Every cube uses angle = PI/4 so its footprint renders upright and
// tiles seamlessly with its neighbors.
function buildPlaypen(radius) {
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (Math.abs(i) !== radius && Math.abs(j) !== radius) continue;
      const { x, y } = gridToWorld(i, j);
      add(CubeObstacle(x, y, 0));//Math.PI / 4));
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
