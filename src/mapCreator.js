import Camera from './camera.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon from './donjonDungeon.js';
import { add } from './engine.js';
import DragController from './input.js';
import inflateDungeon from './inflateDungeon.js';
import mergeWallsIntoRects from './mergeWalls.js';
import PhysicsWorld from './PhysicsWorld.js';
import Pillar from './Pillar.js';
import placePillars from './placePillars.js';
import PlayerCharacter from './PlayerCharacter.js';

// Fixed for now, so the generated dungeon is reproducible while the
// generator itself is being tuned.
const DUNGEON_SEED = 123;
// Deliberately different from DUNGEON_SEED, so pillar placement doesn't
// replay the exact same random sequence the room layout already consumed.
const PILLAR_SEED = DUNGEON_SEED + 1;
// The raw generator's corridors are a single grid cell wide -- just barely
// wider than the player puck, which feels awful to actually fly through.
// Post-inflating by 2x guarantees every corridor and room is at least 2
// cells wide, without changing the dungeon's layout/topology at all (see
// inflateDungeon.js).
const CORRIDOR_WIDTH_FACTOR = 3;

// Plain axis-aligned grid -- no isometric basis, so walls come out running
// straight along x and y instead of on a diamond skew. Makes wall bounces
// easy to reason about while debugging reflection/collision: a hit on a
// left/right-facing wall should only ever flip vx, a top/bottom-facing one
// should only ever flip vy.
// World-space size of one dungeon grid cell. A CubeObstacle's w/h are its
// exact world-space bounds now (see CubeObstacle.js), so a 1x1 wall tile
// is simply TILE x TILE -- this value itself is arbitrary (any positive
// number tiles edge-to-edge cleanly), just kept unchanged from before this
// module stopped needing to think in pre-ISO-scale half-extents, so the
// dungeon's physical scale relative to the player's radius doesn't shift.
const TILE = 30 * 2 * Math.SQRT2;

function gridToWorld(x, y, gridWidth, gridHeight) {
  return { x: (x - gridWidth / 2) * TILE, y: (y - gridHeight / 2) * TILE };
}

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room).
function buildDungeon() {
  const dungeon = inflateDungeon(generateDungeon(DUNGEON_SEED), CORRIDOR_WIDTH_FACTOR);
  const toWorld = (x, y) => gridToWorld(x, y, dungeon.gridWidth, dungeon.gridHeight);

  // Collapses the (many, small) unit wall cells into far fewer large
  // rectangles before ever touching the engine -- purely a performance
  // simplification, see mergeWalls.js.
  mergeWallsIntoRects(dungeon.walls).forEach((rect) => {
    // A rect's grid bounds run from (rect.x, rect.y) to
    // (rect.x + rect.w, rect.y + rect.h) exclusive; its world-space center
    // sits half a cell in from that top-left corner, same as any single
    // cell's own center would.
    const center = toWorld(rect.x + (rect.w - 1) / 2, rect.y + (rect.h - 1) / 2);
    add(CubeObstacle(center.x, center.y, rect.w * TILE, rect.h * TILE));
  });

  // Roman-esque columns dropped into rooms with enough space for them --
  // corners, a symmetric pair flanking opposing walls, or centered --
  // never within reach of a doorway. See placePillars.js.
  placePillars(dungeon, PILLAR_SEED).forEach(({ x, y }) => {
    const world = toWorld(x, y);
    add(Pillar(world.x, world.y));
  });

  const spawnRoom = dungeon.rooms[0];
  return toWorld(spawnRoom.x + spawnRoom.w / 2, spawnRoom.y + spawnRoom.h / 2);
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
