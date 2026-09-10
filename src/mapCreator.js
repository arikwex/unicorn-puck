import Camera from './camera.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon from './donjonDungeon.js';
import { add } from './engine.js';
import DragController from './input.js';
import inflateDungeon from './inflateDungeon.js';
import PhysicsWorld from './PhysicsWorld.js';
import PlayerCharacter from './PlayerCharacter.js';

// Fixed for now, so the generated dungeon is reproducible while the
// generator itself is being tuned.
const DUNGEON_SEED = 123;
// The raw generator's corridors are a single grid cell wide -- just barely
// wider than the player puck, which feels awful to actually fly through.
// Post-inflating by 2x guarantees every corridor and room is at least 2
// cells wide, without changing the dungeon's layout/topology at all (see
// inflateDungeon.js).
const CORRIDOR_WIDTH_FACTOR = 2;

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
  const dungeon = inflateDungeon(generateDungeon(DUNGEON_SEED), CORRIDOR_WIDTH_FACTOR);
  // Center the grid on the world origin so the player spawns somewhere
  // near (0, 0), same as every previous test scene in this file.
  const originX = dungeon.gridWidth / 2;
  const originY = dungeon.gridHeight / 2;
  const gridToWorld = (x, y) => ({ x: (x - originX) * TILE, y: (y - originY) * TILE });

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
