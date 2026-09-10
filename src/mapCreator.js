import Camera from './camera.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon from './dungeon.js';
import { add } from './engine.js';
import DragController from './input.js';
import PhysicsWorld from './PhysicsWorld.js';
import PlayerCharacter from './PlayerCharacter.js';

// Fixed for now, so the generated dungeon is reproducible while the
// generator itself is being tuned.
const DUNGEON_SEED = 123;

// Plain axis-aligned grid -- no isometric basis, so walls come out running
// straight along x and y instead of on a diamond skew. Makes wall bounces
// easy to reason about while debugging reflection/collision: a hit on a
// left/right-facing wall should only ever flip vx, a top/bottom-facing one
// should only ever flip vy.
const HALF_EXTENT = 30;
// At angle = PI/4 a CubeObstacle renders (and collides) as a plain
// axis-aligned square with half-width halfExtent * sqrt(2) -- see
// CubeObstacle.js -- so that's the world-space size of one dungeon grid
// cell, and the full width needed to tile edge-to-edge.
const TILE = HALF_EXTENT * 2 * Math.SQRT2;

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room).
function buildDungeon() {
  const dungeon = generateDungeon(DUNGEON_SEED);
  // Center the grid on the world origin so the player spawns somewhere
  // near (0, 0), same as every previous test scene in this file.
  const gridOrigin = dungeon.gridSize / 2;
  const gridToWorld = (x, y) => ({ x: (x - gridOrigin) * TILE, y: (y - gridOrigin) * TILE });

  dungeon.walls.forEach(({ x, y }) => {
    const world = gridToWorld(x, y);
    add(CubeObstacle(world.x, world.y, Math.PI / 4, { halfExtent: HALF_EXTENT }));
  });

  const spawnRoom = dungeon.rooms[0];
  return gridToWorld(spawnRoom.x + spawnRoom.w / 2, spawnRoom.y + spawnRoom.h / 2);
}

// Entry point for specifying everything in the scene: the player, camera,
// obstacles, and input. Swap or extend this module to build different
// maps.
function createMap() {
  const spawn = buildDungeon();
  const player = add(PlayerCharacter(spawn.x, spawn.y));
  add(Camera().follow(player));
  add(DragController(player));
  add(PhysicsWorld());
  return { player };
}

export default createMap;
